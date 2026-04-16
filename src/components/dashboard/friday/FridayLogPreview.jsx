import React, { useState, useEffect, useRef } from 'react';

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;
const MAX_LINES = 20;

export default function FridayLogPreview({ onOpenTerminal }) {
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem('forge-friday-log-expanded') === 'true'; } catch { return false; }
  });
  const [lines, setLines] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem('forge-friday-log-expanded', String(expanded)); } catch {}
  }, [expanded]);

  // Subscribe to friday-server terminal data
  useEffect(() => {
    if (!window.electronAPI?.terminal?.onData) return;

    const remove = window.electronAPI.terminal.onData((scopeId, data) => {
      if (scopeId !== 'friday-server') return;

      const clean = data.replace(ANSI_REGEX, '');
      const newLines = clean.split(/\r?\n/).filter(l => l.trim());
      if (newLines.length === 0) return;

      setLines(prev => [...prev, ...newLines].slice(-MAX_LINES));
    });

    return remove;
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, expanded]);

  return (
    <div className="border-t border-forge-border/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-mono
                   text-forge-text-muted hover:text-forge-text-secondary transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span style={{ color: '#D946EF' }}>{expanded ? '\u25BC' : '\u25B6'}</span>
          <span>Server Log</span>
          {lines.length > 0 && (
            <span className="text-[9px] text-forge-text-muted/50">({lines.length} lines)</span>
          )}
        </span>
        {onOpenTerminal && (
          <span
            onClick={(e) => { e.stopPropagation(); onOpenTerminal(); }}
            className="text-fuchsia-400 hover:text-fuchsia-300 cursor-pointer"
          >
            Open Terminal &rarr;
          </span>
        )}
      </button>

      {expanded && (
        <div
          ref={scrollRef}
          className="h-[120px] overflow-y-auto px-3 pb-2 font-mono text-[10px] leading-relaxed"
          style={{ color: '#22C55E', backgroundColor: 'rgba(0,0,0,0.2)' }}
        >
          {lines.length === 0 ? (
            <div className="text-forge-text-muted/30 italic py-2">No server output yet</div>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
