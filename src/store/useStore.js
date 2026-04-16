import { create } from 'zustand';
import { SAMPLE_RECOMMENDATIONS, SAMPLE_ACTIVITY } from './sampleData';
import { recRelativePath } from '../utils/slugify';
import { playSound } from '../utils/sounds';
import { RECOMMENDED_BRAINS } from '../utils/brainConfig';
import { processFileEvent } from '../utils/fridayNarration';
import { queueAudioChunk as _queueAudioChunk } from '../utils/fridayAudio';

const PHASES = [
  { id: 'discovery', name: 'Discovery', color: '#8B5CF6' },
  { id: 'design', name: 'Design', color: '#06B6D4' },
  { id: 'build', name: 'Build', color: '#3B82F6' },
  { id: 'test', name: 'Test', color: '#EAB308' },
  { id: 'deploy', name: 'Deploy', color: '#F97316' },
  { id: 'maintain', name: 'Maintain', color: '#22C55E' },
];

const AGENTS = [
  { id: 'solutions-architect', name: 'Solutions Architect', color: '#0EA5E9', icon: 'circuit', role: 'System design, API design, data modeling, tech stack' },
  { id: 'backend-engineer', name: 'Backend Engineer', color: '#3B82F6', icon: 'server', role: 'API implementation, database design, business logic' },
  { id: 'frontend-engineer', name: 'Frontend Engineer', color: '#F59E0B', icon: 'layout', role: 'UI/UX implementation, components, responsive layouts' },
  { id: 'devops-engineer', name: 'DevOps Engineer', color: '#06B6D4', icon: 'cloud', role: 'CI/CD, Docker, cloud infra, deployment pipelines' },
  { id: 'data-engineer', name: 'Data Engineer', color: '#7C3AED', icon: 'database', role: 'Schema design, query optimization, migrations, ETL' },
  { id: 'security-auditor', name: 'Security Auditor', color: '#EF4444', icon: 'shield', role: 'OWASP, auth flows, secrets management, compliance' },
  { id: 'qa-lead', name: 'QA Lead', color: '#DC2626', icon: 'checkmark', role: 'Test strategy, E2E testing, regression, load testing' },
  { id: 'product-owner', name: 'Product Owner', color: '#EAB308', icon: 'crown', role: 'Requirements, user stories, sprint planning, prioritization' },
  { id: 'ux-researcher', name: 'UX Researcher', color: '#8B5CF6', icon: 'users', role: 'User flows, wireframes, accessibility, usability' },
  { id: 'api-designer', name: 'API Designer', color: '#22C55E', icon: 'plug', role: 'REST/GraphQL design, OpenAPI specs, versioning' },
  { id: 'performance-engineer', name: 'Performance Engineer', color: '#F97316', icon: 'gauge', role: 'Profiling, caching, CDN, database tuning' },
  { id: 'technical-writer', name: 'Technical Writer', color: '#EC4899', icon: 'document', role: 'API docs, runbooks, architecture decision records' },
  { id: 'project-manager', name: 'Project Manager', color: '#3B82F6', icon: 'timeline', role: 'Timeline, dependencies, risk management, reporting' },
  { id: 'code-reviewer', name: 'Code Reviewer', color: '#D4A574', icon: 'magnifier', role: 'PR reviews, code quality, conventions, tech debt' },
  { id: 'ai-integration-analyst', name: 'AI Integration Analyst', color: '#A855F7', icon: 'brain', role: 'PRD analysis, AI/LLM opportunity identification, agentic workflow design' },
];

const DEFAULT_PROJECTS = [];

// Load persisted agent avatars from localStorage
const loadPersistedAvatars = () => {
  try {
    const stored = localStorage.getItem('forge-agent-avatars');
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
};

// Load persisted agent aliases from localStorage
const loadPersistedAliases = () => {
  try {
    const stored = localStorage.getItem('forge-agent-aliases');
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
};

// Generic persisted data loader
const loadPersistedData = (key, fallback) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch { return fallback; }
};

function backfillRec(rec) {
  const patched = { ...rec };
  // Backfill implementable. Default is true — any rec can be planned/auto-implemented
  // unless it's a weekly plan or the author explicitly set implementable: false.
  // For non-code authors (Product Owner, Technical Writer, etc.), set implementingAgent
  // on the rec to route the work to the correct engineering agent.
  if (patched.implementable === undefined) {
    patched.implementable = patched.type !== 'weekly-plan';
  }
  // Backfill _filePath from title slug if not already set (e.g. sample data)
  if (!patched._filePath && patched.project && patched.title) {
    patched._filePath = recRelativePath(patched);
  }
  return patched;
}

export const useStore = create((set, get) => ({
  // Data
  phases: PHASES,
  agents: AGENTS,
  projects: DEFAULT_PROJECTS,
  recommendations: !window.electronAPI ? SAMPLE_RECOMMENDATIONS.map(backfillRec) : [],
  activityLog: !window.electronAPI ? SAMPLE_ACTIVITY : [],
  activeProject: null,
  activeAgent: null,
  agentAvatars: loadPersistedAvatars(),
  agentAliases: loadPersistedAliases(),
  agentBrains: loadPersistedData('forge-agent-brains', {}),
  showNewProjectModal: false,
  implementationSessions: [],

  // Automation
  automationSchedules: loadPersistedData('forge-schedules', []),
  agentChains: loadPersistedData('forge-chains', []),
  eventTriggers: loadPersistedData('forge-triggers', []),
  automationExecutionLog: [],

  // Council Chat (legacy — kept for backwards compat during transition)
  councilChatMessages: [],
  councilChatTyping: null,
  councilChatEnabled: loadPersistedData('forge-council-chat-enabled', true),

  // Discord Integration
  discordStatus: { connected: false, guild: null, channel: null, botUser: null },
  discordMessages: [],
  discordChatEnabled: loadPersistedData('forge-discord-chat-enabled', true),

  // ─── Active Persona (read from localStorage on init) ────────────────
  activePersona: (() => {
    const DEFAULT_THEME = { primary: '#D946EF', secondary: '#7E22CE', accent: '#F0ABFC', text: '#E8E0D4' };
    // Preset personas — must match VoiceTab.jsx PRESET_PROFILES for symbol/theme/image
    const PRESETS = {
      'friday-classic': { symbol: null, theme: { primary: '#D946EF', secondary: '#7E22CE', accent: '#F0ABFC', text: '#E8E0D4' }, image: null },
      'commander': { symbol: '★', theme: { primary: '#EF4444', secondary: '#7F1D1D', accent: '#FCA5A5', text: '#FEE2E2' }, image: null },
      'creative-muse': { symbol: '✦', theme: { primary: '#F59E0B', secondary: '#78350F', accent: '#FDE68A', text: '#FEF3C7' }, image: null },
      'baroness': { symbol: 'ō', theme: { primary: '#DC2626', secondary: '#000000', accent: '#FFFFFF', text: '#FFFFFF' }, image: 'assets/Baroness.png', wakeWords: ['baroness', 'hey baroness'] },
    };
    try {
      const profiles = JSON.parse(localStorage.getItem('forge-friday-voice-profiles') || '[]');
      const activeId = localStorage.getItem('forge-friday-voice-active-profile') || 'friday-classic';
      const active = profiles.find(p => p.id === activeId);
      // Merge preset fields (symbol, theme, image) so they're always current
      const preset = PRESETS[activeId];
      return {
        name: active?.name || 'F.R.I.D.A.Y.',
        shortName: active?.name?.split(' ')[0] || 'Friday',
        color: active?.color || '#D946EF',
        icon: active?.icon || '💎',
        image: preset?.image ?? active?.image ?? null,
        theme: preset?.theme ?? active?.theme ?? DEFAULT_THEME,
        symbol: preset?.symbol ?? active?.symbol ?? null,
        wakeWords: preset?.wakeWords ?? active?.wakeWords ?? [],
      };
    } catch { return { name: 'F.R.I.D.A.Y.', shortName: 'Friday', color: '#D946EF', icon: '💎', image: null, theme: DEFAULT_THEME, symbol: null }; }
  })(),
  setActivePersona: (persona) => set({ activePersona: persona }),

  // ─── Friday State ───────────────────────────────────────────────────
  fridayEnabled: loadPersistedData('forge-friday-enabled', false),
  fridayStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  portHealth: { health: [], collisions: [] },
  fridayProcessStatus: 'stopped', // 'stopped' | 'starting' | 'running' | 'crashed'
  fridayServerUrl: loadPersistedData('forge-friday-url', 'ws://localhost:3100/ws'),
  fridayMessages: [], // {id, role, content, timestamp, type}
  fridayVoiceState: 'idle', // 'idle' | 'listening' | 'thinking' | 'speaking'
  fridayMuted: false,
  fridayPendingCommands: [], // {commandId, command, args, confirmRequired}
  fridaySettings: loadPersistedData('forge-friday-settings', {
    morningBriefing: true,
    ambientNarration: true,
    narrationVerbosity: 'medium',
    voice: 'Eve',
    confirmLevel: 'all',
  }),

  // Idea Board
  ideas: [],
  ideaGenerationStatus: 'idle', // 'idle' | 'generating' | 'done-today'
  lastIdeaGeneration: null,

  // Metering
  meteringData: null,
  meteringLoading: false,

  // Knowledge refresh status
  knowledgeRefreshStatus: 'idle', // 'idle' | 'refreshing' | 'recently-updated' | 'stale'
  knowledgeLastRefreshed: null,

  // Actions
  setActiveProject: (slug) => set({ activeProject: slug, activeAgent: null }),
  setActiveAgent: (id) => set({ activeAgent: id }),
  setAgentAvatar: (agentId, dataUrl) => {
    set((state) => {
      const updated = { ...state.agentAvatars, [agentId]: dataUrl };
      try { localStorage.setItem('forge-agent-avatars', JSON.stringify(updated)); } catch {}
      return { agentAvatars: updated };
    });
  },
  setAgentAliases: (agentId, aliases) => {
    set((state) => {
      const updated = { ...state.agentAliases, [agentId]: aliases };
      try { localStorage.setItem('forge-agent-aliases', JSON.stringify(updated)); } catch {}

      // Sync aliases to CLAUDE.md so they work in CLI
      if (window.electronAPI?.aliases) {
        const agents = get().agents;
        const rows = [];
        for (const [aid, aliasList] of Object.entries(updated)) {
          const agent = agents.find(a => a.id === aid);
          if (!agent || !aliasList?.length) continue;
          for (const alias of aliasList) {
            rows.push({
              alias,
              agentName: agent.name,
              skillFile: `Forge/agents/${aid}.md`,
            });
          }
        }
        window.electronAPI.aliases.sync(rows);
      }

      return { agentAliases: updated };
    });
  },
  setAgentBrain: (agentId, brain) => {
    set(state => {
      const updated = { ...state.agentBrains, [agentId]: brain };
      try { localStorage.setItem('forge-agent-brains', JSON.stringify(updated)); } catch {}
      if (window.electronAPI?.hq) {
        window.electronAPI.hq.writeFile('agent-brains.json', JSON.stringify(updated, null, 2));
      }
      return { agentBrains: updated };
    });
  },
  applyRecommendedBrains: () => {
    const updated = {};
    for (const [id, rec] of Object.entries(RECOMMENDED_BRAINS)) {
      updated[id] = { provider: 'claude', model: rec.model };
    }
    set({ agentBrains: updated });
    try { localStorage.setItem('forge-agent-brains', JSON.stringify(updated)); } catch {}
    if (window.electronAPI?.hq) {
      window.electronAPI.hq.writeFile('agent-brains.json', JSON.stringify(updated, null, 2));
    }
  },
  setActiveView: (view) => set({ activeView: view }),
  setShowNewProjectModal: (show) => set({ showNewProjectModal: show }),

  // Knowledge refresh
  setKnowledgeRefreshStatus: (status, timestamp) => set({
    knowledgeRefreshStatus: status,
    ...(timestamp ? { knowledgeLastRefreshed: timestamp } : {}),
  }),

  // Council Chat actions
  setCouncilChatTyping: (agentId) => set({ councilChatTyping: agentId }),
  setCouncilChatEnabled: (enabled) => {
    set({ councilChatEnabled: enabled });
    try { localStorage.setItem('forge-council-chat-enabled', JSON.stringify(enabled)); } catch {}
  },
  addChatMessage: (msg) => {
    set(state => ({
      councilChatMessages: [...state.councilChatMessages, msg],
    }));
    playSound('chat-message');
    // Persist to daily file
    if (window.electronAPI?.hq) {
      const dateStr = new Date().toISOString().slice(0, 10);
      const filePath = `council-chat/messages/${dateStr}.json`;
      window.electronAPI.hq.readFile(filePath).then(result => {
        let messages = [];
        if (result.ok) {
          try { messages = JSON.parse(result.data); } catch {}
        }
        messages.push(msg);
        window.electronAPI.hq.writeFile(filePath, JSON.stringify(messages, null, 2));
      });
    }
  },
  loadChatMessages: async () => {
    if (!window.electronAPI?.hq) return;
    const dateStr = new Date().toISOString().slice(0, 10);
    const filePath = `council-chat/messages/${dateStr}.json`;
    try {
      const result = await window.electronAPI.hq.readFile(filePath);
      if (result.ok) {
        set({ councilChatMessages: JSON.parse(result.data) });
      }
    } catch {}
  },

  // Discord actions
  setDiscordStatus: (status) => set({ discordStatus: status }),
  setDiscordMessages: (msgs) => set({ discordMessages: msgs }),
  addDiscordMessage: (msg) => {
    set(state => {
      // Deduplicate by message id
      if (state.discordMessages.find(m => m.id === msg.id)) return {};
      return { discordMessages: [...state.discordMessages, msg] };
    });
  },
  setDiscordChatEnabled: (enabled) => {
    set({ discordChatEnabled: enabled });
    try { localStorage.setItem('forge-discord-chat-enabled', JSON.stringify(enabled)); } catch {}
  },

  // ─── Friday Actions ─────────────────────────────────────────────────
  setFridayEnabled: async (enabled) => {
    set({ fridayEnabled: enabled });
    try { localStorage.setItem('forge-friday-enabled', JSON.stringify(enabled)); } catch {}

    if (enabled) {
      // Start the server — main process auto-connects when it detects server is ready
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

  setFridayStatus: (status) => set({ fridayStatus: status }),
  setFridayProcessStatus: (status) => set({ fridayProcessStatus: status }),
  setFridayVoiceState: (state) => set({ fridayVoiceState: state }),
  setFridayMuted: (muted) => set({ fridayMuted: muted }),

  setFridayServerUrl: (url) => {
    set({ fridayServerUrl: url });
    try { localStorage.setItem('forge-friday-url', JSON.stringify(url)); } catch {}
  },

  addFridayMessage: (msg) => {
    set(state => ({
      fridayMessages: [...state.fridayMessages, {
        id: `fri-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        ...msg,
      }].slice(-200),
    }));
  },

  clearFridayMessages: () => set({ fridayMessages: [] }),

  addFridayPendingCommand: (cmd) => {
    set(state => ({
      fridayPendingCommands: [...state.fridayPendingCommands, cmd],
    }));
  },

  removeFridayPendingCommand: (commandId) => {
    set(state => ({
      fridayPendingCommands: state.fridayPendingCommands.filter(c => c.commandId !== commandId),
    }));
  },

  updateFridaySettings: (updates) => {
    set(state => {
      const updated = { ...state.fridaySettings, ...updates };
      try { localStorage.setItem('forge-friday-settings', JSON.stringify(updated)); } catch {}
      return { fridaySettings: updated };
    });
  },

  connectFriday: async () => {
    const { fridayServerUrl } = get();
    if (!window.electronAPI?.friday) return;
    await window.electronAPI.friday.connect(fridayServerUrl);
  },

  disconnectFriday: async () => {
    if (!window.electronAPI?.friday) return;
    await window.electronAPI.friday.disconnect();
  },

  sendFridayMessage: (content) => {
    if (!window.electronAPI?.friday) return;
    get().addFridayMessage({ role: 'user', content, type: 'text' });
    window.electronAPI.friday.send({ type: 'chat', id: crypto.randomUUID(), content });
  },

  _fridayListenersActive: false,
  setupFridayListeners: () => {
    if (!window.electronAPI?.friday) return () => {};
    // Guard: only set up listeners once
    if (get()._fridayListenersActive) {
      console.log('[Friday Store] Listeners already active — skipping duplicate setup');
      return () => {};
    }
    set({ _fridayListenersActive: true });
    console.log('[Friday Store] Setting up IPC listeners');

    let hasConnectedOnce = false;

    const unsubStatus = window.electronAPI.friday.onStatus((status) => {
      const prev = get().fridayStatus;
      if (prev !== status) {
        console.log(`[Friday Store] Status: ${prev} → ${status}`);
      }
      get().setFridayStatus(status);
      if (status === 'connected' && prev !== 'connected') {
        get().addFridayMessage({ role: 'system', content: 'Connected to Friday', type: 'status' });
        // Quick greeting on first connect — no heavy inference
        if (!hasConnectedOnce) {
          hasConnectedOnce = true;
          get().addFridayMessage({
            role: 'assistant',
            content: "I'm here and ready to assist you, Boss.",
            type: 'text',
          });
        }
      }
    });

    // Friday server process status (PTY lifecycle)
    const unsubProcessStatus = window.electronAPI.friday.onProcessStatus?.((status) => {
      console.log(`[Friday Store] Process status: ${get().fridayProcessStatus} → ${status}`);
      get().setFridayProcessStatus(status);
    }) || (() => {});

    const unsubMessage = window.electronAPI.friday.onMessage((msg) => {
      switch (msg.type) {
        case 'chat:chunk':
        case 'chat:delta':
          set(state => {
            const msgs = [...state.fridayMessages];
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.done) {
              lastMsg.content += (msg.content || msg.text || '');
              if (msg.done) lastMsg.done = true;
            } else {
              msgs.push({
                id: `fri-${Date.now()}`,
                role: 'assistant',
                content: msg.content || msg.text || '',
                timestamp: new Date().toISOString(),
                type: 'text',
                done: msg.done || false,
              });
            }
            return { fridayMessages: msgs.slice(-200) };
          });
          break;
        case 'chat:response':
          // Finalize streaming message or add as complete message if no chunks preceded
          set(state => {
            const msgs = [...state.fridayMessages];
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.done) {
              // Streaming chunks already built this message — just mark done
              // Replace content with the authoritative full text from server
              lastMsg.content = msg.content || msg.text || lastMsg.content;
              lastMsg.done = true;
            } else {
              // No preceding chunks (non-streaming response) — add as new message
              msgs.push({
                id: `fri-${Date.now()}`,
                role: 'assistant',
                content: msg.content || msg.text || '',
                timestamp: new Date().toISOString(),
                type: 'text',
                done: true,
              });
            }
            return { fridayMessages: msgs.slice(-200) };
          });
          break;
        case 'forge:command':
          get().addFridayPendingCommand({
            commandId: msg.commandId || `cmd-${Date.now()}`,
            command: msg.command,
            args: msg.args,
            confirmRequired: msg.confirmRequired,
          });
          get().addFridayMessage({
            role: 'assistant',
            content: `Requesting: ${msg.command} — ${JSON.stringify(msg.args)}`,
            type: 'command-request',
            commandId: msg.commandId,
          });
          break;
        case 'voice:transcript':
          // Emit event for wake word detection
          window.dispatchEvent(new CustomEvent('forge:friday-voice-transcript', {
            detail: { type: 'voice:transcript', role: msg.role, delta: msg.delta, done: msg.done },
          }));
          // Show STT transcripts in the Friday conversation
          set(state => {
            const msgs = [...state.fridayMessages];
            if (msg.role === 'user') {
              if (msg.done) {
                // Final user transcript — add as user message
                msgs.push({
                  id: `fri-stt-${Date.now()}`,
                  role: 'user',
                  content: msg.delta || '',
                  timestamp: new Date().toISOString(),
                  type: 'voice',
                  done: true,
                });
              }
            } else if (msg.role === 'assistant') {
              // Assistant voice transcript — accumulate like chat:chunk
              const lastMsg = msgs[msgs.length - 1];
              if (lastMsg && lastMsg.role === 'assistant' && lastMsg.type === 'voice' && !lastMsg.done) {
                lastMsg.content += (msg.delta || '');
                if (msg.done) lastMsg.done = true;
              } else if (msg.delta) {
                msgs.push({
                  id: `fri-voice-${Date.now()}`,
                  role: 'assistant',
                  content: msg.delta || '',
                  timestamp: new Date().toISOString(),
                  type: 'voice',
                  done: msg.done || false,
                });
              }
            }
            return { fridayMessages: msgs.slice(-200) };
          });
          break;
        case 'voice:started':
          console.log('[Friday Store] Voice session started');
          break;
        case 'voice:stopped':
          console.log('[Friday Store] Voice session stopped');
          break;
        case 'voice:error':
          console.log('[Friday Store] Voice error:', msg.code, msg.message);
          get().addFridayMessage({
            role: 'system',
            content: `Voice error: ${msg.message || msg.code}`,
            type: 'error',
          });
          break;
        case 'session:ready':
          console.log('[Friday Store] Session ready:', msg);
          break;
        default:
          if (msg.type === 'error') {
            console.error('[Friday Store] ERROR from Friday:', msg.code, msg.message, msg);
          } else {
            console.log('[Friday Store] Unhandled message type:', msg.type);
          }
      }
    });

    const unsubCommandConfirm = window.electronAPI?.friday?.onCommandConfirm?.((data) => {
      get().addFridayPendingCommand(data);
    });

    const unsubTaskUpdate = window.electronAPI?.friday?.onTaskUpdate?.((data) => {
      // Tool-blocked: show as a warning, don't duplicate in-progress/completed
      if (data.status === 'tool-blocked') {
        get().addFridayMessage({
          role: 'system',
          content: `⚠ Agent ${data.agent} tried to use a blocked tool (read-only mode). Review the session for details.`,
          type: 'task-update',
          scopeId: data.scopeId || null,
          agent: data.agent,
          project: data.project,
          taskStatus: 'tool-blocked',
        });
        return;
      }
      get().addFridayMessage({
        role: 'system',
        content: data.status === 'completed'
          ? `Agent ${data.agent} on ${data.project}: done${data.exitCode === 0 ? '' : ` (exit ${data.exitCode})`}`
          : `Agent ${data.agent} on ${data.project}: ${data.status}`,
        type: 'task-update',
        scopeId: data.scopeId || null,
        agent: data.agent,
        project: data.project,
        taskStatus: data.status,
      });

      // Register Friday-dispatched agents as implementation sessions so they get terminal tabs
      if (data.status === 'in-progress' && data.scopeId) {
        const agents = get().agents;
        const agentSlug = data.agent;
        const agent = agents.find(a => a.id === agentSlug) || { name: agentSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), color: '#D946EF' };
        const projects = get().projects;
        const project = projects.find(p => p.slug === data.project) || { name: data.project, slug: data.project };

        const session = {
          id: data.scopeId,
          type: 'friday-dispatch',
          agentId: agentSlug,
          agentName: agent.name || agentSlug,
          agentColor: agent.color || '#D946EF',
          projectSlug: data.project,
          repoPath: window.forgePaths?.forgeRoot || '',
          mode: 'plan',
          status: 'running',
          exitCode: null,
          startedAt: new Date().toISOString(),
          finishedAt: null,
          label: `${agent.name || agentSlug} × ${project.name || data.project}`,
        };
        console.log('[Friday Store] Registering dispatch as terminal session:', session.id, session.label);
        set(state => ({ implementationSessions: [...state.implementationSessions, session] }));
      }

      // Update status on completion
      if ((data.status === 'completed' || data.status === 'failed') && data.scopeId) {
        set(state => ({
          implementationSessions: state.implementationSessions.map(s =>
            s.id === data.scopeId ? { ...s, status: data.status === 'completed' ? 'done' : 'failed', exitCode: data.exitCode, finishedAt: new Date().toISOString() } : s
          ),
        }));
      }
    });

    // Wire narration: file changes → Friday ambient events
    const unsubFileChange = window.electronAPI?.hq?.onFileChanged?.(({ event: action, path: filePath }) => {
      if (get().fridayEnabled && get().fridayStatus === 'connected') {
        processFileEvent(filePath, action, (coeEvent) => {
          window.electronAPI.friday.sendEvent(coeEvent);
        });
      }
    });

    // Persistent audio playback — survives tab navigation (FridayPanel unmount)
    const unsubAudioIn = window.electronAPI.friday.onAudioIn?.((pcmData) => {
      if (!get().fridayMuted) _queueAudioChunk(pcmData);
      get().setFridayVoiceState('speaking');
    });

    // Persistent voice state tracking
    const unsubVoiceState = window.electronAPI.friday.onVoiceState?.((state) => {
      get().setFridayVoiceState(state);
    });

    return () => {
      set({ _fridayListenersActive: false });
      unsubStatus();
      unsubProcessStatus();
      unsubMessage();
      if (unsubCommandConfirm) unsubCommandConfirm();
      if (unsubTaskUpdate) unsubTaskUpdate();
      if (unsubFileChange) unsubFileChange();
      if (unsubAudioIn) unsubAudioIn();
      if (unsubVoiceState) unsubVoiceState();
    };
  },

  // Idea Board actions
  loadIdeas: async () => {
    if (!window.electronAPI?.hq) return;
    try {
      const projectsDir = await window.electronAPI.hq.readDir('projects');
      if (!projectsDir.ok) return;
      const allIdeas = [];
      for (const entry of projectsDir.data) {
        if (!entry.isDirectory) continue;
        const ideasDir = await window.electronAPI.hq.readDir(`projects/${entry.name}/ideas`);
        if (!ideasDir.ok) continue;
        for (const file of ideasDir.data) {
          if (!file.name.endsWith('.json')) continue;
          const filePath = `projects/${entry.name}/ideas/${file.name}`;
          const data = await window.electronAPI.hq.readFile(filePath);
          if (data.ok) {
            try {
              const idea = JSON.parse(data.data);
              idea._filePath = filePath;
              allIdeas.push(idea);
            } catch {}
          }
        }
      }
      allIdeas.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      set({ ideas: allIdeas });
    } catch (err) {
      console.warn('Could not load ideas:', err);
    }
  },
  addIdea: async (idea) => {
    set(state => ({ ideas: [idea, ...state.ideas] }));
    if (window.electronAPI?.hq) {
      const slug = idea.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const dateStr = new Date().toISOString().slice(0, 10);
      const source = idea.source || 'boss';
      const filePath = `projects/${idea.project}/ideas/${dateStr}-${source}-${slug}.json`;
      idea._filePath = filePath;
      await window.electronAPI.hq.writeFile(filePath, JSON.stringify(idea, null, 2));
    }
  },
  updateIdea: async (ideaId, updates) => {
    set(state => ({
      ideas: state.ideas.map(i => i.id === ideaId ? { ...i, ...updates } : i),
    }));
    // Write back to disk
    const idea = get().ideas.find(i => i.id === ideaId);
    if (idea?._filePath && window.electronAPI?.hq) {
      await window.electronAPI.hq.writeFile(idea._filePath, JSON.stringify(idea, null, 2));
    }
  },
  dismissIdea: async (ideaId) => {
    get().updateIdea(ideaId, { status: 'dismissed' });
  },

  // Agent CLI sessions
  // extras: optional { prompt, flags, cwd, modelFlag } for idea analysis or custom prompts
  startAgentSession: (agent, project, extras = {}) => {
    const session = {
      id: `agent-${Date.now()}-${agent.id}`,
      type: 'agent-session',
      agentId: agent.id,
      agentName: agent.name,
      agentColor: agent.color,
      projectSlug: project.slug,
      repoPath: project.repoPath || window.forgePaths?.forgeRoot || '',
      mode: extras.mode || 'plan',
      status: 'running',
      exitCode: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      label: `${agent.name} \u00D7 ${project.name}`,
      ...extras,
    };
    set(state => ({ implementationSessions: [...state.implementationSessions, session] }));
    // Notify UI for agent dispatch video popup
    window.dispatchEvent(new CustomEvent('forge:agent-dispatched', { detail: { agent: agent.name } }));
    return session;
  },

  // Implementation sessions
  startImplementation: (rec, project, mode, approachId) => {
    const existing = get().implementationSessions.find(
      s => s.recTimestamp === rec.timestamp && s.recTitle === rec.title && s.status === 'running'
    );
    if (existing) return existing;

    const selectedApproachId = approachId ?? rec.recommended;
    const approach = rec.approaches?.find(a => a.id === selectedApproachId);
    const session = {
      id: `impl-${Date.now()}`,
      recTimestamp: rec.timestamp,
      recTitle: rec.title,
      projectSlug: project.slug,
      repoPath: project.repoPath,
      agentColor: rec.agentColor,
      agentName: rec.agent,
      approachId: selectedApproachId,
      mode,
      status: 'running',
      exitCode: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      label: approach ? `${rec.title.slice(0, 30)} \u2014 ${approach.name.slice(0, 20)}` : rec.title.slice(0, 40),
    };
    set(state => ({ implementationSessions: [...state.implementationSessions, session] }));
    return session;
  },

  // Start an automation-spawned agent task (schedule, chain, or trigger)
  startAutomationTask: (agentId, agentName, project, action) => {
    const agents = get().agents;
    const agent = agents.find(a => a.id === agentId) || { color: '#666' };
    const projectObj = typeof project === 'string'
      ? get().projects.find(p => p.slug === project)
      : project;

    if (!projectObj) {
      console.warn(`[Automation] No project found for:`, project);
      return null;
    }

    const session = {
      id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'automation',
      agentId,
      agentName: agentName || agent.name,
      agentColor: agent.color,
      projectSlug: projectObj.slug,
      repoPath: projectObj.repoPath || window.forgePaths?.forgeRoot || '',
      action,
      mode: 'auto',
      status: 'running',
      exitCode: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      label: `${agentName || agent.name}: ${action.slice(0, 40)}`,
    };

    set(state => ({ implementationSessions: [...state.implementationSessions, session] }));
    return session;
  },

  // Emit an automation event — matches chains and triggers, spawns tasks with stagger
  emitAutomationEvent: (eventType, payload = {}) => {
    const state = get();
    const { agentChains, eventTriggers } = state;
    const tasksToSpawn = [];

    // Match chains
    if (['rec-created', 'rec-resolved', 'rec-implemented'].includes(eventType)) {
      for (const chain of agentChains) {
        if (chain.event !== eventType) continue;
        // Source agent match: "any" matches all, otherwise match by ID
        if (chain.sourceAgentId !== 'any' && chain.sourceAgentId !== payload.agentId) continue;

        tasksToSpawn.push({
          agentId: chain.targetAgentId,
          agentName: chain.targetAgentName,
          action: chain.action,
          projectSlug: payload.projectSlug,
          source: 'chain',
          chainId: chain.id,
        });
      }
    }

    // Match triggers
    if (eventType === 'git-push') {
      for (const trigger of eventTriggers) {
        if (trigger.event !== 'git-push') continue;
        // Condition matching
        if (trigger.condition === 'knowledgeWorthy' && !payload.classification?.knowledgeWorthy) continue;
        if (trigger.condition === 'significant' && payload.classification?.significance === 'low') continue;
        // Project matching
        if (trigger.project !== 'all' && trigger.project !== payload.projectSlug) continue;

        tasksToSpawn.push({
          agentId: trigger.agentId,
          agentName: trigger.agentName,
          action: trigger.action,
          projectSlug: payload.projectSlug,
          source: 'trigger',
          triggerId: trigger.id,
        });
      }
    }

    // Spawn with 5s stagger
    tasksToSpawn.forEach((task, i) => {
      setTimeout(() => {
        const project = get().projects.find(p => p.slug === task.projectSlug);
        if (!project) return;

        const session = get().startAutomationTask(task.agentId, task.agentName, project, task.action);
        if (session) {
          get().logAutomationExecution({
            id: Date.now(),
            type: task.source,
            eventType,
            agentId: task.agentId,
            agentName: task.agentName,
            agentColor: get().agents.find(a => a.id === task.agentId)?.color || '#666',
            projectSlug: task.projectSlug,
            action: task.action,
            sessionId: session.id,
            status: 'started',
            timestamp: new Date().toISOString(),
          });

          // Set knowledge refresh status if Market Analyst spawned for knowledge work
          if (task.agentId === 'market-analyst' && eventType === 'git-push') {
            get().setKnowledgeRefreshStatus('refreshing');
          }
        }
      }, i * 5000);
    });
  },

  // Log automation execution
  logAutomationExecution: async (entry) => {
    set(state => ({
      automationExecutionLog: [entry, ...state.automationExecutionLog].slice(0, 200),
    }));

    // Persist to disk
    if (window.electronAPI?.hq) {
      try {
        const logFile = await window.electronAPI.hq.readFile('automation/execution-log.json');
        let log = [];
        if (logFile.ok) {
          try { log = JSON.parse(logFile.data); } catch {}
        }
        log.unshift(entry);
        if (log.length > 200) log = log.slice(0, 200);
        await window.electronAPI.hq.writeFile('automation/execution-log.json', JSON.stringify(log, null, 2));
      } catch (e) {
        console.warn('Could not write automation execution log:', e);
      }
    }
  },

  // Save automation config to hq-data (replaces localStorage persistence)
  saveAutomationConfig: async () => {
    const { automationSchedules, agentChains, eventTriggers } = get();
    // Still keep localStorage as fallback
    try { localStorage.setItem('forge-schedules', JSON.stringify(automationSchedules)); } catch {}
    try { localStorage.setItem('forge-chains', JSON.stringify(agentChains)); } catch {}
    try { localStorage.setItem('forge-triggers', JSON.stringify(eventTriggers)); } catch {}

    if (window.electronAPI?.hq) {
      try {
        await window.electronAPI.hq.writeFile('automation/schedules.json', JSON.stringify(automationSchedules, null, 2));
        await window.electronAPI.hq.writeFile('automation/chains.json', JSON.stringify(agentChains, null, 2));
        await window.electronAPI.hq.writeFile('automation/triggers.json', JSON.stringify(eventTriggers, null, 2));
      } catch (e) {
        console.warn('Could not save automation config to disk:', e);
      }
    }
  },

  // Load automation config from hq-data
  loadAutomationConfig: async () => {
    if (!window.electronAPI?.hq) return;

    try {
      const [schedRes, chainRes, trigRes, logRes] = await Promise.all([
        window.electronAPI.hq.readFile('automation/schedules.json'),
        window.electronAPI.hq.readFile('automation/chains.json'),
        window.electronAPI.hq.readFile('automation/triggers.json'),
        window.electronAPI.hq.readFile('automation/execution-log.json'),
      ]);

      const updates = {};
      if (schedRes.ok) { try { updates.automationSchedules = JSON.parse(schedRes.data); } catch {} }
      if (chainRes.ok) { try { updates.agentChains = JSON.parse(chainRes.data); } catch {} }
      if (trigRes.ok) { try { updates.eventTriggers = JSON.parse(trigRes.data); } catch {} }
      if (logRes.ok) { try { updates.automationExecutionLog = JSON.parse(logRes.data); } catch {} }

      if (Object.keys(updates).length > 0) set(updates);
    } catch (e) {
      console.warn('Could not load automation config:', e);
    }
  },

  // Seed default automation rules if none exist ON DISK.
  // Checks the actual files — not just in-memory state — to avoid overwriting
  // user changes after a restart (race condition with loadAutomationConfig).
  seedDefaultAutomation: async () => {
    if (!window.electronAPI?.hq) return;

    try {
      // Check if saved files already exist on disk — if they do, the user has
      // persisted config and we must NOT overwrite it with defaults.
      const schedRes = await window.electronAPI.hq.readFile('automation/schedules.json');
      if (schedRes.ok) {
        try {
          const existing = JSON.parse(schedRes.data);
          if (Array.isArray(existing) && existing.length > 0) return; // User has saved schedules
        } catch {}
      }

      const defaultsRes = await window.electronAPI.hq.readFile('automation/defaults.json');
      if (!defaultsRes.ok) return;
      const defaults = JSON.parse(defaultsRes.data);

      const updates = {};
      if (defaults.schedules?.length) updates.automationSchedules = defaults.schedules;
      if (defaults.chains?.length) updates.agentChains = defaults.chains;
      if (defaults.triggers?.length) updates.eventTriggers = defaults.triggers;

      if (Object.keys(updates).length > 0) {
        set(updates);
        await get().saveAutomationConfig();
      }
    } catch (e) {
      console.warn('Could not seed default automation:', e);
    }
  },

  updateSessionStatus: (sessionId, status, exitCode) => {
    set(state => ({
      implementationSessions: state.implementationSessions.map(s =>
        s.id === sessionId ? { ...s, status, exitCode, finishedAt: new Date().toISOString() } : s
      ),
    }));
  },

  closeSession: (sessionId) => {
    set(state => ({
      implementationSessions: state.implementationSessions.filter(s => s.id !== sessionId),
    }));
  },

  // Automation actions — persist to hq-data after mutation
  addSchedule: (schedule) => {
    set(state => ({ automationSchedules: [...state.automationSchedules, schedule] }));
    get().saveAutomationConfig();
  },
  removeSchedule: (id) => {
    set(state => ({ automationSchedules: state.automationSchedules.filter(s => s.id !== id) }));
    get().saveAutomationConfig();
  },
  toggleSchedule: (id) => {
    set(state => ({
      automationSchedules: state.automationSchedules.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s),
    }));
    get().saveAutomationConfig();
  },
  updateSchedule: (id, updates) => {
    set(state => ({
      automationSchedules: state.automationSchedules.map(s => s.id === id ? { ...s, ...updates } : s),
    }));
    get().saveAutomationConfig();
  },
  addChain: (chain) => {
    set(state => ({ agentChains: [...state.agentChains, chain] }));
    get().saveAutomationConfig();
  },
  removeChain: (id) => {
    set(state => ({ agentChains: state.agentChains.filter(c => c.id !== id) }));
    get().saveAutomationConfig();
  },
  updateChain: (id, updates) => {
    set(state => ({
      agentChains: state.agentChains.map(c => c.id === id ? { ...c, ...updates } : c),
    }));
    get().saveAutomationConfig();
  },
  addTrigger: (trigger) => {
    set(state => ({ eventTriggers: [...state.eventTriggers, trigger] }));
    get().saveAutomationConfig();
  },
  removeTrigger: (id) => {
    set(state => ({ eventTriggers: state.eventTriggers.filter(t => t.id !== id) }));
    get().saveAutomationConfig();
  },
  updateTrigger: (id, updates) => {
    set(state => ({
      eventTriggers: state.eventTriggers.map(t => t.id === id ? { ...t, ...updates } : t),
    }));
    get().saveAutomationConfig();
  },

  setProjectPhase: (slug, phase) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.slug === slug ? { ...p, phase } : p
      ),
    })),

  addProject: (project) =>
    set((state) => ({
      projects: [...state.projects, project],
    })),

  archiveProject: (slug) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.slug !== slug),
      activeProject: state.activeProject === slug ? null : state.activeProject,
    })),

  addRecommendation: (rec) =>
    set((state) => ({
      recommendations: [rec, ...state.recommendations],
    })),

  setRecommendations: (recs) => set({ recommendations: recs }),

  // Update a recommendation's status (resolved, dismissed, active)
  updateRecommendationStatus: async (rec, newStatus, meta = {}) => {
    const now = new Date().toISOString();
    const extraFields = {};
    if (newStatus === 'resolved') {
      extraFields.resolvedAt = now;
      extraFields.resolvedBy = meta.resolvedBy || 'manual';
    } else if (newStatus === 'dismissed') {
      extraFields.dismissedAt = now;
    } else if (newStatus === 'active') {
      extraFields.resolvedAt = null;
      extraFields.dismissedAt = null;
      extraFields.resolvedBy = null;
    }

    // Update in store
    set((state) => ({
      recommendations: state.recommendations.map((r) =>
        r.timestamp === rec.timestamp && r.title === rec.title
          ? { ...r, status: newStatus, ...extraFields }
          : r
      ),
    }));

    // Write back to disk if in Electron
    if (window.electronAPI?.hq) {
      const project = rec.project;
      if (!project) return;
      const recsDir = await window.electronAPI.hq.readDir(`projects/${project}/recommendations`);
      if (!recsDir.ok) return;

      for (const file of recsDir.data) {
        if (!file.name.endsWith('.json')) continue;
        const filePath = `projects/${project}/recommendations/${file.name}`;
        const fileData = await window.electronAPI.hq.readFile(filePath);
        if (!fileData.ok) continue;
        try {
          const parsed = JSON.parse(fileData.data);
          if (parsed.timestamp === rec.timestamp && parsed.title === rec.title) {
            Object.assign(parsed, { status: newStatus, ...extraFields });
            await window.electronAPI.hq.writeFile(filePath, JSON.stringify(parsed, null, 2));
            break;
          }
        } catch (e) { /* skip */ }
      }
    }

    // Emit automation events for chain reactions
    if (newStatus === 'resolved') {
      const agentId = get().agents.find(a => a.name === rec.agent)?.id;
      get().emitAutomationEvent('rec-resolved', {
        agentId,
        agentName: rec.agent,
        projectSlug: rec.project,
        recTitle: rec.title,
      });

      if (meta.resolvedBy === 'auto-implement') {
        get().emitAutomationEvent('rec-implemented', {
          agentId,
          agentName: rec.agent,
          projectSlug: rec.project,
          recTitle: rec.title,
        });
      }
    }
  },

  // Update project progress from a progress.json assessment
  updateProjectProgress: async (slug, newOverall) => {
    set(state => ({
      projects: state.projects.map(p =>
        p.slug === slug ? { ...p, progress: newOverall } : p
      ),
    }));
  },

  addActivity: (entry) =>
    set((state) => ({
      activityLog: [entry, ...state.activityLog].slice(0, 100),
    })),

  appendActivityToDisk: async (entry) => {
    if (!window.electronAPI?.hq) return;
    try {
      const logFile = await window.electronAPI.hq.readFile('activity-log.json');
      let log = [];
      if (logFile.ok) {
        try { log = JSON.parse(logFile.data); } catch {}
      }
      log.unshift(entry);
      await window.electronAPI.hq.writeFile('activity-log.json', JSON.stringify(log, null, 2));
    } catch (e) {
      console.warn('Could not append activity to disk:', e);
    }
  },

  // Load metering data from hq-data/metering/
  loadMeteringData: async () => {
    if (!window.electronAPI?.hq) return;
    set({ meteringLoading: true });
    try {
      const today = new Date().toISOString().slice(0, 10);
      // Read budgets
      const budgetsRes = await window.electronAPI.hq.readFile('metering/budgets.json');
      const budgets = budgetsRes.ok ? JSON.parse(budgetsRes.data) : {};

      // Read today's file — files are at metering/{date}.json (flat array of MeterRecords)
      const todayRes = await window.electronAPI.hq.readFile(`metering/${today}.json`);
      const todayRaw = todayRes.ok ? JSON.parse(todayRes.data) : [];
      // Normalize: file is a flat array, not {entries: [...]}
      const todayEntries = Array.isArray(todayRaw) ? todayRaw : (todayRaw.entries || []);

      // Read last 7 days
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const res = await window.electronAPI.hq.readFile(`metering/${key}.json`);
        const raw = res.ok ? JSON.parse(res.data) : [];
        const entries = Array.isArray(raw) ? raw : (raw.entries || []);
        days.push({ date: key, entries });
      }

      // Helper to extract token totals from MeterRecord format
      const getTokens = (e) => {
        if (e.tokens && typeof e.tokens === 'object') return (e.tokens.input || 0) + (e.tokens.output || 0);
        return (e.inputTokens || 0) + (e.outputTokens || 0);
      };

      // Compute summary client-side
      const providers = {};
      const byAgent = {};
      const byProject = {};
      const byFeature = {};

      for (const e of todayEntries) {
        const prov = e.provider || 'unknown';
        if (!providers[prov]) providers[prov] = { tokens: 0, sessions: 0 };
        providers[prov].tokens += getTokens(e);
        providers[prov].sessions += 1;

        const agent = e.agent || e.agentSlug || e.source || 'unknown';
        if (!byAgent[agent]) byAgent[agent] = 0;
        byAgent[agent] += getTokens(e);

        const project = e.project || 'unknown';
        if (!byProject[project]) byProject[project] = 0;
        byProject[project] += getTokens(e);

        const feature = e.linkId || e.feature || null;
        if (feature) {
          if (!byFeature[feature]) byFeature[feature] = { total: 0, stages: {} };
          const stage = e.source || e.stage || 'unknown';
          byFeature[feature].total += getTokens(e);
          if (!byFeature[feature].stages[stage]) byFeature[feature].stages[stage] = 0;
          byFeature[feature].stages[stage] += getTokens(e);
        }
      }

      // Trend data: per-day per-provider totals
      const trend = days.map(day => {
        const daySummary = { date: day.date, claude: 0, grok: 0, groq: 0 };
        for (const e of day.entries) {
          const prov = (e.provider || 'unknown').toLowerCase();
          const total = getTokens(e);
          if (prov === 'claude') daySummary.claude += total;
          else if (prov === 'grok') daySummary.grok += total;
          else if (prov === 'groq') daySummary.groq += total;
        }
        return daySummary;
      });

      set({
        meteringData: { providers, byAgent, byProject, byFeature, trend, budgets, today },
        meteringLoading: false,
      });
    } catch (err) {
      console.warn('Could not load metering data:', err);
      set({ meteringLoading: false });
    }
  },

  // Load data from hq-data files
  loadFromFiles: async () => {
    if (!window.electronAPI?.hq) return;

    try {
      // Load projects
      const projectsDir = await window.electronAPI.hq.readDir('projects');
      if (projectsDir.ok) {
        const projects = [];
        for (const entry of projectsDir.data) {
          if (entry.isDirectory) {
            const projFile = await window.electronAPI.hq.readFile(
              `projects/${entry.name}/project.json`
            );
            if (projFile.ok) {
              const p = JSON.parse(projFile.data);
              // Normalize snake_case to camelCase
              if (p.repo_path && !p.repoPath) p.repoPath = p.repo_path;

              // Load progress from progress.json if available
              const progFile = await window.electronAPI.hq.readFile(
                `projects/${entry.name}/progress.json`
              );
              if (progFile.ok) {
                try {
                  const prog = JSON.parse(progFile.data);
                  if (prog.overall != null) p.progress = prog.overall;
                } catch { /* skip */ }
              }

              projects.push(p);
            }
          }
        }
        if (projects.length > 0) {
          set({ projects });
        }
      }

      // Load recommendations from all projects
      await get().loadRecommendations();

      // Load ideas
      await get().loadIdeas();

      // Load council chat messages
      await get().loadChatMessages();

      // Load activity log
      const logFile = await window.electronAPI.hq.readFile('activity-log.json');
      if (logFile.ok) {
        set({ activityLog: JSON.parse(logFile.data) });
      }

      // Load automation config
      await get().loadAutomationConfig();

      // Load agent brains
      const brainsFile = await window.electronAPI.hq.readFile('agent-brains.json');
      if (brainsFile.ok) {
        try {
          const brains = JSON.parse(brainsFile.data);
          set({ agentBrains: brains });
          try { localStorage.setItem('forge-agent-brains', JSON.stringify(brains)); } catch {}
        } catch {}
      }

      // Load metering data
      await get().loadMeteringData();
    } catch (err) {
      console.warn('Could not load hq-data:', err);
    }
  },

  // Load recommendations from all project directories
  loadRecommendations: async () => {
    if (!window.electronAPI?.hq) return;

    try {
      const projectsDir = await window.electronAPI.hq.readDir('projects');
      if (!projectsDir.ok) return;

      const allRecs = [];
      for (const entry of projectsDir.data) {
        if (!entry.isDirectory) continue;
        const recsDir = await window.electronAPI.hq.readDir(
          `projects/${entry.name}/recommendations`
        );
        if (!recsDir.ok) continue;

        for (const recFile of recsDir.data) {
          if (!recFile.name.endsWith('.json')) continue;
          const relPath = `projects/${entry.name}/recommendations/${recFile.name}`;
          const recData = await window.electronAPI.hq.readFile(relPath);
          if (recData.ok) {
            try {
              const rec = JSON.parse(recData.data);
              // Skip files missing required fields (agent wrote wrong format)
              if (!rec.title || !rec.agent) continue;
              rec._filePath = relPath;
              // Backfill project from directory if missing
              if (!rec.project) rec.project = entry.name;
              // Backfill status if missing
              if (!rec.status) rec.status = 'active';
              // Backfill timestamp from filename date prefix if missing
              if (!rec.timestamp) {
                const dateMatch = recFile.name.match(/^(\d{4}-\d{2}-\d{2})/);
                if (dateMatch) rec.timestamp = `${dateMatch[1]}T00:00:00Z`;
              }
              allRecs.push(rec);
            } catch (e) {
              // skip malformed files
            }
          }
        }
      }

      // Sort by timestamp descending
      allRecs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      set({ recommendations: allRecs.map(backfillRec) });
    } catch (err) {
      console.warn('Could not load recommendations:', err);
    }
  },

  // Start file watcher
  startWatching: () => {
    if (!window.electronAPI?.hq) return;

    window.electronAPI.hq.startWatching();
    window.electronAPI.hq.onFileChanged(({ event, path }) => {
      // Reload relevant data when files change
      if (path.endsWith('.json')) {
        get().loadFromFiles();
      }

      // Knowledge file changes → update status
      if (path.startsWith('knowledge/') && path.endsWith('.json')) {
        get().setKnowledgeRefreshStatus('recently-updated', new Date().toISOString());
      }

      // Idea file changes → reload ideas
      if (path.includes('/ideas/') && path.endsWith('.json')) {
        get().loadIdeas();
      }

      // Council chat message file changes → reload chat
      if (path.startsWith('council-chat/') && path.endsWith('.json')) {
        get().loadChatMessages();
      }

      // Progress file changes → reload project progress
      if (path.includes('/progress.json')) {
        const slugMatch = path.match(/projects\/([^/]+)\/progress\.json/);
        if (slugMatch) {
          window.electronAPI.hq.readFile(path).then(result => {
            if (result.ok) {
              try {
                const prog = JSON.parse(result.data);
                if (prog.overall != null) {
                  get().updateProjectProgress(slugMatch[1], prog.overall);
                }
              } catch { /* skip */ }
            }
          });
        }
      }
    });
  },
}));
