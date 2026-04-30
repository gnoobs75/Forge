/**
 * <StudioBugBoard />
 *
 * Cross-project bug board mounted from StudioOverview's "Bugs" tab.
 *   - Headline: "N critical · M high · X total across studio" (severity-colored)
 *   - Filter row: project, status, severity, search
 *   - Sort: severity desc (critical → low), then createdAt desc
 *   - Each bug: <BugCard bug showProject />
 *
 * Same Zustand pitfall guard as BugBoard — pull raw `bugs`, derive in useMemo.
 */

import React, { useMemo, useState } from 'react';
import { useStore } from '../../../store/useStore';
import BugCard from './BugCard';
import {
  STATUS_LABELS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  SEVERITY_ORDER,
} from './constants';

const STATUS_KEYS = ['open', 'triaged', 'fixing', 'closed', 'wontfix'];
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

export default function StudioBugBoard() {
  const allBugs = useStore((s) => s.bugs);
  const projects = useStore((s) => s.projects);

  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Headline counts (from full unfiltered bug list).
  const headline = useMemo(() => {
    let critical = 0;
    let high = 0;
    for (const b of allBugs) {
      if (b.severity === 'critical') critical += 1;
      else if (b.severity === 'high') high += 1;
    }
    return { critical, high, total: allBugs.length };
  }, [allBugs]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const out = allBugs.filter((b) => {
      if (projectFilter !== 'all' && b.project !== projectFilter) return false;
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (severityFilter !== 'all' && b.severity !== severityFilter) return false;
      if (term) {
        const hay = `${b.title || ''} ${b.description || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    out.sort((a, b) => {
      const ra = SEVERITY_RANK[a.severity] ?? 99;
      const rb = SEVERITY_RANK[b.severity] ?? 99;
      if (ra !== rb) return ra - rb;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    return out;
  }, [allBugs, projectFilter, statusFilter, severityFilter, search]);

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="rounded-lg border border-forge-border bg-forge-bg-elevated p-4">
        <div className="text-[10px] uppercase tracking-wider text-forge-text-muted mb-2">
          Studio Bugs
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-2xl font-mono font-bold">
          <span style={{ color: SEVERITY_COLORS.critical }}>
            {headline.critical}
            <span className="text-sm font-normal text-forge-text-muted ml-1">critical</span>
          </span>
          <span className="text-forge-text-muted text-base">·</span>
          <span style={{ color: SEVERITY_COLORS.high }}>
            {headline.high}
            <span className="text-sm font-normal text-forge-text-muted ml-1">high</span>
          </span>
          <span className="text-forge-text-muted text-base">·</span>
          <span className="text-forge-text-primary">
            {headline.total}
            <span className="text-sm font-normal text-forge-text-muted ml-1">total across studio</span>
          </span>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="px-2 py-1.5 text-xs rounded border border-forge-border bg-forge-bg text-forge-text-primary focus:outline-none focus:border-forge-accent/60"
          title="Filter by project"
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.slug} value={p.slug}>{p.name || p.slug}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2 py-1.5 text-xs rounded border border-forge-border bg-forge-bg text-forge-text-primary focus:outline-none focus:border-forge-accent/60"
          title="Filter by status"
        >
          <option value="all">All statuses</option>
          {STATUS_KEYS.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-2 py-1.5 text-xs rounded border border-forge-border bg-forge-bg text-forge-text-primary focus:outline-none focus:border-forge-accent/60"
          title="Filter by severity"
        >
          <option value="all">All severities</option>
          {SEVERITY_ORDER.map((s) => (
            <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title + description…"
          className="flex-1 min-w-[200px] px-2 py-1.5 text-xs rounded border border-forge-border bg-forge-bg text-forge-text-primary placeholder:text-forge-text-muted focus:outline-none focus:border-forge-accent/60"
        />
        <span className="text-[10px] text-forge-text-muted font-mono">
          Showing {filtered.length} of {headline.total}
        </span>
      </div>

      {/* List */}
      {headline.total === 0 ? (
        <div className="rounded-lg border border-dashed border-forge-border bg-forge-bg-elevated/30 p-8 text-center">
          <div className="text-3xl mb-2">🐛</div>
          <div className="text-sm text-forge-text-secondary">
            No bugs filed across the studio yet.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-forge-border bg-forge-bg-elevated/30 p-6 text-center">
          <div className="text-sm text-forge-text-muted">
            No bugs match the current filters.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((bug) => (
            <BugCard key={bug.id} bug={bug} showProject />
          ))}
        </div>
      )}
    </div>
  );
}
