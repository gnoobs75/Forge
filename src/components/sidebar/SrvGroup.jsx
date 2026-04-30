import React from 'react';

function srvDotColor(status) {
  if (status === 'running') return '#22C55E';
  if (status === 'crashed') return '#EF4444';
  return '#D946EF';
}

const ROWS = [
  { id: 'vite-server', label: '⚡ Vite Dev', color: '#22D3EE' },
  { id: 'friday-server', label: '🟣 Friday Server', color: '#D946EF' },
  { id: 'forge-logs', label: '⚡ Forge Logs', color: '#3B82F6' },
];

export default function SrvGroup({ isExpanded, activeTabId, fridayProcessStatus, attention, onToggle, onSelect }) {
  const dot = srvDotColor(fridayProcessStatus);
  return (
    <div className="select-none">
      <div
        data-testid="srv-header"
        data-attention={attention ? 'true' : 'false'}
        onClick={onToggle}
        className={`flex items-center gap-2 px-2 py-1 cursor-pointer text-[10px] font-mono uppercase tracking-wider
          ${isExpanded ? 'text-fuchsia-400 bg-forge-bg/40' : 'text-forge-text-muted hover:text-fuchsia-400 hover:bg-forge-bg/20'}`}
      >
        <span className="w-2.5 text-[9px] flex-shrink-0">{isExpanded ? '▾' : '▸'}</span>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
        <span className="flex-1">Servers</span>
      </div>
      {!isExpanded && (
        <div className="flex items-center gap-2 pl-7 pr-2 py-1 text-[10px] font-mono text-forge-text-muted/60">
          <span>{'· Vite · Friday · Logs'}</span>
        </div>
      )}
      {isExpanded && (
        <div>
          {ROWS.map(row => (
            <div
              key={row.id}
              onClick={() => onSelect(row.id)}
              data-active={activeTabId === row.id ? 'true' : 'false'}
              className={`flex items-center gap-2 pl-7 pr-2 py-1 cursor-pointer text-[11px] font-mono
                ${activeTabId === row.id
                  ? 'bg-forge-bg/60 text-forge-text-secondary'
                  : 'text-forge-text-muted hover:bg-forge-bg/30 hover:text-forge-text-secondary'}`}
              style={activeTabId === row.id ? { boxShadow: `inset 2px 0 0 0 ${row.color}` } : undefined}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
              <span className="truncate">{row.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
