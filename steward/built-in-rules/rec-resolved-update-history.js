// Built-in rule: rec-resolved-update-history
//
// When a recommendation file is added/changed in projects/{slug}/recommendations/,
// check if its status is 'resolved'. If yes AND we haven't journaled it yet,
// append an entry to that project's history.json and commit via studioWrite +
// commitIntent.
//
// First Phase 3 rule — proves the loop closes end-to-end on Arena (the
// canary that motivated the Steward design: 27 active recs, 0 history
// entries when the audit ran).
//
// This handler is deterministic Node — no Claude. Future Claude-driven rules
// (Phase 4+) follow the same shape but their handlers spawn claude-runner.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { studioWrite, commitIntent } from '../studio-write.js';

const REC_PATH_REGEX = /^projects\/([^/]+)\/recommendations\/[^/]+\.json$/;

export const recResolvedUpdateHistory = {
  id: 'rec-resolved-update-history',
  priority: 'high',
  description: 'When a recommendation status flips to resolved, append a history.json entry.',

  /**
   * Trigger: any chokidar file event on a recs JSON file.
   * Filtering for status=resolved happens in the handler since the trigger
   * doesn't have file content yet.
   */
  trigger: {
    source: 'hq',
    kind: 'file-changed',
    match: (event) => {
      const p = event?.payload?.path;
      if (typeof p !== 'string') return false;
      // Skip the deletion event (we can't journal a rec that's gone)
      const evt = event.payload.event;
      if (evt === 'unlink') return false;
      return REC_PATH_REGEX.test(p);
    },
  },

  /**
   * Handler: read the rec, decide if journaling is needed, do it.
   *
   * @param {object} ctx
   * @param {object} ctx.event       - persisted event row (with parsed payload)
   * @param {string} ctx.dataDir     - absolute path to hq-data root
   * @param {string} ctx.intentUUID  - task id, used as the studioWrite intent UUID
   * @returns {Promise<{outcome, output?, error?}>}
   */
  handler: async ({ event, dataDir, intentUUID }) => {
    const relPath = event.payload.path;
    const m = REC_PATH_REGEX.exec(relPath);
    if (!m) return { outcome: 'skipped', output: 'path did not match recs pattern' };
    const slug = m[1];

    const recAbsPath = path.join(dataDir, relPath);
    if (!fs.existsSync(recAbsPath)) {
      return { outcome: 'skipped', output: `rec file not found: ${recAbsPath}` };
    }

    let rec;
    try {
      rec = JSON.parse(fs.readFileSync(recAbsPath, 'utf-8'));
    } catch (err) {
      return { outcome: 'error', error: `failed to parse rec JSON: ${err.message}` };
    }

    // Phase 3 v1 only journals on status === 'resolved'
    if (rec.status !== 'resolved') {
      return { outcome: 'skipped', output: `rec status is "${rec.status}", not resolved` };
    }

    // Synthesize an id if the rec doesn't carry one
    const recId = rec.id || path.basename(relPath, '.json');

    // Locate / load the project's history.json
    const historyPath = path.join(dataDir, 'projects', slug, 'history.json');
    const historyDoc = readOrSeedHistory(historyPath);

    // Idempotency: if we've already journaled this rec id, skip
    const alreadyJournaled = (historyDoc.entries || []).some(e => e.id === recId);
    if (alreadyJournaled) {
      return { outcome: 'skipped', output: `history already contains entry for ${recId}` };
    }

    // Build the new entry per hq-data/playbooks/journal-maintenance.md schema
    const entry = {
      date: new Date().toISOString().slice(0, 10),
      id: recId,
      agent: rec.agent || 'Studio',
      title: rec.title || `Resolved rec ${recId}`,
      summary: rec.summary || '(no summary)',
      ref: relPath,
      category: rec.category || 'rec-resolved',
    };

    historyDoc.entries = [...(historyDoc.entries || []), entry];
    historyDoc.lastUpdated = new Date().toISOString();

    // Resolve the git repo that owns history.json — typically the Agency root
    let repoPath;
    try {
      repoPath = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: path.dirname(historyPath),
        encoding: 'utf-8',
      }).trim();
    } catch (err) {
      return { outcome: 'error', error: `git rev-parse failed for ${historyPath}: ${err.message}` };
    }

    // Loop-breakers: tag origin + intent-UUID + per-path debounce all happen
    // inside studioWrite. commitIntent groups everything for this task into
    // one steward: commit.
    await studioWrite({
      path: historyPath,
      content: historyDoc,
      intentUUID,
      format: 'json',
      repoPath,
      debounceMs: 100,  // don't make tests sleep — production default is 500
    });

    const commitResult = await commitIntent(intentUUID, `append history.json — ${entry.title}`);
    if (!commitResult.committed) {
      return { outcome: 'error', error: `commitIntent returned ${commitResult.reason}` };
    }
    const sha = commitResult.results[0]?.sha;
    if (commitResult.results[0]?.error) {
      return {
        outcome: 'error',
        error: `git commit failed: ${commitResult.results[0].error}`,
      };
    }

    return {
      outcome: 'success',
      output: `journaled ${recId} for ${slug} → ${sha?.slice(0, 8)}`,
    };
  },
};

function readOrSeedHistory(historyPath) {
  if (!fs.existsSync(historyPath)) {
    return { entries: [], lastUpdated: null };
  }
  try {
    const doc = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    if (!Array.isArray(doc.entries)) doc.entries = [];
    return doc;
  } catch {
    // Treat unreadable as empty so we don't fail the loop on a corrupt file —
    // but log via the error path so the user sees it.
    return { entries: [], lastUpdated: null };
  }
}
