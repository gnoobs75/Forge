// PRDPanel — per-project PRD viewer + "Generate" control.
//
// Mounted in HelpPanel "The Steward" tab. Lets the user pick a project,
// see the current state of its prd.md (rendered as raw markdown text for
// now — minimal styling), and trigger the prd-maintain rule with one
// click. The Steward writes the file via studioWrite + commitIntent so
// the result lands in git like any other Steward output.

import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from '../../../store/useStore';

const HQ_DATA_REL_PRD = (slug) => `projects/${slug}/prd.md`;

export default function PRDPanel() {
  const projects = useStore(s => s.projects);
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Default to first project once projects load
  useEffect(() => {
    if (!selected && Array.isArray(projects) && projects.length > 0) {
      setSelected(projects[0].slug);
    }
  }, [projects, selected]);

  const loadPrd = useCallback(async (slug) => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setContent(null);
    const api = window.electronAPI?.hq?.readFile;
    if (typeof api !== 'function') {
      setError('hq.readFile IPC not available');
      setLoading(false);
      return;
    }
    try {
      const result = await api(HQ_DATA_REL_PRD(slug));
      // hq.readFile returns either a string or { ok, content, error }
      if (typeof result === 'string') {
        setContent(result);
      } else if (result?.ok && result.content) {
        setContent(result.content);
      } else if (result?.content) {
        setContent(result.content);
      } else {
        // File doesn't exist yet
        setContent(null);
      }
    } catch (err) {
      // ENOENT is expected when no PRD has been seeded yet — show empty state
      if (err?.message?.includes('ENOENT') || err?.code === 'ENOENT') {
        setContent(null);
      } else {
        setError(err?.message || String(err));
      }
    } finally { setLoading(false); }
  }, []);

  // Refetch when project selection changes
  useEffect(() => {
    if (selected) loadPrd(selected);
  }, [selected, loadPrd]);

  const showToast = (msg, kind = 'info') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const handleGenerate = useCallback(async () => {
    const api = window.electronAPI?.steward;
    if (!selected) return;
    if (typeof api?.seedPRD !== 'function') {
      showToast('Restart CoE to enable PRD generation (preload needs reload)', 'error');
      return;
    }
    setGenerating(true);
    try {
      const result = await api.seedPRD(selected);
      if (result?.ok === false) {
        showToast(`Generate failed: ${result.error}`, 'error');
      } else {
        showToast(`Steward enqueued PRD task for ${selected}`, 'success');
        // Give the worker pool a moment to actually run the rule + commit,
        // then refresh the file content
        setTimeout(() => loadPrd(selected), 1500);
      }
    } catch (err) {
      showToast(`Generate failed: ${err.message}`, 'error');
    } finally { setGenerating(false); }
  }, [selected, loadPrd]);

  const handleReveal = useCallback(() => {
    if (!selected) return;
    const open = window.electronAPI?.shell?.openPath;
    if (typeof open === 'function') {
      // hq:show-in-folder may exist; fallback to openPath
      const reveal = window.electronAPI?.hq?.showInFolder;
      if (typeof reveal === 'function') {
        reveal(HQ_DATA_REL_PRD(selected));
      } else {
        open(HQ_DATA_REL_PRD(selected));
      }
    }
  }, [selected]);

  const projectsList = Array.isArray(projects) ? projects : [];

  return (
    <div className="space-y-3">
      {/* Project picker + actions */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-forge-text-muted">Project:</label>
        <select
          value={selected || ''}
          onChange={(e) => setSelected(e.target.value)}
          className="px-2 py-1 text-xs rounded bg-forge-bg border border-forge-border text-forge-text-primary"
        >
          {projectsList.length === 0 && <option value="">(no projects)</option>}
          {projectsList.map(p => (
            <option key={p.slug} value={p.slug}>{p.name || p.slug}</option>
          ))}
        </select>
        <button
          onClick={() => loadPrd(selected)}
          disabled={loading || !selected}
          className="px-2 py-1 text-xs rounded border border-forge-border text-forge-text-secondary hover:text-forge-text-primary hover:border-forge-text-muted disabled:opacity-30"
        >
          Refresh
        </button>
        <button
          onClick={handleGenerate}
          disabled={generating || !selected}
          className="px-3 py-1 text-xs rounded bg-forge-accent/10 text-forge-accent border border-forge-accent/20 hover:bg-forge-accent/20 disabled:opacity-30"
          title="Trigger the Steward to (re)build the PRD's dynamic sections"
        >
          {generating ? 'Generating…' : 'Generate / Refresh'}
        </button>
        <button
          onClick={handleReveal}
          disabled={!selected || !content}
          className="px-2 py-1 text-xs rounded border border-forge-border text-forge-text-secondary hover:text-forge-text-primary hover:border-forge-text-muted disabled:opacity-30"
          title="Open the PRD file in your default editor"
        >
          Reveal
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`p-2 rounded text-xs ${
          toast.kind === 'success' ? 'bg-green-400/10 text-green-400 border border-green-400/20' :
          toast.kind === 'error' ? 'bg-red-400/10 text-red-400 border border-red-400/20' :
          'bg-forge-bg/50 text-forge-text-secondary border border-forge-border'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* PRD content */}
      <div className="rounded-lg border border-forge-border/50 bg-forge-bg/30 overflow-hidden">
        {loading ? (
          <div className="p-4 text-xs text-forge-text-muted italic">Loading…</div>
        ) : error ? (
          <div className="p-4 text-xs text-red-400">{error}</div>
        ) : !content ? (
          <div className="p-4 text-xs text-forge-text-muted">
            No PRD yet for <code className="text-forge-accent">{selected || '?'}</code>.
            {' '}Click <strong>Generate / Refresh</strong> above to seed an empty skeleton + populate
            the dynamic sections (Implementation Status, Recently Shipped, Open Questions) from this
            project's <code className="text-forge-accent">features.json</code>, <code className="text-forge-accent">history.json</code>,
            and <code className="text-forge-accent">todo.json</code>.
          </div>
        ) : (
          <pre className="p-3 text-[11px] font-mono text-forge-text-secondary leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-auto">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
