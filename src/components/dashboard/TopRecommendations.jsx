import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { recDisplayTitle } from '../../utils/rec';
import { playSound } from '../../utils/sounds';
import RecFileActions from './RecFileActions';
import ChartRenderer from './ChartRenderer';

const EFFORT_COLORS = {
  none: 'text-green-400',
  low: 'text-green-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
};

const IMPACT_COLORS = {
  baseline: 'text-forge-text-muted',
  low: 'text-orange-400',
  medium: 'text-yellow-400',
  high: 'text-green-400',
};

export default function TopRecommendations() {
  const recommendations = useStore((s) => s.recommendations);
  const projects = useStore((s) => s.projects);
  const [showResolved, setShowResolved] = useState(false);

  if (recommendations.length === 0) return null;

  const activeRecs = recommendations.filter((r) => r.status !== 'resolved' && r.status !== 'dismissed');
  const resolvedRecs = recommendations.filter((r) => r.status === 'resolved' || r.status === 'dismissed');

  const displayRecs = showResolved ? resolvedRecs : activeRecs;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider border-l-2 border-forge-accent pl-3">
          Latest Recommendations
        </h2>
        <div className="flex items-center gap-3">
          {resolvedRecs.length > 0 && (
            <button
              onClick={() => setShowResolved(!showResolved)}
              className="text-[10px] text-forge-text-muted hover:text-forge-text-secondary transition-colors"
            >
              {showResolved ? `Active (${activeRecs.length})` : `Resolved (${resolvedRecs.length})`}
            </button>
          )}
          <span className="text-[10px] text-forge-text-muted">
            {activeRecs.length} active across all projects
          </span>
        </div>
      </div>
      <div className="space-y-3">
        {displayRecs.slice(0, 5).map((rec, i) => (
          <RecommendationCard
            key={`${rec.timestamp}-${i}`}
            rec={rec}
            projectName={projects.find((p) => p.slug === rec.project)?.name || rec.project}
          />
        ))}
        {displayRecs.length === 0 && (
          <div className="text-xs text-forge-text-muted text-center py-4">
            {showResolved ? 'No resolved recommendations yet' : 'All recommendations resolved!'}
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationCard({ rec, projectName }) {
  const [expanded, setExpanded] = useState(false);
  const updateStatus = useStore((s) => s.updateRecommendationStatus);
  const startImplementation = useStore((s) => s.startImplementation);
  const projects = useStore((s) => s.projects);
  const implementationSessions = useStore((s) => s.implementationSessions);
  const isResolved = rec.status === 'resolved' || rec.status === 'dismissed';

  const handleAction = (e, status) => {
    e.stopPropagation();
    updateStatus(rec, status);
    playSound(status === 'resolved' ? 'resolve' : status === 'dismissed' ? 'dismiss' : 'click');
  };

  const handleImplement = (e, mode, approachId) => {
    e.stopPropagation();
    const project = projects.find(p => p.slug === rec.project);
    if (!project || !project.repoPath) return;
    const existing = implementationSessions.find(
      s => s.recTimestamp === rec.timestamp && s.recTitle === rec.title && s.status === 'running'
    );
    if (existing) return;
    startImplementation(rec, project, mode, approachId);
    playSound('spawn');
  };

  return (
    <div
      className={`p-3 rounded-lg border-l-2 border transition-all cursor-pointer animate-slide-up ${
        isResolved
          ? 'bg-forge-bg/20 border-forge-border/30 opacity-50 border-l-transparent'
          : 'bg-forge-bg/50 border-forge-border hover:border-forge-accent-blue/30'
      }`}
      style={!isResolved ? { borderLeftColor: 'transparent' } : undefined}
      onMouseEnter={(e) => { if (!isResolved) e.currentTarget.style.borderLeftColor = rec.agentColor; }}
      onMouseLeave={(e) => { if (!isResolved) e.currentTarget.style.borderLeftColor = 'transparent'; }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Agent + Project tags */}
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium"
              style={{
                backgroundColor: `${rec.agentColor}15`,
                color: rec.agentColor,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: rec.agentColor }}
              />
              {rec.agent}
            </span>
            <span className="text-xs text-forge-text-muted">{projectName}</span>
            {rec.boldness && (
              <span className={`text-xs font-medium ${
                rec.boldness === 'wild' ? 'text-red-400' :
                rec.boldness === 'spicy' ? 'text-orange-400' :
                'text-green-400'
              }`}>
                {rec.boldness === 'wild' ? 'WILD' : rec.boldness === 'spicy' ? 'SPICY' : 'SAFE'}
              </span>
            )}
            {isResolved && (
              <span className="text-xs flex items-center gap-1.5">
                {rec.resolvedBy === 'auto-implement' ? (
                  <span className="text-green-400 font-medium">{'\u26A1'} IMPLEMENTED</span>
                ) : rec.status === 'resolved' ? (
                  <span className="text-green-400/70">{'\u2713'} Resolved</span>
                ) : (
                  <span className="text-forge-text-muted">{'\u2014'} Dismissed</span>
                )}
                {(rec.resolvedAt || rec.dismissedAt) && (
                  <span className="text-forge-text-muted/50">
                    {formatRelativeTime(rec.resolvedAt || rec.dismissedAt)}
                  </span>
                )}
                <button
                  onClick={(e) => handleAction(e, 'active')}
                  className="ml-1 px-1.5 py-0.5 rounded text-[10px] border border-forge-border/50 text-forge-text-muted
                             hover:text-amber-400 hover:border-amber-400/30 transition-colors"
                  title="Restore to active recommendations"
                >
                  Restore
                </button>
              </span>
            )}
          </div>

          {/* Title */}
          <div className={`text-sm font-medium leading-tight ${isResolved ? 'text-forge-text-muted line-through' : 'text-forge-text-primary'}`}>
            {recDisplayTitle(rec)}
          </div>

          {/* Summary */}
          <div className="text-sm text-forge-text-secondary mt-1 leading-relaxed">
            {rec.summary}
          </div>
          <RecFileActions rec={rec} />
        </div>

        {/* Expand indicator */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span
            className="text-forge-text-muted text-xs inline-block transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            {'\u25BC'}
          </span>
          {rec.approaches && (
            <span className="text-[11px] text-forge-text-muted">
              {rec.approaches.length} options
            </span>
          )}
        </div>
      </div>

      {/* Expanded: Approaches */}
      {expanded && (
        <div className="mt-4 space-y-2">
          {rec.approaches && rec.approaches.map((approach) => (
            <div
              key={approach.id}
              className={`p-3 rounded-lg border transition-all ${
                rec.recommended === approach.id
                  ? 'border-l-[3px] border-forge-accent/40 bg-forge-accent/5'
                  : 'border-forge-border/50 bg-forge-surface/30'
              }`}
              style={rec.recommended === approach.id ? { borderLeftColor: '#C52638' } : undefined}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {rec.recommended === approach.id && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-forge-accent/20 text-forge-accent uppercase tracking-wider">
                      Recommended
                    </span>
                  )}
                  <span className="text-sm font-semibold text-forge-text-primary">
                    {approach.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {approach.effort && (
                    <span className={`text-xs ${EFFORT_COLORS[approach.effort] || 'text-forge-text-muted'}`}>
                      Effort: {approach.effort}
                    </span>
                  )}
                  {approach.impact && (
                    <span className={`text-xs ${IMPACT_COLORS[approach.impact] || 'text-forge-text-muted'}`}>
                      Impact: {approach.impact}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm text-forge-text-secondary leading-relaxed">
                {approach.description}
              </p>
              {approach.trade_offs && (
                <p className="text-xs text-forge-text-muted mt-2 italic leading-relaxed">
                  Trade-offs: {approach.trade_offs}
                </p>
              )}
              {/* Per-approach Plan/Auto buttons */}
              {!isResolved && rec.implementable !== false && (
                <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-forge-border/20">
                  <button
                    onClick={(e) => handleImplement(e, 'plan', approach.id)}
                    disabled={!window.electronAPI}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-forge-accent-blue/10 text-forge-accent-blue
                               border border-forge-accent-blue/20 hover:bg-forge-accent-blue/20 transition-colors
                               disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {'\u25B6'} Plan
                  </button>
                  <button
                    onClick={(e) => handleImplement(e, 'auto', approach.id)}
                    disabled={!window.electronAPI}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-400/10 text-orange-400
                               border border-orange-400/20 hover:bg-orange-400/20 transition-colors
                               disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {'\u26A1'} Auto
                  </button>
                  {rec.recommended === approach.id && (
                    <span className="text-[11px] text-forge-text-muted/50 ml-1">recommended</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Reasoning */}
          {rec.reasoning && (
            <div className="mt-3 p-3 rounded-lg border-l-2 border-forge-accent/30 bg-forge-surface/20">
              <div className="text-xs font-medium text-forge-accent uppercase tracking-wider mb-1">
                Why this approach
              </div>
              <p className="text-sm text-forge-text-secondary leading-relaxed">
                {rec.reasoning}
              </p>
            </div>
          )}

          {/* Chart data visualization */}
          {rec.chartData && <ChartRenderer chartData={rec.chartData} />}

          {/* Action buttons */}
          <div className="mt-3 pt-3 border-t border-forge-border/30 flex items-center gap-2">
            {!isResolved ? (
              <>
                <button
                  onClick={(e) => handleAction(e, 'resolved')}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-green-400/10 text-green-400
                             border border-green-400/20 hover:bg-green-400/20 transition-colors"
                >
                  Resolve
                </button>
                <button
                  onClick={(e) => handleAction(e, 'dismissed')}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-forge-text-muted
                             border border-forge-border hover:text-forge-text-secondary hover:border-forge-text-muted/30 transition-colors"
                >
                  Dismiss
                </button>
              </>
            ) : (
              <button
                onClick={(e) => handleAction(e, 'active')}
                className="px-4 py-2 text-xs font-medium rounded-lg text-forge-text-muted
                           border border-forge-border hover:text-forge-text-secondary transition-colors"
              >
                Reopen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
