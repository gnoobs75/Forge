// LoaderWarnings — dismissible banner that surfaces malformed recommendation
// files dropped by the loader. Mounted once at the dashboard root so warnings
// are visible regardless of active tab.
import React, { useState } from 'react';
import { useStore } from '../../store/useStore';

export default function LoaderWarnings() {
  const warnings = useStore(s => s.loaderWarnings);
  const dismissOne = useStore(s => s.dismissLoaderWarning);
  const clearAll = useStore(s => s.clearLoaderWarnings);
  const [collapsed, setCollapsed] = useState(false);

  if (!warnings || warnings.length === 0) return null;

  return (
    <div
      className="fixed bottom-3 right-3 z-40 max-w-md w-[26rem] rounded-lg border bg-forge-surface shadow-xl
                 animate-fade-in"
      style={{ borderColor: '#F59E0B', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b cursor-pointer select-none"
        style={{ borderColor: '#F59E0B30' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{ color: '#F59E0B' }} className="text-sm">{'\u26A0'}</span>
        <span className="text-xs font-mono font-semibold" style={{ color: '#F59E0B' }}>
          {warnings.length} dropped recommendation{warnings.length === 1 ? '' : 's'}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); clearAll(); }}
            className="text-[10px] text-forge-text-muted hover:text-forge-text-secondary transition-colors"
            title="Dismiss all"
          >
            Clear all
          </button>
          <span className="text-[10px] text-forge-text-muted">
            {collapsed ? '\u25B2' : '\u25BC'}
          </span>
        </span>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="max-h-64 overflow-y-auto scrollbar-thin">
          {warnings.map((w) => (
            <WarningRow
              key={w.file}
              warning={w}
              onDismiss={() => dismissOne(w.file)}
            />
          ))}
          <div className="px-3 py-2 border-t border-forge-border/30">
            <p className="text-[10px] text-forge-text-muted leading-relaxed">
              Files missing <code>title</code>, <code>agent</code>, or with non-array{' '}
              <code>approaches</code> are dropped. See CLAUDE.md for the schema.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function WarningRow({ warning, onDismiss }) {
  const filename = warning.file.split('/').pop();
  const reveal = (e) => {
    e.stopPropagation();
    const api = window.electronAPI?.shell?.openPath;
    if (typeof api === 'function') api(warning.file);
  };
  return (
    <div className="px-3 py-2 border-b border-forge-border/20 hover:bg-forge-bg/30 transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-mono text-forge-text-primary truncate" title={warning.file}>
            {filename}
          </div>
          <div className="text-[10px] text-forge-text-muted truncate" title={warning.file}>
            {warning.file}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {warning.missing.map((m, i) => (
              <span
                key={i}
                className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                style={{ backgroundColor: '#EF444415', color: '#EF4444' }}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={reveal}
            className="text-[10px] px-1.5 py-0.5 rounded border border-forge-border/50 text-forge-text-muted hover:text-forge-text-primary hover:border-forge-text-muted transition-colors"
            title="Open in editor / file explorer"
          >
            Reveal
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="text-forge-text-muted hover:text-forge-text-primary text-xs px-1 transition-colors"
            title="Dismiss"
          >
            {'\u00D7'}
          </button>
        </div>
      </div>
    </div>
  );
}
