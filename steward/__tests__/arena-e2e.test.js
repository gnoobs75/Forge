/* @vitest-environment node */
//
// Phase 3 acceptance — the "Arena canary" end-to-end test.
//
// Forks the actual Steward subprocess against a temp hq-data fixture +
// git repo. Drops a resolved recommendation file, fires an hq:file-changed
// event over IPC, and asserts:
//   1. The reactor matched the rule and enqueued a task
//   2. The pool ran the rec-resolved-update-history handler
//   3. history.json was appended with the right entry
//   4. A `steward: append history.json` commit landed in the local git log
//
// This is the canary scenario from the Steward design doc: Arena had 27
// active recs and 0 history entries when the audit ran. Phase 3 closes
// that loop.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fork, execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STEWARD_ENTRY = path.resolve(__dirname, '..', 'index.js');

function gitInit(repo) {
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'tester'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo });
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'initial'], { cwd: repo });
}

function waitForMessage(child, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.removeListener('message', onMsg);
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for steward message`));
    }, timeoutMs);
    function onMsg(msg) {
      if (predicate(msg)) {
        clearTimeout(timer);
        child.removeListener('message', onMsg);
        resolve(msg);
      }
    }
    child.on('message', onMsg);
  });
}

function waitFor(predicate, { timeoutMs = 5000, intervalMs = 50 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function poll() {
      let value;
      try { value = predicate(); } catch (e) { value = false; }
      if (value) return resolve(value);
      if (Date.now() - start > timeoutMs) return reject(new Error(`waitFor timeout after ${timeoutMs}ms`));
      setTimeout(poll, intervalMs);
    })();
  });
}

describe('Phase 3 acceptance — Arena canary end-to-end', () => {
  let tmpRoot, dataDir, child;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-arena-'));
    dataDir = path.join(tmpRoot, 'hq-data');
    fs.mkdirSync(path.join(dataDir, '.steward'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'projects', 'arena', 'recommendations'), { recursive: true });
    // The git repo is tmpRoot — history.json lives at hq-data/projects/arena/
    // and `git rev-parse --show-toplevel` from there returns tmpRoot.
    gitInit(tmpRoot);
  });

  afterEach(async () => {
    if (child && child.connected) {
      const exitPromise = new Promise(r => child.once('exit', r));
      try { child.disconnect(); } catch {}
      const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1500);
      await exitPromise;
      clearTimeout(t);
    }
    await new Promise(r => setTimeout(r, 100));  // let SQLite WAL release on Windows
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {
        await new Promise(r => setTimeout(r, 250));
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
      }
    }
  });

  function spawnSteward() {
    child = fork(STEWARD_ENTRY, [], {
      env: { ...process.env, STEWARD_DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    // Debug aid: STEWARD_TEST_VERBOSE=1 surfaces child stdout/stderr.
    // Off by default so green runs aren't noisy.
    if (process.env.STEWARD_TEST_VERBOSE === '1') {
      child.stdout?.on('data', d => process.stderr.write(`[steward stdout] ${d}`));
      child.stderr?.on('data', d => process.stderr.write(`[steward stderr] ${d}`));
    }
    return child;
  }

  function writeRec(filename, body) {
    const recAbs = path.join(dataDir, 'projects', 'arena', 'recommendations', filename);
    fs.writeFileSync(recAbs, JSON.stringify(body, null, 2));
    return `projects/arena/recommendations/${filename}`;
  }

  it('appends history.json + makes a steward: commit when a resolved rec is announced', async () => {
    spawnSteward();

    // Wait for the daemon to come up + load the db
    await waitForMessage(child, m => m?.type === 'steward:ready');
    const ready = await waitForMessage(child, m =>
      m?.type === 'steward:status' && m.db?.open === true
    );
    expect(ready.pool?.running).toBe(true);

    // Drop a resolved rec on disk (the chokidar event we'll fire below
    // simulates what main.cjs would forward when its watcher fires)
    const relPath = writeRec('ARE-CANARY.json', {
      id: 'ARE-CANARY',
      agent: 'Tech Architect',
      title: 'Canary: prove the loop closes',
      summary: 'First Phase 3 rec to verify Steward end-to-end on Arena.',
      status: 'resolved',
    });

    // Fire the IPC event the main process would have forwarded
    child.send({
      type: 'hq:file-changed',
      payload: { event: 'change', path: relPath },
    });

    // event-ack should report a task was enqueued
    const ack = await waitForMessage(child, m => m?.type === 'steward:event-ack' && m.eventType === 'hq:file-changed');
    expect(ack.eventId).toBeTruthy();
    expect(ack.enqueuedTasks).toBeDefined();
    // Two rules fire on a rec event: rec-resolved-update-history (always)
    // and rec-resolved-update-features (skips for canary since no
    // features_affected listed). Both tasks are enqueued.
    const ruleIds = ack.enqueuedTasks.map(t => t.ruleId).sort();
    expect(ruleIds).toEqual(['rec-resolved-update-features', 'rec-resolved-update-history']);

    // Poll the git log directly until the steward commit appears. This is
    // more reliable than waiting for the right IPC status message because
    // the status-broadcast cadence is 30s by default — the commit is the
    // unambiguous "loop closed" signal.
    const historyPath = path.join(dataDir, 'projects', 'arena', 'history.json');
    await waitFor(() => {
      const log = execFileSync('git', ['-C', tmpRoot, 'log', '--pretty=%s'], { encoding: 'utf-8' });
      return /^steward: append history\.json — Canary/m.test(log);
    }, { timeoutMs: 5000 });

    // Verify the file
    expect(fs.existsSync(historyPath)).toBe(true);
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    expect(history._steward).toBeDefined();
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({
      id: 'ARE-CANARY',
      agent: 'Tech Architect',
      title: 'Canary: prove the loop closes',
      ref: relPath,
    });

    // Verify the commit author (already verified subject via the waitFor)
    const author = execFileSync('git', ['-C', tmpRoot, 'log', '-1', '--pretty=%an <%ae>'], { encoding: 'utf-8' }).trim();
    expect(author).toContain('steward');
  }, 15000);

  it('skips an active (not-resolved) rec without writing or committing', async () => {
    spawnSteward();
    await waitForMessage(child, m => m?.type === 'steward:ready');
    await waitForMessage(child, m => m?.type === 'steward:status' && m.db?.open === true);

    const relPath = writeRec('ARE-ACTIVE.json', {
      id: 'ARE-ACTIVE',
      agent: 'Studio Producer',
      title: 'Still in flight',
      summary: '...',
      status: 'active',
    });

    child.send({
      type: 'hq:file-changed',
      payload: { event: 'change', path: relPath },
    });

    const ack = await waitForMessage(child, m => m?.type === 'steward:event-ack');
    expect(ack.enqueuedTasks.length).toBe(2);  // both rec-resolved-* rules match

    // Wait long enough for the pool to process both tasks
    await new Promise(r => setTimeout(r, 800));

    // history.json should NOT exist (both rules skip on active rec)
    const historyPath = path.join(dataDir, 'projects', 'arena', 'history.json');
    expect(fs.existsSync(historyPath)).toBe(false);

    // Both tasks ran but skipped — totalRun ≥ 2, totalSucceeded == 0
    child.send({ type: 'steward:control', payload: { action: 'getStatus' } });
    const status = await waitForMessage(child, m =>
      m?.type === 'steward:status' && m.pool?.totalRun >= 2
    );
    expect(status.pool.totalRun).toBeGreaterThanOrEqual(2);
    expect(status.pool.totalSucceeded).toBe(0);  // both skipped
  }, 15000);

  it('full chain — rec resolves, history.json appended, prd.md auto-updated', async () => {
    spawnSteward();
    await waitForMessage(child, m => m?.type === 'steward:ready');
    await waitForMessage(child, m => m?.type === 'steward:status' && m.db?.open === true);

    // Drop a resolved rec
    const relPath = writeRec('ARE-CHAIN.json', {
      id: 'ARE-CHAIN',
      agent: 'Tech Architect',
      title: 'Phase 5 chain test',
      summary: 'Should propagate through the dynamic doc chain.',
      status: 'resolved',
    });

    // Fire 1: chokidar event for the rec file
    child.send({
      type: 'hq:file-changed',
      payload: { event: 'change', path: relPath },
    });
    // Two rules match (history + features); both get enqueued
    const ack1 = await waitForMessage(child, m => m?.type === 'steward:event-ack' && m.eventType === 'hq:file-changed');
    expect(ack1.enqueuedTasks.length).toBe(2);

    // Wait for history.json + the steward: append commit
    const historyPath = path.join(dataDir, 'projects', 'arena', 'history.json');
    await waitFor(() => {
      const log = execFileSync('git', ['-C', tmpRoot, 'log', '--pretty=%s'], { encoding: 'utf-8' });
      return /^steward: append history\.json — Phase 5 chain test/m.test(log);
    }, { timeoutMs: 5000 });
    expect(fs.existsSync(historyPath)).toBe(true);

    // Now simulate the chokidar event that the steward's own write to
    // history.json would normally produce (we're firing it manually rather
    // than relying on the watcher in this test environment)
    child.send({
      type: 'hq:file-changed',
      payload: { event: 'change', path: 'projects/arena/history.json' },
    });
    // The prd-maintain rule should match
    const ack2 = await waitForMessage(child, m => m?.type === 'steward:event-ack' &&
      m.enqueuedTasks?.some(t => t.ruleId === 'prd-maintain-on-history-change'));
    expect(ack2.enqueuedTasks.find(t => t.ruleId === 'prd-maintain-on-history-change')).toBeDefined();

    // Wait for prd.md to materialize + the steward: seed commit
    const prdPath = path.join(dataDir, 'projects', 'arena', 'prd.md');
    await waitFor(() => {
      const log = execFileSync('git', ['-C', tmpRoot, 'log', '--pretty=%s'], { encoding: 'utf-8' });
      return /^steward: seed prd\.md \(arena\)/m.test(log);
    }, { timeoutMs: 5000 });
    expect(fs.existsSync(prdPath)).toBe(true);

    const prdContent = fs.readFileSync(prdPath, 'utf-8');
    expect(prdContent).toContain('# Arena — PRD');
    expect(prdContent).toContain('## Vision');
    expect(prdContent).toContain('## Implementation Status');
    expect(prdContent).toContain('## Recently Shipped');
    // The "Phase 5 chain test" rec resolution lands in Recently Shipped
    expect(prdContent).toContain('Phase 5 chain test');
    expect(prdContent).toContain('ARE-CHAIN');

    // Verify both commits sit in the log + PRD has the steward origin tag
    const fullLog = execFileSync('git', ['-C', tmpRoot, 'log', '--pretty=%s'], { encoding: 'utf-8' });
    expect(fullLog).toMatch(/steward: seed prd\.md/);
    expect(fullLog).toMatch(/steward: append history\.json/);
    expect(prdContent).toMatch(/^<!-- steward-write: [0-9A-HJKMNP-TV-Z]{26} -->/);
  }, 20000);

  it('honors per-project pause — does not enqueue when project is paused', async () => {
    spawnSteward();
    await waitForMessage(child, m => m?.type === 'steward:ready');
    await waitForMessage(child, m => m?.type === 'steward:status' && m.db?.open === true);

    // Pause arena
    child.send({ type: 'steward:control', payload: { action: 'pause', project: 'arena' } });
    await waitForMessage(child, m => m?.type === 'steward:control-ack' && m.action === 'pause');

    const relPath = writeRec('ARE-PAUSED.json', {
      id: 'ARE-PAUSED', agent: 'X', title: 'Should be skipped', summary: '', status: 'resolved',
    });
    child.send({
      type: 'hq:file-changed',
      payload: { event: 'change', path: relPath },
    });

    const ack = await waitForMessage(child, m => m?.type === 'steward:event-ack');
    expect(ack.enqueuedTasks).toEqual([]);  // paused → reactor skips enqueue

    // Wait, then verify nothing landed
    await new Promise(r => setTimeout(r, 400));
    expect(fs.existsSync(path.join(dataDir, 'projects', 'arena', 'history.json'))).toBe(false);
  }, 15000);
});
