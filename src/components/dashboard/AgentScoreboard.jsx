import React, { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { renderAgentAvatar } from '../../utils/avatarRenderer';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

const CHART_COLORS = ['#22C55E', '#3B82F6', '#F97316', '#EF4444', '#8B5CF6', '#EC4899'];

export default function AgentScoreboard() {
  const recommendations = useStore((s) => s.recommendations);
  const agents = useStore((s) => s.agents);
  const activityLog = useStore((s) => s.activityLog);
  const agentAvatars = useStore((s) => s.agentAvatars);

  // Compute per-agent stats
  const agentStats = useMemo(() => {
    const stats = {};
    for (const agent of agents) {
      stats[agent.name] = {
        id: agent.id,
        name: agent.name,
        color: agent.color,
        total: 0,
        active: 0,
        resolved: 0,
        implemented: 0,
        dismissed: 0,
        activityCount: 0,
      };
    }

    for (const rec of recommendations) {
      const s = stats[rec.agent];
      if (!s) continue;
      s.total++;
      if (rec.status === 'active') s.active++;
      else if (rec.status === 'resolved') {
        if (rec.resolvedBy === 'auto-implement') s.implemented++;
        else s.resolved++;
      } else if (rec.status === 'dismissed') s.dismissed++;
    }

    for (const a of activityLog) {
      const s = stats[a.agent];
      if (s) s.activityCount++;
    }

    return Object.values(stats)
      .map(s => ({
        ...s,
        hitRate: s.total > 0 ? Math.round(((s.implemented + s.resolved) / s.total) * 100) : 0,
        implRate: s.total > 0 ? Math.round((s.implemented / s.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [recommendations, agents, activityLog]);

  // Summary stats
  const summary = useMemo(() => {
    const total = recommendations.length;
    const active = recommendations.filter(r => r.status === 'active').length;
    const implemented = recommendations.filter(r => r.resolvedBy === 'auto-implement').length;
    const resolved = recommendations.filter(r => r.status === 'resolved' && r.resolvedBy !== 'auto-implement').length;
    const dismissed = recommendations.filter(r => r.status === 'dismissed').length;
    return { total, active, implemented, resolved, dismissed };
  }, [recommendations]);

  // Data for distribution pie chart
  const pieData = useMemo(() => [
    { name: 'Active', value: summary.active, color: '#3B82F6' },
    { name: 'Implemented', value: summary.implemented, color: '#22C55E' },
    { name: 'Resolved', value: summary.resolved, color: '#06B6D4' },
    { name: 'Dismissed', value: summary.dismissed, color: '#64748B' },
  ].filter(d => d.value > 0), [summary]);

  // Data for agent bar chart
  const barData = useMemo(() =>
    agentStats.filter(s => s.total > 0).map(s => ({
      name: s.name.split(' ').map(w => w[0]).join(''),
      fullName: s.name,
      total: s.total,
      implemented: s.implemented,
      resolved: s.resolved,
      dismissed: s.dismissed,
      active: s.active,
      color: s.color,
    })),
  [agentStats]);

  // Radar data for agent effectiveness
  const radarData = useMemo(() => {
    const activeAgents = agentStats.filter(s => s.total > 0).slice(0, 6);
    if (activeAgents.length === 0) return [];
    return activeAgents.map(s => ({
      agent: s.name.split(' ')[0],
      'Hit Rate': s.hitRate,
      'Activity': Math.min(s.activityCount * 10, 100),
      'Volume': Math.min(s.total * 20, 100),
    }));
  }, [agentStats]);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Total Recs" value={summary.total} color="#3B82F6" />
        <StatCard label="Active" value={summary.active} color="#F97316" />
        <StatCard label="Implemented" value={summary.implemented} color="#22C55E" icon={'\u26A1'} />
        <StatCard label="Resolved" value={summary.resolved} color="#06B6D4" icon={'\u2713'} />
        <StatCard label="Dismissed" value={summary.dismissed} color="#64748B" icon={'\u2014'} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Distribution Pie */}
        <div className="card">
          <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3">
            Recommendation Status
          </h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((d, i) => (
                    <Cell key={i} fill={d.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e1e24', border: '1px solid #3F465B', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-sm text-forge-text-muted">
              No data yet
            </div>
          )}
          <div className="flex items-center gap-3 justify-center mt-2">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                <span className="text-[11px] text-forge-text-muted">{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Output Bar Chart */}
        <div className="card">
          <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3">
            Agent Output
          </h3>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} barSize={16}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1e1e24', border: '1px solid #3F465B', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelFormatter={(v, payload) => payload?.[0]?.payload?.fullName || v}
                />
                <Bar dataKey="implemented" stackId="a" fill="#22C55E" radius={[0, 0, 0, 0]} name="Implemented" />
                <Bar dataKey="resolved" stackId="a" fill="#06B6D4" name="Resolved" />
                <Bar dataKey="active" stackId="a" fill="#3B82F6" name="Active" />
                <Bar dataKey="dismissed" stackId="a" fill="#64748B" radius={[3, 3, 0, 0]} name="Dismissed" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-forge-text-muted">
              No data yet
            </div>
          )}
        </div>

        {/* Agent Effectiveness Radar */}
        <div className="card">
          <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3">
            Agent Effectiveness
          </h3>
          {radarData.length >= 3 ? (
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#3F465B" />
                <PolarAngleAxis dataKey="agent" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                <Radar name="Hit Rate" dataKey="Hit Rate" stroke="#22C55E" fill="#22C55E" fillOpacity={0.2} />
                <Radar name="Activity" dataKey="Activity" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} />
                <Tooltip
                  contentStyle={{ background: '#1e1e24', border: '1px solid #3F465B', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-forge-text-muted">
              Need 3+ active agents
            </div>
          )}
        </div>
      </div>

      {/* Agent Leaderboard */}
      <div className="card">
        <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
          Agent Leaderboard
        </h3>
        <div className="space-y-2">
          {agentStats.map((agent, i) => (
            <AgentRow key={agent.id} agent={agent} rank={i + 1} avatar={agentAvatars[agent.id]} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <div className="card !p-3">
      <div className="text-[11px] text-forge-text-muted uppercase tracking-wider">{label}</div>
      <div className="flex items-center gap-1.5 mt-1">
        {icon && <span style={{ color }}>{icon}</span>}
        <span className="text-2xl font-bold font-mono" style={{ color }}>{value}</span>
      </div>
    </div>
  );
}

function AgentRow({ agent, rank, avatar }) {
  const rendered3D = useMemo(
    () => renderAgentAvatar(agent.id, agent.color, 64),
    [agent.id, agent.color]
  );

  const implPct = agent.total > 0 ? (agent.implemented / agent.total) * 100 : 0;
  const resolvedPct = agent.total > 0 ? (agent.resolved / agent.total) * 100 : 0;
  const activePct = agent.total > 0 ? (agent.active / agent.total) * 100 : 0;
  const dismissedPct = agent.total > 0 ? (agent.dismissed / agent.total) * 100 : 0;

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-forge-bg/50 hover:bg-forge-surface-hover transition-colors">
      {/* Rank */}
      <span className="text-sm font-mono text-forge-text-muted/50 w-5 text-right">
        {rank}
      </span>

      {/* Avatar — uploaded image > 3D render > color dot */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 overflow-hidden"
        style={{ backgroundColor: `${agent.color}20` }}
      >
        {avatar ? (
          <img src={avatar} alt={agent.name} className="w-full h-full object-cover" />
        ) : rendered3D ? (
          <img src={rendered3D} alt={agent.name} className="w-full h-full object-contain" />
        ) : (
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: agent.color }} />
        )}
      </div>

      {/* Name + stats */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-forge-text-primary">{agent.name}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-forge-text-muted">{agent.total} recs</span>
            {agent.hitRate > 0 && (
              <span className="text-xs font-medium text-green-400">{agent.hitRate}% hit</span>
            )}
          </div>
        </div>

        {/* Stacked bar */}
        {agent.total > 0 && (
          <div className="h-2 rounded-full overflow-hidden bg-forge-border/20 flex">
            {implPct > 0 && (
              <div className="h-full bg-green-400" style={{ width: `${implPct}%` }} title={`${agent.implemented} implemented`} />
            )}
            {resolvedPct > 0 && (
              <div className="h-full bg-cyan-400" style={{ width: `${resolvedPct}%` }} title={`${agent.resolved} resolved`} />
            )}
            {activePct > 0 && (
              <div className="h-full bg-blue-400" style={{ width: `${activePct}%` }} title={`${agent.active} active`} />
            )}
            {dismissedPct > 0 && (
              <div className="h-full bg-gray-500" style={{ width: `${dismissedPct}%` }} title={`${agent.dismissed} dismissed`} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
