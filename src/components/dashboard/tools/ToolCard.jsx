import React from 'react';
import { playSound } from '../../../utils/sounds';

const FIDELITY_COLORS = {
  'iOS true':        '#22C55E',
  'iOS-like':        '#84CC16',
  'Android-native':  '#3B82F6',
  'Web':             '#06B6D4',
  'Neutral':         '#94A3B8',
};

export default function ToolCard({ tool, onLaunch }) {
  const chipColor = FIDELITY_COLORS[tool.fidelity] || FIDELITY_COLORS.Neutral;

  const handleLaunch = () => {
    playSound('click');
    onLaunch(tool);
  };

  return (
    <div className="card space-y-3 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-forge-text-primary truncate">{tool.name}</div>
          <div className="text-[11px] text-forge-text-muted mt-1 leading-relaxed">
            {tool.description}
          </div>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-mono whitespace-nowrap flex-shrink-0"
          style={{ backgroundColor: `${chipColor}22`, color: chipColor }}
          title={`Fidelity: ${tool.fidelity}`}
        >
          {tool.fidelity}
        </span>
      </div>

      {tool.setupRequired && (
        <div className="text-[10px] text-yellow-400/90 leading-snug border-l-2 border-yellow-400/40 pl-2">
          <span className="font-semibold">Setup required:</span> {tool.setupRequired}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto pt-2">
        <code className="text-[10px] font-mono text-forge-text-muted truncate flex-1" title={tool.command}>
          {tool.command}
        </code>
        <button
          onClick={handleLaunch}
          className="px-3 py-1.5 text-[11px] font-medium rounded
                     bg-forge-accent-blue/10 text-forge-accent-blue
                     border border-forge-accent-blue/30
                     hover:bg-forge-accent-blue/20 transition-colors
                     flex-shrink-0"
        >
          Launch
        </button>
      </div>
    </div>
  );
}
