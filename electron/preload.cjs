const { contextBridge, ipcRenderer } = require('electron');
const PATHS = require('../config/paths.cjs');

// Expose resolved Forge paths to the renderer.
// Renderer-side prompt builders read these instead of hardcoding C:\Claude\Samurai paths.
contextBridge.exposeInMainWorld('forgePaths', {
  forgeRoot: PATHS.forgeRoot,
  hqData: PATHS.hqData,
  agentsDir: PATHS.agentsDir,
  claudeMd: PATHS.claudeMd,
  platform: process.platform,
});

contextBridge.exposeInMainWorld('electronAPI', {
  // Terminal — all methods take scopeId
  terminal: {
    create: (scopeId, cols, rows, repoPath) => ipcRenderer.send('terminal:create', { scopeId, cols, rows, repoPath }),
    input: (scopeId, data) => ipcRenderer.send('terminal:input', { scopeId, data }),
    resize: (scopeId, cols, rows) => ipcRenderer.send('terminal:resize', { scopeId, cols, rows }),
    createImplementation: (scopeId, cols, rows, cwd, prompt, flags, mode, modelFlag, agentSlug, projectSlug) =>
      ipcRenderer.send('terminal:create-implementation', { scopeId, cols, rows, cwd, prompt, flags, mode, modelFlag, agentSlug, projectSlug }),
    createAgentSession: (scopeId, cols, rows, agentSlug, projectSlug, modelFlag) =>
      ipcRenderer.send('terminal:create-agent-session', { scopeId, cols, rows, agentSlug, projectSlug, modelFlag }),
    createTool: (scopeId, cols, rows, cwd, command, env) =>
      ipcRenderer.send('terminal:create-tool', { scopeId, cols, rows, cwd, command, env }),
    kill: (scopeId) => ipcRenderer.send('terminal:kill', { scopeId }),
    onData: (callback) => {
      const handler = (event, { scopeId, data }) => callback(scopeId, data);
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.removeListener('terminal:data', handler);
    },
    onExit: (callback) => {
      const handler = (event, { scopeId, exitCode }) => callback(scopeId, exitCode);
      ipcRenderer.on('terminal:exit', handler);
      return () => ipcRenderer.removeListener('terminal:exit', handler);
    }
  },

  // Git integration
  git: {
    getData: (repoPath) => ipcRenderer.invoke('git:get-data', repoPath),
    getCodeStats: (repoPath) => ipcRenderer.invoke('git:get-code-stats', repoPath),
    getDiffSince: (repoPath, sinceHash) => ipcRenderer.invoke('git:get-diff-since', repoPath, sinceHash),
  },

  // Automation IPC
  automation: {
    onScheduleFired: (callback) => {
      const handler = (event, schedule) => callback(schedule);
      ipcRenderer.on('automation:schedule-fired', handler);
      return () => ipcRenderer.removeListener('automation:schedule-fired', handler);
    },
    onGitChange: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('automation:git-change', handler);
      return () => ipcRenderer.removeListener('automation:git-change', handler);
    },
  },

  // Reports & Email
  reports: {
    generate: (type) => ipcRenderer.invoke('report:generate', type),
    sendEmail: (type, forceEmail) => ipcRenderer.invoke('report:send-email', { type, forceEmail }),
  },

  // Agent skill files
  agent: {
    readSkill: (fileName) => ipcRenderer.invoke('agent:read-skill', fileName),
    writeSkill: (fileName, content) => ipcRenderer.invoke('agent:write-skill', fileName, content),
  },

  // Secrets Management
  secrets: {
    getStatus: () => ipcRenderer.invoke('secrets:get-status'),
    get: (platform) => ipcRenderer.invoke('secrets:get', platform),
    set: (platform, creds) => ipcRenderer.invoke('secrets:set', platform, creds),
    remove: (platform) => ipcRenderer.invoke('secrets:remove', platform),
    post: (platform, postData) => ipcRenderer.invoke('secrets:post', platform, postData),
  },

  // Social notifications
  social: {
    onPostDue: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('social:post-due', handler);
      return () => ipcRenderer.removeListener('social:post-due', handler);
    },
    onCampaignDue: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('social:campaign-due', handler);
      return () => ipcRenderer.removeListener('social:campaign-due', handler);
    },
  },

  // Groq API (Council Chat)
  groq: {
    generate: (opts) => ipcRenderer.invoke('groq:generate', opts),
    getUsage: () => ipcRenderer.invoke('groq:get-usage'),
  },

  // Friday Studio Director
  friday: {
    connect: (url) => ipcRenderer.invoke('friday:connect', url),
    disconnect: () => ipcRenderer.invoke('friday:disconnect'),
    getStatus: () => ipcRenderer.invoke('friday:get-status'),
    send: (message) => ipcRenderer.send('friday:send', message),
    sendEvent: (coeEvent) => ipcRenderer.send('friday:event', coeEvent),
    respondToCommand: (commandId, approved) => ipcRenderer.send('friday:command-respond', { commandId, approved }),
    onStatus: (callback) => {
      const handler = (event, status) => callback(status);
      ipcRenderer.on('friday:status', handler);
      return () => ipcRenderer.removeListener('friday:status', handler);
    },
    onMessage: (callback) => {
      const handler = (event, msg) => callback(msg);
      ipcRenderer.on('friday:message', handler);
      return () => ipcRenderer.removeListener('friday:message', handler);
    },
    sendAudio: (buffer) => ipcRenderer.send('friday:audio-out', buffer),
    onAudioIn: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('friday:audio-in', handler);
      return () => ipcRenderer.removeListener('friday:audio-in', handler);
    },
    onVoiceState: (callback) => {
      const handler = (event, state) => callback(state);
      ipcRenderer.on('friday:voice-state', handler);
      return () => ipcRenderer.removeListener('friday:voice-state', handler);
    },
    onCommandConfirm: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('friday:command-confirm', handler);
      return () => ipcRenderer.removeListener('friday:command-confirm', handler);
    },
    onTaskUpdate: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('friday:task-update', handler);
      return () => ipcRenderer.removeListener('friday:task-update', handler);
    },
    startServer: () => ipcRenderer.invoke('friday:start-server'),
    stopServer: () => ipcRenderer.invoke('friday:stop-server'),
    getServerStatus: () => ipcRenderer.invoke('friday:server-status'),
    onProcessStatus: (callback) => {
      const handler = (event, status) => callback(status);
      ipcRenderer.on('friday:process-status', handler);
      return () => ipcRenderer.removeListener('friday:process-status', handler);
    },
  },

  // Main process logs
  main: {
    getLogs: () => ipcRenderer.invoke('main:get-logs'),
    onLogEntry: (callback) => {
      const handler = (event, entry) => callback(entry);
      ipcRenderer.on('main:log-entry', handler);
      return () => ipcRenderer.removeListener('main:log-entry', handler);
    },
  },

  // Discord Bot Integration
  discord: {
    connect: (token, guildId, channelId) => ipcRenderer.invoke('discord:connect', { token, guildId, channelId }),
    disconnect: () => ipcRenderer.invoke('discord:disconnect'),
    getStatus: () => ipcRenderer.invoke('discord:get-status'),
    getMessages: (limit) => ipcRenderer.invoke('discord:get-messages', { limit }),
    sendMessage: (content) => ipcRenderer.invoke('discord:send-message', { content }),
    postAgentMessage: (agentId, text) => ipcRenderer.invoke('discord:post-agent-message', { agentId, text }),
    setupWebhooks: () => ipcRenderer.invoke('discord:setup-webhooks'),
    onMessageReceived: (cb) => {
      const handler = (_, msg) => cb(msg);
      ipcRenderer.on('discord:message-received', handler);
      return () => ipcRenderer.removeListener('discord:message-received', handler);
    },
  },

  // CodeViz: CodeGraphContext
  codeviz: {
    scanRepo: (repoPath) => ipcRenderer.invoke('codeviz:scan-repo', { repoPath }),
    checkCGC: () => ipcRenderer.invoke('codeviz:check-cgc'),
    index: (repoPath, projectSlug) => ipcRenderer.invoke('codeviz:index', { repoPath, projectSlug }),
    exportGraph: (repoPath, projectSlug) => ipcRenderer.invoke('codeviz:export-graph', { repoPath, projectSlug }),
    loadCachedGraph: (projectSlug) => ipcRenderer.invoke('codeviz:load-cached-graph', { projectSlug }),
    onIndexProgress: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('codeviz:index-progress', handler);
      return () => ipcRenderer.removeListener('codeviz:index-progress', handler);
    },
  },

  // Agent Aliases → CLAUDE.md sync
  aliases: {
    sync: (rows) => ipcRenderer.invoke('aliases:sync', rows),
  },

  // Port Monitor
  ports: {
    onStatus: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('ports:status', handler);
      return () => ipcRenderer.removeListener('ports:status', handler);
    },
    refresh: () => ipcRenderer.invoke('ports:refresh'),
  },

  // Project Environment (folder, launchers, terminal, vscode)
  project: {
    openFolder:   (repoPath)         => ipcRenderer.invoke('project:open-folder', repoPath),
    runLauncher:  (repoPath, script) => ipcRenderer.invoke('project:run-launcher', repoPath, script),
    openTerminal: (repoPath)         => ipcRenderer.invoke('project:open-terminal', repoPath),
    openVSCode:   (repoPath)         => ipcRenderer.invoke('project:open-vscode', repoPath),
    pickLauncher: (repoPath)         => ipcRenderer.invoke('project:pick-launcher', repoPath),
  },

  // HQ Data
  hq: {
    readFile: (path) => ipcRenderer.invoke('hq:read-file', path),
    readDir: (path) => ipcRenderer.invoke('hq:read-dir', path),
    writeFile: (path, content) => ipcRenderer.invoke('hq:write-file', path, content),
    showInFolder: (path) => ipcRenderer.invoke('hq:show-in-folder', path),
    startWatching: () => ipcRenderer.send('hq:start-watching'),
    onFileChanged: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('hq:file-changed', handler);
      return () => ipcRenderer.removeListener('hq:file-changed', handler);
    }
  }
});
