// Built-in rule: bug-closed-flip-todo
//
// When a bug JSON file under projects/{slug}/bugs/{id}.json is modified
// to status 'closed' or 'wontfix', find the corresponding todo.json item
// (matched by ref === "bugs/<bug.id>.json") and mark it done.
//
// Idempotency: if the matching todo item already has done: true, skip.
// If no matching todo item exists (e.g. bug was filed before the
// bug-filed-append-todo rule landed, or todo.json is missing), skip.
//
// Trigger: kind 'file-changed', chokidar event 'change' (skip 'add' and
// 'unlink').

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { studioWrite, commitIntent } from '../studio-write.js';

const BUG_PATH_REGEX = /^projects\/([^/]+)\/bugs\/[^/]+\.json$/;
const CLOSED_STATUSES = new Set(['closed', 'wontfix']);

export const bugClosedFlipTodo = {
  id: 'bug-closed-flip-todo',
  priority: 'medium',
  description: 'When a bug closes (closed/wontfix), mark the matching todo.json item done.',

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

    if (!CLOSED_STATUSES.has(bug.status)) {
      return { outcome: 'skipped', output: `bug status "${bug.status}" is not closed/wontfix` };
    }

    const bugId = bug.id || path.basename(relPath, '.json');
    const refValue = `bugs/${bugId}.json`;

    const todoPath = path.join(dataDir, 'projects', slug, 'todo.json');
    if (!fs.existsSync(todoPath)) {
      return { outcome: 'skipped', output: `todo.json not found at ${todoPath}` };
    }

    let todoDoc;
    try {
      todoDoc = JSON.parse(fs.readFileSync(todoPath, 'utf-8'));
    } catch (err) {
      return { outcome: 'error', error: `failed to parse todo.json: ${err.message}` };
    }

    if (!Array.isArray(todoDoc.items)) {
      return { outcome: 'skipped', output: 'todo.json has no items[] array' };
    }

    const idx = todoDoc.items.findIndex(it => it && it.ref === refValue);
    if (idx === -1) {
      return { outcome: 'skipped', output: `no todo item references ${refValue}` };
    }

    if (todoDoc.items[idx].done === true) {
      return { outcome: 'skipped', output: `todo item for ${bugId} already marked done` };
    }

    todoDoc.items[idx] = {
      ...todoDoc.items[idx],
      done: true,
      doneAt: new Date().toISOString(),
    };
    todoDoc.lastUpdated = new Date().toISOString();

    let repoPath;
    try {
      repoPath = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: path.dirname(todoPath),
        encoding: 'utf-8',
      }).trim();
    } catch (err) {
      return { outcome: 'error', error: `git rev-parse failed for ${todoPath}: ${err.message}` };
    }

    await studioWrite({
      path: todoPath,
      content: todoDoc,
      intentUUID,
      format: 'json',
      repoPath,
      debounceMs: 100,
    });

    const commitResult = await commitIntent(
      intentUUID,
      `flip todo.json — bug ${bugId} done (${bug.status})`
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
      output: `marked todo item for ${bugId} done → ${sha?.slice(0, 8)}`,
    };
  },
};
