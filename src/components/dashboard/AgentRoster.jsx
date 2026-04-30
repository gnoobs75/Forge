import React, { useMemo } from 'react';
import { useStore, getAdvisorAgents } from '../../store/useStore';
import { renderAgentAvatar } from '../../utils/avatarRenderer';

const JEEVES_COLOR = '#A78BFA';
const EMPTY_ACTIONS = [];

function openStewardTab() {
  window.dispatchEvent(new CustomEvent('forge:open-help', { detail: { tab: 'steward' } }));
}

export default function AgentRoster() {
  const setActiveAgent = useStore((s) => s.setActiveAgent);
  const agentAvatars = useStore((s) => s.agentAvatars);
  const stewardActions = useStore((s) => s.stewardStatus?.recentActions ?? EMPTY_ACTIONS);

  // The advisor cards. The Jeeves system agent has its own "Studio
  // Operations" tile above the grid — filtering here keeps him from
  // double-appearing once on top and once in the team list.
  const advisors = getAdvisorAgents();

  // Pre-render advisor avatars at 64px (2x for crisp 32px display)
  const renderedAvatars = useMemo(() => {
    const map = {};
    for (const agent of advisors) {
      map[agent.id] = renderAgentAvatar(agent.id, agent.color, 64);
    }
    return map;
  }, [advisors]);

  // "{N} actions today" — count steward actions completed in the last 24h.
  const actionsToday = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return stewardActions.filter((a) => {
      if (!a?.completed_at) return false;
      const t = Date.parse(a.completed_at);
      return Number.isFinite(t) && t >= cutoff;
    }).length;
  }, [stewardActions]);

  return (
    <div className="card">
      {/* Studio Operations — Jeeves tile above the team grid. */}
      <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-2 border-l-2 pl-3"
          style={{ borderColor: JEEVES_COLOR }}>
        Studio Operations
      </h2>
      <button
        type="button"
        onClick={openStewardTab}
        className="w-full mb-4 flex items-center gap-3 p-3 rounded-lg border bg-forge-bg/50 hover:bg-forge-surface-hover transition-colors text-left"
        style={{ borderColor: `${JEEVES_COLOR}33` }}
        title="Open the Steward tab"
        aria-label="Open Studio Steward (Jeeves)"
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
          style={{ backgroundColor: `${JEEVES_COLOR}1A`, color: JEEVES_COLOR }}
        >
          {'\u{1FAB6}'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-forge-text-primary">Jeeves</div>
          <div className="text-xs text-forge-text-muted truncate">
            Studio steward — quiet maintenance
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: JEEVES_COLOR }}>
            {actionsToday} action{actionsToday === 1 ? '' : 's'} today
          </div>
        </div>
      </button>

      <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
        Your Team
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {advisors.map((agent, i) => (
          <div
            key={agent.id}
            onClick={() => setActiveAgent(agent.id)}
            className={`flex items-center gap-2 p-2 rounded-lg bg-forge-bg/50 hover:bg-forge-surface-hover
                       transition-colors cursor-pointer group animate-slide-up stagger-${Math.min(i + 1, 8)}`}
          >
            {/* Agent avatar — uploaded image > 3D render > color dot */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 overflow-hidden"
              style={{ backgroundColor: `${agent.color}20` }}
            >
              {agentAvatars[agent.id] ? (
                <img
                  src={agentAvatars[agent.id]}
                  alt={agent.name}
                  className="w-full h-full object-cover"
                />
              ) : renderedAvatars[agent.id] ? (
                <img
                  src={renderedAvatars[agent.id]}
                  alt={agent.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: agent.color }}
                />
              )}
            </div>

            <div className="min-w-0">
              <div className="text-xs font-medium text-forge-text-primary group-hover:text-forge-accent-blue transition-colors truncate">
                {agent.name}
              </div>
              <div className="text-[10px] text-forge-text-muted truncate">
                {agent.role}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
