// Studio Steward — daemon entry point.
//
// Spawned via child_process.fork from electron/main.cjs. Communicates
// with the parent via process.send / process.on('message').
//
// Phase 1 — heartbeat + event ack + control surface (live)
// Phase 2 — SQLite event log + worker pool with stub jobRunner (live)
// Phase 3 — reactor rules + first rule wired into pool jobRunner (forthcoming)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig } from './config.js';
import { openDb } from './db/index.js';
import { createWorkerPool } from './worker/pool.js';
import { matchRules, enqueueMatches, makeJobRunner, getRules } from './reactor.js';
import { isOnNightshiftBranch } from './supervisor.js';
import { startAgentTodosWatcher } from './agent-todos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = process.env.STEWARD_DATA_DIR
  || path.resolve(__dirname, '..', '..', 'hq-data');
const configPath = path.join(dataDir, '.steward', 'config.json');
const dbPath = path.join(dataDir, '.steward', 'events.db');

const config = loadConfig(configPath);
const startedAt = Date.now();
let lastEventAt = null;

// ────────────────────────────────────────────────────────────────────────────
// SQLite event log

let db;
try {
  db = openDb(dbPath);
} catch (err) {
  // If SQLite fails (e.g. native binary mismatch under Electron), the
  // Steward should still come up in degraded mode — Phase 1 functionality
  // (heartbeat + event ack) keeps working.
  console.error('[Steward] openDb failed; running in Phase-1-only degraded mode:', err?.message || err);
}

// ────────────────────────────────────────────────────────────────────────────
// Worker pool — Phase 3 wires the reactor's jobRunner so tasks are dispatched
// to their built-in rule handlers (rec-resolved-update-history et al).

let pool;
if (db) {
  try {
    pool = createWorkerPool({
      db,
      jobRunner: makeJobRunner({ db, dataDir }),
      concurrency: config.concurrency,
      logger: console,
    });
    pool.start();
  } catch (err) {
    console.error('[Steward] worker pool start failed:', err?.message || err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Agent-todos watcher (Phase 4 — agent substep tracking)
//
// Narrow chokidar watcher scoped to hq-data/.steward/agent-todos/*.jsonl.
// Cannot reuse main.cjs's chokidar — that one explicitly ignores .steward/.
// The watcher result is stored so buildStatus() can call agentTodosWatcher.buildRollup().
//
// v1: aliveSessionIds is () => new Set() because main.cjs is the source of
// truth for which PTY scopes are alive. We emit steward:auto-resume with
// { sessionId, env } and main.cjs checks sessionTracker.isAlive() before
// re-spawning, keeping the two processes loosely coupled.

let agentTodosWatcher;
if (!process.env.COE_AGENT_TODOS_DISABLE) {
  try {
    agentTodosWatcher = startAgentTodosWatcher({
      dataDir,
      send: (eventName, payload) => safeSend({ type: eventName, ...payload }),
      aliveSessionIds: () => new Set(), // v1: main.cjs handles alive-check
    });
  } catch (err) {
    console.error('[Steward] agentTodosWatcher failed to start:', err?.message || err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Event ingestion (Phase 1 counters + Phase 2 db persistence)

const eventCounters = {
  'hq:file-changed': 0,
  'automation:git-change': 0,
  'terminal:exit': 0,
  'coe:rec-status-changed': 0,
};

function persistEvent(type, payload) {
  if (!db) return null;
  // Try to extract a project slug from the payload — the reactor needs this
  // for project-scoped rules; we tolerate "unknown" if absent.
  const project = inferProject(type, payload) || 'unknown';
  // Map IPC type → (source, kind) tuple
  const { source, kind } = decomposeType(type);
  try {
    return db.appendEvent({ project, source, kind, payload });
  } catch (err) {
    console.error('[Steward] appendEvent failed:', err?.message || err);
    return null;
  }
}

function decomposeType(type) {
  // 'hq:file-changed' → { source: 'hq', kind: 'file-changed' }
  const idx = type.indexOf(':');
  if (idx < 0) return { source: 'unknown', kind: type };
  return { source: type.slice(0, idx), kind: type.slice(idx + 1) };
}

function inferProject(type, payload) {
  if (!payload) return null;
  if (payload.project) return payload.project;
  if (payload.slug) return payload.slug;
  if (typeof payload.path === 'string') {
    // hq:file-changed payload.path is relative to hq-data, e.g.
    // 'projects/arena/recommendations/foo.json'
    const m = payload.path.match(/^projects\/([^/]+)\//);
    if (m) return m[1];
  }
  if (typeof payload.repoPath === 'string') {
    // automation:git-change uses repoPath; slug already in payload
    return payload.slug || null;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Status

function buildStatus({ includeActions = true, actionsLimit = 10, failedLimit = 5 } = {}) {
  let depth = { queued: 0, inFlight: 0 };
  let unprocessed = 0;
  let failedCount = 0;
  let recentActions = [];
  let failedTasks = [];
  let poolStatus = null;
  if (db) {
    try { depth = db.queueDepth(); unprocessed = db.countUnprocessed(); } catch {}
    try { failedCount = db.countFailed(); } catch {}
    if (includeActions) {
      try { recentActions = db.recentActions(actionsLimit); } catch {}
      try { failedTasks = db.failedTasks(failedLimit); } catch {}
    }
  }
  if (pool) {
    try { poolStatus = pool.status(); } catch {}
  }
  // Build agent-todos rollup (also runs the archive job).
  // Returns { byParent, orphans, untethered } per spec §5.2.
  let agentTodos = null;
  if (agentTodosWatcher) {
    try { agentTodos = agentTodosWatcher.buildRollup(); } catch {}
  }

  return {
    type: 'steward:status',
    healthy: true,
    pid: process.pid,
    uptimeMs: Date.now() - startedAt,
    queueDepth: depth.queued + depth.inFlight,
    unprocessedEvents: unprocessed,
    failedCount,
    recentActions,
    failedTasks,
    eventCounters: { ...eventCounters },
    lastEventAgoMs: lastEventAt ? Date.now() - lastEventAt : null,
    pool: poolStatus,
    db: db ? { open: true, path: dbPath, schemaVersion: db.schemaVersion?.() } : { open: false },
    config: {
      enabled: config.enabled,
      concurrency: config.concurrency,
      paused: [...config.paused],
      confidenceThreshold: config.confidenceThreshold,
    },
    agentTodos,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Control surface

function handleControl(payload) {
  if (!payload || typeof payload !== 'object') return;
  switch (payload.action) {
    case 'getStatus':
      safeSend(buildStatus());
      break;
    case 'pause':
      if (payload.project && !config.paused.includes(payload.project)) {
        config.paused.push(payload.project);
        saveConfig(configPath, config);
      }
      safeSend({ type: 'steward:control-ack', action: 'pause', project: payload.project });
      break;
    case 'resume':
      if (payload.project) {
        config.paused = config.paused.filter(p => p !== payload.project);
        saveConfig(configPath, config);
      }
      safeSend({ type: 'steward:control-ack', action: 'resume', project: payload.project });
      break;
    case 'enable':
      config.enabled = true;
      saveConfig(configPath, config);
      safeSend({ type: 'steward:control-ack', action: 'enable' });
      break;
    case 'disable':
      config.enabled = false;
      saveConfig(configPath, config);
      safeSend({ type: 'steward:control-ack', action: 'disable' });
      break;
    case 'reload': {
      // Triggers supervisor restart (which loads any new code)
      safeSend({ type: 'steward:control-ack', action: 'reload', message: 'exiting for restart' });
      // Drain the pool first so in-flight tasks don't get orphaned (requeueOrphans
      // catches them on next start anyway, but a clean drain is nicer)
      drainAndExit();
      break;
    }
    case 'retry-task': {
      // Re-queue a previously-completed task so the worker pool picks it up.
      // Used by the dashboard's "retry" button on failed actions.
      if (!db) {
        safeSend({ type: 'steward:control-ack', action: 'retry-task', error: 'db not open' });
        break;
      }
      try {
        const ok = db.retryTask(payload.taskId);
        if (ok && pool) pool.signal();
        safeSend({ type: 'steward:control-ack', action: 'retry-task', taskId: payload.taskId, requeued: ok });
      } catch (err) {
        safeSend({ type: 'steward:control-ack', action: 'retry-task', error: err?.message });
      }
      break;
    }
    case 'list-rules': {
      // Snapshot of registered rules (built-in for now; Phase 5+ adds .md rules).
      const rules = getRules().map(r => ({
        id: r.id,
        priority: r.priority,
        description: r.description,
        trigger: { source: r.trigger?.source, kind: r.trigger?.kind },
      }));
      safeSend({ type: 'steward:rules', rules });
      break;
    }
    case 'seed-prd': {
      // Manually trigger the prd-maintain-on-history-change rule for a project,
      // useful for "Generate PRD" buttons in the dashboard. We do this by
      // synthesizing a chokidar-style event on history.json (the rule's
      // primary trigger) and enqueueing the task directly under that rule.
      if (!db) {
        safeSend({ type: 'steward:control-ack', action: 'seed-prd', error: 'db not open' });
        break;
      }
      const project = payload.project;
      if (!project) {
        safeSend({ type: 'steward:control-ack', action: 'seed-prd', error: 'project slug required' });
        break;
      }
      try {
        const eventId = db.appendEvent({
          project,
          source: 'hq',
          kind: 'file-changed',
          payload: { event: 'change', path: `projects/${project}/history.json` },
        });
        const taskId = db.enqueueTask({ ruleId: 'prd-maintain-on-history-change', eventId });
        if (pool) pool.signal();
        safeSend({ type: 'steward:control-ack', action: 'seed-prd', project, taskId, eventId });
      } catch (err) {
        safeSend({ type: 'steward:control-ack', action: 'seed-prd', error: err?.message });
      }
      break;
    }
    case 'enqueue-test-task': {
      // Manual trigger for Phase 2 verification: enqueue a no-op task that
      // the worker pool will process via the stub jobRunner.
      if (!db) {
        safeSend({ type: 'steward:control-ack', action: 'enqueue-test-task', error: 'db not open' });
        break;
      }
      try {
        const eventId = db.appendEvent({
          project: payload.project || 'test',
          source: 'manual',
          kind: 'test-task',
          payload: payload.body || {},
        });
        const taskId = db.enqueueTask({ ruleId: 'manual-test', eventId });
        if (pool) pool.signal();
        safeSend({ type: 'steward:control-ack', action: 'enqueue-test-task', taskId, eventId });
      } catch (err) {
        safeSend({ type: 'steward:control-ack', action: 'enqueue-test-task', error: err?.message });
      }
      break;
    }
    default:
      break;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// IPC + heartbeat

function safeSend(msg) {
  if (typeof process.send !== 'function') return;
  // process.connected is the cleanest pre-check; without it, process.send
  // can emit an async 'error' event (ERR_IPC_CHANNEL_CLOSED) that bypasses
  // the try/catch and crashes the daemon during shutdown.
  if (process.connected === false) return;
  try { process.send(msg); } catch { /* parent gone */ }
}

// Keep the process from crashing if Node still emits an async 'error' on
// the IPC channel after we've started shutdown (race between disconnect
// handler and an in-flight send).
process.on('error', (err) => {
  if (err && (err.code === 'ERR_IPC_CHANNEL_CLOSED' || err.code === 'EPIPE')) return;
  console.error('[Steward] uncaught process error:', err);
});

process.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;
  const { type, payload } = msg;

  if (type === 'steward:control') {
    handleControl(payload);
    return;
  }

  // ── Manual archive-orphan (Dashboard "Dismiss" button) ─────────────────────
  // main.cjs forwards steward:archive-orphan-request → we call archiveSession.
  if (type === 'steward:archive-orphan-request') {
    const { sessionId } = msg;
    if (agentTodosWatcher && typeof agentTodosWatcher.archiveSession === 'function') {
      agentTodosWatcher.archiveSession(sessionId);
      // Emit a fresh status so the dashboard reflects the removal.
      safeSend(buildStatus());
    }
    return;
  }

  if (Object.prototype.hasOwnProperty.call(eventCounters, type)) {
    eventCounters[type] += 1;
    lastEventAt = Date.now();
    const eventId = persistEvent(type, payload);

    // Phase 3 reactor: match rules against the persisted event + enqueue.
    // Skipped when the project is paused (per-project pause list).
    let enqueued = [];
    if (db && eventId) {
      const project = inferProject(type, payload);
      const projectPaused = project && config.paused.includes(project);
      // Defense-in-depth: also pause when CoE's HEAD is on a nightshift/* branch,
      // even if the foreman didn't write paused-by:nightshift to config.
      const onNightshift = isOnNightshiftBranch(dataDir);
      if (!projectPaused && !onNightshift) {
        const event = db.getEvent(eventId);
        const matched = matchRules(event);
        if (matched.length > 0) {
          enqueued = enqueueMatches({ db, eventId, matchedRules: matched });
          // Wake the pool immediately so we don't wait for the next poll
          if (pool) pool.signal();
        }
      }
    }

    safeSend({
      type: 'steward:event-ack',
      eventType: type,
      total: eventCounters[type],
      queuedAt: lastEventAt,
      eventId,
      enqueuedTasks: enqueued.map(t => ({ id: t.id, ruleId: t.ruleId })),
    });
  }
});

const heartbeatTimer = setInterval(() => safeSend(buildStatus()), config.heartbeatIntervalMs);

// ────────────────────────────────────────────────────────────────────────────
// Shutdown

let isShuttingDown = false;
async function drainAndExit(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  clearInterval(heartbeatTimer);
  safeSend({ type: 'steward:shutdown', pid: process.pid, signal });
  if (agentTodosWatcher) {
    try { agentTodosWatcher.stop(); } catch {}
  }
  if (pool) {
    try { await pool.stop({ drainMs: 3000 }); } catch {}
  }
  if (db) {
    try { db.close(); } catch {}
  }
  setTimeout(() => process.exit(0), 50);
}
process.on('SIGTERM', () => drainAndExit('SIGTERM'));
process.on('SIGINT', () => drainAndExit('SIGINT'));
process.on('disconnect', () => drainAndExit('disconnect'));

// Initial ready + status
safeSend({
  type: 'steward:ready',
  pid: process.pid,
  configEnabled: config.enabled,
  dbOpen: !!db,
  poolRunning: !!pool,
});
safeSend(buildStatus());
