# Embedded Studio Terminals — Design Spec

**Date:** 2026-03-15
**Status:** Approved
**Scope:** Council of Elrond dashboard

## Problem

The Friday server (`bun run serve`) and Electron main process logs currently run in separate terminal windows. This forces the user to alt-tab between 2-3 windows when debugging the Friday integration. All relevant diagnostic output should be visible inside the Studio dashboard.

## Solution

Three components working together:

1. **"SRV" tab group** in the existing left-side TerminalTabBar containing two auto-created terminal tabs
2. **Friday Server tab** — full interactive xterm.js PTY running `bun run serve`
3. **CoE Logs tab** — read-only xterm.js displaying Electron main process console output
4. **Friday Panel log preview** — compact 20-line drawer at the bottom of the Friday Panel mirroring Friday Server output

## Architecture

### 1. Friday Server PTY (Managed by Electron)

**Lifecycle:**
- When `fridayEnabled` is set to `true` in the store, the renderer sends `friday:start-server` IPC to main
- Main process spawns `bun run serve` as a PTY via node-pty **directly** (NOT via `createTerminal()`) in `council-of-elrond/friday/`
- The PTY is spawned with `cwd: path.join(__dirname, '..', 'friday')` (relative to `electron/main.cjs`) and runs the shell command `bun run serve`
- PTY output is relayed to renderer via existing `terminal:data` IPC using scope `friday-server`
- Main process watches PTY stdout for `"Friday online"` or `"listening on"` — once detected, automatically calls `fridayConnect(url)` internally. **The renderer does NOT call `connectFriday()`** — it receives the `'connected'` status via the existing `friday:status` listener pipeline
- When `fridayEnabled` is set to `false`, or the app quits, main process kills the PTY
- PTY exit triggers `terminal:exit` IPC; if unexpected (non-zero exit code), status shows "server crashed"
- User can interact with the terminal (Ctrl+C to restart, scroll, etc.)
- **Error handling:** If `bun` is not found on PATH, the PTY will emit an error. Main process should catch this and send a clear error message via `terminal:data`: `"[CoE] Error: 'bun' not found. Install Bun (https://bun.sh) to run the Friday server."`

**Scope ID:** `friday-server` (reserved, not user-created)

**Important:** The `friday-server` scope must be excluded from Terminal.jsx's cleanup teardown. The existing cleanup logic kills PTYs that don't match known prefixes (`impl-`, `agent-`, `auto-`). The Friday server PTY lifecycle is managed exclusively by the `friday:start-server` / `friday:stop-server` IPC handlers, not by Terminal.jsx mount/unmount.

**Environment:**
- `cwd`: `path.join(__dirname, '..', 'friday')` — resolved relative to `electron/main.cjs`, works in both dev and packaged modes
- `env`: Inherits process env (Bun picks up `.env` automatically)

### 2. CoE Main Process Log Capture

**Capture mechanism:**
- At startup in `main.cjs`, monkey-patch `console.log`, `console.warn`, `console.error` to:
  1. Call the original method (preserve DevTools output)
  2. Push a `{ level, timestamp, message }` entry to a ring buffer (capacity: 2000 lines)
  3. If `mainWindow` exists, send `main:log-entry` IPC event to renderer
- **Filtering:** Exclude high-frequency `terminal:data` relay logs from the ring buffer to avoid flooding. Only capture lines with recognizable prefixes (`[CoE`, `[Friday`, `[Discord`, etc.) or `warn`/`error` level.

**Ring buffer:** Keeps the last 2000 entries in memory. On renderer connect, sends the full buffer via `main:get-logs` IPC invoke.

**Renderer display:**
- A virtual xterm.js instance (no PTY backing) with scope `coe-logs`
- **Created via a new `createVirtualTerminal()` path** in Terminal.jsx that:
  - Opens xterm with `disableStdin: true` option
  - Does NOT wire `term.onData` to `terminal:input` IPC
  - Does NOT call `terminal:create` IPC (no PTY backing)
- On mount, fetches initial buffer via `main:get-logs`, writes all entries
- Subscribes to `main:log-entry` for streaming updates
- Color-coded by level: `log` → default, `warn` → yellow (`\x1b[33m`), `error` → red (`\x1b[31m`)
- Timestamps prefixed: `[12:34:56]`
- Read-only (no user input)

**Scope ID:** `coe-logs` (reserved, not user-created)

### 3. TerminalTabBar — SRV Group

**New group:** `SRV` (Server) rendered as a **separate pill at the far right** of the top tier, with distinct styling (fuchsia border) to differentiate it from project groups. It is NOT built from the `sessionsByProject` map — it is hardcoded as a system group.

**Tabs within SRV:**
| Tab | Scope ID | Color | Icon | Interactive |
|-----|----------|-------|------|-------------|
| Friday Server | `friday-server` | #D946EF (fuchsia) | 🟣 | Yes (full PTY) |
| CoE Logs | `coe-logs` | #3B82F6 (blue) | ⚡ | No (read-only) |

**Auto-creation:** These tabs are created automatically on app startup (not by user action). They appear in the SRV group regardless of which project is selected.

**Tab behavior:**
- Cannot be closed by the user (no X button) — they are system tabs
- Friday Server tab shows a status indicator: green dot when server running, red when stopped/crashed
- CoE Logs tab is always present (log capture starts on boot)

**Attention indicator:** When new output arrives in either tab and it's not the active tab, the SRV group pill gets an attention dot (same pattern as existing agent session attention).

### 4. Friday Panel Log Preview (Compact Drawer)

**Component:** `FridayLogPreview.jsx`

**Location:** Bottom of the Friday Panel, below the ConfirmDialog area, above the text input.

**Behavior:**
- Collapsible drawer with a thin header bar: "Server Log" label + expand/collapse toggle + "Open Terminal →" button
- Collapsed by default; remembers state in localStorage
- When expanded, shows a 120px-tall monospace div with the last ~20 lines of Friday Server PTY output
- Subscribes to the existing `terminal.onData()` IPC (from `preload.cjs`) and filters for `scopeId === 'friday-server'` — does NOT use a separate `onServerData` bridge method
- Strips ANSI escape codes using regex: `/\x1b\[[0-9;]*[a-zA-Z]/g`
- Auto-scrolls to bottom on new output
- "Open Terminal →" button: sets the active terminal tab to `friday-server`, scrolls the SRV group into view in TerminalTabBar

**Not an xterm.js instance** — just a styled `<div>` with a text buffer. This avoids WebGL context overhead and keeps the Friday Panel lightweight.

### 5. Process Management Changes

**`run-electron.bat`:**
- Remove the `start "F.R.I.D.A.Y. Server"` block that launches Friday in a separate window
- Friday is now managed by Electron internally

**`electron/main.cjs` — new IPC handlers:**

| IPC | Type | Purpose |
|-----|------|---------|
| `friday:start-server` | invoke | Spawn Friday PTY directly (not via createTerminal), return `{ ok, scopeId }` |
| `friday:stop-server` | invoke | Kill Friday PTY, return `{ ok }` |
| `friday:server-status` | invoke | Return `'running' \| 'stopped' \| 'crashed'` |
| `main:get-logs` | invoke | Return ring buffer contents (array of log entries) |
| `main:log-entry` | event (send) | Stream new log entries to renderer |

**`electron/preload.cjs` — new bridge methods:**

```javascript
friday: {
  // ... existing methods ...
  startServer: () => ipcRenderer.invoke('friday:start-server'),
  stopServer: () => ipcRenderer.invoke('friday:stop-server'),
  getServerStatus: () => ipcRenderer.invoke('friday:server-status'),
},
main: {
  getLogs: () => ipcRenderer.invoke('main:get-logs'),
  onLogEntry: (cb) => {
    const handler = (event, entry) => cb(entry);
    ipcRenderer.on('main:log-entry', handler);
    return () => ipcRenderer.removeListener('main:log-entry', handler);
  },
}
```

Note: No `onServerData` bridge method — FridayLogPreview uses the existing `terminal.onData()` filtered by scope.

### 6. Store Changes (`useStore.js`)

**New state:**
- `fridayProcessStatus`: `'stopped' | 'starting' | 'running' | 'crashed'`

**Modified `setFridayEnabled`:**
- When enabled → call `friday:start-server` IPC only. Do **NOT** call `connectFriday()` — main process auto-connects when it detects the server is ready and sends the status via `friday:status` IPC events
- When disabled → call `friday:stop-server` IPC, then disconnect WebSocket

**New action:**
- `setFridayProcessStatus(status)` — updates process status, used by IPC listeners

### 7. Connection Flow (Revised)

```
User enables Friday in Settings
  → Store sets fridayEnabled = true
  → Store calls friday:start-server IPC (does NOT call connectFriday)
  → Main spawns PTY: bun run serve (cwd: friday/)
  → PTY output streams to "Friday Server" tab via terminal:data
  → Main watches stdout for "Friday online" or "listening on"
  → Once detected: main auto-calls fridayConnect(url) internally
  → WebSocket connects → fridaySendStatus('connected')
  → Renderer receives 'connected' via existing friday:status listener
  → Morning briefing fires (if first connect)
```

```
User disables Friday in Settings
  → Store sets fridayEnabled = false
  → Store calls friday:stop-server IPC
  → Main kills PTY (SIGTERM)
  → Main calls fridayDisconnect()
  → Status → 'disconnected', fridayProcessStatus → 'stopped'
```

```
Friday server crashes (PTY exits unexpectedly)
  → terminal:exit fires with non-zero code
  → Store sets fridayProcessStatus = 'crashed'
  → WebSocket disconnects (server gone)
  → Status shows "Server crashed — restart?" in Friday Panel
  → User can click restart or toggle Friday off/on
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/dashboard/friday/FridayLogPreview.jsx` | Compact log drawer in Friday Panel |

## Files to Modify

| File | Changes |
|------|---------|
| `electron/main.cjs` | Console monkey-patch, ring buffer (2000 cap, filtered), Friday PTY spawn/kill (direct pty.spawn, not createTerminal), new IPC handlers, auto-connect on server ready, bun-not-found error handling |
| `electron/preload.cjs` | Add `friday.startServer`, `friday.stopServer`, `friday.getServerStatus`, `main.getLogs`, `main.onLogEntry` |
| `src/store/useStore.js` | `fridayProcessStatus` state, modified enable/disable flow (no connectFriday on enable), server PTY listeners |
| `src/components/Terminal.jsx` | Add `createVirtualTerminal()` for read-only coe-logs (disableStdin, no terminal:input wiring, no terminal:create IPC). Exclude `friday-server` from cleanup teardown |
| `src/components/TerminalTabBar.jsx` | Add SRV group as hardcoded system group at far right, system tab rendering (no close button), attention dot |
| `src/components/dashboard/FridayPanel.jsx` | Add FridayLogPreview drawer |
| `run-electron.bat` | Remove separate Friday window launch |

## Out of Scope

- Remote Friday server support (always localhost for now)
- Renderer console capture (use DevTools Ctrl+Shift+I)
- Friday server auto-restart on crash (manual toggle for now)
- Log persistence to disk (ring buffer is in-memory only)
