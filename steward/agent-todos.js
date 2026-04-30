// agent-todos.js — Steward subprocess module for watching and rolling up
// agent-written JSONL substep files.
//
// See docs/plans/2026-04-29-agent-todos-design.md §6.2 for the full spec.
//
// ARCHITECTURE NOTE: This module creates a narrow chokidar watcher inside the
// Steward subprocess (not main.cjs). main.cjs's chokidar explicitly ignores
// `.steward/` to avoid SQLite WAL noise; this new watcher is scoped only to
// `hq-data/.steward/agent-todos/*.jsonl`.
//
// AUTO-RESUME DESIGN (v1): The Steward emits `steward:auto-resume` IPC to main
// when an orphan qualifies (recovery === 'auto'). Main.cjs is responsible for
// checking sessionTracker.isAlive(sessionId) before re-spawning — Steward does
// not need to know which sessions are alive. This avoids tight coupling across
// the IPC boundary. `aliveSessionIds` callback is a no-op () => new Set() for
// v1; the param is preserved for testability and v2 where we may pre-filter.

import fs from 'node:fs';
import path from 'node:path';
import chokidar from 'chokidar';

// ─────────────────────────────────────────────────────────────────────────────
// Pure functions (exported for testing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify an orphan by its age in seconds.
 * @param {number} ageSeconds
 * @returns {"auto" | "banner" | "archive"}
 */
export function classifyOrphan(ageSeconds) {
  if (ageSeconds < 300) return 'auto';          // < 5 min
  if (ageSeconds < 7 * 86400) return 'banner';  // 5 min – 7 d
  return 'archive';                              // > 7 d
}

/**
 * Replay an array of JSONL lines (strings) into a Map<id, currentState>.
 * Skips half-written / unparseable lines silently.
 * Applies actions: add → seed; update → merge; complete → status=completed;
 * cancel → status=cancelled + optional note.
 *
 * @param {string[]} lines
 * @returns {Map<string, object>}
 */
export function replayLines(lines) {
  const items = new Map();
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      // Half-written or corrupt line — skip silently per spec.
      continue;
    }
    if (!event || typeof event !== 'object') continue;
    const { action, id } = event;
    if (!id) continue;

    switch (action) {
      case 'add': {
        // Seed: merge with any existing state (in case of re-add after crash)
        const existing = items.get(id) || {};
        const next = { ...existing, ...event };
        // Default status to 'pending' if not specified
        if (!next.status) next.status = 'pending';
        items.set(id, next);
        break;
      }
      case 'update': {
        const existing = items.get(id) || {};
        items.set(id, { ...existing, ...event });
        break;
      }
      case 'complete': {
        const existing = items.get(id) || {};
        items.set(id, { ...existing, ...event, status: 'completed' });
        break;
      }
      case 'cancel': {
        const existing = items.get(id) || {};
        const next = { ...existing, ...event, status: 'cancelled' };
        items.set(id, next);
        break;
      }
      default:
        // Unknown action — skip silently
        break;
    }
  }
  return items;
}

/**
 * Build the §5.2 rollup from a Map<sessionId, sessionState>.
 * sessionState: { sessionId, parent, items: Map<id, obj>, lastWriteTs (seconds) }
 *
 * @param {Map<string, object>} sessions
 * @param {Set<string>} aliveSessionIds
 * @param {(now?: number) => number} nowFn - injectable for tests (returns ms)
 * @returns {{ byParent: object, orphans: array, untethered: array }}
 */
export function buildRollup(sessions, aliveSessionIds, nowFn = Date.now) {
  const byParent = {};
  const orphans = [];
  const untethered = [];

  const nowMs = nowFn();
  const nowSec = nowMs / 1000;

  for (const [sessionId, session] of sessions) {
    const { parent, items, lastWriteTs } = session;
    const isAlive = aliveSessionIds.has(sessionId);
    const ageSeconds = Math.max(0, Math.round(nowSec - lastWriteTs));

    // Flatten items map to array. Spec §5.2 names the per-item timestamp
    // field `lastTs`; replayLines stores it as `ts` (the event timestamp
    // of the most recent action that touched this id). Normalize here so
    // TodoPanel.jsx's relTime(sub.lastTs) renders the relative time line.
    const itemsArray = Array.from(items.values()).map(it => ({ ...it, lastTs: it.ts }));
    const openItems = itemsArray.filter(
      i => i.status === 'in_progress' || i.status === 'pending',
    );
    const inProgressCount = itemsArray.filter(i => i.status === 'in_progress').length;
    const pendingCount = itemsArray.filter(i => i.status === 'pending').length;

    // Determine the most recent title for display
    const lastTitle = itemsArray.length > 0
      ? (itemsArray[itemsArray.length - 1].title || null)
      : null;

    // ── ad-hoc sessions → untethered ─────────────────────────────────────────
    if (!parent || parent.kind === 'ad-hoc') {
      untethered.push({
        sessionId,
        openCount: openItems.length,
        lastTitle,
      });
      continue;
    }

    // ── tethered sessions → byParent ─────────────────────────────────────────
    const parentId = parent.id;
    if (parentId) {
      if (!byParent[parentId]) {
        byParent[parentId] = {
          project: parent.project,
          kind: parent.kind,
          items: [],
          openCount: 0,
        };
      }
      // Append items from this session; track openCount
      byParent[parentId].items.push(...itemsArray);
      byParent[parentId].openCount += openItems.length;
    }

    // ── orphan detection ─────────────────────────────────────────────────────
    // A session is an orphan when:
    //   - It is NOT alive (PTY not running)
    //   - It has at least one open item (in_progress or pending)
    if (!isAlive && openItems.length > 0) {
      const recovery = classifyOrphan(ageSeconds);
      orphans.push({
        parent,
        sessionId,
        lastWriteTs: new Date(lastWriteTs * 1000).toISOString(),
        ageSeconds,
        inProgress: inProgressCount,
        pending: pendingCount,
        lastTitle,
        recovery,
      });
    }
  }

  return { byParent, orphans, untethered };
}

// ─────────────────────────────────────────────────────────────────────────────
// Watcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize the agent-todos watcher.
 *
 * @param {object} opts
 * @param {string} opts.dataDir - hq-data/ root path
 * @param {(eventName: string, payload: object) => void} opts.send - IPC send fn
 * @param {() => Set<string>} [opts.aliveSessionIds] - returns alive session ids
 *   For v1, this can be () => new Set() — main.cjs does the real alive-check
 *   before re-spawning on steward:auto-resume.
 * @returns {{ stop: Function, buildRollup: Function, scanForArchive: Function }}
 */
export function startAgentTodosWatcher({
  dataDir,
  send,
  aliveSessionIds = () => new Set(),
}) {
  const todosDir = path.join(dataDir, '.steward', 'agent-todos');
  const archiveDir = path.join(todosDir, 'archive');

  // ── In-memory state ────────────────────────────────────────────────────────
  // Map<sessionId, { sessionId, parent, items: Map<id, obj>, lastWriteTs: number }>
  // lastWriteTs is seconds since epoch (matches fs.stat mtime).
  const sessions = new Map();

  // Track auto-resume sessionIds we've already fired in this boot cycle
  // (idempotency: don't emit the same auto-resume twice per session per run).
  const autoResumedThisBootCycle = new Set();

  // Track per-file byte offsets for incremental reads
  const fileOffsets = new Map(); // path → bytes-read so far

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Derive sessionId from a .jsonl file path. */
  function sessionIdFromPath(filePath) {
    return path.basename(filePath, '.jsonl');
  }

  /** Return true if file is in the archive subdir. */
  function isArchived(filePath) {
    const rel = path.relative(todosDir, filePath);
    return rel.startsWith('archive') || rel.startsWith('archive/');
  }

  /**
   * Read the tail of a file starting from offset bytes, updating the offset.
   * Returns the new lines as an array of strings.
   */
  function readTailLines(filePath) {
    let offset = fileOffsets.get(filePath) || 0;
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return [];
    }
    if (stat.size <= offset) return [];

    let fd;
    try {
      fd = fs.openSync(filePath, 'r');
      const toRead = stat.size - offset;
      const buf = Buffer.allocUnsafe(toRead);
      const bytesRead = fs.readSync(fd, buf, 0, toRead, offset);
      fileOffsets.set(filePath, offset + bytesRead);
      return buf.slice(0, bytesRead).toString('utf-8').split('\n');
    } catch {
      return [];
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch {}
      }
    }
  }

  /**
   * Full (re)load of a JSONL file — used on 'add' events and boot scan.
   * Resets the offset so the next incremental read starts from the end.
   */
  function fullLoadFile(filePath) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return;
    }
    const stat = fs.statSync(filePath);
    fileOffsets.set(filePath, stat.size);

    const sessionId = sessionIdFromPath(filePath);
    const lines = content.split('\n');
    const items = replayLines(lines);

    // Extract parent from the first parseable line that has one.
    let parent = { kind: 'ad-hoc', id: null, project: null };
    for (const raw of lines) {
      if (!raw.trim()) continue;
      try {
        const ev = JSON.parse(raw);
        if (ev?.parent?.kind) { parent = ev.parent; break; }
      } catch {}
    }

    sessions.set(sessionId, {
      sessionId,
      parent,
      items,
      lastWriteTs: stat.mtimeMs / 1000,
    });
  }

  /**
   * Incremental update for a JSONL file (chokidar 'change' event).
   * Only parses the tail bytes since the last read.
   */
  function incrementalUpdateFile(filePath) {
    const sessionId = sessionIdFromPath(filePath);
    const newLines = readTailLines(filePath);
    if (!newLines.length) return;

    let session = sessions.get(sessionId);
    if (!session) {
      // First time seeing this file — do a full load instead.
      fullLoadFile(filePath);
      return;
    }

    // Replay only the new lines, merging into existing items map.
    const newItems = replayLines(newLines);
    for (const [id, item] of newItems) {
      const existing = session.items.get(id) || {};
      session.items.set(id, { ...existing, ...item });
    }

    // Update lastWriteTs
    try {
      const stat = fs.statSync(filePath);
      session.lastWriteTs = stat.mtimeMs / 1000;
    } catch {}
  }

  /**
   * Archive files older than 7 days: mv to archive/, remove from sessions map.
   * Called on boot and once per heartbeat via buildRollup's caller.
   */
  function scanForArchive() {
    let files;
    try {
      files = fs.readdirSync(todosDir);
    } catch {
      return;
    }
    fs.mkdirSync(archiveDir, { recursive: true });

    const nowMs = Date.now();
    const sevenDaysMs = 7 * 86400 * 1000;

    for (const fname of files) {
      if (!fname.endsWith('.jsonl')) continue;
      const filePath = path.join(todosDir, fname);
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }
      const ageMs = nowMs - stat.mtimeMs;
      if (ageMs >= sevenDaysMs) {
        const dest = path.join(archiveDir, fname);
        try {
          fs.renameSync(filePath, dest);
          const sessionId = sessionIdFromPath(filePath);
          sessions.delete(sessionId);
          fileOffsets.delete(filePath);
        } catch {
          // File may be in use or already moved — skip silently
        }
      }
    }
  }

  /**
   * Fire steward:auto-resume for any qualifying orphans (recovery === 'auto'),
   * suppressing sessions already auto-resumed this boot cycle.
   */
  function maybeAutoResume() {
    const rollup = buildRollup(sessions, aliveSessionIds());
    for (const orphan of rollup.orphans) {
      if (orphan.recovery !== 'auto') continue;
      if (autoResumedThisBootCycle.has(orphan.sessionId)) continue;
      autoResumedThisBootCycle.add(orphan.sessionId);
      const env = {};
      if (orphan.parent?.id) {
        if (orphan.parent.kind === 'strategic-todo') {
          env.STEWARD_PARENT_TODO = orphan.parent.id;
        } else if (orphan.parent.kind === 'recommendation') {
          env.STEWARD_PARENT_REC = orphan.parent.id;
        }
      }
      if (orphan.parent?.project) env.STEWARD_PROJECT = orphan.parent.project;
      send('steward:auto-resume', { sessionId: orphan.sessionId, env });
    }
  }

  // ── Boot scan ──────────────────────────────────────────────────────────────

  // Ensure agent-todos dir exists before watching (chokidar needs the glob parent)
  fs.mkdirSync(todosDir, { recursive: true });
  fs.mkdirSync(archiveDir, { recursive: true });

  // Archive stale files before loading state.
  scanForArchive();

  // Full load of all remaining JSONL files.
  let existingFiles;
  try {
    existingFiles = fs.readdirSync(todosDir);
  } catch {
    existingFiles = [];
  }
  for (const fname of existingFiles) {
    if (!fname.endsWith('.jsonl')) continue;
    fullLoadFile(path.join(todosDir, fname));
  }

  // Fire auto-resume for any crash-fresh orphans found at boot.
  maybeAutoResume();

  // ── Chokidar watcher ───────────────────────────────────────────────────────

  const watcher = chokidar.watch(path.join(todosDir, '*.jsonl'), {
    persistent: false,
    ignoreInitial: true, // we already did the boot scan above
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  watcher.on('add', (filePath) => {
    if (isArchived(filePath)) return;
    fullLoadFile(filePath);
    maybeAutoResume();
  });

  watcher.on('change', (filePath) => {
    if (isArchived(filePath)) return;
    incrementalUpdateFile(filePath);
    // Intentionally do NOT auto-resume on change — only on boot scan and new
    // files. A change means the session is actively writing and not crashed.
  });

  watcher.on('unlink', (filePath) => {
    const sessionId = sessionIdFromPath(filePath);
    sessions.delete(sessionId);
    fileOffsets.delete(filePath);
  });

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    /**
     * Build and return the current §5.2 rollup shape.
     * Called by buildStatus() in index.js to populate agentTodos field.
     * Also runs the archive job (cheap — stat-only on stale files).
     */
    buildRollup() {
      scanForArchive();
      return buildRollup(sessions, aliveSessionIds());
    },

    /**
     * Manually archive a session by sessionId — used by the dashboard
     * "Dismiss" button (steward:archive-orphan IPC).
     * Moves the JSONL file to archive/ and drops it from the in-memory map.
     */
    archiveSession(sessionId) {
      if (!sessionId || typeof sessionId !== 'string') return;
      const filePath = path.join(todosDir, `${sessionId}.jsonl`);
      fs.mkdirSync(archiveDir, { recursive: true });
      const dest = path.join(archiveDir, `${sessionId}.jsonl`);
      try {
        fs.renameSync(filePath, dest);
      } catch {
        // File may not exist (already archived or never written) — that's fine.
      }
      sessions.delete(sessionId);
      fileOffsets.delete(filePath);
    },

    /**
     * Run the archive scan manually (exposed for testing).
     */
    scanForArchive,

    /**
     * Stop the chokidar watcher.
     */
    stop() {
      watcher.close().catch(() => {});
    },
  };
}
