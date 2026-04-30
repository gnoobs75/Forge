// Built-in rule: prd-maintain-on-history-change
//
// Triggers on a chokidar change to projects/<slug>/(history|features|todo).json.
// Reads the project's PRD (seeds an empty skeleton if missing), recomputes
// the dynamic sections (Implementation Status / Recently Shipped / Open
// Questions) from the project's three dynamic source files, and writes back
// via studioWrite + commitIntent.
//
// Termination guarantee for the chain:
//   rec resolves → chokidar fires → rec-resolved-update-history writes
//   history.json → chokidar fires → THIS rule writes prd.md → chokidar
//   fires on prd.md → no rule matches prd.md → chain ends.
//
// If two of (history, features, todo) change in the same debounce window,
// the rule fires once per change. studioWrite per-path debounce (500ms)
// coalesces the resulting prd.md writes; intent UUIDs differ so each
// rebuild produces its own steward: commit (idempotent — second commit
// is a no-op if nothing changed).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { studioWrite, commitIntent } from '../studio-write.js';
import { parse, serialize, buildSkeleton } from '../prd/parser.js';
import { rebuildDynamicSections } from '../prd/maintainer.js';

const TRIGGER_PATH_REGEX = /^projects\/([^/]+)\/(history|features|todo)\.json$/;

export const prdMaintainOnHistoryChange = {
  id: 'prd-maintain-on-history-change',
  priority: 'medium',
  description: 'On any history.json / features.json / todo.json change, refresh the project\'s prd.md dynamic sections.',

  trigger: {
    source: 'hq',
    kind: 'file-changed',
    match: (event) => {
      const p = event?.payload?.path;
      if (typeof p !== 'string') return false;
      if (event.payload.event === 'unlink') return false;
      return TRIGGER_PATH_REGEX.test(p);
    },
  },

  handler: async ({ event, dataDir, intentUUID }) => {
    const m = TRIGGER_PATH_REGEX.exec(event.payload.path);
    if (!m) return { outcome: 'skipped', output: 'path did not match maintenance trigger' };
    const slug = m[1];
    const trigger = m[2];

    const projectDir = path.join(dataDir, 'projects', slug);
    const prdPath = path.join(projectDir, 'prd.md');

    // Read current PRD (or null to seed)
    let prd = null;
    if (fs.existsSync(prdPath)) {
      try {
        prd = parse(fs.readFileSync(prdPath, 'utf-8'));
      } catch (err) {
        return { outcome: 'error', error: `failed to parse prd.md: ${err.message}` };
      }
    }

    // Read source files (best-effort — null if missing or unparseable)
    const features = readJsonOrNull(path.join(projectDir, 'features.json'));
    const history = readJsonOrNull(path.join(projectDir, 'history.json'));
    const todo = readJsonOrNull(path.join(projectDir, 'todo.json'));

    // If everything is null AND PRD doesn't exist yet, no point seeding an
    // empty skeleton on every random save — only seed when we have at least
    // one source of dynamic content.
    if (!prd && !features && !history && !todo) {
      return { outcome: 'skipped', output: `no prd.md and no source files for ${slug} — nothing to do` };
    }

    const projectName = inferProjectName(slug, prd);
    const { doc, changed } = rebuildDynamicSections({ prd, projectName, features, history, todo });

    const anyChange = changed.implementationStatus || changed.recentlyShipped || changed.openQuestions;
    if (!anyChange && prd) {
      // Idempotent — nothing to write
      return { outcome: 'skipped', output: `no dynamic-section changes for ${slug} (trigger: ${trigger}.json)` };
    }

    // git repo (Agency root, typically)
    let repoPath;
    try {
      repoPath = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: projectDir,
        encoding: 'utf-8',
      }).trim();
    } catch (err) {
      return { outcome: 'error', error: `git rev-parse failed for ${projectDir}: ${err.message}` };
    }

    const md = serialize(doc);
    await studioWrite({
      path: prdPath,
      content: md,
      intentUUID,
      format: 'md',
      repoPath,
      debounceMs: 100,
    });

    const summary = summarizeChanges(changed, prd ? 'maintain' : 'seed');
    const commitResult = await commitIntent(intentUUID, `${prd ? 'maintain' : 'seed'} prd.md (${slug}) — ${summary}`);
    if (!commitResult.committed) {
      return { outcome: 'error', error: `commitIntent returned ${commitResult.reason}` };
    }
    if (commitResult.results[0]?.error) {
      return { outcome: 'error', error: `git commit failed: ${commitResult.results[0].error}` };
    }
    const sha = commitResult.results[0]?.sha;

    return {
      outcome: 'success',
      output: `${prd ? 'updated' : 'seeded'} prd.md for ${slug} (${summary}) → ${sha?.slice(0, 8)}`,
    };
  },
};

function readJsonOrNull(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

function inferProjectName(slug, prd) {
  // If the existing PRD has a title, keep it. Otherwise capitalize the slug
  // (good enough for first-seed; user can edit).
  if (prd?.title) return prd.title.replace(/ — PRD$/, '');
  return slug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}

function summarizeChanges(changed, mode) {
  if (mode === 'seed') return 'initial skeleton + dynamic sections';
  const parts = [];
  if (changed.implementationStatus) parts.push('Implementation Status');
  if (changed.recentlyShipped) parts.push('Recently Shipped');
  if (changed.openQuestions) parts.push('Open Questions');
  return parts.join(', ') || 'no-op';
}
