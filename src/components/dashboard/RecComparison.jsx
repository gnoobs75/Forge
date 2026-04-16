import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';

const EFFORT_COLORS = {
  none: 'text-green-400', low: 'text-green-400', medium: 'text-yellow-400', high: 'text-orange-400',
};
const IMPACT_COLORS = {
  baseline: 'text-forge-text-muted', low: 'text-orange-400', medium: 'text-yellow-400', high: 'text-green-400',
};

export default function RecComparison() {
  const recommendations = useStore((s) => s.recommendations);
  const projects = useStore((s) => s.projects);
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedRecs, setSelectedRecs] = useState([]);

  // Group recs by project
  const recsByProject = useMemo(() => {
    const groups = {};
    for (const r of recommendations) {
      const key = r.project || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [recommendations]);

  // Filtered recs for comparison pool
  const availableRecs = useMemo(() => {
    if (selectedProject === 'all') return recommendations;
    return recommendations.filter(r => r.project === selectedProject);
  }, [recommendations, selectedProject]);

  // Currently selected recs for comparison
  const comparedRecs = useMemo(() => {
    return selectedRecs.map(id => recommendations.find(r => `${r.timestamp}-${r.title}` === id)).filter(Boolean);
  }, [selectedRecs, recommendations]);

  const toggleRec = (rec) => {
    const id = `${rec.timestamp}-${rec.title}`;
    setSelectedRecs(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const clearSelection = () => setSelectedRecs([]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedProject}
          onChange={(e) => { setSelectedProject(e.target.value); setSelectedRecs([]); }}
          className="input-field !w-auto !py-1.5 text-xs"
        >
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>

        {selectedRecs.length > 0 && (
          <button onClick={clearSelection} className="text-xs text-forge-text-muted hover:text-red-400 transition-colors">
            Clear selection ({selectedRecs.length})
          </button>
        )}

        <span className="text-xs text-forge-text-muted ml-auto">
          Select 2+ recommendations to compare
        </span>
      </div>

      {/* Comparison View */}
      {comparedRecs.length >= 2 ? (
        <div className="card">
          <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-4 border-l-2 border-forge-accent pl-3">
            Comparing {comparedRecs.length} Recommendations
          </h3>

          {/* Comparison Grid */}
          <div className="overflow-x-auto">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${comparedRecs.length}, minmax(250px, 1fr))` }}>
              {comparedRecs.map((rec) => (
                <ComparisonColumn key={`${rec.timestamp}-${rec.title}`} rec={rec} />
              ))}
            </div>
          </div>

          {/* Approach comparison table */}
          <div className="mt-4 pt-4 border-t border-forge-border/30">
            <h4 className="text-xs font-mono text-forge-text-secondary uppercase mb-3">Approach Comparison</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-forge-border/30">
                    <th className="text-left py-2 px-2 text-forge-text-muted font-medium">Agent</th>
                    <th className="text-left py-2 px-2 text-forge-text-muted font-medium">Recommended</th>
                    <th className="text-left py-2 px-2 text-forge-text-muted font-medium">Effort</th>
                    <th className="text-left py-2 px-2 text-forge-text-muted font-medium">Impact</th>
                    <th className="text-left py-2 px-2 text-forge-text-muted font-medium">Trade-offs</th>
                  </tr>
                </thead>
                <tbody>
                  {comparedRecs.map((rec) => {
                    const approach = rec.approaches?.find(a => a.id === rec.recommended);
                    return (
                      <tr key={`${rec.timestamp}-${rec.title}`} className="border-b border-forge-border/10 hover:bg-forge-bg/30">
                        <td className="py-2 px-2 font-medium" style={{ color: rec.agentColor }}>{rec.agent}</td>
                        <td className="py-2 px-2 text-forge-text-primary">{approach?.name || 'N/A'}</td>
                        <td className={`py-2 px-2 ${EFFORT_COLORS[approach?.effort] || 'text-forge-text-muted'}`}>{approach?.effort || '-'}</td>
                        <td className={`py-2 px-2 ${IMPACT_COLORS[approach?.impact] || 'text-forge-text-muted'}`}>{approach?.impact || '-'}</td>
                        <td className="py-2 px-2 text-forge-text-muted italic">{approach?.trade_offs || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {/* Selection List */}
      <div className="card">
        <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
          Select Recommendations
        </h3>
        <div className="space-y-1.5">
          {availableRecs.map((rec) => {
            const id = `${rec.timestamp}-${rec.title}`;
            const isSelected = selectedRecs.includes(id);
            return (
              <button
                key={id}
                onClick={() => toggleRec(rec)}
                className={`w-full text-left flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-forge-accent/10 border border-forge-accent/30'
                    : 'bg-forge-bg/50 border border-transparent hover:bg-forge-surface-hover'
                }`}
              >
                <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-[10px] ${
                  isSelected ? 'border-forge-accent bg-forge-accent text-white' : 'border-forge-border'
                }`}>
                  {isSelected && '\u2713'}
                </div>
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: rec.agentColor }}
                />
                <span className="text-xs font-medium" style={{ color: rec.agentColor }}>{rec.agent}</span>
                <span className="text-sm text-forge-text-primary truncate">{rec.title}</span>
                <span className="text-[11px] text-forge-text-muted ml-auto flex-shrink-0">
                  {projects.find(p => p.slug === rec.project)?.name || rec.project}
                </span>
              </button>
            );
          })}
          {availableRecs.length === 0 && (
            <p className="text-sm text-forge-text-muted text-center py-4">No recommendations to compare</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ComparisonColumn({ rec }) {
  const approach = rec.approaches?.find(a => a.id === rec.recommended);

  return (
    <div className="p-3 rounded-lg border border-forge-border/50 bg-forge-bg/30">
      {/* Agent header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: rec.agentColor }} />
        <span className="text-xs font-medium" style={{ color: rec.agentColor }}>{rec.agent}</span>
        {rec.boldness && (
          <span className={`text-[10px] font-medium ${
            rec.boldness === 'wild' ? 'text-red-400' :
            rec.boldness === 'spicy' ? 'text-orange-400' : 'text-green-400'
          }`}>
            {rec.boldness.toUpperCase()}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="text-sm font-semibold text-forge-text-primary mb-1.5">{rec.title}</h4>

      {/* Summary */}
      <p className="text-xs text-forge-text-secondary leading-relaxed mb-3">{rec.summary}</p>

      {/* Recommended approach */}
      {approach && (
        <div className="p-2 rounded-lg bg-forge-surface/50 border border-forge-accent/20">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-forge-accent uppercase">Recommended</span>
            <span className="text-xs font-medium text-forge-text-primary">{approach.name}</span>
          </div>
          <p className="text-[11px] text-forge-text-secondary leading-relaxed">{approach.description}</p>
          <div className="flex items-center gap-3 mt-1.5">
            {approach.effort && (
              <span className={`text-[11px] ${EFFORT_COLORS[approach.effort]}`}>
                Effort: {approach.effort}
              </span>
            )}
            {approach.impact && (
              <span className={`text-[11px] ${IMPACT_COLORS[approach.impact]}`}>
                Impact: {approach.impact}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Reasoning */}
      {rec.reasoning && (
        <p className="text-[11px] text-forge-text-muted italic mt-2 leading-relaxed">
          {rec.reasoning}
        </p>
      )}
    </div>
  );
}
