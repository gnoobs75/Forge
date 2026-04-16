# Port Status Indicator — Design Spec

## Overview

A shared port registry and live health monitor that runs across both Forge and Council of Elrond Electron apps. Prevents port collisions, shows service health at a glance, and provides detailed port breakdown on demand.

## Problem

- Forge and CoE both run Friday servers, Vite dev servers, and ttyd instances. They were both defaulting to port 3000, causing silent startup failures.
- Client projects (SafetyFirst, Homestead) may also run dev servers. No visibility into what's occupied.
- Agents assigning ports to new projects have no way to check what's already in use.
- No UI shows whether services are actually running or just configured.

## Solution

**Shared Port Manifest** (`hq-data/ports.json`) + **TCP health checks** every 15 seconds + **dual UI** (status bar dots + SRV popover).

## Port Assignments

| Service | Forge | CoE |
|---------|-------|-----|
| Vite Dev Server | 5180 | 5173 |
| Friday Server | 3100 | 3000 |
| Friday ttyd | 7691 | 7681 |

Project ports are defined per-project in `project.json` under the `ports` field (already exists for some projects).

## Data Model

### Port Manifest: `hq-data/ports.json`

Shared file read/written by both Forge and CoE Electron apps.

```json
{
  "registrations": [
    {
      "port": 5180,
      "service": "Vite Dev",
      "app": "forge",
      "project": null,
      "pid": 12345,
      "registeredAt": "2026-04-04T12:00:00Z"
    },
    {
      "port": 3100,
      "service": "Friday Server",
      "app": "forge",
      "project": null,
      "pid": 12350,
      "registeredAt": "2026-04-04T12:00:00Z"
    },
    {
      "port": 7691,
      "service": "ttyd",
      "app": "forge",
      "project": null,
      "pid": null,
      "registeredAt": "2026-04-04T12:00:00Z"
    },
    {
      "port": 5173,
      "service": "Dev Server",
      "app": "forge",
      "project": "safetyfirst-credentialing",
      "pid": null,
      "registeredAt": "2026-04-04T12:00:00Z"
    }
  ]
}
```

**Fields:**
- `port` — integer, the TCP port number
- `service` — human label (e.g. "Vite Dev", "Friday Server", "Dev Server")
- `app` — owning app identifier: `"forge"` or `"council-of-elrond"`
- `project` — project slug if this is a project-specific port, `null` for infrastructure
- `pid` — process ID if known (for stale entry cleanup), `null` if not tracked
- `registeredAt` — ISO-8601 timestamp

### Health Check Result (in-memory only)

```js
{
  port: 3100,
  service: "Friday Server",
  app: "forge",
  project: null,
  status: "up",       // "up" | "down" | "occupied"
  latencyMs: 2
}
```

**Status values:**
- `up` — registered and TCP connect succeeds
- `down` — registered but TCP connect fails
- `occupied` — not registered by any app but something is listening (collision risk)

## Architecture

### Electron Main Process (`electron/main.cjs`)

New `startPortMonitor()` function:

1. **Registration phase** (on app startup, before `createWindow`):
   - Read `hq-data/ports.json` (create if missing)
   - Register this app's infrastructure ports (Vite, Friday, ttyd) with current PIDs where available
   - Scan `hq-data/projects/*/project.json` for `ports` fields, register those as project ports
   - Prune stale entries: if a registration has a `pid` and that PID is no longer running, remove it
   - Write back the merged manifest

2. **Health check loop** (every 15 seconds):
   - For each registration in the manifest: TCP connect with 2-second timeout
   - Mark status as `up` or `down`
   - Optionally scan a small set of common dev ports (3000, 3100, 5173, 5174, 5180, 8000, 8080, 8081) for unregistered occupants — mark as `occupied`
   - Send health array to renderer: `mainWindow.webContents.send('ports:status', healthArray)`

3. **Cleanup phase** (on `app.on('will-quit')`):
   - Remove this app's registrations from `ports.json`

4. **IPC handler**:
   - `ports:refresh` — force an immediate health check cycle (for the refresh button in the popover)

### Electron Preload (`electron/preload.cjs`)

```js
ports: {
  onStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('ports:status', handler);
    return () => ipcRenderer.removeListener('ports:status', handler);
  },
  refresh: () => ipcRenderer.invoke('ports:refresh'),
}
```

### Store (`src/store/useStore.js`)

New state field:
```js
portHealth: [],  // Array of health check results
```

IPC listener setup in `loadFromFiles` or Dashboard mount:
```js
if (window.electronAPI?.ports) {
  window.electronAPI.ports.onStatus((health) => {
    set({ portHealth: health });
  });
}
```

### UI Components

#### StatusBar.jsx — Port Dots

Added to the right side of the existing status bar, before the "Connected" indicator.

- Render one dot per port in `portHealth` that belongs to the current app
- Colors: green (`#22c55e`) = up, red (`#ef4444`) = down (pulsing), yellow (`#eab308`) = collision
- Clicking the dot cluster opens the port popover
- Tooltip on hover shows count: "3 services, 1 down"

#### PortPopover.jsx — New Component

Floating panel anchored to the dots or SRV button. Grouped sections:

1. **Infrastructure** — this app's core services (Vite, Friday, ttyd)
2. **Projects** — project-specific ports from this app's projects
3. **Other Apps** — ports registered by the sibling app (dimmed, informational)
4. **Collision Warnings** — yellow box listing any port claimed by multiple services, or unregistered-but-occupied ports

Each row shows: status dot, service name, port number. Down services show a red "DOWN" label. Collision rows show a yellow warning.

Footer: "Polling every 15s" + refresh button.

Dismissed by clicking outside or pressing Escape.

#### TerminalTabBar.jsx — SRV Button Integration

The existing SRV button click can also toggle the port popover (as an alternative entry point). The SRV dot color reflects the worst status across all ports (all green = green, any down = red, any collision = yellow).

## File Changes

### Forge
| File | Change |
|------|--------|
| `electron/main.cjs` | Add `startPortMonitor()`, register/unregister lifecycle, `ports:refresh` IPC handler |
| `electron/preload.cjs` | Add `ports` API (onStatus, refresh) |
| `src/store/useStore.js` | Add `portHealth` state, IPC listener |
| `src/components/StatusBar.jsx` | Add port dots cluster with click handler |
| `src/components/PortPopover.jsx` | New component — detail panel |
| `src/components/TerminalTabBar.jsx` | Wire SRV button to also open port popover |
| `hq-data/ports.json` | New shared manifest (created on first startup) |

### Council of Elrond
Mirror the same changes with CoE's port values (3000, 5173, 7681) and `app: "council-of-elrond"`.

| File | Change |
|------|--------|
| `council-of-elrond/electron/main.cjs` | Add `startPortMonitor()`, register/unregister lifecycle |
| `council-of-elrond/electron/preload.cjs` | Add `ports` API |
| `council-of-elrond/src/store/useStore.js` | Add `portHealth` state |
| `council-of-elrond/src/components/StatusBar.jsx` | Add port dots |
| `council-of-elrond/src/components/PortPopover.jsx` | New component |
| `council-of-elrond/src/components/TerminalTabBar.jsx` | Wire SRV button |

## TCP Health Check Implementation

```js
function checkPort(port, timeout = 2000) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    const start = Date.now();
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      socket.destroy();
      resolve({ port, status: 'up', latencyMs: Date.now() - start });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ port, status: 'down', latencyMs: timeout });
    });
    socket.on('error', () => {
      socket.destroy();
      resolve({ port, status: 'down', latencyMs: Date.now() - start });
    });
    socket.connect(port, '127.0.0.1');
  });
}
```

## Collision Detection

After health-checking all registered ports, scan a predefined list of common dev ports. Any port that responds to TCP connect but is NOT in the manifest is flagged as `occupied`. The UI shows these in the collision warning section.

Common ports to scan: `[3000, 3100, 5173, 5174, 5180, 7681, 7691, 8000, 8080, 8081]`.

## Edge Cases

- **Both apps start simultaneously**: File-level race on `ports.json`. Mitigated by read-merge-write (not overwrite). Each app only adds/removes its own entries.
- **App crashes without cleanup**: Stale entries detected by PID check on next startup. PIDs that no longer exist get pruned.
- **Port manifest doesn't exist yet**: Created with empty `registrations` array on first read.
- **Project has no `ports` field**: Skipped — no registration created.
