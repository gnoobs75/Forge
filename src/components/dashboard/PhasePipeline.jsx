import React from 'react';
import { useStore } from '../../store/useStore';

const PHASE_ORDER = ['discovery', 'design', 'build', 'test', 'deploy', 'maintain'];

export default function PhasePipeline() {
  const phases = useStore((s) => s.phases);
  const projects = useStore((s) => s.projects);

  // Find the furthest phase any project has reached
  const maxPhaseIndex = projects.reduce((max, p) => {
    const idx = PHASE_ORDER.indexOf(p.phase);
    return idx > max ? idx : max;
  }, -1);

  return (
    <div className="card">
      <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
        Phase Pipeline
      </h2>
      <div className="flex items-stretch gap-1">
        {phases.map((phase, i) => {
          const projectsInPhase = projects.filter((p) => p.phase === phase.id);
          const hasProjects = projectsInPhase.length > 0;
          const phaseIdx = PHASE_ORDER.indexOf(phase.id);
          const isReached = phaseIdx <= maxPhaseIndex;

          return (
            <div
              key={phase.id}
              className={`flex-1 rounded-lg p-2 transition-all duration-200 ${
                hasProjects
                  ? 'bg-forge-surface-hover'
                  : 'bg-forge-surface/50'
              }`}
              style={{
                borderBottom: isReached ? `2px solid ${phase.color}` : '2px solid transparent',
              }}
            >
              {/* Phase header */}
              <div className="flex items-center gap-1 mb-2">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: phase.color }}
                />
                <span className="text-[10px] font-medium text-forge-text-secondary truncate">
                  {phase.name}
                </span>
              </div>

              {/* Projects in this phase */}
              <div className="space-y-1 min-h-[24px]">
                {projectsInPhase.map((project) => (
                  <button
                    key={project.slug}
                    onClick={() => useStore.getState().setActiveProject(project.slug)}
                    className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium
                             text-forge-text-primary bg-forge-bg/50 hover:bg-forge-bg
                             transition-colors truncate"
                    style={{
                      borderLeft: `2px solid ${phase.color}`,
                    }}
                  >
                    {project.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
