const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');

const { Registry } = require('./registry');
const { SessionWatcher } = require('./session-watcher');
const { scanTopic } = require('./topic-scanner');

const DEFAULT_MAX_RESTORE_FAILURES = 3;
const DEFAULT_DORMANT_TTL_MS = 14 * 24 * 3600 * 1000;
const RESTORE_STAGGER_MS = 250;

function normalizeCwd(cwd) {
  return typeof cwd === 'string' ? cwd.replace(/\\/g, '/') : cwd;
}

/**
 * SpawnResult — what a SpawnAdapter returns when it successfully starts a PTY.
 *
 * @typedef {Object} SpawnResult
 * @property {string} scopeId
 *   Unique identifier for the live PTY, assigned by the adapter. Every live PTY
 *   must have a distinct scopeId. A resumed tab MAY reuse a previously-seen
 *   scopeId if the adapter chooses — the tracker stores whatever the adapter
 *   returns and does not enforce scopeId uniqueness across time.
 * @property {number|null} pid
 *   OS process id of the spawned `claude` CLI, if the adapter has it. MAY be
 *   `null` if the adapter doesn't expose pid (e.g. the spawn was queued and not
 *   yet materialized, or the underlying transport hides pids).
 *
 * SpawnAdapter — the contract SessionTracker needs from whatever spawns PTYs.
 * Typically wraps node-pty or a similar transport; the tracker never spawns
 * processes itself.
 *
 * spawn() contract:
 *   - MUST return a Promise that resolves to a SpawnResult on success.
 *   - MUST reject (not resolve with a sentinel) on failure. autoRestore relies
 *     on rejection to increment restoreFailureCount and eventually quarantine
 *     a tab that fails maxRestoreFailures times in a row.
 *   - When `resume: true`, `sessionId` MUST be a non-empty string. The adapter
 *     is responsible for passing `--resume <sessionId>` to the claude CLI.
 *   - When `resume: false` (or omitted), `sessionId` MAY be null. The adapter
 *     spawns a fresh claude session. The tracker does not currently call spawn
 *     with `resume: false` from any internal code path — this mode exists for
 *     future callers (e.g. a "new tab" IPC) that want to reuse the adapter.
 *
 * @typedef {Object} SpawnAdapter
 * @property {(opts: { cwd: string, sessionId?: string|null, resume?: boolean }) => Promise<SpawnResult>} spawn
 */

class SessionTracker extends EventEmitter {
  /**
   * @param {{
   *   registryPath: string,
   *   claudeProjectsDir: string,
   *   adapter: SpawnAdapter,
   *   maxRestoreFailures?: number,
   *   dormantTtlMs?: number,
   *   now?: () => number,
   *   logger?: { log: Function, warn: Function, error: Function },
   * }} opts
   */
  constructor(opts) {
    super();
    if (!opts) throw new Error('SessionTracker: opts required');
    if (!opts.registryPath) throw new Error('SessionTracker: registryPath required');
    if (!opts.claudeProjectsDir) throw new Error('SessionTracker: claudeProjectsDir required');
    if (!opts.adapter || typeof opts.adapter.spawn !== 'function') {
      throw new Error('SessionTracker: adapter with spawn() required');
    }

    this.registry = new Registry(opts.registryPath);
    this.watcher = new SessionWatcher(opts.claudeProjectsDir);
    this.adapter = opts.adapter;
    this.maxRestoreFailures = opts.maxRestoreFailures ?? DEFAULT_MAX_RESTORE_FAILURES;
    this.dormantTtlMs = opts.dormantTtlMs ?? DEFAULT_DORMANT_TTL_MS;
    this.now = opts.now ?? Date.now;
    this.logger = opts.logger ?? console;

    /** @type {Map<string, number>} scopeId -> spawnAt */
    this.pendingSpawns = new Map();

    /** @type {Set<string>} tabIds currently being spawned by autoRestore (in-flight guard) */
    this._restoringTabs = new Set();

    this._onSessionFile = (event) => this._handleSessionFile(event);
  }

  async init() {
    await this.registry.load();

    const now = this.now();
    const kept = [];

    for (const tab of this.registry.list()) {
      // Drop sessionId=null records: we never learned their Claude UUID,
      // so `claude --resume <uuid>` is impossible. Not recoverable.
      if (tab.sessionId === null || tab.sessionId === undefined) {
        continue;
      }

      // Prune dormant records older than TTL.
      if (tab.status === 'dormant' && (now - (tab.lastActivityAt ?? 0)) > this.dormantTtlMs) {
        continue;
      }

      // Migrate older-format records with backslashed cwd to forward slashes
      // so watcher-bind comparison succeeds on the next jsonl event.
      const migrated = { ...tab, cwd: normalizeCwd(tab.cwd) };

      // Any active record must be dormant now — the process that owned it
      // is gone (we just started). Clear pid + scopeId.
      if (migrated.status === 'active') {
        kept.push({ ...migrated, status: 'dormant', pid: null, scopeId: null });
      } else {
        kept.push(migrated);
      }
    }

    // Rewrite registry state from the filtered/flipped list.
    this.registry.tabs = kept;
    await this.registry.save();

    this.watcher.on('sessionFile', this._onSessionFile);
    try {
      await this.watcher.start();
    } catch (err) {
      this.logger.error?.('[SessionTracker] watcher failed to start:', err);
      // Don't throw — tracker is still usable for record/close/autoRestore.
    }
  }

  async autoRestore() {
    const results = [];
    const candidates = this.registry.list().filter(t =>
      t.sessionId !== null &&
      t.sessionId !== undefined &&
      (t.restoreFailureCount ?? 0) < this.maxRestoreFailures
    );

    for (let i = 0; i < candidates.length; i++) {
      if (i > 0) {
        await new Promise(r => setTimeout(r, RESTORE_STAGGER_MS));
      }
      const tab = candidates[i];
      this._restoringTabs.add(tab.id);
      try {
        const { scopeId, pid } = await this.adapter.spawn({
          cwd: tab.cwd,
          sessionId: tab.sessionId,
          resume: true,
        });
        const updated = {
          ...tab,
          scopeId,
          pid,
          status: 'active',
          restoreFailureCount: 0,
          lastActivityAt: this.now(),
        };
        this.registry.upsert(updated);
        this.emit('change');
        results.push({ tabId: tab.id, ok: true });
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        const updated = {
          ...tab,
          restoreFailureCount: (tab.restoreFailureCount ?? 0) + 1,
        };
        this.registry.upsert(updated);
        this.emit('change');
        this.logger.warn?.(`[SessionTracker] restore failed for ${tab.id}: ${msg}`);
        results.push({ tabId: tab.id, ok: false, error: msg });
      } finally {
        this._restoringTabs.delete(tab.id);
      }
    }

    try { await this.registry.save(); }
    catch (err) { this.logger.error?.('[SessionTracker] save after autoRestore failed:', err); }

    return results;
  }

  /**
   * @param {{ cwd: string, scopeId: string, pid: number|null, agentSlug?: string|null, projectSlug?: string|null }} opts
   * @returns {import('./types').TabRecord}
   */
  recordPendingSpawn(opts) {
    let { cwd, scopeId, pid, agentSlug = null, projectSlug = null } = opts;
    cwd = normalizeCwd(cwd);
    const now = this.now();

    let tab = this.registry.list().find(t => t.scopeId === scopeId);
    if (tab) {
      // Merge agentSlug/projectSlug but do not overwrite an existing value with null.
      const mergedAgent = agentSlug ?? tab.agentSlug ?? null;
      const mergedProject = projectSlug ?? tab.projectSlug ?? null;
      tab = {
        ...tab,
        pid,
        status: 'active',
        lastActivityAt: now,
        agentSlug: mergedAgent,
        projectSlug: mergedProject,
      };
      this.registry.upsert(tab);
    } else {
      tab = {
        id: randomUUID(),
        sessionId: null,
        cwd,
        pid,
        status: 'active',
        label: '(new session)',
        createdAt: now,
        lastActivityAt: now,
        scopeId,
        restoreFailureCount: 0,
        agentSlug: agentSlug ?? null,
        projectSlug: projectSlug ?? null,
      };
      this.registry.upsert(tab);
    }

    this.pendingSpawns.set(scopeId, now);

    this.registry.save().catch(err => {
      this.logger.error?.('[SessionTracker] save in recordPendingSpawn failed:', err);
    });
    this.emit('change');
    return tab;
  }

  async _handleSessionFile(event) {
    const { cwd, sessionId, path: jsonlPath, mtimeMs } = event;
    const tabs = this.registry.list();

    // First pass: try to bind an as-yet-unbound tab in the same cwd whose
    // pending-spawn timestamp predates this file's mtime.
    for (const tab of tabs) {
      if (tab.sessionId !== null && tab.sessionId !== undefined) continue;
      if (normalizeCwd(tab.cwd) !== cwd) continue;
      const spawnAt = tab.scopeId ? this.pendingSpawns.get(tab.scopeId) : undefined;
      if (spawnAt === undefined) continue;
      if (spawnAt > mtimeMs) continue;

      // Synthesize a nicer label from agent/project when we captured them at
      // spawn time; fall back to the jsonl topic scan only if neither is set.
      const synthesized = this._synthesizeLabel(tab);
      const label = synthesized || (await scanTopic(jsonlPath)) || '(new session)';
      const updated = { ...tab, sessionId, label, lastActivityAt: this.now() };
      this.registry.upsert(updated);
      if (tab.scopeId) this.pendingSpawns.delete(tab.scopeId);
      try { await this.registry.save(); }
      catch (err) { this.logger.error?.('[SessionTracker] save after bind failed:', err); }
      this.emit('change');
      return;
    }

    // Second pass: an already-bound tab is receiving updates.
    for (const tab of tabs) {
      if (tab.sessionId === sessionId) {
        // Do not overwrite a synthesized (agent/project-based) label — that was
        // captured at spawn and is more stable than a scanned topic.
        const hasSynthesized = !!(tab.agentSlug || tab.projectSlug);
        const label = hasSynthesized
          ? tab.label
          : (await scanTopic(jsonlPath)) || tab.label;
        const updated = { ...tab, label, lastActivityAt: this.now() };
        this.registry.upsert(updated);
        try { await this.registry.save(); }
        catch (err) { this.logger.error?.('[SessionTracker] save after update failed:', err); }
        this.emit('change');
        return;
      }
    }
  }

  /**
   * Build a "<agent> @ <project>" label from spawn-time metadata, falling back
   * to whichever slug is set. Returns null when neither is available.
   * @param {{ agentSlug?: string|null, projectSlug?: string|null }} tab
   * @returns {string|null}
   */
  _synthesizeLabel(tab) {
    const a = tab.agentSlug || null;
    const p = tab.projectSlug || null;
    if (a && p) return `${a} @ ${p}`;
    if (a) return a;
    if (p) return p;
    return null;
  }

  markDormant(scopeId) {
    const tab = this.registry.list().find(t => t.scopeId === scopeId);
    if (!tab) {
      this.logger.log?.(`[SessionTracker] markDormant: no tab for scopeId ${scopeId}`);
      return;
    }
    // Unbound tabs (no sessionId ever discovered) are not resumable — drop them.
    if (!tab.sessionId) {
      this.registry.remove(tab.id);
    } else {
      this.registry.upsert({ ...tab, pid: null, status: 'dormant', scopeId: null });
    }
    this.pendingSpawns.delete(scopeId);
    this.registry.save().catch(err => {
      this.logger.error?.('[SessionTracker] save in markDormant failed:', err);
    });
    this.emit('change');
  }

  async closeTab(tabId) {
    const tab = this.registry.get(tabId);
    if (tab && tab.scopeId) this.pendingSpawns.delete(tab.scopeId);
    this.registry.remove(tabId);
    try { await this.registry.save(); }
    catch (err) { this.logger.error?.('[SessionTracker] save in closeTab failed:', err); }
    this.emit('change');
  }

  /**
   * Remove the tab that currently owns the given scopeId, if any.
   * No-op when the scopeId is unknown — e.g. a tool terminal the tracker
   * never recorded, or a scope that was already marked dormant.
   * @param {string} scopeId
   */
  async closeByScopeId(scopeId) {
    const tab = this.registry.list().find(t => t.scopeId === scopeId);
    if (tab) return this.closeTab(tab.id);
    // no-op when scope is unknown (e.g. a tool terminal we didn't track)
  }

  list() { return this.registry.list(); }

  /**
   * Returns true while an autoRestore iteration is currently calling adapter.spawn
   * for this tabId. Used by the RESUME IPC handler to reject duplicate spawn
   * attempts during startup restore.
   * @param {string} tabId
   */
  isRestoring(tabId) { return this._restoringTabs.has(tabId); }

  async shutdown() {
    try { await this.watcher.stop(); } catch {}
    try { await this.registry.save(); } catch {}
  }
}

module.exports = { SessionTracker };
