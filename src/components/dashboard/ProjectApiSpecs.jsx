import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const METHOD_COLORS = {
  GET: '#22C55E',
  POST: '#3B82F6',
  PATCH: '#F59E0B',
  PUT: '#8B5CF6',
  DELETE: '#EF4444',
};

export default function ProjectApiSpecs({ slug }) {
  const [apiIndex, setApiIndex] = useState(null);
  const [apiReference, setApiReference] = useState('');
  const [selectedController, setSelectedController] = useState(null);
  const [viewMode, setViewMode] = useState('overview'); // 'overview' | 'reference'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!window.electronAPI?.hq) {
      setLoading(false);
      return;
    }
    const load = async () => {
      // Load index.json
      const indexRes = await window.electronAPI.hq.readFile(`projects/${slug}/api-specs/index.json`);
      if (indexRes.ok) {
        try {
          setApiIndex(JSON.parse(indexRes.data));
        } catch { /* ignore */ }
      }
      // Load full reference markdown
      const refRes = await window.electronAPI.hq.readFile(`projects/${slug}/api-specs/safetyfirst-api-reference.md`);
      if (refRes.ok) {
        setApiReference(refRes.data);
      }
      setLoading(false);
    };
    load();
  }, [slug]);

  if (loading) {
    return (
      <div className="card text-center py-12">
        <div className="text-forge-text-muted text-sm">Loading API specs...</div>
      </div>
    );
  }

  if (!apiIndex) {
    return (
      <div className="card text-center py-12">
        <div className="text-3xl mb-2 opacity-30">{'\uD83D\uDD0C'}</div>
        <p className="text-sm text-forge-text-muted">No API specs found</p>
        <p className="text-xs text-forge-text-muted mt-1">
          Ask <code className="text-forge-accent-blue">@APIDesigner</code> to create API specs
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Controllers" value={apiIndex.totalControllers} />
        <StatCard label="Endpoints" value={apiIndex.totalEndpoints} />
        <StatCard label="Auth" value={apiIndex.authMethod} />
        <StatCard label="Version" value={apiIndex.apiVersion} />
      </div>

      {/* Base URL */}
      <div className="card flex items-center gap-3 py-2">
        <span className="text-[10px] font-mono text-forge-text-muted uppercase">Base URL</span>
        <code className="text-xs font-mono text-forge-accent-blue">{apiIndex.baseUrl}</code>
        {apiIndex.healthCheck && (
          <>
            <span className="text-forge-border">|</span>
            <span className="text-[10px] font-mono text-forge-text-muted">Health</span>
            <code className="text-xs font-mono text-green-400">{apiIndex.healthCheck}</code>
          </>
        )}
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('overview')}
          className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
            viewMode === 'overview'
              ? 'bg-forge-accent/20 text-forge-accent'
              : 'text-forge-text-muted hover:text-forge-text-secondary'
          }`}
        >
          Controller Overview
        </button>
        <button
          onClick={() => setViewMode('reference')}
          className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
            viewMode === 'reference'
              ? 'bg-forge-accent/20 text-forge-accent'
              : 'text-forge-text-muted hover:text-forge-text-secondary'
          }`}
        >
          Full API Reference
        </button>
      </div>

      {viewMode === 'overview' ? (
        <div className="space-y-2">
          {apiIndex.controllers.map((ctrl) => (
            <ControllerCard
              key={ctrl.name}
              controller={ctrl}
              isExpanded={selectedController === ctrl.name}
              onToggle={() => setSelectedController(selectedController === ctrl.name ? null : ctrl.name)}
            />
          ))}
        </div>
      ) : (
        <div className="card overflow-y-auto" style={{ maxHeight: '70vh' }}>
          <div className="docs-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {apiReference}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="card text-center py-3">
      <div className="text-lg font-bold text-forge-text-primary">{value}</div>
      <div className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ControllerCard({ controller, isExpanded, onToggle }) {
  const ctrl = controller;
  return (
    <div className="card cursor-pointer hover:border-forge-accent/30 transition-colors" onClick={onToggle}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>{'\u25B6'}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-forge-text-primary">{ctrl.name}</span>
              <code className="text-[10px] font-mono text-forge-text-muted">{ctrl.route}</code>
            </div>
            {ctrl.authRequired && (
              <span className="text-[9px] font-mono text-yellow-500/70">
                {typeof ctrl.authRequired === 'string' ? ctrl.authRequired : 'Requires Auth'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {ctrl.methods.map((m) => (
              <span
                key={m}
                className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                style={{ color: METHOD_COLORS[m] || '#888', backgroundColor: `${METHOD_COLORS[m] || '#888'}15` }}
              >
                {m}
              </span>
            ))}
          </div>
          <span className="text-xs text-forge-text-muted">{ctrl.endpoints} endpoints</span>
        </div>
      </div>

      {isExpanded && ctrl.actions && (
        <div className="mt-3 pt-3 border-t border-forge-border/30 space-y-1">
          {ctrl.actions.map((action, i) => {
            const parts = action.split(' ');
            const method = parts[0];
            const path = parts.slice(1).join(' ');
            return (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <span
                  className="text-[9px] font-mono font-bold w-12 text-center px-1 py-0.5 rounded"
                  style={{ color: METHOD_COLORS[method] || '#888', backgroundColor: `${METHOD_COLORS[method] || '#888'}15` }}
                >
                  {method}
                </span>
                <code className="text-xs font-mono text-forge-text-secondary">{ctrl.route}{path}</code>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const mdComponents = {
  h1: ({ children }) => (
    <h1 className="text-lg font-bold text-forge-text-primary mt-6 mb-3 pb-2 border-b border-forge-border/30">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-semibold text-forge-text-primary mt-5 mb-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-forge-text-primary mt-4 mb-1.5">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-xs font-semibold text-forge-text-secondary mt-3 mb-1 uppercase tracking-wider">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-sm text-forge-text-secondary leading-relaxed mb-3">{children}</p>
  ),
  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-3 ml-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-3 ml-2">{children}</ol>,
  li: ({ children }) => <li className="text-sm text-forge-text-secondary leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-forge-text-primary">{children}</strong>,
  code: ({ inline, children }) => {
    if (inline) {
      return (
        <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-forge-surface-hover text-forge-accent-blue">{children}</code>
      );
    }
    return (
      <pre className="p-3 rounded-lg bg-forge-bg/80 border border-forge-border/30 overflow-x-auto mb-3">
        <code className="text-xs font-mono text-forge-text-secondary leading-relaxed">{children}</code>
      </pre>
    );
  },
  pre: ({ children }) => <>{children}</>,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-3">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-forge-border">{children}</thead>,
  th: ({ children }) => (
    <th className="text-left px-3 py-2 text-forge-text-muted font-semibold uppercase tracking-wider text-[10px]">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-forge-text-secondary border-b border-forge-border/20">{children}</td>
  ),
  hr: () => <hr className="border-forge-border/30 my-4" />,
};
