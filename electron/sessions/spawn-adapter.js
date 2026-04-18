// spawn-adapter.js — bridges SessionTracker to Forge's existing PTY machinery.
// Purpose: let SessionTracker.autoRestore() and the 'sessionTabs:resume' IPC
// handler spawn a new Claude CLI PTY that reuses Forge's own ptyProcesses map,
// IPC event flow, and renderer-side Terminal component.

/**
 * @typedef {Object} AdapterDeps
 * @property {Map<string, any>} ptyProcesses
 *   Forge's existing map of live PTYs. Adapter stores the new PTY here so
 *   terminal:input / terminal:resize / terminal:kill continue to work against
 *   the same lookup.
 * @property {Function} spawnPty
 *   (scopeId, cwd, cols, rows) => Promise<ptyProc>
 *   Wraps node-pty spawn + terminal:data/terminal:exit IPC wiring. Forge's
 *   main process exposes this helper so the adapter doesn't duplicate PTY
 *   lifecycle logic.
 * @property {Function} [broadcastTabCreated]
 *   (tabRecord) => void — optional. Called after each successful spawn so
 *   Phase 4's renderer can create a Terminal component for the new scopeId.
 *   If you don't have a clean broadcast channel yet, this can be a no-op;
 *   Phase 4 will listen for the sessionTabs:update broadcast anyway.
 */

function createSpawnAdapter(deps) {
  const { ptyProcesses, spawnPty, broadcastTabCreated = () => {} } = deps;
  if (!ptyProcesses) throw new Error('createSpawnAdapter: ptyProcesses required');
  if (typeof spawnPty !== 'function') throw new Error('createSpawnAdapter: spawnPty function required');

  return {
    /**
     * @param {{ cwd: string, sessionId: string|null, resume: boolean }} opts
     * @returns {Promise<{ scopeId: string, pid: number|null }>}
     */
    async spawn({ cwd, sessionId, resume }) {
      if (resume && !sessionId) throw new Error('resume=true requires sessionId');

      const { randomUUID } = require('node:crypto');
      const scopeId = `session-${randomUUID().slice(0, 8)}`;
      const proc = await spawnPty(scopeId, cwd, 120, 30);
      ptyProcesses.set(scopeId, { proc, scope: '__session__', cwd });

      // Stagger so the shell is ready before we type.
      await new Promise(r => setTimeout(r, 500));

      const cmd = resume
        ? `claude --dangerously-skip-permissions --resume ${sessionId}`
        : `claude --dangerously-skip-permissions`;
      proc.write(cmd + '\r');

      try { broadcastTabCreated({ scopeId, cwd, pid: proc.pid ?? null }); } catch {}
      return { scopeId, pid: proc.pid ?? null };
    },
  };
}

module.exports = { createSpawnAdapter };
