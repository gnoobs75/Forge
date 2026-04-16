import React, { useState } from 'react';

const SCORE_COLORS = {
  high: '#22C55E',   // 7-10
  medium: '#EAB308', // 4-6
  low: '#EF4444',    // 1-3
};

function scoreColor(score) {
  if (score >= 7) return SCORE_COLORS.high;
  if (score >= 4) return SCORE_COLORS.medium;
  return SCORE_COLORS.low;
}

export default function IdeaCard({ idea, onAnalyze, onDismiss, onPromote, compact = false }) {
  const [showAnalysis, setShowAnalysis] = useState(false);

  const isBoss = idea.source === 'boss';
  const borderColor = isBoss ? '#EAB308' : (idea.agentColor || '#666');
  const sourceName = isBoss ? 'You' : (idea.agentName || 'Agent');

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffH = (now - d) / (1000 * 60 * 60);
    if (diffH < 1) return `${Math.round(diffH * 60)}m ago`;
    if (diffH < 24) return `${Math.round(diffH)}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Compact trophy chip mode (for Promoted column)
  if (compact) {
    return (
      <div
        className="group relative"
      >
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-forge-bg/50 border border-forge-border/50
                     hover:bg-forge-surface hover:border-forge-border cursor-pointer transition-all duration-300
                     hover:scale-[1.02] hover:shadow-md"
          onClick={() => setShowAnalysis(!showAnalysis)}
        >
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: borderColor }} />
          <span className="text-[10px] text-forge-text-secondary truncate flex-1">{idea.text.slice(0, 50)}</span>
          {idea.analysis && (
            <span
              className="text-[9px] font-bold px-1 rounded"
              style={{ color: scoreColor(idea.analysis.overallScore) }}
            >
              {idea.analysis.overallScore.toFixed(1)}
            </span>
          )}
        </div>

        {/* Hover expansion */}
        {showAnalysis && (
          <div className="mt-1 p-2 rounded-lg bg-forge-surface border border-forge-border shadow-lg animate-fade-in">
            <div className="text-[11px] text-forge-text-secondary mb-2">{idea.text}</div>
            {idea.analysis && (
              <IdeaAnalysisInline analysis={idea.analysis} />
            )}
            {idea.recommendation && (
              <div className="mt-1 text-[9px] text-forge-accent">
                Promoted to recommendation
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border bg-forge-bg/30 overflow-hidden transition-all duration-300
                 hover:bg-forge-bg/50 hover:shadow-sm animate-fade-in"
      style={{ borderColor: `${borderColor}30`, borderLeftWidth: '3px', borderLeftColor: borderColor }}
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
            style={{ backgroundColor: borderColor }}
          >
            {isBoss ? '\u2605' : sourceName.charAt(0)}
          </div>
          <span className="text-[11px] font-medium" style={{ color: borderColor }}>
            {sourceName}
          </span>
          <span className="text-[9px] text-forge-text-muted ml-auto">{formatTime(idea.createdAt)}</span>
        </div>

        {/* Idea text */}
        <div className="text-[11px] text-forge-text-secondary leading-relaxed mb-2">
          {idea.text}
        </div>

        {/* Project badge */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-forge-surface border border-forge-border text-forge-text-muted">
            {idea.project}
          </span>
          {idea.status === 'analyzing' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 animate-pulse">
              Analyzing...
            </span>
          )}
        </div>

        {/* Analysis results (inline) */}
        {idea.analysis && (
          <div className="mb-2">
            <button
              onClick={() => setShowAnalysis(!showAnalysis)}
              className="flex items-center gap-2 w-full"
            >
              {/* Score ring */}
              <div
                className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                style={{
                  borderColor: scoreColor(idea.analysis.overallScore),
                  color: scoreColor(idea.analysis.overallScore),
                }}
              >
                {idea.analysis.overallScore.toFixed(1)}
              </div>
              <div className="flex-1 text-left">
                <div className="text-[10px] text-forge-text-secondary">{idea.analysis.verdict}</div>
              </div>
              <span className="text-[10px] text-forge-text-muted">{showAnalysis ? '\u25B2' : '\u25BC'}</span>
            </button>

            {showAnalysis && (
              <IdeaAnalysisInline analysis={idea.analysis} />
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          {(idea.status === 'active' || idea.status === 'analyzing') && (
            <>
              <button
                onClick={() => onAnalyze?.(idea)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
                           bg-forge-accent/10 text-forge-accent border border-forge-accent/20
                           hover:bg-forge-accent/20 transition-colors"
              >
                <span>{idea.status === 'analyzing' ? '\u21BB' : '\u2728'}</span>
                {idea.status === 'analyzing' ? 'Re-analyze' : 'Analyze'}
              </button>
              <button
                onClick={() => onDismiss?.(idea)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
                           text-forge-text-muted hover:text-red-400 hover:bg-red-400/10
                           border border-transparent hover:border-red-400/20 transition-colors"
              >
                Dismiss
              </button>
            </>
          )}
          {idea.status === 'analyzed' && idea.analysis?.overallScore >= 7 && (
            <button
              onClick={() => onPromote?.(idea)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
                         bg-green-400/10 text-green-400 border border-green-400/20
                         hover:bg-green-400/20 transition-colors"
            >
              <span>{'\u2191'}</span> Promote to Rec
            </button>
          )}
          {idea.status === 'analyzed' && (
            <>
              <button
                onClick={() => onAnalyze?.(idea)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
                           bg-blue-400/10 text-blue-400 border border-blue-400/20
                           hover:bg-blue-400/20 transition-colors"
              >
                <span>{'\u21BB'}</span> Re-analyze
              </button>
              <button
                onClick={() => onDismiss?.(idea)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
                           text-forge-text-muted hover:text-red-400 hover:bg-red-400/10
                           border border-transparent hover:border-red-400/20 transition-colors"
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function IdeaAnalysisInline({ analysis }) {
  return (
    <div className="mt-2 space-y-1 p-2 rounded bg-forge-surface/50 border border-forge-border/30">
      {analysis.agents?.map((a) => (
        <div key={a.agentId} className="flex items-center gap-2 text-[10px]">
          <span
            className="w-4 text-right font-mono font-bold"
            style={{ color: scoreColor(a.score) }}
          >
            {a.score}
          </span>
          <span className="text-forge-text-muted w-24 truncate">{a.agentId.replace(/-/g, ' ')}</span>
          <span className="text-forge-text-secondary flex-1 truncate">{a.insight}</span>
        </div>
      ))}
    </div>
  );
}
