// useSessions — unified selector merging the two session truths into one
// normalized shape the terminal UI can consume.
//
// Sources:
//   • implementationSessions — Friday/button dispatches (rich metadata)
//   • claudeSessions         — main-process SessionTracker mirror (persists
//                              across restarts, knows attachment state)
//
// De-dupe by id; impl wins on metadata conflicts because it carries agentColor,
// model, councilAgents, etc. Tracker fills the gap for restored PTYs that
// have no impl record.
//
// Derived state (5 values):
//   starting   — impl session spawned <2s ago and no output yet
//   working    — PTY alive AND busy-detector says busy
//   your-turn  — PTY alive AND busy-detector says idle
//   detached   — tracker says dormant (PTY gone, record kept)
//   done       — impl session transitioned to done/failed

import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { projectSlugFromCwd } from '../utils/projectSlugFromCwd';
import { getAgentBrain, getModelDisplay } from '../utils/brainConfig';

const STARTING_WINDOW_MS = 2000;

const IMPL_LABEL_PREFIX = /^Read the implementation brief/i;
const AGENT_LABEL_PREFIX = /^Read the (agent|council) brief/i;

function idTail(id) {
  if (!id) return '';
  const m = id.match(/^agent-\d+-(.+)$/);
  if (m) return m[1];
  const m2 = id.match(/-(\d{5,})$/);
  if (m2) return m2[1].slice(-6);
  const m3 = id.match(/^session-restored-(.+)$/);
  if (m3) return m3[1].slice(0, 8);
  const m4 = id.match(/^impl-(\d+)$/);
  if (m4) return m4[1].slice(-6);
  return id.slice(-6);
}

function prettifyLabel(rawLabel, fallback, sessionId) {
  if (!rawLabel || typeof rawLabel !== 'string') return fallback;
  const suffix = idTail(sessionId);
  if (IMPL_LABEL_PREFIX.test(rawLabel)) {
    return suffix ? `Implementation · ${suffix}` : 'Implementation';
  }
  if (AGENT_LABEL_PREFIX.test(rawLabel)) {
    return suffix ? `Agent · ${suffix}` : 'Agent';
  }
  return rawLabel;
}

// Forge stores busy state as { [scopeId]: bool } object map (not Set).
function isBusy(busyMap, id) {
  if (!busyMap || !id) return false;
  return Boolean(busyMap[id]);
}

function deriveState({ impl, tracker, busyMap, now }) {
  if (tracker?.status === 'dormant') {
    if (impl && (impl.status === 'done' || impl.status === 'failed')) return 'done';
    return 'detached';
  }

  if (impl && (impl.status === 'done' || impl.status === 'failed')) return 'done';

  const id = impl?.id || tracker?.scopeId;
  const isAlive = (impl?.status === 'running') || (tracker && tracker.status !== 'dormant');

  if (isAlive) {
    if (isBusy(busyMap, id)) return 'working';

    if (impl?.startedAt) {
      const startedMs = Date.parse(impl.startedAt);
      if (!Number.isNaN(startedMs) && now - startedMs < STARTING_WINDOW_MS) {
        return 'starting';
      }
    }
    return 'your-turn';
  }

  return 'done';
}

export function useSessions() {
  const implementationSessions = useStore(s => s.implementationSessions);
  const claudeSessions = useStore(s => s.claudeSessions);
  const claudeBusy = useStore(s => s.claudeBusy);
  const agents = useStore(s => s.agents);
  const projects = useStore(s => s.projects);
  const agentBrains = useStore(s => s.agentBrains);

  return useMemo(() => {
    const now = Date.now();
    const byId = new Map();

    for (const impl of implementationSessions) {
      if (!impl?.id) continue;
      const tracker = claudeSessions.find(t => t?.scopeId === impl.id) || null;
      const brain = impl.agentId ? getAgentBrain(impl.agentId, agentBrains) : null;
      const model = brain ? getModelDisplay(brain) : null;
      const session = {
        id: impl.id,
        label: prettifyLabel(impl.label, impl.agentName || impl.id, impl.id) || impl.id,
        agentId: impl.agentId || null,
        agentName: impl.agentName || null,
        agentColor: impl.agentColor || '#64748b',
        projectSlug: impl.projectSlug || 'studio',
        cwd: impl.repoPath || tracker?.cwd || null,
        createdAt: impl.startedAt || tracker?.createdAt || null,
        lastActivityAt: tracker?.lastActivityAt || null,
        councilAgents: impl.councilAgents || null,
        model,
        state: deriveState({ impl, tracker, busyMap: claudeBusy, now }),
        _source: tracker ? 'both' : 'impl',
      };
      byId.set(impl.id, session);
    }

    for (const tracker of claudeSessions) {
      if (!tracker?.scopeId) continue;
      if (byId.has(tracker.scopeId)) continue;

      const agent = tracker.agentSlug ? agents.find(a => a.id === tracker.agentSlug) : null;
      const slug = tracker.projectSlug || projectSlugFromCwd(tracker.cwd, projects) || 'studio';
      const brain = tracker.agentSlug ? getAgentBrain(tracker.agentSlug, agentBrains) : null;
      const model = brain ? getModelDisplay(brain) : null;

      const session = {
        id: tracker.scopeId,
        label: prettifyLabel(tracker.label, tracker.agentSlug || tracker.scopeId.slice(0, 14), tracker.scopeId)
               || tracker.scopeId.slice(0, 14),
        agentId: tracker.agentSlug || null,
        agentName: agent?.name || tracker.agentSlug || null,
        agentColor: agent?.color || '#64748b',
        projectSlug: slug,
        cwd: tracker.cwd || null,
        createdAt: tracker.createdAt || null,
        lastActivityAt: tracker.lastActivityAt || null,
        councilAgents: null,
        model,
        state: deriveState({ impl: null, tracker, busyMap: claudeBusy, now }),
        _source: 'tracker',
      };
      byId.set(tracker.scopeId, session);
    }

    return Array.from(byId.values());
  }, [implementationSessions, claudeSessions, claudeBusy, agents, projects, agentBrains]);
}

export function useSessionsByProject(projectSlug) {
  const all = useSessions();
  return useMemo(
    () => all.filter(s => s.projectSlug === projectSlug),
    [all, projectSlug]
  );
}
