// Studio Steward — SQLite event log + task queue.
//
// Wraps better-sqlite3. All queries are prepared statements; reads are
// synchronous (better-sqlite3 doesn't support async). Append-only for
// events; tasks lifecycle is enqueue → claim → complete.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ulid } from './ulid.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

export function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  // WAL mode = better concurrent read perf and crash safety
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Apply schema (idempotent — uses CREATE TABLE IF NOT EXISTS)
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  return wrap(db);
}

function wrap(db) {
  // Prepare statements once
  const stmts = {
    insertEvent: db.prepare(`
      INSERT INTO events (id, ts, project, source, kind, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    markProcessed: db.prepare(`
      UPDATE events SET processed_at = ?, outcome = ? WHERE id = ?
    `),
    countUnprocessed: db.prepare(`
      SELECT COUNT(*) AS n FROM events WHERE processed_at IS NULL
    `),
    listUnprocessed: db.prepare(`
      SELECT * FROM events WHERE processed_at IS NULL ORDER BY ts ASC LIMIT ?
    `),
    insertTask: db.prepare(`
      INSERT INTO tasks (id, rule_id, event_id, enqueued_at)
      VALUES (?, ?, ?, ?)
    `),
    claimNextTask: db.prepare(`
      UPDATE tasks
      SET started_at = ?, worker_pid = ?
      WHERE id = (
        SELECT id FROM tasks
        WHERE started_at IS NULL
        ORDER BY enqueued_at ASC
        LIMIT 1
      )
      RETURNING *
    `),
    completeTask: db.prepare(`
      UPDATE tasks
      SET completed_at = ?, outcome = ?, output = ?, error = ?
      WHERE id = ?
    `),
    requeueOrphans: db.prepare(`
      UPDATE tasks
      SET started_at = NULL, worker_pid = NULL
      WHERE started_at IS NOT NULL AND completed_at IS NULL
    `),
    countQueued: db.prepare(`
      SELECT COUNT(*) AS n FROM tasks WHERE started_at IS NULL
    `),
    countInFlight: db.prepare(`
      SELECT COUNT(*) AS n FROM tasks WHERE started_at IS NOT NULL AND completed_at IS NULL
    `),
    getTask: db.prepare(`
      SELECT * FROM tasks WHERE id = ?
    `),
    getEvent: db.prepare(`
      SELECT * FROM events WHERE id = ?
    `),
    recentEvents: db.prepare(`
      SELECT * FROM events WHERE project = ? ORDER BY ts DESC LIMIT ?
    `),
    schemaVersion: db.prepare(`
      SELECT value FROM schema_meta WHERE key = 'version'
    `),
    recentActions: db.prepare(`
      SELECT
        t.id            AS task_id,
        t.rule_id       AS rule_id,
        t.event_id      AS event_id,
        t.enqueued_at   AS enqueued_at,
        t.started_at    AS started_at,
        t.completed_at  AS completed_at,
        t.outcome       AS outcome,
        t.output        AS output,
        t.error         AS error,
        e.project       AS project,
        e.source        AS source,
        e.kind          AS kind,
        e.payload       AS payload,
        e.ts            AS event_ts
      FROM tasks t
      JOIN events e ON e.id = t.event_id
      WHERE t.completed_at IS NOT NULL
      ORDER BY t.completed_at DESC, t.rowid DESC
      LIMIT ?
    `),
    failedTasks: db.prepare(`
      SELECT
        t.id            AS task_id,
        t.rule_id       AS rule_id,
        t.event_id      AS event_id,
        t.enqueued_at   AS enqueued_at,
        t.completed_at  AS completed_at,
        t.error         AS error,
        e.project       AS project,
        e.source        AS source,
        e.kind          AS kind,
        e.payload       AS payload
      FROM tasks t
      JOIN events e ON e.id = t.event_id
      WHERE t.outcome IN ('error', 'timeout')
      ORDER BY t.completed_at DESC, t.rowid DESC
      LIMIT ?
    `),
    countFailed: db.prepare(`
      SELECT COUNT(*) AS n FROM tasks WHERE outcome IN ('error', 'timeout')
    `),
    clearTaskCompletion: db.prepare(`
      UPDATE tasks
      SET completed_at = NULL, outcome = NULL, output = NULL, error = NULL,
          started_at = NULL, worker_pid = NULL
      WHERE id = ?
    `),
  };

  return {
    raw: db,

    appendEvent({ project, source, kind, payload, ts = nowIso() }) {
      const id = `evt_${ulid()}`;
      const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
      stmts.insertEvent.run(id, ts, project, source, kind, payloadStr);
      return id;
    },

    markProcessed(eventId, outcome) {
      stmts.markProcessed.run(nowIso(), outcome, eventId);
    },

    countUnprocessed() {
      return stmts.countUnprocessed.get().n;
    },

    listUnprocessed(limit = 50) {
      return stmts.listUnprocessed.all(limit).map(parseEventRow);
    },

    enqueueTask({ ruleId, eventId }) {
      const id = ulid(); // == intent UUID; not prefixed so studioWrite() can use as-is
      stmts.insertTask.run(id, ruleId, eventId, nowIso());
      return id;
    },

    claimNextTask(workerPid = process.pid) {
      const row = stmts.claimNextTask.get(nowIso(), workerPid);
      return row ? parseTaskRow(row) : null;
    },

    completeTask({ taskId, outcome, output = null, error = null }) {
      stmts.completeTask.run(nowIso(), outcome, output, error, taskId);
    },

    requeueOrphans() {
      // Called on Steward startup — reset any tasks that were started but never
      // completed (probably because the previous Steward crashed mid-flight)
      const result = stmts.requeueOrphans.run();
      return result.changes;
    },

    queueDepth() {
      return {
        queued: stmts.countQueued.get().n,
        inFlight: stmts.countInFlight.get().n,
      };
    },

    getTask(taskId) {
      const row = stmts.getTask.get(taskId);
      return row ? parseTaskRow(row) : null;
    },

    getEvent(eventId) {
      const row = stmts.getEvent.get(eventId);
      return row ? parseEventRow(row) : null;
    },

    recentEvents(project, limit = 50) {
      return stmts.recentEvents.all(project, limit).map(parseEventRow);
    },

    schemaVersion() {
      return stmts.schemaVersion.get()?.value;
    },

    recentActions(limit = 50) {
      return stmts.recentActions.all(limit).map(parseTaskWithEventRow);
    },

    failedTasks(limit = 20) {
      return stmts.failedTasks.all(limit).map(parseTaskWithEventRow);
    },

    countFailed() {
      return stmts.countFailed.get().n;
    },

    /**
     * Re-queue a previously-completed task so the worker pool picks it up
     * again. Used by the dashboard's "retry" button on failed tasks.
     * Returns true if a row was reset.
     */
    retryTask(taskId) {
      const result = stmts.clearTaskCompletion.run(taskId);
      return result.changes > 0;
    },

    close() {
      db.close();
    },
  };
}

function parseTaskWithEventRow(row) {
  let payload = null;
  try { payload = JSON.parse(row.payload); } catch { payload = row.payload; }
  return { ...row, payload };
}

function parseEventRow(row) {
  let payload = null;
  try { payload = JSON.parse(row.payload); } catch { payload = row.payload; }
  return { ...row, payload };
}

function parseTaskRow(row) {
  return { ...row };
}

function nowIso() {
  return new Date().toISOString();
}
