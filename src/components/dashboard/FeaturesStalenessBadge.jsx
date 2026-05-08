// FeaturesStalenessBadge — surfaces how stale a project's features.json is
// (relative to the embedded `lastScanned` timestamp) and offers a one-click
// rescan via a Solutions Architect agent session.
//
// Color rules:
//   green  — < 7 days since last scan
//   yellow — 7–30 days
//   red    — > 30 days or never scanned
import React, { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { playSound } from '../../utils/sounds';

const COLORS = {
  green: { bg: '#22C55E15', border: '#22C55E40', text: '#22C55E' },
  yellow: { bg: '#EAB30815', border: '#EAB30840', text: '#EAB308' },
  red: { bg: '#EF444415', border: '#EF444440', text: '#EF4444' },
  gray: { bg: '#64748B15', border: '#64748B40', text: '#94A3B8' },
};

function bandFor(days) {
  if (days === null || days === undefined) return 'red';
  if (days < 7) return 'green';
  if (days <= 30) return 'yellow';
  return 'red';
}

export default function FeaturesStalenessBadge({ slug, compact = false }) {
  const projects = useStore(s => s.projects);
  const agents = useStore(s => s.agents);
  const startAgentSession = useStore(s => s.startAgentSession);

  const [lastScanned, setLastScanned] = useState(undefined); // undefined=loading, null=missing
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const api = window.electronAPI?.hq;
      if (!api) {
        if (!cancelled) setError('no-ipc');
        return;
      }
      try {
        const result = await api.readFile(`projects/${slug}/features.json`);
        if (cancelled) return;
        if (!result.ok) {
          setLastScanned(null);
          return;
        }
        try {
          const parsed = JSON.parse(result.data);
          setLastScanned(parsed.lastScanned || null);
        } catch {
          setLastScanned(null);
        }
      } catch {
        if (!cancelled) setLastScanned(null);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [slug]);

  const daysSince = lastScanned
    ? Math.floor((Date.now() - new Date(lastScanned).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const band = bandFor(daysSince);
  const color = COLORS[band];

  const label = daysSince === null
    ? 'Never scanned'
    : daysSince === 0
    ? 'Scanned today'
    : `${daysSince}d`;

  const tooltip = lastScanned
    ? `Features registry last scanned ${daysSince} days ago (${new Date(lastScanned).toLocaleDateString()})`
    : 'Features registry has never been scanned';

  const handleRescan = (e) => {
    e?.stopPropagation();
    e?.preventDefault();

    const project = projects.find(p => p.slug === slug);
    if (!project) return;
    const architect = agents.find(a => a.id === 'solutions-architect');
    if (!architect) return;

    const prompt = [
      `@SolutionsArchitect — features.json rescan requested for ${project.name} (${slug}).`,
      ``,
      `Run a full features registry scan on this project:`,
      ``,
      `1. Explore the actual codebase at ${project.repoPath}`,
      `2. Read the existing hq-data/projects/${slug}/features.json as a baseline`,
      `3. Walk the source tree — identify implemented systems, half-built TODOs,`,
      `   and any features that no longer exist (mark deprecated/removed).`,
      `4. Update each feature entry with current { status, description, codeFootprint, confidence }.`,
      `5. Add any new features discovered during the scan.`,
      `6. Update the top-level "lastScanned" field to the current ISO-8601 timestamp`,
      `   and "scannedBy" to "Solutions Architect (rescan triggered from Forge dashboard)".`,
      ``,
      `Write the full updated registry back to hq-data/projects/${slug}/features.json.`,
      `This is the source of truth used by every other agent.`,
    ].join('\n');

    startAgentSession(
      { ...architect, name: 'Solutions Architect (Features Rescan)' },
      project,
      { prompt, mode: 'auto', flags: '' }
    );
    playSound('spawn');
  };

  if (lastScanned === undefined && !error) {
    // Loading — render a faint placeholder to reserve layout space
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono"
        style={{ backgroundColor: COLORS.gray.bg, color: COLORS.gray.text, border: `1px solid ${COLORS.gray.border}` }}
        title="Loading features.json..."
      >
        ...
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={tooltip}
    >
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold"
        style={{
          backgroundColor: color.bg,
          color: color.text,
          border: `1px solid ${color.border}`,
        }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color.text }}
        />
        {compact ? label : `Features: ${label}`}
      </span>
      <button
        type="button"
        onClick={handleRescan}
        className="text-[9px] px-1.5 py-0.5 rounded font-medium border transition-colors
                   text-forge-text-muted border-forge-border hover:text-forge-accent hover:border-forge-accent/30
                   bg-forge-bg/40"
        title="Run a Solutions Architect features.json rescan on this project"
      >
        {'↻'} Rescan
      </button>
    </span>
  );
}
