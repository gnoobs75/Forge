import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import ToolCard from './tools/ToolCard';

const HOST_PLATFORM = (() => {
  // Forge preload may expose platform; fall back to navigator.platform heuristic.
  if (typeof window !== 'undefined' && window.forgePaths?.platform) {
    return window.forgePaths.platform;
  }
  if (typeof navigator !== 'undefined') {
    const p = navigator.platform.toLowerCase();
    if (p.includes('win')) return 'win32';
    if (p.includes('mac')) return 'darwin';
    if (p.includes('linux')) return 'linux';
  }
  return 'win32';
})();

export default function ProjectTools({ slug, project }) {
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const startToolSession = useStore(s => s.startToolSession);

  const toolsPath = `projects/${slug}/tools.json`;
  const absToolsPath = window.forgePaths?.hqData
    ? `${window.forgePaths.hqData}/${toolsPath}`
    : null;

  useEffect(() => {
    if (!window.electronAPI?.hq) return;
    let cancelled = false;
    (async () => {
      const res = await window.electronAPI.hq.readFile(toolsPath);
      if (cancelled) return;
      if (!res.ok) {
        // Not-found is the empty state — don't treat as error.
        if (/ENOENT|not found/i.test(res.error || '')) {
          setConfig({ tools: [] });
        } else {
          setLoadError(res.error || 'Failed to read tools.json');
        }
        return;
      }
      try {
        const parsed = JSON.parse(res.data);
        setConfig(parsed && Array.isArray(parsed.tools) ? parsed : { tools: [] });
      } catch (err) {
        setLoadError(`tools.json is not valid JSON: ${err.message}`);
      }
    })();
    return () => { cancelled = true; };
  }, [toolsPath]);

  const groups = useMemo(() => {
    if (!config) return [];
    const visible = config.tools.filter(t => !t.platforms || t.platforms.includes(HOST_PLATFORM));
    const byCat = new Map();
    for (const t of visible) {
      const cat = t.category || 'Other';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(t);
    }
    return [...byCat.entries()];
  }, [config]);

  const handleLaunch = (tool) => {
    startToolSession(tool, project);
  };

  const handleEditFile = () => {
    if (absToolsPath && window.electronAPI?.hq?.showInFolder) {
      window.electronAPI.hq.showInFolder(absToolsPath);
    }
  };

  if (loadError) {
    return (
      <div className="card text-center py-8">
        <div className="text-sm text-red-400">{loadError}</div>
      </div>
    );
  }

  if (!config) {
    return <div className="card text-center py-8 text-sm text-forge-text-muted">Loading tools…</div>;
  }

  if (groups.length === 0) {
    return (
      <div className="card text-center py-12 space-y-3">
        <div className="text-3xl opacity-30">🔧</div>
        <p className="text-sm text-forge-text-muted">No project tools configured yet.</p>
        <p className="text-[11px] text-forge-text-muted/70">
          Create <code className="text-forge-accent-blue">hq-data/projects/{slug}/tools.json</code> with a
          list of tools. See docs/superpowers/specs or ask <code className="text-forge-accent-blue">@DevOpsEngineer</code>.
        </p>
        <p className="text-[10px] text-forge-text-muted/60">
          (Launchers still live in Environment → Launchers.)
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(([cat, tools]) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-[10px] font-mono font-semibold text-forge-text-muted uppercase tracking-wider">
            {cat}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tools.map(tool => (
              <ToolCard key={tool.id} tool={tool} onLaunch={handleLaunch} />
            ))}
          </div>
        </div>
      ))}

      {absToolsPath && (
        <div className="text-right">
          <button
            onClick={handleEditFile}
            className="text-[10px] text-forge-text-muted hover:text-forge-accent-blue transition-colors font-mono"
          >
            Edit tools.json →
          </button>
        </div>
      )}
    </div>
  );
}
