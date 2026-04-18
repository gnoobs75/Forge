const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage, Notification } = require('electron');
const path = require('path');
const os = require('os');
const pty = require('node-pty');
const fs = require('fs');
const crypto = require('crypto');
const PATHS = require('../config/paths.cjs');

// Auto-bootstrap hq-data on fresh clones. No-op when data already exists.
try {
  const { initHqData } = require('../scripts/init-hq-data.cjs');
  const result = initHqData();
  if (result.created) {
    console.log(`[Forge] Bootstrapped fresh hq-data at ${result.hqData} (${result.files.length} files)`);
  }
} catch (err) {
  console.warn('[Forge] hq-data bootstrap failed:', err.message);
}

// --- Token Metering (standalone writer for Electron main process) ---
const meteringDir = PATHS.metering();

function writeMeteringRecord(record) {
  try {
    if (!fs.existsSync(meteringDir)) fs.mkdirSync(meteringDir, { recursive: true });
    const d = new Date();
    const fileName = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.json`;
    const filePath = path.join(meteringDir, fileName);
    let records = [];
    if (fs.existsSync(filePath)) {
      try { records = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch {}
    }
    records.push(record);
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
    console.log(`[Metering] Wrote ${record.provider} record: ${record.source} agent=${record.agent} tokens=${record.tokens?.total || 0}`);
  } catch (err) {
    console.error('[Metering] Write failed:', err.message, 'dir:', meteringDir);
  }
}

function meterRecordId() {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const hex = Math.random().toString(16).slice(2, 10);
  return `meter-${date}-${hex}`;
}

let mainWindow;
const ptyProcesses = new Map(); // keyed by scopeId

const isDev = !app.isPackaged;

// ─── Main Process Log Capture ──────────────────────────────────────────────
const LOG_RING_BUFFER_CAP = 2000;
const logRingBuffer = [];
const LOG_FILE = path.join(PATHS.forgeRoot, 'forge-debug.log');
// Truncate on startup
try { fs.writeFileSync(LOG_FILE, `=== Forge Debug Log — ${new Date().toISOString()} ===\n`); } catch {}
const LOG_CAPTURE_PREFIXES = ['[Forge', '[Friday', '[Discord', '[Report', '[Auto', '[Git', '[HQ', '[Secrets'];
// Exclude high-frequency terminal lifecycle noise from ring buffer
const LOG_EXCLUDE_PATTERNS = [
  '[Forge] Spawning PTY', '[Forge] PTY spawned', '[Forge] PTY already running',
  '[Forge] PTY for scope=', '[Forge] terminal:create', '[Forge] Implementation PTY',
  '[Forge] Agent session PTY', '[Forge] Resize failed', '[Forge] Killing PTY',
];

function captureLog(level, ...args) {
  const msg = args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');

  // For 'log' level, only capture recognized prefixes, excluding terminal noise
  if (level === 'log') {
    const hasPrefix = LOG_CAPTURE_PREFIXES.some(p => msg.startsWith(p));
    if (!hasPrefix) return;
    if (LOG_EXCLUDE_PATTERNS.some(p => msg.includes(p))) return;
  }

  const entry = {
    level,
    timestamp: new Date().toISOString(),
    message: msg,
  };

  logRingBuffer.push(entry);
  // Also write to debug log file for live tailing
  try { fs.appendFileSync(LOG_FILE, `[${level}] ${msg}\n`); } catch {}
  if (logRingBuffer.length > LOG_RING_BUFFER_CAP) {
    logRingBuffer.shift();
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('main:log-entry', entry); } catch {}
  }
}

const _origLog = console.log;
const _origWarn = console.warn;
const _origError = console.error;

console.log = (...args) => { _origLog.apply(console, args); captureLog('log', ...args); };
console.warn = (...args) => { _origWarn.apply(console, args); captureLog('warn', ...args); };
console.error = (...args) => { _origError.apply(console, args); captureLog('error', ...args); };

// Default cwd for spawned Claude processes when no project repo is resolvable.
// Forge root is the safe choice — it has CLAUDE.md, .claude config, and access to hq-data.
const STUDIO_DIR = PATHS.forgeRoot;

// Resolve a project's repoPath from its project.json under hq-data/projects/{slug}/.
// Returns the repoPath when it exists on disk, otherwise falls back to the studio dir.
function resolveProjectCwd(projectSlug) {
  if (!projectSlug) return STUDIO_DIR;
  try {
    const projectJsonPath = PATHS.projects(projectSlug, 'project.json');
    if (fs.existsSync(projectJsonPath)) {
      const pj = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
      if (pj.repoPath && fs.existsSync(pj.repoPath)) return pj.repoPath;
      console.warn(`[Forge] resolveProjectCwd: repoPath missing or not found for ${projectSlug}, using studio dir`);
    }
  } catch (err) {
    console.warn(`[Forge] resolveProjectCwd failed for ${projectSlug}: ${err.message}`);
  }
  return STUDIO_DIR;
}

function getCwdForScope(scopeId, repoPath) {
  // Generic scope terminals: prefer explicit repoPath from the renderer, fall back to studio.
  if (repoPath && fs.existsSync(repoPath)) return repoPath;
  if (repoPath) console.warn(`[Forge] getCwdForScope: repoPath "${repoPath}" not found, using studio dir`);
  return STUDIO_DIR;
}

// ─── Embedded Vite Dev Server (PTY) ───
let vitePty = null;
const VITE_PORT = 5180;
const viteOutputBuffer = []; // Buffer output until renderer is ready

function startViteServer() {
  return new Promise((resolve) => {
    if (!isDev) { resolve(); return; }
    if (vitePty) { resolve(); return; }

    const viteCwd = path.join(__dirname, '..');
    console.log(`[Forge Vite] Starting Vite dev server in ${viteCwd}`);

    const npmCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const proc = pty.spawn(npmCmd, ['vite', '--port', String(VITE_PORT), '--strictPort', '--clearScreen', 'false', '--host', '127.0.0.1'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: viteCwd,
      env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' },
      useConptyDll: true,
    });

    vitePty = proc;
    ptyProcesses.set('vite-server', { proc, scope: '__srv__' });
    console.log(`[Forge Vite] PTY spawned, pid=${proc.pid}`);

    let resolved = false;
    proc.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', { scopeId: 'vite-server', data });
      } else {
        viteOutputBuffer.push(data);
      }

      if (!resolved && (data.includes('Local:') || data.includes('ready in'))) {
        console.log('[Forge Vite] Server ready');
        resolved = true;
        resolve();
      }
    });

    proc.onExit(({ exitCode }) => {
      console.log(`[Forge Vite] Exited with code ${exitCode}`);
      vitePty = null;
      ptyProcesses.delete('vite-server');
      if (!resolved) { resolved = true; resolve(); }
    });

    setTimeout(() => {
      if (!resolved) {
        console.warn('[Forge Vite] Startup timeout — proceeding anyway');
        resolved = true;
        resolve();
      }
    }, 15000);
  });
}

function flushOutputBuffers() {
  if (viteOutputBuffer.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
    console.log(`[Forge Vite] Flushing ${viteOutputBuffer.length} buffered chunks to renderer`);
    for (const data of viteOutputBuffer) {
      mainWindow.webContents.send('terminal:data', { scopeId: 'vite-server', data });
    }
    viteOutputBuffer.length = 0;
  }
  if (fridayOutputBuffer.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
    console.log(`[Forge Friday] Flushing ${fridayOutputBuffer.length} buffered chunks to renderer`);
    for (const data of fridayOutputBuffer) {
      mainWindow.webContents.send('terminal:data', { scopeId: 'friday-server', data });
    }
    fridayOutputBuffer.length = 0;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'The Forge',
    backgroundColor: '#18181C',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#18181C',
      symbolColor: '#e2e8f0',
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${VITE_PORT}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Flush buffered Vite output after React mounts
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => { flushOutputBuffers(); }, 2000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Kill all PTYs
    for (const [id, entry] of ptyProcesses) {
      const proc = entry?.proc || entry;
      try { proc.kill(); } catch (e) {}
    }
    ptyProcesses.clear();
  });
}

// Build a clean env for PTY subprocesses — strip CLAUDECODE so nested claude sessions work
function ptyEnv() {
  const env = { ...process.env, TERM: 'xterm-256color' };
  delete env.CLAUDECODE;
  return env;
}

// Terminal (PTY) management — per-scope
function createTerminal(scopeId, cols, rows, repoPath) {
  let shell, shellArgs;
  if (process.platform === 'win32') {
    shell = process.env.COMSPEC || 'cmd.exe';
    shellArgs = [];
  } else {
    shell = process.env.SHELL || 'bash';
    shellArgs = [];
  }

  const cwd = getCwdForScope(scopeId, repoPath);
  console.log(`[Forge] Spawning PTY for scope="${scopeId}": shell=${shell} cols=${cols} rows=${rows} cwd=${cwd}`);

  try {
    const proc = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd,
      env: ptyEnv()
    });
    console.log(`[Forge] PTY spawned for scope="${scopeId}", pid=${proc.pid}`);

    ptyProcesses.set(scopeId, proc);
    if (global.__sessionTracker) {
      try {
        global.__sessionTracker.recordPendingSpawn({ cwd: cwd || repoPath || process.cwd(), scopeId, pid: proc.pid });
      } catch (err) {
        console.warn('[sessions] recordPendingSpawn failed:', err);
      }
    }

    proc.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', { scopeId, data });
      }
    });

    // Auto-launch claude in each terminal after shell is ready
    setTimeout(() => {
      try { proc.write('claude\r'); } catch (e) {}
    }, 500);

    proc.onExit(({ exitCode }) => {
      console.log(`[Forge] PTY for scope="${scopeId}" exited with code ${exitCode}`);
      ptyProcesses.delete(scopeId);
      if (global.__sessionTracker) {
        try { global.__sessionTracker.markDormant(scopeId); } catch {}
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', { scopeId, exitCode });
      }
    });
  } catch (err) {
    console.error(`[Forge] PTY spawn FAILED for scope="${scopeId}":`, err);
  }
}

// IPC handler for implementation terminals — custom CWD + auto-typed command
ipcMain.on('terminal:create-implementation', (event, { scopeId, cols, rows, cwd, prompt, flags, mode, modelFlag, agentSlug, projectSlug, recommendationId }) => {
  console.log(`[Forge] terminal:create-implementation scope="${scopeId}" mode=${mode} cwd=${cwd} agent=${agentSlug || 'none'} project=${projectSlug || 'none'} rec=${recommendationId || 'none'} model=${modelFlag || 'default'}`);

  // Write prompt to temp file to avoid shell escaping issues
  const tmpFile = path.join(os.tmpdir(), `forge-${scopeId}.md`);
  fs.writeFileSync(tmpFile, prompt, 'utf-8');

  let shell, shellArgs;
  if (process.platform === 'win32') {
    shell = process.env.COMSPEC || 'cmd.exe';
    shellArgs = [];
  } else {
    shell = process.env.SHELL || 'bash';
    shellArgs = [];
  }

  const sessionStart = Date.now();
  const promptLength = (prompt || '').length;
  let outputChars = 0;

  try {
    const proc = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd,
      env: ptyEnv()
    });
    console.log(`[Forge] Implementation PTY spawned scope="${scopeId}", pid=${proc.pid}, cwd=${cwd}`);

    ptyProcesses.set(scopeId, { proc, scope: '__impl__', projectSlug: projectSlug || 'unknown', agentSlug: agentSlug || 'unknown', taskDescription: prompt || '' });

    proc.onData((data) => {
      outputChars += data.length;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', { scopeId, data });
      }
    });

    proc.onExit(({ exitCode }) => {
      console.log(`[Forge] Implementation PTY scope="${scopeId}" exited with code ${exitCode}`);
      ptyProcesses.delete(scopeId);
      if (global.__sessionTracker) {
        try { global.__sessionTracker.markDormant(scopeId); } catch {}
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', { scopeId, exitCode });
      }
      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch {}
      const durationMs = Date.now() - sessionStart;
      const estInput = Math.round(promptLength / 4);
      const estOutput = Math.round(outputChars / 4);
      writeMeteringRecord({
        id: meterRecordId(),
        timestamp: new Date().toISOString(),
        provider: 'claude',
        model: 'claude-code',
        source: agentSlug ? 'agent-dispatch' : 'implementation',
        agent: agentSlug || null,
        agentSlug: agentSlug || null,
        project: projectSlug || null,
        linkType: null,
        linkId: null,
        tokens: {
          input: estInput,
          output: estOutput,
          total: estInput + estOutput,
          estimated: true,
        },
        durationMs,
        status: 'completed',
      });
    });

    // After shell ready, type the claude command.
    // Use forward slashes in the path (works in cmd.exe and avoids escaping).
    // Plan mode: tell Claude to plan and discuss before implementing.
    // Auto mode: tell Claude to implement directly.
    setTimeout(() => {
      const briefPath = tmpFile.replace(/\\/g, '/');
      const instruction = mode === 'plan'
        ? `Read the implementation brief at ${briefPath}. Create a detailed plan for how you would implement this. Do NOT start coding yet - present the plan and discuss it with me first. I want to review and approve before any code changes.`
        : `Read the implementation brief at ${briefPath} and implement the recommended approach. Explore the codebase first.`;
      const modelArg = modelFlag ? `--model ${modelFlag}` : '';
      // Both modes get danger mode for uninterrupted reading. The instruction itself controls whether code is written.
      const cmd = ['claude', '--dangerously-skip-permissions', modelArg, flags, `"${instruction}"`].filter(Boolean).join(' ');
      console.log(`[Forge] *** Implementation PTY FULL command (mode=${mode}): ${cmd}`);
      if (global.__sessionTracker) {
        try {
          global.__sessionTracker.recordPendingSpawn({ cwd, scopeId, pid: proc.pid, agentSlug: agentSlug || null, projectSlug: projectSlug || null, recommendationId: recommendationId || null });
        } catch (err) {
          console.warn('[sessions] recordPendingSpawn failed:', err);
        }
      }
      proc.write(cmd + '\r');
    }, 500);
  } catch (err) {
    console.error(`[Forge] Implementation PTY spawn FAILED for scope="${scopeId}":`, err);
  }
});

// IPC handler for Project Tools launchers — plain shell + auto-typed command
ipcMain.on('terminal:create-tool', (event, { scopeId, cols, rows, cwd, command, env }) => {
  console.log(`[Forge] terminal:create-tool scope="${scopeId}" cwd=${cwd} cmd=${command}`);

  if (!cwd || !fs.existsSync(cwd)) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:data', { scopeId,
        data: `\r\n\x1b[31m[Forge] tool launch failed: cwd not found (${cwd})\x1b[0m\r\n` });
      mainWindow.webContents.send('terminal:exit', { scopeId, exitCode: 1 });
    }
    return;
  }
  if (!command || typeof command !== 'string') {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:data', { scopeId,
        data: `\r\n\x1b[31m[Forge] tool launch failed: no command\x1b[0m\r\n` });
      mainWindow.webContents.send('terminal:exit', { scopeId, exitCode: 1 });
    }
    return;
  }

  let shell, shellArgs;
  if (process.platform === 'win32') {
    shell = process.env.COMSPEC || 'cmd.exe';
    shellArgs = [];
  } else {
    shell = process.env.SHELL || 'bash';
    shellArgs = [];
  }

  const toolEnv = { ...ptyEnv(), ...(env && typeof env === 'object' ? env : {}) };

  try {
    const proc = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd,
      env: toolEnv,
    });
    console.log(`[Forge] Tool PTY spawned scope="${scopeId}", pid=${proc.pid}, cwd=${cwd}`);
    ptyProcesses.set(scopeId, proc);
    if (global.__sessionTracker) {
      try {
        global.__sessionTracker.recordPendingSpawn({ cwd, scopeId, pid: proc.pid });
      } catch (err) {
        console.warn('[sessions] recordPendingSpawn failed:', err);
      }
    }

    proc.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', { scopeId, data });
      }
    });

    proc.onExit(({ exitCode }) => {
      console.log(`[Forge] Tool PTY scope="${scopeId}" exited code=${exitCode}`);
      ptyProcesses.delete(scopeId);
      if (global.__sessionTracker) {
        try { global.__sessionTracker.markDormant(scopeId); } catch {}
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', { scopeId, exitCode });
      }
    });

    setTimeout(() => {
      try { proc.write(command + '\r'); } catch (e) { /* ignore */ }
    }, 500);
  } catch (err) {
    console.error(`[Forge] Tool PTY spawn FAILED for scope="${scopeId}":`, err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:data', { scopeId,
        data: `\r\n\x1b[31m[Forge] spawn failed: ${err.message}\x1b[0m\r\n` });
      mainWindow.webContents.send('terminal:exit', { scopeId, exitCode: 1 });
    }
  }
});

// IPC handlers for terminal — all scope-aware
ipcMain.on('terminal:create', (event, { scopeId, cols, rows, repoPath }) => {
  console.log(`[Forge] terminal:create scope="${scopeId}" cols=${cols} rows=${rows} repoPath=${repoPath || '(none)'} existing=${ptyProcesses.has(scopeId)}`);

  const existing = ptyProcesses.get(scopeId);
  if (existing) {
    console.log(`[Forge] PTY already running for scope="${scopeId}" (pid=${existing.pid}), resizing`);
    try {
      existing.resize(cols || 80, rows || 24);
    } catch (e) {
      console.log(`[Forge] Resize failed for scope="${scopeId}", recreating:`, e.message);
      try { existing.kill(); } catch (e2) {}
      ptyProcesses.delete(scopeId);
      createTerminal(scopeId, cols, rows, repoPath);
    }
    return;
  }
  createTerminal(scopeId, cols, rows, repoPath);
});

ipcMain.on('terminal:kill', (event, { scopeId }) => {
  const entry = ptyProcesses.get(scopeId);
  const proc = entry?.proc || entry;
  if (proc) {
    console.log(`[Forge] Killing PTY for scope="${scopeId}", pid=${proc.pid}`);
    try { proc.kill(); } catch (e) {}
    ptyProcesses.delete(scopeId);
  }
  if (global.__sessionTracker) {
    global.__sessionTracker.closeByScopeId(scopeId).catch(err =>
      console.warn('[sessions] closeByScopeId failed:', err)
    );
  }
});

ipcMain.on('terminal:input', (event, { scopeId, data }) => {
  const entry = ptyProcesses.get(scopeId);
  const proc = entry?.proc || entry;
  if (proc) {
    proc.write(data);
  }
});

ipcMain.on('terminal:resize', (event, { scopeId, cols, rows }) => {
  const entry = ptyProcesses.get(scopeId);
  const proc = entry?.proc || entry;
  if (proc) {
    try { proc.resize(cols, rows); } catch (e) {}
  }
});

// IPC handler for reading hq-data
ipcMain.handle('hq:read-file', async (event, filePath) => {
  const fsp = require('fs').promises;
  const fullPath = PATHS.hq(filePath);
  try {
    const content = await fsp.readFile(fullPath, 'utf-8');
    return { ok: true, data: content };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('hq:read-dir', async (event, dirPath) => {
  const fsp = require('fs').promises;
  const fullPath = PATHS.hq(dirPath);
  try {
    const entries = await fsp.readdir(fullPath, { withFileTypes: true });
    return {
      ok: true,
      data: entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory()
      }))
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('hq:write-file', async (event, filePath, content) => {
  const fsp = require('fs').promises;
  const fullPath = PATHS.hq(filePath);
  try {
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('hq:show-in-folder', async (event, relativePath) => {
  const fullPath = PATHS.hq(relativePath);
  shell.showItemInFolder(fullPath);
});

// ─── Project Environment (folder, launchers, terminal, vscode) ───
ipcMain.handle('project:open-folder', async (event, repoPath) => {
  if (!repoPath || typeof repoPath !== 'string') {
    return { ok: false, error: 'repoPath required' };
  }
  if (!fs.existsSync(repoPath)) {
    return { ok: false, error: `path not found: ${repoPath}` };
  }
  try {
    const err = await shell.openPath(repoPath);
    if (err) return { ok: false, error: err };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('project:run-launcher', async (event, repoPath, script) => {
  if (!repoPath || typeof repoPath !== 'string') {
    return { ok: false, error: 'repoPath required' };
  }
  if (!script || typeof script !== 'string') {
    return { ok: false, error: 'script required' };
  }
  if (!fs.existsSync(repoPath)) {
    return { ok: false, error: `repoPath not found: ${repoPath}` };
  }
  const resolvedRepo = path.resolve(repoPath);
  const resolvedScript = path.resolve(path.join(resolvedRepo, script));
  if (!resolvedScript.startsWith(resolvedRepo + path.sep) && resolvedScript !== resolvedRepo) {
    return { ok: false, error: 'script path escapes repoPath' };
  }
  if (!fs.existsSync(resolvedScript)) {
    return { ok: false, error: `script not found: ${resolvedScript}` };
  }
  try {
    const err = await shell.openPath(resolvedScript);
    if (err) return { ok: false, error: err };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('project:open-terminal', async (event, repoPath) => {
  if (!repoPath || typeof repoPath !== 'string') {
    return { ok: false, error: 'repoPath required' };
  }
  if (!fs.existsSync(repoPath)) {
    return { ok: false, error: `path not found: ${repoPath}` };
  }
  try {
    const { spawn } = require('child_process');
    const child = spawn('cmd.exe', ['/c', 'start', '', 'cmd'], {
      cwd: repoPath,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('project:pick-launcher', async (event, repoPath) => {
  if (!repoPath || typeof repoPath !== 'string') {
    return { ok: false, error: 'repoPath required' };
  }
  if (!fs.existsSync(repoPath)) {
    return { ok: false, error: `path not found: ${repoPath}` };
  }
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pick a launcher script',
      defaultPath: repoPath,
      properties: ['openFile'],
      filters: [
        { name: 'Launcher scripts', extensions: ['bat', 'cmd', 'vbs', 'ps1', 'exe'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths?.length) {
      return { ok: false, canceled: true };
    }
    const absScript = result.filePaths[0];
    const resolvedRepo = path.resolve(repoPath);
    const resolvedScript = path.resolve(absScript);
    if (!resolvedScript.startsWith(resolvedRepo + path.sep)) {
      return { ok: false, error: 'Selected file is outside the project folder' };
    }
    const relativePath = path.relative(resolvedRepo, resolvedScript).replace(/\\/g, '/');
    return { ok: true, relativePath, absolutePath: resolvedScript };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('project:open-vscode', async (event, repoPath) => {
  if (!repoPath || typeof repoPath !== 'string') {
    return { ok: false, error: 'repoPath required' };
  }
  if (!fs.existsSync(repoPath)) {
    return { ok: false, error: `path not found: ${repoPath}` };
  }
  try {
    const { spawn } = require('child_process');
    const codeBin = process.platform === 'win32' ? 'code.cmd' : 'code';
    const child = spawn(codeBin, [repoPath], {
      detached: true,
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
    });
    child.on('error', () => {});
    child.unref();
    return { ok: true };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { ok: false, error: 'VS Code CLI (`code`) not found on PATH' };
    }
    return { ok: false, error: err.message };
  }
});

// Git data IPC — reads git info from game repos
ipcMain.handle('git:get-data', async (event, repoPath) => {
  const { execSync } = require('child_process');
  try {
    const opts = { cwd: repoPath, encoding: 'utf-8', timeout: 10000 };
    const log = execSync('git log --oneline --decorate --format="%H|||%an|||%aI|||%s|||%D" -30', opts);
    const branches = execSync('git branch', opts);
    const diffStat = execSync('git diff --stat HEAD~5..HEAD --numstat 2>nul || echo ""', opts);
    return { ok: true, log, branches, diffStat };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Code stats IPC — scans repo for file info
ipcMain.handle('git:get-code-stats', async (event, repoPath) => {
  const { execSync } = require('child_process');
  try {
    const opts = { cwd: repoPath, encoding: 'utf-8', timeout: 15000, maxBuffer: 5 * 1024 * 1024 };
    // Get file list with line counts
    const files = execSync(
      'git ls-files | while read f; do echo "$f|||$(wc -l < "$f" 2>/dev/null || echo 0)"; done',
      opts
    );
    return { ok: true, files };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Git diff-since IPC — returns commits + numstat between two hashes
ipcMain.handle('git:get-diff-since', async (event, repoPath, sinceHash) => {
  const { execSync } = require('child_process');
  try {
    const opts = { cwd: repoPath, encoding: 'utf-8', timeout: 10000 };
    const commits = execSync(`git log --oneline ${sinceHash}..HEAD`, opts);
    const numstat = execSync(`git diff --numstat ${sinceHash}..HEAD`, opts);
    const head = execSync('git rev-parse HEAD', opts).trim();
    return { ok: true, commits, numstat, head };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── Automation: Schedule Timer (60s) ───
let scheduleTimer = null;

function startScheduleTimer() {
  if (scheduleTimer) return;
  const fsp = require('fs').promises;

  scheduleTimer = setInterval(async () => {
    try {
      const schedPath = PATHS.automation('schedules.json');
      const raw = await fsp.readFile(schedPath, 'utf-8');
      const schedules = JSON.parse(raw);

      const now = new Date();
      const day = now.getDay(); // 0=Sun, 1=Mon
      const date = now.getDate();

      for (const sched of schedules) {
        if (!sched.enabled) continue;

        let shouldFire = false;
        const lastRun = sched.lastRun ? new Date(sched.lastRun) : null;
        const hoursSinceLast = lastRun ? (now - lastRun) / (1000 * 60 * 60) : Infinity;

        switch (sched.frequency) {
          case 'daily':
            shouldFire = hoursSinceLast >= 20; // At least 20h between runs
            break;
          case 'weekly':
            shouldFire = day === 1 && hoursSinceLast >= 144; // Monday, ~6 days gap
            break;
          case 'biweekly':
            shouldFire = day === 1 && hoursSinceLast >= 312; // Monday, ~13 days gap
            break;
          case 'monthly':
            shouldFire = date === 1 && hoursSinceLast >= 648; // 1st of month, ~27 days gap
            break;
        }

        if (shouldFire) {
          console.log(`[Forge Scheduler] Firing schedule: ${sched.agentName} — ${sched.action}`);
          sched.lastRun = now.toISOString();

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('automation:schedule-fired', sched);
          }

          // Auto-send email report if applicable
          tryAutoSendReport(sched);
        }
      }

      // Write back updated lastRun times
      await fsp.writeFile(schedPath, JSON.stringify(schedules, null, 2), 'utf-8');
    } catch (err) {
      // File might not exist yet — that's fine
      if (err.code !== 'ENOENT') {
        console.warn('[Forge Scheduler] Error:', err.message);
      }
    }
  }, 60000); // 60 seconds
}

// ─── Automation: Git Poller (120s) ───
// Dynamically builds watch list from registered projects (hq-data/projects/*/project.json)
// instead of a static git-state.json file — no more stale project references.
let gitPollTimer = null;

function startGitPoller() {
  if (gitPollTimer) return;
  const fsp = require('fs').promises;
  const { exec } = require('child_process');
  const statePath = PATHS.automation('git-state.json');
  const projectsDir = PATHS.hq('projects');

  // Async wrapper for git commands — never blocks the main thread
  function gitExec(cmd, cwd) {
    return new Promise((resolve, reject) => {
      exec(cmd, { cwd, encoding: 'utf-8', timeout: 10000, windowsHide: true }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout);
      });
    });
  }

  gitPollTimer = setInterval(async () => {
    try {
      // Build watch list from registered projects that have a repoPath
      let entries;
      try { entries = await fsp.readdir(projectsDir, { withFileTypes: true }); } catch { return; }

      const watchList = {};
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
        try {
          const projRaw = await fsp.readFile(path.join(projectsDir, entry.name, 'project.json'), 'utf-8');
          const proj = JSON.parse(projRaw);
          if (proj.repoPath) {
            watchList[proj.slug || entry.name] = proj.repoPath;
          }
        } catch {
          // No project.json or invalid — skip
        }
      }

      if (Object.keys(watchList).length === 0) return;

      // Load saved head state (keyed by slug)
      let gitState = {};
      try {
        const raw = await fsp.readFile(statePath, 'utf-8');
        gitState = JSON.parse(raw);
      } catch {
        // First run or corrupt — start fresh
      }

      // Prune slugs that are no longer in the watch list
      for (const slug of Object.keys(gitState)) {
        if (!watchList[slug]) delete gitState[slug];
      }

      for (const [slug, repoPath] of Object.entries(watchList)) {
        if (!gitState[slug]) gitState[slug] = { lastHead: null, repoPath };
        gitState[slug].repoPath = repoPath; // keep in sync

        try {
          const currentHead = (await gitExec('git rev-parse HEAD', repoPath)).trim();

          if (gitState[slug].lastHead && gitState[slug].lastHead !== currentHead) {
            console.log(`[Forge GitPoller] Change detected in ${slug}: ${gitState[slug].lastHead?.slice(0,8)} → ${currentHead.slice(0,8)}`);

            // Get diff details
            const commits = await gitExec(`git log --oneline ${gitState[slug].lastHead}..HEAD`, repoPath);
            const numstat = await gitExec(`git diff --numstat ${gitState[slug].lastHead}..HEAD`, repoPath);

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('automation:git-change', {
                slug,
                repoPath,
                previousHead: gitState[slug].lastHead,
                currentHead,
                commits,
                numstat,
              });
            }
          }

          gitState[slug].lastHead = currentHead;
        } catch (err) {
          // Repo might not be a git repo or be inaccessible — skip silently
        }
      }

      // Write back updated state
      await fsp.writeFile(statePath, JSON.stringify(gitState, null, 2), 'utf-8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[Forge GitPoller] Error:', err.message);
      }
    }
  }, 120000); // 120 seconds
}

// ─── Port Monitor (15s health check + shared manifest) ───
const APP_ID = 'forge';
const PORTS_MANIFEST_PATH = PATHS.hq('ports.json');
const INFRA_PORTS = [
  { port: 5180, service: 'Vite Dev' },
  { port: 3100, service: 'Friday Server' },
];
// Common dev ports to scan for unregistered occupants
const SCAN_PORTS = [3000, 3100, 5173, 5174, 5180, 8000, 8080, 8081];
let portMonitorTimer = null;

function checkPort(port, timeout = 2000) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    const start = Date.now();
    socket.setTimeout(timeout);
    socket.on('connect', () => { socket.destroy(); resolve({ port, up: true, latencyMs: Date.now() - start }); });
    socket.on('timeout', () => { socket.destroy(); resolve({ port, up: false, latencyMs: timeout }); });
    socket.on('error', () => { socket.destroy(); resolve({ port, up: false, latencyMs: Date.now() - start }); });
    socket.connect(port, '127.0.0.1');
  });
}

function readPortsManifest() {
  try {
    return JSON.parse(fs.readFileSync(PORTS_MANIFEST_PATH, 'utf-8'));
  } catch {
    return { registrations: [] };
  }
}

function writePortsManifest(manifest) {
  try {
    fs.mkdirSync(path.dirname(PORTS_MANIFEST_PATH), { recursive: true });
    fs.writeFileSync(PORTS_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Forge PortMonitor] Write failed:', err.message);
  }
}

function registerPorts() {
  const manifest = readPortsManifest();
  // Remove stale entries from this app
  manifest.registrations = manifest.registrations.filter(r => r.app !== APP_ID);

  const now = new Date().toISOString();
  // Add infrastructure ports
  for (const p of INFRA_PORTS) {
    manifest.registrations.push({
      port: p.port, service: p.service, app: APP_ID,
      project: null, pid: process.pid, registeredAt: now,
    });
  }

  // Add project ports from project.json files
  const projectsDir = PATHS.hq('projects');
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      try {
        const proj = JSON.parse(fs.readFileSync(path.join(projectsDir, entry.name, 'project.json'), 'utf-8'));
        if (proj.ports) {
          for (const [label, info] of Object.entries(proj.ports)) {
            const portNum = typeof info === 'number' ? info : info?.port;
            if (portNum) {
              manifest.registrations.push({
                port: portNum, service: label, app: APP_ID,
                project: proj.slug || entry.name, pid: null, registeredAt: now,
              });
            }
          }
        }
      } catch {}
    }
  } catch {}

  // Prune stale entries from other apps (PID check)
  manifest.registrations = manifest.registrations.filter(r => {
    if (!r.pid || r.app === APP_ID) return true;
    try { process.kill(r.pid, 0); return true; } catch { return false; }
  });

  writePortsManifest(manifest);
  console.log(`[Forge PortMonitor] Registered ${INFRA_PORTS.length} infra ports + project ports`);
}

function unregisterPorts() {
  const manifest = readPortsManifest();
  manifest.registrations = manifest.registrations.filter(r => r.app !== APP_ID);
  writePortsManifest(manifest);
  console.log('[Forge PortMonitor] Unregistered all ports');
}

async function runHealthCheck() {
  const manifest = readPortsManifest();
  const registered = manifest.registrations || [];
  const registeredPorts = new Set(registered.map(r => r.port));

  // Check all registered ports
  const results = [];
  for (const reg of registered) {
    const check = await checkPort(reg.port);
    results.push({
      port: reg.port, service: reg.service, app: reg.app,
      project: reg.project, status: check.up ? 'up' : 'down', latencyMs: check.latencyMs,
    });
  }

  // Scan common ports for unregistered occupants
  for (const p of SCAN_PORTS) {
    if (registeredPorts.has(p)) continue;
    const check = await checkPort(p, 1000);
    if (check.up) {
      results.push({
        port: p, service: 'Unknown', app: null,
        project: null, status: 'occupied', latencyMs: check.latencyMs,
      });
    }
  }

  // Detect collisions (same port claimed by multiple registrations)
  const portCounts = {};
  for (const reg of registered) {
    if (!portCounts[reg.port]) portCounts[reg.port] = [];
    portCounts[reg.port].push(reg);
  }
  const collisions = [];
  for (const [port, regs] of Object.entries(portCounts)) {
    if (regs.length > 1) {
      collisions.push({ port: Number(port), claimedBy: regs.map(r => ({ service: r.service, app: r.app, project: r.project })) });
    }
  }

  return { health: results, collisions };
}

function startPortMonitor() {
  if (portMonitorTimer) return;
  registerPorts();

  // Run first health check immediately (after a short delay to let servers start)
  setTimeout(async () => {
    try {
      const result = await runHealthCheck();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ports:status', result);
      }
    } catch (err) {
      console.warn('[Forge PortMonitor] Initial check error:', err.message);
    }
  }, 5000);

  portMonitorTimer = setInterval(async () => {
    try {
      const result = await runHealthCheck();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ports:status', result);
      }
    } catch (err) {
      console.warn('[Forge PortMonitor] Error:', err.message);
    }
  }, 15000);

  // Run initial check after 3s (give services time to start)
  setTimeout(async () => {
    try {
      const result = await runHealthCheck();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ports:status', result);
      }
    } catch {}
  }, 3000);
}

ipcMain.handle('ports:refresh', async () => {
  try {
    const result = await runHealthCheck();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ports:status', result);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── Report Generation & Email ───
const { generateDailyReport, generateWeeklyReport } = require('./reportGenerator.cjs');

function archiveReport(type, report) {
  try {
    const fsx = require('fs');
    const archiveDir = PATHS.reports();
    if (!fsx.existsSync(archiveDir)) fsx.mkdirSync(archiveDir, { recursive: true });
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${stamp}-${type}-report.html`;
    fsx.writeFileSync(path.join(archiveDir, filename), report.html, 'utf-8');
    console.log(`[Forge Report] Archived ${filename}`);
  } catch (err) {
    console.warn('[Forge Report] Archive failed:', err.message);
  }
}

ipcMain.handle('report:generate', async (event, type) => {
  try {
    const report = type === 'weekly' ? generateWeeklyReport() : generateDailyReport();
    archiveReport(type, report);
    return { ok: true, ...report };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('report:send-email', async (event, { type, forceEmail }) => {
  const fsp = require('fs').promises;
  try {
    const configPath = PATHS.automation('email-config.json');
    const raw = await fsp.readFile(configPath, 'utf-8');
    const config = JSON.parse(raw);

    if (!config.enabled && !forceEmail) {
      return { ok: false, error: 'Email not enabled. Set enabled:true in hq-data/automation/email-config.json' };
    }
    if (!config.apiKey) {
      return { ok: false, error: 'No API key. Sign up free at resend.com and paste your key in email-config.json' };
    }
    if (!config.recipient) {
      return { ok: false, error: 'No recipient email set in email-config.json' };
    }

    const report = type === 'weekly' ? generateWeeklyReport() : generateDailyReport();

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${config.fromName || 'The Forge'} <onboarding@resend.dev>`,
        to: [config.recipient],
        subject: report.subject,
        html: report.html,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Resend API ${resp.status}: ${body}`);
    }

    console.log(`[Forge Email] Sent ${type} report to ${config.recipient}`);
    return { ok: true, sent: true, recipient: config.recipient };
  } catch (err) {
    console.error('[Forge Email] Failed:', err.message);
    return { ok: false, error: err.message };
  }
});

// Auto-send reports when schedules fire for the studio-producer daily/weekly reports
function tryAutoSendReport(schedule) {
  if (schedule.agentId !== 'studio-producer') return;
  const action = schedule.action.toLowerCase();
  const fsp = require('fs').promises;

  let type = null;
  if (action.includes('daily') && action.includes('report')) type = 'daily';
  if (action.includes('weekly') && action.includes('report')) type = 'weekly';
  if (action.includes('weekly') && action.includes('plan')) type = 'weekly';
  if (!type) return;

  const configPath = PATHS.automation('email-config.json');
  fsp.readFile(configPath, 'utf-8').then(raw => {
    const config = JSON.parse(raw);
    if (!config.enabled || !config.apiKey || !config.recipient) return;
    if (type === 'daily' && !config.sendDaily) return;
    if (type === 'weekly' && !config.sendWeekly) return;

    const report = type === 'weekly' ? generateWeeklyReport() : generateDailyReport();
    archiveReport(type, report);

    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${config.fromName || 'The Forge'} <onboarding@resend.dev>`,
        to: [config.recipient],
        subject: report.subject,
        html: report.html,
      }),
    }).then(resp => {
      if (resp.ok) {
        console.log(`[Forge Email] Auto-sent ${type} report to ${config.recipient}`);
      } else {
        resp.text().then(body => console.warn(`[Forge Email] Auto-send failed: ${resp.status} ${body}`));
      }
    }).catch(err => {
      console.warn(`[Forge Email] Auto-send failed:`, err.message);
    });
  }).catch(() => {});
}

// ─── Agent Skill File IPC ───
const AGENTS_DIR = path.join(__dirname, '..', 'agents');

ipcMain.handle('agent:read-skill', async (event, fileName) => {
  const fsp = require('fs').promises;
  // Validate: no path traversal, must end in .md
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\') || !fileName.endsWith('.md')) {
    return { ok: false, error: 'Invalid file name' };
  }
  try {
    const content = await fsp.readFile(path.join(AGENTS_DIR, fileName), 'utf-8');
    return { ok: true, data: content };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('agent:write-skill', async (event, fileName, content) => {
  const fsp = require('fs').promises;
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\') || !fileName.endsWith('.md')) {
    return { ok: false, error: 'Invalid file name' };
  }
  try {
    await fsp.writeFile(path.join(AGENTS_DIR, fileName), content, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── Secrets Management (Encrypted) ───
const SECRETS_PATH = path.join(app.getPath('userData'), 'secrets.enc');

function readSecrets() {
  try {
    if (!fs.existsSync(SECRETS_PATH)) return {};
    const encrypted = fs.readFileSync(SECRETS_PATH);
    if (safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(encrypted);
      return JSON.parse(decrypted);
    }
    // Fallback: if safeStorage not available, file is stored as-is (dev mode)
    return JSON.parse(encrypted.toString('utf-8'));
  } catch (err) {
    console.warn('[Forge Secrets] Read failed:', err.message);
    return {};
  }
}

function writeSecrets(data) {
  try {
    const json = JSON.stringify(data);
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(json);
      fs.writeFileSync(SECRETS_PATH, encrypted);
    } else {
      // Fallback: plain JSON (dev mode only)
      fs.writeFileSync(SECRETS_PATH, json, 'utf-8');
    }
  } catch (err) {
    console.error('[Forge Secrets] Write failed:', err.message);
    throw err;
  }
}

ipcMain.handle('secrets:get-status', async () => {
  const secrets = readSecrets();
  const status = {};
  for (const [platform, creds] of Object.entries(secrets)) {
    status[platform] = { connected: true };
  }
  // Fill missing platforms
  for (const p of ['twitter', 'discord', 'reddit', 'instagram', 'resend', 'groq']) {
    if (!status[p]) status[p] = { connected: false };
  }
  return status;
});

ipcMain.handle('secrets:get', async (event, platform) => {
  const secrets = readSecrets();
  return secrets[platform] || null;
});

ipcMain.handle('secrets:set', async (event, platform, credentials) => {
  const secrets = readSecrets();
  secrets[platform] = { ...credentials, connected: true };
  writeSecrets(secrets);
  console.log(`[Forge Secrets] ${platform} credentials saved`);
  return { ok: true };
});

ipcMain.handle('secrets:remove', async (event, platform) => {
  const secrets = readSecrets();
  delete secrets[platform];
  writeSecrets(secrets);
  console.log(`[Forge Secrets] ${platform} credentials removed`);
  return { ok: true };
});

ipcMain.handle('secrets:post', async (event, platform, postData) => {
  const secrets = readSecrets();
  const creds = secrets[platform];
  if (!creds) {
    return { ok: false, error: `${platform} not connected` };
  }

  try {
    switch (platform) {
      case 'discord': {
        if (!creds.webhookUrl) throw new Error('No webhook URL');
        const resp = await fetch(creds.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: postData.text,
            username: postData.username || 'Game Studio',
          }),
        });
        if (!resp.ok) throw new Error(`Discord ${resp.status}: ${await resp.text()}`);
        return { ok: true, platform: 'discord' };
      }
      case 'twitter': {
        // Twitter API v2 tweet creation
        if (!creds.bearerToken) throw new Error('No bearer token');
        const resp = await fetch('https://api.twitter.com/2/tweets', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${creds.bearerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: postData.text }),
        });
        if (!resp.ok) throw new Error(`Twitter ${resp.status}: ${await resp.text()}`);
        return { ok: true, platform: 'twitter' };
      }
      default:
        return { ok: false, error: `Posting to ${platform} not yet implemented` };
    }
  } catch (err) {
    console.error(`[Forge Secrets] Post to ${platform} failed:`, err.message);
    return { ok: false, error: err.message };
  }
});

// ─── Social Post Notification Timer (5min) ───
let socialNotifTimer = null;

function startSocialNotifTimer() {
  if (socialNotifTimer) return;
  const fsp = require('fs').promises;

  socialNotifTimer = setInterval(async () => {
    try {
      // Scan all projects for social-hub.json
      const projectsDir = PATHS.hq('projects');
      const entries = await fsp.readdir(projectsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const hubPath = path.join(projectsDir, entry.name, 'social-hub.json');
        try {
          const raw = await fsp.readFile(hubPath, 'utf-8');
          const data = JSON.parse(raw);
          const now = new Date();

          for (const post of (data.posts || [])) {
            if (post.status !== 'scheduled' || !post.scheduledAt) continue;
            const scheduled = new Date(post.scheduledAt);
            if (scheduled <= now) {
              // Fire notification
              if (Notification.isSupported()) {
                const notif = new Notification({
                  title: 'Social Post Due',
                  body: `${post.platform}: ${(post.content?.text || '').slice(0, 100)}`,
                  silent: false,
                });
                notif.show();
              }
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('social:post-due', { project: entry.name, post });
              }
            }
          }
        } catch {} // File doesn't exist or parse error — skip
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[Forge SocialNotif] Error:', err.message);
      }
    }
  }, 300000); // 5 minutes
}

// ─── Social Campaign Timer (checks every 5 min if a campaign should fire) ───
let campaignTimer = null;

function startCampaignTimer() {
  if (campaignTimer) return;
  const fsp = require('fs').promises;

  campaignTimer = setInterval(async () => {
    try {
      const projectsDir = PATHS.hq('projects');
      const entries = await fsp.readdir(projectsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const hubPath = path.join(projectsDir, entry.name, 'social-hub.json');
        try {
          const raw = await fsp.readFile(hubPath, 'utf-8');
          const data = JSON.parse(raw);
          const campaigns = data.campaigns || [];
          const now = new Date();
          const todayKey = now.toISOString().slice(0, 10);
          const currentHHMM = now.toTimeString().slice(0, 5);

          for (const campaign of campaigns) {
            if (!campaign.enabled || !campaign.autoPost) continue;

            // Check if already fired today
            if (campaign.lastFiredAt) {
              const lastDay = campaign.lastFiredAt.slice(0, 10);
              if (lastDay === todayKey) continue; // already fired today
            }

            // Check cadence
            if (campaign.cadence === 'weekly' && campaign.dayOfWeek != null) {
              if (now.getDay() !== campaign.dayOfWeek) continue;
            }

            // Check time (fire if current time >= configured time)
            if (currentHHMM >= (campaign.time || '10:00')) {
              // Signal the renderer to fire this campaign
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('social:campaign-due', {
                  project: entry.name,
                  campaignId: campaign.id,
                });
              }
            }
          }
        } catch {} // File doesn't exist — skip
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[Forge CampaignTimer] Error:', err.message);
      }
    }
  }, 300000); // 5 minutes
}

// ─── Discord Bot Integration ───
const discordBot = require('./discordBot.cjs');

ipcMain.handle('discord:connect', async (event, { token, guildId, channelId }) => {
  try {
    const result = await discordBot.connect(token, guildId, channelId);

    // Register real-time message listener → push to renderer
    discordBot.onMessage((msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('discord:message-received', msg);
      }
    });

    return result;
  } catch (err) {
    console.error('[Forge Discord] Connect failed:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('discord:disconnect', async () => {
  discordBot.disconnect();
  return { ok: true };
});

ipcMain.handle('discord:get-status', async () => {
  return discordBot.getStatus();
});

ipcMain.handle('discord:get-messages', async (event, { limit }) => {
  try {
    const messages = await discordBot.getMessages(limit || 50);
    return { ok: true, messages };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('discord:send-message', async (event, { content }) => {
  try {
    const msg = await discordBot.sendMessage(content);
    return { ok: true, message: msg };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('discord:post-agent-message', async (event, { agentId, text }) => {
  try {
    await discordBot.postAgentMessage(agentId, text);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('discord:setup-webhooks', async () => {
  try {
    const result = await discordBot.setupWebhooks();
    return result;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── Groq API (Council Chat LLM) ───
let groqUsage = { requestsToday: 0, tokensToday: 0, date: new Date().toISOString().slice(0, 10) };

function getGroqSecret() {
  const secrets = readSecrets();
  return secrets.groq;
}

function resetGroqUsageIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (groqUsage.date !== today) {
    groqUsage = { requestsToday: 0, tokensToday: 0, date: today };
  }
}

ipcMain.handle('groq:generate', async (event, { systemPrompt, userMessage, maxTokens }) => {
  const creds = getGroqSecret();
  if (!creds?.apiKey) return { ok: false, error: 'No Groq API key configured' };

  resetGroqUsageIfNewDay();
  if (groqUsage.requestsToday >= 14400) {
    return { ok: false, error: 'Daily request limit reached (14,400)' };
  }

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens || 150,
        temperature: 0.9,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Groq ${resp.status}: ${body}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};

    groqUsage.requestsToday++;
    groqUsage.tokensToday += (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);

    writeMeteringRecord({
      id: meterRecordId(),
      timestamp: new Date().toISOString(),
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      source: 'council-chat',
      agent: null,
      agentSlug: null,
      project: null,
      linkType: null,
      linkId: null,
      tokens: {
        input: usage?.prompt_tokens || 0,
        output: usage?.completion_tokens || 0,
        total: (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0),
        estimated: false,
      },
      durationMs: 0,
      status: 'completed',
    });

    return {
      ok: true,
      content,
      tokensUsed: { prompt: usage.prompt_tokens || 0, completion: usage.completion_tokens || 0 },
    };
  } catch (err) {
    console.error('[Forge Groq] API call failed:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('groq:get-usage', () => {
  resetGroqUsageIfNewDay();
  return {
    requestsToday: groqUsage.requestsToday,
    dailyLimit: 14400,
    tokensToday: groqUsage.tokensToday,
    resetTime: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
  };
});

// ─── Friday WebSocket Bridge ───────────────────────────────────────────
const WebSocket = require('ws');

let fridayWs = null;
let fridayReconnectTimer = null;
let fridayReconnectAttempts = 0;
const FRIDAY_MAX_RECONNECT = 10;
const FRIDAY_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

// ─── Friday Server PTY Management ─────────────────────────────────────────
let fridayServerPty = null;
let fridayServerStatus = 'stopped'; // 'stopped' | 'starting' | 'running' | 'crashed'

function fridayReconnectDelay() {
  const idx = Math.min(fridayReconnectAttempts, FRIDAY_RECONNECT_DELAYS.length - 1);
  return FRIDAY_RECONNECT_DELAYS[idx];
}

function fridaySendStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('friday:status', status);
  }
}

function fridayConnect(url) {
  // Cancel any pending reconnect timer to prevent duplicate connections
  if (fridayReconnectTimer) {
    clearTimeout(fridayReconnectTimer);
    fridayReconnectTimer = null;
  }
  if (fridayWs) {
    try { fridayWs.close(); } catch {}
    fridayWs = null;
  }

  console.log(`[Forge Friday] Connecting to ${url}...`);
  fridaySendStatus('connecting');

  try {
    const ws = new WebSocket(url);
    fridayWs = ws;

    ws.on('open', () => {
      if (fridayWs !== ws) { console.log('[Forge Friday] Ignoring stale socket open event'); return; }

      console.log('[Forge Friday] ✓ Connected — sending session:identify');
      fridayReconnectAttempts = 0;
      fridayAudioChunksSent = 0;
      fridaySendStatus('connected');
      ws.send(JSON.stringify({ type: 'session:identify', id: crypto.randomUUID(), clientType: 'chat' }));
      setTimeout(() => {
        if (fridayWs && fridayWs.readyState === 1) {
          fridayWs.send(JSON.stringify({ type: 'mobile:list-sessions' }));
        }
      }, 1000);
    });

    let fridayAudioChunksReceived = 0;
    ws.on('message', (data, isBinary) => {
      if (fridayWs !== ws) return;
      if (isBinary) {
        fridayAudioChunksReceived++;
        if (fridayAudioChunksReceived % 50 === 1) {
          console.log(`[Forge Friday] ← audio chunk #${fridayAudioChunksReceived} (${data.length} bytes)`);
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('friday:audio-in', data);
        }
        return;
      }
      try {
        const msg = JSON.parse(data.toString());
        // Handle forge:command messages from Friday
        if (msg.type === 'forge:command') {
          console.log(`[Forge Friday] Command received: ${msg.command} (confirmRequired=${msg.confirmRequired})`);
          fridayPendingCommands.set(msg.commandId, { command: msg.command, args: msg.args });

          if (msg.confirmRequired) {
            mainWindow.webContents.send('friday:command-confirm', {
              commandId: msg.commandId,
              command: msg.command,
              args: msg.args,
            });
          } else {
            executeFridayCommand(msg.commandId, msg.command, msg.args);
          }
          return;
        }

        // Mobile terminal bridge messages
        if (msg.type === 'mobile:terminal:subscribe') {
          const { scopeId } = msg;
          const entry = ptyProcesses.get(scopeId);
          const proc = entry?.proc || entry;
          if (proc && proc.onData) {
            if (!proc._mobileSubscribed) {
              proc._mobileSubscribed = true;
              proc.onData((data) => {
                if (fridayWs && fridayWs.readyState === 1) {
                  fridayWs.send(JSON.stringify({
                    type: 'mobile:terminal:data',
                    scopeId,
                    data,
                  }));
                }
              });
              proc.onExit(({ exitCode }) => {
                if (fridayWs && fridayWs.readyState === 1) {
                  fridayWs.send(JSON.stringify({
                    type: 'mobile:terminal:exit',
                    scopeId,
                    exitCode,
                  }));
                }
              });
            }
            console.log(`[Mobile] Subscribed to terminal: ${scopeId}`);
          } else {
            console.log(`[Mobile] Terminal not found: ${scopeId}`);
          }
        }

        if (msg.type === 'mobile:terminal:input') {
          const { scopeId, data } = msg;
          const entry = ptyProcesses.get(scopeId);
          const proc = entry?.proc || entry;
          if (proc) {
            proc.write(data);
            console.log(`[Mobile] Input sent to terminal ${scopeId}: ${data.length} chars`);
          }
        }

        if (msg.type === 'mobile:terminal:unsubscribe') {
          const { scopeId } = msg;
          console.log(`[Mobile] Unsubscribed from terminal: ${scopeId}`);
        }

        if (msg.type === 'mobile:list-sessions') {
          const sessions = [];
          for (const [scopeId, entry] of ptyProcesses.entries()) {
            const proc = entry?.proc || entry;
            if (proc && !proc.killed) {
              sessions.push({
                scopeId,
                project: entry?.projectSlug || 'unknown',
                agent: entry?.agentSlug || 'unknown',
                taskDescription: entry?.taskDescription || '',
              });
            }
          }
          fridayWs.send(JSON.stringify({
            type: 'mobile:terminal:sessions',
            sessions,
          }));
        }

        // Voice audio comes as JSON with base64 delta — decode and relay as binary for playback
        if (msg.type === 'voice:audio' && msg.delta) {
          const pcm = Buffer.from(msg.delta, 'base64');
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('friday:audio-in', pcm);
          }
          return;
        }
        // Voice state changes get their own IPC channel
        if (msg.type === 'voice:state' && msg.state) {
          console.log(`[Forge Friday] ← voice:state → ${msg.state}`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('friday:voice-state', msg.state);
          }
          return;
        }
        // Voice transcripts — relay to renderer for display
        if (msg.type === 'voice:transcript') {
          console.log(`[Forge Friday] ← voice:transcript role=${msg.role} done=${msg.done} delta="${(msg.delta || '').slice(0, 60)}"`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('friday:message', msg);
          }
          return;
        }
        // Voice started/stopped/error — log and relay
        if (msg.type === 'voice:started' || msg.type === 'voice:stopped' || msg.type === 'voice:error') {
          console.log(`[Forge Friday] ← ${msg.type}${msg.code ? ` code=${msg.code}` : ''}${msg.message ? ` msg=${msg.message}` : ''}`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('friday:message', msg);
          }
          return;
        }
        console.log(`[Forge Friday] ← msg: type=${msg.type}${msg.requestId ? ` req=${msg.requestId}` : ''}${msg.code ? ` code=${msg.code}` : ''}${msg.message ? ` message="${msg.message.slice(0, 120)}"` : ''}${msg.text ? ` text="${msg.text.slice(0, 60)}..."` : ''}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('friday:message', msg);
        }
      } catch (err) {
        console.warn('[Forge Friday] Bad message parse:', err.message, '— raw:', data.toString().slice(0, 200));
      }
    });

    ws.on('close', (code, reason) => {
      const reasonStr = reason ? ` reason="${reason.toString()}"` : '';
      console.log(`[Forge Friday] Disconnected (code=${code}${reasonStr}) audioIn=${fridayAudioChunksReceived} audioOut=${fridayAudioChunksSent}`);
      if (fridayWs === ws) fridayWs = null;
      if (code !== 1000 && fridayReconnectAttempts < FRIDAY_MAX_RECONNECT) {
        const delay = fridayReconnectDelay();
        fridayReconnectAttempts++;
        console.log(`[Forge Friday] Reconnecting in ${delay}ms (attempt ${fridayReconnectAttempts}/${FRIDAY_MAX_RECONNECT})`);
        fridaySendStatus('reconnecting');
        fridayReconnectTimer = setTimeout(() => fridayConnect(url), delay);
      } else {
        if (fridayReconnectAttempts >= FRIDAY_MAX_RECONNECT) {
          console.error(`[Forge Friday] Max reconnect attempts (${FRIDAY_MAX_RECONNECT}) reached — giving up`);
        }
        fridaySendStatus('disconnected');
      }
    });

    ws.on('error', (err) => {
      console.error('[Forge Friday] WebSocket error:', err.message);
    });

  } catch (err) {
    console.error('[Forge Friday] Connection failed:', err.message);
    fridaySendStatus('disconnected');
  }
}

function fridayDisconnect() {
  if (fridayReconnectTimer) {
    clearTimeout(fridayReconnectTimer);
    fridayReconnectTimer = null;
  }
  fridayReconnectAttempts = FRIDAY_MAX_RECONNECT;
  if (fridayWs) {
    try { fridayWs.close(1000); } catch {}
    fridayWs = null;
  }
  fridaySendStatus('disconnected');
  console.log('[Forge Friday] Disconnected (user-initiated)');
}

ipcMain.handle('friday:connect', async (event, url) => {
  fridayConnect(url);
  return { ok: true };
});

ipcMain.handle('friday:disconnect', async () => {
  fridayDisconnect();
  return { ok: true };
});

ipcMain.handle('friday:get-status', async () => {
  if (fridayWs && fridayWs.readyState === WebSocket.OPEN) return 'connected';
  if (fridayReconnectTimer) return 'reconnecting';
  return 'disconnected';
});

// ─── Main Process Log IPC ─────────────────────────────────────────────────
ipcMain.handle('main:get-logs', () => {
  return logRingBuffer;
});

// ─── Friday Server PTY ───────────────────────────────────────────────────
const fridayOutputBuffer = []; // Buffer output until renderer is ready

async function startFridayServer() {
  if (fridayServerPty) {
    console.log('[Forge Friday] Server PTY already running — ignoring start request');
    return { ok: true, scopeId: 'friday-server' };
  }

  const fridayCwd = path.join(__dirname, '..', 'friday');
  console.log(`[Forge Friday] Spawning server PTY in ${fridayCwd}`);
  fridayServerStatus = 'starting';

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('friday:process-status', 'starting');
  }

  try {
    if (!fs.existsSync(fridayCwd)) {
      const errMsg = `[Forge] Error: Friday directory not found at ${fridayCwd}`;
      console.error(errMsg);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', { scopeId: 'friday-server', data: errMsg + '\r\n' });
        mainWindow.webContents.send('friday:process-status', 'crashed');
      }
      fridayServerStatus = 'crashed';
      return { ok: false, error: 'Friday directory not found' };
    }

    const fridayEnv = { ...process.env, TERM: 'xterm-256color' };
    const secrets = readSecrets();
    if (secrets.friday?.apiKey) {
      fridayEnv.XAI_API_KEY = secrets.friday.apiKey;
      console.log('[Forge Friday] Injected XAI_API_KEY from secrets store');
    } else {
      console.warn('[Forge Friday] No xAI API key found in secrets — Friday may fail to respond');
    }
    fridayEnv.FORGE_HQ_DATA_DIR = PATHS.hqData;
    console.log(`[Forge Friday] HQ data path: ${PATHS.hqData}`);

    const bunCmd = process.platform === 'win32' ? 'bun.cmd' : 'bun';
    const proc = pty.spawn(bunCmd, ['run', 'serve'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: fridayCwd,
      env: fridayEnv,
      useConptyDll: true,
    });

    fridayServerPty = proc;
    ptyProcesses.set('friday-server', { proc, scope: '__srv__' });
    console.log(`[Forge Friday] Server PTY spawned, pid=${proc.pid}`);

    proc.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', { scopeId: 'friday-server', data });
      } else {
        fridayOutputBuffer.push(data);
      }

      if (fridayServerStatus === 'starting' && (data.includes('Friday online') || data.includes('listening on'))) {
        console.log('[Forge Friday] Server ready detected — auto-connecting WebSocket');
        fridayServerStatus = 'running';
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('friday:process-status', 'running');
        }
        const url = 'ws://localhost:3100/ws';
        fridayConnect(url);
      }
    });

    proc.onExit(({ exitCode }) => {
      console.log(`[Forge Friday] Server PTY exited with code ${exitCode}`);
      fridayServerPty = null;
      ptyProcesses.delete('friday-server');

      const wasRunning = fridayServerStatus === 'running' || fridayServerStatus === 'starting';
      fridayServerStatus = (exitCode === 0 || !wasRunning) ? 'stopped' : 'crashed';

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', { scopeId: 'friday-server', exitCode });
        mainWindow.webContents.send('friday:process-status', fridayServerStatus);
      }
    });

    return { ok: true, scopeId: 'friday-server' };
  } catch (err) {
    console.error('[Forge Friday] Failed to spawn server PTY:', err);
    fridayServerStatus = 'crashed';
    if (mainWindow && !mainWindow.isDestroyed()) {
      const errMsg = err.message?.includes('ENOENT')
        ? "[Forge] Error: 'bun' not found. Install Bun (https://bun.sh) to run the Friday server.\r\n"
        : `[Forge] Error: Failed to start Friday server: ${err.message}\r\n`;
      mainWindow.webContents.send('terminal:data', { scopeId: 'friday-server', data: errMsg });
      mainWindow.webContents.send('friday:process-status', 'crashed');
    }
    return { ok: false, error: err.message };
  }
}

ipcMain.handle('friday:start-server', async () => startFridayServer());

ipcMain.handle('friday:stop-server', async () => {
  if (!fridayServerPty) {
    console.log('[Forge Friday] No server PTY to stop');
    return { ok: true };
  }

  console.log('[Forge Friday] Stopping server PTY');
  try { fridayServerPty.kill(); } catch (e) {
    console.error('[Forge Friday] Kill failed:', e);
  }
  fridayServerPty = null;
  ptyProcesses.delete('friday-server');
  fridayServerStatus = 'stopped';

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('friday:process-status', 'stopped');
  }

  fridayDisconnect();
  return { ok: true };
});

ipcMain.handle('friday:server-status', () => {
  return fridayServerStatus;
});

ipcMain.on('friday:send', (event, message) => {
  if (fridayWs && fridayWs.readyState === WebSocket.OPEN) {
    console.log(`[Forge Friday] → send: type=${message.type}${message.content ? ` content="${message.content.slice(0, 80)}..."` : ''}`);
    fridayWs.send(JSON.stringify(message));
  } else {
    console.warn(`[Forge Friday] Cannot send (type=${message.type}) — not connected (readyState=${fridayWs?.readyState ?? 'null'})`);
  }
});

ipcMain.on('friday:event', (event, coeEvent) => {
  if (fridayWs && fridayWs.readyState === WebSocket.OPEN) {
    console.log(`[Forge Friday] → event: ${coeEvent.event} — ${coeEvent.detail || ''}`);
    fridayWs.send(JSON.stringify({ type: 'forge:event', ...coeEvent }));
  } else {
    console.warn(`[Forge Friday] Cannot send event (${coeEvent.event}) — not connected`);
  }
});

// Audio relay: browser mic → Friday server
let fridayAudioChunksSent = 0;
ipcMain.on('friday:audio-out', (event, buffer) => {
  if (fridayWs && fridayWs.readyState === WebSocket.OPEN) {
    const buf = Buffer.from(buffer);
    fridayWs.send(buf);
    fridayAudioChunksSent++;
    if (fridayAudioChunksSent % 50 === 1) {
      // Debug: verify binary data integrity
      const view = new Int16Array(buf.buffer, buf.byteOffset, Math.min(10, buf.byteLength / 2));
      const samples = Array.from(view).slice(0, 5);
      console.log(`[Forge Friday] → audio chunk #${fridayAudioChunksSent} (${buf.byteLength} bytes, type=${typeof buffer}, isBuffer=${Buffer.isBuffer(buffer)}, first5samples=[${samples}])`);
    }
  } else {
    if (fridayAudioChunksSent % 100 === 0) {
      console.warn(`[Forge Friday] Audio dropped — ws not open (readyState=${fridayWs?.readyState ?? 'null'})`);
    }
  }
});

// ─── Friday Command Handling (Phase 3) ───
const fridayPendingCommands = new Map();

function executeFridayCommand(commandId, command, args) {
  console.log(`[Forge Friday] Executing: ${command}`, args);

  switch (command) {
    case 'spawn-agent': {
      const scopeId = `friday-${args.agent}-${Date.now()}`;
      const agentSkill = args.agent;
      const projectSlug = args.project;
      const instruction = args.instruction;

      // Review/recommendation agents run read-only: skip permissions but block all write tools
      const REVIEW_AGENTS = new Set([
        'solutions-architect', 'backend-engineer', 'frontend-engineer', 'devops-engineer',
        'data-engineer', 'security-auditor', 'qa-lead', 'product-owner',
        'ux-researcher', 'api-designer', 'performance-engineer', 'technical-writer',
        'project-manager', 'code-reviewer',
      ]);
      const dangerMode = REVIEW_AGENTS.has(agentSkill);
      console.log(`[Forge Friday] Spawning agent: @${agentSkill} on ${projectSlug} — "${instruction?.slice(0, 100)}" (scope=${scopeId})`);

      const cwd = resolveProjectCwd(projectSlug);
      console.log(`[Forge Friday] Agent cwd: ${cwd}`);
      const shell = process.platform === 'win32' ? (process.env.COMSPEC || 'cmd.exe') : (process.env.SHELL || 'bash');
      const shellArgs = [];
      const proc = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env: ptyEnv(),
      });

      ptyProcesses.set(scopeId, proc);

      let commandEchoed = false;
      let disallowedToolHits = new Set();
      proc.onData((data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:data', { scopeId, data });
        }
        // Wait for Claude Code to start before checking for tool-blocked errors
        if (!commandEchoed) {
          if (data.includes('Claude Code') || data.includes('claude-code')) commandEchoed = true;
        }
        if (!commandEchoed) return; // only skip tool detection, data already sent above
        // Detect actual tool-blocked errors from Claude Code runtime
        const blocked = data.match(/Tool (?:not allowed|is not allowed|blocked|denied|not permitted)[:\s]+(\w+)/i);
        if (blocked && !disallowedToolHits.has(blocked[1])) {
          disallowedToolHits.add(blocked[1]);
          console.warn(`[Forge Friday] Agent ${args.agent} hit blocked tool: ${blocked[1]}`);
          mainWindow.webContents.send('friday:task-update', {
            commandId,
            agent: args.agent,
            project: args.project,
            status: 'tool-blocked',
            scopeId,
            detail: blocked[1],
          });
        }
      });

      proc.onExit(({ exitCode }) => {
        console.log(`[Forge Friday] Agent PTY exited: ${scopeId} code=${exitCode}`);
        ptyProcesses.delete(scopeId);
        if (global.__sessionTracker) {
          try { global.__sessionTracker.markDormant(scopeId); } catch {}
        }
        mainWindow.webContents.send('terminal:exit', { scopeId, exitCode });
        mainWindow.webContents.send('friday:task-update', {
          commandId,
          agent: args.agent,
          project: args.project,
          status: 'completed',
          exitCode,
          scopeId,
        });
      });

      // Auto-launch claude with agent skill — write instruction to temp file to avoid shell quoting issues
      setTimeout(() => {
        const tmpFile = path.join(os.tmpdir(), `forge-friday-dispatch-${scopeId}.md`);
        const agentsFwd = PATHS.agentsDir.replace(/\\/g, '/');
        const projectFwd = PATHS.projects(projectSlug).replace(/\\/g, '/');
        const promptContent = [
          `You are @${agentSkill.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}. Load and follow the agent skill file at`,
          `${agentsFwd}/${agentSkill}.md`,
          ``,
          `Your current focus is the ${projectSlug} project.`,
          `Your working directory is the project's own repository: ${cwd.replace(/\\/g, '/')}`,
          `Studio data (project.json, features.json, context.md, recommendations) lives at ${projectFwd}/ — use absolute paths to read/write it.`,
          `Read ${projectFwd}/features.json and ${projectFwd}/context.md before responding.`,
          ``,
          `## Task`,
          instruction,
        ].join('\n');
        fs.writeFileSync(tmpFile, promptContent, 'utf-8');
        const briefPath = tmpFile.replace(/\\/g, '/');
        const dangerFlag = dangerMode ? '--dangerously-skip-permissions ' : '';
        const cmd = `claude ${dangerFlag}"Read the agent brief at ${briefPath}. Follow its instructions completely."`;
        console.log(`[Forge Friday] Agent PTY command (danger=${dangerMode}): ${cmd.slice(0, 200)}...`);
        if (global.__sessionTracker) {
          try {
            global.__sessionTracker.recordPendingSpawn({ cwd, scopeId, pid: proc.pid, agentSlug: agentSkill || null, projectSlug: projectSlug || null });
          } catch (err) {
            console.warn('[sessions] recordPendingSpawn failed:', err);
          }
        }
        proc.write(cmd + '\r\n');
      }, 1000);

      mainWindow.webContents.send('friday:task-update', {
        commandId,
        agent: args.agent,
        project: args.project,
        status: 'in-progress',
        scopeId,
      });
      break;
    }

    case 'spawn-implementation': {
      const { scopeId, cwd, prompt, mode, modelFlag, agentSlug, projectSlug, recommendationId } = args;
      const shell = process.platform === 'win32' ? (process.env.COMSPEC || 'cmd.exe') : (process.env.SHELL || 'bash');
      const proc = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: cwd || PATHS.forgeRoot,
        env: ptyEnv(),
      });

      ptyProcesses.set(scopeId, {
        proc,
        scope: '__impl__',
        projectSlug: projectSlug || 'unknown',
        agentSlug: agentSlug || 'unknown',
        taskDescription: (prompt || '').substring(0, 200),
      });

      proc.onData((data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:data', { scopeId, data });
        }
        if (fridayWs && fridayWs.readyState === 1 && proc._mobileSubscribed) {
          fridayWs.send(JSON.stringify({ type: 'mobile:terminal:data', scopeId, data }));
        }
      });

      proc.onExit(({ exitCode }) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:exit', { scopeId, exitCode });
        }
        if (fridayWs && fridayWs.readyState === 1) {
          fridayWs.send(JSON.stringify({ type: 'mobile:terminal:exit', scopeId, exitCode }));
        }
        ptyProcesses.delete(scopeId);
        if (global.__sessionTracker) {
          try { global.__sessionTracker.markDormant(scopeId); } catch {}
        }
      });

      // Write brief to temp file and auto-type the claude command
      const tmpFile = path.join(os.tmpdir(), `forge-${scopeId}.md`);
      fs.writeFileSync(tmpFile, prompt || '', 'utf-8');
      setTimeout(() => {
        const briefPath = tmpFile.replace(/\\/g, '/');
        const instruction = mode === 'plan'
          ? `Read the implementation brief at ${briefPath}. Create a detailed plan for how you would implement this. Do NOT start coding yet - present the plan and discuss it with me first.`
          : `Read the implementation brief at ${briefPath} and implement the recommended approach. Explore the codebase first.`;
        const modelArg = modelFlag ? `--model ${modelFlag}` : '';
        const cmd = ['claude', '--dangerously-skip-permissions', modelArg, `"${instruction}"`].filter(Boolean).join(' ');
        if (global.__sessionTracker) {
          try {
            global.__sessionTracker.recordPendingSpawn({ cwd: cwd || PATHS.forgeRoot, scopeId, pid: proc.pid, agentSlug: agentSlug || null, projectSlug: projectSlug || null, recommendationId: recommendationId || null });
          } catch (err) {
            console.warn('[sessions] recordPendingSpawn failed:', err);
          }
        }
        proc.write(cmd + '\r');
      }, 500);

      // Auto-subscribe for mobile streaming
      proc._mobileSubscribed = true;

      console.log(`[Mobile] Implementation spawned: ${scopeId} in ${cwd || PATHS.forgeRoot}`);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('friday:task-update', {
          commandId,
          agent: agentSlug || 'implementation',
          project: projectSlug || 'unknown',
          status: 'in-progress',
          scopeId,
        });
      }
      break;
    }

    case 'queue-task': {
      const taskQueuePath = PATHS.hq('task-queue.json');
      console.log(`[Forge Friday] Queue task: ${args.agents?.length || 0} agents, strategy=${args.strategy || 'parallel'}, project=${args.project}`);
      let queue = [];
      try { queue = JSON.parse(fs.readFileSync(taskQueuePath, 'utf-8')); } catch {}

      const task = {
        id: args.taskId,
        requested_by: 'friday',
        timestamp: new Date().toISOString(),
        project: args.project,
        agents: args.agents.map(a => ({ ...a, status: 'pending' })),
        strategy: args.strategy || 'parallel',
        status: 'approved',
      };

      queue.push(task);
      fs.writeFileSync(taskQueuePath, JSON.stringify(queue, null, 2), 'utf-8');

      if (task.strategy === 'parallel') {
        for (const agent of task.agents) {
          executeFridayCommand(
            `${commandId}-${agent.agent}`,
            'spawn-agent',
            { agent: agent.agent, project: args.project, instruction: agent.instruction }
          );
          agent.status = 'in-progress';
        }
      } else {
        const first = task.agents[0];
        executeFridayCommand(
          `${commandId}-${first.agent}`,
          'spawn-agent',
          { agent: first.agent, project: args.project, instruction: first.instruction }
        );
        first.status = 'in-progress';
      }

      fs.writeFileSync(taskQueuePath, JSON.stringify(queue, null, 2), 'utf-8');
      break;
    }

    case 'post-activity': {
      console.log(`[Forge Friday] Post activity: agent=${args.agent || 'Friday'} action="${args.action}" project=${args.project || 'none'}`);
      const logPath = PATHS.hq('activity-log.json');
      let entries = [];
      try { entries = JSON.parse(fs.readFileSync(logPath, 'utf-8')); } catch {}
      const nextId = entries.length > 0 ? Math.max(...entries.map(e => e.id || 0)) + 1 : 1;
      entries.push({
        id: nextId,
        agent: args.agent || 'Friday',
        agentColor: args.agentColor || '#D946EF',
        action: args.action,
        project: args.project || '',
        timestamp: new Date().toISOString(),
      });
      fs.writeFileSync(logPath, JSON.stringify(entries, null, 2), 'utf-8');
      break;
    }

    case 'trigger-automation': {
      console.log(`[Forge Friday] Trigger automation: id=${args.automationId}`);
      mainWindow.webContents.send('automation:run-now', { id: args.automationId });
      break;
    }

    default:
      console.warn(`[Forge Friday] Unknown command: ${command}`);
  }
}

// Handle confirmation responses from renderer
ipcMain.on('friday:command-respond', (event, { commandId, approved }) => {
  const pending = fridayPendingCommands.get(commandId);
  console.log(`[Forge Friday] Command response: ${commandId} ${approved ? 'APPROVED' : 'DENIED'} (command=${pending?.command || 'unknown'})`);

  if (approved) {
    if (pending) {
      executeFridayCommand(commandId, pending.command, pending.args);
      fridayPendingCommands.delete(commandId);
    } else {
      console.warn(`[Forge Friday] Approved command ${commandId} not found in pending map`);
    }

    if (fridayWs && fridayWs.readyState === WebSocket.OPEN) {
      fridayWs.send(JSON.stringify({ type: 'forge:confirm', commandId, approved: true }));
    }
  } else {
    if (fridayWs && fridayWs.readyState === WebSocket.OPEN) {
      fridayWs.send(JSON.stringify({ type: 'forge:confirm', commandId, approved: false }));
    }
    fridayPendingCommands.delete(commandId);
  }
});

// ─── Agent CLI Session Terminal ───
ipcMain.on('terminal:create-agent-session', (event, { scopeId, cols, rows, agentSlug, projectSlug, modelFlag }) => {
  console.log(`[Forge] terminal:create-agent-session scope="${scopeId}" agent=${agentSlug} project=${projectSlug} model=${modelFlag || 'default'}`);

  // Dashboard-launched agent sessions: normal permission mode (user clicks agent button directly)
  const dangerMode = false;

  const agentRepoPath = resolveProjectCwd(projectSlug);
  const skillPath = PATHS.agentSkill(agentSlug);
  const contextPath = PATHS.projects(projectSlug, 'context.md');
  const featuresPath = PATHS.projects(projectSlug, 'features.json');

  const prompt = [
    `You are @${agentSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}. Load and follow the agent skill file at`,
    skillPath,
    ``,
    `Your current focus is the ${projectSlug} project. Your shell is already cd'd into the project repo at ${agentRepoPath} — read, edit and explore the actual code from here.`,
    `Before responding, read the feature registry at ${featuresPath} and the project context at ${contextPath}.`,
    ``,
    `Greet the user (the studio boss) in character. Then suggest 3-4`,
    `specific questions they might want to ask you, based on your`,
    `specialty and the project's current phase/status. Be ready for`,
    `a focused conversation about ${projectSlug}.`,
  ].join('\n');

  const tmpFile = path.join(os.tmpdir(), `forge-agent-${scopeId}.md`);
  fs.writeFileSync(tmpFile, prompt, 'utf-8');

  let shell, shellArgs;
  if (process.platform === 'win32') {
    shell = process.env.COMSPEC || 'cmd.exe';
    shellArgs = [];
  } else {
    shell = process.env.SHELL || 'bash';
    shellArgs = [];
  }

  const sessionStart = Date.now();
  let outputChars = 0;

  try {
    const proc = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: agentRepoPath,
      env: ptyEnv(),
    });
    console.log(`[Forge] Agent session PTY spawned scope="${scopeId}", pid=${proc.pid}, cwd=${agentRepoPath}`);

    ptyProcesses.set(scopeId, { proc, scope: '__agent__', projectSlug: projectSlug || 'unknown', agentSlug: agentSlug || 'unknown', taskDescription: prompt || '' });

    proc.onData((data) => {
      outputChars += data.length;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', { scopeId, data });
      }
    });

    proc.onExit(({ exitCode }) => {
      console.log(`[Forge] Agent session PTY scope="${scopeId}" exited with code ${exitCode}`);
      ptyProcesses.delete(scopeId);
      if (global.__sessionTracker) {
        try { global.__sessionTracker.markDormant(scopeId); } catch {}
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', { scopeId, exitCode });
      }
      try { fs.unlinkSync(tmpFile); } catch {}
      const durationMs = Date.now() - sessionStart;
      writeMeteringRecord({
        id: meterRecordId(),
        timestamp: new Date().toISOString(),
        provider: 'claude',
        model: 'claude-code',
        source: 'agent-dispatch',
        agent: agentSlug || null,
        agentSlug: agentSlug || null,
        project: projectSlug || null,
        linkType: null,
        linkId: null,
        tokens: {
          input: 0,
          output: Math.round(outputChars / 4),
          total: Math.round(outputChars / 4),
          estimated: true,
        },
        durationMs,
        status: 'completed',
      });
    });

    setTimeout(() => {
      const briefPath = tmpFile.replace(/\\/g, '/');
      const instruction = `Read the agent brief at ${briefPath}. Follow its instructions and greet the user in character.`;
      const modelArg = modelFlag ? `--model ${modelFlag}` : '';
      const cmd = ['claude', modelArg, `"${instruction}"`].filter(Boolean).join(' ');
      console.log(`[Forge] Agent session command: ${cmd.slice(0, 180)}...`);
      if (global.__sessionTracker) {
        try {
          global.__sessionTracker.recordPendingSpawn({ cwd: agentRepoPath, scopeId, pid: proc.pid, agentSlug: agentSlug || null, projectSlug: projectSlug || null });
        } catch (err) {
          console.warn('[sessions] recordPendingSpawn failed:', err);
        }
      }
      proc.write(cmd + '\r');
    }, 500);
  } catch (err) {
    console.error(`[Forge] Agent session PTY spawn FAILED for scope="${scopeId}":`, err);
  }
});

// ─── Agent Alias Sync → CLAUDE.md ───
const CLAUDE_MD_PATH = PATHS.claudeMd;
const ALIAS_START = '<!-- FORGE-ALIASES:START -->';
const ALIAS_END = '<!-- FORGE-ALIASES:END -->';

ipcMain.handle('aliases:sync', async (event, rows) => {
  try {
    let content = fs.readFileSync(CLAUDE_MD_PATH, 'utf-8');

    // Build alias section
    let aliasSection = '';
    if (rows && rows.length > 0) {
      aliasSection = [
        '',
        '### Agent Aliases (Auto-generated by Forge dashboard — do not edit manually)',
        ALIAS_START,
        '| Alias | Resolves To | Skill File |',
        '|-------|------------|-----------|',
        ...rows.map(r => `| @${r.alias} | ${r.agentName} | \`${r.skillFile}\` |`),
        ALIAS_END,
      ].join('\n');
    }

    // Replace existing section or insert before ### Agent Protocol
    const fullSectionRegex = /\n### Agent Aliases \(Auto-generated[^\n]*\n<!-- FORGE-ALIASES:START -->[\s\S]*?<!-- FORGE-ALIASES:END -->/;
    const markerRegex = /<!-- FORGE-ALIASES:START -->[\s\S]*?<!-- FORGE-ALIASES:END -->/;

    if (fullSectionRegex.test(content)) {
      if (aliasSection) {
        content = content.replace(fullSectionRegex, aliasSection);
      } else {
        // No aliases left — remove the section entirely
        content = content.replace(fullSectionRegex, '');
      }
    } else if (markerRegex.test(content)) {
      content = content.replace(markerRegex, aliasSection);
    } else if (aliasSection) {
      // First time — insert before ### Agent Protocol
      content = content.replace('### Agent Protocol', aliasSection + '\n\n### Agent Protocol');
    }

    fs.writeFileSync(CLAUDE_MD_PATH, content, 'utf-8');
    return { ok: true, count: rows?.length || 0 };
  } catch (err) {
    console.error('[Forge] Failed to sync aliases to CLAUDE.md:', err);
    return { ok: false, error: err.message };
  }
});

// ─── CodeViz: Repo Scanner (cross-platform, no bash) ───
ipcMain.handle('codeviz:scan-repo', async (event, { repoPath }) => {
  const fsp = require('fs').promises;
  const { execSync } = require('child_process');

  try {
    // Use git ls-files to get tracked files (works on all platforms)
    const opts = { cwd: repoPath, encoding: 'utf-8', timeout: 15000, maxBuffer: 10 * 1024 * 1024 };
    const raw = execSync('git ls-files', opts).trim();
    if (!raw) return { ok: false, error: 'No tracked files' };

    const filePaths = raw.split('\n').filter(Boolean);
    const files = [];
    const BINARY_EXT = new Set(['png','jpg','jpeg','gif','svg','ico','woff','woff2','ttf','eot','mp3','wav','ogg','mp4','webm','zip','tar','gz','pdf','exe','dll','so','dylib','bin','dat','db','sqlite','class','o','pyc','pdb','map','lock']);

    for (const fp of filePaths) {
      const ext = fp.includes('.') ? fp.split('.').pop().toLowerCase() : '';
      if (BINARY_EXT.has(ext)) continue;

      let loc = 0;
      try {
        const fullPath = path.join(repoPath, fp);
        const content = await fsp.readFile(fullPath, 'utf-8');
        loc = content.split('\n').length;
      } catch {
        continue; // Skip unreadable files
      }

      files.push({ path: fp, ext, loc });
    }

    // Also grab recent git activity per file (last commit date)
    let blameData = {};
    try {
      const logRaw = execSync('git log --name-only --format="COMMIT:%aI" -50', opts);
      let currentDate = '';
      for (const line of logRaw.split('\n')) {
        if (line.startsWith('COMMIT:')) {
          currentDate = line.slice(7);
        } else if (line.trim() && currentDate) {
          if (!blameData[line.trim()]) {
            blameData[line.trim()] = currentDate;
          }
        }
      }
    } catch {}

    return { ok: true, files, blameData, repoName: path.basename(repoPath) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── CodeViz: CodeGraphContext Integration ───
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

ipcMain.handle('codeviz:check-cgc', async () => {
  try {
    const { stdout } = await execFileAsync('cgc', ['--version'], { shell: true, timeout: 10000 });
    return { installed: true, version: stdout.trim() };
  } catch {
    return { installed: false, version: null };
  }
});

ipcMain.handle('codeviz:index', async (event, { repoPath, projectSlug }) => {
  return new Promise((resolve, reject) => {
    const proc = spawn('cgc', ['index', repoPath], { shell: true });
    let stderr = '';

    proc.stdout.on('data', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('codeviz:index-progress', {
          projectSlug,
          message: data.toString(),
        });
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('codeviz:index-progress', {
          projectSlug,
          message: data.toString(),
        });
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: `cgc index exited with code ${code}: ${stderr.slice(0, 500)}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
});

ipcMain.handle('codeviz:export-graph', async (event, { repoPath, projectSlug }) => {
  const fsp = require('fs').promises;
  const scriptPath = path.join(__dirname, '..', 'scripts', 'cgc-export.py');

  try {
    const { stdout } = await execFileAsync('python', [scriptPath, repoPath], {
      shell: true,
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const graphData = JSON.parse(stdout);

    // Cache to hq-data
    const cacheDir = PATHS.projects(projectSlug, 'code-graph');
    await fsp.mkdir(cacheDir, { recursive: true });
    await fsp.writeFile(path.join(cacheDir, 'graph.json'), JSON.stringify(graphData, null, 2), 'utf-8');

    return { ok: true, data: graphData };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('codeviz:load-cached-graph', async (event, { projectSlug }) => {
  const fsp = require('fs').promises;
  const cachePath = PATHS.projects(projectSlug, 'code-graph', 'graph.json');
  try {
    const data = await fsp.readFile(cachePath, 'utf-8');
    return { ok: true, data: JSON.parse(data) };
  } catch {
    return { ok: false, data: null };
  }
});

// File watcher for live dashboard updates
let watcher = null;

ipcMain.on('hq:start-watching', () => {
  if (watcher) return;

  const chokidar = require('chokidar');
  const watchPath = PATHS.hqData;

  watcher = chokidar.watch(watchPath, {
    persistent: true,
    ignoreInitial: true,
    depth: 5
  });

  watcher.on('all', (eventType, filePath) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const relative = path.relative(watchPath, filePath).replace(/\\/g, '/');
      mainWindow.webContents.send('hq:file-changed', {
        event: eventType,
        path: relative
      });
    }
  });
});

// ─── Session Tabs: PTY helper + bootstrap ──────────────────────────────────
// Minimal PTY spawn helper used by the SpawnAdapter. Mirrors the basic
// node-pty + IPC wiring used by terminal:create-implementation but WITHOUT
// impl-session-specific logic (metering, brief files, agent metadata). The
// adapter calls this for autoRestore() and for the sessionTabs:resume IPC.
async function spawnSessionPty(scopeId, cwd, cols, rows) {
  const shell = process.platform === 'win32'
    ? (process.env.COMSPEC || 'cmd.exe')
    : (process.env.SHELL || 'bash');
  const proc = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: cols || 120,
    rows: rows || 30,
    cwd,
    env: ptyEnv(),
  });
  console.log(`[Forge] Session PTY spawned scope="${scopeId}", pid=${proc.pid}, cwd=${cwd}`);

  proc.onData((data) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try { win.webContents.send('terminal:data', { scopeId, data }); } catch {}
    }
  });
  proc.onExit(({ exitCode, signal }) => {
    console.log(`[Forge] Session PTY scope="${scopeId}" exited with code ${exitCode}`);
    for (const win of BrowserWindow.getAllWindows()) {
      try { win.webContents.send('terminal:exit', { scopeId, exitCode, signal }); } catch {}
    }
    ptyProcesses.delete(scopeId);
    if (global.__sessionTracker) {
      try { global.__sessionTracker.markDormant(scopeId); } catch {}
    }
  });
  return proc;
}

app.whenReady().then(async () => {
  await startViteServer();
  createWindow();
  startScheduleTimer();
  startGitPoller();
  startSocialNotifTimer();
  startCampaignTimer();
  startPortMonitor();

  // ─── Session Tabs bootstrap: adapter + tracker + auto-restore ──────────
  try {
    const { registerSessionTabsIpc } = require('./sessions/ipc');
    const { createSpawnAdapter } = require('./sessions/spawn-adapter');
    const adapter = createSpawnAdapter({ ptyProcesses, spawnPty: spawnSessionPty });
    const { tracker } = await registerSessionTabsIpc({
      userDataDir: app.getPath('userData'),
      claudeProjectsDir: path.join(os.homedir(), '.claude', 'projects'),
      adapter,
      logger: console,
    });
    console.log(`[sessions] tracker initialized; loaded ${tracker.list().length} persisted tab(s)`);
    global.__sessionTracker = tracker;

    // Wait for the main window to finish loading so the renderer is alive
    // to receive sessionTabs:update broadcasts from auto-restore.
    if (mainWindow && !mainWindow.isDestroyed()) {
      const runAutoRestore = async () => {
        try {
          const results = await tracker.autoRestore();
          const ok = results.filter(r => r.ok).length;
          console.log(`[sessions] autoRestore: ${ok}/${results.length} ok`);
        } catch (err) {
          console.error('[sessions] autoRestore failed:', err);
        }
      };
      if (mainWindow.webContents.isLoading()) {
        mainWindow.webContents.once('did-finish-load', runAutoRestore);
      } else {
        runAutoRestore();
      }
    }
  } catch (err) {
    console.error('[sessions] bootstrap failed:', err);
  }

  // Auto-start Friday server
  try {
    await startFridayServer();
  } catch (err) {
    console.error('[Forge] Friday auto-start failed:', err.message);
  }

  // Auto-reconnect Discord bot from saved credentials
  try {
    const secrets = readSecrets();
    const discordCreds = secrets['discord-bot'];
    if (discordCreds && discordCreds.token && discordCreds.guildId && discordCreds.channelId) {
      console.log('[Forge Discord] Auto-reconnecting from saved credentials...');
      discordBot.connect(discordCreds.token, discordCreds.guildId, discordCreds.channelId)
        .then((result) => {
          if (result?.ok) {
            console.log('[Forge Discord] Auto-reconnect successful');
            discordBot.onMessage((msg) => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('discord:message-received', msg);
              }
            });
          } else {
            console.warn('[Forge Discord] Auto-reconnect failed:', result?.error);
          }
        })
        .catch((err) => {
          console.warn('[Forge Discord] Auto-reconnect error:', err.message);
        });
    }
  } catch (err) {
    console.warn('[Forge Discord] Auto-reconnect check failed:', err.message);
  }
});

app.on('before-quit', async () => {
  if (global.__sessionTracker) {
    try { await global.__sessionTracker.shutdown(); } catch {}
  }
});

app.on('window-all-closed', () => {
  // Disconnect Discord bot
  try { discordBot.disconnect(); } catch {}

  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (scheduleTimer) {
    clearInterval(scheduleTimer);
    scheduleTimer = null;
  }
  if (gitPollTimer) {
    clearInterval(gitPollTimer);
    gitPollTimer = null;
  }
  if (socialNotifTimer) {
    clearInterval(socialNotifTimer);
    socialNotifTimer = null;
  }
  // Clean up port monitor
  if (portMonitorTimer) {
    clearInterval(portMonitorTimer);
    portMonitorTimer = null;
  }
  unregisterPorts();

  // Kill Vite server
  if (vitePty) {
    try { vitePty.kill(); } catch {}
    vitePty = null;
  }

  // Kill all PTYs (including Friday)
  for (const [id, entry] of ptyProcesses) {
    const proc = entry?.proc || entry;
    try { proc.kill(); } catch (e) {}
  }
  ptyProcesses.clear();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
