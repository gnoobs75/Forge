/* @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index.js';
import { ulid } from '../db/ulid.js';

describe('steward/db', () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-db-'));
    db = openDb(path.join(tmpDir, 'events.db'));
  });

  afterEach(() => {
    db?.close();
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes with schema version 1', () => {
    expect(db.schemaVersion()).toBe('1');
  });

  it('appendEvent persists with parsed payload roundtrip', () => {
    const id = db.appendEvent({
      project: 'arena',
      source: 'chokidar',
      kind: 'file-changed',
      payload: { event: 'add', path: 'recommendations/foo.json' },
    });
    expect(id).toMatch(/^evt_[0-9A-Z]{26}$/);
    const got = db.getEvent(id);
    expect(got.project).toBe('arena');
    expect(got.payload.path).toBe('recommendations/foo.json');
    expect(got.processed_at).toBeNull();
  });

  it('countUnprocessed and markProcessed flow', () => {
    db.appendEvent({ project: 'a', source: 'x', kind: 'y', payload: {} });
    const id2 = db.appendEvent({ project: 'a', source: 'x', kind: 'y', payload: {} });
    expect(db.countUnprocessed()).toBe(2);
    db.markProcessed(id2, 'matched');
    expect(db.countUnprocessed()).toBe(1);
    expect(db.getEvent(id2).outcome).toBe('matched');
    expect(db.getEvent(id2).processed_at).toMatch(/T/);
  });

  it('listUnprocessed returns oldest-first up to limit', () => {
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const id = db.appendEvent({ project: 'a', source: 's', kind: 'k', payload: { i } });
      ids.push(id);
      // Stagger timestamps explicitly so SQLite-ms collisions don't reorder
      db.raw.prepare(`UPDATE events SET ts=? WHERE id=?`).run(`2026-01-01T00:00:0${i}.000Z`, id);
    }
    const got = db.listUnprocessed(3);
    expect(got.map(e => e.payload.i)).toEqual([0, 1, 2]);
  });

  it('task lifecycle: enqueue → claim → complete', () => {
    const eventId = db.appendEvent({ project: 'a', source: 's', kind: 'k', payload: {} });
    const taskId = db.enqueueTask({ ruleId: 'rec-resolved-update-history', eventId });
    expect(db.queueDepth()).toEqual({ queued: 1, inFlight: 0 });

    const claimed = db.claimNextTask();
    expect(claimed.id).toBe(taskId);
    expect(claimed.started_at).toMatch(/T/);
    expect(db.queueDepth()).toEqual({ queued: 0, inFlight: 1 });

    db.completeTask({ taskId, outcome: 'success', output: 'done' });
    expect(db.queueDepth()).toEqual({ queued: 0, inFlight: 0 });
    const final = db.getTask(taskId);
    expect(final.outcome).toBe('success');
    expect(final.output).toBe('done');
    expect(final.completed_at).toMatch(/T/);
  });

  it('claimNextTask returns null when queue empty', () => {
    expect(db.claimNextTask()).toBeNull();
  });

  it('claimNextTask processes oldest first', () => {
    const eventId = db.appendEvent({ project: 'a', source: 's', kind: 'k', payload: {} });
    const t1 = db.enqueueTask({ ruleId: 'r1', eventId });
    const t2 = db.enqueueTask({ ruleId: 'r2', eventId });
    const t3 = db.enqueueTask({ ruleId: 'r3', eventId });
    expect(db.claimNextTask().id).toBe(t1);
    expect(db.claimNextTask().id).toBe(t2);
    expect(db.claimNextTask().id).toBe(t3);
    expect(db.claimNextTask()).toBeNull();
  });

  it('requeueOrphans resets in-flight tasks (crash recovery)', () => {
    const eventId = db.appendEvent({ project: 'a', source: 's', kind: 'k', payload: {} });
    const t1 = db.enqueueTask({ ruleId: 'r1', eventId });
    const t2 = db.enqueueTask({ ruleId: 'r2', eventId });
    db.claimNextTask(); // claims t1
    db.claimNextTask(); // claims t2
    expect(db.queueDepth()).toEqual({ queued: 0, inFlight: 2 });

    const requeued = db.requeueOrphans();
    expect(requeued).toBe(2);
    expect(db.queueDepth()).toEqual({ queued: 2, inFlight: 0 });
  });

  it('recentEvents filters by project and orders newest first', () => {
    const e1 = db.appendEvent({ project: 'arena', source: 's', kind: 'k', payload: { n: 1 } });
    const e2 = db.appendEvent({ project: 'expedition', source: 's', kind: 'k', payload: { n: 2 } });
    const e3 = db.appendEvent({ project: 'arena', source: 's', kind: 'k', payload: { n: 3 } });
    // Manually backfill ts so order is deterministic
    db.raw.prepare('UPDATE events SET ts=? WHERE id=?').run('2026-01-01T00:00:00Z', e1);
    db.raw.prepare('UPDATE events SET ts=? WHERE id=?').run('2026-01-02T00:00:00Z', e2);
    db.raw.prepare('UPDATE events SET ts=? WHERE id=?').run('2026-01-03T00:00:00Z', e3);

    const got = db.recentEvents('arena', 10);
    expect(got).toHaveLength(2);
    expect(got[0].payload.n).toBe(3);
    expect(got[1].payload.n).toBe(1);
  });

  it('survives reopen — durability check', () => {
    const dbPath = path.join(tmpDir, 'persistent.db');
    let d1 = openDb(dbPath);
    const eventId = d1.appendEvent({ project: 'a', source: 's', kind: 'k', payload: { hello: 'world' } });
    const taskId = d1.enqueueTask({ ruleId: 'r1', eventId });
    d1.close();

    const d2 = openDb(dbPath);
    expect(d2.getEvent(eventId).payload.hello).toBe('world');
    expect(d2.queueDepth().queued).toBe(1);
    expect(d2.getTask(taskId).rule_id).toBe('r1');
    d2.close();
  });
});

describe('steward/db — Phase 4 query helpers', () => {
  let tmpDir, db;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-db-p4-'));
    db = openDb(path.join(tmpDir, 'events.db'));
  });
  afterEach(() => {
    db?.close();
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function enqueueAndComplete({ ruleId, project, outcome, output, error }) {
    const eventId = db.appendEvent({ project, source: 'hq', kind: 'file-changed', payload: { path: 'x' } });
    const taskId = db.enqueueTask({ ruleId, eventId });
    db.claimNextTask();
    db.completeTask({ taskId, outcome, output, error });
    return { eventId, taskId };
  }

  it('recentActions joins tasks + events, newest first', () => {
    enqueueAndComplete({ ruleId: 'r1', project: 'arena', outcome: 'success', output: 'did it' });
    enqueueAndComplete({ ruleId: 'r2', project: 'expedition', outcome: 'success', output: 'and again' });
    enqueueAndComplete({ ruleId: 'r3', project: 'arena', outcome: 'skipped', output: 'nope' });
    const list = db.recentActions(10);
    expect(list).toHaveLength(3);
    // newest first — r3 was last completed
    expect(list[0].rule_id).toBe('r3');
    expect(list[0].project).toBe('arena');
    expect(list[0].outcome).toBe('skipped');
    expect(list[0].kind).toBe('file-changed');
    // payload is parsed JSON
    expect(list[0].payload.path).toBe('x');
  });

  it('failedTasks returns only error/timeout outcomes', () => {
    enqueueAndComplete({ ruleId: 'r1', project: 'arena', outcome: 'success' });
    enqueueAndComplete({ ruleId: 'r2', project: 'arena', outcome: 'error', error: 'boom' });
    enqueueAndComplete({ ruleId: 'r3', project: 'arena', outcome: 'timeout' });
    enqueueAndComplete({ ruleId: 'r4', project: 'arena', outcome: 'skipped' });
    const failed = db.failedTasks(10);
    expect(failed).toHaveLength(2);
    expect(failed.map(t => t.rule_id).sort()).toEqual(['r2', 'r3']);
  });

  it('countFailed counts only error+timeout tasks', () => {
    enqueueAndComplete({ ruleId: 'r1', project: 'arena', outcome: 'success' });
    enqueueAndComplete({ ruleId: 'r2', project: 'arena', outcome: 'error', error: 'boom' });
    enqueueAndComplete({ ruleId: 'r3', project: 'arena', outcome: 'error', error: 'boom' });
    enqueueAndComplete({ ruleId: 'r4', project: 'arena', outcome: 'skipped' });
    expect(db.countFailed()).toBe(2);
  });

  it('retryTask resets a completed task back to unclaimed', () => {
    const { taskId } = enqueueAndComplete({ ruleId: 'r1', project: 'arena', outcome: 'error', error: 'boom' });
    expect(db.queueDepth()).toEqual({ queued: 0, inFlight: 0 });
    expect(db.retryTask(taskId)).toBe(true);
    expect(db.queueDepth()).toEqual({ queued: 1, inFlight: 0 });
    const t = db.getTask(taskId);
    expect(t.completed_at).toBeNull();
    expect(t.outcome).toBeNull();
    expect(t.error).toBeNull();
    expect(t.started_at).toBeNull();
  });

  it('retryTask returns false for unknown taskId', () => {
    expect(db.retryTask('NOPE')).toBe(false);
  });
});

describe('steward/db/ulid', () => {
  it('generates 26-char Crockford base32 strings', () => {
    const id = ulid();
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('is monotonically sortable by time', () => {
    const a = ulid(1_000_000);
    const b = ulid(2_000_000);
    const c = ulid(3_000_000);
    expect([c, a, b].sort()).toEqual([a, b, c]);
  });

  it('produces unique values within the same ms', () => {
    const ids = new Set();
    const now = Date.now();
    for (let i = 0; i < 100; i++) ids.add(ulid(now));
    expect(ids.size).toBe(100);
  });
});
