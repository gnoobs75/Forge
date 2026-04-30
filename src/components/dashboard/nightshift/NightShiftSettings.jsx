import React, { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// DEFAULTS — mirrors the Night Shift runtime defaults
// ---------------------------------------------------------------------------
const DEFAULTS = {
  enabled: false,
  time_window: { start: '23:00', end: '07:00', drain_at: '06:30' },
  weekly_target_tokens: 700000,
  weekly_halt_threshold_pct: 80,
  per_night_token_cap: 200000,
  per_task_token_cap: 50000,
  per_task_minute_cap: 30,
  max_concurrent_dispatches: 3,
  tier_caps: { T1: null, T2: 20, T3: 5 },
  per_project_token_share_max_pct: 40,
  stash_dirty_tree: false,
};

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------
const AMBER = '#d97706';
const CARD_BG = 'rgba(255,255,255,0.03)';
const BORDER = 'rgba(217,119,6,0.35)';
const TEXT_MUTED = '#6b7280';
const TEXT_PRIMARY = '#e5e7eb';
const TEXT_LABEL = '#9ca3af';
const LABEL_W = 188;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <span style={{ width: LABEL_W, flexShrink: 0, fontSize: 11, color: TEXT_LABEL, fontFamily: 'monospace' }}>
        {label}
      </span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px 3px 4px',
        borderRadius: 999,
        border: `1px solid ${checked ? AMBER : 'rgba(255,255,255,0.15)'}`,
        background: checked ? `rgba(217,119,6,0.18)` : 'rgba(255,255,255,0.05)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontSize: 11,
        color: checked ? AMBER : TEXT_MUTED,
        fontFamily: 'monospace',
      }}
    >
      <span style={{
        width: 14, height: 14, borderRadius: 999,
        background: checked ? AMBER : 'rgba(255,255,255,0.2)',
        transition: 'background 0.15s',
      }} />
      {checked ? 'ON' : 'OFF'}
    </button>
  );
}

function NumberInput({ value, onChange, min, max, style }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        padding: '3px 8px',
        color: TEXT_PRIMARY,
        fontSize: 12,
        fontFamily: 'monospace',
        width: 120,
        outline: 'none',
        ...style,
      }}
    />
  );
}

function TimeInput({ value, onChange }) {
  return (
    <input
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        padding: '3px 8px',
        color: TEXT_PRIMARY,
        fontSize: 12,
        fontFamily: 'monospace',
        outline: 'none',
        colorScheme: 'dark',
      }}
    />
  );
}

function SliderRow({ label, value, onChange, min = 0, max = 100 }) {
  return (
    <Row label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: AMBER, cursor: 'pointer' }}
        />
        <span style={{ width: 36, textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: AMBER }}>
          {value}%
        </span>
      </div>
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function NightShiftSettings() {
  const [draft, setDraft] = useState(DEFAULTS);
  const [notConfigured, setNotConfigured] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saved' | {error: string}
  const [loadError, setLoadError] = useState(null);

  const ipcAvailable = typeof window !== 'undefined' && !!window.electronAPI?.nightshift;

  // Deep-set helper
  const set = useCallback((path, value) => {
    setDraft(prev => {
      const next = { ...prev };
      const parts = path.split('.');
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] = { ...cur[parts[i]] };
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  }, []);

  // Load config on mount
  useEffect(() => {
    if (!ipcAvailable) return;
    window.electronAPI.nightshift.configRead().then(res => {
      if (!res.ok) {
        setLoadError(res.error || 'Failed to read Night Shift config');
        return;
      }
      const { _exists, ...rest } = res.data;
      setNotConfigured(!_exists);
      setDraft({ ...DEFAULTS, ...rest });
    }).catch(err => {
      setLoadError(String(err));
    });
  }, [ipcAvailable]);

  const handleSave = async () => {
    if (!ipcAvailable) return;
    setSaveStatus(null);
    try {
      const res = await window.electronAPI.nightshift.configWrite(draft);
      if (res.ok) {
        setNotConfigured(false);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(null), 2000);
      } else {
        setSaveStatus({ error: res.error || 'Save failed' });
      }
    } catch (err) {
      setSaveStatus({ error: String(err) });
    }
  };

  const handleReset = () => {
    setDraft(DEFAULTS);
  };

  // --- IPC not available ---
  if (!ipcAvailable) {
    return (
      <div style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: 20,
        marginBottom: 16,
      }}>
        <h4 style={{ fontSize: 11, fontFamily: 'monospace', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Night Shift Config
        </h4>
        <p style={{ fontSize: 12, color: TEXT_MUTED }}>
          IPC not loaded — restart Electron to pick up Night Shift config IPC.
        </p>
      </div>
    );
  }

  // --- Load error ---
  if (loadError) {
    return (
      <div style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: 20,
        marginBottom: 16,
      }}>
        <h4 style={{ fontSize: 11, fontFamily: 'monospace', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Night Shift Config
        </h4>
        <p style={{ fontSize: 12, color: '#EF4444' }}>{loadError}</p>
      </div>
    );
  }

  return (
    <div style={{
      background: CARD_BG,
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      padding: 20,
      marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 14, color: AMBER }}>◐</span>
        <h4 style={{ fontSize: 11, fontFamily: 'monospace', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
          Night Shift Config
        </h4>
      </div>

      {/* Not-configured banner */}
      {notConfigured && (
        <div style={{
          background: 'rgba(217,119,6,0.1)',
          border: `1px solid rgba(217,119,6,0.4)`,
          borderRadius: 6,
          padding: '8px 12px',
          marginBottom: 16,
          fontSize: 11,
          color: AMBER,
          fontFamily: 'monospace',
        }}>
          Night Shift not yet configured — Friday will not run overnight until you apply a config.
        </div>
      )}

      <div style={{ maxWidth: 620 }}>
        {/* Section: Schedule */}
        <p style={{ fontSize: 10, fontFamily: 'monospace', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, marginTop: 0 }}>
          Schedule
        </p>

        <Row label="Enabled">
          <Toggle checked={draft.enabled} onChange={v => set('enabled', v)} />
        </Row>

        <Row label="Window start">
          <TimeInput value={draft.time_window.start} onChange={v => set('time_window.start', v)} />
        </Row>

        <Row label="Window end">
          <TimeInput value={draft.time_window.end} onChange={v => set('time_window.end', v)} />
        </Row>

        <Row label="Drain at">
          <TimeInput value={draft.time_window.drain_at} onChange={v => set('time_window.drain_at', v)} />
        </Row>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '14px 0' }} />

        {/* Section: Token budget */}
        <p style={{ fontSize: 10, fontFamily: 'monospace', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, marginTop: 0 }}>
          Token Budget
        </p>

        <Row label="Weekly target tokens">
          <NumberInput
            value={draft.weekly_target_tokens}
            onChange={v => set('weekly_target_tokens', v)}
          />
        </Row>

        <SliderRow
          label="Halt threshold %"
          value={draft.weekly_halt_threshold_pct}
          onChange={v => set('weekly_halt_threshold_pct', v)}
        />

        <Row label="Per-night token cap">
          <NumberInput
            value={draft.per_night_token_cap}
            onChange={v => set('per_night_token_cap', v)}
          />
        </Row>

        <Row label="Per-task token cap">
          <NumberInput
            value={draft.per_task_token_cap}
            onChange={v => set('per_task_token_cap', v)}
          />
        </Row>

        <Row label="Per-task minute cap">
          <NumberInput
            value={draft.per_task_minute_cap}
            onChange={v => set('per_task_minute_cap', v)}
            min={1}
          />
        </Row>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '14px 0' }} />

        {/* Section: Dispatch */}
        <p style={{ fontSize: 10, fontFamily: 'monospace', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, marginTop: 0 }}>
          Dispatch
        </p>

        <Row label="Max concurrent">
          <NumberInput
            value={draft.max_concurrent_dispatches}
            onChange={v => set('max_concurrent_dispatches', v)}
            min={1}
            max={5}
            style={{ width: 80 }}
          />
        </Row>

        {/* Tier caps */}
        <Row label="Tier caps (T1 / T2 / T3)">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {['T1', 'T2', 'T3'].map(tier => (
              <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: TEXT_MUTED, fontFamily: 'monospace' }}>{tier}</span>
                <input
                  type="number"
                  value={draft.tier_caps[tier] ?? ''}
                  placeholder="∞"
                  min={1}
                  onChange={e => set(`tier_caps.${tier}`, e.target.value === '' ? null : Number(e.target.value))}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 4,
                    padding: '3px 6px',
                    color: TEXT_PRIMARY,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    width: 70,
                    outline: 'none',
                  }}
                />
              </div>
            ))}
            <span style={{ fontSize: 10, color: TEXT_MUTED }}>empty = unlimited</span>
          </div>
        </Row>

        <SliderRow
          label="Per-project share max %"
          value={draft.per_project_token_share_max_pct}
          onChange={v => set('per_project_token_share_max_pct', v)}
        />

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '14px 0' }} />

        {/* Section: Git */}
        <p style={{ fontSize: 10, fontFamily: 'monospace', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, marginTop: 0 }}>
          Git
        </p>

        <Row label="Stash dirty tree">
          <Toggle checked={draft.stash_dirty_tree} onChange={v => set('stash_dirty_tree', v)} />
        </Row>

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={handleSave}
            style={{
              background: AMBER,
              color: '#1a1a1a',
              border: 'none',
              borderRadius: 5,
              padding: '6px 16px',
              fontSize: 12,
              fontFamily: 'monospace',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleReset}
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: TEXT_MUTED,
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 5,
              padding: '6px 14px',
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Reset to defaults
          </button>

          {/* Status indicators */}
          {saveStatus === 'saved' && (
            <span style={{ fontSize: 12, color: '#22C55E', fontFamily: 'monospace' }}>
              ✓ Saved
            </span>
          )}
          {saveStatus && saveStatus.error && (
            <span style={{ fontSize: 12, color: '#EF4444', fontFamily: 'monospace' }}>
              {saveStatus.error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
