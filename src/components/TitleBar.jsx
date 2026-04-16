import React from 'react';
import { useStore } from '../store/useStore';

const AGENT_COLORS = {
  'market-analyst': '#3B82F6',
  'store-optimizer': '#22C55E',
  'growth-strategist': '#F97316',
  'brand-director': '#8B5CF6',
  'content-producer': '#EC4899',
  'community-manager': '#06B6D4',
  'qa-advisor': '#EF4444',
  'studio-producer': '#EAB308',
  'monetization': '#10B981',
  'player-psych': '#7C3AED',
  'art-director': '#F59E0B',
  'creative-thinker': '#FF6B6B',
};

const AGENT_NAMES = {
  'market-analyst': 'Market Analyst',
  'store-optimizer': 'Store Optimizer',
  'growth-strategist': 'Growth Strategist',
  'brand-director': 'Brand Director',
  'content-producer': 'Content Producer',
  'community-manager': 'Community Manager',
  'qa-advisor': 'QA Advisor',
  'studio-producer': 'Studio Producer',
  'monetization': 'Monetization',
  'player-psych': 'Player Psych',
  'art-director': 'Art Director',
  'creative-thinker': 'Creative Thinker',
};

export default function TitleBar() {
  const activeProject = useStore((s) => s.activeProject);
  const projects = useStore((s) => s.projects);
  const setActiveProject = useStore((s) => s.setActiveProject);
  const setActiveAgent = useStore((s) => s.setActiveAgent);
  const setShowNewProjectModal = useStore((s) => s.setShowNewProjectModal);
  const recommendations = useStore((s) => s.recommendations);

  // Agents with recommendations in last 24hrs
  const recentAgents = React.useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const active = new Set();
    recommendations.forEach((r) => {
      if (new Date(r.timestamp).getTime() > cutoff && r.status !== 'resolved' && r.status !== 'dismissed') {
        // Map agent name to agent id
        const id = Object.entries(AGENT_NAMES).find(([, name]) => name === r.agent)?.[0];
        if (id) active.add(id);
      }
    });
    return active;
  }, [recommendations]);

  return (
    <div
      className="h-9 flex items-center justify-between px-4 select-none"
      style={{
        WebkitAppRegion: 'drag',
        background: 'linear-gradient(180deg, #242430 0%, #18181C 100%)',
        boxShadow: '0 1px 0 0 #3F465B, 0 4px 12px -4px rgba(0,0,0,0.3)',
      }}
    >
      {/* Left: App title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-forge-accent flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">C</span>
          </div>
          <span className="font-mono text-sm font-semibold text-forge-text-primary tracking-wide">
            The Forge
          </span>
        </div>
      </div>

      {/* Center: Project switcher */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
        {projects.map((project) => (
          <button
            key={project.slug}
            onClick={() => setActiveProject(project.slug)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeProject === project.slug
                ? 'bg-forge-surface-hover text-forge-text-primary'
                : 'text-forge-text-secondary hover:text-forge-text-primary hover:bg-forge-surface'
            }`}
          >
            {project.name}
          </button>
        ))}
        <button
          onClick={() => setShowNewProjectModal(true)}
          className="px-2 py-1 rounded text-xs text-forge-text-muted hover:text-forge-text-secondary hover:bg-forge-surface transition-colors"
        >
          +
        </button>
      </div>

      {/* Right: Agent status dots */}
      <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' }}>
        {Object.entries(AGENT_COLORS).map(([agent, color]) => {
          const isActive = recentAgents.has(agent);
          return (
            <div
              key={agent}
              onClick={() => setActiveAgent(agent)}
              className={`w-2 h-2 rounded-full hover:opacity-100 transition-opacity cursor-pointer ${
                isActive ? 'opacity-70 animate-pulse-glow' : 'opacity-40'
              }`}
              style={{ backgroundColor: color }}
              title={AGENT_NAMES[agent] || agent.replace(/-/g, ' ')}
            />
          );
        })}
      </div>
    </div>
  );
}
