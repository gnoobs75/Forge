import React from 'react';
import { useStore } from '../../store/useStore';

const PHASE_COLORS = {
  discovery: '#8B5CF6',
  design: '#06B6D4',
  build: '#3B82F6',
  test: '#EAB308',
  deploy: '#F97316',
  maintain: '#22C55E',
};

const PHASE_LABELS = {
  discovery: 'Discovery',
  design: 'Design',
  build: 'Build',
  test: 'Test',
  deploy: 'Deploy',
  maintain: 'Maintain',
};

const TECH_ICONS = {
  react: 'React',
  vue: 'Vue',
  node: 'Node',
  python: 'Python',
  postgres: 'PG',
  docker: 'Docker',
};

export default function ProjectCard({ project, index = 0 }) {
  const setActiveProject = useStore((s) => s.setActiveProject);
  const phaseColor = PHASE_COLORS[project.phase] || '#64748b';
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (project.progress / 100) * circumference;

  return (
    <div
      onClick={() => setActiveProject(project.slug)}
      className={`card cursor-pointer group relative overflow-hidden animate-slide-up stagger-${index + 1}`}
    >
      {/* Phase accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ backgroundColor: phaseColor, boxShadow: `0 2px 8px ${phaseColor}30` }}
      />

      <div className="flex items-start justify-between">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-forge-text-primary group-hover:text-forge-accent transition-colors truncate">
            {project.name}
          </h3>
          <p className="text-xs text-forge-text-secondary mt-0.5 truncate">
            {project.description}
          </p>

          {/* Tech Stack */}
          <div className="flex items-center gap-1.5 mt-2">
            {(project.techStack || project.platforms || []).slice(0, 3).map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 text-[10px] font-medium bg-forge-surface-hover rounded text-forge-text-secondary"
              >
                {TECH_ICONS[t] || t}
              </span>
            ))}
            {(project.techStack || project.platforms || []).length > 3 && (
              <span className="text-[10px] text-forge-text-muted">
                +{(project.techStack || project.platforms || []).length - 3}
              </span>
            )}
          </div>

          {/* Phase badge */}
          <div className="mt-3">
            <span
              className="badge"
              style={{
                backgroundColor: `${phaseColor}20`,
                color: phaseColor,
                borderColor: `${phaseColor}40`,
                borderWidth: '1px',
              }}
            >
              {PHASE_LABELS[project.phase] || project.phase}
            </span>
          </div>

          {/* Client */}
          {project.client && (
            <div className="mt-2 text-[10px] text-forge-text-muted">
              {project.client}
            </div>
          )}
        </div>

        {/* Progress Ring */}
        <div className="flex-shrink-0 ml-3">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <defs>
              <filter id={`glow-${project.slug}`}>
                <feGaussianBlur stdDeviation="2" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            {/* Background ring */}
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="#3F465B"
              strokeWidth="4"
            />
            {/* Progress ring */}
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke={phaseColor}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 40 40)"
              className="transition-all duration-700"
              filter={`url(#glow-${project.slug})`}
            />
            {/* Percentage text */}
            <text
              x="40"
              y="37"
              textAnchor="middle"
              className="fill-forge-text-primary"
              style={{ fontSize: '16px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}
            >
              {project.progress}%
            </text>
            <text
              x="40"
              y="50"
              textAnchor="middle"
              className="fill-forge-text-muted"
              style={{ fontSize: '8px', fontFamily: 'Inter, sans-serif' }}
            >
              READY
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}
