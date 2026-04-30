// Built-in rule: bug-filed-append-todo
//
// When a new bug JSON file appears under projects/{slug}/bugs/{id}.json AND
// its status is 'open', append a corresponding item to that project's
// todo.json so the bug surfaces alongside other punch-list work.
//
// Severity → todo priority mapping:
//   critical | high  → high
//   medium           → medium
//   low              → low
//
// Idempotency: if any todo.items[*].ref === "bugs/<bug.id>.json" already
// exists, the handler skips. Synthesizes the next todo id by scanning
// existing items for "todo-NNN" patterns and incrementing.
//
// Trigger: chokidar event on `projects/<slug>/bugs/<file>.json` where
// the underlying chokidar event is 'add' (we use kind: 'file-changed'
// because the reactor only knows that one kind today; we discriminate
// add-vs-change inside the trigger.match predicate).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { studioWrite, commitIntent } from '../studio-write.js';

const BUG_PATH_REGEX = /^projects\/([^/]+)\/bugs\/[^/]+\.json$/;

export const bugFiledAppendTodo = {
  id: 'bug-filed-append-todo',
  priority: 'high',
  description: 'When a new bug JSON is added with status=open, append a todo.json item referencing it.',

  trigger: {
    source: 'hq',
    kind: 'file-changed',
    match: (event) => {
      const p = event?.payload?.path;
      if (typeof p !== 'string') return false;
      // Only "newly appeared" bug files should fan out into the todo list —
      // status edits are handled by the other bug rules.
      if (event.payload.event !== 'add') return false;
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

    if (bug.status !== 'open') {
      return { outcome: 'skipped', output: `bug status is "${bug.status}", not open` };
    }

    const bugId = bug.id || path.basename(relPath, '.json');
    const refValue = `bugs/${bugId}.json`;

    // Locate / load todo.json
    const todoPath = path.join(dataDir, 'projects', slug, 'todo.json');
    const todoDoc = readOrSeedTodo(todoPath, slug);

    // Idempotency: bail if any item already references this bug
    const alreadyTracked = (todoDoc.items || []).some(it => it && it.ref === refValue);
    if (alreadyTracked) {
      return { outcome: 'skipped', output: `todo.json already tracks ${refValue}` };
    }

    // Severity → todo priority
    const sev = (bug.severity || 'medium').toLowerCase();
    const priority =
      sev === 'critical' || sev === 'high' ? 'high'
      : sev === 'low' ? 'low'
      : 'medium';

    // Synthesize next id by scanning existing "todo-NNN" patterns
    const nextId = nextTodoId(todoDoc.items || []);

    const summarySource = typeof bug.description === 'string' ? bug.description : '';
    const summary = `Bug filed: ${summarySource.slice(0, 100)}`;

    const newItem = {
      id: nextId,
      added: new Date().toISOString().slice(0, 10),
      priority,
      category: 'bug',
      title: bug.title || `Bug ${bugId}`,
      summary,
      ref: refValue,
    };

    todoDoc.items = [...(todoDoc.items || []), newItem];
    todoDoc.lastUpdated = new Date().toISOString();

    // Resolve the git repo that owns todo.json (Agency root, typically)
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
      `append todo.json — bug ${bugId} (${slug})`
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
      output: `appended todo for ${bugId} → ${sha?.slice(0, 8)}`,
    };
  },
};

function readOrSeedTodo(todoPath, slug) {
  if (!fs.existsSync(todoPath)) {
    return { project: slug, lastUpdated: null, schemaVersion: 1, items: [] };
  }
  try {
    const doc = JSON.parse(fs.readFileSync(todoPath, 'utf-8'));
    if (!Array.isArray(doc.items)) doc.items = [];
    return doc;
  } catch {
    return { project: slug, lastUpdated: null, schemaVersion: 1, items: [] };
  }
}

function nextTodoId(items) {
  let max = 0;
  for (const it of items) {
    if (!it || typeof it.id !== 'string') continue;
    const m = /^todo-(\d+)$/i.exec(it.id);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const next = max + 1;
  return `todo-${String(next).padStart(3, '0')}`;
}
