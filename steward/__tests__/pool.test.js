/* @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index.js';
import { createWorkerPool } from '../worker/pool.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitFor(predicate, { timeoutMs = 2000, intervalMs = 10 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error('waitFor timeout');
}

function silentLogger() {
  return { log: () => {}, error: () => {}, warn: () => {} };
}

describe('worker pool — basic lifecycle', () => {
  let tmpDir, db;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-pool-'));
    db = openDb(path.join(tmpDir, 'events.db'));
  });
  afterEach(async () => {
    db?.close();
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws when constructed without db or jobRunner', () => {
    expect(() => createWorkerPool({})).toThrow(/db required/);
    expect(() => createWorkerPool({ db })).toThrow(/jobRunner required/);
  });

  it('start + stop with no work in queue does nothing harmful', async () => {
    let calls = 0;
    const pool = createWorkerPool({ db, jobRunner: async () => { calls++; return { outcome: 'success' }; }, pollIntervalMs: 20, logger: silentLogger() });
    pool.start();
    await sleep(80);
    await pool.stop();
    expect(calls).toBe(0);
    expect(pool.status().totalRun).toBe(0);
  });
});

describe('worker pool — task processing', () => {
  let tmpDir, db, pool;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-pool-'));
    db = openDb(path.join(tmpDir, 'events.db'));
  });
  afterEach(async () => {
    if (pool) await pool.stop({ drainMs: 1000 });
    db?.close();
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function enqueueN(n) {
    const eventId = db.appendEvent({ project: 'arena', source: 's', kind: 'k', payload: {} });
    const ids = [];
    for (let i = 0; i < n; i++) ids.push(db.enqueueTask({ ruleId: `rule-${i}`, eventId }));
    return ids;
  }

  it('processes a queued task end-to-end and persists outcome', async () => {
    const taskIds = enqueueN(1);
    pool = createWorkerPool({
      db,
      pollIntervalMs: 10,
      logger: silentLogger(),
      jobRunner: async (task) => ({ outcome: 'success', output: `done ${task.id}` }),
    });
    pool.start();
    await waitFor(() => pool.status().totalRun === 1);
    await pool.stop();
    const t = db.getTask(taskIds[0]);
    expect(t.outcome).toBe('success');
    expect(t.output).toContain('done');
    expect(t.completed_at).toMatch(/T/);
  });

  it('respects concurrency cap (never exceeds N in-flight)', async () => {
    enqueueN(20);
    let maxInFlightObserved = 0;
    pool = createWorkerPool({
      db,
      concurrency: 3,
      pollIntervalMs: 5,
      logger: silentLogger(),
      jobRunner: async () => {
        maxInFlightObserved = Math.max(maxInFlightObserved, pool.status().inFlight);
        await sleep(40);
        return { outcome: 'success' };
      },
    });
    pool.start();
    await waitFor(() => pool.status().totalRun === 20, { timeoutMs: 5000 });
    await pool.stop();
    expect(maxInFlightObserved).toBeGreaterThan(0);
    expect(maxInFlightObserved).toBeLessThanOrEqual(3);
  });

  it('processes tasks in oldest-first order', async () => {
    const ids = enqueueN(5);
    const seenOrder = [];
    pool = createWorkerPool({
      db,
      concurrency: 1, // serialize so order is deterministic
      pollIntervalMs: 5,
      logger: silentLogger(),
      jobRunner: async (task) => {
        seenOrder.push(task.id);
        return { outcome: 'success' };
      },
    });
    pool.start();
    await waitFor(() => pool.status().totalRun === 5);
    await pool.stop();
    expect(seenOrder).toEqual(ids);
  });

  it('captures errors from jobRunner.throw and persists outcome:error', async () => {
    enqueueN(1);
    pool = createWorkerPool({
      db,
      pollIntervalMs: 5,
      logger: silentLogger(),
      jobRunner: async () => { throw new Error('runner exploded'); },
    });
    pool.start();
    await waitFor(() => pool.status().totalRun === 1);
    await pool.stop();
    expect(pool.status().totalErrored).toBe(1);
    expect(pool.status().totalSucceeded).toBe(0);
    const all = db.raw.prepare('SELECT * FROM tasks').all();
    expect(all[0].outcome).toBe('error');
    expect(all[0].error).toContain('runner exploded');
  });

  it('honors outcome returned by jobRunner (success vs timeout vs error)', async () => {
    enqueueN(3);
    let n = 0;
    pool = createWorkerPool({
      db,
      concurrency: 1,
      pollIntervalMs: 5,
      logger: silentLogger(),
      jobRunner: async () => {
        n++;
        if (n === 1) return { outcome: 'success', output: 'ok' };
        if (n === 2) return { outcome: 'timeout', error: 'hit cap' };
        return { outcome: 'skipped-low-confidence' };
      },
    });
    pool.start();
    await waitFor(() => pool.status().totalRun === 3);
    await pool.stop();
    const all = db.raw.prepare('SELECT outcome FROM tasks ORDER BY enqueued_at').all().map(r => r.outcome);
    expect(all).toEqual(['success', 'timeout', 'skipped-low-confidence']);
    expect(pool.status().totalSucceeded).toBe(1);
    expect(pool.status().totalErrored).toBe(1); // timeout counts as errored
  });
});

describe('worker pool — drain and signal', () => {
  let tmpDir, db, pool;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-pool-'));
    db = openDb(path.join(tmpDir, 'events.db'));
  });
  afterEach(async () => {
    if (pool) await pool.stop({ drainMs: 1000 });
    db?.close();
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stop() waits for in-flight tasks to drain', async () => {
    const eventId = db.appendEvent({ project: 'arena', source: 's', kind: 'k', payload: {} });
    db.enqueueTask({ ruleId: 'r1', eventId });
    db.enqueueTask({ ruleId: 'r2', eventId });
    pool = createWorkerPool({
      db,
      concurrency: 2,
      pollIntervalMs: 5,
      logger: silentLogger(),
      jobRunner: async () => { await sleep(80); return { outcome: 'success' }; },
    });
    pool.start();
    await waitFor(() => pool.status().inFlight === 2);
    const stopResult = await pool.stop({ drainMs: 1000 });
    expect(stopResult.drainedCleanly).toBe(true);
    expect(pool.status().inFlight).toBe(0);
    expect(pool.status().totalRun).toBe(2);
  });

  it('signal() wakes the poller faster than the next scheduled poll', async () => {
    pool = createWorkerPool({
      db,
      pollIntervalMs: 1000, // long poll interval
      logger: silentLogger(),
      jobRunner: async () => ({ outcome: 'success' }),
    });
    pool.start();
    await sleep(20);
    // Enqueue a task AFTER the pool is running. Without signal(), it would
    // wait up to 1s for the next poll.
    const eventId = db.appendEvent({ project: 'a', source: 's', kind: 'k', payload: {} });
    db.enqueueTask({ ruleId: 'r1', eventId });
    pool.signal();
    await waitFor(() => pool.status().totalRun === 1, { timeoutMs: 500 });
    await pool.stop();
  });

  it('requeues orphan tasks on start (crash recovery)', async () => {
    const eventId = db.appendEvent({ project: 'a', source: 's', kind: 'k', payload: {} });
    const t1 = db.enqueueTask({ ruleId: 'r1', eventId });
    db.enqueueTask({ ruleId: 'r2', eventId });
    // Simulate a previous Steward that started but never completed t1
    db.claimNextTask();
    expect(db.queueDepth()).toEqual({ queued: 1, inFlight: 1 });

    pool = createWorkerPool({
      db,
      pollIntervalMs: 5,
      logger: silentLogger(),
      jobRunner: async () => ({ outcome: 'success' }),
    });
    pool.start();
    // Both tasks should run (t1 was requeued)
    await waitFor(() => pool.status().totalRun === 2, { timeoutMs: 500 });
    await pool.stop();
  });
});
