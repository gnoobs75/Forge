/**
 * <TodoPanel slug="expedition" />
 *
 * Collapsible panel that renders the project journal `todo.json` —
 * working punch list separate from agent-authored recommendations.
 *
 * Default state: EXPANDED (todos are working surface, more useful expanded).
 * Header: "TODO — N open"
 *
 * Each item: priority pill | category | title | summary | est min | blockedBy
 *
 * Sorted by priority (high → medium → low), then by `added` desc.
 *
 * Data via `hq:read-file` IPC. Empty / unwired state renders an EmptyState.
 *
 * See spec: `hq-data/projects/<slug>/todo.json` schemaVersion 1.
 *
 * W3·T12: Substep tree — each item may have agent substeps driven by
 * `stewardStatus.agentTodos.byParent[item.id]` from the Steward heartbeat.
 * Orphan banners appear when a crashed session left open substeps.
 * Untethered "Active agent sessions" section shows ad-hoc sessions at bottom.
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useStore } from '../../../store/useStore.js';
import {
    PanelCard,
    EmptyState,
    StatusPill,
    PALETTE,
} from '../_shared/primitives.jsx';
import { loadTodo } from './util/journalIo.js';
import NightShiftBadge from '../_shared/NightShiftBadge.jsx';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// Map todo priority → StatusPill kind. The pill uses error/warn/idle so red/
// amber/grey is exactly what the spec asked for.
const PRIORITY_PILL_STATUS = {
    high: 'error',
    medium: 'warn',
    low: 'idle',
};

// ─── Zustand v5 stable-reference constants ────────────────────────────────────
// CRITICAL: Zustand v5 + useSyncExternalStore triggers infinite re-renders when
// selectors return new object/array refs on every call. Use module-level consts
// as the fallback so the same reference is always returned when the store has
// no data.
const EMPTY_BY_PARENT = {};
const EMPTY_ORPHANS = [];
const EMPTY_UNTETHERED = [];

const selectByParent   = (s) => s.stewardStatus?.agentTodos?.byParent   ?? EMPTY_BY_PARENT;
const selectOrphans    = (s) => s.stewardStatus?.agentTodos?.orphans     ?? EMPTY_ORPHANS;
const selectUntethered = (s) => s.stewardStatus?.agentTodos?.untethered  ?? EMPTY_UNTETHERED;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format an ISO timestamp as a short relative-time string ("3m ago", "2h ago"). */
function relTime(isoStr) {
    if (!isoStr) return null;
    try {
        const diffMs = Date.now() - new Date(isoStr).getTime();
        const diffS = Math.round(diffMs / 1000);
        if (diffS < 60) return `${diffS}s ago`;
        const diffM = Math.round(diffS / 60);
        if (diffM < 60) return `${diffM}m ago`;
        const diffH = Math.round(diffM / 60);
        if (diffH < 24) return `${diffH}h ago`;
        const diffD = Math.round(diffH / 24);
        return `${diffD}d ago`;
    } catch {
        return null;
    }
}

// Status icon + colour for agent substeps
const SUBSTEP_ICONS = {
    completed:   { icon: '✓',  color: '#22C55E' },
    cancelled:   { icon: '✗',  color: PALETTE.textMuted },
    in_progress: { icon: '⏳', color: '#F59E0B' },
    pending:     { icon: '○',  color: PALETTE.textMuted },
};

function ChevronButton({ collapsed, onToggle, label }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} todo panel`}
            data-testid="todo-collapse-toggle"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                border: 'none',
                color: PALETTE.textMuted,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                padding: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                fontWeight: 600,
            }}
        >
            <span aria-hidden="true" style={{ fontSize: 11, color: PALETTE.accent, width: 12, display: 'inline-block' }}>
                {collapsed ? '▸' : '▾'}
            </span>
            <span>{label}</span>
        </button>
    );
}

// ─── OrphanBanner ─────────────────────────────────────────────────────────────

function OrphanBanner({ orphan }) {
    const openCount = (orphan.inProgress || 0) + (orphan.pending || 0);
    return (
        <div
            data-testid={`orphan-banner-${orphan.sessionId}`}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px 5px 22px',
                background: 'rgba(64, 41, 12, 0.35)',
                border: `1px solid ${PALETTE.warning}`,
                borderRadius: 4,
                marginBottom: 4,
                fontSize: 12,
                color: PALETTE.warning,
            }}
        >
            <span aria-hidden="true">⚠</span>
            <span style={{ flex: 1 }}>
                {openCount} unfinished substep{openCount !== 1 ? 's' : ''} from a crashed session
            </span>
            <button
                data-testid={`orphan-resume-${orphan.sessionId}`}
                onClick={() => window.electronAPI?.steward?.resumeOrphan(orphan.sessionId)}
                style={orphanBtnStyle('#F59E0B', 'rgba(120,80,0,0.3)')}
            >
                Resume
            </button>
            <button
                data-testid={`orphan-dismiss-${orphan.sessionId}`}
                onClick={() => window.electronAPI?.steward?.archiveOrphan(orphan.sessionId)}
                style={orphanBtnStyle(PALETTE.textMuted, 'rgba(255,255,255,0.04)')}
            >
                Dismiss
            </button>
        </div>
    );
}

function orphanBtnStyle(color, bg) {
    return {
        background: bg,
        border: `1px solid ${color}`,
        borderRadius: 3,
        color,
        cursor: 'pointer',
        fontSize: 11,
        fontFamily: 'inherit',
        fontWeight: 600,
        padding: '2px 8px',
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
    };
}

// ─── SubstepList ──────────────────────────────────────────────────────────────

function SubstepList({ substeps }) {
    return (
        <div data-testid="substep-list" style={{ paddingLeft: 22, paddingTop: 4, paddingBottom: 4 }}>
            {substeps.map((sub) => {
                const { icon, color } = SUBSTEP_ICONS[sub.status] || SUBSTEP_ICONS.pending;
                const ago = relTime(sub.lastTs);
                return (
                    <div
                        key={`${sub.sessionId}-${sub.id}`}
                        data-testid={`substep-item-${sub.id}`}
                        style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 6,
                            padding: '2px 0',
                            fontSize: 12,
                            color: sub.status === 'completed' ? PALETTE.textMuted : PALETTE.text,
                        }}
                    >
                        <span
                            aria-label={sub.status}
                            style={{ color, fontSize: 11, width: 14, flexShrink: 0, textAlign: 'center' }}
                        >
                            {icon}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span
                                style={{
                                    fontFamily: 'ui-monospace, monospace',
                                    color: PALETTE.textMuted,
                                    fontSize: 11,
                                    marginRight: 4,
                                }}
                            >
                                {sub.id}
                            </span>
                            {sub.title || '(untitled)'}
                        </span>
                        <span style={{ color: PALETTE.textMuted, fontSize: 11, flexShrink: 0 }}>
                            {sub.status === 'in_progress'
                                ? `in_progress · ${sub.sessionId ? sub.sessionId.slice(0, 16) : '—'}`
                                : ago
                                    ? `${sub.status} · ${ago}`
                                    : sub.status}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// ─── TodoRow ──────────────────────────────────────────────────────────────────

function TodoRow({ item, slug, onToggleEligibility, substepEntry, orphan }) {
    const pillStatus = PRIORITY_PILL_STATUS[item.priority] || 'idle';
    const hasSubsteps = substepEntry && substepEntry.items && substepEntry.items.length > 0;

    return (
        <div data-testid={`todo-item-${item.id}`}>
            {/* Main row grid */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '88px 140px 1fr 80px',
                    gap: 12,
                    padding: '10px 8px',
                    borderBottom: hasSubsteps || orphan ? 'none' : `1px solid ${PALETTE.border}`,
                    fontSize: 13,
                    lineHeight: 1.45,
                    alignItems: 'baseline',
                }}
            >
                <div>
                    <StatusPill
                        status={pillStatus}
                        label={(item.priority || 'low').toUpperCase()}
                        dense
                    />
                </div>
                <div
                    style={{
                        color: PALETTE.textMuted,
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                    title={item.category || ''}
                >
                    {item.category || '—'}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ color: PALETTE.text, fontWeight: 600, marginBottom: 2 }}>
                        <span
                            data-testid="todo-item-id"
                            style={{
                                color: PALETTE.textMuted,
                                fontFamily: 'ui-monospace, monospace',
                                fontSize: 12,
                                marginRight: 6,
                                fontWeight: 400,
                            }}
                        >
                            {item.id}
                        </span>
                        {item.title || '(untitled)'}
                    </div>
                    {item.summary ? (
                        <div style={{ color: PALETTE.textMuted, fontSize: 13, marginBottom: item.blockedBy ? 4 : 0 }}>
                            {item.summary}
                        </div>
                    ) : null}
                    {item.blockedBy ? (
                        <div
                            data-testid="todo-blocked-indicator"
                            style={{
                                color: PALETTE.warning,
                                fontSize: 11,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: 'rgba(64, 41, 12, 0.5)',
                                border: `1px solid ${PALETTE.warning}`,
                                borderRadius: 3,
                                padding: '2px 6px',
                            }}
                            title={`Blocked by ${item.blockedBy}`}
                        >
                            <span aria-hidden="true">⛔</span>
                            <span>blocked by {item.blockedBy}</span>
                        </div>
                    ) : null}
                    <div style={{ marginTop: 6 }}>
                        <NightShiftBadge
                            eligible={!!item.overnight_eligible}
                            verify={item.verify}
                            onToggle={onToggleEligibility ? () => onToggleEligibility(item.id, !item.overnight_eligible) : undefined}
                        />
                    </div>
                </div>
                <div
                    style={{
                        color: PALETTE.textMuted,
                        fontSize: 12,
                        textAlign: 'right',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    }}
                    title="Estimated minutes"
                >
                    {Number.isFinite(item.estimatedMinutes) ? `~${item.estimatedMinutes}m` : '—'}
                </div>
            </div>

            {/* Orphan banner + substep tree — rendered below the row when present */}
            {(orphan || hasSubsteps) ? (
                <div
                    style={{
                        borderBottom: `1px solid ${PALETTE.border}`,
                        paddingBottom: 6,
                        marginBottom: 0,
                    }}
                >
                    {orphan ? <OrphanBanner orphan={orphan} /> : null}
                    {hasSubsteps ? <SubstepList substeps={substepEntry.items} /> : null}
                </div>
            ) : null}
        </div>
    );
}

function sortItems(items) {
    return [...items].sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 99;
        const pb = PRIORITY_ORDER[b.priority] ?? 99;
        if (pa !== pb) return pa - pb;
        // Most recently added first within the same priority bucket.
        const da = a.added || '';
        const db = b.added || '';
        if (da !== db) return db.localeCompare(da);
        return (a.id || '').localeCompare(b.id || '');
    });
}

export default function TodoPanel({ slug, defaultCollapsed = false }) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const [state, setState] = useState({ status: 'loading', items: [], error: null });

    // ── Steward agent-todos data ─────────────────────────────────────────────
    // Use stable selectors + module-level fallback constants to avoid the
    // Zustand v5 + useSyncExternalStore infinite re-render trap.
    const byParent   = useStore(selectByParent);
    const orphans    = useStore(selectOrphans);
    const untethered = useStore(selectUntethered);

    const refresh = useCallback(async () => {
        if (!slug) {
            setState({ status: 'loaded', items: [], error: null });
            return;
        }
        setState((s) => ({ ...s, status: 'loading' }));
        const env = await loadTodo(slug);
        if (env.ok) {
            setState({ status: 'loaded', items: env.data.items || [], error: null });
        } else {
            setState({ status: 'error', items: [], error: env.error });
        }
    }, [slug]);

    const onToggleEligibility = useCallback(async (itemId, eligible) => {
        if (!window.electronAPI?.todos?.setEligibility || !slug) return;
        // (Wired in Phase 7 — no-op until then)
        // Optimistic update
        setState((s) => ({
            ...s,
            items: s.items.map((it) =>
                it.id === itemId ? { ...it, overnight_eligible: !!eligible } : it
            ),
        }));
        const result = await window.electronAPI.todos.setEligibility(slug, itemId, !!eligible);
        if (!result?.ok) {
            console.warn('[TodoPanel] setTodoEligibility failed:', result?.error);
            refresh();  // re-pull authoritative state
        }
    }, [slug, refresh]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const sortedItems = useMemo(() => sortItems(state.items), [state.items]);
    const headerLabel = `TODO — ${sortedItems.length} open`;

    return (
        <div data-testid="todo-panel" style={{ marginBottom: 12 }}>
            <PanelCard
                dense
                title={
                    <ChevronButton
                        collapsed={collapsed}
                        onToggle={() => setCollapsed((c) => !c)}
                        label={headerLabel}
                    />
                }
            >
                {collapsed ? null : (
                    <>
                        {state.status === 'loading' ? (
                            <div data-testid="todo-loading" style={{ padding: 16, color: PALETTE.textMuted, fontSize: 13 }}>
                                Loading todos…
                            </div>
                        ) : state.status === 'error' ? (
                            <EmptyState
                                icon="⚠"
                                title="Journal data unavailable"
                                body={state.error || 'IPC pending — restart Electron after wiring up hq:read-file.'}
                            />
                        ) : sortedItems.length === 0 ? (
                            <EmptyState
                                icon="✅"
                                title="Nothing on the punch list"
                                body="No open todos for this project. Add one by editing hq-data/projects/<slug>/todo.json."
                            />
                        ) : (
                            <div data-testid="todo-list" role="list">
                                {sortedItems.map((item, idx) => {
                                    // Look up substeps and orphan for this item.
                                    // byParent and orphans are stable refs — no new objects created here,
                                    // just property access. Derivation wrapped in useMemo below.
                                    const substepEntry = byParent[item.id] || null;
                                    const matchingOrphan = orphans.find(
                                        (o) => o.parent?.id === item.id,
                                    ) || null;
                                    return (
                                        <div role="listitem" key={`${item.id || 't'}-${idx}`}>
                                            <TodoRow
                                                item={item}
                                                slug={slug}
                                                onToggleEligibility={onToggleEligibility}
                                                substepEntry={substepEntry}
                                                orphan={matchingOrphan}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Untethered "Active agent sessions" section */}
                        {untethered.length > 0 && (
                            <details
                                data-testid="untethered-sessions"
                                style={{ marginTop: 14, paddingBottom: 6 }}
                            >
                                <summary
                                    style={{
                                        color: PALETTE.textMuted,
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        paddingLeft: 8,
                                        paddingTop: 4,
                                        paddingBottom: 4,
                                    }}
                                >
                                    Active agent sessions ({untethered.length})
                                </summary>
                                {untethered.map((s) => (
                                    <div
                                        key={s.sessionId}
                                        data-testid={`untethered-session-${s.sessionId}`}
                                        style={{
                                            paddingLeft: 16,
                                            paddingTop: 3,
                                            fontSize: 12,
                                            color: PALETTE.textMuted,
                                            fontFamily: 'ui-monospace, monospace',
                                        }}
                                    >
                                        {s.sessionId} · {s.openCount} open · {s.lastTitle || '—'}
                                    </div>
                                ))}
                            </details>
                        )}
                    </>
                )}
            </PanelCard>
        </div>
    );
}
