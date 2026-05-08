// JeevesPage — full-page expanded version of the JeevesNotes panel.
// Reads the same recentActions[] slice the panel reads, but renders a
// filterable / groupable long-form list. v1 is read-only — clicking a
// row does nothing.
import React, { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { jeevesNarrate } from '../../utils/jeevesNarrate';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

const JEEVES_COLOR = '#A78BFA';
const EMPTY_ACTIONS = [];
const RANGES = ['Today', '7d', '30d', 'All'];
const GROUPS = ['Day', 'Project', 'Off'];

function projectKey(action) {
  return action.project ?? 'studio-wide';
}

function dayBucket(iso) {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function withinRange(action, range, now) {
  if (range === 'All') return true;
  const completed = action.completed_at ? new Date(action.completed_at).getTime() : 0;
  if (!completed) return false;
  if (range === 'Today') {
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    return completed >= today.getTime();
  }
  const days = range === '7d' ? 7 : 30;
  return completed >= now - days * 24 * 60 * 60 * 1000;
}

function groupRows(rows, groupBy) {
  if (groupBy === 'Off') return [{ key: '__flat__', label: null, rows }];
  const map = new Map();
  for (const r of rows) {
    const key = groupBy === 'Day' ? dayBucket(r.completed_at) : projectKey(r);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return Array.from(map.entries()).map(([key, rows]) => ({ key, label: key, rows }));
}

export default function JeevesPage() {
  const recentActions = useStore((s) => s.stewardStatus?.recentActions ?? EMPTY_ACTIONS);

  const [projectFilter, setProjectFilter] = useState('All');
  const [ruleFilter, setRuleFilter] = useState('All');
  const [rangeFilter, setRangeFilter] = useState('All');
  const [groupBy, setGroupBy] = useState('Day');

  const projectOptions = useMemo(() => {
    const set = new Set(recentActions.map(projectKey));
    return ['All', ...Array.from(set).sort()];
  }, [recentActions]);

  const ruleOptions = useMemo(() => {
    const set = new Set(recentActions.map((a) => a.rule_id).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [recentActions]);

  const visible = useMemo(() => {
    const now = Date.now();
    return recentActions
      .filter((a) => projectFilter === 'All' || projectKey(a) === projectFilter)
      .filter((a) => ruleFilter === 'All' || a.rule_id === ruleFilter)
      .filter((a) => withinRange(a, rangeFilter, now))
      .slice()
      .sort((x, y) => new Date(y.completed_at).getTime() - new Date(x.completed_at).getTime());
  }, [recentActions, projectFilter, ruleFilter, rangeFilter]);

  const groups = useMemo(() => groupRows(visible, groupBy), [visible, groupBy]);

  function clearFilters() {
    setProjectFilter('All');
    setRuleFilter('All');
    setRangeFilter('All');
  }

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-4">
        <h1 className="text-lg font-semibold text-forge-text-primary flex items-center gap-2">
          <span style={{ color: JEEVES_COLOR }}>{'\u{1FAB6}'}</span>
          Jeeves&apos; Notes
        </h1>
        <p className="text-xs text-forge-text-muted">
          What he&apos;s been quietly fixing — last {visible.length} updates
        </p>
      </header>

      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        <label className="flex items-center gap-1 text-forge-text-muted">
          Project
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="bg-forge-surface border border-forge-border rounded px-2 py-1 text-forge-text-primary"
          >
            {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-forge-text-muted">
          Rule
          <select
            value={ruleFilter}
            onChange={(e) => setRuleFilter(e.target.value)}
            className="bg-forge-surface border border-forge-border rounded px-2 py-1 text-forge-text-primary"
          >
            {ruleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-forge-text-muted">
          Range
          <select
            value={rangeFilter}
            onChange={(e) => setRangeFilter(e.target.value)}
            className="bg-forge-surface border border-forge-border rounded px-2 py-1 text-forge-text-primary"
          >
            {RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-forge-text-muted">
          Group
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="bg-forge-surface border border-forge-border rounded px-2 py-1 text-forge-text-primary"
          >
            {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      </div>

      {recentActions.length === 0 ? (
        <div className="py-6 text-sm text-forge-text-muted italic">
          No quiet updates yet. Jeeves takes notes as the studio works.
        </div>
      ) : visible.length === 0 ? (
        <div className="py-6 text-sm text-forge-text-muted italic">
          Nothing matches those filters.{' '}
          <button
            type="button"
            onClick={clearFilters}
            className="text-forge-accent underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key}>
              {g.label !== null && (
                <h2 className="text-xs font-semibold text-forge-text-muted mb-2 uppercase tracking-wide">
                  {g.label} ({g.rows.length})
                </h2>
              )}
              <ul className="space-y-2">
                {g.rows.map((a) => {
                  const n = jeevesNarrate(a);
                  return (
                    <li key={a.task_id} className="text-sm">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-forge-text-primary font-medium">{n.headline}</span>
                        <span className="text-forge-text-muted text-xs">
                          — {formatRelativeTime(n.when)}
                          {n.where ? ` in ${n.where}` : ''}
                        </span>
                      </div>
                      <div
                        className="text-xs text-forge-text-muted mt-0.5 pl-4 border-l-2"
                        style={{ borderColor: `${JEEVES_COLOR}66` }}
                      >
                        {'↳ '}{n.why}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
