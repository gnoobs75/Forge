import React from 'react';
import { PALETTE } from './primitives.jsx';

/**
 * <NightShiftBadge eligible={bool} verify={str?} onToggle={fn?} />
 *
 * Reusable pill that shows whether a rec or todo item is flagged for
 * autonomous overnight execution by Friday's Night Shift foreman.
 *
 * - eligible: current value of overnight_eligible
 * - verify:   optional verifier command (shown as tooltip)
 * - onToggle: if provided, badge becomes a clickable button; otherwise read-only
 *
 * Visual: amber when eligible, muted grey when not.
 */
export default function NightShiftBadge({ eligible, verify, onToggle }) {
  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    fontSize: 10,
    fontWeight: 600,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    borderRadius: 3,
    border: `1px solid ${eligible ? '#d97706' : PALETTE.border}`,
    background: eligible ? 'rgba(217,119,6,0.15)' : 'transparent',
    color: eligible ? '#fbbf24' : PALETTE.textMuted,
    cursor: onToggle ? 'pointer' : 'default',
    userSelect: 'none',
    lineHeight: 1.4,
  };

  const tooltip = eligible
    ? (verify ? `Eligible for Night Shift · verify: ${verify}` : 'Eligible for Night Shift')
    : 'Day Work — click to flag eligible';
  const label = eligible ? 'Ready for Night Shift' : 'Day Work';

  if (!onToggle) {
    return <span style={baseStyle} title={tooltip}>{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      title={tooltip}
      style={{ ...baseStyle, background: baseStyle.background }}
      aria-pressed={eligible}
    >
      <span aria-hidden="true">{eligible ? '🌙' : '☀'}</span>
      <span>{label}</span>
    </button>
  );
}
