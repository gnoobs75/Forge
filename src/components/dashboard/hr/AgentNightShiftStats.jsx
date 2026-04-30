import React, { useEffect, useMemo } from 'react';
import { useStore } from '../../../store/useStore.js';
import { PALETTE } from '../_shared/primitives.jsx';

// HR Director card — per-agent Night Shift accept/park/defer aggregation.
// Shows park rate over a rolling 7-day window so the HR Director can spot
// agents whose recs consistently fail the foreman's verifiers.

const HEADER_STYLE = {
  fontSize: 10,
  color: PALETTE.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 600,
  padding: '6px 8px',
  borderBottom: `1px solid ${PALETTE.border}`,
  textAlign: 'left',
};

const CELL_STYLE = {
  padding: '6px 8px',
  fontSize: 12,
  borderBottom: `1px solid ${PALETTE.border}`,
  color: PALETTE.text,
  verticalAlign: 'middle',
};

const CELL_NUM_STYLE = {
  ...CELL_STYLE,
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
};

function formatLastShipped(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// Short words that should render fully uppercase (acronyms in agent names)
const UPPERCASE_WORDS = new Set(['qa', 'hr', 'vr', 'ai', 'ui', 'ux']);

function slugToDisplay(slug) {
  if (!slug || slug === 'unknown') return 'Unknown';
  return slug
    .split('-')
    .map((w) =>
      UPPERCASE_WORDS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(' ');
}

export default function AgentNightShiftStats() {
  const stats = useStore((s) => s.nightShiftAgentStats);
  const loading = useStore((s) => s.nightShiftAgentStatsLoading);
  const load = useStore((s) => s.loadNightShiftAgentStats);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!stats || typeof stats !== 'object') return [];
    return Object.entries(stats)
      .map(([slug, data]) => ({ slug, ...data }))
      .sort((a, b) => {
        // Worst park rate first; break ties by shipped desc
        if (b.parkRate7d !== a.parkRate7d) return b.parkRate7d - a.parkRate7d;
        return b.shipped - a.shipped;
      });
  }, [stats]);

  return (
    <div
      style={{
        background: PALETTE.panel,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${PALETTE.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: PALETTE.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            fontWeight: 600,
          }}
        >
          Night Shift · Per-Agent Stats
        </div>
        {loading && (
          <span style={{ fontSize: 10, color: PALETTE.textMuted }}>loading…</span>
        )}
      </div>

      {/* Body */}
      {rows.length === 0 ? (
        <div
          style={{
            padding: 20,
            textAlign: 'center',
            color: PALETTE.textMuted,
            fontSize: 12,
          }}
        >
          No Night Shift runs yet.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
            }}
          >
            <thead>
              <tr>
                <th style={HEADER_STYLE}>Agent</th>
                <th style={{ ...HEADER_STYLE, textAlign: 'center' }}>Shipped</th>
                <th style={{ ...HEADER_STYLE, textAlign: 'center' }}>Parked</th>
                <th style={{ ...HEADER_STYLE, textAlign: 'center' }}>Deferred</th>
                <th style={{ ...HEADER_STYLE, textAlign: 'center' }}>Park rate (7d)</th>
                <th style={{ ...HEADER_STYLE, textAlign: 'center' }}>Last shipped</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isFlagged = row.parkRate7d > 50;
                const rowBg = isFlagged
                  ? 'rgba(239,68,68,0.06)'
                  : 'transparent';
                const parkRateColor = isFlagged
                  ? '#ef4444'
                  : row.parkRate7d > 25
                  ? '#f97316'
                  : PALETTE.text;

                return (
                  <tr
                    key={row.slug}
                    style={{ background: rowBg }}
                    data-testid={`nss-row-${row.slug}`}
                  >
                    <td style={CELL_STYLE}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isFlagged && (
                          <span
                            title="Park rate >50% over 7 days"
                            style={{
                              color: '#ef4444',
                              fontSize: 11,
                              fontWeight: 700,
                              lineHeight: 1,
                            }}
                          >
                            !
                          </span>
                        )}
                        <span>{slugToDisplay(row.slug)}</span>
                      </div>
                    </td>
                    <td style={CELL_NUM_STYLE}>{row.shipped}</td>
                    <td style={CELL_NUM_STYLE}>{row.parked}</td>
                    <td style={CELL_NUM_STYLE}>{row.deferred}</td>
                    <td
                      style={{
                        ...CELL_NUM_STYLE,
                        color: parkRateColor,
                        fontWeight: isFlagged ? 700 : 400,
                      }}
                    >
                      {row.parkRate7d}%
                    </td>
                    <td
                      style={{
                        ...CELL_NUM_STYLE,
                        color: PALETTE.textMuted,
                        fontSize: 11,
                      }}
                    >
                      {formatLastShipped(row.lastShipped)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
