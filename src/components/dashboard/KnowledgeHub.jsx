import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import parseContextMarkdown, {
  extractTechPills,
  extractCompetitors,
} from '../../utils/parseContextMarkdown';
import {
  SAMPLE_PROJECT_CONTEXTS,
  SAMPLE_DIR_INVENTORY,
} from '../../store/sampleData';

// Accent colors for tech pills (cycle through)
const PILL_COLORS = [
  '#3B82F6', '#22C55E', '#F97316', '#8B5CF6', '#EC4899',
  '#06B6D4', '#EAB308', '#EF4444', '#10B981', '#F59E0B',
];

// Agent hints for empty directories
const EMPTY_HINTS = {
  recommendations: 'Ask any agent for advice',
  checklists: 'Ask @QALead to create a test plan',
  'api-specs': 'Ask @APIDesigner to draft API specs',
  reports: 'Ask @SolutionsArchitect for an architecture report',
  benchmarks: 'Ask @PerformanceEngineer to run benchmarks',
};

const DIR_LABELS = {
  recommendations: 'Recommendations',
  checklists: 'Checklists',
  'api-specs': 'API Specs',
  reports: 'Reports',
  benchmarks: 'Benchmarks',
};

export default function KnowledgeHub({ slug, project }) {
  const [expanded, setExpanded] = useState(false);
  const [rawContext, setRawContext] = useState(null);
  const [dirInventory, setDirInventory] = useState(null);
  const knowledgeRefreshStatus = useStore((s) => s.knowledgeRefreshStatus);
  const knowledgeLastRefreshed = useStore((s) => s.knowledgeLastRefreshed);

  // Load context.md + directory inventory
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (window.electronAPI?.hq) {
        // Electron mode: read real files
        try {
          const ctxResult = await window.electronAPI.hq.readFile(
            `projects/${slug}/context.md`
          );
          if (!cancelled && ctxResult.ok) {
            setRawContext(ctxResult.data);
          }

          // Scan subdirectories for file counts
          const inv = {};
          for (const dir of Object.keys(DIR_LABELS)) {
            try {
              const dirResult = await window.electronAPI.hq.readDir(
                `projects/${slug}/${dir}`
              );
              inv[dir] = dirResult.ok
                ? dirResult.data.filter((f) => !f.isDirectory).length
                : 0;
            } catch {
              inv[dir] = 0;
            }
          }
          if (!cancelled) setDirInventory(inv);
        } catch (err) {
          console.warn('KnowledgeHub: could not load from files', err);
        }
      } else {
        // Dev/browser mode: use sample data
        if (!cancelled) {
          setRawContext(SAMPLE_PROJECT_CONTEXTS[slug] || null);
          setDirInventory(SAMPLE_DIR_INVENTORY[slug] || null);
        }
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [slug]);

  // Parse context markdown
  const parsed = useMemo(
    () => (rawContext ? parseContextMarkdown(rawContext) : null),
    [rawContext]
  );

  const techPills = useMemo(
    () => (parsed ? extractTechPills(parsed.sections) : []),
    [parsed]
  );

  const competitors = useMemo(
    () => (parsed ? extractCompetitors(parsed.sections) : []),
    [parsed]
  );

  // Summary stats for the always-visible bar
  const summaryPills = useMemo(() => {
    const pills = [];
    // Add key tech names
    techPills.slice(0, 3).forEach((t) => {
      const short = t.name.split(' ')[0]; // "Three.js", "Unity", "Roblox"
      pills.push(short);
    });
    if (competitors.length > 0) {
      pills.push(`${competitors.length} competitors`);
    }
    if (dirInventory) {
      const recCount = dirInventory.recommendations || 0;
      if (recCount > 0) pills.push(`${recCount} recs`);
    }
    // Phase
    if (project?.phase) {
      const phaseName =
        project.phase.charAt(0).toUpperCase() +
        project.phase.slice(1).replace('-', ' ');
      pills.push(phaseName);
    }
    return pills;
  }, [techPills, competitors, dirInventory, project]);

  if (!parsed && !rawContext) {
    return null; // No context available
  }

  const refreshBorderClass = knowledgeRefreshStatus === 'refreshing'
    ? 'knowledge-refreshing'
    : knowledgeRefreshStatus === 'recently-updated'
    ? 'border-green-400/40'
    : 'border-forge-border';

  return (
    <div className={`bg-forge-surface border rounded-xl overflow-hidden ${refreshBorderClass}`}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-forge-surface-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-base font-mono font-semibold text-forge-text-secondary uppercase tracking-wider">
            Knowledge Hub
          </h2>
          {/* Refresh status indicator */}
          {knowledgeRefreshStatus === 'refreshing' && (
            <span className="flex items-center gap-1.5 text-[10px] text-cyan-400">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Refreshing...
            </span>
          )}
          {knowledgeRefreshStatus === 'recently-updated' && knowledgeLastRefreshed && (
            <span className="flex items-center gap-1.5 text-[10px] text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              Updated {formatRelativeTime(knowledgeLastRefreshed)}
            </span>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {summaryPills.map((pill, i) => (
              <span
                key={i}
                className="px-3 py-1 text-sm font-medium rounded-full"
                style={{
                  backgroundColor: `${PILL_COLORS[i % PILL_COLORS.length]}15`,
                  color: PILL_COLORS[i % PILL_COLORS.length],
                }}
              >
                {pill}
              </span>
            ))}
          </div>
        </div>
        <span className="text-forge-text-muted text-base flex-shrink-0 ml-2">
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {/* Expandable body */}
      {expanded && parsed && (
        <div className="px-4 pb-4 space-y-1">
          {parsed.sections.map((section, i) => {
            // Special renderers for certain sections
            if (section.title.toLowerCase().includes('tech stack')) {
              return (
                <TechStackSection
                  key={i}
                  section={section}
                  pills={techPills}
                />
              );
            }
            if (
              section.title.toLowerCase().includes('competitor') ||
              section.title.toLowerCase().includes('competition')
            ) {
              return (
                <CompetitorSection
                  key={i}
                  section={section}
                  competitors={competitors}
                />
              );
            }
            if (section.title.toLowerCase().includes('differentiator')) {
              return (
                <CollapsibleSection
                  key={i}
                  title={section.title}
                  badge={`${section.items.filter((it) => it.type === 'numbered').length}`}
                  defaultOpen={false}
                >
                  <div className="space-y-2.5">
                    {section.items
                      .filter((it) => it.type === 'numbered')
                      .map((item, j) => (
                        <div key={j} className="flex gap-2.5 text-base">
                          <span className="text-forge-accent font-mono font-bold w-6 text-right flex-shrink-0">
                            {item.number}.
                          </span>
                          <span className="text-forge-text-secondary leading-relaxed">
                            {item.value}
                          </span>
                        </div>
                      ))}
                  </div>
                </CollapsibleSection>
              );
            }
            // Default: key-value + list renderer
            return (
              <CollapsibleSection
                key={i}
                title={section.title}
                defaultOpen={section.title.toLowerCase().includes('identity')}
              >
                <GenericSectionContent items={section.items} />
              </CollapsibleSection>
            );
          })}

          {/* Project Files inventory */}
          {dirInventory && (
            <CollapsibleSection title="Project Files" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(DIR_LABELS).map(([dir, label]) => {
                  const count = dirInventory[dir] || 0;
                  return (
                    <div
                      key={dir}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-forge-bg/50 border border-forge-border/50"
                    >
                      <span className="text-base text-forge-text-secondary">
                        {label}
                      </span>
                      {count > 0 ? (
                        <span className="text-base font-mono font-bold text-forge-accent">
                          {count}
                        </span>
                      ) : (
                        <span
                          className="text-sm text-forge-text-muted italic truncate ml-2 max-w-[200px]"
                          title={EMPTY_HINTS[dir]}
                        >
                          {EMPTY_HINTS[dir]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          )}
        </div>
      )}
    </div>
  );
}

// --- Collapsible Section ---
function CollapsibleSection({
  title,
  badge,
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-forge-border/30">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 py-3 px-1 text-left hover:bg-forge-surface-hover/50 transition-colors rounded"
      >
        <span className="text-forge-text-muted text-sm w-4">
          {open ? '\u25BC' : '\u25B6'}
        </span>
        <span className="text-base font-medium text-forge-text-primary">
          {title}
        </span>
        {badge && (
          <span className="px-2 py-0.5 text-sm font-mono font-bold rounded bg-forge-accent/15 text-forge-accent">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="pl-7 pb-4">{children}</div>}
    </div>
  );
}

// --- Generic section content ---
function GenericSectionContent({ items }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        if (item.type === 'kv') {
          return (
            <div key={i} className="flex gap-2.5 text-base">
              <span className="text-forge-text-muted font-medium whitespace-nowrap">
                {item.key}:
              </span>
              <span className="text-forge-text-secondary">{item.value}</span>
            </div>
          );
        }
        if (item.type === 'list' || item.type === 'text') {
          return (
            <div key={i} className="text-base text-forge-text-secondary flex gap-2">
              <span className="text-forge-text-muted">-</span>
              {item.value}
            </div>
          );
        }
        if (item.type === 'sub') {
          return (
            <div
              key={i}
              className="text-sm text-forge-text-muted pl-5 flex gap-2"
            >
              <span className="opacity-50">-</span>
              {item.value}
            </div>
          );
        }
        if (item.type === 'numbered') {
          return (
            <div key={i} className="flex gap-2.5 text-base">
              <span className="text-forge-accent font-mono font-bold w-6 text-right flex-shrink-0">
                {item.number}.
              </span>
              <span className="text-forge-text-secondary">{item.value}</span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

// --- Tech Stack Section ---
function TechStackSection({ section, pills }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-forge-border/30">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 py-3 px-1 text-left hover:bg-forge-surface-hover/50 transition-colors rounded"
      >
        <span className="text-forge-text-muted text-sm w-4">
          {open ? '\u25BC' : '\u25B6'}
        </span>
        <span className="text-base font-medium text-forge-text-primary">
          {section.title}
        </span>
        <span className="px-2 py-0.5 text-sm font-mono font-bold rounded bg-forge-accent/15 text-forge-accent">
          {pills.length}
        </span>
      </button>
      {open && (
        <div className="pl-7 pb-4">
          {/* Pills row */}
          <div className="flex flex-wrap gap-2.5 mb-4">
            {pills.map((pill, i) => (
              <span
                key={i}
                className="px-3 py-1.5 text-sm font-medium rounded-md border"
                style={{
                  backgroundColor: `${PILL_COLORS[i % PILL_COLORS.length]}10`,
                  borderColor: `${PILL_COLORS[i % PILL_COLORS.length]}30`,
                  color: PILL_COLORS[i % PILL_COLORS.length],
                }}
                title={pill.detail || pill.label}
              >
                {pill.name}
              </span>
            ))}
          </div>
          {/* Full details */}
          <GenericSectionContent items={section.items} />
        </div>
      )}
    </div>
  );
}

// --- Competitor Section ---
function CompetitorSection({ section, competitors }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-forge-border/30">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 py-3 px-1 text-left hover:bg-forge-surface-hover/50 transition-colors rounded"
      >
        <span className="text-forge-text-muted text-sm w-4">
          {open ? '\u25BC' : '\u25B6'}
        </span>
        <span className="text-base font-medium text-forge-text-primary">
          {section.title}
        </span>
        <span className="px-2 py-0.5 text-sm font-mono font-bold rounded bg-forge-accent/15 text-forge-accent">
          {competitors.length}
        </span>
      </button>
      {open && (
        <div className="pl-7 pb-4 space-y-2.5">
          {competitors.map((comp, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-4 py-3 rounded-lg bg-forge-bg/50 border border-forge-border/50"
            >
              <div
                className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
                style={{
                  backgroundColor: PILL_COLORS[i % PILL_COLORS.length],
                }}
              />
              <div className="min-w-0">
                <span className="text-base font-medium text-forge-text-primary">
                  {comp.name}
                </span>
                {comp.differentiator && (
                  <span className="text-sm text-forge-text-muted ml-2">
                    — {comp.differentiator}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
