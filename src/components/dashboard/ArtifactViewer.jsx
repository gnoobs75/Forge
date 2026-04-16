import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { playSound } from '../../utils/sounds';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

const ARTIFACT_TYPES = {
  'store-description': { icon: '\uD83D\uDCDD', label: 'Store Description', color: '#22C55E' },
  'press-kit': { icon: '\uD83D\uDCF0', label: 'Press Kit', color: '#3B82F6' },
  'social-post': { icon: '\uD83D\uDCF1', label: 'Social Post', color: '#EC4899' },
  'checklist': { icon: '\u2611', label: 'Checklist', color: '#EAB308' },
  'keywords': { icon: '\uD83D\uDD0D', label: 'Keywords', color: '#06B6D4' },
  'trailer-script': { icon: '\uD83C\uDFAC', label: 'Trailer Script', color: '#F97316' },
  'competitor-report': { icon: '\uD83D\uDCCA', label: 'Competitor Report', color: '#8B5CF6' },
  'pricing-model': { icon: '\uD83D\uDCB0', label: 'Pricing Model', color: '#10B981' },
};

// Sample artifacts for dev mode
const SAMPLE_ARTIFACTS = [
  {
    id: 'art-1',
    type: 'store-description',
    title: 'Expedition Steam Store Description — Short Copy',
    agent: 'Store Optimizer',
    agentColor: '#22C55E',
    project: 'expedition',
    content: `Command the Flying Dutchman, a captured alien starcarrier, in this tactical space strategy game set in the Expeditionary Force universe.

Build your fleet from salvaged alien tech. Mine asteroids, dock with stations, and craft weapons from raw materials — no currency, just engineering.

12 alien factions. 152 ships. 41 sectors. One species' fight for survival.

FEATURES:
• Carrier command — manage a fleet, not a fighter
• Tactical pause combat with real-time action
• 100% material economy — every ship built from ore and salvage
• 130+ voiced lines from Skippy, your sarcastic AI companion
• Campaign across 4 galactic rings`,
    createdAt: '2026-03-09T10:00:00Z',
  },
  {
    id: 'art-2',
    type: 'checklist',
    title: 'TTR iOS Launch Readiness Checklist',
    agent: 'QA Advisor',
    agentColor: '#EF4444',
    project: 'ttr-ios',
    content: `LAUNCH READINESS — Turd Tunnel Rush iOS

[ ] Core Gameplay
  [x] Player controller smooth on all supported devices
  [x] Trick system combo detection reliable
  [x] Pipe generation variety adequate for 5+ min sessions
  [ ] Crash on iPhone X with iOS 16.x fixed
  [ ] Memory leak in particle pool after 200+ pipes

[ ] Platform Integration
  [ ] Game Center achievements (15 of 30 wired)
  [ ] Haptic feedback on trick land / stomp
  [ ] Notch handling on all device sizes
  [ ] AdMob integration tested
  [ ] IAP purchase flow verified

[ ] Store Assets
  [ ] App icon (1024x1024)
  [ ] 6.7" screenshots (6 required)
  [ ] 6.1" screenshots (6 required)
  [ ] App Preview video (30 seconds)
  [ ] Description copy final
  [ ] Keywords researched and set`,
    createdAt: '2026-03-09T11:00:00Z',
  },
  {
    id: 'art-3',
    type: 'social-post',
    title: 'TTR Launch Week TikTok Post Templates',
    agent: 'Content Producer',
    agentColor: '#EC4899',
    project: 'ttr-ios',
    content: `POST 1 — REVEAL
Hook: "We made a game where you play as a poop surfing through sewers and it's actually... good?"
[Show gameplay montage — 3s trick combo, speed tunnel, creature stomp]
CTA: "Link in bio. Free on the App Store."
Sound: Trending audio (check day of)
Hashtags: #indiegame #mobilegame #newgame #turdtunnelrush #sewerrunner

POST 2 — CHALLENGE
Hook: "Can you beat our dev's high score?"
[Show a specific seed code, your score, challenge viewers]
CTA: "Enter seed code [XXXXX] and post your run. Best score gets..."
Sound: Competition/hype trending audio

POST 3 — BEHIND THE SCENES
Hook: "POV: You're an indie dev and your game is about toilet humor"
[Show dev setup → code → game footage → laugh at your own game]
CTA: "Sometimes you just gotta trust the vision"
Sound: Any trending "trust the process" audio`,
    createdAt: '2026-03-09T12:00:00Z',
  },
  {
    id: 'art-4',
    type: 'keywords',
    title: 'TTR iOS App Store Keyword Strategy',
    agent: 'Store Optimizer',
    agentColor: '#22C55E',
    project: 'ttr-ios',
    content: `PRIMARY KEYWORDS (subtitle/title):
• sewer runner (low competition, high volume)
• trick racer (moderate competition)

KEYWORD FIELD (100 chars):
sewer,runner,trick,racer,pipe,tunnel,surf,flip,combo,stunt,turd,poop,gross,skateboard,racing,endless

COMPETITOR GAPS FOUND:
• "sewer runner" — 0 direct results, 4.2K monthly searches
• "pipe racer" — 2 results, 1.8K monthly searches
• "trick runner" — 5 results, 3.1K monthly searches

AVOID (saturated):
• "endless runner" — 2.4K competing apps
• "subway" — dominated by Subway Surfers
• "runner game" — generic, low conversion`,
    createdAt: '2026-03-09T13:00:00Z',
  },
];

export default function ArtifactViewer() {
  const projects = useStore((s) => s.projects);
  const [filterProject, setFilterProject] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  // In Electron, would load from hq-data/projects/{slug}/artifacts/
  // For now, use sample data
  const artifacts = SAMPLE_ARTIFACTS;

  const filtered = useMemo(() => {
    return artifacts.filter(a => {
      if (filterProject !== 'all' && a.project !== filterProject) return false;
      if (filterType !== 'all' && a.type !== filterType) return false;
      return true;
    });
  }, [artifacts, filterProject, filterType]);

  const copyContent = (content) => {
    navigator.clipboard.writeText(content);
    playSound('copy');
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="input-field !w-auto !py-1.5 text-xs"
        >
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="input-field !w-auto !py-1.5 text-xs"
        >
          <option value="all">All Types</option>
          {Object.entries(ARTIFACT_TYPES).map(([id, t]) => (
            <option key={id} value={id}>{t.icon} {t.label}</option>
          ))}
        </select>

        <span className="text-xs text-forge-text-muted ml-auto">{filtered.length} artifacts</span>
      </div>

      {/* Type summary chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {Object.entries(ARTIFACT_TYPES).map(([id, type]) => {
          const count = artifacts.filter(a => a.type === id).length;
          if (count === 0) return null;
          return (
            <button
              key={id}
              onClick={() => setFilterType(filterType === id ? 'all' : id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors ${
                filterType === id
                  ? 'bg-forge-accent/10 border border-forge-accent/30 text-forge-accent'
                  : 'bg-forge-surface border border-forge-border text-forge-text-muted hover:text-forge-text-secondary'
              }`}
            >
              <span>{type.icon}</span>
              <span>{type.label}</span>
              <span className="text-[10px] opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Artifact cards */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-sm text-forge-text-muted">No artifacts match your filters</p>
            <p className="text-xs text-forge-text-muted/60 mt-1">
              Agents produce artifacts when they generate store copy, checklists, or reports
            </p>
          </div>
        ) : (
          filtered.map(artifact => {
            const typeInfo = ARTIFACT_TYPES[artifact.type] || { icon: '\uD83D\uDCC4', label: artifact.type, color: '#64748B' };
            const isExpanded = expandedId === artifact.id;

            return (
              <div
                key={artifact.id}
                className={`card !p-3 cursor-pointer transition-all ${isExpanded ? '!bg-forge-surface-hover' : ''}`}
                onClick={() => setExpandedId(isExpanded ? null : artifact.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{typeInfo.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-forge-text-primary">{artifact.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium" style={{ color: artifact.agentColor }}>{artifact.agent}</span>
                      <span className="text-[11px] text-forge-text-muted">{projects.find(p => p.slug === artifact.project)?.name}</span>
                      <span className="text-[11px] text-forge-text-muted/50">{formatRelativeTime(artifact.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); copyContent(artifact.content); }}
                      className="px-2.5 py-1 text-xs text-forge-text-muted border border-forge-border rounded hover:text-forge-accent-blue hover:border-forge-accent-blue/30 transition-colors"
                    >
                      Copy
                    </button>
                    <span
                      className="text-forge-text-muted text-xs transition-transform duration-200"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      {'\u25BC'}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-forge-border/30">
                    <pre className="text-xs text-forge-text-secondary whitespace-pre-wrap font-mono leading-relaxed bg-forge-bg/50 p-3 rounded-lg max-h-[400px] overflow-y-auto">
                      {artifact.content}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
