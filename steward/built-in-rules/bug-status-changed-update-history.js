// Built-in rule: bug-status-changed-update-history
//
// When a bug JSON file under projects/{slug}/bugs/{id}.json is modified,
// check if the current status differs from the most-recent journaled status
// for that bug in history.json. If it differs (or no entry exists yet for
// the new status), append a new "bug-status" history entry capturing the
// transition.
//
// Idempotency key: a history entry with the same bug id, category
// 'bug-status', and bugStatus matching the current status. The previous
// status is recovered from the most-recent prior bug-status entry for
// the same bug id (or 'unknown' if none exists).
//
// Trigger: kind 'file-changed', chokidar event 'change' (skip 'add' and
// 'unlink' — adds are handled by bug-filed-append-todo, deletes never
// journal).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { studioWrite, commitIntent } from '../studio-write.js';

const BUG_PATH_REGEX = /^projects\/([^/]+)\/bugs\/[^/]+\.json$/;

export const bugStatusChangedUpdateHistory = {
  id: 'bug-status-changed-update-history',
  priority: 'high',
  description: 'When a bug status changes, append a bug-status entry to history.json.',

  trigger: {
    source: 'hq',
    kind: 'file-changed',
    match: (event) => {
      const p = event?.payload?.path;
      if (typeof p !== 'string') return false;
      const evt = event.payload.event;
      if (evt === 'unlink' || evt === 'add') return false;
      return BUG_PATH_REGEX.test(p);
    },
  },

  handler: async ({ event, dataDir, intentUUID }) => {
    const relPath = event.payload.path;
    const m = BUG_PATH_REGEX.exec(relPath);
    if (!m) return { outcome: 'skipped', output: 'path did not match bugs pattern' };
    const slug = m[1];

    const bugAbsPath = path.join(dataDir, relPath);
    if (!fs.existsSync(bugAbsPath)) {
      return { outcome: 'skipped', output: `bug file not found: ${bugAbsPath}` };
    }

    let bug;
    try {
      bug = JSON.parse(fs.readFileSync(bugAbsPath, 'utf-8'));
    } catch (err) {
      return { outcome: 'error', error: `failed to parse bug JSON: ${err.message}` };
    }

    const bugId = bug.id || path.basename(relPath, '.json');
    const newStatus = bug.status || 'unknown';

    const historyPath = path.join(dataDir, 'projects', slug, 'history.json');
    const historyDoc = readOrSeedHistory(historyPath);

    // Find the most-recent bug-status entry for this bug id
    let prevStatus = null;
    for (let i = (historyDoc.entries || []).length - 1; i >= 0; i--) {
      const e = historyDoc.entries[i];
      if (e && e.id === bugId && e.category === 'bug-status') {
        prevStatus = e.bugStatus || null;
        break;
      }
    }

    // Idempotency: if the latest bug-status entry already records the current status, skip
    if (prevStatus === newStatus) {
      return { outcome: 'skipped', output: `history already records bug ${bugId} at status "${newStatus}"` };
    }

    const agent = bug.assignedTo || bug.reportedBy || 'Boss';
    const entry = {
      date: new Date().toISOString().slice(0, 10),
      id: bugId,
      agent,
      title: `Bug status: ${bug.title || bugId}`,
      summary: `Status: ${prevStatus || 'unknown'} → ${newStatus}`,
      ref: `projects/${slug}/bugs/${bugId}.json`,
      category: 'bug-status',
      bugStatus: newStatus,
    };

    historyDoc.entries = [...(historyDoc.entries || []), entry];
    historyDoc.lastUpdated = new Date().toISOString();

    let repoPath;
    try {
      repoPath = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: path.dirname(historyPath),
        encoding: 'utf-8',
      }).trim();
    } catch (err) {
      return { outcome: 'error', error: `git rev-parse failed for ${historyPath}: ${err.message}` };
    }

    await studioWrite({
      path: historyPath,
      content: historyDoc,
      intentUUID,
      format: 'json',
      repoPath,
      debounceMs: 100,
    });

    const commitResult = await commitIntent(
      intentUUID,
      `append history.json — bug ${bugId} ${prevStatus || 'unknown'} → ${newStatus}`
    );
    if (!commitResult.committed) {
      return { outcome: 'error', error: `commitIntent returned ${commitResult.reason}` };
    }
    if (commitResult.results[0]?.error) {
      return { outcome: 'error', error: `git commit failed: ${commitResult.results[0].error}` };
    }
    const sha = commitResult.results[0]?.sha;

    return {
      outcome: 'success',
      output: `journaled bug ${bugId} ${prevStatus || 'unknown'} → ${newStatus} → ${sha?.slice(0, 8)}`,
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
    return { entries: [], lastUpdated: null };
  }
}
