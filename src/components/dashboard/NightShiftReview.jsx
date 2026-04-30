import React, { useEffect } from 'react';
import { useStore } from '../../store/useStore.js';
import { PALETTE } from './_shared/primitives.jsx';
import TonightsPlanCard from './nightshift/TonightsPlanCard.jsx';

const selectRunLog = (s) => s.nightShiftRunLog;
const selectLoading = (s) => s.nightShiftRunLogLoading;
const selectLoad = (s) => s.loadNightShiftRunLog;

// Module-level constant + selector — avoids Zustand v5 + useSyncExternalStore re-render trap.
// Never return a new object reference from a selector; use a stable empty fallback instead.
const EMPTY_BY_PARENT = {};
const selectAgentTodosByParent = (s) => s.stewardStatus?.agentTodos?.byParent || EMPTY_BY_PARENT;

const TIER_COLORS = {
  T1: '#22c55e',
  T2: '#eab308',
  T3: '#f97316',
  T4: '#ef4444',
};

const STATUS_LABEL = {
  success: { color: '#22c55e', text: 'success' },
  parked: { color: '#ef4444', text: 'parked' },
  'blocked-overrun': { color: '#ef4444', text: 'blocked: overrun' },
  'blocked-verifier': { color: '#ef4444', text: 'blocked: verifier' },
  'blocked-needs-human': { color: '#ef4444', text: 'blocked: needs human' },
  'phase-deferred': { color: '#a3a3a3', text: 'deferred (T2/T3 v2)' },
};

function fmtTimestamp(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function fmtTokens(n) {
  if (typeof n !== 'number') return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function NightShiftReview() {
  const log = useStore(selectRunLog);
  const loading = useStore(selectLoading);
  const load = useStore(selectLoad);
  const byParent = useStore(selectAgentTodosByParent);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !log) {
    return (
      <div style={{ padding: 24, color: PALETTE.textMuted }}>
        Loading run log...
      </div>
    );
  }

  if (!log) {
    return (
      <div style={{ padding: 24, color: PALETTE.textMuted }}>
        <TonightsPlanCard />
        <h2 style={{ marginBottom: 12, color: PALETTE.text }}>Night Shift</h2>
        <p>No run logs yet. Friday&apos;s overnight foreman writes per-night results to <code>hq-data/.nightshift/runs/&lt;date&gt;.json</code>.</p>
      </div>
    );
  }

  const outcomes = Array.isArray(log.outcomes) ? log.outcomes : [];
  const queue = Array.isArray(log.queue) ? log.queue : [];

  // Group outcomes by tier
  const byTier = { T1: [], T2: [], T3: [] };
  for (const out of outcomes) {
    const tier = out.tier || 'T3';
    (byTier[tier] || (byTier[tier] = [])).push(out);
  }

  const successCount = outcomes.filter(o => o.status === 'success').length;
  const parkedCount = outcomes.filter(o => (o.status || '').startsWith('blocked') || o.status === 'parked').length;
  const deferredCount = outcomes.filter(o => o.status === 'phase-deferred').length;

  return (
    <div style={{ padding: 24, color: PALETTE.text }}>
      <TonightsPlanCard />
      <h2 style={{ marginBottom: 4 }}>Night Shift · {log._filename || ''}</h2>
      <p style={{ color: PALETTE.textMuted, fontSize: 13, marginBottom: 18 }}>
        Started {fmtTimestamp(log.started_at)} · Ended {fmtTimestamp(log.ended_at)} · Branch <code>{log.branch || '—'}</code>
      </p>

      {/* Count strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
        <Stat label="commits" value={outcomes.filter(o => o.commit).length} />
        <Stat label="success" value={successCount} color="#22c55e" />
        <Stat label="parked" value={parkedCount} color="#ef4444" />
        <Stat label="deferred" value={deferredCount} color="#a3a3a3" />
      </div>

      {/* Tokens bar */}
      {log.tokens_cap > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: PALETTE.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>tokens spent</span>
            <span style={{ color: PALETTE.textMuted }}>~{fmtTokens(log.tokens_total)} of {fmtTokens(log.tokens_cap)}</span>
          </div>
          <div style={{ height: 8, background: 'rgba(255,255,255,.06)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, Math.round((log.tokens_total / log.tokens_cap) * 100))}%`,
              background: '#d97706',
            }} />
          </div>
        </div>
      )}

      {/* Tier groups */}
      {(['T1', 'T2', 'T3']).map(tier => byTier[tier] && byTier[tier].length > 0 && (
        <div key={tier} style={{ marginBottom: 16 }}>
          <h3 style={{
            fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: TIER_COLORS[tier], marginBottom: 8,
          }}>
            {tier} · {byTier[tier].length} item{byTier[tier].length === 1 ? '' : 's'}
          </h3>
          {byTier[tier].map((out, i) => {
            const status = STATUS_LABEL[out.status] || { color: PALETTE.textMuted, text: out.status || 'unknown' };
            const substeps = out.ref_id ? byParent[out.ref_id]?.items : undefined;
            return (
              <div key={out.ref_filePath || i} style={{
                padding: '8px 12px',
                borderLeft: `4px solid ${status.color}`,
                background: 'rgba(255,255,255,.02)',
                marginBottom: 4,
                fontSize: 13,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <code style={{ color: PALETTE.textMuted, fontSize: 11 }}>{out.ref_filePath}</code>
                  <span style={{ color: status.color, fontSize: 11, fontWeight: 600 }}>{status.text}</span>
                </div>
                {out.reason && <div style={{ color: PALETTE.textMuted, fontSize: 12, marginTop: 4 }}>{out.reason}</div>}
                {out.commit && <div style={{ color: PALETTE.textMuted, fontSize: 11, marginTop: 4 }}>commit <code>{out.commit}</code></div>}
                {substeps && substeps.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 18 }}>
                    {substeps.map((step, si) => {
                      const icon = step.status === 'completed' ? '✓'
                                 : step.status === 'cancelled' ? '✗'
                                 : step.status === 'in_progress' ? '⏳'
                                 : '○';
                      const stepColor = step.status === 'completed' ? '#22c55e'
                                      : step.status === 'cancelled' ? PALETTE.textMuted
                                      : step.status === 'in_progress' ? '#eab308'
                                      : PALETTE.textMuted;
                      return (
                        <div key={step.id || si} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '2px 0' }}>
                          <span style={{ color: stepColor, width: 16, flexShrink: 0 }}>{icon}</span>
                          <span style={{ color: PALETTE.text }}>{step.title || step.id || 'untitled step'}</span>
                          {step.note && <span style={{ color: PALETTE.textMuted, fontStyle: 'italic' }}>· {step.note}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {out.parkedReason && (
                  <div style={{ color: PALETTE.text, fontSize: 12, marginTop: 6, fontStyle: 'italic' }}>
                    {out.parkedReason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Queue items that didn't run yet (queue length > outcomes length means foreman is still running or aborted) */}
      {queue.length > outcomes.length && (
        <div style={{ padding: 12, background: 'rgba(217,119,6,.08)', borderLeft: '4px solid #d97706', fontSize: 13, marginBottom: 16 }}>
          {queue.length - outcomes.length} queued item{queue.length - outcomes.length === 1 ? '' : 's'} not yet run.
        </div>
      )}

      <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
        <button
          type="button"
          style={{
            padding: '8px 16px',
            background: 'transparent',
            color: '#fca5a5',
            border: '1px solid #ef4444',
            borderRadius: 4,
            cursor: 'not-allowed',
            opacity: 0.7,
          }}
          disabled
          title="Manual branch deletion via terminal — UI control coming in Phase 3"
        >
          Discard whole night (manual git branch -D for now)
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{
      padding: 10,
      background: 'rgba(255,255,255,.04)',
      borderRadius: 4,
      border: `1px solid ${PALETTE.border || 'rgba(255,255,255,.08)'}`,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: color || PALETTE.text }}>{value}</div>
      <div style={{ fontSize: 10, color: PALETTE.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  );
}
