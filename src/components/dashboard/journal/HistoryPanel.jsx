/**
 * <HistoryPanel slug="expedition" />
 *
 * Collapsible panel that renders the project journal `history.json` —
 * append-only log of resolved recommendations + significant events.
 *
 * Default state: COLLAPSED (so it doesn't dominate the dashboard).
 * Header: "History — N resolved"
 *
 * Each entry: date | agent | title | summary
 *   - Top 10 by default, "Show all" expands to full list.
 *
 * Data via `hq:read-file` IPC. Empty / unwired state renders an EmptyState.
 *
 * See spec: `hq-data/projects/<slug>/history.json` schemaVersion 1.
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    PanelCard,
    EmptyState,
    Button,
    PALETTE,
} from '../_shared/primitives.jsx';
import { loadHistory } from './util/journalIo.js';

const DEFAULT_VISIBLE = 10;

function ChevronButton({ collapsed, onToggle, label }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} history panel`}
            data-testid="history-collapse-toggle"
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

function HistoryRow({ entry }) {
    return (
        <div
            data-testid={`history-entry-${entry.id}`}
            style={{
                display: 'grid',
                gridTemplateColumns: '96px 140px 1fr',
                gap: 12,
                padding: '10px 8px',
                borderBottom: `1px solid ${PALETTE.border}`,
                fontSize: 13,
                lineHeight: 1.45,
                alignItems: 'baseline',
            }}
        >
            <div
                style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    color: PALETTE.textMuted,
                    fontSize: 12,
                }}
            >
                {entry.date || '—'}
            </div>
            <div
                style={{
                    color: PALETTE.accent,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
                title={entry.agent || ''}
            >
                {entry.agent || 'unknown'}
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{ color: PALETTE.text, fontWeight: 500, marginBottom: 2 }}>
                    <span data-testid="history-entry-id" style={{ color: PALETTE.textMuted, fontFamily: 'ui-monospace, monospace', fontSize: 12, marginRight: 6 }}>
                        {entry.id}
                    </span>
                    {entry.title || '(untitled)'}
                </div>
                {entry.summary ? (
                    <div style={{ color: PALETTE.textMuted, fontSize: 13 }}>
                        {entry.summary}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export default function HistoryPanel({ slug, defaultCollapsed = true }) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const [showAll, setShowAll] = useState(false);
    const [state, setState] = useState({ status: 'loading', entries: [], error: null });

    const refresh = useCallback(async () => {
        if (!slug) {
            setState({ status: 'loaded', entries: [], error: null });
            return;
        }
        setState((s) => ({ ...s, status: 'loading' }));
        const env = await loadHistory(slug);
        if (env.ok) {
            setState({ status: 'loaded', entries: env.data.entries || [], error: null });
        } else {
            setState({ status: 'error', entries: [], error: env.error });
        }
    }, [slug]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const totalCount = state.entries.length;
    const visibleEntries = useMemo(() => {
        if (showAll) return state.entries;
        return state.entries.slice(0, DEFAULT_VISIBLE);
    }, [state.entries, showAll]);

    const headerLabel = `History — ${totalCount} resolved`;

    return (
        <div data-testid="history-panel" style={{ marginBottom: 12 }}>
            <PanelCard
                dense
                title={
                    <ChevronButton
                        collapsed={collapsed}
                        onToggle={() => setCollapsed((c) => !c)}
                        label={headerLabel}
                    />
                }
                right={
                    !collapsed && totalCount > DEFAULT_VISIBLE ? (
                        <Button
                            variant="ghost"
                            onClick={() => setShowAll((s) => !s)}
                            data-testid="history-show-all"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                        >
                            {showAll ? 'Show recent' : `Show all (${totalCount})`}
                        </Button>
                    ) : null
                }
            >
                {collapsed ? null : (
                    <>
                        {state.status === 'loading' ? (
                            <div data-testid="history-loading" style={{ padding: 16, color: PALETTE.textMuted, fontSize: 13 }}>
                                Loading history…
                            </div>
                        ) : state.status === 'error' ? (
                            <EmptyState
                                icon="⚠"
                                title="Journal data unavailable"
                                body={state.error || 'IPC pending — restart Electron after wiring up hq:read-file.'}
                            />
                        ) : visibleEntries.length === 0 ? (
                            <EmptyState
                                icon="📒"
                                title="No history yet"
                                body="Resolved recommendations will land here once the project ships its first journal entry."
                            />
                        ) : (
                            <div data-testid="history-list" role="list">
                                {visibleEntries.map((entry, idx) => (
                                    <div role="listitem" key={`${entry.id || 'h'}-${idx}`}>
                                        <HistoryRow entry={entry} />
                                    </div>
                                ))}
                                {!showAll && totalCount > DEFAULT_VISIBLE ? (
                                    <div
                                        data-testid="history-truncated-hint"
                                        style={{
                                            padding: '10px 8px',
                                            color: PALETTE.textMuted,
                                            fontSize: 12,
                                            textAlign: 'center',
                                        }}
                                    >
                                        + {totalCount - DEFAULT_VISIBLE} earlier entries hidden — click "Show all" above.
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </>
                )}
            </PanelCard>
        </div>
    );
}
