import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '../store/useStore';
import { buildImplementPrompt } from '../utils/buildImplementPrompt';
import { buildAgentTaskPrompt } from '../utils/buildAgentTaskPrompt';
import { playSound } from '../utils/sounds';
import { getAgentBrain, getModelFlag } from '../utils/brainConfig';
import TerminalTabBar from './TerminalTabBar';

// Agent suggestions per project scope
const SCOPE_AGENTS = {
  studio: [
    { cmd: '@MarketAnalyst', color: '34', desc: 'analyze competitors for Expedition' },
    { cmd: '@StoreOptimizer', color: '32', desc: "draft TTR's App Store listing" },
    { cmd: '@StudioProducer', color: '33', desc: 'what should I focus on this week?' },
    { cmd: '@CreativeThinker', color: '31', desc: 'what wild features could make TTR viral?' },
  ],
  expedition: [
    { cmd: '@QAAdvisor', color: '31', desc: 'run launch readiness check' },
    { cmd: '@StoreOptimizer', color: '32', desc: 'draft the Steam store listing' },
    { cmd: '@ArtDirector', color: '33', desc: 'review ship visual quality' },
    { cmd: '@MarketAnalyst', color: '34', desc: 'analyze competitor pricing' },
  ],
  'ttr-ios': [
    { cmd: '@Monetization', color: '32', desc: 'optimize Battle Pass structure' },
    { cmd: '@StoreOptimizer', color: '32', desc: 'draft App Store listing' },
    { cmd: '@PlayerPsych', color: '35', desc: 'analyze session length & retention' },
    { cmd: '@CreativeThinker', color: '31', desc: 'brainstorm viral trick mechanics' },
  ],
  'ttr-roblox': [
    { cmd: '@CommunityManager', color: '36', desc: 'plan Roblox community launch' },
    { cmd: '@Monetization', color: '32', desc: 'design cosmetics shop' },
    { cmd: '@GrowthStrategist', color: '33', desc: 'plan Roblox discovery strategy' },
    { cmd: '@QAAdvisor', color: '31', desc: 'multiplayer stability check' },
  ],
};

const XTERM_THEME = {
  background: '#18181C',
  foreground: '#e2e8f0',
  cursor: '#C52638',
  cursorAccent: '#18181C',
  selectionBackground: 'rgba(197, 38, 56, 0.3)',
  black: '#18181C',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#8b5cf6',
  cyan: '#06b6d4',
  white: '#e2e8f0',
  brightBlack: '#64748b',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#a78bfa',
  brightCyan: '#22d3ee',
  brightWhite: '#f8fafc',
};

// Module-level xterm imports (loaded once)
let xtermModules = null;
function loadXtermModules() {
  if (!xtermModules) {
    xtermModules = Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/addon-web-links'),
      import('@xterm/xterm/css/xterm.css'),
    ]).then(([xtermMod, fitMod, linksMod]) => ({
      Terminal: xtermMod.Terminal,
      FitAddon: fitMod.FitAddon,
      WebLinksAddon: linksMod.WebLinksAddon,
    }));
  }
  return xtermModules;
}

// Wait until a DOM element has real dimensions (> 10px wide)
function waitForLayout(el) {
  return new Promise((resolve) => {
    const check = () => {
      if (el.offsetWidth > 10 && el.offsetHeight > 10) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

export default function Terminal({ scope }) {
  // Map of scopeId → { term, fitAddon, containerEl }
  const terminalsRef = useRef(new Map());
  const wrapperRef = useRef(null);
  const currentScopeRef = useRef(null);
  const activeTabRef = useRef(null);
  const listenersRef = useRef(null); // global Electron listeners
  const spawnedSessionsRef = useRef(new Set()); // track which impl sessions we've already spawned

  const [activeTabId, setActiveTabId] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [forceRender, setForceRender] = useState(0); // Trigger re-render when dynamic tabs are added

  const implementationSessions = useStore(s => s.implementationSessions);
  const claudeSessions = useStore(s => s.claudeSessions);

  // Create a new xterm instance for a scope or implementation session
  const createTerminalInstance = useCallback(async (id) => {
    const { Terminal: XTerm, FitAddon, WebLinksAddon } = await loadXtermModules();

    const term = new XTerm({
      theme: XTERM_THEME,
      fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowProposedApi: true,
      rightClickSelectsWord: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    // Ctrl+C copies when there's a selection, Ctrl+V pastes from clipboard
    term.attachCustomKeyEventHandler((ev) => {
      // Ctrl+C with selection → copy
      if (ev.ctrlKey && ev.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
        return false; // prevent sending SIGINT
      }
      // Ctrl+V → paste
      if (ev.ctrlKey && ev.key === 'v') {
        navigator.clipboard.readText().then(text => {
          if (text && window.electronAPI?.terminal) {
            window.electronAPI.terminal.input(id, text);
          }
        });
        return false; // prevent default
      }
      // Ctrl+Shift+C → always copy
      if (ev.ctrlKey && ev.shiftKey && ev.key === 'C') {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection());
          term.clearSelection();
        }
        return false;
      }
      // Ctrl+Shift+V → always paste
      if (ev.ctrlKey && ev.shiftKey && ev.key === 'V') {
        navigator.clipboard.readText().then(text => {
          if (text && window.electronAPI?.terminal) {
            window.electronAPI.terminal.input(id, text);
          }
        });
        return false;
      }
      return true; // let xterm handle everything else
    });

    // Create container — positioned absolute to fill wrapper
    const containerEl = document.createElement('div');
    containerEl.style.position = 'absolute';
    containerEl.style.inset = '0';
    containerEl.dataset.scopeId = id;

    // Hide all other terminals before appending
    for (const [, e] of terminalsRef.current) {
      e.containerEl.style.display = 'none';
    }

    if (wrapperRef.current) {
      wrapperRef.current.appendChild(containerEl);
    }

    await waitForLayout(containerEl);

    term.open(containerEl);
    fitAddon.fit();

    // Right-click: copy selection or paste (attached after open so term.element exists)
    containerEl.addEventListener('contextmenu', (ev) => {
      if (term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
      } else {
        navigator.clipboard.readText().then(text => {
          if (text && window.electronAPI?.terminal) {
            window.electronAPI.terminal.input(id, text);
          }
        });
      }
      ev.preventDefault();
    });

    const entry = { term, fitAddon, containerEl };
    terminalsRef.current.set(id, entry);

    return entry;
  }, []);

  // Create a new xterm instance for a scope
  const createScopeTerminal = useCallback(async (scopeId, scopeLabel, repoPath, projectName) => {
    const entry = await createTerminalInstance(scopeId);
    const { term } = entry;

    // Connect to Electron PTY or init dev mode
    if (window.electronAPI?.terminal) {
      const { cols, rows } = term;
      window.electronAPI.terminal.create(scopeId, cols, rows, repoPath);

      term.onData((data) => {
        window.electronAPI.terminal.input(scopeId, data);
      });

      term.onResize(({ cols, rows }) => {
        window.electronAPI.terminal.resize(scopeId, cols, rows);
      });
    } else {
      // Dev mode — scope-aware banner
      initDevMode(term, scopeId, repoPath, projectName);
    }

    return entry;
  }, [createTerminalInstance]);

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
      disableStdin: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

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

  // Check if an ID belongs to a session (not a scope terminal or system terminal)
  const isSessionId = useCallback((id) => {
    return id && (id.startsWith('impl-') || id.startsWith('agent-') || id.startsWith('auto-') || id.startsWith('tool-') || id.startsWith('session-'));
  }, []);

  // System-managed terminal IDs that should NOT be killed on cleanup
  const isSystemTerminal = useCallback((id) => {
    return id === 'friday-server' || id === 'forge-logs' || id === 'vite-server';
  }, []);

  // Spawn implementation terminal for a session
  const spawnImplementationTerminal = useCallback(async (session) => {
    if (spawnedSessionsRef.current.has(session.id)) return;
    spawnedSessionsRef.current.add(session.id);

    const entry = await createTerminalInstance(session.id);
    const { term } = entry;

    if (window.electronAPI?.terminal) {
      const { cols, rows } = term;
      const store = useStore.getState();
      const project = store.projects.find(p => p.slug === session.projectSlug);

      // Look up agent brain for model flag
      const agentId = session.agentId || store.agents.find(a => a.name === session.agentName)?.id;
      const brain = getAgentBrain(agentId, store.agentBrains);
      const modelFlag = getModelFlag(brain);

      if (session.type === 'agent-session') {
        // Agent session — either a custom prompt (idea analysis) or interactive agent
        if (session.prompt) {
          // Custom prompt (e.g. idea analysis) — use createImplementation
          window.electronAPI.terminal.createImplementation(
            session.id, cols, rows,
            session.cwd || session.repoPath || window.forgePaths?.forgeRoot || '',
            session.prompt,
            session.flags || '',
            session.mode || 'auto',
            modelFlag,
            session.agentSlug || session.agentId || null,
            session.projectSlug || null
          );
        } else {
          // Interactive agent session — use createAgentSession
          window.electronAPI.terminal.createAgentSession(
            session.id, cols, rows,
            session.agentId,
            session.projectSlug,
            modelFlag
          );
        }
      } else if (session.type === 'automation') {
        // Automation task — use buildAgentTaskPrompt
        if (project) {
          const prompt = buildAgentTaskPrompt({
            agentName: session.agentName,
            agentId: session.agentId,
            action: session.action,
            projectSlug: session.projectSlug,
            projectName: project.name,
            repoPath: session.repoPath,
          });
          const flags = '--dangerously-skip-permissions';
          window.electronAPI.terminal.createImplementation(
            session.id, cols, rows, session.repoPath || window.forgePaths?.forgeRoot || '', prompt, flags, 'auto', modelFlag
          );
        }
      } else if (session.type === 'tool') {
        // Project Tools launcher — spawn a plain shell and type the command
        window.electronAPI.terminal.createTool(
          session.id, cols, rows,
          session.cwd,
          session.command,
          session.env || null
        );
      } else {
        // Regular implementation — use buildImplementPrompt
        const rec = store.recommendations.find(r =>
          r.timestamp === session.recTimestamp && r.title === session.recTitle
        );

        if (rec && project) {
          const prompt = buildImplementPrompt(rec, project, session.approachId);
          const flags = session.mode === 'auto' ? '--dangerously-skip-permissions' : '';
          window.electronAPI.terminal.createImplementation(
            session.id, cols, rows, session.repoPath, prompt, flags, session.mode, modelFlag
          );
        }
      }

      term.onData((data) => {
        window.electronAPI.terminal.input(session.id, data);
      });

      term.onResize(({ cols, rows }) => {
        window.electronAPI.terminal.resize(session.id, cols, rows);
      });
    } else {
      // Dev mode — show implementation info
      term.writeln('');
      term.writeln(`  \x1b[1;35m\u2728 Implementation Session\x1b[0m`);
      term.writeln('  \x1b[90m\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\x1b[0m');
      term.writeln(`  \x1b[33m\u26A0 Browser dev mode\x1b[0m \x1b[90m\u2014 implementation runs in Electron\x1b[0m`);
      term.writeln('');
      term.writeln(`  \x1b[1;37mRec:\x1b[0m ${session.label}`);
      term.writeln(`  \x1b[1;37mAgent:\x1b[0m \x1b[36m${session.agentName}\x1b[0m`);
      term.writeln(`  \x1b[1;37mMode:\x1b[0m ${session.mode === 'auto' ? '\x1b[33m\u26A1 Full Auto' : '\x1b[32m\u25B6 Plan'}\x1b[0m`);
      term.writeln(`  \x1b[1;37mRepo:\x1b[0m \x1b[90m${session.repoPath}\x1b[0m`);
      term.writeln('');
    }

    // Switch to this tab
    setActiveTabId(session.id);
    activeTabRef.current = session.id;

    return entry;
  }, [createTerminalInstance]);

  // Mount an xterm UI for a persistent Claude CLI session (PTY is already spawned
  // by the main-process SessionTracker on startup; this only wires the renderer).
  const spawnClaudeSessionTerminal = useCallback(async (tab) => {
    if (spawnedSessionsRef.current.has(tab.scopeId)) return;
    spawnedSessionsRef.current.add(tab.scopeId);

    const entry = await createTerminalInstance(tab.scopeId);
    const { term } = entry;

    if (window.electronAPI?.terminal) {
      term.onData((data) => {
        window.electronAPI.terminal.input(tab.scopeId, data);
      });
      term.onResize(({ cols, rows }) => {
        window.electronAPI.terminal.resize(tab.scopeId, cols, rows);
      });
    } else {
      // Dev-mode: no PTY — show a simple banner
      term.writeln('');
      term.writeln(`  \x1b[1;35m\u2728 Claude Session\x1b[0m`);
      term.writeln(`  \x1b[1;37mLabel:\x1b[0m ${tab.label || '(untitled)'}`);
      term.writeln(`  \x1b[1;37mCwd:\x1b[0m \x1b[90m${tab.cwd}\x1b[0m`);
      term.writeln('');
    }

    return entry;
  }, [createTerminalInstance]);

  // Tab switching
  const handleTabSelect = useCallback((tabId) => {
    setActiveTabId(tabId);
    activeTabRef.current = tabId;
    playSound('tab');
    const targetId = tabId || scope?.id;

    for (const [id, e] of terminalsRef.current) {
      e.containerEl.style.display = id === targetId ? '' : 'none';
    }

    const entry = terminalsRef.current.get(targetId);
    if (entry) {
      requestAnimationFrame(() => {
        try { entry.fitAddon.fit(); } catch (e) {}
        entry.term.focus();
      });
    }
  }, [scope?.id]);

  // Tab closing — kills the PTY if still running
  const handleTabClose = useCallback((sessionId) => {
    const store = useStore.getState();

    // Persistent Claude CLI session tab (scopeId has `session-` prefix):
    // kill the PTY — main's terminal:kill handler calls closeByScopeId which
    // removes the registry entry; the sessionTabs:update broadcast then drops
    // the tab from the store, and our claudeSessions effect disposes the xterm.
    // Dormant tabs are handled inside ClaudeSessionTab via sessionTabs.remove.
    if (sessionId && sessionId.startsWith('session-')) {
      if (window.electronAPI?.terminal?.kill) {
        window.electronAPI.terminal.kill(sessionId);
      }
      handleTabSelect(scope?.id);
      return;
    }

    const session = store.implementationSessions.find(s => s.id === sessionId);

    // Kill the PTY process if still running
    if (session?.status === 'running' && window.electronAPI?.terminal?.kill) {
      window.electronAPI.terminal.kill(sessionId);
      store.updateSessionStatus(sessionId, 'failed', -1);
    }

    store.closeSession(sessionId);
    spawnedSessionsRef.current.delete(sessionId);

    const entry = terminalsRef.current.get(sessionId);
    if (entry) {
      try { entry.term.dispose(); } catch (e) {}
      try { entry.containerEl.remove(); } catch (e) {}
      terminalsRef.current.delete(sessionId);
    }

    // Switch back to project tab
    handleTabSelect(scope?.id);
  }, [scope?.id, handleTabSelect]);

  // One-time setup: global Electron listeners + ResizeObserver
  useEffect(() => {
    let resizeObserver;

    // Global Electron data/exit listeners (registered once, route by scopeId)
    if (window.electronAPI?.terminal) {
      const removeData = window.electronAPI.terminal.onData((scopeId, data) => {
        const entry = terminalsRef.current.get(scopeId);
        if (entry) entry.term.write(data);
      });

      const removeExit = window.electronAPI.terminal.onExit((scopeId, exitCode) => {
        const entry = terminalsRef.current.get(scopeId);
        if (entry) {
          entry.term.writeln(`\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m`);
        }

        // Tool sessions: status-only; don't trigger rec-resolution or sfx.
        if (scopeId.startsWith('tool-')) {
          const store = useStore.getState();
          const session = store.implementationSessions.find(s => s.id === scopeId);
          if (!session) return;
          const status = exitCode === 0 ? 'done' : 'failed';
          store.updateSessionStatus(scopeId, status, exitCode);
          return;
        }

        // Handle session exit (impl-, agent-, auto- prefixed IDs)
        if (scopeId.startsWith('impl-') || scopeId.startsWith('agent-') || scopeId.startsWith('auto-')) {
          const store = useStore.getState();
          const session = store.implementationSessions.find(s => s.id === scopeId);
          if (!session) return;

          const status = exitCode === 0 ? 'done' : 'failed';
          store.updateSessionStatus(scopeId, status, exitCode);

          // Auto-resolve on success
          if (exitCode === 0) {
            const rec = store.recommendations.find(r =>
              r.timestamp === session.recTimestamp && r.title === session.recTitle
            );
            if (rec) {
              store.updateRecommendationStatus(rec, 'resolved', { resolvedBy: 'auto-implement' });
              const activity = {
                id: Date.now(),
                agent: session.agentName,
                agentColor: session.agentColor,
                action: `Implemented: ${session.recTitle}`,
                project: store.projects.find(p => p.slug === session.projectSlug)?.name,
                timestamp: new Date().toISOString(),
              };
              store.addActivity(activity);
              store.appendActivityToDisk(activity);
            }
            playSound('complete');
          } else {
            playSound('failed');
          }
        }
      });

      listenersRef.current = { removeData, removeExit };
    }

    // ResizeObserver on wrapper — fit the active terminal
    resizeObserver = new ResizeObserver(() => {
      const targetId = activeTabRef.current || currentScopeRef.current;
      if (!targetId) return;
      const entry = terminalsRef.current.get(targetId);
      if (entry) {
        try { entry.fitAddon.fit(); } catch (e) {}
      }
    });

    if (wrapperRef.current) {
      resizeObserver.observe(wrapperRef.current);
    }

    return () => {
      // Cleanup all terminals — kill scope PTYs so they recreate fresh on remount (HMR)
      resizeObserver.disconnect();
      if (listenersRef.current) {
        listenersRef.current.removeData();
        listenersRef.current.removeExit();
        listenersRef.current = null;
      }
      for (const [id, entry] of terminalsRef.current) {
        // Kill scope PTYs (not sessions or system terminals — those have their own lifecycle)
        if (!isSessionId(id) && !isSystemTerminal(id) && window.electronAPI?.terminal?.kill) {
          window.electronAPI.terminal.kill(id);
        }
        try { entry.term.dispose(); } catch (e) {}
        try { entry.containerEl.remove(); } catch (e) {}
      }
      terminalsRef.current.clear();
      spawnedSessionsRef.current.clear();
    };
  }, []);

  // Scope change: show/create the right terminal
  useEffect(() => {
    if (!scope?.id) return;

    const scopeId = scope.id;
    currentScopeRef.current = scopeId;

    // Only activate scope terminal if no session tab is active
    if (isSessionId(activeTabRef.current)) return;

    async function activateScope() {
      let entry = terminalsRef.current.get(scopeId);

      if (!entry) {
        entry = await createScopeTerminal(scopeId, scope.label, scope.repoPath, scope.projectName);
      }

      // Show this scope's container, hide all others
      for (const [id, e] of terminalsRef.current) {
        e.containerEl.style.display = id === scopeId ? '' : 'none';
      }

      // Fit and focus after layout settles
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try { entry.fitAddon.fit(); } catch (e) {}
          entry.term.focus();
        });
      });
    }

    activateScope();
  }, [scope?.id, scope?.label, scope?.repoPath, scope?.projectName, createScopeTerminal, isSessionId]);

  // Spawn terminals for new implementation sessions
  useEffect(() => {
    for (const session of implementationSessions) {
      if (session.status === 'running' && !spawnedSessionsRef.current.has(session.id)) {
        spawnImplementationTerminal(session);
      }
    }
  }, [implementationSessions, spawnImplementationTerminal]);

  // Mount xterm instances for persistent Claude CLI sessions.
  // Only active tabs have a live PTY; dormant tabs get a UI but no streaming input.
  // Also dispose xterm UIs when a tab disappears from the registry.
  useEffect(() => {
    const liveScopeIds = new Set(claudeSessions.map(t => t.scopeId).filter(Boolean));

    for (const tab of claudeSessions) {
      if (!tab.scopeId) continue;
      if (tab.status === 'active' && !spawnedSessionsRef.current.has(tab.scopeId)) {
        spawnClaudeSessionTerminal(tab);
      }
    }

    // Dispose xterm instances for claude session scopeIds that were removed
    for (const id of Array.from(terminalsRef.current.keys())) {
      if (!id.startsWith('session-')) continue;
      if (liveScopeIds.has(id)) continue;
      const entry = terminalsRef.current.get(id);
      try { entry.term.dispose(); } catch (e) {}
      try { entry.containerEl.remove(); } catch (e) {}
      terminalsRef.current.delete(id);
      spawnedSessionsRef.current.delete(id);
      if (activeTabRef.current === id) {
        activeTabRef.current = null;
        setActiveTabId(null);
      }
    }
  }, [claudeSessions, spawnClaudeSessionTerminal]);

  // Auto-create system terminals (SRV group: friday-server + forge-logs)
  useEffect(() => {
    let cancelled = false;

    async function initSystemTerminals() {
      // Friday Server tab — full interactive PTY (data comes from main process via friday:start-server)
      // createTerminalInstance() only creates the xterm.js UI, does NOT call terminal:create IPC
      if (!terminalsRef.current.has('friday-server')) {
        const entry = await createTerminalInstance('friday-server');
        if (cancelled) return;
        const { term } = entry;

        if (window.electronAPI?.terminal) {
          term.onData((data) => {
            window.electronAPI.terminal.input('friday-server', data);
          });
          term.onResize(({ cols, rows }) => {
            window.electronAPI.terminal.resize('friday-server', cols, rows);
          });
        }

        entry.containerEl.style.display = 'none';
      }

      // Vite Server tab — display of Vite PTY output from main process
      if (!terminalsRef.current.has('vite-server')) {
        const entry = await createTerminalInstance('vite-server');
        if (cancelled) return;
        const { term } = entry;

        if (window.electronAPI?.terminal) {
          term.onData((data) => {
            window.electronAPI.terminal.input('vite-server', data);
          });
          term.onResize(({ cols, rows }) => {
            window.electronAPI.terminal.resize('vite-server', cols, rows);
          });
        }

        entry.containerEl.style.display = 'none';
      }

      // Forge Logs tab — read-only virtual terminal (no PTY backing)
      if (!terminalsRef.current.has('forge-logs')) {
        const entry = await createVirtualTerminal('forge-logs');
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

        entry.containerEl.style.display = 'none';
      }
    }

    initSystemTerminals();
    return () => { cancelled = true; };
  }, [createTerminalInstance, createVirtualTerminal]);

  const handleTerminalClick = () => {
    const targetId = activeTabRef.current || currentScopeRef.current;
    if (!targetId) return;
    const entry = terminalsRef.current.get(targetId);
    if (entry) entry.term.focus();
  };

  // Refresh/redraw the active terminal — fixes display glitches
  const handleRefresh = useCallback(() => {
    const targetId = activeTabRef.current || currentScopeRef.current;
    if (!targetId) return;
    const entry = terminalsRef.current.get(targetId);
    if (entry) {
      try {
        entry.term.clearTextureAtlas?.();
        entry.term.refresh(0, entry.term.rows - 1);
        entry.fitAddon.fit();
        entry.term.focus();
      } catch (e) { /* ignore */ }
    }
  }, []);

  // Drag-and-drop: insert file paths into the active terminal
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if leaving the wrapper entirely (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const targetId = activeTabRef.current || currentScopeRef.current;
    if (!targetId) return;

    // Build space-separated file paths, quoting any with spaces
    const paths = files.map(f => {
      const p = f.path; // Electron exposes full path on File objects
      return p.includes(' ') ? `"${p}"` : p;
    }).join(' ');

    if (window.electronAPI?.terminal) {
      window.electronAPI.terminal.input(targetId, paths);
    }

    // Focus the terminal
    const entry = terminalsRef.current.get(targetId);
    if (entry) entry.term.focus();

    playSound('copy');
  }, []);

  return (
    <div className="h-full flex flex-col bg-forge-bg" onClick={handleTerminalClick}>
      {/* Tab bar — replaces static header */}
      <TerminalTabBar
        scope={scope}
        activeTabId={activeTabId}
        onTabSelect={handleTabSelect}
        onTabClose={handleTabClose}
        onRefresh={handleRefresh}
      />
      {/* Terminal wrapper — holds all scope containers */}
      <div
        ref={wrapperRef}
        className="flex-1 relative overflow-hidden"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drop overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center"
               style={{ backgroundColor: 'rgba(197, 38, 56, 0.08)', border: '2px dashed #C52638', borderRadius: '8px' }}>
            <div className="px-4 py-2 rounded-lg text-sm font-medium"
                 style={{ backgroundColor: 'rgba(24, 24, 28, 0.95)', color: '#C52638' }}>
              Drop to paste file path
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Dev mode initialization — scope-aware banners and prompt
function initDevMode(term, scopeId, repoPath, projectName) {
  const agents = SCOPE_AGENTS[scopeId] || SCOPE_AGENTS.studio;

  term.writeln('');

  if (scopeId === 'studio') {
    term.writeln('  \x1b[1;35m\u2728 The Forge \x1b[0m\x1b[90m\u2014 Agent Terminal\x1b[0m');
    term.writeln('  \x1b[90m\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\x1b[0m');
    term.writeln('  \x1b[33m\u26A0  Browser dev mode\x1b[0m \x1b[90m\u2014 run \x1b[36mrun-electron.bat\x1b[90m for full terminal\x1b[0m');
    term.writeln('');
    term.writeln('  \x1b[1;37mExample commands for Claude Code:\x1b[0m');
  } else {
    term.writeln(`  \x1b[1;35m\u2728 ${projectName || scopeId} \x1b[0m\x1b[90m\u2014 Project Terminal\x1b[0m`);
    term.writeln('  \x1b[90m\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\x1b[0m');
    term.writeln('  \x1b[33m\u26A0  Browser dev mode\x1b[0m');
    if (repoPath) {
      term.writeln(`  \x1b[90mRepo: \x1b[36m${repoPath}\x1b[0m`);
    }
    term.writeln('');
    term.writeln(`  \x1b[1;37mAgents scoped to ${projectName || scopeId}:\x1b[0m`);
  }

  for (const agent of agents) {
    const padded = agent.cmd.padEnd(17);
    term.writeln(`  \x1b[${agent.color}m${padded}\x1b[0m \x1b[90m${agent.desc}\x1b[0m`);
  }
  term.writeln('');

  // Simple local echo prompt
  let inputBuffer = '';
  const promptLabel = scopeId === 'studio' ? 'coe' : scopeId;
  const PROMPT = `\x1b[35m${promptLabel}\x1b[0m \x1b[90m>\x1b[0m `;
  term.write(PROMPT);

  term.onData((data) => {
    if (data === '\r') {
      term.writeln('');
      const cmd = inputBuffer.trim();
      if (cmd) {
        if (cmd === 'help') {
          term.writeln('  \x1b[1;37mThe Forge \u2014 Browser Dev Mode\x1b[0m');
          term.writeln('  \x1b[90mThis terminal is interactive in Electron mode.\x1b[0m');
          term.writeln('  \x1b[90mRun \x1b[36mrun-electron.bat\x1b[90m to launch the full app.\x1b[0m');
          term.writeln('');
        } else if (cmd.startsWith('@')) {
          const agent = cmd.split(' ')[0];
          term.writeln(`  \x1b[33m\u26A0 ${agent} is available in Electron mode.\x1b[0m`);
          term.writeln('  \x1b[90mRun \x1b[36mrun-electron.bat\x1b[90m, then type \x1b[36mclaude\x1b[90m in the terminal.\x1b[0m');
        } else if (cmd === 'clear') {
          term.clear();
        } else {
          term.writeln('  \x1b[90mBrowser mode \u2014 type \x1b[37mhelp\x1b[90m for info\x1b[0m');
        }
      }
      inputBuffer = '';
      term.write(PROMPT);
    } else if (data === '\x7f' || data === '\b') {
      if (inputBuffer.length > 0) {
        inputBuffer = inputBuffer.slice(0, -1);
        term.write('\b \b');
      }
    } else if (data >= ' ') {
      inputBuffer += data;
      term.write(data);
    }
  });
}
