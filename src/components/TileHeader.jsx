import React from 'react';

export default function TileHeader({ slot, label, isFocused, onUnpin, onClose }) {
  const accent = '#e94560';
  const bg = isFocused ? accent : '#2a2a3e';
  const fg = isFocused ? '#fff' : '#94a3b8';

  return (
    <div
      data-testid={`tile-header-${slot}`}
      data-focused={isFocused ? 'true' : 'false'}
      className="flex items-center gap-2 px-2 h-6 text-[11px] font-mono select-none flex-shrink-0"
      style={{ backgroundColor: bg, color: fg }}
    >
      <span
        className="flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold"
        style={{
          backgroundColor: isFocused ? '#fff' : accent,
          color: isFocused ? accent : '#fff',
        }}
      >
        {slot}
      </span>
      <span className="truncate flex-1">{label}</span>
      <button
        type="button"
        aria-label="Unpin tile"
        onClick={(e) => { e.stopPropagation(); onUnpin(); }}
        className="flex-shrink-0 px-1 hover:opacity-70 leading-none"
        title="Unpin"
      >📍</button>
      <button
        type="button"
        aria-label="Close tile"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="flex-shrink-0 px-1 hover:opacity-70 leading-none"
        title="Close session"
      >×</button>
    </div>
  );
}
