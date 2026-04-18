const { ipcMain, BrowserWindow } = require('electron');
const { join } = require('node:path');
const { SessionTracker } = require('./session-tracker');

const CHANNELS = {
  LIST:   'sessionTabs:list',
  RESUME: 'sessionTabs:resume',
  REMOVE: 'sessionTabs:remove',
  UPDATE: 'sessionTabs:update',
};

/**
 * @param {{
 *   userDataDir: string,
 *   claudeProjectsDir: string,
 *   adapter: import('./session-tracker').SpawnAdapter,
 *   logger?: Console,
 * }} opts
 * @returns {Promise<{ tracker: SessionTracker, CHANNELS: typeof CHANNELS }>}
 */
async function registerSessionTabsIpc(opts) {
  const logger = opts.logger ?? console;
  const tracker = new SessionTracker({
    registryPath: join(opts.userDataDir, 'session-tabs.json'),
    claudeProjectsDir: opts.claudeProjectsDir,
    adapter: opts.adapter,
    logger,
  });

  await tracker.init();

  tracker.on('change', () => {
    const payload = { tabs: tracker.list() };
    for (const win of BrowserWindow.getAllWindows()) {
      try { win.webContents.send(CHANNELS.UPDATE, payload); }
      catch (err) { logger.error?.('[sessionTabs ipc] broadcast failed:', err); }
    }
  });

  ipcMain.handle(CHANNELS.LIST, () => tracker.list());

  ipcMain.handle(CHANNELS.RESUME, async (_e, tabId) => {
    const tab = tracker.list().find(t => t.id === tabId);
    if (!tab) throw new Error(`No tab with id ${tabId}`);
    if (!tab.sessionId) throw new Error(`Tab ${tabId} has no sessionId; cannot resume`);
    // Guard against double-spawn: autoRestore may be mid-flight for this tab,
    // or the user may be clicking RESUME on a tab that's already active.
    if (tracker.isRestoring(tabId)) throw new Error(`tab ${tabId} is already being restored`);
    if (tab.status === 'active') throw new Error(`tab ${tabId} is already active`);

    const { scopeId, pid } = await opts.adapter.spawn({
      cwd: tab.cwd, sessionId: tab.sessionId, resume: true,
    });
    tracker.recordPendingSpawn({ cwd: tab.cwd, scopeId, pid });
    return tracker.list().find(t => t.scopeId === scopeId);
  });

  ipcMain.handle(CHANNELS.REMOVE, (_e, tabId) => tracker.closeTab(tabId));

  return { tracker, CHANNELS };
}

module.exports = { registerSessionTabsIpc, CHANNELS };
