/* @vitest-environment node */
/**
 * agent-todos — auto-resume e2e tests (W3·T13)
 * Tests 13–21 from docs/plans/2026-04-29-agent-todos-design.md §9.3
 *
 * Strategy:
 *   - Each test gets a fresh tmp data dir with the right directory structure.
 *   - `send` calls are captured in an array; assertions run against that array.
 *   - Time is controlled via real mtime manipulation (utimesSync) — chokidar
 *     polls the real fs, so vi.useFakeTimers() is avoided.
 *   - Waits use setTimeout (not fake timers) to let chokidar's
 *     awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 } settle.
 *
 * NOTE: The watcher's maybeAutoResume() is called SYNCHRONOUSLY at the end of
 * the boot scan (before startAgentTodosWatcher returns), so tests 13–15/17–21
 * do NOT need to wait for chokidar 'add' events for the initial assertions —
 * the IPC events are already captured by the time we await a short setTimeout.
 * The setTimeout is just belt-and-suspenders to let any async I/O settle.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  utimesSync,
} from 'node:fs';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { startAgentTodosWatcher } from '../agent-todos.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create a fresh tmp directory with the required .steward/agent-todos layout. */
function tmpDataDir() {
  const root = join(
    os.tmpdir(),
    `auto-resume-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(root, '.steward', 'agent-todos'), { recursive: true });
  return root;
}

/**
 * Write a JSONL file and backdating its mtime.
 *
 * @param {string} dataDir   - hq-data root
 * @param {string} sessionId - becomes the filename (<sessionId>.jsonl)
 * @param {object[]} lines   - array of objects, each serialised as a JSON line
 * @param {number} [mtimeMs] - desired mtime in ms since epoch (backdates the file)
 * @returns {string} absolute path to the written file
 */
function seedJsonl(dataDir, sessionId, lines, mtimeMs) {
  const filePath = join(
    dataDir,
    '.steward',
    'agent-todos',
    `${sessionId}.jsonl`,
  );
  writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  if (mtimeMs !== undefined) {
    const mdate = new Date(mtimeMs);
    utimesSync(filePath, mdate, mdate);
  }
  return filePath;
}

/** Return a short Promise that resolves after `ms` milliseconds. */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('agent-todos — auto-resume e2e', () => {
  let dataDir;
  let sentEvents;
  let watchers; // keep track so afterEach can stop them even if test throws

  beforeEach(() => {
    dataDir = tmpDataDir();
    sentEvents = [];
    watchers = [];
  });

  afterEach(async () => {
    for (const w of watchers) {
      try { w.stop(); } catch {}
    }
    await wait(50); // let chokidar close gracefully before deleting the dir
    try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  /** Build a `send` spy that pushes into `sentEvents`. */
  function makeSend() {
    return (eventName, payload) => sentEvents.push({ eventName, payload });
  }

  /** Wrap startAgentTodosWatcher so we can auto-stop in afterEach. */
  function startWatcher(opts) {
    const w = startAgentTodosWatcher(opts);
    watchers.push(w);
    return w;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Test 13 — Happy path
  // ───────────────────────────────────────────────────────────────────────────
  it(
    'T13: emits steward:auto-resume once with the right sessionId + env on a recent crash',
    async () => {
      const now = Date.now();
      seedJsonl(
        dataDir,
        'sess-13',
        [
          {
            ts: new Date(now - 30_000).toISOString(),
            sessionId: 'sess-13',
            action: 'add',
            id: 'sub-1',
            title: 'X',
            status: 'in_progress',
            parent: { kind: 'strategic-todo', id: 'todo-002', project: 'arena' },
          },
        ],
        now - 30_000,
      );

      startWatcher({
        dataDir,
        send: makeSend(),
        aliveSessionIds: () => new Set(),
      });

      // maybeAutoResume() runs synchronously during boot scan; a short wait is
      // belt-and-suspenders only.
      await wait(80);

      const evts = sentEvents.filter((e) => e.eventName === 'steward:auto-resume');
      expect(evts).toHaveLength(1);
      expect(evts[0].payload.sessionId).toBe('sess-13');
      expect(evts[0].payload.env?.STEWARD_PARENT_TODO).toBe('todo-002');
      expect(evts[0].payload.env?.STEWARD_PROJECT).toBe('arena');
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Test 14 — Already-alive suppression
  // ───────────────────────────────────────────────────────────────────────────
  it(
    'T14: suppresses auto-resume when the session is in aliveSessionIds',
    async () => {
      const now = Date.now();
      seedJsonl(
        dataDir,
        'sess-14',
        [
          {
            ts: new Date(now - 30_000).toISOString(),
            sessionId: 'sess-14',
            action: 'add',
            id: 'sub-1',
            title: 'X',
            status: 'in_progress',
            parent: { kind: 'strategic-todo', id: 'todo-014', project: 'arena' },
          },
        ],
        now - 30_000,
      );

      startWatcher({
        dataDir,
        send: makeSend(),
        // sess-14 is alive — buildRollup will NOT add it to orphans
        aliveSessionIds: () => new Set(['sess-14']),
      });

      await wait(80);

      const evts = sentEvents.filter((e) => e.eventName === 'steward:auto-resume');
      expect(evts).toHaveLength(0);
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Test 15 — Idempotency
  // ───────────────────────────────────────────────────────────────────────────
  it(
    'T15: fires auto-resume exactly once per sessionId across multiple boot/scan cycles',
    async () => {
      const now = Date.now();
      seedJsonl(
        dataDir,
        'sess-15',
        [
          {
            ts: new Date(now - 30_000).toISOString(),
            sessionId: 'sess-15',
            action: 'add',
            id: 'sub-1',
            title: 'X',
            status: 'in_progress',
            parent: { kind: 'strategic-todo', id: 'todo-015', project: 'arena' },
          },
        ],
        now - 30_000,
      );

      const watcher = startWatcher({
        dataDir,
        send: makeSend(),
        aliveSessionIds: () => new Set(),
      });

      await wait(80);

      // Calling buildRollup() triggers scanForArchive() internally but does NOT
      // call maybeAutoResume() — the public buildRollup wrapper just returns data.
      // Similarly scanForArchive() alone does not re-emit auto-resume.
      // The autoResumedThisBootCycle set inside the watcher guards against
      // any future code path that could double-fire.
      watcher.buildRollup();
      if (typeof watcher.scanForArchive === 'function') watcher.scanForArchive();

      await wait(80);

      const evts = sentEvents.filter((e) => e.eventName === 'steward:auto-resume');
      expect(evts).toHaveLength(1); // exactly once, not twice
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Test 16 — Persisted env vars survive restart (skipped — requires Electron)
  // ───────────────────────────────────────────────────────────────────────────
  it.skip(
    'T16: persisted env vars survive restart [requires real Electron sessionTracker fixture]',
    () => {
      // Test 16 in the design spec requires spawning a PTY, killing it, restarting
      // Electron, and asserting the restored PTY's env. The session-tracker module
      // (electron/sessions/session-tracker.js) is tangled with main.cjs imports
      // (ipcMain, BrowserWindow, chokidar) and cannot be cleanly imported in a
      // Vitest node environment.
      //
      // Covered indirectly by:
      //   - W3·T11 unit tests for buildStewardEnv
      //   - W3·T11 manual restoration: recordPendingSpawn persists stewardEnv,
      //     autoRestore re-injects on respawn (verified by code review).
      //
      // Full coverage of test 16 belongs in a future Playwright e2e suite once
      // CoE has one, or as a manual smoke test after an Electron restart.
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Test 17 — Stale orphan does NOT auto-resume
  // ───────────────────────────────────────────────────────────────────────────
  it(
    'T17: does NOT emit auto-resume for a 10-min-old orphan (recovery=banner)',
    async () => {
      const now = Date.now();
      seedJsonl(
        dataDir,
        'sess-17',
        [
          {
            ts: new Date(now - 600_000).toISOString(),
            sessionId: 'sess-17',
            action: 'add',
            id: 'sub-1',
            title: 'X',
            status: 'in_progress',
            parent: { kind: 'strategic-todo', id: 'todo-017', project: 'arena' },
          },
        ],
        now - 600_000, // 10 min ago — age > 5 min → 'banner'
      );

      const watcher = startWatcher({
        dataDir,
        send: makeSend(),
        aliveSessionIds: () => new Set(),
      });

      await wait(80);

      const evts = sentEvents.filter((e) => e.eventName === 'steward:auto-resume');
      expect(evts).toHaveLength(0);

      // Verify rollup correctly classifies it as 'banner', not 'auto'
      const rollup = watcher.buildRollup();
      const orphan = rollup.orphans.find((o) => o.sessionId === 'sess-17');
      expect(orphan).toBeDefined();
      expect(orphan.recovery).toBe('banner');
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Test 18 — Archive boundary (>7 days moves to archive/)
  // ───────────────────────────────────────────────────────────────────────────
  it(
    'T18: moves a >7-day-old JSONL to archive/ and drops it from the rollup',
    async () => {
      const now = Date.now();
      const eightDaysAgo = now - 8 * 86_400_000;

      seedJsonl(
        dataDir,
        'sess-18',
        [
          {
            ts: new Date(eightDaysAgo).toISOString(),
            sessionId: 'sess-18',
            action: 'add',
            id: 'sub-1',
            title: 'old',
            status: 'in_progress',
            parent: { kind: 'strategic-todo', id: 'todo-018', project: 'arena' },
          },
        ],
        eightDaysAgo,
      );

      const todosDir = join(dataDir, '.steward', 'agent-todos');
      const originalPath = join(todosDir, 'sess-18.jsonl');
      const archivePath = join(todosDir, 'archive', 'sess-18.jsonl');

      // scanForArchive() runs synchronously during the boot scan constructor,
      // so the file should already be archived by the time we check.
      startWatcher({
        dataDir,
        send: makeSend(),
        aliveSessionIds: () => new Set(),
      });

      await wait(80);

      expect(existsSync(archivePath)).toBe(true);
      expect(existsSync(originalPath)).toBe(false);

      // buildRollup() should not include the archived session
      const watcher = watchers[watchers.length - 1];
      const rollup = watcher.buildRollup();
      expect(rollup.orphans.find((o) => o.sessionId === 'sess-18')).toBeUndefined();
      expect(rollup.untethered.find((u) => u.sessionId === 'sess-18')).toBeUndefined();
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Test 19 — Concurrent crashes: 3 sessions all resume independently
  // ───────────────────────────────────────────────────────────────────────────
  it(
    'T19: auto-resumes 3 concurrent crashes independently with segregated substeps',
    async () => {
      const now = Date.now();
      for (const id of ['s19a', 's19b', 's19c']) {
        seedJsonl(
          dataDir,
          id,
          [
            {
              ts: new Date(now - 60_000).toISOString(),
              sessionId: id,
              action: 'add',
              id: `sub-${id}`,
              title: `T-${id}`,
              status: 'in_progress',
              parent: { kind: 'strategic-todo', id: `todo-${id}`, project: 'arena' },
            },
          ],
          now - 60_000,
        );
      }

      const watcher = startWatcher({
        dataDir,
        send: makeSend(),
        aliveSessionIds: () => new Set(),
      });

      await wait(100);

      const resumeEvts = sentEvents.filter((e) => e.eventName === 'steward:auto-resume');
      const resumedIds = resumeEvts.map((e) => e.payload.sessionId).sort();
      expect(resumedIds).toEqual(['s19a', 's19b', 's19c']);

      // Each parent todo has exactly 1 substep (no bleed between sessions)
      const rollup = watcher.buildRollup();
      expect(rollup.byParent['todo-s19a']?.items).toHaveLength(1);
      expect(rollup.byParent['todo-s19b']?.items).toHaveLength(1);
      expect(rollup.byParent['todo-s19c']?.items).toHaveLength(1);
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Test 20 — Manual resume: verify same payload shape as auto-resume
  // ───────────────────────────────────────────────────────────────────────────
  it(
    'T20: auto-resume payload includes sessionId + env with STEWARD_PARENT_TODO + STEWARD_PROJECT',
    async () => {
      // The design spec says the manual resume path (steward:resume-orphan-request
      // IPC handler in main.cjs) should produce the same payload as the watcher's
      // auto-resume emission.  We can't easily unit-test main.cjs here, but we
      // can verify that the watcher emits the exact payload shape that the manual
      // resume is specified to mirror — so both paths are documented and checkable.
      const now = Date.now();
      seedJsonl(
        dataDir,
        'sess-20',
        [
          {
            ts: new Date(now - 30_000).toISOString(),
            sessionId: 'sess-20',
            action: 'add',
            id: 'sub-1',
            title: 'X',
            status: 'in_progress',
            parent: { kind: 'strategic-todo', id: 'todo-20', project: 'arena' },
          },
        ],
        now - 30_000,
      );

      startWatcher({
        dataDir,
        send: makeSend(),
        aliveSessionIds: () => new Set(),
      });

      await wait(80);

      const evt = sentEvents.find((e) => e.eventName === 'steward:auto-resume');
      expect(evt).toBeDefined();
      // The watcher emits { sessionId, env } — env contains STEWARD_PARENT_TODO
      // and STEWARD_PROJECT but NOT STEWARD_SESSION_ID (main.cjs may add that
      // when it re-spawns the PTY, but the watcher itself does not include it).
      expect(evt.payload.sessionId).toBe('sess-20');
      expect(evt.payload.env).toMatchObject({
        STEWARD_PARENT_TODO: 'todo-20',
        STEWARD_PROJECT: 'arena',
      });
      // Confirm STEWARD_SESSION_ID is NOT in the watcher's own payload
      // (avoids false expectation that could break future changes to main.cjs)
      expect(evt.payload.env.STEWARD_SESSION_ID).toBeUndefined();
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Test 21 — Race against running agent (no double-resume)
  // ───────────────────────────────────────────────────────────────────────────
  it(
    'T21: does not double-resume when JSONL is written to after boot scan fires',
    async () => {
      const now = Date.now();
      const file = seedJsonl(
        dataDir,
        'sess-21',
        [
          {
            ts: new Date(now - 60_000).toISOString(),
            sessionId: 'sess-21',
            action: 'add',
            id: 'sub-1',
            title: 'X',
            status: 'in_progress',
            parent: { kind: 'strategic-todo', id: 'todo-021', project: 'arena' },
          },
        ],
        now - 60_000,
      );

      startWatcher({
        dataDir,
        send: makeSend(),
        aliveSessionIds: () => new Set(),
      });

      // Boot scan fires auto-resume synchronously — give it a moment to settle
      await wait(60);

      // Simulate the active agent appending a new line (session is "live writing")
      appendFileSync(
        file,
        JSON.stringify({
          ts: new Date(now).toISOString(),
          sessionId: 'sess-21',
          action: 'update',
          id: 'sub-1',
          status: 'in_progress',
        }) + '\n',
      );

      // Wait past the chokidar awaitWriteFinish stabilityThreshold (200ms) +
      // pollInterval (100ms) + margin.  The chokidar 'change' handler does NOT
      // call maybeAutoResume() by design; and even if it did, autoResumedThisBootCycle
      // would block a second emission.
      await wait(400);

      const evts = sentEvents.filter((e) => e.eventName === 'steward:auto-resume');
      expect(evts).toHaveLength(1); // still exactly 1, not 2
    },
  );
});
