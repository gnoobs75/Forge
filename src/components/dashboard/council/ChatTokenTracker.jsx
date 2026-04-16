import React, { useState, useEffect } from 'react';

export default function ChatTokenTracker() {
  const [usage, setUsage] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadUsage();
    const interval = setInterval(loadUsage, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function loadUsage() {
    if (!window.electronAPI?.groq) return;
    try {
      const data = await window.electronAPI.groq.getUsage();
      setUsage(data);
    } catch {}
  }

  if (!usage) return null;

  const pct = Math.min((usage.requestsToday / usage.dailyLimit) * 100, 100);
  const barColor = pct < 50 ? '#22C55E' : pct < 80 ? '#EAB308' : '#EF4444';

  return (
    <div className="px-3 py-1.5 border-b border-forge-border/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-[10px] text-forge-text-muted hover:text-forge-text-secondary transition-colors"
      >
        <span style={{ color: '#F55036' }}>{'\u26A1'}</span>
        <span className="font-mono">
          {usage.requestsToday.toLocaleString()} / {usage.dailyLimit.toLocaleString()}
        </span>
        <div className="flex-1 h-1 bg-forge-bg rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: barColor }}
          />
        </div>
        <span className="font-mono">{pct.toFixed(1)}%</span>
        <span className="text-[8px]">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1 text-[10px] text-forge-text-muted pb-1">
          <div className="flex justify-between">
            <span>Tokens today</span>
            <span className="font-mono text-forge-text-secondary">{usage.tokensToday.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Resets at</span>
            <span className="font-mono text-forge-text-secondary">
              {new Date(usage.resetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
