import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useSessions } from '../../hooks/useSessions';
import ProjectGroup from './ProjectGroup.jsx';
import SrvGroup from './SrvGroup.jsx';
import { getProjectLabel, getProjectColor } from './projectLabels.js';

const SRV_TAB_IDS = new Set(['vite-server', 'friday-server', 'forge-logs']);

function formatRelative(ms) {
  if (!ms || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function SessionSidebar({
  scope, activeTabId, onTabSelect, onTabClose, onRefresh, onNewSession,
}) {
  const sessions = useSessions();
  const projects = useStore(s => s.projects);
  const fridayProcessStatus = useStore(s => s.fridayProcessStatus);

  const [expandedSlug, setExpandedSlug] = useState(scope?.id || 'studio');
  const [srvAttention, setSrvAttention] = useState(false);
  const [hoverInfo, setHoverInfo] = useState(null);

  // Sync to dashboard scope changes (unless user has SRV expanded)
  useEffect(() => {
    if (scope?.id && expandedSlug !== '__srv__') {
      setExpandedSlug(scope.id);
    }
  }, [scope?.id]);

  // Auto-expand the project of the active tab
  useEffect(() => {
    if (!activeTabId) return;
    if (SRV_TAB_IDS.has(activeTabId)) {
      setExpandedSlug('__srv__');
      setSrvAttention(false);
      return;
    }
    const session = sessions.find(s => s.id === activeTabId);
    if (session) setExpandedSlug(session.projectSlug);
    else if (activeTabId === scope?.id) setExpandedSlug(scope.id);
  }, [activeTabId, sessions, scope?.id]);

  // SRV attention dot when output arrives in inactive system terminals
  useEffect(() => {
    if (!window.electronAPI?.terminal?.onData) return;
    const remove = window.electronAPI.terminal.onData((scopeId) => {
      if (SRV_TAB_IDS.has(scopeId) && expandedSlug !== '__srv__') {
        setSrvAttention(true);
      }
    });
    return remove;
  }, [expandedSlug]);

  // Group sessions by project
  const sessionsByProject = useMemo(() => {
    const map = {};
    for (const s of sessions) {
      const slug = s.projectSlug || 'studio';
      if (!map[slug]) map[slug] = [];
      map[slug].push(s);
    }
    return map;
  }, [sessions]);

  // Ordered slug list — studio first, then scope, then any with sessions, then known projects.
  // _template is a scaffolding project, never shown in the tree.
  const orderedSlugs = useMemo(() => {
    const HIDDEN = new Set(['_template']);
    const out = ['studio'];
    if (scope?.id && scope.id !== 'studio' && !HIDDEN.has(scope.id)) out.push(scope.id);
    for (const slug of Object.keys(sessionsByProject)) {
      if (!out.includes(slug) && !HIDDEN.has(slug)) out.push(slug);
    }
    for (const p of projects) {
      if (!out.includes(p.slug) && !HIDDEN.has(p.slug)) out.push(p.slug);
    }
    return out;
  }, [sessionsByProject, scope?.id, projects]);

  const handleToggle = (slug) => {
    setExpandedSlug(prev => (prev === slug ? null : slug));
    if (slug !== '__srv__') {
      if (sessionsByProject[slug]?.length > 0) {
        const current = sessionsByProject[slug].find(s => s.id === activeTabId);
        if (!current) onTabSelect(sessionsByProject[slug][0].id);
      } else if (slug === scope?.id) {
        onTabSelect(scope.id);
      }
    }
  };

  const handleSrvToggle = () => {
    setExpandedSlug(prev => (prev === '__srv__' ? null : '__srv__'));
    setSrvAttention(false);
    if (!SRV_TAB_IDS.has(activeTabId)) onTabSelect('vite-server');
  };

  const handleReattach = async (id) => {
    try { await window.electronAPI?.sessionTabs?.resume(id); } catch {}
  };

  const handleNewSession = useCallback((slug) => {
    if (typeof onNewSession === 'function') {
      onNewSession(slug);
    } else {
      // Default: dispatch event for the dashboard to handle
      window.dispatchEvent(new CustomEvent('forge:new-session', { detail: { projectSlug: slug } }));
    }
  }, [onNewSession]);

  const handleHoverShowCwd = useCallback((session, rect) => {
    setHoverInfo({ session, rect });
  }, []);
  const handleHoverHide = useCallback(() => {
    setHoverInfo(null);
  }, []);

  return (
    <div className="h-full w-[220px] bg-forge-surface/40 border-r border-forge-border flex flex-col overflow-hidden relative">
      {/* Header bar */}
      <div className="flex items-center justify-between px-2 py-1 text-[9px] uppercase tracking-wider text-forge-text-muted/60 border-b border-forge-border/40">
        <span>Projects</span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Redraw terminal"
            className="text-forge-text-muted/40 hover:text-forge-text-secondary text-sm leading-none"
          >{'↻'}</button>
        )}
      </div>

      {/* Scrolling list */}
      <div className="flex-1 overflow-y-auto py-1">
        {orderedSlugs.map(slug => {
          const project = projects.find(p => p.slug === slug);
          const fullName = slug === 'studio' ? 'Studio' : (project?.name || slug);
          const groupSessions = sessionsByProject[slug] || [];
          const isExpanded = expandedSlug === slug;
          return (
            <ProjectGroup
              key={slug}
              slug={slug}
              label={getProjectLabel(slug)}
              fullName={fullName}
              projectColor={getProjectColor(slug)}
              sessions={groupSessions}
              isExpanded={isExpanded}
              isProjectScopeActive={slug === scope?.id || slug === 'studio'}
              activeTabId={activeTabId}
              onToggle={handleToggle}
              onSelectScope={onTabSelect}
              onSelectSession={onTabSelect}
              onCloseSession={onTabClose}
              onReattachSession={handleReattach}
              onNewSession={handleNewSession}
              onHoverShowCwd={handleHoverShowCwd}
              onHoverHide={handleHoverHide}
            />
          );
        })}
      </div>

      {/* Pinned SRV group at bottom */}
      <div className="border-t border-forge-border/40">
        <SrvGroup
          isExpanded={expandedSlug === '__srv__'}
          activeTabId={activeTabId}
          fridayProcessStatus={fridayProcessStatus}
          attention={srvAttention}
          onToggle={handleSrvToggle}
          onSelect={(id) => { setSrvAttention(false); onTabSelect(id); }}
        />
      </div>

      {/* Hover-cwd tooltip portal — fixed position so it can escape the
          sidebar's overflow:hidden bounds */}
      {hoverInfo && hoverInfo.rect && (
        <CwdTooltip session={hoverInfo.session} anchorRect={hoverInfo.rect} />
      )}
    </div>
  );
}

function CwdTooltip({ session, anchorRect }) {
  const cwd = session.cwd || '(no cwd recorded)';
  const created = session.createdAt ? Date.parse(session.createdAt) : null;
  const lastActivity = session.lastActivityAt ? Date.parse(session.lastActivityAt) : null;
  const now = Date.now();
  const startedAgo = created ? formatRelative(now - created) : null;
  const idleAgo = lastActivity ? formatRelative(now - lastActivity) : null;
  const left = (anchorRect?.right || 220) + 8;
  const top = (anchorRect?.top || 0);
  return (
    <div
      data-testid="cwd-tooltip"
      className="fixed z-50 pointer-events-none bg-slate-900/95 border border-forge-border rounded-md shadow-2xl px-2.5 py-1.5 text-[10px] font-mono text-forge-text-secondary max-w-sm"
      style={{ left, top }}
    >
      <div className="flex items-center gap-1.5 truncate">
        <span aria-hidden="true">📁</span>
        <span className="truncate">{cwd}</span>
      </div>
      {(startedAgo || idleAgo) && (
        <div className="flex items-center gap-1.5 text-forge-text-muted text-[9px] mt-0.5">
          <span aria-hidden="true">⏱</span>
          <span>
            {startedAgo && `started ${startedAgo}`}
            {startedAgo && idleAgo && ' · '}
            {idleAgo && `idle ${idleAgo}`}
          </span>
        </div>
      )}
    </div>
  );
}
