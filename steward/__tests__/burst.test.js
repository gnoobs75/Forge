/* @vitest-environment node */
//
// Phase 2 acceptance — 50-event burst against the worker pool.
// Verifies:
//   1. Cap-N concurrency holds (we set concurrency:5 explicitly)
//   2. The whole burst drains (every task completes)
//   3. No orphan tasks after a forced "crash" + restart (requeueOrphans
//      catches in-flight work that didn't finish)
//   4. Tasks complete in the expected outcome distribution

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index.js';
import { createWorkerPool } from '../worker/pool.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitFor(predicate, { timeoutMs = 10_000, intervalMs = 20 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error('waitFor timeout');
}

const silentLogger = { log: () => {}, error: () => {}, warn: () => {} };

describe('Phase 2 acceptance — 50-event burst', () => {
  let tmpDir, db, pool;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-burst-'));
    db = openDb(path.join(tmpDir, 'events.db'));
  });
  afterEach(async () => {
    if (pool) await pool.stop({ drainMs: 2000 });
    db?.close();
    await sleep(50);
    if (tmpDir && fs.existsSync(tmpDir)) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('drains 50 tasks at concurrency=5 with max-5 in-flight observed', async () => {
    const N = 50;
    const CONCURRENCY = 5;

    // Enqueue 50 tasks
    const eventId = db.appendEvent({ project: 'arena', source: 'burst', kind: 'test', payload: {} });
    for (let i = 0; i < N; i++) db.enqueueTask({ ruleId: `rule-${i}`, eventId });
    expect(db.queueDepth()).toEqual({ queued: N, inFlight: 0 });

    let maxInFlight = 0;
    const concurrencyHistory = [];
    pool = createWorkerPool({
      db,
      concurrency: CONCURRENCY,
      pollIntervalMs: 5,
      logger: silentLogger,
      jobRunner: async () => {
        const cur = pool.status().inFlight;
        if (cur > maxInFlight) maxInFlight = cur;
        concurrencyHistory.push(cur);
        // Simulate variable work duration (5-25ms) so concurrency dynamics are realistic
        await sleep(5 + Math.random() * 20);
        return { outcome: 'success', output: 'done' };
      },
    });

    pool.start();
    await waitFor(() => pool.status().totalRun === N, { timeoutMs: 10_000 });

    // Acceptance: cap held
    expect(maxInFlight).toBeGreaterThan(0);
    expect(maxInFlight).toBeLessThanOrEqual(CONCURRENCY);

    // Acceptance: queue drained
    expect(db.queueDepth()).toEqual({ queued: 0, inFlight: 0 });

    // Acceptance: every task succeeded
    const allTasks = db.raw.prepare('SELECT outcome FROM tasks').all();
    expect(allTasks).toHaveLength(N);
    expect(allTasks.every(t => t.outcome === 'success')).toBe(true);

    // The pool should have hit the cap at least once during the burst
    // (otherwise the test isn't actually exercising concurrency)
    const reachedCap = concurrencyHistory.some(c => c === CONCURRENCY);
    expect(reachedCap).toBe(true);
  }, 15_000);

  it('survives a "crash" mid-burst — orphans requeue on restart', async () => {
    const N = 30;
    const CONCURRENCY = 5;

    const eventId = db.appendEvent({ project: 'arena', source: 'burst', kind: 'test', payload: {} });
    for (let i = 0; i < N; i++) db.enqueueTask({ ruleId: `rule-${i}`, eventId });

    // Pool 1 — slow jobs so we can interrupt mid-flight
    pool = createWorkerPool({
      db,
      concurrency: CONCURRENCY,
      pollIntervalMs: 5,
      logger: silentLogger,
      jobRunner: async () => { await sleep(50); return { outcome: 'success' }; },
    });
    pool.start();

    // Wait until we have CONCURRENCY tasks claimed but not yet done
    await waitFor(() => pool.status().inFlight === CONCURRENCY);

    // Simulate a crash by stopping WITHOUT draining (drainMs:0).
    // That leaves CONCURRENCY tasks in started_at-set/completed_at-null state.
    await pool.stop({ drainMs: 0 });
    pool = null;

    // Confirm orphans exist
    const inFlightBefore = db.queueDepth().inFlight;
    expect(inFlightBefore).toBeGreaterThan(0);

    // Pool 2 — fast jobs. start() should requeue the orphans.
    pool = createWorkerPool({
      db,
      concurrency: CONCURRENCY,
      pollIntervalMs: 5,
      logger: silentLogger,
      jobRunner: async () => { await sleep(5); return { outcome: 'success' }; },
    });
    pool.start();

    // Wait for the entire backlog to drain (orphans + remaining queued)
    await waitFor(() => db.queueDepth().queued === 0 && db.queueDepth().inFlight === 0, { timeoutMs: 10_000 });

    // Acceptance: every task eventually completed
    const completed = db.raw.prepare('SELECT COUNT(*) AS n FROM tasks WHERE completed_at IS NOT NULL').get().n;
    expect(completed).toBe(N);
  }, 20_000);

  it('rejects no events — every event lands in the events table', async () => {
    const N = 100;
    for (let i = 0; i < N; i++) {
      db.appendEvent({
        project: 'arena',
        source: 'chokidar',
        kind: 'file-changed',
        payload: { event: 'add', path: `recommendations/foo-${i}.json` },
      });
    }
    expect(db.countUnprocessed()).toBe(N);
    const recent = db.recentEvents('arena', N);
    expect(recent).toHaveLength(N);
  });
});
