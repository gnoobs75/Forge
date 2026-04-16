import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const AGENT_SKILLS = [
  'solutions-architect.md',
  'backend-engineer.md',
  'frontend-engineer.md',
  'devops-engineer.md',
  'data-engineer.md',
  'security-auditor.md',
  'qa-lead.md',
  'product-owner.md',
  'ux-researcher.md',
  'api-designer.md',
  'performance-engineer.md',
  'technical-writer.md',
  'project-manager.md',
  'code-reviewer.md',
  'ai-integration-analyst.md',
];

export default function ProjectDocs({ slug }) {
  const [projectFiles, setProjectFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  // Load project file list
  useEffect(() => {
    if (!window.electronAPI?.hq) return;
    const loadFiles = async () => {
      const res = await window.electronAPI.hq.readDir(`projects/${slug}`);
      if (res.ok) {
        // Filter to readable files (not directories like recommendations/, store-drafts/)
        const files = res.data
          .filter(e => !e.isDirectory)
          .map(e => e.name)
          .sort((a, b) => {
            // Priority ordering: context.md first, then json files, then rest
            const priority = ['context.md', 'features.json', 'project.json', 'progress.json'];
            const ai = priority.indexOf(a);
            const bi = priority.indexOf(b);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            return a.localeCompare(b);
          });
        setProjectFiles(files);
        // Auto-select context.md if available
        if (files.includes('context.md') && !selectedFile) {
          setSelectedFile({ type: 'project', name: 'context.md' });
        }
      }
    };
    loadFiles();
  }, [slug]);

  // Load file content when selection changes
  useEffect(() => {
    if (!selectedFile) return;
    setLoading(true);
    const load = async () => {
      let res;
      if (selectedFile.type === 'agent') {
        res = await window.electronAPI.agent.readSkill(selectedFile.name);
      } else {
        res = await window.electronAPI.hq.readFile(`projects/${slug}/${selectedFile.name}`);
      }
      setContent(res.ok ? res.data : `Error loading file: ${res.error}`);
      setLoading(false);
    };
    load();
  }, [selectedFile, slug]);

  const isJson = selectedFile?.name.endsWith('.json');
  const isMd = selectedFile?.name.endsWith('.md');

  return (
    <div className="flex gap-4" style={{ minHeight: '500px' }}>
      {/* Sidebar — file tree */}
      <div className="w-56 flex-shrink-0 space-y-4">
        {/* Project files */}
        <div>
          <div className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider mb-2 px-2">
            Project Files
          </div>
          <div className="space-y-0.5">
            {projectFiles.map(name => (
              <FileEntry
                key={name}
                name={name}
                selected={selectedFile?.type === 'project' && selectedFile.name === name}
                onClick={() => setSelectedFile({ type: 'project', name })}
              />
            ))}
            {projectFiles.length === 0 && (
              <div className="text-xs text-forge-text-muted/50 px-2 py-1">No files found</div>
            )}
          </div>
        </div>

        {/* Agent skills */}
        <div>
          <div className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider mb-2 px-2">
            Agent Skills
          </div>
          <div className="space-y-0.5">
            {AGENT_SKILLS.map(name => (
              <FileEntry
                key={name}
                name={name}
                selected={selectedFile?.type === 'agent' && selectedFile.name === name}
                onClick={() => setSelectedFile({ type: 'agent', name })}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Content viewer */}
      <div className="flex-1 min-w-0 card overflow-hidden">
        {!selectedFile ? (
          <div className="flex items-center justify-center h-full text-forge-text-muted text-sm">
            Select a file to view
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-forge-text-muted text-sm">
            Loading...
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* File header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-forge-border/50">
              <div className="flex items-center gap-2">
                <span className="text-sm">{getFileIcon(selectedFile.name)}</span>
                <span className="text-xs font-mono text-forge-text-secondary">{selectedFile.name}</span>
                {selectedFile.type === 'agent' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-forge-accent/10 text-forge-accent">skill</span>
                )}
              </div>
              <span className="text-[10px] text-forge-text-muted">
                {content.length.toLocaleString()} chars
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {isJson ? (
                <JsonViewer content={content} />
              ) : isMd ? (
                <MarkdownViewer content={content} />
              ) : (
                <pre className="text-xs font-mono text-forge-text-secondary whitespace-pre-wrap leading-relaxed">
                  {content}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FileEntry({ name, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-2 ${
        selected
          ? 'bg-forge-accent/10 text-forge-accent'
          : 'text-forge-text-secondary hover:bg-forge-surface-hover hover:text-forge-text-primary'
      }`}
    >
      <span className="text-sm flex-shrink-0">{getFileIcon(name)}</span>
      <span className="truncate">{name}</span>
    </button>
  );
}

function getFileIcon(name) {
  if (name.endsWith('.md')) return '\u{1F4DD}';
  if (name.endsWith('.json')) return '\u{1F4CB}';
  return '\u{1F4C4}';
}

/* ── Markdown Viewer ── */

const mdComponents = {
  h1: ({ children }) => (
    <h1 className="text-lg font-bold text-forge-text-primary mt-6 mb-3 pb-2 border-b border-forge-border/30">
      {children}
    </h1>
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
  a: ({ href, children }) => (
    <a href={href} className="text-forge-accent hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-forge-text-primary">{children}</strong>,
  em: ({ children }) => <em className="italic text-forge-text-secondary">{children}</em>,
  code: ({ inline, className, children }) => {
    if (inline) {
      return (
        <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-forge-surface-hover text-forge-accent-blue">
          {children}
        </code>
      );
    }
    return (
      <pre className="p-3 rounded-lg bg-forge-bg/80 border border-forge-border/30 overflow-x-auto mb-3">
        <code className="text-xs font-mono text-forge-text-secondary leading-relaxed">{children}</code>
      </pre>
    );
  },
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-forge-accent/40 pl-3 my-3 text-sm text-forge-text-muted italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-3">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-forge-border">{children}</thead>,
  th: ({ children }) => (
    <th className="text-left px-3 py-2 text-forge-text-muted font-semibold uppercase tracking-wider text-[10px]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-forge-text-secondary border-b border-forge-border/20">{children}</td>
  ),
  hr: () => <hr className="border-forge-border/30 my-4" />,
};

function MarkdownViewer({ content }) {
  return (
    <div className="docs-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

/* ── JSON Viewer ── */

function JsonViewer({ content }) {
  const [collapsed, setCollapsed] = useState({});

  const parsed = useMemo(() => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }, [content]);

  if (!parsed) {
    return (
      <pre className="text-xs font-mono text-red-400 whitespace-pre-wrap">
        Invalid JSON:\n{content}
      </pre>
    );
  }

  const toggleCollapse = (path) => {
    setCollapsed(prev => ({ ...prev, [path]: !prev[path] }));
  };

  return (
    <div className="text-xs font-mono leading-relaxed">
      <JsonNode value={parsed} path="$" collapsed={collapsed} toggleCollapse={toggleCollapse} depth={0} />
    </div>
  );
}

function JsonNode({ value, path, collapsed, toggleCollapse, depth }) {
  const indent = depth * 16;

  if (value === null) return <span className="text-forge-text-muted">null</span>;
  if (typeof value === 'boolean') return <span className="text-orange-400">{value.toString()}</span>;
  if (typeof value === 'number') return <span className="text-forge-accent-blue">{value}</span>;
  if (typeof value === 'string') {
    // Truncate very long strings
    const display = value.length > 200 ? value.slice(0, 200) + '...' : value;
    return <span className="text-green-400">"{display}"</span>;
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
  const isCollapsed = collapsed[path];
  const bracket = isArray ? ['[', ']'] : ['{', '}'];

  if (entries.length === 0) {
    return <span className="text-forge-text-muted">{bracket[0]}{bracket[1]}</span>;
  }

  return (
    <span>
      <button
        onClick={() => toggleCollapse(path)}
        className="text-forge-text-muted hover:text-forge-accent transition-colors inline-flex items-center"
      >
        <span className="inline-block w-3 text-center text-[10px]">{isCollapsed ? '\u25B6' : '\u25BC'}</span>
      </button>
      <span className="text-forge-text-muted">{bracket[0]}</span>
      {isCollapsed ? (
        <span>
          <span className="text-forge-text-muted/50 mx-1">{entries.length} items</span>
          <span className="text-forge-text-muted">{bracket[1]}</span>
        </span>
      ) : (
        <span>
          {entries.map(([key, val], i) => {
            const childPath = `${path}.${key}`;
            return (
              <div key={key} style={{ paddingLeft: indent + 16 }}>
                {!isArray && (
                  <>
                    <span className="text-forge-accent">"{key}"</span>
                    <span className="text-forge-text-muted">: </span>
                  </>
                )}
                <JsonNode
                  value={val}
                  path={childPath}
                  collapsed={collapsed}
                  toggleCollapse={toggleCollapse}
                  depth={depth + 1}
                />
                {i < entries.length - 1 && <span className="text-forge-text-muted">,</span>}
              </div>
            );
          })}
          <div style={{ paddingLeft: indent }}>
            <span className="text-forge-text-muted">{bracket[1]}</span>
          </div>
        </span>
      )}
    </span>
  );
}
