import React, { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const STATUS_COLORS = {
  active: '#3B82F6',
  resolved: '#22C55E',
  dismissed: '#EF4444',
  implemented: '#EAB308',
};

const DARK_TOOLTIP = {
  contentStyle: { background: '#1e1e24', border: '1px solid #3F465B', borderRadius: 8, fontSize: 11 },
  itemStyle: { color: '#e2e8f0' },
  labelStyle: { color: '#94a3b8' },
};

export default function AgentProfileStats({ agentId, agentColor, onRecsClick }) {
  const allRecommendations = useStore((s) => s.recommendations);
  const activityLog = useStore((s) => s.activityLog);
  const automationExecutionLog = useStore((s) => s.automationExecutionLog);
  const projects = useStore((s) => s.projects);

  const recs = useMemo(
    () => allRecommendations.filter((r) =>
      r.agent?.toLowerCase().replace(/\s+/g, '-') === agentId || r.agentId === agentId
    ),
    [allRecommendations, agentId]
  );

  const agentActivity = useMemo(
    () => activityLog.filter((a) =>
      a.agent?.toLowerCase().replace(/\s+/g, '-') === agentId
    ),
    [activityLog, agentId]
  );

  const agentAutoRuns = useMemo(
    () => automationExecutionLog.filter((e) => e.agentId === agentId),
    [automationExecutionLog, agentId]
  );

  // Stats
  const totalRecs = recs.length;
  const activeRecs = useMemo(() => recs.filter(r => r.status === 'active' || !r.status).length, [recs]);
  const resolvedRecs = useMemo(() => recs.filter(r => r.status === 'resolved').length, [recs]);
  const implementedRecs = useMemo(() => recs.filter(r => r.status === 'implemented').length, [recs]);
  const implRate = totalRecs > 0 ? Math.round(((resolvedRecs + implementedRecs) / totalRecs) * 100) : 0;

  const lastActive = useMemo(() => {
    const timestamps = [
      ...recs.map(r => r.timestamp),
      ...agentActivity.map(a => a.timestamp),
    ].filter(Boolean).sort().reverse();
    return timestamps[0] || null;
  }, [recs, agentActivity]);

  const lastActiveStr = useMemo(() => {
    if (!lastActive) return 'Never';
    const diff = Date.now() - new Date(lastActive).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, [lastActive]);

  // Project affinity data
  const projectData = useMemo(() => {
    const counts = {};
    for (const rec of recs) {
      const proj = rec.project || 'unknown';
      counts[proj] = (counts[proj] || 0) + 1;
    }
    return projects
      .map(p => ({ name: p.name, slug: p.slug, count: counts[p.slug] || 0 }))
      .filter(p => p.count > 0);
  }, [recs, projects]);

  // Status donut data
  const statusData = useMemo(() => {
    const dismissed = recs.filter(r => r.status === 'dismissed').length;
    return [
      { name: 'Active', value: activeRecs, color: STATUS_COLORS.active },
      { name: 'Resolved', value: resolvedRecs, color: STATUS_COLORS.resolved },
      { name: 'Dismissed', value: dismissed, color: STATUS_COLORS.dismissed },
    ].filter(d => d.value > 0);
  }, [recs, activeRecs, resolvedRecs]);

  // Activity sparkline — last 30 days
  const sparkData = useMemo(() => {
    const now = Date.now();
    const days = 30;
    const buckets = Array.from({ length: days }, (_, i) => {
      const date = new Date(now - (days - 1 - i) * 86400000);
      return { day: i, date: date.toISOString().slice(0, 10), count: 0 };
    });
    const dateMap = {};
    buckets.forEach((b, i) => { dateMap[b.date] = i; });

    for (const a of agentActivity) {
      const d = a.timestamp?.slice(0, 10);
      if (d && dateMap[d] !== undefined) buckets[dateMap[d]].count++;
    }
    for (const r of recs) {
      const d = r.timestamp?.slice(0, 10);
      if (d && dateMap[d] !== undefined) buckets[dateMap[d]].count++;
    }
    return buckets;
  }, [agentActivity, recs]);

  // SVG ring for implementation rate
  const ringRadius = 14;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - implRate / 100);

  return (
    <div className="card">
      <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3">
        Performance Stats
      </h2>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Total Recs" value={totalRecs} onClick={onRecsClick} />
        <StatCard label="Impl. Rate" value={
          <div className="flex items-center gap-2">
            <span>{implRate}%</span>
            <svg width="36" height="36" className="flex-shrink-0">
              <circle cx="18" cy="18" r={ringRadius} fill="none" stroke="#1e293b" strokeWidth="3" />
              <circle
                cx="18" cy="18" r={ringRadius} fill="none"
                stroke={agentColor} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                transform="rotate(-90 18 18)"
              />
            </svg>
          </div>
        } />
        <StatCard label="Last Active" value={lastActiveStr} />
        <StatCard label="Active" value={activeRecs} dot="#3B82F6" />
        <StatCard label="Resolved" value={resolvedRecs} dot="#22C55E" />
        <StatCard label="Auto Runs" value={agentAutoRuns.length} />
      </div>

      {/* Project affinity + status donut row */}
      <div className="flex gap-4">
        {/* Project affinity bar chart */}
        {projectData.length > 0 && (
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-forge-text-muted uppercase tracking-wider mb-1">Project Focus</div>
            <ResponsiveContainer width="100%" height={projectData.length * 28 + 8}>
              <BarChart data={projectData} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip {...DARK_TOOLTIP} />
                <Bar dataKey="count" fill={agentColor} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Status donut */}
        {statusData.length > 0 && (
          <div className="flex-shrink-0 flex flex-col items-center">
            <div className="text-[10px] text-forge-text-muted uppercase tracking-wider mb-1">Status</div>
            <PieChart width={60} height={60}>
              <Pie data={statusData} cx={30} cy={30} innerRadius={16} outerRadius={26} dataKey="value" strokeWidth={0}>
                {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip {...DARK_TOOLTIP} />
            </PieChart>
          </div>
        )}
      </div>

      {/* Activity sparkline */}
      {sparkData.some(d => d.count > 0) && (
        <div className="mt-3">
          <div className="text-[10px] text-forge-text-muted uppercase tracking-wider mb-1">30-Day Activity</div>
          <ResponsiveContainer width="100%" height={40}>
            <LineChart data={sparkData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
              <Line type="monotone" dataKey="count" stroke={agentColor} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, dot, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`px-3 py-2.5 rounded-lg bg-forge-bg/50 border border-forge-border/50 text-left ${
        onClick ? 'cursor-pointer hover:border-forge-accent/30 hover:bg-forge-bg transition-colors' : ''
      }`}
    >
      <div className="flex items-center gap-1.5">
        {dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />}
        <span className="text-[10px] text-forge-text-muted uppercase tracking-wider">{label}</span>
        {onClick && <span className="text-[9px] text-forge-text-muted ml-auto">&darr;</span>}
      </div>
      <div className="text-lg font-mono font-bold text-forge-text-primary mt-0.5">
        {value}
      </div>
    </Tag>
  );
}
