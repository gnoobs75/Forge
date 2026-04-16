# Embedded Studio Terminals Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed Friday Server and CoE main process logs as terminal tabs inside the Studio dashboard, eliminating separate windows.

**Architecture:** Electron main process manages a Friday Server PTY (direct `pty.spawn`, not `createTerminal()`) and captures its own console output via monkey-patching into a 2000-line ring buffer. The renderer displays these in a new "SRV" tab group in TerminalTabBar, plus a compact log preview drawer in the Friday Panel. Main process auto-connects to Friday when it detects "Friday online" in PTY stdout.

**Tech Stack:** Electron, node-pty, xterm.js, React, Zustand

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `electron/main.cjs` | Modify | Console monkey-patch + ring buffer, Friday PTY spawn/kill IPC, auto-connect on server ready, bun-not-found error |
| `electron/preload.cjs` | Modify | Bridge methods: `friday.startServer`, `friday.stopServer`, `friday.getServerStatus`, `main.getLogs`, `main.onLogEntry` |
| `src/store/useStore.js` | Modify | `fridayProcessStatus` state, modified enable/disable flow, server PTY exit listener |
| `src/components/Terminal.jsx` | Modify | `createVirtualTerminal()` for read-only terminals, exclude `friday-server` from cleanup |
| `src/components/TerminalTabBar.jsx` | Modify | SRV system group at far right, system tabs (no close), attention dot |
| `src/components/dashboard/FridayPanel.jsx` | Modify | Mount FridayLogPreview drawer |
| `src/components/dashboard/friday/FridayLogPreview.jsx` | Create | Compact 20-line log drawer with ANSI stripping |
| `run-electron.bat` | Modify | Remove separate Friday window launch |

---

## Chunk 1: Backend — Main Process + Preload

### Task 1: Console Monkey-Patch & Ring Buffer (main.cjs)

**Files:**
- Modify: `electron/main.cjs` (top of file, after imports)

- [ ] **Step 1: Add ring buffer class and console monkey-patch**

Add this after the `let mainWindow;` line (around line 8) in `main.cjs`:

```javascript
// ─── Main Process Log Capture ──────────────────────────────────────────────
const LOG_RING_BUFFER_CAP = 2000;
const logRingBuffer = [];
// Prefixes worth capturing (others are noise like terminal:data relay)
const LOG_CAPTURE_PREFIXES = ['[CoE', '[Friday', '[Discord', '[Report', '[Auto', '[Git', '[HQ', '[Secrets'];

function captureLog(level, ...args) {
  const msg = args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');

  // Filter: only capture recognized prefixes for 'log' level (warn/error always captured)
  if (level === 'log') {
    const hasPrefix = LOG_CAPTURE_PREFIXES.some(p => msg.startsWith(p));
    if (!hasPrefix) return;
  }

  const entry = {
    level,
    timestamp: new Date().toISOString(),
    message: msg,
  };

  logRingBuffer.push(entry);
  if (logRingBuffer.length > LOG_RING_BUFFER_CAP) {
    logRingBuffer.shift();
  }

  // Stream to renderer if window exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('main:log-entry', entry);
    } catch {}
  }
}

// Monkey-patch console methods — preserve originals
const _origLog = console.log;
const _origWarn = console.warn;
const _origError = console.error;

console.log = (...args) => {
  _origLog.apply(console, args);
  captureLog('log', ...args);
};
console.warn = (...args) => {
  _origWarn.apply(console, args);
  captureLog('warn', ...args);
};
console.error = (...args) => {
  _origError.apply(console, args);
  captureLog('error', ...args);
};
```

- [ ] **Step 2: Add `main:get-logs` IPC handler**

Add near the other IPC handlers (after the terminal handlers):

```javascript
// ─── Main Process Log IPC ─────────────────────────────────────────────────
ipcMain.handle('main:get-logs', () => {
  return logRingBuffer;
});
```

- [ ] **Step 3: Verify the app still starts**

Run: `cd /d C:\Claude\Agency\council-of-elrond && npm run dev`
Expected: App launches, console output still appears in DevTools

- [ ] **Step 4: Commit**

```bash
git add electron/main.cjs
git commit -m "feat: add console monkey-patch and ring buffer for CoE log capture"
```

---

### Task 2: Friday Server PTY Spawn/Kill (main.cjs)

**Files:**
- Modify: `electron/main.cjs` (new IPC handlers, new module-level state)

- [ ] **Step 1: Add Friday server state variables**

Add after the log capture code (before `createWindow()`):

```javascript
// ─── Friday Server PTY Management ─────────────────────────────────────────
let fridayServerPty = null;
let fridayServerStatus = 'stopped'; // 'stopped' | 'starting' | 'running' | 'crashed'
```

- [ ] **Step 2: Add `friday:start-server` IPC handler**

```javascript
ipcMain.handle('friday:start-server', async () => {
  if (fridayServerPty) {
    console.log('[CoE Friday] Server PTY already running — ignoring start request');
    return { ok: true, scopeId: 'friday-server' };
  }

  const fridayCwd = path.join(__dirname, '..', 'friday');
  console.log(`[CoE Friday] Spawning server PTY in ${fridayCwd}`);
  fridayServerStatus = 'starting';

  // Notify renderer of status change
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('friday:process-status', 'starting');
  }

  try {
    // Check if friday directory exists
    if (!fs.existsSync(fridayCwd)) {
      const errMsg = `[CoE] Error: Friday directory not found at ${fridayCwd}`;
      console.error(errMsg);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', { scopeId: 'friday-server', data: errMsg + '\r\n' });
        mainWindow.webContents.send('friday:process-status', 'crashed');
      }
      fridayServerStatus = 'crashed';
      return { ok: false, error: 'Friday directory not found' };
    }

    // Spawn bun directly (not via shell + setTimeout) per spec: "directly via node-pty"
    // On Windows, use 'bun.cmd' which is the shim npm/bun installers create
    const bunCmd = process.platform === 'win32' ? 'bun.cmd' : 'bun';
    const proc = pty.spawn(bunCmd, ['run', 'serve'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: fridayCwd,
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    fridayServerPty = proc;
    ptyProcesses.set('friday-server', proc);
    console.log(`[CoE Friday] Server PTY spawned, pid=${proc.pid}`);

    proc.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', { scopeId: 'friday-server', data });
      }

      // Watch for server ready signal
      if (fridayServerStatus === 'starting' && (data.includes('Friday online') || data.includes('listening on'))) {
        console.log('[CoE Friday] Server ready detected — auto-connecting WebSocket');
        fridayServerStatus = 'running';
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('friday:process-status', 'running');
        }
        // Auto-connect to Friday WebSocket
        // NOTE: fridayConnect() and fridayDisconnect() already exist in main.cjs
        // as part of the existing Friday integration (search for "function fridayConnect")
        const url = 'ws://localhost:3000/ws';
        fridayConnect(url);
      }
    });

    proc.onExit(({ exitCode }) => {
      console.log(`[CoE Friday] Server PTY exited with code ${exitCode}`);
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
    console.error('[CoE Friday] Failed to spawn server PTY:', err);
    fridayServerStatus = 'crashed';
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Send user-friendly error to the terminal tab
      const errMsg = err.message?.includes('ENOENT')
        ? "[CoE] Error: 'bun' not found. Install Bun (https://bun.sh) to run the Friday server.\r\n"
        : `[CoE] Error: Failed to start Friday server: ${err.message}\r\n`;
      mainWindow.webContents.send('terminal:data', { scopeId: 'friday-server', data: errMsg });
      mainWindow.webContents.send('friday:process-status', 'crashed');
    }
    return { ok: false, error: err.message };
  }
});
```

- [ ] **Step 3: Add `friday:stop-server` and `friday:server-status` handlers**

```javascript
ipcMain.handle('friday:stop-server', async () => {
  if (!fridayServerPty) {
    console.log('[CoE Friday] No server PTY to stop');
    return { ok: true };
  }

  console.log('[CoE Friday] Stopping server PTY');
  try {
    fridayServerPty.kill();
  } catch (e) {
    console.error('[CoE Friday] Kill failed:', e);
  }
  fridayServerPty = null;
  ptyProcesses.delete('friday-server');
  fridayServerStatus = 'stopped';

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('friday:process-status', 'stopped');
  }

  // Also disconnect WebSocket
  fridayDisconnect();

  return { ok: true };
});

ipcMain.handle('friday:server-status', () => {
  return fridayServerStatus;
});
```

- [ ] **Step 4: Kill Friday PTY on app quit**

In the `mainWindow.on('closed', ...)` handler (around line 46), add before the existing PTY cleanup:

```javascript
// Kill Friday server PTY specifically
if (fridayServerPty) {
  try { fridayServerPty.kill(); } catch (e) {}
  fridayServerPty = null;
}
```

- [ ] **Step 5: Verify the app starts and the IPC handlers are registered**

Run the app, open DevTools, check for no errors on startup.

- [ ] **Step 6: Commit**

```bash
git add electron/main.cjs
git commit -m "feat: add Friday server PTY spawn/kill IPC handlers with auto-connect"
```

---

### Task 3: Preload Bridge Methods

**Files:**
- Modify: `electron/preload.cjs`

- [ ] **Step 1: Add Friday server bridge methods**

In the `friday: { ... }` section (around line 89), add after the existing methods:

```javascript
    startServer: () => ipcRenderer.invoke('friday:start-server'),
    stopServer: () => ipcRenderer.invoke('friday:stop-server'),
    getServerStatus: () => ipcRenderer.invoke('friday:server-status'),
    onProcessStatus: (callback) => {
      const handler = (event, status) => callback(status);
      ipcRenderer.on('friday:process-status', handler);
      return () => ipcRenderer.removeListener('friday:process-status', handler);
    },
```

- [ ] **Step 2: Add main process log bridge methods**

Add a new `main:` section after the `friday:` section:

```javascript
  // Main process logs
  main: {
    getLogs: () => ipcRenderer.invoke('main:get-logs'),
    onLogEntry: (callback) => {
      const handler = (event, entry) => callback(entry);
      ipcRenderer.on('main:log-entry', handler);
      return () => ipcRenderer.removeListener('main:log-entry', handler);
    },
  },
```

- [ ] **Step 3: Commit**

```bash
git add electron/preload.cjs
git commit -m "feat: add preload bridge for Friday server control and main process logs"
```

---

## Chunk 2: Store + Terminal Changes

### Task 4: Store — Friday Process Status & Modified Enable Flow

**Files:**
- Modify: `src/store/useStore.js`

- [ ] **Step 1: Add `fridayProcessStatus` state**

Add after `fridayStatus: 'disconnected',` (around line 149):

```javascript
  fridayProcessStatus: 'stopped', // 'stopped' | 'starting' | 'running' | 'crashed'
```

- [ ] **Step 2: Add `setFridayProcessStatus` action**

Add after the `setFridayStatus` action:

```javascript
  setFridayProcessStatus: (status) => set({ fridayProcessStatus: status }),
```

- [ ] **Step 3: Modify `setFridayEnabled` to start/stop server**

Replace the existing `setFridayEnabled` (lines 289-292):

```javascript
  setFridayEnabled: async (enabled) => {
    set({ fridayEnabled: enabled });
    try { localStorage.setItem('coe-friday-enabled', JSON.stringify(enabled)); } catch {}

    if (enabled) {
      // Start the server — do NOT call connectFriday()
      // Main process auto-connects when it detects server is ready
      if (window.electronAPI?.friday?.startServer) {
        console.log('[Friday Store] Starting Friday server via IPC');
        const result = await window.electronAPI.friday.startServer();
        console.log('[Friday Store] startServer result:', result);
      }
    } else {
      // Stop server and disconnect WebSocket
      if (window.electronAPI?.friday?.stopServer) {
        console.log('[Friday Store] Stopping Friday server via IPC');
        await window.electronAPI.friday.stopServer();
      }
      get().disconnectFriday();
    }
  },
```

- [ ] **Step 4: Add process status listener in `setupFridayListeners`**

Inside `setupFridayListeners`, after the existing `unsubStatus` listener setup, add:

```javascript
    // Friday server process status (PTY lifecycle)
    const unsubProcessStatus = window.electronAPI.friday.onProcessStatus?.((status) => {
      console.log(`[Friday Store] Process status: ${get().fridayProcessStatus} → ${status}`);
      get().setFridayProcessStatus(status);
    }) || (() => {});
```

And update the cleanup return to include it:

```javascript
    return () => {
      set({ _fridayListenersActive: false });
      unsubStatus();
      unsubMessage();
      unsubProcessStatus();
      // ... any other existing unsubs
    };
```

- [ ] **Step 5: Commit**

```bash
git add src/store/useStore.js
git commit -m "feat: add fridayProcessStatus state and server lifecycle management"
```

---

### Task 5: Terminal.jsx — Virtual Terminal & Cleanup Exclusion

**Files:**
- Modify: `src/components/Terminal.jsx`

- [ ] **Step 1: Add `createVirtualTerminal` function**

Add this new callback after `createScopeTerminal` (around line 229):

```javascript
  // Create a read-only virtual terminal (no PTY backing) for system log display
  const createVirtualTerminal = useCallback(async (id) => {
    const { Terminal: XTerm, FitAddon, WebLinksAddon } = await loadXtermModules();

    const term = new XTerm({
      theme: XTERM_THEME,
      fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: false,
      scrollback: 10000,
      disableStdin: true,  // Read-only — no keyboard input
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    // NOTE: No term.onData → terminal:input wiring (read-only)
    // NOTE: No terminal:create IPC call (no PTY backing)

    const containerEl = document.createElement('div');
    containerEl.style.position = 'absolute';
    containerEl.style.inset = '0';
    containerEl.dataset.scopeId = id;

    for (const [, e] of terminalsRef.current) {
      e.containerEl.style.display = 'none';
    }

    if (wrapperRef.current) {
      wrapperRef.current.appendChild(containerEl);
    }

    await waitForLayout(containerEl);
    term.open(containerEl);
    fitAddon.fit();

    const entry = { term, fitAddon, containerEl, virtual: true };
    terminalsRef.current.set(id, entry);
    return entry;
  }, []);
```

- [ ] **Step 2: Update `isSessionId` to recognize system scope IDs**

Replace the `isSessionId` callback:

```javascript
  // Check if an ID belongs to a session (not a scope terminal or system terminal)
  const isSessionId = useCallback((id) => {
    return id && (id.startsWith('impl-') || id.startsWith('agent-') || id.startsWith('auto-'));
  }, []);

  // System-managed terminal IDs that should NOT be killed on cleanup
  const isSystemTerminal = useCallback((id) => {
    return id === 'friday-server' || id === 'coe-logs';
  }, []);
```

- [ ] **Step 3: Update cleanup teardown to exclude system terminals**

In the cleanup `useEffect` return (around line 455), update the condition:

Replace:
```javascript
      for (const [id, entry] of terminalsRef.current) {
        // Kill scope PTYs (not sessions — those are managed by session lifecycle)
        if (!(id.startsWith('impl-') || id.startsWith('agent-') || id.startsWith('auto-')) && window.electronAPI?.terminal?.kill) {
          window.electronAPI.terminal.kill(id);
        }
```

With:
```javascript
      for (const [id, entry] of terminalsRef.current) {
        // Kill scope PTYs (not sessions or system terminals — those have their own lifecycle)
        if (!isSessionId(id) && !isSystemTerminal(id) && window.electronAPI?.terminal?.kill) {
          window.electronAPI.terminal.kill(id);
        }
```

- [ ] **Step 4: Expose `createVirtualTerminal` and `createTerminalInstance` via ref for SRV tab integration**

Add a new `useEffect` for auto-creating SRV terminals. Place after the scope change effect (around line 500):

```javascript
  // Auto-create system terminals (SRV group: friday-server + coe-logs)
  useEffect(() => {
    let cancelled = false;

    async function initSystemTerminals() {
      // Friday Server tab — full interactive PTY (data comes from main process)
      // NOTE: createTerminalInstance() only creates the xterm.js UI instance + DOM container.
      // It does NOT call terminal:create IPC, so no duplicate PTY is spawned.
      // The Friday Server PTY is managed exclusively by friday:start-server / friday:stop-server.
      if (!terminalsRef.current.has('friday-server')) {
        const entry = await createTerminalInstance('friday-server');
        if (cancelled) return;
        const { term } = entry;

        // Wire input to PTY (interactive terminal)
        if (window.electronAPI?.terminal) {
          term.onData((data) => {
            window.electronAPI.terminal.input('friday-server', data);
          });
          term.onResize(({ cols, rows }) => {
            window.electronAPI.terminal.resize('friday-server', cols, rows);
          });
        }

        // Start hidden
        entry.containerEl.style.display = 'none';
      }

      // CoE Logs tab — read-only virtual terminal
      if (!terminalsRef.current.has('coe-logs')) {
        const entry = await createVirtualTerminal('coe-logs');
        if (cancelled) return;
        const { term } = entry;

        // Load initial ring buffer
        if (window.electronAPI?.main?.getLogs) {
          const logs = await window.electronAPI.main.getLogs();
          for (const log of logs) {
            const color = log.level === 'error' ? '\x1b[31m' : log.level === 'warn' ? '\x1b[33m' : '';
            const reset = color ? '\x1b[0m' : '';
            const ts = new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false });
            term.writeln(`${color}[${ts}] ${log.message}${reset}`);
          }
        }

        // Subscribe to streaming log entries
        if (window.electronAPI?.main?.onLogEntry) {
          window.electronAPI.main.onLogEntry((log) => {
            const color = log.level === 'error' ? '\x1b[31m' : log.level === 'warn' ? '\x1b[33m' : '';
            const reset = color ? '\x1b[0m' : '';
            const ts = new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false });
            term.writeln(`${color}[${ts}] ${log.message}${reset}`);
          });
        }

        // Start hidden
        entry.containerEl.style.display = 'none';
      }
    }

    initSystemTerminals();
    return () => { cancelled = true; };
  }, [createTerminalInstance, createVirtualTerminal]);
```

- [ ] **Step 5: Verify terminals still work (scope switching, session spawning)**

Run the app, switch between project tabs, check that existing terminals still work.

- [ ] **Step 6: Commit**

```bash
git add src/components/Terminal.jsx
git commit -m "feat: add virtual terminal support and system terminal auto-creation for SRV group"
```

---

### Task 6: TerminalTabBar.jsx — SRV System Group

**Files:**
- Modify: `src/components/TerminalTabBar.jsx`

- [ ] **Step 1: Import `fridayProcessStatus` from store**

At the top of the component function, add:

```javascript
  const fridayProcessStatus = useStore(s => s.fridayProcessStatus);
```

- [ ] **Step 2: Add SRV group state**

Add state for tracking SRV attention:

```javascript
  const [srvAttention, setSrvAttention] = useState(false);
  const srvAttentionTimerRef = useRef(null);
```

- [ ] **Step 3: Subscribe to friday-server and coe-logs data for attention indicator**

Add a useEffect:

```javascript
  // SRV group attention: new output in inactive system terminals
  useEffect(() => {
    if (!window.electronAPI?.terminal?.onData) return;

    // Listen for data on system scopes — set attention when SRV is not active
    const removeData = window.electronAPI.terminal.onData((scopeId, data) => {
      if (scopeId === 'friday-server' || scopeId === 'coe-logs') {
        if (selectedGroup !== '__srv__') {
          setSrvAttention(true);
        }
      }
    });

    return removeData;
  }, [selectedGroup]);
```

Note: This adds a second `onData` listener. Since `ipcRenderer.on` supports multiple concurrent registrations with independent cleanup, this is safe.

- [ ] **Step 4: Listen for `coe:open-terminal` custom event**

Add a useEffect to handle the "Open Terminal" button from FridayLogPreview:

```javascript
  // Listen for "Open Terminal" requests from FridayLogPreview
  useEffect(() => {
    const handler = (e) => {
      const { tabId } = e.detail || {};
      if (tabId === 'friday-server' || tabId === 'coe-logs') {
        setSelectedGroup('__srv__');
        setSrvAttention(false);
        onTabSelect(tabId);
      }
    };
    window.addEventListener('coe:open-terminal', handler);
    return () => window.removeEventListener('coe:open-terminal', handler);
  }, [onTabSelect]);
```

- [ ] **Step 5: Guard scope sync effects from overriding SRV selection**

The existing `useEffect` at line 31 syncs `selectedGroup` to `scope.id` on scope change. The effect at line 38 resets group when `activeTabId` changes. Both need guards to preserve `__srv__` selection:

In the scope sync effect (line 31-35), change:
```javascript
  useEffect(() => {
    if (scope?.id) {
      setSelectedGroup(scope.id);
    }
  }, [scope?.id]);
```
To:
```javascript
  useEffect(() => {
    if (scope?.id && selectedGroup !== '__srv__') {
      setSelectedGroup(scope.id);
    }
  }, [scope?.id]);
```

In the activeTab sync effect (line 38-46), add a guard for system tabs:
```javascript
  useEffect(() => {
    if (!activeTabId) return;
    if (activeTabId === 'friday-server' || activeTabId === 'coe-logs') {
      setSelectedGroup('__srv__');
      return;
    }
    const session = implementationSessions.find(s => s.id === activeTabId);
    if (session) {
      setSelectedGroup(session.projectSlug);
    } else if (activeTabId === scope?.id) {
      setSelectedGroup(scope?.id);
    }
  }, [activeTabId, implementationSessions, scope?.id]);
```

- [ ] **Step 6: Render SRV group pill**

In the JSX, after the `projectGroups.map(...)` and before the `<div className="flex-1" />` spacer, add:

```jsx
        {/* ── SRV System Group ── */}
        <div className="flex-1" />
        <button
          onClick={() => {
            setSelectedGroup('__srv__');
            setSrvAttention(false);
            // Default to friday-server tab
            onTabSelect(activeTabId === 'coe-logs' ? 'coe-logs' : 'friday-server');
            playSound('tab');
          }}
          title="Server terminals — Friday Server + CoE Logs"
          className={`
            relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold
            transition-all duration-200 select-none flex-shrink-0
            ${selectedGroup === '__srv__'
              ? 'bg-coe-bg/80 text-fuchsia-400 shadow-sm'
              : 'text-coe-text-muted hover:text-fuchsia-400 hover:bg-coe-bg/40'
            }
          `}
          style={selectedGroup === '__srv__' ? {
            boxShadow: '0 1px 0 0 #D946EF',
            border: '1px solid rgba(217, 70, 239, 0.3)',
          } : {
            border: '1px solid transparent',
          }}
        >
          {/* Attention indicator */}
          {srvAttention && selectedGroup !== '__srv__' && (
            <span
              className="absolute inset-0 rounded-md animate-attention-ring pointer-events-none"
              style={{
                boxShadow: 'inset 0 0 0 1px #D946EF60, 0 0 8px #D946EF30',
              }}
            />
          )}
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: fridayProcessStatus === 'running' ? '#22C55E' : fridayProcessStatus === 'crashed' ? '#EF4444' : '#D946EF' }} />
          <span className="tracking-wide">SRV</span>
        </button>
```

Remove the original `<div className="flex-1" />` spacer that was before the active count / refresh button — the SRV pill now lives between project groups and the right-side controls. Keep the refresh button and active count on the far right.

- [ ] **Step 7: Render SRV bottom tier tabs**

Update the bottom tier section. Replace the entire `{showBottomTier && (...)}` block to handle both project and SRV groups:

```jsx
      {/* ══════ BOTTOM TIER: Tabs for Selected Group ══════ */}
      {(showBottomTier || selectedGroup === '__srv__') && (
        <div className="flex items-center border-t border-coe-border/40 bg-coe-bg/20">
          {/* ── Project group tabs (existing) ── */}
          {selectedGroup !== '__srv__' && (
            <>
              {isGroupScopeActive && (
                <button
                  onClick={() => onTabSelect(scope?.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono flex-shrink-0 transition-colors border-b-2 ${
                    (!activeTabId || activeTabId === scope?.id)
                      ? 'border-coe-accent text-coe-text-secondary bg-coe-bg/30'
                      : 'border-transparent text-coe-text-muted hover:text-coe-text-secondary hover:bg-coe-bg/20'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-coe-accent animate-pulse-glow flex-shrink-0" />
                  <span className="truncate max-w-[140px]">Terminal</span>
                </button>
              )}
              {visibleSessions.map(session => (
                <SessionTab
                  key={session.id}
                  session={session}
                  isActive={activeTabId === session.id}
                  agentBrains={agentBrains}
                  onSelect={onTabSelect}
                  onClose={onTabClose}
                />
              ))}
              {visibleSessions.length === 0 && !isGroupScopeActive && (
                <div className="px-3 py-1.5 text-[10px] text-coe-text-muted/50 font-mono italic">
                  No sessions
                </div>
              )}
            </>
          )}

          {/* ── SRV system tabs ── */}
          {selectedGroup === '__srv__' && (
            <>
              <button
                onClick={() => onTabSelect('friday-server')}
                className={`flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono flex-shrink-0 transition-colors border-b-2 ${
                  activeTabId === 'friday-server'
                    ? 'border-fuchsia-500 text-fuchsia-400 bg-coe-bg/30'
                    : 'border-transparent text-coe-text-muted hover:text-fuchsia-400 hover:bg-coe-bg/20'
                }`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: fridayProcessStatus === 'running' ? '#22C55E' : fridayProcessStatus === 'crashed' ? '#EF4444' : '#D946EF' }} />
                <span>{'\uD83D\uDFE3'} Friday Server</span>
              </button>
              <button
                onClick={() => onTabSelect('coe-logs')}
                className={`flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono flex-shrink-0 transition-colors border-b-2 ${
                  activeTabId === 'coe-logs'
                    ? 'border-blue-500 text-blue-400 bg-coe-bg/30'
                    : 'border-transparent text-coe-text-muted hover:text-blue-400 hover:bg-coe-bg/20'
                }`}
              >
                <span>{'\u26A1'} CoE Logs</span>
              </button>
            </>
          )}
        </div>
      )}
```

- [ ] **Step 8: Verify SRV pill appears and tabs switch**

Run the app, confirm:
- SRV pill appears at far right of top tier
- Clicking SRV shows Friday Server + CoE Logs tabs in bottom tier
- Clicking back to HQ/EXP/TTR shows project tabs

- [ ] **Step 9: Commit**

```bash
git add src/components/TerminalTabBar.jsx
git commit -m "feat: add SRV system group with Friday Server and CoE Logs tabs"
```

---

## Chunk 3: Friday Panel Log Preview + Cleanup

### Task 7: FridayLogPreview Component

**Files:**
- Create: `src/components/dashboard/friday/FridayLogPreview.jsx`

- [ ] **Step 1: Create the FridayLogPreview component**

```jsx
import React, { useState, useEffect, useRef } from 'react';

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;
const MAX_LINES = 20;

export default function FridayLogPreview({ onOpenTerminal }) {
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem('coe-friday-log-expanded') === 'true'; } catch { return false; }
  });
  const [lines, setLines] = useState([]);
  const scrollRef = useRef(null);

  // Toggle persistence
  useEffect(() => {
    try { localStorage.setItem('coe-friday-log-expanded', String(expanded)); } catch {}
  }, [expanded]);

  // Subscribe to friday-server terminal data
  useEffect(() => {
    if (!window.electronAPI?.terminal?.onData) return;

    const remove = window.electronAPI.terminal.onData((scopeId, data) => {
      if (scopeId !== 'friday-server') return;

      // Strip ANSI codes and split into lines
      const clean = data.replace(ANSI_REGEX, '');
      const newLines = clean.split(/\r?\n/).filter(l => l.trim());

      if (newLines.length === 0) return;

      setLines(prev => {
        const updated = [...prev, ...newLines];
        return updated.slice(-MAX_LINES);
      });
    });

    return remove;
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, expanded]);

  return (
    <div className="border-t border-coe-border/40">
      {/* Header bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-mono
                   text-coe-text-muted hover:text-coe-text-secondary transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span style={{ color: '#D946EF' }}>{expanded ? '\u25BC' : '\u25B6'}</span>
          <span>Server Log</span>
          {lines.length > 0 && (
            <span className="text-[9px] text-coe-text-muted/50">({lines.length} lines)</span>
          )}
        </span>
        {onOpenTerminal && (
          <span
            onClick={(e) => { e.stopPropagation(); onOpenTerminal(); }}
            className="text-fuchsia-400 hover:text-fuchsia-300 cursor-pointer"
          >
            Open Terminal &rarr;
          </span>
        )}
      </button>

      {/* Log content */}
      {expanded && (
        <div
          ref={scrollRef}
          className="h-[120px] overflow-y-auto px-3 pb-2 font-mono text-[10px] leading-relaxed"
          style={{ color: '#22C55E', backgroundColor: 'rgba(0,0,0,0.2)' }}
        >
          {lines.length === 0 ? (
            <div className="text-coe-text-muted/30 italic py-2">No server output yet</div>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/friday/FridayLogPreview.jsx
git commit -m "feat: create FridayLogPreview compact log drawer component"
```

---

### Task 8: Mount FridayLogPreview in FridayPanel

**Files:**
- Modify: `src/components/dashboard/FridayPanel.jsx`

- [ ] **Step 1: Import FridayLogPreview**

Add at the top with other imports:

```javascript
import FridayLogPreview from './friday/FridayLogPreview';
```

- [ ] **Step 2: Add `onOpenTerminal` handler and mount the component**

Inside the FridayPanel component, add a handler for the "Open Terminal" button. This needs to work with the TerminalTabBar — it should set the active tab to `friday-server`. Since FridayPanel doesn't have direct access to TerminalTabBar's `onTabSelect`, we'll use a store action or a simpler approach: emit a custom event.

Add a helper inside the component:

```javascript
  const handleOpenFridayTerminal = () => {
    // Dispatch a custom event that TerminalTabBar can listen for
    window.dispatchEvent(new CustomEvent('coe:open-terminal', { detail: { tabId: 'friday-server' } }));
  };
```

Then mount the component in the JSX, just before the text input area. Find the input form area and add above it:

```jsx
        {/* Friday server log preview */}
        {fridayEnabled && (
          <FridayLogPreview onOpenTerminal={handleOpenFridayTerminal} />
        )}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/FridayPanel.jsx
git commit -m "feat: mount FridayLogPreview drawer in Friday Panel"
```

---

### Task 9: Update run-electron.bat

**Files:**
- Modify: `run-electron.bat`

- [ ] **Step 1: Remove the separate Friday server launch block**

Replace the entire file content:

```batch
@echo off
title Council of Elrond - Electron Mode
cd /d "%~dp0"

echo.
echo   Council of Elrond - Full Electron Mode
echo   =======================================
echo.

:: Check for node_modules
if not exist "node_modules" (
    echo   Installing dependencies...
    call npm install
    echo.
)

echo   Starting Vite dev server + Electron...
echo   Friday server is now managed by Electron (enable in Settings).
echo   The app window will open automatically.
echo.
echo   Press Ctrl+C to stop.
echo.

call npm run dev
```

- [ ] **Step 2: Commit**

```bash
git add run-electron.bat
git commit -m "feat: remove separate Friday launch from run-electron.bat — now managed by Electron"
```

---

### Task 10: Update FridayPanel Auto-Connect Flow

**Files:**
- Modify: `src/components/dashboard/FridayPanel.jsx`

- [ ] **Step 1: Remove the direct `connectFriday()` auto-connect useEffect**

The current auto-connect useEffect at lines 39-44 calls `connectFriday()` from the renderer. With the new flow, main process auto-connects when it detects the server is ready. Remove or disable this:

Replace:
```javascript
  // Auto-connect only when user toggles fridayEnabled on (not on every status change)
  useEffect(() => {
    if (fridayEnabled && fridayStatus === 'disconnected') {
      connectFriday();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fridayEnabled]);
```

With:
```javascript
  // Friday connection is now managed by main process — it auto-connects
  // when the server PTY outputs "Friday online". No renderer-side auto-connect needed.
  // The enable/disable toggle calls friday:start-server / friday:stop-server via the store.
```

- [ ] **Step 2: Update FridaySettings to not call connectFriday/disconnectFriday directly**

Read `src/components/dashboard/friday/FridaySettings.jsx` and update the enable toggle's onClick:

Replace lines 62-64:
```javascript
            const next = !fridayEnabled;
            setFridayEnabled(next);
            if (!next) disconnectFriday();
```

With:
```javascript
            const next = !fridayEnabled;
            setFridayEnabled(next);
            // disconnectFriday is now handled inside setFridayEnabled
```

And update `handleUrlSave` (lines 23-29) — when URL changes and Friday is enabled, we need to restart the server:

```javascript
  const handleUrlSave = () => {
    console.log(`[Friday Settings] URL saved: ${urlInput}`);
    setFridayServerUrl(urlInput);
    // If Friday is running, the URL change takes effect on next reconnect
    // No need to manually reconnect — server restart handles it
  };
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/FridayPanel.jsx src/components/dashboard/friday/FridaySettings.jsx
git commit -m "feat: remove renderer-side auto-connect — main process manages Friday lifecycle"
```

---

### Task 11: Integration Test — End to End

- [ ] **Step 1: Start the app with `run-electron.bat`**

Verify:
- No separate Friday window spawns
- App launches normally

- [ ] **Step 2: Enable Friday in Settings**

Verify:
- SRV group pill appears in TerminalTabBar
- Friday Server tab shows PTY output (`bun run serve` starting up)
- When "Friday online" appears, status transitions to "connected"
- Morning briefing fires

- [ ] **Step 3: Click SRV group → Friday Server tab**

Verify:
- Full interactive xterm.js terminal
- Can type in the terminal (Ctrl+C, etc.)
- Output is live

- [ ] **Step 4: Click CoE Logs tab**

Verify:
- Shows captured console output with timestamps
- Color-coded: log=default, warn=yellow, error=red
- Read-only (can't type)

- [ ] **Step 5: Check FridayLogPreview in Friday Panel**

Verify:
- Collapsed by default
- Expanding shows last ~20 lines of server output
- "Open Terminal →" button switches to Friday Server tab
- Auto-scrolls on new output

- [ ] **Step 6: Disable Friday in Settings**

Verify:
- Server PTY killed
- Status → disconnected
- SRV group pill status dot turns to default fuchsia

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for embedded studio terminals"
```
