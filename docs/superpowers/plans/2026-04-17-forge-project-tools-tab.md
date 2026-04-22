# Forge "Project Tools" Tab + Homestead Launchers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Project Tools tab to Forge's project detail view that renders preset tool cards per project (launch a command into a new Forge terminal tab, show a fidelity chip, optionally surface setup hints), and seed Homestead's tools.json with day-one mobile-preview launchers.

**Architecture:** Phase A adds a generic Forge feature — one new React component for the tab body, one new tab entry, a new IPC handler `terminal:create-tool` that wraps the existing `node-pty` pattern from `terminal:create-implementation` but types a plain command instead of a Claude invocation, and a new session type `'tool'` in the Zustand store. Phase B seeds `hq-data/projects/homestead/tools.json` with four curated launchers.

**Tech Stack:** Electron + Vite + React 18 + Zustand store + node-pty + xterm.js (Forge side); JSON config (Homestead side).

---

## Execution context: running inside Forge

This plan is being executed by a Claude CLI running **inside the Forge Electron app itself**. Consequences:

- Changes to `src/**/*.jsx` and `src/store/useStore.js` hot-reload via Vite HMR — no restart needed.
- Changes to `electron/main.cjs` and `electron/preload.cjs` require an Electron restart to take effect.
- The user will restart Forge manually after Phase A.6/A.7 complete. That restart terminates this CLI session.

**Sequencing therefore:** A.1 → A.5 first (HMR-safe), then A.6 + A.7 together, then the user restarts Forge. After restart, resume in a fresh CLI session using the resume note (see Task A.8).

---

## Defaults locked (decided before plan start)

1. **Mobile test launcher**: `apps/mobile/package.json` has no `test` script. Replace brief's tool (c) with `Shared tests (watch)` → `pnpm --filter @homestead/shared test:watch`. This is where 161 of the 181 tests live.
2. **Supabase launcher**: Brief's chain `supabase start && supabase status` is broken because `supabase start` is long-running. Split into two tools:
   - `Supabase (local stack)` → `supabase start`
   - `Supabase status` → `supabase status`
3. **Commits**: One Forge commit per Phase A sub-step (A.1, A.2, A.3+A.4, A.5, A.6+A.7). One Homestead commit for Phase B. No repo touches `tools.json` belongs to the `Samurai` hq-data repo, not Forge or Homestead.
4. **Docs stubs**: Skip. `setupRequired` is plain text in tools.json; no separate markdown files.
5. **Tab icon**: Wrench `🔧` (brief-specified).
6. **Session ID prefix**: `tool-` — distinct from `impl-`, `agent-`, `auto-` so the rec-resolution logic at `Terminal.jsx:447-477` does not trigger on tool exit.
7. **Tab color**: `project.color` if present; fallback to `PHASE_COLORS[project.phase]`; fallback to `#64748b`.

---

## Schema (locked — frontend and tools.json agree on this)

```ts
type Fidelity = 'iOS true' | 'iOS-like' | 'Android-native' | 'Web' | 'Neutral';
type Platform = 'win32' | 'darwin' | 'linux';

interface Tool {
  id: string;                 // stable id, used for session id prefix
  name: string;               // display name
  description: string;        // 1–2 sentence summary
  category: string;           // group label in the UI
  fidelity: Fidelity;         // chip label/color
  command: string;            // shell command string
  cwd?: string;               // relative to project.repoPath, or absolute; default '.'
  env?: Record<string, string>;
  docs?: string;              // optional path or URL
  setupRequired?: string;     // one-line setup hint
  platforms?: Platform[];     // filter by host OS; if omitted, show on all
}

interface ToolsConfig { tools: Tool[] }
```

---

# Phase A — Forge generic feature

## Task A.1: Add `ToolCard` component

**Files:**
- Create: `C:/Claude/Samurai/Forge/src/components/dashboard/tools/ToolCard.jsx`

- [ ] **Step 1: Create the `tools/` directory and `ToolCard.jsx`**

Directory is new. Write this full file:

```jsx
import React from 'react';
import { playSound } from '../../../utils/sounds';

const FIDELITY_COLORS = {
  'iOS true':        '#22C55E',
  'iOS-like':        '#84CC16',
  'Android-native':  '#3B82F6',
  'Web':             '#06B6D4',
  'Neutral':         '#94A3B8',
};

export default function ToolCard({ tool, onLaunch }) {
  const chipColor = FIDELITY_COLORS[tool.fidelity] || FIDELITY_COLORS.Neutral;

  const handleLaunch = () => {
    playSound('click');
    onLaunch(tool);
  };

  return (
    <div className="card space-y-3 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-forge-text-primary truncate">{tool.name}</div>
          <div className="text-[11px] text-forge-text-muted mt-1 leading-relaxed">
            {tool.description}
          </div>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-mono whitespace-nowrap flex-shrink-0"
          style={{ backgroundColor: `${chipColor}22`, color: chipColor }}
          title={`Fidelity: ${tool.fidelity}`}
        >
          {tool.fidelity}
        </span>
      </div>

      {tool.setupRequired && (
        <div className="text-[10px] text-yellow-400/90 leading-snug border-l-2 border-yellow-400/40 pl-2">
          <span className="font-semibold">Setup required:</span> {tool.setupRequired}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto pt-2">
        <code className="text-[10px] font-mono text-forge-text-muted truncate flex-1" title={tool.command}>
          {tool.command}
        </code>
        <button
          onClick={handleLaunch}
          className="px-3 py-1.5 text-[11px] font-medium rounded
                     bg-forge-accent-blue/10 text-forge-accent-blue
                     border border-forge-accent-blue/30
                     hover:bg-forge-accent-blue/20 transition-colors
                     flex-shrink-0"
        >
          Launch
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add src/components/dashboard/tools/ToolCard.jsx
git commit -m "feat(forge): ToolCard component for Project Tools tab"
```

---

## Task A.2: Add `ProjectTools` container

**Files:**
- Create: `C:/Claude/Samurai/Forge/src/components/dashboard/ProjectTools.jsx`

- [ ] **Step 1: Write the component**

```jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import ToolCard from './tools/ToolCard';

const HOST_PLATFORM = (() => {
  // Forge preload may expose platform; fall back to navigator.platform heuristic.
  if (typeof window !== 'undefined' && window.forgePaths?.platform) {
    return window.forgePaths.platform;
  }
  if (typeof navigator !== 'undefined') {
    const p = navigator.platform.toLowerCase();
    if (p.includes('win')) return 'win32';
    if (p.includes('mac')) return 'darwin';
    if (p.includes('linux')) return 'linux';
  }
  return 'win32';
})();

export default function ProjectTools({ slug, project }) {
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const startToolSession = useStore(s => s.startToolSession);

  const toolsPath = `projects/${slug}/tools.json`;
  const absToolsPath = window.forgePaths?.hqData
    ? `${window.forgePaths.hqData}/${toolsPath}`
    : null;

  useEffect(() => {
    if (!window.electronAPI?.hq) return;
    let cancelled = false;
    (async () => {
      const res = await window.electronAPI.hq.readFile(toolsPath);
      if (cancelled) return;
      if (!res.ok) {
        // Not-found is the empty state — don't treat as error.
        if (/ENOENT|not found/i.test(res.error || '')) {
          setConfig({ tools: [] });
        } else {
          setLoadError(res.error || 'Failed to read tools.json');
        }
        return;
      }
      try {
        const parsed = JSON.parse(res.data);
        setConfig(parsed && Array.isArray(parsed.tools) ? parsed : { tools: [] });
      } catch (err) {
        setLoadError(`tools.json is not valid JSON: ${err.message}`);
      }
    })();
    return () => { cancelled = true; };
  }, [toolsPath]);

  const groups = useMemo(() => {
    if (!config) return [];
    const visible = config.tools.filter(t => !t.platforms || t.platforms.includes(HOST_PLATFORM));
    const byCat = new Map();
    for (const t of visible) {
      const cat = t.category || 'Other';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(t);
    }
    return [...byCat.entries()];
  }, [config]);

  const handleLaunch = (tool) => {
    startToolSession(tool, project);
  };

  const handleEditFile = () => {
    if (absToolsPath && window.electronAPI?.hq?.showInFolder) {
      window.electronAPI.hq.showInFolder(absToolsPath);
    }
  };

  if (loadError) {
    return (
      <div className="card text-center py-8">
        <div className="text-sm text-red-400">{loadError}</div>
      </div>
    );
  }

  if (!config) {
    return <div className="card text-center py-8 text-sm text-forge-text-muted">Loading tools…</div>;
  }

  if (groups.length === 0) {
    return (
      <div className="card text-center py-12 space-y-3">
        <div className="text-3xl opacity-30">🔧</div>
        <p className="text-sm text-forge-text-muted">No project tools configured yet.</p>
        <p className="text-[11px] text-forge-text-muted/70">
          Create <code className="text-forge-accent-blue">hq-data/projects/{slug}/tools.json</code> with a
          list of tools. See docs/superpowers/specs or ask <code className="text-forge-accent-blue">@DevOpsEngineer</code>.
        </p>
        <p className="text-[10px] text-forge-text-muted/60">
          (Launchers still live in Environment → Launchers.)
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(([cat, tools]) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-[10px] font-mono font-semibold text-forge-text-muted uppercase tracking-wider">
            {cat}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tools.map(tool => (
              <ToolCard key={tool.id} tool={tool} onLaunch={handleLaunch} />
            ))}
          </div>
        </div>
      ))}

      {absToolsPath && (
        <div className="text-right">
          <button
            onClick={handleEditFile}
            className="text-[10px] text-forge-text-muted hover:text-forge-accent-blue transition-colors font-mono"
          >
            Edit tools.json →
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/ProjectTools.jsx
git commit -m "feat(forge): ProjectTools container reads tools.json + dispatches launches"
```

---

## Task A.3: Register `tools` tab in ProjectDetail

**Files:**
- Modify: `C:/Claude/Samurai/Forge/src/components/dashboard/ProjectDetail.jsx`

- [ ] **Step 1: Add import**

Insert after the existing `import ProjectDocs from './ProjectDocs';` line:

```jsx
import ProjectTools from './ProjectTools';
```

- [ ] **Step 2: Add tab entry**

Modify the `GAME_TABS` array (currently lines 318–326). Insert `'tools'` after `'integrations'`:

```jsx
const GAME_TABS = [
  { id: 'overview', label: 'Overview', icon: '\u2302' },
  { id: 'features', label: 'Features', icon: '\u2726' },
  { id: 'bugs', label: 'Bugs', icon: '\uD83D\uDC1B' },
  { id: 'ideas', label: 'Ideas', icon: '\uD83D\uDCA1' },
  { id: 'api', label: 'API', icon: '\uD83D\uDD0C' },
  { id: 'integrations', label: 'Integrations', icon: '\uD83D\uDD17' },
  { id: 'tools', label: 'Project Tools', icon: '\uD83D\uDD27' },
  { id: 'docs', label: 'Docs', icon: '\uD83D\uDCC4' },
];
```

- [ ] **Step 3: Add tab content branch**

Modify the tab content switch (currently lines 276–312). Insert the `tools` branch before the `docs` branch:

```jsx
{activeGameTab === 'tools' && (
  <ProjectTools slug={slug} project={project} />
)}
{activeGameTab === 'docs' && (
  <ProjectDocs slug={slug} />
)}
```

- [ ] **Step 4: Verify in browser via HMR**

No restart required. Open Forge → click Homestead → verify "Project Tools" tab appears and shows the empty state (tools.json doesn't exist yet).

---

## Task A.4: Add `startToolSession` to the store

**Files:**
- Modify: `C:/Claude/Samurai/Forge/src/store/useStore.js`

- [ ] **Step 1: Find an insertion point**

Insert a new action right after `startAutomationTask` (currently ends around line 776). The action signature:

```js
  // Start a Project Tools launcher session
  startToolSession: (tool, project) => {
    if (!tool || !project) return null;
    const phaseColor = {
      discovery: '#8B5CF6', design: '#06B6D4', build: '#3B82F6',
      test: '#EAB308', deploy: '#F97316', maintain: '#22C55E',
    };
    const agentColor = project.color || phaseColor[project.phase] || '#64748b';

    // Resolve cwd: relative → join with project.repoPath; absolute → as-is.
    const path = require('path-browserify'); // lightweight join fallback
    const cwd = (() => {
      const raw = tool.cwd || '.';
      if (/^([a-zA-Z]:|\\\\|\/)/.test(raw)) return raw;
      return (project.repoPath || '').replace(/[\\/]+$/, '') + '/' + raw.replace(/^[\\/]+/, '');
    })();

    const session = {
      id: `tool-${tool.id}-${Date.now()}`,
      type: 'tool',
      toolId: tool.id,
      toolName: tool.name,
      command: tool.command,
      cwd,
      env: tool.env || null,
      projectSlug: project.slug,
      repoPath: project.repoPath,
      agentName: tool.name,
      agentColor,
      label: `${tool.name} \u2014 ${project.name}`,
      status: 'running',
      exitCode: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    set(state => ({ implementationSessions: [...state.implementationSessions, session] }));
    return session;
  },
```

**Note:** `path-browserify` is NOT a dependency. Simpler: drop the require and do the join inline with string ops (shown above). Remove the `const path = require(...)` line.

Final minimal version of the action (use this, not the version with the require):

```js
  startToolSession: (tool, project) => {
    if (!tool || !project) return null;
    const PHASE_COLORS = {
      discovery: '#8B5CF6', design: '#06B6D4', build: '#3B82F6',
      test: '#EAB308', deploy: '#F97316', maintain: '#22C55E',
    };
    const agentColor = project.color || PHASE_COLORS[project.phase] || '#64748b';

    const rawCwd = tool.cwd || '.';
    const isAbsolute = /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(rawCwd);
    const cwd = isAbsolute
      ? rawCwd
      : `${(project.repoPath || '').replace(/[\\/]+$/, '')}/${rawCwd.replace(/^[\\/]+/, '')}`;

    const session = {
      id: `tool-${tool.id}-${Date.now()}`,
      type: 'tool',
      toolId: tool.id,
      toolName: tool.name,
      command: tool.command,
      cwd,
      env: tool.env || null,
      projectSlug: project.slug,
      repoPath: project.repoPath,
      agentName: tool.name,
      agentColor,
      label: `${tool.name} \u2014 ${project.name}`,
      status: 'running',
      exitCode: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    set(state => ({ implementationSessions: [...state.implementationSessions, session] }));
    return session;
  },
```

- [ ] **Step 2: Commit A.3 + A.4 together**

```bash
git add src/components/dashboard/ProjectDetail.jsx src/store/useStore.js
git commit -m "feat(forge): wire Project Tools tab + startToolSession store action"
```

---

## Task A.5: Extend Terminal.jsx to handle `type: 'tool'` sessions

**Files:**
- Modify: `C:/Claude/Samurai/Forge/src/components/Terminal.jsx`

- [ ] **Step 1: Update `isSessionId`**

Currently at line 275:

```js
const isSessionId = useCallback((id) => {
  return id && (id.startsWith('impl-') || id.startsWith('agent-') || id.startsWith('auto-'));
}, []);
```

Replace with:

```js
const isSessionId = useCallback((id) => {
  return id && (id.startsWith('impl-') || id.startsWith('agent-') || id.startsWith('auto-') || id.startsWith('tool-'));
}, []);
```

- [ ] **Step 2: Add tool branch in `spawnImplementationTerminal`**

Inside the function (line 285+), after the `session.type === 'agent-session'` branch and `session.type === 'automation'` branch, add a `'tool'` branch BEFORE the default Claude-implementation path:

```js
} else if (session.type === 'tool') {
  // Project Tools launcher — spawn a plain shell and type the command
  window.electronAPI.terminal.createTool(
    session.id, cols, rows,
    session.cwd,
    session.command,
    session.env || null
  );
}
```

Ensure the surrounding if/else structure remains valid. The existing default branch runs `buildImplementPrompt` — keep it as the final `else`.

- [ ] **Step 3: Update exit handler**

At line 447:

```js
if (scopeId.startsWith('impl-') || scopeId.startsWith('agent-') || scopeId.startsWith('auto-')) {
```

Split into two cases: tool sessions only need status updates; impl/agent/auto still do rec-resolution.

```js
if (scopeId.startsWith('tool-')) {
  const store = useStore.getState();
  const session = store.implementationSessions.find(s => s.id === scopeId);
  if (!session) return;
  const status = exitCode === 0 ? 'done' : 'failed';
  store.updateSessionStatus(scopeId, status, exitCode);
  // Tool sessions don't resolve recommendations and don't play complete/failed sfx.
  return;
}
if (scopeId.startsWith('impl-') || scopeId.startsWith('agent-') || scopeId.startsWith('auto-')) {
  // ... existing logic unchanged
}
```

- [ ] **Step 4: Verify HMR reload**

Open Forge DevTools console. No errors on reload. Tab still opens. (Launch will error until A.6/A.7 land — that's expected.)

- [ ] **Step 5: Commit**

```bash
git add src/components/Terminal.jsx
git commit -m "feat(forge): Terminal.jsx handles tool-prefixed sessions"
```

---

## Task A.6: Add `terminal:create-tool` IPC handler in main.cjs

**Files:**
- Modify: `C:/Claude/Samurai/Forge/electron/main.cjs`

⚠️ **This change requires an Electron restart to take effect. Do A.6 and A.7 together.**

- [ ] **Step 1: Add handler**

Insert right after the `terminal:create-implementation` handler (ends around line 401) and before `terminal:create` (line 403):

```js
// IPC handler for Project Tools launchers — custom CWD + auto-typed plain command
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

    proc.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', { scopeId, data });
      }
    });

    proc.onExit(({ exitCode }) => {
      console.log(`[Forge] Tool PTY scope="${scopeId}" exited code=${exitCode}`);
      ptyProcesses.delete(scopeId);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', { scopeId, exitCode });
      }
    });

    // Type the command after shell is ready
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
```

---

## Task A.7: Expose `terminal.createTool` in preload.cjs

**Files:**
- Modify: `C:/Claude/Samurai/Forge/electron/preload.cjs`

- [ ] **Step 1: Add createTool method**

Inside the `terminal` object (lines 15–34), add after `createAgentSession`:

```js
createTool: (scopeId, cols, rows, cwd, command, env) =>
  ipcRenderer.send('terminal:create-tool', { scopeId, cols, rows, cwd, command, env }),
```

- [ ] **Step 2: Expose `platform` in forgePaths**

Modify the `forgePaths` bridge (lines 6–11):

```js
contextBridge.exposeInMainWorld('forgePaths', {
  forgeRoot: PATHS.forgeRoot,
  hqData: PATHS.hqData,
  agentsDir: PATHS.agentsDir,
  claudeMd: PATHS.claudeMd,
  platform: process.platform,
});
```

- [ ] **Step 3: Write resume file BEFORE restart**

This is the handoff for the next CLI session. Write to:

`C:/Claude/Samurai/hq-data/projects/homestead/recommendations/project-tools-resume.md`

Contents:
```md
# Project Tools Implementation — Resume Note

**Status at restart:** Phase A tasks A.1–A.7 complete. Forge must be restarted for new Electron IPC + preload bindings to activate.

**After restart, in a fresh Forge terminal:**
1. Open claude CLI in C:/Claude/Samurai/Forge (or any project).
2. Say "resume from project-tools".
3. The agent should:
   - Read this file.
   - `git log -5` in C:/Claude/Samurai/Forge — verify commits for A.1–A.7 landed.
   - Open Homestead → Project Tools tab, confirm empty state renders.
   - Proceed to Phase B (write tools.json) and Task A.8 (smoke test).

**Original brief:** C:/Users/charl/AppData/Local/Temp/forge-impl-1776482973910.md
**Plan:** C:/Claude/Samurai/Forge/docs/superpowers/plans/2026-04-17-forge-project-tools-tab.md
```

- [ ] **Step 4: Commit A.6 + A.7 together**

```bash
cd C:/Claude/Samurai/Forge
git add electron/main.cjs electron/preload.cjs
git commit -m "feat(forge): terminal:create-tool IPC + expose platform in preload"
```

- [ ] **Step 5: Prompt user to restart Forge**

Output message: "Phase A complete. Please restart Forge so the new Electron IPC handler loads. After restart, launch a new claude CLI from any Forge terminal and say 'resume from project-tools' — I'll pick up with Phase B."

---

## Task A.8: Post-restart smoke test (runs in NEXT CLI session)

**Files:** none (verification only)

- [ ] **Step 1: Verify commits**

```bash
cd C:/Claude/Samurai/Forge
git log --oneline -8
```
Expected: 5 new commits for A.1, A.2, A.3+A.4, A.5, A.6+A.7.

- [ ] **Step 2: Verify tab renders**

Manual: open Forge → Homestead → "Project Tools" tab. Should show the empty state with the `hq-data/projects/homestead/tools.json` path hint. No console errors.

- [ ] **Step 3: Verify IPC is live**

In DevTools console inside Forge:
```js
typeof window.electronAPI.terminal.createTool
// Expected: "function"
window.forgePaths.platform
// Expected: "win32"
```

If either fails, Forge was not restarted or the preload didn't reload — ask user to fully quit (not just reload window) and relaunch.

---

# Phase B — Homestead seed config

## Task B.1: Write `tools.json`

**Files:**
- Create: `C:/Claude/Samurai/hq-data/projects/homestead/tools.json`

- [ ] **Step 1: Write the file**

```json
{
  "tools": [
    {
      "id": "expo-android",
      "name": "Expo on Android emulator",
      "description": "Launches Expo dev server targeting a connected Android emulator. Closest touch fidelity to iPhone reachable on Windows.",
      "category": "Mobile Preview",
      "fidelity": "Android-native",
      "command": "pnpm --filter @homestead/mobile exec expo start --android",
      "cwd": ".",
      "platforms": ["win32", "darwin", "linux"],
      "setupRequired": "Android Studio + AVD (emulator) running before launch."
    },
    {
      "id": "expo-web",
      "name": "Expo web preview",
      "description": "Launches Expo dev server in web mode. Fast iteration, limited native-module fidelity.",
      "category": "Mobile Preview",
      "fidelity": "Web",
      "command": "pnpm --filter @homestead/mobile exec expo start --web",
      "cwd": ".",
      "platforms": ["win32", "darwin", "linux"]
    },
    {
      "id": "shared-tests-watch",
      "name": "Shared tests (watch)",
      "description": "Watches @homestead/shared for changes and re-runs its vitest suite. Covers domain logic, schemas, sync, catalog-query helpers.",
      "category": "Testing",
      "fidelity": "Neutral",
      "command": "pnpm --filter @homestead/shared test:watch",
      "cwd": ".",
      "platforms": ["win32", "darwin", "linux"]
    },
    {
      "id": "supabase-start",
      "name": "Supabase (local stack)",
      "description": "Starts the local Supabase stack (Postgres + Auth + Storage + Studio) via the CLI.",
      "category": "Backend",
      "fidelity": "Neutral",
      "command": "supabase start",
      "cwd": ".",
      "platforms": ["win32", "darwin", "linux"],
      "setupRequired": "Supabase CLI + Docker Desktop running."
    },
    {
      "id": "supabase-status",
      "name": "Supabase status",
      "description": "Prints current Supabase service URLs — Studio, API, DB — once the local stack is running.",
      "category": "Backend",
      "fidelity": "Neutral",
      "command": "supabase status",
      "cwd": ".",
      "platforms": ["win32", "darwin", "linux"]
    }
  ]
}
```

- [ ] **Step 2: Verify in UI**

Open Forge → Homestead → Project Tools tab. Expected: two groups (Mobile Preview, Testing, Backend), 5 cards total, each with fidelity chip and Launch button.

- [ ] **Step 3: Smoke-test one launcher**

Click "Shared tests (watch)". Expected: new terminal tab opens labeled "Shared tests (watch) — Homestead", color stripe set, vitest watcher starts and runs tests in `C:/Claude/Homestead`. Close tab → PTY exits.

- [ ] **Step 4: Commit**

```bash
cd C:/Claude/Samurai/hq-data
git add projects/homestead/tools.json
git commit -m "feat(homestead): seed tools.json with 5 day-one launchers"
```

(If `hq-data` is not a git repo, skip — the `.claude/settings.local.json` or directory-watch handles persistence.)

---

## Self-review checklist

- [x] Every step shows complete code, no "TBD" or "similar to above".
- [x] Session ID prefix (`tool-`) distinct from existing prefixes; exit handler explicitly handles it.
- [x] The brief's broken supabase chain is split into two tools.
- [x] Mobile test script mismatch resolved by targeting `@homestead/shared test:watch`.
- [x] Restart handoff documented via resume note (Task A.7 Step 3).
- [x] Fidelity chip colors defined; default falls back to Neutral.
- [x] Platform filter uses `forgePaths.platform` with `navigator.platform` fallback.
- [x] CWD path resolution handles both relative and absolute (Windows drive letters + UNC + POSIX).
- [x] Rec-resolution logic at `Terminal.jsx:447` does NOT fire for tool sessions (tool branch returns early).
- [x] Empty state explicitly mentions Launchers still live in Environment (brief requirement).

---

## Execution order summary

1. **This session (HMR-safe):** A.1 → A.2 → A.3 → A.4 → A.5 (5 commits)
2. **This session (requires restart):** A.6 → A.7 (1 commit) → write resume note → **USER RESTARTS FORGE**
3. **Next session (post-restart):** A.8 smoke test → B.1 (1 commit) → final smoke test → done.
