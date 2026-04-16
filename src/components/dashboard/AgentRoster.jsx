import React, { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { renderAgentAvatar } from '../../utils/avatarRenderer';

export default function AgentRoster() {
  const agents = useStore((s) => s.agents);
  const setActiveAgent = useStore((s) => s.setActiveAgent);
  const agentAvatars = useStore((s) => s.agentAvatars);

  // Pre-render all 14 agent avatars at 64px (2x for crisp 32px display)
  const renderedAvatars = useMemo(() => {
    const map = {};
    for (const agent of agents) {
      map[agent.id] = renderAgentAvatar(agent.id, agent.color, 64);
    }
    return map;
  }, [agents]);

  return (
    <div className="card">
      <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
        Your Team
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {agents.map((agent, i) => (
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
