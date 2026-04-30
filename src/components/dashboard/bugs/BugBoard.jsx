/**
 * <BugBoard slug="expedition" />
 *
 * Per-project Bugs tab. Mounted from GameDetail. Shows:
 *   - Stats row (5 status counts + total)
 *   - Filter row (status, severity, search)
 *   - Sorted bug list (createdAt desc)
 *   - Empty state with CLI hint
 *
 * Critical Zustand pitfall: never return arr.filter() / arr.map() directly
 * from a selector — pull the raw bugs array, then derive in useMemo.
 */

import React, { useMemo, useState } from 'react';
import { useStore } from '../../../store/useStore';
import BugCard from './BugCard';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
} from './constants';

const STATUS_KEYS = ['open', 'triaged', 'fixing', 'closed', 'wontfix'];

function StatCard({ label, count, color }) {
  return (
    <div className="flex-1 min-w-[80px] rounded-lg border border-forge-border bg-forge-bg-elevated px-3 py-2">
      <div
        className="text-2xl font-bold font-mono leading-none"
        style={{ color }}
      >
        {count}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-forge-text-muted mt-1">
        {label}
      </div>
    </div>
  );
}

export default function BugBoard({ slug }) {
  const allBugs = useStore((s) => s.bugs);

  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Filter to this project (ref-stable derivation).
  const projectBugs = useMemo(
    () => allBugs.filter((b) => b.project === slug),
    [allBugs, slug]
  );

  // Counts by status (uses raw projectBugs, not filtered list — stats reflect
  // the full project backlog, not the current filter view).
  const counts = useMemo(() => {
    const c = { open: 0, triaged: 0, fixing: 0, closed: 0, wontfix: 0 };
    for (const b of projectBugs) {
      if (c[b.status] !== undefined) c[b.status] += 1;
    }
    return c;
  }, [projectBugs]);

  // Apply filters + sort by createdAt desc.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const out = projectBugs.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (severityFilter !== 'all' && b.severity !== severityFilter) return false;
      if (term) {
        const hay = `${b.title || ''} ${b.description || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return out;
  }, [projectBugs, statusFilter, severityFilter, search]);

  const total = projectBugs.length;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="flex flex-wrap gap-2">
        {STATUS_KEYS.map((s) => (
          <StatCard
            key={s}
            label={STATUS_LABELS[s]}
            count={counts[s]}
            color={STATUS_COLORS[s]}
          />
        ))}
        <StatCard label="Total" count={total} color="#94A3B8" />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
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
          Showing {filtered.length} of {total}
        </span>
      </div>

      {/* Bug list */}
      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-forge-border bg-forge-bg-elevated/30 p-8 text-center">
          <div className="text-3xl mb-2">🐛</div>
          <div className="text-sm text-forge-text-secondary mb-2">
            No bugs filed for this project yet.
          </div>
          <div className="text-xs text-forge-text-muted">
            Press <span className="font-mono text-forge-accent">Ctrl+Shift+B</span> in the running game to file one,
            <br />
            or run <span className="font-mono text-forge-accent">npm run bug -- create --slug {slug} --title "…"</span> from the CoE directory.
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
            <BugCard key={bug.id} bug={bug} />
          ))}
        </div>
      )}
    </div>
  );
}
