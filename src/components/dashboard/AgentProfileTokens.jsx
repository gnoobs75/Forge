import React, { useMemo } from 'react';
import { useStore } from '../../store/useStore';

// Token usage tracking — currently a placeholder.
// Activates when automation execution log entries include token fields:
//   inputTokens, outputTokens, cacheReadTokens, totalTokens, sessionDurationMs
//
// Future wire-up points:
//   1. main.cjs terminal exit handler: parse Claude Code session JSONL for token counts
//   2. Execution log entries: add token fields from parsed session data

export default function AgentProfileTokens({ agentId, agentColor }) {
  const automationExecutionLog = useStore((s) => s.automationExecutionLog);

  const agentLogs = useMemo(
    () => automationExecutionLog.filter(e => e.agentId === agentId),
    [automationExecutionLog, agentId]
  );

  // Check if any log entries have token data
  const hasTokenData = useMemo(
    () => agentLogs.some(e => e.totalTokens != null),
    [agentLogs]
  );

  if (hasTokenData) {
    // Live token data mode
    const totalTokens = agentLogs.reduce((sum, e) => sum + (e.totalTokens || 0), 0);
    const inputTokens = agentLogs.reduce((sum, e) => sum + (e.inputTokens || 0), 0);
    const outputTokens = agentLogs.reduce((sum, e) => sum + (e.outputTokens || 0), 0);
    const cacheTokens = agentLogs.reduce((sum, e) => sum + (e.cacheReadTokens || 0), 0);

    return (
      <div className="card">
        <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3">
          Token Usage
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <TokenStat label="Total" value={formatTokens(totalTokens)} color={agentColor} />
          <TokenStat label="Input" value={formatTokens(inputTokens)} color="#3B82F6" />
          <TokenStat label="Output" value={formatTokens(outputTokens)} color="#22C55E" />
          <TokenStat label="Cache Read" value={formatTokens(cacheTokens)} color="#8B5CF6" />
        </div>
      </div>
    );
  }

  // Placeholder mode
  return (
    <div className="card">
      <h2 className="text-xs font-mono font-semibold text-forge-text-muted uppercase tracking-wider mb-3">
        Token Usage
      </h2>
      <p className="text-[11px] text-forge-text-muted leading-relaxed mb-3">
        Token data will be captured from automation sessions automatically.
      </p>

      {/* Visual mock */}
      <div className="space-y-2 opacity-30 pointer-events-none">
        <div className="grid grid-cols-2 gap-2">
          <MockBar label="Total" width="85%" color={agentColor} />
          <MockBar label="Input" width="60%" color="#3B82F6" />
          <MockBar label="Output" width="40%" color="#22C55E" />
          <MockBar label="Cache" width="70%" color="#8B5CF6" />
        </div>
      </div>
    </div>
  );
}

function TokenStat({ label, value, color }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-forge-bg/50 border border-forge-border/50">
      <div className="text-[10px] text-forge-text-muted uppercase tracking-wider">{label}</div>
      <div className="text-sm font-mono font-bold mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

function MockBar({ label, width, color }) {
  return (
    <div className="px-2 py-1.5 rounded bg-forge-bg/50 border border-forge-border/30">
      <div className="text-[9px] text-forge-text-muted mb-1">{label}</div>
      <div className="h-1.5 rounded-full bg-forge-border/30 overflow-hidden">
        <div className="h-full rounded-full" style={{ width, backgroundColor: color }} />
      </div>
    </div>
  );
}

function formatTokens(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
