import React, { useMemo } from 'react';
import { useStore } from '../../store/useStore';

const TYPE_BADGES = {
  schedule: { label: 'SCHED', color: '#EAB308' },
  chain: { label: 'CHAIN', color: '#8B5CF6' },
  trigger: { label: 'TRIG', color: '#F97316' },
};

const FREQ_BADGES = {
  daily: { label: 'Daily', color: '#3B82F6' },
  weekly: { label: 'Weekly', color: '#22C55E' },
  biweekly: { label: 'Bi-weekly', color: '#F59E0B' },
  monthly: { label: 'Monthly', color: '#8B5CF6' },
  'on-phase-change': { label: 'Phase', color: '#F97316' },
  'on-milestone': { label: 'Milestone', color: '#EF4444' },
};

export default function AgentProfileAutomation({ agentId, agentColor }) {
  const automationSchedules = useStore((s) => s.automationSchedules);
  const agentChains = useStore((s) => s.agentChains);
  const eventTriggers = useStore((s) => s.eventTriggers);
  const agents = useStore((s) => s.agents);

  const schedules = useMemo(
    () => automationSchedules.filter(s => s.agentId === agentId),
    [automationSchedules, agentId]
  );

  const incomingChains = useMemo(
    () => agentChains.filter(c => c.targetAgentId === agentId),
    [agentChains, agentId]
  );

  const outgoingChains = useMemo(
    () => agentChains.filter(c => c.sourceAgentId === agentId),
    [agentChains, agentId]
  );

  const triggers = useMemo(
    () => eventTriggers.filter(t => t.agentId === agentId),
    [eventTriggers, agentId]
  );

  const hasAnything = schedules.length > 0 || incomingChains.length > 0 || outgoingChains.length > 0 || triggers.length > 0;

  if (!hasAnything) return null;

  const getAgentColor = (id) => {
    if (id === 'any') return '#94a3b8';
    return agents.find(a => a.id === id)?.color || '#666';
  };

  const getAgentName = (id, fallback) => {
    if (id === 'any') return 'Any Agent';
    return agents.find(a => a.id === id)?.name || fallback || id;
  };

  return (
    <div className="card">
      <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3">
        Automation Role
      </h2>

      <div className="space-y-3">
        {/* Schedules */}
        {schedules.length > 0 && (
          <div>
            <div className="text-[10px] text-forge-text-muted uppercase tracking-wider mb-1.5">Schedules</div>
            {schedules.map((s, i) => {
              const freq = FREQ_BADGES[s.frequency] || { label: s.frequency, color: '#666' };
              return (
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-forge-border/30 last:border-0">
                  <Badge label={TYPE_BADGES.schedule.label} color={TYPE_BADGES.schedule.color} />
                  <Badge label={freq.label} color={freq.color} />
                  <span className="text-xs text-forge-text-secondary flex-1 truncate">{s.action}</span>
                  {!s.enabled && <span className="text-[9px] text-forge-text-muted">PAUSED</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* Incoming chains */}
        {incomingChains.length > 0 && (
          <div>
            <div className="text-[10px] text-forge-text-muted uppercase tracking-wider mb-1.5">Incoming Chains</div>
            {incomingChains.map((c, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-forge-border/30 last:border-0">
                <Badge label={TYPE_BADGES.chain.label} color={TYPE_BADGES.chain.color} />
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getAgentColor(c.sourceAgentId) }} />
                  <span className="text-[10px] text-forge-text-muted">{getAgentName(c.sourceAgentId, c.sourceAgentName)}</span>
                </span>
                <span className="text-forge-text-muted text-[10px]">&rarr;</span>
                <span className="text-xs text-forge-text-secondary flex-1 truncate">{c.action}</span>
              </div>
            ))}
          </div>
        )}

        {/* Outgoing chains */}
        {outgoingChains.length > 0 && (
          <div>
            <div className="text-[10px] text-forge-text-muted uppercase tracking-wider mb-1.5">Outgoing Chains</div>
            {outgoingChains.map((c, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-forge-border/30 last:border-0">
                <Badge label={TYPE_BADGES.chain.label} color={TYPE_BADGES.chain.color} />
                <span className="text-forge-text-muted text-[10px]">&rarr;</span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getAgentColor(c.targetAgentId) }} />
                  <span className="text-[10px] text-forge-text-muted">{getAgentName(c.targetAgentId, c.targetAgentName)}</span>
                </span>
                <span className="text-xs text-forge-text-secondary flex-1 truncate">{c.action}</span>
              </div>
            ))}
          </div>
        )}

        {/* Triggers */}
        {triggers.length > 0 && (
          <div>
            <div className="text-[10px] text-forge-text-muted uppercase tracking-wider mb-1.5">Event Triggers</div>
            {triggers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-forge-border/30 last:border-0">
                <Badge label={TYPE_BADGES.trigger.label} color={TYPE_BADGES.trigger.color} />
                <Badge label={t.event} color="#06B6D4" />
                {t.condition && t.condition !== 'always' && (
                  <Badge label={t.condition} color="#F59E0B" />
                )}
                <span className="text-xs text-forge-text-secondary flex-1 truncate">{t.action}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ label, color }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex-shrink-0"
      style={{ backgroundColor: `${color}15`, color }}
    >
      {label}
    </span>
  );
}
