import React, { useMemo } from 'react';
import { useStore } from '../../../store/useStore';

const PROJECT_COLORS = {
  expedition: '#3B82F6',
  'ttr-ios': '#22C55E',
  'ttr-roblox': '#F97316',
};

export default function StudioStatusCards({ fridayStatus }) {
  const projects = useStore((s) => s.projects);
  const activePersona = useStore((s) => s.activePersona);

  const theme = useMemo(() => activePersona.theme || {
    primary: '#D946EF', secondary: '#7E22CE', accent: '#F0ABFC',
  }, [activePersona.theme]);

  return (
    <div className="grid grid-cols-2 gap-2">
      {projects.map((project) => {
        const color = PROJECT_COLORS[project.slug] || '#6B7280';
        return (
          <div
            key={project.slug}
            className="bg-forge-bg rounded-lg border border-forge-border p-2.5"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[10px] font-semibold text-forge-text-primary truncate">
                {project.name}
              </span>
            </div>
            <div className="flex items-end justify-between">
              <span
                className="text-lg font-bold font-mono"
                style={{ color }}
              >
                {project.progress ?? 0}%
              </span>
              <span className="text-[9px] text-forge-text-muted capitalize">
                {project.phase?.replace('-', ' ') || 'unknown'}
              </span>
            </div>
            {/* Mini progress bar */}
            <div className="mt-1.5 h-1 rounded-full bg-forge-surface overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${project.progress ?? 0}%`,
                  backgroundColor: color,
                  opacity: 0.7,
                }}
              />
            </div>
          </div>
        );
      })}

      {/* Friday status card */}
      <div className="bg-forge-bg rounded-lg border border-forge-border p-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              fridayStatus === 'connected' ? 'animate-pulse' : ''
            }`}
            style={{
              backgroundColor:
                fridayStatus === 'connected'
                  ? theme.primary
                  : fridayStatus === 'connecting' || fridayStatus === 'reconnecting'
                  ? '#EAB308'
                  : '#6B7280',
            }}
          />
          <span className="text-[10px] font-semibold text-forge-text-primary">
            {activePersona.name}
          </span>
        </div>
        <div className="text-[10px] text-forge-text-secondary">Studio Director</div>
        <div
          className="text-[9px] mt-1 capitalize"
          style={{ color: fridayStatus === 'connected' ? theme.primary : '#6B7280' }}
        >
          {fridayStatus}
        </div>
      </div>
    </div>
  );
}
