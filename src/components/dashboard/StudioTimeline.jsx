import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

const DATE_GROUPS = (entries) => {
  const groups = {};
  for (const entry of entries) {
    const d = new Date(entry.timestamp);
    const key = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }
  return Object.entries(groups);
};

export default function StudioTimeline() {
  const activityLog = useStore((s) => s.activityLog);
  const recommendations = useStore((s) => s.recommendations);
  const agents = useStore((s) => s.agents);
  const projects = useStore((s) => s.projects);

  const [filterAgent, setFilterAgent] = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'activity' | 'recommendation' | 'implementation'

  // Merge activities and recommendation events into unified timeline
  const timelineEntries = useMemo(() => {
    const entries = [];

    // Add activity log entries
    for (const a of activityLog) {
      entries.push({
        id: `act-${a.id}`,
        type: 'activity',
        agent: a.agent,
        agentColor: a.agentColor,
        title: a.action,
        project: a.project,
        timestamp: a.timestamp,
      });
    }

    // Add recommendation events (created, resolved, implemented, dismissed)
    for (const r of recommendations) {
      entries.push({
        id: `rec-${r.timestamp}-${r.title}`,
        type: 'recommendation',
        agent: r.agent,
        agentColor: r.agentColor,
        title: r.title,
        summary: r.summary,
        project: projects.find(p => p.slug === r.project)?.name || r.project,
        timestamp: r.timestamp,
        status: r.status,
        resolvedBy: r.resolvedBy,
        boldness: r.boldness,
      });

      // Add resolution events
      if (r.resolvedAt) {
        entries.push({
          id: `resolve-${r.timestamp}-${r.title}`,
          type: 'implementation',
          agent: r.agent,
          agentColor: r.agentColor,
          title: r.resolvedBy === 'auto-implement'
            ? `Implemented: ${r.title}`
            : `Resolved: ${r.title}`,
          project: projects.find(p => p.slug === r.project)?.name || r.project,
          timestamp: r.resolvedAt,
          resolvedBy: r.resolvedBy,
        });
      }
      if (r.dismissedAt) {
        entries.push({
          id: `dismiss-${r.timestamp}-${r.title}`,
          type: 'activity',
          agent: r.agent,
          agentColor: r.agentColor,
          title: `Dismissed: ${r.title}`,
          project: projects.find(p => p.slug === r.project)?.name || r.project,
          timestamp: r.dismissedAt,
        });
      }
    }

    // Sort descending
    entries.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    return entries;
  }, [activityLog, recommendations, projects]);

  // Apply filters
  const filtered = useMemo(() => {
    return timelineEntries.filter(e => {
      if (filterAgent !== 'all' && e.agent !== filterAgent) return false;
      if (filterProject !== 'all' && e.project !== filterProject) return false;
      if (filterType !== 'all' && e.type !== filterType) return false;
      return true;
    });
  }, [timelineEntries, filterAgent, filterProject, filterType]);

  const grouped = useMemo(() => DATE_GROUPS(filtered), [filtered]);

  // Unique agents and projects from timeline
  const uniqueAgents = useMemo(() => [...new Set(timelineEntries.map(e => e.agent))].sort(), [timelineEntries]);
  const uniqueProjects = useMemo(() => [...new Set(timelineEntries.map(e => e.project))].sort(), [timelineEntries]);

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="input-field !w-auto !py-1.5 text-xs"
        >
          <option value="all">All Agents</option>
          {uniqueAgents.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="input-field !w-auto !py-1.5 text-xs"
        >
          <option value="all">All Projects</option>
          {uniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <div className="flex items-center gap-1">
          {['all', 'activity', 'recommendation', 'implementation'].map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                filterType === t
                  ? 'bg-forge-accent/20 text-forge-accent border border-forge-accent/30'
                  : 'text-forge-text-muted border border-forge-border hover:text-forge-text-secondary'
              }`}
            >
              {t === 'all' ? 'All' : t === 'implementation' ? 'Implemented' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <span className="text-xs text-forge-text-muted ml-auto">
          {filtered.length} events
        </span>
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {grouped.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-sm text-forge-text-muted">No timeline events match your filters</p>
          </div>
        ) : (
          grouped.map(([dateLabel, entries]) => (
            <div key={dateLabel}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-forge-border/50" />
                <span className="text-xs font-mono text-forge-text-muted uppercase tracking-wider">
                  {dateLabel}
                </span>
                <div className="h-px flex-1 bg-forge-border/50" />
              </div>

              {/* Events */}
              <div className="space-y-1.5 relative">
                {/* Vertical line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-forge-border/30" />

                {entries.map((entry) => (
                  <TimelineEntry key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TimelineEntry({ entry }) {
  const typeIcon = entry.type === 'recommendation' ? '\u2605'
    : entry.type === 'implementation' ? '\u26A1'
    : '\u25CF';

  const typeBg = entry.type === 'recommendation' ? 'bg-forge-accent/10'
    : entry.type === 'implementation' ? 'bg-green-400/10'
    : 'bg-forge-bg/50';

  return (
    <div className={`flex items-start gap-3 p-2.5 rounded-lg ${typeBg} hover:bg-forge-surface-hover transition-colors relative`}>
      {/* Agent dot */}
      <div
        className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] flex-shrink-0 z-10 border-2 border-forge-bg"
        style={{ backgroundColor: entry.agentColor }}
      >
        <span className="text-white font-bold">{typeIcon}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium" style={{ color: entry.agentColor }}>
            {entry.agent}
          </span>
          {entry.project && (
            <span className="text-[11px] text-forge-text-muted">{entry.project}</span>
          )}
          {entry.boldness && (
            <span className={`text-[10px] font-medium ${
              entry.boldness === 'wild' ? 'text-red-400' :
              entry.boldness === 'spicy' ? 'text-orange-400' : 'text-green-400'
            }`}>
              {entry.boldness.toUpperCase()}
            </span>
          )}
          {entry.resolvedBy === 'auto-implement' && (
            <span className="text-[10px] text-green-400 font-medium">{'\u26A1'} AUTO</span>
          )}
        </div>

        <p className="text-sm text-forge-text-primary leading-relaxed">
          {entry.title}
        </p>

        {entry.summary && (
          <p className="text-xs text-forge-text-secondary mt-0.5 leading-relaxed line-clamp-2">
            {entry.summary}
          </p>
        )}
      </div>

      {/* Time */}
      <span className="text-[11px] text-forge-text-muted/60 flex-shrink-0">
        {formatRelativeTime(entry.timestamp)}
      </span>
    </div>
  );
}
