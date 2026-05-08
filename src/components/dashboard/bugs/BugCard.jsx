/**
 * <BugCard bug={bug} showProject?={false} />
 *
 * Shared card used by both <BugBoard> (per-project) and <StudioBugBoard>
 * (cross-project). Collapsed by default; clicking the header toggles to an
 * expanded view with description, screenshot, meta grid, comments, and an
 * action bar (status flow + assign + linked rec).
 *
 * All write actions go through Zustand store actions which PATCH
 * /api/bugs/:id; the chokidar watcher then refires loadBugs(). See design
 * doc §9.3 + §9.4.
 */

import React, { useState, useCallback } from 'react';
import { useStore } from '../../../store/useStore';
import { formatRelativeTime } from '../../../utils/formatRelativeTime';
import {
  STATUS_COLORS,
  SEVERITY_COLORS,
  STATUS_LABELS,
  SEVERITY_LABELS,
  CATEGORY_LABELS,
  COUNCIL_OWNERS,
  STATUS_FLOW,
} from './constants';

function Badge({ children, color, title }) {
  return (
    <span
      title={title}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border"
      style={{
        color,
        borderColor: `${color}55`,
        background: `${color}1A`,
      }}
    >
      {children}
    </span>
  );
}

function MetaCell({ label, value, title }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0" title={title}>
      <span className="text-[10px] uppercase tracking-wider text-forge-text-muted">
        {label}
      </span>
      <span className="text-xs text-forge-text-secondary truncate font-mono">
        {value || '—'}
      </span>
    </div>
  );
}

export default function BugCard({ bug, showProject = false }) {
  const [expanded, setExpanded] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);

  const projects = useStore((s) => s.projects);
  const projectName =
    projects.find((p) => p.slug === bug.project)?.name || bug.project;

  const statusColor = STATUS_COLORS[bug.status] || STATUS_COLORS.open;
  const severityColor = SEVERITY_COLORS[bug.severity] || SEVERITY_COLORS.medium;
  const categoryLabel = CATEGORY_LABELS[bug.category] || bug.category || 'Other';

  const onToggle = useCallback(() => setExpanded((e) => !e), []);

  const onStatusClick = useCallback(
    (newStatus) => {
      if (newStatus === bug.status) return;
      useStore.getState().updateBugStatus(bug.id, newStatus);
    },
    [bug.id, bug.status]
  );

  const onAssignChange = useCallback(
    (e) => {
      const value = e.target.value;
      useStore.getState().assignBug(bug.id, value || null);
    },
    [bug.id]
  );

  const onSubmitComment = useCallback(
    async (e) => {
      e.preventDefault();
      const text = commentDraft.trim();
      if (!text) return;
      setCommentBusy(true);
      try {
        await useStore.getState().addBugComment(bug.id, { author: 'Boss', text });
        setCommentDraft('');
      } finally {
        setCommentBusy(false);
      }
    },
    [bug.id, commentDraft]
  );

  const [sessionStatus, setSessionStatus] = useState(null); // null | 'opening' | 'queued' | 'error'
  const onOpenSession = useCallback(async () => {
    if (!bug.assignedTo) return;
    setSessionStatus('opening');
    try {
      const result = await useStore.getState().spawnBugSession(bug.id);
      if (!result?.ok) setSessionStatus('error');
      else if (result.status === 'queued') setSessionStatus('queued');
      else setSessionStatus(null);
    } catch {
      setSessionStatus('error');
    }
    // Auto-clear non-error states after 2s; let errors linger.
    if (sessionStatus !== 'error') {
      setTimeout(() => setSessionStatus(null), 2000);
    }
  }, [bug.id, bug.assignedTo, sessionStatus]);

  // Re-run = clear the autoFixAttempted gate + set autoFixRequested:true.
  // The auto-fix rule sees the file change, picks up autoFixRequested, runs.
  // Useful for bugs that failed for infrastructure reasons (missing claude
  // binary, no verifyCommand) — boss fixes the underlying cause and clicks
  // Re-run rather than re-filing.
  const onRetryAutoFix = useCallback(async () => {
    await useStore.getState().retryBugAutoFix(bug.id);
  }, [bug.id]);

  return (
    <div
      data-testid={`bug-card-${bug.id}`}
      className="rounded-lg border border-forge-border bg-forge-bg-elevated overflow-hidden hover:border-forge-accent/30 transition-colors"
    >
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-forge-bg/30 transition-colors"
      >
        {/* Severity dot */}
        <span
          aria-hidden="true"
          className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
          style={{ background: severityColor, boxShadow: `0 0 6px ${severityColor}66` }}
          title={`Severity: ${SEVERITY_LABELS[bug.severity] || bug.severity}`}
        />

        {/* Title + id */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-medium text-forge-text-primary truncate">
              {bug.title || '(untitled)'}
            </span>
            <span className="text-[10px] font-mono text-forge-text-muted flex-shrink-0">
              {bug.id}
            </span>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge color={statusColor} title="Status">
            {STATUS_LABELS[bug.status] || bug.status}
          </Badge>
          <Badge color={severityColor} title="Severity">
            {SEVERITY_LABELS[bug.severity] || bug.severity}
          </Badge>
          <Badge color="#94A3B8" title="Category">
            {categoryLabel}
          </Badge>
          {showProject && (
            <Badge color="#0EA5E9" title={`Project: ${projectName}`}>
              {projectName}
            </Badge>
          )}
        </div>

        {/* Age + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="text-[10px] text-forge-text-muted font-mono"
            title={bug.createdAt}
          >
            {formatRelativeTime(bug.createdAt)}
          </span>
          <span className="text-forge-text-muted text-xs w-3 text-center">
            {expanded ? '▴' : '▾'}
          </span>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-forge-border/60 p-4 space-y-4">
          {/* Description */}
          {bug.description && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-forge-text-muted mb-1">
                Description
              </div>
              <div className="text-sm text-forge-text-secondary whitespace-pre-wrap leading-relaxed">
                {bug.description}
              </div>
            </div>
          )}

          {/* Steps to reproduce */}
          {bug.stepsToReproduce && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-forge-text-muted mb-1">
                Steps to Reproduce
              </div>
              <div className="text-sm text-forge-text-secondary whitespace-pre-wrap leading-relaxed font-mono">
                {bug.stepsToReproduce}
              </div>
            </div>
          )}

          {/* Screenshot */}
          {bug.screenshotBase64 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-forge-text-muted mb-1">
                Screenshot
              </div>
              <img
                src={bug.screenshotBase64}
                alt={`Screenshot for ${bug.id}`}
                className="max-w-full rounded border border-forge-border"
              />
            </div>
          )}

          {/* Meta grid */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-forge-text-muted mb-2">
              Metadata
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <MetaCell label="Page Route" value={bug.pageRoute} />
              <MetaCell label="Environment" value={bug.environment} />
              <MetaCell label="Browser" value={bug.browserInfo} title={bug.browserInfo} />
              <MetaCell label="Reported By" value={bug.reportedBy} />
              <MetaCell
                label="Created"
                value={formatRelativeTime(bug.createdAt)}
                title={bug.createdAt}
              />
              <MetaCell
                label="Updated"
                value={formatRelativeTime(bug.updatedAt)}
                title={bug.updatedAt}
              />
            </div>
          </div>

          {/* Comments thread */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-forge-text-muted mb-2">
              Comments ({(bug.comments || []).length})
            </div>
            {(bug.comments || []).length === 0 ? (
              <div className="text-xs text-forge-text-muted italic">
                No comments yet.
              </div>
            ) : (
              <div className="space-y-2">
                {(bug.comments || []).map((c, i) => (
                  <div
                    key={`${c.timestamp || 'c'}-${i}`}
                    className="p-2 rounded border border-forge-border/60 bg-forge-bg/50"
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-forge-accent uppercase tracking-wide">
                        {c.author || 'unknown'}
                      </span>
                      <span
                        className="text-[10px] text-forge-text-muted font-mono"
                        title={c.timestamp}
                      >
                        {formatRelativeTime(c.timestamp)}
                      </span>
                    </div>
                    <div className="text-xs text-forge-text-secondary whitespace-pre-wrap">
                      {c.text}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment */}
            <form onSubmit={onSubmitComment} className="mt-2 flex flex-col gap-2">
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Add a comment…"
                rows={2}
                className="w-full px-2 py-1.5 text-xs rounded border border-forge-border bg-forge-bg text-forge-text-primary placeholder:text-forge-text-muted focus:outline-none focus:border-forge-accent/60 resize-y"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={commentBusy || !commentDraft.trim()}
                  className="px-3 py-1 text-xs rounded border border-forge-accent/40 bg-forge-accent/10 text-forge-accent hover:bg-forge-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {commentBusy ? 'Posting…' : 'Submit'}
                </button>
              </div>
            </form>
          </div>

          {/* Action bar */}
          <div className="border-t border-forge-border/60 pt-3 flex flex-wrap items-center gap-3">
            {/* Status flow */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase tracking-wider text-forge-text-muted mr-1">
                Status:
              </span>
              {STATUS_FLOW.map((s) => {
                const active = s === bug.status;
                const color = STATUS_COLORS[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onStatusClick(s)}
                    disabled={active}
                    className="px-2 py-1 text-[11px] rounded border transition-colors disabled:cursor-default"
                    style={
                      active
                        ? {
                            color,
                            borderColor: color,
                            background: `${color}26`,
                            fontWeight: 600,
                          }
                        : {
                            color: '#94A3B8',
                            borderColor: '#334155',
                            background: 'transparent',
                          }
                    }
                  >
                    {STATUS_LABELS[s]}
                  </button>
                );
              })}
              {/* Won't Fix — separate red-tinted button */}
              {(() => {
                const s = 'wontfix';
                const active = s === bug.status;
                const color = '#EF4444';
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onStatusClick(s)}
                    disabled={active}
                    className="px-2 py-1 text-[11px] rounded border ml-2 transition-colors disabled:cursor-default"
                    style={
                      active
                        ? {
                            color,
                            borderColor: color,
                            background: `${color}26`,
                            fontWeight: 600,
                          }
                        : {
                            color: '#F87171',
                            borderColor: '#7F1D1D',
                            background: 'transparent',
                          }
                    }
                  >
                    {STATUS_LABELS.wontfix}
                  </button>
                );
              })()}
            </div>

            {/* Assign dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-forge-text-muted">
                Assign:
              </span>
              <select
                value={bug.assignedTo || ''}
                onChange={onAssignChange}
                className="px-2 py-1 text-[11px] rounded border border-forge-border bg-forge-bg text-forge-text-primary focus:outline-none focus:border-forge-accent/60"
              >
                <option value="">Unassign</option>
                {COUNCIL_OWNERS.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
            </div>

            {/* Linked recommendation (display-only) */}
            {bug.recommendationId && (
              <div className="text-[11px] text-forge-text-muted font-mono">
                → rec: <span className="text-forge-accent">{bug.recommendationId}</span>
              </div>
            )}

            {/* Open Session — interactive boss-driven path. Spawns a Friday
                agent PTY scoped to this bug with the full instruction
                pre-loaded. Disabled when unassigned (the engine needs an
                agent to dispatch to) or when terminal: closed/wontfix.
                Re-run sits next to it for bugs whose auto-fix failed for
                infrastructure reasons. */}
            {bug.status !== 'closed' && bug.status !== 'wontfix' && (
              <div className="ml-auto flex items-center gap-2">
                {sessionStatus === 'queued' && (
                  <span className="text-[10px] text-forge-text-muted">queued — slot busy</span>
                )}
                {sessionStatus === 'error' && (
                  <span className="text-[10px] text-red-400">spawn failed — see console</span>
                )}
                {bug.status === 'open' && bug.autoFixAttempted === true && (
                  <button
                    type="button"
                    onClick={onRetryAutoFix}
                    title="Clear the autoFixAttempted gate so the auto-fix engine retries on the next chokidar tick"
                    className="px-2 py-1 text-[11px] font-medium rounded border transition-colors
                               border-forge-border text-forge-text-muted hover:border-forge-accent/40 hover:text-forge-accent"
                  >
                    {'↻'} Re-run
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenSession}
                  disabled={!bug.assignedTo || sessionStatus === 'opening'}
                  title={!bug.assignedTo
                    ? 'Assign a Council agent first'
                    : 'Spawn an interactive Claude session pre-loaded with this bug'}
                  className="px-3 py-1 text-[11px] font-medium rounded border transition-colors
                             border-forge-border text-forge-text-primary hover:border-forge-accent/40 hover:text-forge-accent
                             disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-forge-border disabled:hover:text-forge-text-primary"
                >
                  {sessionStatus === 'opening' ? 'Opening…' : 'Open Session'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
