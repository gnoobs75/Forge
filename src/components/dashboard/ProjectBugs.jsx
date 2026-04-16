import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { playSound } from '../../utils/sounds';

const SEVERITY_CONFIG = {
  critical: { color: '#EF4444', bg: '#EF444420', label: 'Critical', dot: '#EF4444' },
  high:     { color: '#F97316', bg: '#F9731620', label: 'High',     dot: '#F97316' },
  medium:   { color: '#EAB308', bg: '#EAB30820', label: 'Medium',   dot: '#EAB308' },
  low:      { color: '#22C55E', bg: '#22C55E20', label: 'Low',      dot: '#22C55E' },
};

const STATUS_CONFIG = {
  open:     { color: '#EF4444', bg: '#EF444415', label: 'Open' },
  triaged:  { color: '#A855F7', bg: '#A855F715', label: 'Triaged' },
  fixing:   { color: '#3B82F6', bg: '#3B82F615', label: 'Fixing' },
  resolved: { color: '#22C55E', bg: '#22C55E15', label: 'Resolved' },
  verified: { color: '#06B6D4', bg: '#06B6D415', label: 'Verified' },
  closed:   { color: '#64748B', bg: '#64748B15', label: 'Closed' },
};

const CATEGORY_LABELS = {
  ui: 'UI',
  api: 'API',
  auth: 'Auth',
  performance: 'Perf',
  data: 'Data',
  security: 'Security',
  ux: 'UX',
  integration: 'Integration',
  other: 'Other',
};

const STATUS_FLOW = ['open', 'triaged', 'fixing', 'resolved', 'verified', 'closed'];

const AGENTS = [
  { id: 'solutions-architect', name: 'Solutions Architect' },
  { id: 'backend-engineer', name: 'Backend Engineer' },
  { id: 'frontend-engineer', name: 'Frontend Engineer' },
  { id: 'devops-engineer', name: 'DevOps Engineer' },
  { id: 'data-engineer', name: 'Data Engineer' },
  { id: 'security-auditor', name: 'Security Auditor' },
  { id: 'qa-lead', name: 'QA Lead' },
  { id: 'performance-engineer', name: 'Performance Engineer' },
];

export default function ProjectBugs({ slug }) {
  const [bugs, setBugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedBug, setExpandedBug] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadBugs = useCallback(async () => {
    if (!window.electronAPI?.hq) {
      setLoading(false);
      return;
    }
    try {
      const dirRes = await window.electronAPI.hq.readDir(`projects/${slug}/bugs`);
      if (!dirRes.ok) {
        setLoading(false);
        return;
      }
      const files = dirRes.data
        .filter(e => !e.isDirectory && e.name.endsWith('.json'))
        .map(e => e.name);

      const bugData = [];
      for (const file of files) {
        const res = await window.electronAPI.hq.readFile(`projects/${slug}/bugs/${file}`);
        if (res.ok) {
          try {
            const parsed = JSON.parse(res.data);
            parsed._fileName = file;
            bugData.push(parsed);
          } catch {}
        }
      }
      // Sort by createdAt descending
      bugData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setBugs(bugData);
    } catch (err) {
      console.error('[ProjectBugs] Load error:', err);
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    loadBugs();
  }, [loadBugs]);

  // Stats
  const stats = useMemo(() => {
    const s = { open: 0, triaged: 0, fixing: 0, resolved: 0, verified: 0, closed: 0, total: bugs.length };
    bugs.forEach(b => { if (s[b.status] !== undefined) s[b.status]++; });
    return s;
  }, [bugs]);

  // Filtered bugs
  const filtered = useMemo(() => {
    return bugs.filter(b => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (severityFilter !== 'all' && b.severity !== severityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (b.title || '').toLowerCase().includes(q) ||
          (b.id || '').toLowerCase().includes(q) ||
          (b.description || '').toLowerCase().includes(q) ||
          (b.pageRoute || '').toLowerCase().includes(q) ||
          (b.tags || []).some(t => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [bugs, statusFilter, severityFilter, search]);

  // Open bug count for external use
  const openCount = stats.open + stats.triaged + stats.fixing;

  const updateBugStatus = async (bug, newStatus) => {
    if (!window.electronAPI?.hq?.writeFile) return;
    const updated = {
      ...bug,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };
    if (newStatus === 'resolved') {
      updated.resolvedAt = new Date().toISOString();
    }
    // Remove internal fields before saving
    const { _fileName, ...toSave } = updated;
    try {
      const res = await window.electronAPI.hq.writeFile(
        `projects/${slug}/bugs/${bug._fileName}`,
        JSON.stringify(toSave, null, 2)
      );
      if (res.ok !== false) {
        // Update local state
        setBugs(prev => prev.map(b => b.id === bug.id ? updated : b));
        playSound('click');
      }
    } catch (err) {
      console.error('[ProjectBugs] Write error:', err);
    }
  };

  const updateBugAssignment = async (bug, assignedTo) => {
    if (!window.electronAPI?.hq?.writeFile) return;
    const updated = {
      ...bug,
      assignedTo,
      updatedAt: new Date().toISOString(),
    };
    const { _fileName, ...toSave } = updated;
    try {
      const res = await window.electronAPI.hq.writeFile(
        `projects/${slug}/bugs/${bug._fileName}`,
        JSON.stringify(toSave, null, 2)
      );
      if (res.ok !== false) {
        setBugs(prev => prev.map(b => b.id === bug.id ? updated : b));
        playSound('click');
      }
    } catch (err) {
      console.error('[ProjectBugs] Write error:', err);
    }
  };

  if (loading) {
    return (
      <div className="card text-center py-12">
        <div className="text-sm text-forge-text-muted">Loading bugs...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
        <StatBadge label="Open" count={stats.open} color="#EF4444" />
        <StatBadge label="Triaged" count={stats.triaged} color="#A855F7" />
        <StatBadge label="Fixing" count={stats.fixing} color="#3B82F6" />
        <StatBadge label="Resolved" count={stats.resolved} color="#22C55E" />
        <StatBadge label="Verified" count={stats.verified} color="#06B6D4" />
        <StatBadge label="Total" count={stats.total} color="#94A3B8" />
      </div>

      {/* Filter Row */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-forge-text-muted uppercase tracking-wider">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-forge-bg border border-forge-border rounded px-2 py-1 text-forge-text-secondary
                         focus:outline-none focus:border-forge-accent-blue/50"
            >
              <option value="all">All</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-forge-text-muted uppercase tracking-wider">Severity</label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="text-xs bg-forge-bg border border-forge-border rounded px-2 py-1 text-forge-text-secondary
                         focus:outline-none focus:border-forge-accent-blue/50"
            >
              <option value="all">All</option>
              {Object.entries(SEVERITY_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[160px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bugs..."
              className="w-full text-xs bg-forge-bg border border-forge-border rounded px-3 py-1.5 text-forge-text-secondary
                         placeholder:text-forge-text-muted/50 focus:outline-none focus:border-forge-accent-blue/50"
            />
          </div>

          <button
            onClick={() => { loadBugs(); playSound('click'); }}
            className="text-[10px] text-forge-text-muted hover:text-forge-text-secondary transition-colors px-2 py-1"
            title="Refresh"
          >
            Reload
          </button>
        </div>
      </div>

      {/* Bug List */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-3xl mb-2 opacity-30">{bugs.length === 0 ? '\uD83D\uDC1B' : '\uD83D\uDD0D'}</div>
          <p className="text-sm text-forge-text-muted">
            {bugs.length === 0 ? 'No bugs reported yet' : 'No bugs match your filters'}
          </p>
          {bugs.length === 0 && (
            <p className="text-xs text-forge-text-muted mt-1">
              Bug reports will appear here when submitted
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(bug => (
            <BugCard
              key={bug.id}
              bug={bug}
              expanded={expandedBug === bug.id}
              onToggle={() => {
                setExpandedBug(expandedBug === bug.id ? null : bug.id);
                playSound('click');
              }}
              onStatusChange={updateBugStatus}
              onAssign={updateBugAssignment}
              slug={slug}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export a helper to get the open bug count externally
export async function getOpenBugCount(slug) {
  if (!window.electronAPI?.hq) return 0;
  try {
    const dirRes = await window.electronAPI.hq.readDir(`projects/${slug}/bugs`);
    if (!dirRes.ok) return 0;
    const files = dirRes.data.filter(e => !e.isDirectory && e.name.endsWith('.json'));
    let count = 0;
    for (const file of files) {
      const res = await window.electronAPI.hq.readFile(`projects/${slug}/bugs/${file.name}`);
      if (res.ok) {
        try {
          const b = JSON.parse(res.data);
          if (b.status === 'open' || b.status === 'triaged' || b.status === 'fixing') count++;
        } catch {}
      }
    }
    return count;
  } catch { return 0; }
}

/* ── Sub-components ── */

function StatBadge({ label, count, color }) {
  return (
    <div
      className="rounded-lg border border-forge-border/50 px-3 py-2 text-center"
      style={{ backgroundColor: count > 0 ? `${color}08` : undefined }}
    >
      <div className="text-lg font-mono font-bold" style={{ color: count > 0 ? color : '#64748b' }}>
        {count}
      </div>
      <div className="text-[10px] text-forge-text-muted uppercase tracking-wider">{label}</div>
    </div>
  );
}

function BugCard({ bug, expanded, onToggle, onStatusChange, onAssign, slug }) {
  const sev = SEVERITY_CONFIG[bug.severity] || SEVERITY_CONFIG.medium;
  const stat = STATUS_CONFIG[bug.status] || STATUS_CONFIG.open;
  const catLabel = CATEGORY_LABELS[bug.category] || bug.category || 'Other';
  const currentStatusIdx = STATUS_FLOW.indexOf(bug.status);

  return (
    <div
      className={`card p-0 overflow-hidden transition-all ${
        expanded ? 'ring-1 ring-forge-accent-blue/20' : ''
      }`}
    >
      {/* Card header — clickable */}
      <div
        className="p-3 cursor-pointer hover:bg-forge-surface-hover/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start gap-3">
          {/* Severity dot */}
          <div className="flex-shrink-0 mt-1">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: sev.dot }}
              title={`Severity: ${sev.label}`}
            />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-forge-text-primary leading-tight">
                {bug.title}
              </span>
              <span className="text-[10px] font-mono text-forge-text-muted/60">
                {bug.id}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {/* Status badge */}
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: stat.bg, color: stat.color }}
              >
                {stat.label}
              </span>

              {/* Severity badge */}
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: sev.bg, color: sev.color }}
              >
                {sev.label}
              </span>

              {/* Category badge */}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-forge-surface-hover text-forge-text-secondary">
                {catLabel}
              </span>

              {/* Tags */}
              {(bug.tags || []).map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] text-forge-text-muted bg-forge-bg"
                >
                  #{tag}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-forge-text-muted">
              {bug.reportedBy && (
                <span>Reported by {bug.reportedBy}</span>
              )}
              {bug.pageRoute && (
                <span className="font-mono">{bug.pageRoute}</span>
              )}
              {bug.createdAt && (
                <span>{formatRelativeTime(bug.createdAt)}</span>
              )}
              {bug.assignedTo && (
                <span className="text-forge-accent-blue">
                  Assigned: {bug.assignedTo}
                </span>
              )}
            </div>
          </div>

          {/* Expand indicator */}
          <div className="flex-shrink-0">
            <span
              className="text-forge-text-muted text-xs inline-block transition-transform duration-200"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              {'\u25BC'}
            </span>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-forge-border/50 p-4 space-y-4 animate-fade-in">
          {/* Description */}
          {bug.description && (
            <div>
              <div className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider mb-1.5">
                Description
              </div>
              <p className="text-sm text-forge-text-secondary leading-relaxed whitespace-pre-wrap">
                {bug.description}
              </p>
            </div>
          )}

          {/* Steps to Reproduce */}
          {bug.stepsToReproduce && (
            <div>
              <div className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider mb-1.5">
                Steps to Reproduce
              </div>
              <div className="p-3 rounded-lg bg-forge-bg/50 border border-forge-border/30">
                <pre className="text-xs text-forge-text-secondary whitespace-pre-wrap leading-relaxed font-mono">
                  {bug.stepsToReproduce}
                </pre>
              </div>
            </div>
          )}

          {/* Meta info row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetaField label="Environment" value={bug.environment || 'N/A'} />
            <MetaField label="Page" value={bug.pageTitle || bug.pageRoute || 'N/A'} />
            <MetaField label="Priority" value={bug.priority || 'N/A'} />
            <MetaField label="Created" value={bug.createdAt ? new Date(bug.createdAt).toLocaleDateString() : 'N/A'} />
          </div>

          {/* Browser info */}
          {bug.browserInfo && (
            <div>
              <div className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider mb-1">
                Browser
              </div>
              <div className="text-[10px] text-forge-text-muted font-mono truncate">
                {bug.browserInfo}
              </div>
            </div>
          )}

          {/* Screenshot */}
          <ScreenshotPreview slug={slug} bugId={bug.id} />

          {/* Resolution info */}
          {bug.resolution && (
            <div className="p-3 rounded-lg bg-green-400/5 border border-green-400/20">
              <div className="text-[10px] font-mono text-green-400 uppercase tracking-wider mb-1">
                Resolution
              </div>
              <p className="text-sm text-forge-text-secondary">{bug.resolution}</p>
            </div>
          )}

          {/* Comments */}
          {bug.comments && bug.comments.length > 0 && (
            <div>
              <div className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider mb-2">
                Comments ({bug.comments.length})
              </div>
              <div className="space-y-2">
                {bug.comments.map((comment, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-forge-bg/50 border border-forge-border/30">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-forge-text-secondary">
                        {comment.author || 'Unknown'}
                      </span>
                      <span className="text-[10px] text-forge-text-muted">
                        {comment.timestamp ? formatRelativeTime(comment.timestamp) : ''}
                      </span>
                    </div>
                    <p className="text-xs text-forge-text-secondary leading-relaxed">{comment.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-forge-border/30 space-y-3">
            {/* Status progression buttons */}
            <div>
              <div className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider mb-2">
                Change Status
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {STATUS_FLOW.map((st, idx) => {
                  const cfg = STATUS_CONFIG[st];
                  const isCurrent = bug.status === st;
                  const isNext = idx === currentStatusIdx + 1;
                  return (
                    <button
                      key={st}
                      onClick={() => onStatusChange(bug, st)}
                      disabled={isCurrent}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
                        ${isCurrent
                          ? 'opacity-100 cursor-default ring-1'
                          : isNext
                          ? 'hover:opacity-90'
                          : 'opacity-50 hover:opacity-75'
                        }
                        disabled:cursor-default`}
                      style={{
                        backgroundColor: isCurrent ? cfg.bg : `${cfg.color}08`,
                        color: cfg.color,
                        borderColor: isCurrent ? cfg.color : `${cfg.color}30`,
                        ringColor: isCurrent ? cfg.color : undefined,
                      }}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Assign to Agent */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider">
                  Assign to Agent
                </label>
                <select
                  value={bug.assignedTo || ''}
                  onChange={(e) => onAssign(bug, e.target.value)}
                  className="text-xs bg-forge-bg border border-forge-border rounded px-2 py-1 text-forge-text-secondary
                             focus:outline-none focus:border-forge-accent-blue/50"
                >
                  <option value="">Unassigned</option>
                  {AGENTS.map(a => (
                    <option key={a.id} value={a.name}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Linked recommendation */}
            {bug.recommendationId && (
              <div className="text-[10px] text-forge-text-muted">
                Linked recommendation: <span className="text-forge-accent-blue font-mono">{bug.recommendationId}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaField({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-xs text-forge-text-secondary truncate">{value}</div>
    </div>
  );
}

function ScreenshotPreview({ slug, bugId }) {
  const [screenshotUrl, setScreenshotUrl] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked || !window.electronAPI?.hq) return;
    setChecked(true);
    // Check for common screenshot formats
    const checkScreenshot = async () => {
      const extensions = ['.png', '.jpg', '.jpeg', '.webp'];
      for (const ext of extensions) {
        const path = `projects/${slug}/bugs/screenshots/${bugId}${ext}`;
        const res = await window.electronAPI.hq.readFile(path);
        if (res.ok) {
          // We found a screenshot — but we can't display raw binary easily.
          // Just show an indicator that a screenshot exists.
          setScreenshotUrl(path);
          break;
        }
      }
    };
    checkScreenshot();
  }, [slug, bugId, checked]);

  if (!screenshotUrl) return null;

  return (
    <div>
      <div className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider mb-1.5">
        Screenshot
      </div>
      <div className="p-3 rounded-lg bg-forge-bg/50 border border-forge-border/30 flex items-center gap-2">
        <span className="text-sm">{'\uD83D\uDDBC'}</span>
        <span className="text-xs text-forge-text-secondary font-mono">{screenshotUrl.split('/').pop()}</span>
        <button
          onClick={() => {
            if (window.electronAPI?.hq?.showInFolder) {
              window.electronAPI.hq.showInFolder(screenshotUrl);
            }
          }}
          className="text-[10px] text-forge-accent-blue hover:underline ml-auto"
        >
          Open in folder
        </button>
      </div>
    </div>
  );
}
