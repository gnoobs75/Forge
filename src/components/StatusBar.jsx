import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import PortPopover from './PortPopover';

const PHASE_LABELS = {
  concept: 'Concept',
  'pre-prod': 'Pre-Prod',
  production: 'Production',
  polish: 'Polish',
  'launch-prep': 'Launch Prep',
  launch: 'Launch',
  'live-ops': 'Live Ops',
};

const STATUS_COLORS = {
  up: '#22c55e',
  down: '#ef4444',
  occupied: '#eab308',
};

export default function StatusBar() {
  const projects = useStore((s) => s.projects);
  const recommendations = useStore((s) => s.recommendations);
  const agents = useStore((s) => s.agents);
  const portHealth = useStore((s) => s.portHealth);
  const [showPortPopover, setShowPortPopover] = useState(false);

  const stats = useMemo(() => {
    const avgProgress = projects.length > 0
      ? Math.round(projects.reduce((sum, p) => sum + p.progress, 0) / projects.length)
      : 0;

    const phaseCounts = {};
    projects.forEach((p) => {
      phaseCounts[p.phase] = (phaseCounts[p.phase] || 0) + 1;
    });

    const mostAdvanced = projects.reduce((best, p) => {
      const phases = Object.keys(PHASE_LABELS);
      return phases.indexOf(p.phase) > phases.indexOf(best.phase) ? p : best;
    }, projects[0]);

    return { avgProgress, phaseCounts, mostAdvanced };
  }, [projects]);

  const portDots = useMemo(() => {
    const health = portHealth?.health || [];
    // Only show dots for ports belonging to this app + occupied unknowns
    return health.filter(h => h.app === 'forge' || h.status === 'occupied');
  }, [portHealth]);

  const worstStatus = useMemo(() => {
    if (portDots.some(d => d.status === 'occupied')) return 'occupied';
    if (portDots.some(d => d.status === 'down')) return 'down';
    return 'up';
  }, [portDots]);

  const hasCollisions = (portHealth?.collisions?.length || 0) > 0;

  return (
    <div
      className="h-6 flex items-center justify-between px-4 text-[10px] font-mono select-none relative"
      style={{
        background: 'linear-gradient(0deg, #1e1e24 0%, #18181C 100%)',
        boxShadow: '0 -1px 0 0 rgba(42,58,92,0.5)',
      }}
    >
      {/* Left: project count + phase distribution */}
      <div className="flex items-center gap-4 text-forge-text-muted">
        <span>
          <span className="text-forge-text-secondary">{projects.length}</span> projects
        </span>
        <span>
          avg <span className="text-forge-text-secondary">{stats.avgProgress}%</span> ready
        </span>
        <span>
          <span className="text-forge-text-secondary">{recommendations.length}</span> recommendations
        </span>
      </div>

      {/* Right: port dots + connection status */}
      <div className="flex items-center gap-3 text-forge-text-muted">
        {/* Port health dots */}
        {portDots.length > 0 && (
          <button
            onClick={() => setShowPortPopover(!showPortPopover)}
            className="flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer bg-transparent border-none p-0"
            title={`${portDots.length} services — click for details`}
          >
            <span className="flex items-center gap-[3px]">
              {portDots.map((d) => (
                <span
                  key={d.port}
                  className={d.status === 'down' ? 'animate-pulse' : ''}
                  style={{
                    width: 5, height: 5, borderRadius: '50%',
                    backgroundColor: STATUS_COLORS[d.status],
                    boxShadow: `0 0 4px ${STATUS_COLORS[d.status]}55`,
                  }}
                  title={`${d.service} :${d.port} — ${d.status}`}
                />
              ))}
            </span>
            {(hasCollisions || worstStatus !== 'up') && (
              <span className="text-[9px] ml-0.5" style={{ color: STATUS_COLORS[hasCollisions ? 'occupied' : worstStatus] }}>
                {hasCollisions ? '!' : worstStatus === 'down' ? '!' : ''}
              </span>
            )}
          </button>
        )}

        <span className="text-forge-border">|</span>

        <span>
          <span className="text-green-400">{agents.length}</span> agents
        </span>
        <span className="flex items-center gap-1">
          {window.electronAPI ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Connected
            </>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-400 font-medium">
              Dev Mode
            </span>
          )}
        </span>
      </div>

      {/* Port popover */}
      {showPortPopover && (
        <PortPopover
          portHealth={portHealth}
          appId="forge"
          onClose={() => setShowPortPopover(false)}
        />
      )}
    </div>
  );
}
