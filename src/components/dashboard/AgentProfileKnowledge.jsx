import React, { useState, useEffect, useMemo } from 'react';

// Only show for knowledge-contributing agents
const KNOWLEDGE_AGENTS = ['market-analyst', 'store-optimizer', 'growth-strategist'];

export default function AgentProfileKnowledge({ agentId, agentColor }) {
  const [refreshLog, setRefreshLog] = useState(null);
  const [loading, setLoading] = useState(true);

  const isKnowledgeAgent = KNOWLEDGE_AGENTS.includes(agentId);

  useEffect(() => {
    if (!isKnowledgeAgent || !window.electronAPI?.hq) {
      setLoading(false);
      return;
    }

    window.electronAPI.hq.readFile('knowledge/refresh-log.json').then(result => {
      if (result.ok) {
        try {
          setRefreshLog(JSON.parse(result.data));
        } catch { /* ignore parse errors */ }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isKnowledgeAgent]);

  const agentEntries = useMemo(() => {
    if (!refreshLog || !Array.isArray(refreshLog)) return [];
    return refreshLog
      .filter(entry => {
        const entryAgent = entry.agent?.toLowerCase().replace(/\s+/g, '-');
        return entryAgent === agentId || entry.agentId === agentId;
      })
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [refreshLog, agentId]);

  if (!isKnowledgeAgent) return null;
  if (loading) return null;
  if (agentEntries.length === 0 && !refreshLog) return null;

  return (
    <div className="card">
      <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3">
        Knowledge Base
      </h2>

      {agentEntries.length === 0 ? (
        <p className="text-[11px] text-forge-text-muted">No knowledge base updates yet.</p>
      ) : (
        <div className="space-y-2">
          {agentEntries.slice(0, 10).map((entry, i) => (
            <div key={i} className="flex items-start gap-2 py-1.5 border-b border-forge-border/30 last:border-0">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: agentColor }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-forge-text-secondary truncate">
                  {entry.file || entry.action || 'Updated knowledge base'}
                </div>
                {entry.timestamp && (
                  <div className="text-[10px] text-forge-text-muted mt-0.5">
                    {new Date(entry.timestamp).toLocaleDateString()} {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
