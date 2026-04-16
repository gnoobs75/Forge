import React, { useState, useMemo, useEffect } from 'react';
import extractFeatures, { STATUS_COLORS, PRIORITY_COLORS } from '../../utils/extractFeatures';
import { useStore } from '../../store/useStore';
import { playSound } from '../../utils/sounds';

const VIEW_MODES = [
  { id: 'category', label: 'Category', icon: '\u2630' },
  { id: 'grid', label: 'Grid', icon: '\u25A6' },
  { id: 'kanban', label: 'Kanban', icon: '\u2503' },
];

const STATUS_ORDER = ['in-progress', 'blocked', 'planned', 'complete'];

export default function FeatureOverview({ slug, project }) {
  const [features, setFeatures] = useState(null);
  const [dataSource, setDataSource] = useState(null); // 'features.json' | 'context.md' | 'sample'
  const [lastScanned, setLastScanned] = useState(null);
  const [viewMode, setViewMode] = useState('category');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(new Set(['complete', 'in-progress', 'blocked', 'planned']));
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [expandedFeature, setExpandedFeature] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);

  const startImplementation = useStore((s) => s.startImplementation);

  useEffect(() => {
    loadFeatures();
  }, [slug]);

  async function loadFeatures() {
    setLoading(true);
    try {
      // Priority 1: features.json (canonical, agent-generated)
      if (window.electronAPI) {
        const featResult = await window.electronAPI.hq.readFile(`projects/${slug}/features.json`);
        if (featResult.ok) {
          const data = JSON.parse(featResult.data);
          const featureList = data.features || data;
          const processed = processFeaturesJson(featureList);
          setFeatures(processed);
          setDataSource('features.json');
          setLastScanned(data.lastScanned || null);
          if (processed.categories.length > 0) {
            setExpandedCategories(new Set(processed.categories.map(c => c.name)));
          }
          setLoading(false);
          return;
        }
      }

      // Priority 2: Extract from context.md (fallback)
      let contextRaw = '';
      let progressData = null;

      if (window.electronAPI) {
        const ctxResult = await window.electronAPI.hq.readFile(`projects/${slug}/context.md`);
        if (ctxResult.ok) contextRaw = ctxResult.data;

        const progResult = await window.electronAPI.hq.readFile(`projects/${slug}/progress.json`);
        if (progResult.ok) {
          try { progressData = JSON.parse(progResult.data); } catch {}
        }
        setDataSource(contextRaw ? 'context.md' : 'sample');
      } else {
        contextRaw = getSampleContextMd();
        setDataSource('sample');
      }

      const extracted = extractFeatures(contextRaw, progressData);
      setFeatures(extracted);

      if (extracted.categories.length > 0) {
        setExpandedCategories(new Set(extracted.categories.map(c => c.name)));
      }
    } catch (err) {
      console.error('[FeatureOverview] Load error:', err);
    }
    setLoading(false);
  }

  function handleRebuildFeatures() {
    if (!project?.repoPath || !window.electronAPI) return;
    setRebuilding(true);
    playSound('spawn');

    // Build a prompt for the agent to scan the codebase and write features.json
    const prompt = buildFeatureScanPrompt(slug, project);
    const rec = {
      agent: 'Tech Architect',
      agentColor: '#0EA5E9',
      project: slug,
      timestamp: new Date().toISOString(),
      title: `Rebuild Feature Registry for ${project.name}`,
      summary: 'Scanning codebase to extract and update features.json',
      approaches: [{ id: 1, name: 'Full codebase scan', description: prompt }],
      recommended: 1,
      implementable: true,
    };

    startImplementation(rec, project, 'auto', 1);
    // Reset after a short delay — the agent will write features.json, file watcher triggers reload
    setTimeout(() => setRebuilding(false), 3000);
  }

  // Convert features.json array into the format FeatureOverview expects
  function processFeaturesJson(featureList) {
    const catMap = {};
    for (const f of featureList) {
      const cat = f.category || 'General';
      if (!catMap[cat]) catMap[cat] = [];
      catMap[cat].push(f);
    }

    const categories = Object.entries(catMap).map(([name, items]) => ({
      name,
      items,
      complete: items.filter(i => i.status === 'complete').length,
      total: items.length,
    }));

    const summary = {
      total: featureList.length,
      complete: featureList.filter(f => f.status === 'complete').length,
      inProgress: featureList.filter(f => f.status === 'in-progress').length,
      blocked: featureList.filter(f => f.status === 'blocked').length,
      planned: featureList.filter(f => f.status === 'planned').length,
    };

    return { categories, features: featureList, summary };
  }

  const filteredFeatures = useMemo(() => {
    if (!features) return [];
    return features.features.filter(f => {
      if (!statusFilter.has(f.status)) return false;
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (search && !f.name.toLowerCase().includes(search.toLowerCase()) &&
          !f.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [features, statusFilter, search, categoryFilter]);

  const filteredCategories = useMemo(() => {
    if (!features) return [];
    return features.categories.map(cat => ({
      ...cat,
      items: cat.items.filter(f => {
        if (!statusFilter.has(f.status)) return false;
        if (search && !f.name.toLowerCase().includes(search.toLowerCase()) &&
            !f.description.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    })).filter(cat => categoryFilter === 'all' || cat.name === categoryFilter);
  }, [features, statusFilter, search, categoryFilter]);

  const toggleStatus = (status) => {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const toggleCategory = (catName) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catName)) next.delete(catName);
      else next.add(catName);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-2xl mb-2 animate-pulse">&#x2726;</div>
        <p className="text-sm text-forge-text-muted">Extracting features...</p>
      </div>
    );
  }

  if (!features || features.features.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-3xl mb-2 opacity-30">&#x2726;</div>
        <p className="text-sm text-forge-text-muted">No features extracted yet</p>
        <p className="text-xs text-forge-text-muted mt-1">
          Scan the codebase to build your feature registry, or ensure <code className="text-forge-accent-blue">context.md</code> exists
        </p>
        <div className="flex items-center justify-center gap-2 mt-3">
          <button
            onClick={handleRebuildFeatures}
            disabled={rebuilding || !project?.repoPath}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-forge-accent-blue/10 text-forge-accent-blue border border-forge-accent-blue/20 hover:bg-forge-accent-blue/20 transition-colors disabled:opacity-30"
          >
            {rebuilding ? 'Scanning...' : '\u269B Scan Codebase'}
          </button>
          <button
            onClick={loadFeatures}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-forge-surface text-forge-text-muted border border-forge-border hover:text-forge-text-secondary transition-colors"
          >
            Retry from context.md
          </button>
        </div>
      </div>
    );
  }

  const { summary } = features;
  const overallPct = summary.total > 0 ? Math.round((summary.complete / summary.total) * 100) : 0;
  const allCategories = features.categories.map(c => c.name);

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ProgressRing progress={overallPct} color="#22C55E" size={36} />
          <div>
            <div className="text-sm font-mono font-bold text-forge-text-primary">{overallPct}%</div>
            <div className="text-[10px] text-forge-text-muted">Overall</div>
          </div>
        </div>
        <div className="flex-1" />
        <StatusPill label="Complete" count={summary.complete} color={STATUS_COLORS.complete} active={statusFilter.has('complete')} onClick={() => toggleStatus('complete')} />
        <StatusPill label="In Progress" count={summary.inProgress} color={STATUS_COLORS['in-progress']} active={statusFilter.has('in-progress')} onClick={() => toggleStatus('in-progress')} />
        <StatusPill label="Blocked" count={summary.blocked} color={STATUS_COLORS.blocked} active={statusFilter.has('blocked')} onClick={() => toggleStatus('blocked')} />
        <StatusPill label="Planned" count={summary.planned} color={STATUS_COLORS.planned} active={statusFilter.has('planned')} onClick={() => toggleStatus('planned')} />
      </div>

      {/* Search / Filter / View Toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Search features..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text-primary placeholder-forge-text-muted focus:outline-none focus:border-forge-accent/50"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text-secondary focus:outline-none"
        >
          <option value="all">All Categories</option>
          {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center rounded-lg border border-forge-border overflow-hidden">
          {VIEW_MODES.map(mode => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id)}
              className={`px-2.5 py-1.5 text-xs transition-colors ${
                viewMode === mode.id
                  ? 'bg-forge-accent/20 text-forge-accent'
                  : 'text-forge-text-muted hover:text-forge-text-secondary'
              }`}
              title={mode.label}
            >
              {mode.icon}
            </button>
          ))}
        </div>
        <button
          onClick={loadFeatures}
          className="px-2.5 py-1.5 text-xs text-forge-text-muted hover:text-forge-accent border border-forge-border rounded-lg transition-colors"
          title="Reload from file"
        >
          &#x21BB;
        </button>
        <button
          onClick={handleRebuildFeatures}
          disabled={rebuilding || !project?.repoPath}
          className="px-3 py-1.5 text-xs font-medium text-forge-accent-blue border border-forge-accent-blue/20 rounded-lg hover:bg-forge-accent-blue/10 transition-colors disabled:opacity-30"
          title="Scan codebase and rebuild features.json"
        >
          {rebuilding ? 'Scanning...' : '\u269B Rebuild'}
        </button>
      </div>

      {/* View Content */}
      {viewMode === 'category' && (
        <CategoryView
          categories={filteredCategories}
          expandedCategories={expandedCategories}
          toggleCategory={toggleCategory}
          expandedFeature={expandedFeature}
          setExpandedFeature={setExpandedFeature}
        />
      )}
      {viewMode === 'grid' && (
        <GridView
          features={filteredFeatures}
          expandedFeature={expandedFeature}
          setExpandedFeature={setExpandedFeature}
        />
      )}
      {viewMode === 'kanban' && (
        <KanbanView
          features={filteredFeatures}
          expandedFeature={expandedFeature}
          setExpandedFeature={setExpandedFeature}
        />
      )}

      {/* Footer: count + data source */}
      <div className="flex items-center justify-between text-[10px] text-forge-text-muted">
        <div className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 rounded ${
            dataSource === 'features.json' ? 'bg-green-400/10 text-green-400' :
            dataSource === 'context.md' ? 'bg-yellow-400/10 text-yellow-400' :
            'bg-forge-surface text-forge-text-muted'
          }`}>
            {dataSource === 'features.json' ? '\u2713 features.json' :
             dataSource === 'context.md' ? 'Extracted from context.md' :
             'Sample data'}
          </span>
          {lastScanned && (
            <span>Last scanned: {new Date(lastScanned).toLocaleDateString()}</span>
          )}
        </div>
        <span>Showing {filteredFeatures.length} of {features.features.length} features</span>
      </div>
    </div>
  );
}

function StatusPill({ label, count, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
        active ? 'opacity-100' : 'opacity-30'
      }`}
      style={{ backgroundColor: `${color}15`, color }}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {label} <span className="font-bold">{count}</span>
    </button>
  );
}

function ProgressRing({ progress, color, size = 40 }) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#3F465B" strokeWidth="3" />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
    </svg>
  );
}

function FeatureCard({ feature, expanded, onToggle }) {
  const statusColor = STATUS_COLORS[feature.status] || '#64748B';
  const priorityColor = feature.priority ? PRIORITY_COLORS[feature.priority] : null;

  return (
    <div
      className="p-3 rounded-lg bg-forge-bg/50 border border-forge-border hover:border-forge-accent-blue/20 transition-all cursor-pointer"
      onClick={onToggle}
    >
      <div className="flex items-start gap-2">
        <span className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: statusColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-forge-text-primary truncate">{feature.name}</span>
            {feature.priority && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded" style={{ backgroundColor: `${priorityColor}20`, color: priorityColor }}>
                {feature.priority}
              </span>
            )}
          </div>
          <div className={`text-xs text-forge-text-secondary mt-0.5 ${expanded ? '' : 'line-clamp-2'}`}>
            {feature.description}
          </div>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] text-forge-text-muted flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-forge-surface">{feature.category}</span>
                <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
                  {feature.status}
                </span>
                {feature.confidence && (
                  <span className={`px-1.5 py-0.5 rounded ${
                    feature.confidence === 'high' ? 'bg-green-400/10 text-green-400' :
                    feature.confidence === 'medium' ? 'bg-yellow-400/10 text-yellow-400' :
                    'bg-forge-surface text-forge-text-muted'
                  }`}>
                    {feature.confidence} confidence
                  </span>
                )}
                {feature.source && <span>from: {feature.source}</span>}
                {feature.progress != null && <span>{Math.round(feature.progress)}%</span>}
              </div>
              {feature.codeFootprint && feature.codeFootprint.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {feature.codeFootprint.map((fp, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-forge-bg text-[9px] font-mono text-forge-accent-blue/70">
                      {fp}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryView({ categories, expandedCategories, toggleCategory, expandedFeature, setExpandedFeature }) {
  return (
    <div className="space-y-2">
      {categories.map(cat => (
        <div key={cat.name} className="card">
          <button
            onClick={() => toggleCategory(cat.name)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-forge-text-muted">{expandedCategories.has(cat.name) ? '\u25BC' : '\u25B6'}</span>
              <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider">
                {cat.name}
              </h3>
              <span className="text-[10px] text-forge-text-muted">
                {cat.items.filter(i => i.status === 'complete').length}/{cat.items.length}
              </span>
            </div>
            <div className="w-24 h-1.5 rounded-full bg-forge-surface overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${cat.items.length > 0 ? (cat.items.filter(i => i.status === 'complete').length / cat.items.length) * 100 : 0}%`,
                  backgroundColor: '#22C55E',
                }}
              />
            </div>
          </button>
          {expandedCategories.has(cat.name) && (
            <div className="mt-3 space-y-1.5">
              {cat.items.map(f => (
                <FeatureCard
                  key={f.id}
                  feature={f}
                  expanded={expandedFeature === f.id}
                  onToggle={() => setExpandedFeature(expandedFeature === f.id ? null : f.id)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function GridView({ features, expandedFeature, setExpandedFeature }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
      {features.map(f => (
        <FeatureCard
          key={f.id}
          feature={f}
          expanded={expandedFeature === f.id}
          onToggle={() => setExpandedFeature(expandedFeature === f.id ? null : f.id)}
        />
      ))}
    </div>
  );
}

function KanbanView({ features, expandedFeature, setExpandedFeature }) {
  const columns = STATUS_ORDER.map(status => ({
    status,
    label: status === 'in-progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1),
    color: STATUS_COLORS[status],
    items: features.filter(f => f.status === status),
  }));

  return (
    <div className="grid grid-cols-4 gap-3">
      {columns.map(col => (
        <div key={col.status} className="space-y-2">
          <div className="flex items-center gap-2 pb-2 border-b-2" style={{ borderColor: col.color }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
            <span className="text-xs font-mono font-semibold uppercase tracking-wider" style={{ color: col.color }}>
              {col.label}
            </span>
            <span className="text-[10px] text-forge-text-muted">{col.items.length}</span>
          </div>
          {col.items.map(f => (
            <FeatureCard
              key={f.id}
              feature={f}
              expanded={expandedFeature === f.id}
              onToggle={() => setExpandedFeature(expandedFeature === f.id ? null : f.id)}
            />
          ))}
          {col.items.length === 0 && (
            <div className="text-center py-6 text-[10px] text-forge-text-muted opacity-50">
              Empty
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function buildFeatureScanPrompt(slug, project) {
  return `Scan the ${project.name} codebase at ${project.repoPath} and generate a comprehensive feature registry.

STEPS:
1. Read C:\\Claude\\Samurai\\hq-data\\projects\\${slug}\\context.md for project context
2. Explore the codebase — directory structure, major systems, source files
3. For each feature/system you find, determine:
   - name: Short descriptive name
   - description: 1-2 sentence description
   - status: "complete" | "in-progress" | "blocked" | "planned"
     (Use code signals: TODOs/FIXMEs = in-progress, stubs = planned, full impl = complete)
   - category: Gameplay | Visual/UI | Audio | Technical | Content | Monetization | Platform | Multiplayer | Progression
   - codeFootprint: Array of 2-3 key file paths
   - confidence: "high" | "medium" | "low"

4. Write the result to C:\\Claude\\Samurai\\hq-data\\projects\\${slug}\\features.json:
{
  "lastScanned": "<ISO timestamp>",
  "scannedBy": "Tech Architect",
  "repoPath": "${project.repoPath}",
  "features": [ ...array of features... ]
}

Aim for 15-40 features. Be thorough — include everything meaningful. This is a flat list, not hierarchical.`;
}

function getSampleContextMd() {
  return `# Sample Game

## What's Working Well
- Core gameplay loop is engaging and polished
- Visual effects system looks great
- Audio design is atmospheric

## Known Gaps
- P0: Tutorial system not implemented
- P1: Settings menu incomplete
- Leaderboard integration pending

## Critical Path to Launch
1. P0: Complete tutorial onboarding flow
2. P1: Finalize monetization integration
3. ~~Audio system polish pass~~
4. Performance optimization for target platforms

## Codebase Architecture
- **Rendering Engine:** Complete, using Three.js
- **Input System:** In progress, needs controller support
- **Save System:** Not started
- **Network Layer:** Partial implementation
`;
}
