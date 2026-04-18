import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SessionTracker } = require('../../electron/sessions/session-tracker.js');
const { Registry } = require('../../electron/sessions/registry.js');

const SILENT_LOGGER = { log() {}, warn() {}, error() {} };

function makeTab(overrides = {}) {
  return {
    id: 'id-' + Math.random().toString(36).slice(2),
    sessionId: null,
    cwd: 'C:/tmp/proj',
    pid: null,
    status: 'dormant',
    label: '(new session)',
    createdAt: 1,
    lastActivityAt: 1,
    scopeId: null,
    restoreFailureCount: 0,
    ...overrides,
  };
}

function neverCalledAdapter() {
  return {
    spawn: vi.fn(async () => {
      throw new Error('adapter.spawn must not be called in this test');
    }),
  };
}

describe('SessionTracker', () => {
  let dir;
  let registryPath;
  let projectsRoot;
  let tracker;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-tracker-'));
    registryPath = join(dir, 'session-tabs.json');
    projectsRoot = join(dir, 'projects');
    mkdirSync(projectsRoot, { recursive: true });
  });

  afterEach(async () => {
    if (tracker) {
      try { await tracker.shutdown(); } catch {}
      tracker = null;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('init() loads existing tabs, prunes dormant > TTL, flips active → dormant, drops sessionId=null records', async () => {
    const now = 1_000_000_000_000; // fixed
    const TTL = 14 * 24 * 3600 * 1000;

    const dormantFresh = makeTab({
      id: 'fresh', sessionId: 'sess-fresh', status: 'dormant',
      lastActivityAt: now - 1000,
    });
    const dormantStale = makeTab({
      id: 'stale', sessionId: 'sess-stale', status: 'dormant',
      lastActivityAt: now - TTL - 1,
    });
    const active = makeTab({
      id: 'active', sessionId: 'sess-active', status: 'active',
      pid: 9999, scopeId: 'scope-xyz', lastActivityAt: now - 100,
    });
    const nullSession = makeTab({
      id: 'null-id', sessionId: null, status: 'active', pid: 1234,
      scopeId: 'scope-null', lastActivityAt: now - 50,
    });

    writeFileSync(
      registryPath,
      JSON.stringify({ tabs: [dormantFresh, dormantStale, active, nullSession] }),
      'utf8',
    );

    tracker = new SessionTracker({
      registryPath,
      claudeProjectsDir: projectsRoot,
      adapter: neverCalledAdapter(),
      now: () => now,
      logger: SILENT_LOGGER,
    });
    await tracker.init();

    const tabs = tracker.list();
    const ids = tabs.map(t => t.id).sort();
    expect(ids).toEqual(['active', 'fresh']);

    const flipped = tabs.find(t => t.id === 'active');
    expect(flipped.status).toBe('dormant');
    expect(flipped.pid).toBeNull();
    expect(flipped.scopeId).toBeNull();

    const persisted = JSON.parse(readFileSync(registryPath, 'utf8'));
    expect(persisted.tabs.map(t => t.id).sort()).toEqual(['active', 'fresh']);
  });

  it('recordPendingSpawn creates a new tab with sessionId=null and emits change', async () => {
    tracker = new SessionTracker({
      registryPath,
      claudeProjectsDir: projectsRoot,
      adapter: neverCalledAdapter(),
      logger: SILENT_LOGGER,
    });
    await tracker.init();

    const changes = [];
    tracker.on('change', () => changes.push(1));

    const created = tracker.recordPendingSpawn({ cwd: 'C:/foo', scopeId: 's1', pid: 123 });
    expect(created.sessionId).toBeNull();
    expect(created.scopeId).toBe('s1');
    expect(created.pid).toBe(123);
    expect(created.status).toBe('active');
    expect(created.cwd).toBe('C:/foo');

    expect(changes.length).toBeGreaterThanOrEqual(1);

    const list = tracker.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(created.id);
  });

  it('handleSessionFile binds sessionId + label when watcher sees a matching jsonl', async () => {
    tracker = new SessionTracker({
      registryPath,
      claudeProjectsDir: projectsRoot,
      adapter: neverCalledAdapter(),
      logger: SILENT_LOGGER,
    });
    await tracker.init();

    // Pre-create the project dir so chokidar picks it up before the add event.
    const projDir = join(projectsRoot, 'C--foo');
    mkdirSync(projDir, { recursive: true });

    tracker.recordPendingSpawn({ cwd: 'C:/foo', scopeId: 's1', pid: 123 });

    // Give the watcher a tick to settle before we write the jsonl.
    await new Promise(r => setTimeout(r, 100));

    const jsonlPath = join(projDir, 'sess-xyz.jsonl');
    writeFileSync(jsonlPath, JSON.stringify({ role: 'user', content: 'hello' }) + '\n', 'utf8');

    await new Promise(r => setTimeout(r, 1000));

    const list = tracker.list();
    expect(list.length).toBe(1);
    expect(list[0].sessionId).toBe('sess-xyz');
    expect(list[0].label).toBe('hello');
  });

  it('markDormant flips pid → null, status → dormant, clears scopeId', async () => {
    tracker = new SessionTracker({
      registryPath,
      claudeProjectsDir: projectsRoot,
      adapter: neverCalledAdapter(),
      logger: SILENT_LOGGER,
    });
    await tracker.init();

    tracker.recordPendingSpawn({ cwd: 'C:/foo', scopeId: 's2', pid: 555 });
    tracker.markDormant('s2');

    const list = tracker.list();
    expect(list.length).toBe(1);
    expect(list[0].pid).toBeNull();
    expect(list[0].status).toBe('dormant');
    expect(list[0].scopeId).toBeNull();
  });

  it('autoRestore spawns adapter.spawn for each resumable tab and updates pid on success', async () => {
    const tabA = makeTab({
      id: 'A', sessionId: 'sess-A', cwd: 'C:/a', status: 'dormant',
      lastActivityAt: Date.now(),
    });
    const tabB = makeTab({
      id: 'B', sessionId: 'sess-B', cwd: 'C:/b', status: 'dormant',
      lastActivityAt: Date.now(),
    });
    writeFileSync(registryPath, JSON.stringify({ tabs: [tabA, tabB] }), 'utf8');

    let counter = 0;
    const adapter = {
      spawn: vi.fn(async ({ sessionId }) => {
        counter++;
        return { scopeId: 'new-' + sessionId, pid: 1000 + counter };
      }),
    };

    tracker = new SessionTracker({
      registryPath,
      claudeProjectsDir: projectsRoot,
      adapter,
      logger: SILENT_LOGGER,
    });
    await tracker.init();

    const results = await tracker.autoRestore();
    expect(results.length).toBe(2);
    expect(results.every(r => r.ok)).toBe(true);

    expect(adapter.spawn).toHaveBeenCalledTimes(2);
    // All calls used resume:true and carried cwd + sessionId.
    for (const call of adapter.spawn.mock.calls) {
      const [opts] = call;
      expect(opts.resume).toBe(true);
      expect(typeof opts.sessionId).toBe('string');
      expect(typeof opts.cwd).toBe('string');
    }

    const tabs = tracker.list();
    expect(tabs.length).toBe(2);
    for (const t of tabs) {
      expect(t.status).toBe('active');
      expect(t.pid).toBeGreaterThanOrEqual(1001);
      expect(t.scopeId).toMatch(/^new-sess-/);
      expect(t.restoreFailureCount).toBe(0);
    }
  });

  it('autoRestore increments restoreFailureCount on adapter failure and quarantines after maxRestoreFailures', async () => {
    const tab = makeTab({
      id: 'Q', sessionId: 'sess-Q', cwd: 'C:/q', status: 'dormant',
      restoreFailureCount: 2, lastActivityAt: Date.now(),
    });
    writeFileSync(registryPath, JSON.stringify({ tabs: [tab] }), 'utf8');

    const adapter = {
      spawn: vi.fn(async () => { throw new Error('spawn failed'); }),
    };

    tracker = new SessionTracker({
      registryPath,
      claudeProjectsDir: projectsRoot,
      adapter,
      maxRestoreFailures: 3,
      logger: SILENT_LOGGER,
    });
    await tracker.init();

    // First pass: count 2 → 3, failure is reported.
    const r1 = await tracker.autoRestore();
    expect(r1.length).toBe(1);
    expect(r1[0].ok).toBe(false);
    expect(r1[0].error).toBe('spawn failed');
    expect(adapter.spawn).toHaveBeenCalledTimes(1);

    const after1 = tracker.list()[0];
    expect(after1.restoreFailureCount).toBe(3);

    // Second autoRestore must SKIP the quarantined tab via the pre-flight filter,
    // not attempt-and-catch. `toHaveBeenCalledTimes(1)` proves adapter.spawn was
    // not called again; `r2 === []` proves no failed-attempt entry was recorded
    // (which would indicate the catch path had run instead).
    const r2 = await tracker.autoRestore();
    expect(adapter.spawn).toHaveBeenCalledTimes(1); // no new calls
    expect(r2).toEqual([]);
  });

  it('autoRestore marks in-flight tabs via isRestoring, clears them when each iteration completes', async () => {
    const tabA = makeTab({
      id: 'A', sessionId: 'sess-A', cwd: 'C:/a', status: 'dormant',
      lastActivityAt: Date.now(),
    });
    const tabB = makeTab({
      id: 'B', sessionId: 'sess-B', cwd: 'C:/b', status: 'dormant',
      lastActivityAt: Date.now(),
    });
    writeFileSync(registryPath, JSON.stringify({ tabs: [tabA, tabB] }), 'utf8');

    /** @type {Array<{ sessionId: string, inFlight: boolean }>} */
    const seen = [];
    let trackerRef;
    const adapter = {
      spawn: vi.fn(async ({ sessionId }) => {
        // Capture isRestoring state for the matching tab at the moment of spawn.
        const tabId = sessionId === 'sess-A' ? 'A' : 'B';
        seen.push({ sessionId, inFlight: trackerRef.isRestoring(tabId) });
        return { scopeId: 'new-' + sessionId, pid: 2000 };
      }),
    };

    tracker = new SessionTracker({
      registryPath,
      claudeProjectsDir: projectsRoot,
      adapter,
      logger: SILENT_LOGGER,
    });
    trackerRef = tracker;
    await tracker.init();

    await tracker.autoRestore();

    // Both adapter.spawn calls saw the in-flight marker.
    expect(seen.length).toBe(2);
    expect(seen.every(s => s.inFlight === true)).toBe(true);

    // After autoRestore completes, neither tab is still marked in-flight.
    expect(tracker.isRestoring('A')).toBe(false);
    expect(tracker.isRestoring('B')).toBe(false);
  });

  it('autoRestore clears _restoringTabs even when adapter.spawn rejects', async () => {
    const tab = makeTab({
      id: 'X', sessionId: 'sess-X', cwd: 'C:/x', status: 'dormant',
      lastActivityAt: Date.now(),
    });
    writeFileSync(registryPath, JSON.stringify({ tabs: [tab] }), 'utf8');

    const adapter = {
      spawn: vi.fn(async () => { throw new Error('boom'); }),
    };

    tracker = new SessionTracker({
      registryPath,
      claudeProjectsDir: projectsRoot,
      adapter,
      logger: SILENT_LOGGER,
    });
    await tracker.init();

    await tracker.autoRestore();

    // Even though spawn rejected, the finally-block must have cleared the set.
    expect(tracker.isRestoring('X')).toBe(false);
  });

  it('closeTab removes from registry and persists', async () => {
    tracker = new SessionTracker({
      registryPath,
      claudeProjectsDir: projectsRoot,
      adapter: neverCalledAdapter(),
      logger: SILENT_LOGGER,
    });
    await tracker.init();

    const t = tracker.recordPendingSpawn({ cwd: 'C:/foo', scopeId: 's9', pid: 777 });
    await tracker.closeTab(t.id);

    expect(tracker.list()).toEqual([]);

    // Re-load registry fresh from disk.
    const r2 = new Registry(registryPath);
    await r2.load();
    expect(r2.list()).toEqual([]);
  });

  it('closeByScopeId removes the tab matching the scopeId; is a no-op for unknown scopeId', async () => {
    tracker = new SessionTracker({
      registryPath,
      claudeProjectsDir: projectsRoot,
      adapter: neverCalledAdapter(),
      logger: SILENT_LOGGER,
    });
    await tracker.init();

    const t = tracker.recordPendingSpawn({ cwd: 'C:/foo', scopeId: 's-match', pid: 321 });
    expect(tracker.list().length).toBe(1);

    // Unknown scopeId should be a no-op.
    await tracker.closeByScopeId('no-such-scope');
    expect(tracker.list().length).toBe(1);
    expect(tracker.list()[0].id).toBe(t.id);

    // Matching scopeId removes the tab.
    await tracker.closeByScopeId('s-match');
    expect(tracker.list()).toEqual([]);

    // Persisted to disk.
    const r2 = new Registry(registryPath);
    await r2.load();
    expect(r2.list()).toEqual([]);
  });
});
