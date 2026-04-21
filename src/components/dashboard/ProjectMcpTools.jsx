import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const CATEGORY_DEFAULT_COLOR = '#3B82F6';

export default function ProjectMcpTools({ slug, fallback = null }) {
  const [index, setIndex] = useState(null);
  const [reference, setReference] = useState('');
  const [expandedCat, setExpandedCat] = useState(null);
  const [viewMode, setViewMode] = useState('overview'); // 'overview' | 'reference'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!window.electronAPI?.hq) {
      setLoading(false);
      return;
    }
    const load = async () => {
      const indexRes = await window.electronAPI.hq.readFile(`projects/${slug}/mcp/index.json`);
      if (indexRes.ok) {
        try {
          setIndex(JSON.parse(indexRes.data));
        } catch { /* ignore */ }
      }
      const refRes = await window.electronAPI.hq.readFile(`projects/${slug}/mcp/mcp-reference.md`);
      if (refRes.ok) {
        setReference(refRes.data);
      }
      setLoading(false);
    };
    load();
  }, [slug]);

  if (loading) {
    return (
      <div className="card text-center py-12">
        <div className="text-forge-text-muted text-sm">Loading MCP tools...</div>
      </div>
    );
  }

  if (!index) {
    // No MCP catalog for this project — fall back to API specs if provided.
    if (fallback) return fallback;
    return (
      <div className="card text-center py-12">
        <div className="text-3xl mb-2 opacity-30">{'\uD83E\uDDE0'}</div>
        <p className="text-sm text-forge-text-muted">No MCP tool catalog found</p>
        <p className="text-xs text-forge-text-muted mt-1">
          Add <code className="text-forge-accent-blue">projects/{slug}/mcp/index.json</code> to populate this tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Categories" value={index.totalCategories ?? index.categories?.length ?? 0} />
        <StatCard label="Tools" value={index.totalTools ?? toolCount(index)} />
        <StatCard label="Transport" value={index.transport || '—'} />
        <StatCard label="Server" value={index.serverName || '—'} />
      </div>

      {/* Command + config */}
      <div className="card flex flex-wrap items-center gap-3 py-2">
        <span className="text-[10px] font-mono text-forge-text-muted uppercase">Command</span>
        <code className="text-xs font-mono text-forge-accent-blue">{index.command}</code>
        {index.configFile && (
          <>
            <span className="text-forge-border">|</span>
            <span className="text-[10px] font-mono text-forge-text-muted uppercase">Config</span>
            <code className="text-xs font-mono text-green-400">{index.configFile}</code>
          </>
        )}
        {index.auth && (
          <>
            <span className="text-forge-border">|</span>
            <span className="text-[10px] font-mono text-forge-text-muted uppercase">Auth</span>
            <span className="text-xs text-forge-text-secondary">{index.auth}</span>
          </>
        )}
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('overview')}
          className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
            viewMode === 'overview'
              ? 'bg-forge-accent/20 text-forge-accent'
              : 'text-forge-text-muted hover:text-forge-text-secondary'
          }`}
        >
          Tool Catalog
        </button>
        <button
          onClick={() => setViewMode('reference')}
          className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
            viewMode === 'reference'
              ? 'bg-forge-accent/20 text-forge-accent'
              : 'text-forge-text-muted hover:text-forge-text-secondary'
          }`}
          disabled={!reference}
        >
          Full MCP Reference
        </button>
      </div>

      {viewMode === 'overview' ? (
        <div className="space-y-2">
          {(index.categories || []).map((cat) => (
            <CategoryCard
              key={cat.name}
              category={cat}
              isExpanded={expandedCat === cat.name}
              onToggle={() => setExpandedCat(expandedCat === cat.name ? null : cat.name)}
            />
          ))}
        </div>
      ) : (
        <div className="card overflow-y-auto" style={{ maxHeight: '70vh' }}>
          <div className="docs-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {reference}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Data-model footer (optional) */}
      {index.dataModel && (
        <div className="card">
          <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-2 border-l-2 border-forge-accent pl-3">
            Data Model
          </h3>
          <div className="space-y-2">
            {Object.entries(index.dataModel).map(([table, desc]) => (
              <div key={table} className="text-xs">
                <code className="text-forge-accent-blue font-mono">{table}</code>
                <span className="text-forge-text-muted ml-2">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function toolCount(index) {
  return (index.categories || []).reduce((n, c) => n + (c.tools?.length || 0), 0);
}

function StatCard({ label, value }) {
  return (
    <div className="card text-center py-3">
      <div className="text-lg font-bold text-forge-text-primary">{value}</div>
      <div className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider">{label}</div>
    </div>
  );
}

function CategoryCard({ category, isExpanded, onToggle }) {
  const color = category.color || CATEGORY_DEFAULT_COLOR;
  return (
    <div className="card cursor-pointer hover:border-forge-accent/30 transition-colors" onClick={onToggle}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>{'\u25B6'}</span>
          <div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm font-semibold text-forge-text-primary">{category.name}</span>
              <span className="text-[10px] font-mono text-forge-text-muted">
                {category.toolCount ?? category.tools?.length ?? 0} tools
              </span>
            </div>
            {category.description && (
              <div className="text-[11px] text-forge-text-muted mt-0.5">{category.description}</div>
            )}
          </div>
        </div>
      </div>

      {isExpanded && category.tools && (
        <div className="mt-3 pt-3 border-t border-forge-border/30 space-y-2">
          {category.tools.map((tool) => (
            <div key={tool.name} className="p-2 rounded bg-forge-bg/40">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                  style={{ color, backgroundColor: `${color}18` }}
                >
                  TOOL
                </span>
                <code className="text-xs font-mono text-forge-accent-blue">{tool.name}</code>
              </div>
              {tool.signature && (
                <code className="block text-[11px] font-mono text-forge-text-muted leading-snug mb-1 whitespace-pre-wrap">
                  {tool.signature}
                </code>
              )}
              {tool.summary && (
                <div className="text-xs text-forge-text-secondary leading-relaxed">{tool.summary}</div>
              )}
            </div>
          ))}
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
