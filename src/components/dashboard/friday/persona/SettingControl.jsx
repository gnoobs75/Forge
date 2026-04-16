import React, { useState } from 'react';

const FRIDAY_ACCENT = '#D946EF';

/**
 * Reusable setting control with help tooltip.
 * Supports: number, range, text, textarea, select, toggle
 */
export default function SettingControl({
  label,
  value,
  onChange,
  type = 'number',
  help,
  barneyHelp,
  min,
  max,
  step,
  options,       // for select: [{ value, label }]
  suffix = '',
  disabled = false,
  placeholder,
  rows = 4,      // for textarea
}) {
  const [showHelp, setShowHelp] = useState(false);

  const renderControl = () => {
    switch (type) {
      case 'toggle':
        return (
          <button
            onClick={() => !disabled && onChange(!value)}
            disabled={disabled}
            className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${
              value ? 'bg-fuchsia-500' : 'bg-forge-border'
            } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
              value ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="bg-forge-bg border border-forge-border rounded-lg px-3 py-1.5 text-[13px] text-forge-text-primary
                       focus:outline-none focus:border-fuchsia-500/50 cursor-pointer disabled:opacity-40
                       min-w-[140px]"
          >
            {options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );

      case 'range':
        return (
          <div className="flex items-center gap-3 min-w-[200px]">
            <input
              type="range"
              min={min} max={max} step={step}
              value={value}
              onChange={(e) => onChange(parseFloat(e.target.value))}
              disabled={disabled}
              className="flex-1 h-1.5 bg-forge-bg rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                         [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-fuchsia-500
                         [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md
                         disabled:opacity-40"
            />
            <span className="text-[13px] text-forge-text-secondary font-mono min-w-[50px] text-right">
              {value}{suffix}
            </span>
          </div>
        );

      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={rows}
            placeholder={placeholder}
            className="w-full bg-forge-bg border border-forge-border rounded-lg px-3 py-2 text-[13px] text-forge-text-primary
                       placeholder:text-forge-text-muted focus:outline-none focus:border-fuchsia-500/50
                       disabled:opacity-40 disabled:cursor-not-allowed font-mono leading-relaxed resize-y"
          />
        );

      case 'text':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            className="bg-forge-bg border border-forge-border rounded-lg px-3 py-1.5 text-[13px] text-forge-text-primary
                       placeholder:text-forge-text-muted focus:outline-none focus:border-fuchsia-500/50
                       disabled:opacity-40 min-w-[200px]"
          />
        );

      case 'number':
      default:
        return (
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={value}
              onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
              min={min} max={max} step={step}
              disabled={disabled}
              className="bg-forge-bg border border-forge-border rounded-lg px-3 py-1.5 text-[13px] text-forge-text-primary
                         focus:outline-none focus:border-fuchsia-500/50 disabled:opacity-40
                         w-[100px] font-mono text-right
                         [&::-webkit-inner-spin-button]:opacity-50"
            />
            {suffix && <span className="text-[13px] text-forge-text-muted">{suffix}</span>}
          </div>
        );
    }
  };

  return (
    <div className={`py-3 ${type === 'textarea' ? '' : 'flex items-start justify-between gap-4'}`}>
      <div className={`flex-1 min-w-0 ${type === 'textarea' ? 'mb-2' : ''}`}>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-forge-text-primary">{label}</span>
          {(help || barneyHelp) && (
            <button
              onClick={() => setShowHelp(!showHelp)}
              className={`w-4 h-4 rounded-full text-[13px] font-bold flex items-center justify-center
                         transition-all flex-shrink-0 ${
                showHelp
                  ? 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/40'
                  : 'bg-forge-bg text-forge-text-muted border border-forge-border hover:text-fuchsia-400 hover:border-fuchsia-500/30'
              }`}
              title="What does this do?"
            >
              ?
            </button>
          )}
        </div>

        {/* Technical help (always visible as subtitle) */}
        {help && !showHelp && (
          <div className="text-[13px] text-forge-text-muted mt-0.5 leading-relaxed">{help}</div>
        )}

        {/* Barney-style expanded explanation */}
        {showHelp && (
          <div className="mt-2 p-2.5 rounded-lg bg-fuchsia-500/5 border border-fuchsia-500/15 animate-fade-in">
            {barneyHelp && (
              <div className="text-[13px] text-fuchsia-300/90 leading-relaxed mb-1">
                {barneyHelp}
              </div>
            )}
            {help && (
              <div className="text-[13px] text-forge-text-muted leading-relaxed italic">
                Technical: {help}
              </div>
            )}
          </div>
        )}
      </div>

      {renderControl()}
    </div>
  );
}

/**
 * Section card wrapper for grouping settings.
 */
export function SettingsCard({ title, icon, description, children, onSave, onReset, dirty }) {
  return (
    <div className="rounded-xl border border-forge-border bg-forge-surface/50 overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3 border-b border-forge-border/50 bg-forge-bg/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon && <span className="text-sm">{icon}</span>}
            <h3 className="text-[13px] font-mono font-semibold text-forge-text-primary uppercase tracking-wider">
              {title}
            </h3>
          </div>
          {(onSave || onReset) && (
            <div className="flex items-center gap-2">
              {onReset && (
                <button
                  onClick={onReset}
                  className="px-2.5 py-1 text-[13px] rounded-md border border-forge-border
                             text-forge-text-muted hover:text-forge-text-secondary hover:border-forge-text-muted
                             transition-colors"
                >
                  Reset
                </button>
              )}
              {onSave && (
                <button
                  onClick={onSave}
                  className={`px-3 py-1 text-[13px] rounded-md font-medium transition-all ${
                    dirty
                      ? 'bg-fuchsia-500 text-white shadow-md shadow-fuchsia-500/20 hover:bg-fuchsia-600'
                      : 'border border-forge-border text-forge-text-muted'
                  }`}
                >
                  {dirty ? 'Save Changes' : 'Saved'}
                </button>
              )}
            </div>
          )}
        </div>
        {description && (
          <p className="text-[13px] text-forge-text-muted mt-1">{description}</p>
        )}
      </div>

      {/* Card body */}
      <div className="px-4 py-1 divide-y divide-forge-border/30">
        {children}
      </div>
    </div>
  );
}

/**
 * Toast notification for save feedback.
 */
export function Toast({ message, type = 'success', onClose }) {
  React.useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: 'bg-green-500/10 border-green-500/30 text-green-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-400',
    info: 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400',
  };

  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg border ${colors[type]}
                     text-[13px] font-medium shadow-xl animate-slide-up`}>
      {message}
    </div>
  );
}
