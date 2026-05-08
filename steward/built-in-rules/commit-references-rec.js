// Built-in rule: commit-references-rec
//
// When the git poller fires `automation:git-change` for a project, scan the
// new commits' subjects and bodies for references to recommendation IDs
// (e.g. ARE-014, EXP-228). For each rec referenced:
//   - Append { sha, subject } to the rec's `commits[]` array (idempotent —
//     SHAs already present are skipped).
//   - If a commit used a "Resolves:" / "Closes:" / "Fixes:" verb adjacent to
//     the ID, flip the rec's status to "resolved" and stamp resolved_at.
//
// The flipped status then triggers the existing rec-resolved-update-history
// and rec-resolved-update-features rules via chokidar, so this single rule
// closes the implementation→resolution loop without humans needing to
// hand-edit JSON files.
//
// Cross-project references (e.g. an arena commit naming an EXP rec) are NOT
// followed in v1 — we only look in the same project's recommendations dir.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { studioWrite, commitIntent } from '../studio-write.js';

// Match issue-style IDs anywhere in commit text. 2-4 letter prefix, 3-5 digit
// number. Extracted as { fullId, prefix, num } via the .matchAll iterator.
const REC_ID_PATTERN = /\b([A-Z]{2,4})-(\d{3,5})\b/g;

// "Resolves:" / "Closes:" / "Fixes:" verb tokens. We accept either trailer-
// style (`Resolves: ARE-014`) or sentence-leading (`Resolves ARE-014`),
// case-insensitive. The verb must appear on the SAME LINE as the ID — a
// resolve verb on the line above does NOT carry over to a separate ID
// reference below it (otherwise "Resolves: ARE-099\nrefs ARE-100" would
// incorrectly resolve ARE-100 too).
const RESOLVE_VERB_PATTERN = /\b(?:resolves?|closes?|fixes?|finishes)\b/i;

// Don't ship the entire ledger of subjects to disk if a project has 100+
// linked commits. The `commits[]` array on a rec is a quick reference, not
// an exhaustive log — git is the source of truth. Cap at 50 entries.
const MAX_LINKED_COMMITS_PER_REC = 50;


export const commitReferencesRec = {
  id: 'commit-references-rec',
  priority: 'medium',
  description: 'When a project commit references a rec ID, append the SHA to the rec; flip status to resolved if the commit used a Resolves/Closes/Fixes verb.',

  trigger: {
    source: 'automation',
    kind: 'git-change',
    match: (event) => Array.isArray(event?.payload?.commits) && event.payload.commits.length > 0,
  },

  /**
   * @param {object} ctx
   * @param {object} ctx.event       - persisted event row with parsed payload
   * @param {string} ctx.dataDir     - absolute path to hq-data root
   * @param {string} ctx.intentUUID  - task id, used as the studioWrite intent UUID
   */
  handler: async ({ event, dataDir, intentUUID }) => {
    const slug = event?.payload?.slug;
    const commits = event?.payload?.commits;
    if (!slug) return { outcome: 'skipped', output: 'no slug in payload' };
    if (!Array.isArray(commits) || commits.length === 0) {
      return { outcome: 'skipped', output: 'no commits in payload' };
    }

    // Walk commits → references. Each commit can name multiple recs and may
    // be both a "refs" mention and a "resolves" verb depending on phrasing.
    const refsByRec = new Map(); // recId → { commits: [{sha, subject}], shouldResolve: bool }
    for (const commit of commits) {
      if (!commit?.sha) continue;
      // Walk the commit's subject + body LINE-BY-LINE. A "resolve" verb on
      // a different line doesn't carry over to a separate ID reference.
      const lines = `${commit.subject || ''}\n${commit.body || ''}`.split(/\r?\n/);
      const seenInThisCommit = new Set();
      for (const line of lines) {
        for (const m of line.matchAll(REC_ID_PATTERN)) {
          const recId = `${m[1]}-${m[2]}`;
          if (seenInThisCommit.has(recId)) continue;
          seenInThisCommit.add(recId);
          // Verb must be on this same line, somewhere before the ID match.
          const beforeId = line.slice(0, m.index);
          const isResolve = RESOLVE_VERB_PATTERN.test(beforeId);
          if (!refsByRec.has(recId)) refsByRec.set(recId, { commits: [], shouldResolve: false });
          const group = refsByRec.get(recId);
          group.commits.push({ sha: commit.sha, subject: commit.subject || '' });
          if (isResolve) group.shouldResolve = true;
        }
      }
    }

    if (refsByRec.size === 0) {
      return { outcome: 'skipped', output: 'no rec references found in commits' };
    }

    // Index the project's recommendations dir.
    const recsDir = path.join(dataDir, 'projects', slug, 'recommendations');
    if (!fs.existsSync(recsDir)) {
      return { outcome: 'skipped', output: `no recommendations dir for project "${slug}"` };
    }
    const files = fs.readdirSync(recsDir).filter(f => f.endsWith('.json'));

    const repoPath = resolveRepoPath(dataDir);
    if (!repoPath) {
      return { outcome: 'error', error: `git rev-parse failed for ${dataDir}` };
    }

    let updatedCount = 0;
    let resolvedCount = 0;
    const skipped = [];

    for (const [recId, group] of refsByRec.entries()) {
      // Match files like `ARE-014-v1-...json`. Lex-sort picks the latest
      // version for multi-version recs (v2 > v1).
      const matches = files.filter(f =>
        f.startsWith(`${recId}-`) || f === `${recId}.json` || f.startsWith(`${recId}.`)
      );
      if (matches.length === 0) {
        skipped.push(`${recId} (no matching rec file)`);
        continue;
      }
      matches.sort();
      const filename = matches[matches.length - 1];
      const recPath = path.join(recsDir, filename);

      let rec;
      try {
        rec = JSON.parse(fs.readFileSync(recPath, 'utf-8'));
      } catch (err) {
        skipped.push(`${recId} (unreadable: ${err.message})`);
        continue;
      }

      const existingCommits = Array.isArray(rec.commits) ? rec.commits : [];
      const known = new Set(existingCommits.map(c => c.sha));
      const novel = group.commits.filter(c => !known.has(c.sha));
      const willResolve = group.shouldResolve && rec.status !== 'resolved';

      if (novel.length === 0 && !willResolve) {
        skipped.push(`${recId} (already linked + status unchanged)`);
        continue;
      }

      // Trim oldest commits if we'd exceed the cap.
      const merged = [...existingCommits, ...novel];
      const trimmed = merged.length > MAX_LINKED_COMMITS_PER_REC
        ? merged.slice(merged.length - MAX_LINKED_COMMITS_PER_REC)
        : merged;
      rec.commits = trimmed;

      if (willResolve) {
        rec.status = 'resolved';
        rec.resolved_at = new Date().toISOString();
        resolvedCount += 1;
      }

      await studioWrite({
        path: recPath,
        content: rec,
        intentUUID,
        format: 'json',
        repoPath,
        debounceMs: 100,
      });
      updatedCount += 1;
    }

    if (updatedCount === 0) {
      return {
        outcome: 'skipped',
        output: `no recs needed updating (${refsByRec.size} referenced, ${skipped.length} skipped: ${skipped.slice(0, 3).join(', ')})`,
      };
    }

    const resolvedPart = resolvedCount > 0 ? `resolved ${resolvedCount}` : `linked ${updatedCount}`;
    const commitResult = await commitIntent(
      intentUUID,
      `link commits to recs (${slug}) — ${resolvedPart}`,
    );
    if (!commitResult.committed) {
      return { outcome: 'error', error: `commitIntent: ${commitResult.reason || 'no pending writes'}` };
    }
    const sha = commitResult.results[0]?.sha;
    if (commitResult.results[0]?.error) {
      return { outcome: 'error', error: `git commit failed: ${commitResult.results[0].error}` };
    }
    return {
      outcome: 'success',
      output: `${updatedCount} rec(s) updated (${resolvedCount} resolved) for ${slug} → ${sha?.slice(0, 8)}`,
    };
  },
};


function resolveRepoPath(dataDir) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dataDir, encoding: 'utf-8',
    }).trim();
  } catch {
    return null;
  }
}
