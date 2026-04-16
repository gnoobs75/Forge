import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { playSound } from '../../utils/sounds';

const STATUS_ICONS = {
  'done': '\u2713',
  'in-progress': '\u25B6',
  'blocked': '\u26D4',
  'not-started': '\u25CB',
};

const STATUS_COLORS = {
  'done': 'text-green-400',
  'in-progress': 'text-cyan-400',
  'blocked': 'text-red-400',
  'not-started': 'text-forge-text-muted',
};

const SEVERITY_COLORS = {
  P0: 'border-red-500 bg-red-500/10 text-red-400',
  P1: 'border-orange-400 bg-orange-400/10 text-orange-400',
  P2: 'border-yellow-400 bg-yellow-400/10 text-yellow-400',
};

function getBarColor(score) {
  if (score >= 80) return '#22C55E';
  if (score >= 50) return '#EAB308';
  return '#EF4444';
}

export default function ProgressDetail({ slug, project }) {
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      if (window.electronAPI?.hq) {
        const result = await window.electronAPI.hq.readFile(`projects/${slug}/progress.json`);
        if (!cancelled && result.ok) {
          try {
            setProgressData(JSON.parse(result.data));
          } catch { /* skip */ }
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [slug]);

  const handleRequestAssessment = () => {
    const store = useStore.getState();
    store.startAutomationTask('qa-advisor', 'QA Advisor', project,
      `Run a comprehensive quality and progress assessment for ${project.name}. Update progress.json with your findings.`
    );
    playSound('spawn');
  };

  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="h-32 bg-forge-surface-hover rounded" />
      </div>
    );
  }

  if (!progressData) {
    return (
      <div className="card text-center py-6">
        <p className="text-sm text-forge-text-muted">No progress breakdown available yet</p>
        <button
          onClick={handleRequestAssessment}
          disabled={!window.electronAPI}
          className="mt-3 px-4 py-2 text-xs font-medium rounded-lg bg-forge-accent/10 text-forge-accent
                     border border-forge-accent/20 hover:bg-forge-accent/20 transition-colors
                     disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Request QA Assessment
        </button>
      </div>
    );
  }

  const categories = Object.entries(progressData.categories || {});

  return (
    <div className="card space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider border-l-2 border-forge-accent pl-3">
          Progress Breakdown
        </h3>
        <div className="flex items-center gap-3">
          {progressData.lastAssessed && (
            <span className="text-[10px] text-forge-text-muted">
              Last assessed: {formatRelativeTime(progressData.lastAssessed)}
              {progressData.assessedBy && ` by ${progressData.assessedBy}`}
            </span>
          )}
          <button
            onClick={handleRequestAssessment}
            disabled={!window.electronAPI}
            className="px-3 py-1.5 text-[10px] font-medium rounded-lg bg-red-400/10 text-red-400
                       border border-red-400/20 hover:bg-red-400/20 transition-colors
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Request QA Assessment
          </button>
        </div>
      </div>

      {/* Main ring + categories grid */}
      <div className="flex gap-6">
        {/* Large progress ring */}
        <div className="flex-shrink-0 flex flex-col items-center justify-center">
          <LargeProgressRing progress={progressData.overall} />
          <span className="text-[10px] text-forge-text-muted mt-2">Overall</span>
        </div>

        {/* Category bars */}
        <div className="flex-1 space-y-2.5">
          {categories.map(([key, cat]) => (
            <CategoryBar key={key} category={cat} />
          ))}
        </div>
      </div>

      {/* Blockers */}
      {progressData.blockers && progressData.blockers.length > 0 && (
        <div>
          <h4 className="text-[11px] font-mono font-semibold text-red-400 uppercase tracking-wider mb-2">
            Blockers ({progressData.blockers.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {progressData.blockers.map((b, i) => (
              <div
                key={i}
                className={`px-3 py-2.5 rounded-lg border-l-2 ${SEVERITY_COLORS[b.severity] || SEVERITY_COLORS.P2}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold">{b.severity}</span>
                  <span className="text-xs">{b.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Changes */}
      {progressData.recentChanges && progressData.recentChanges.length > 0 && (
        <div>
          <h4 className="text-[11px] font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-2">
            Recent Changes
          </h4>
          <div className="space-y-1.5">
            {progressData.recentChanges.slice(0, 5).map((c, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="text-forge-text-muted font-mono text-[10px] w-20 flex-shrink-0">
                  {c.date}
                </span>
                <span className="text-forge-text-secondary flex-1">{c.change}</span>
                {c.impact && (
                  <span className="text-green-400 font-mono text-[10px]">{c.impact}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LargeProgressRing({ progress }) {
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference - (progress / 100) * circumference;
  const color = getBarColor(progress);

  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#3F465B" strokeWidth="6" />
      <circle
        cx="50" cy="50" r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform="rotate(-90 50 50)"
        className="transition-all duration-700"
      />
      <text x="50" y="50" textAnchor="middle" dy="0.35em" fill={color}
            className="text-xl font-mono font-bold" style={{ fontSize: '22px' }}>
        {progress}%
      </text>
    </svg>
  );
}

function CategoryBar({ category }) {
  const [expanded, setExpanded] = useState(false);
  const color = getBarColor(category.score);
  const weightPct = Math.round(category.weight * 100);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full group"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-forge-text-secondary flex-1 text-left">{category.label}</span>
          <span className="text-[10px] text-forge-text-muted">{weightPct}% weight</span>
          <span className="text-xs font-mono font-bold" style={{ color }}>{category.score}%</span>
          <span className="text-[10px] text-forge-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
            {expanded ? '\u25B2' : '\u25BC'}
          </span>
        </div>
        <div className="h-2 rounded-full bg-forge-bg/80 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${category.score}%`, backgroundColor: color }}
          />
        </div>
      </button>

      {expanded && category.items && (
        <div className="mt-2 ml-2 space-y-1 pb-1">
          {category.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={`w-4 text-center ${STATUS_COLORS[item.status] || 'text-forge-text-muted'}`}>
                {STATUS_ICONS[item.status] || '\u25CB'}
              </span>
              <span className={`flex-1 ${item.status === 'done' ? 'text-forge-text-muted' : 'text-forge-text-secondary'}`}>
                {item.name}
              </span>
              {item.blocker && (
                <span className="text-[10px] text-red-400 font-mono">{item.blocker}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
