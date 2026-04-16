import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { getAgentBrain, getModelDisplay } from '../utils/brainConfig';
import { playSound } from '../utils/sounds';

// Short labels for project group pills
const PROJECT_LABELS = {
  studio: 'HQ',
  expedition: 'EXP',
  'ttr-ios': 'TTR',
  'ttr-roblox': 'RBX',
};

function getProjectLabel(slug) {
  return PROJECT_LABELS[slug] || slug.slice(0, 3).toUpperCase();
}

export default function TerminalTabBar({ scope, activeTabId, onTabSelect, onTabClose, onRefresh }) {
  const implementationSessions = useStore(s => s.implementationSessions);
  const agentBrains = useStore(s => s.agentBrains);
  const projects = useStore(s => s.projects);
  const fridayProcessStatus = useStore(s => s.fridayProcessStatus);

  // Which project group is expanded — defaults to scope's project
  const [selectedGroup, setSelectedGroup] = useState(scope?.id || 'studio');
  // Track which groups have been "seen" (user clicked into them after attention)
  const [seenGroups, setSeenGroups] = useState(new Set());
  // Track previous session statuses to detect transitions
  const prevStatusesRef = useRef({});
  // SRV group attention state
  const [srvAttention, setSrvAttention] = useState(false);

  // Sync selected group when scope changes from dashboard (but don't override SRV)
  useEffect(() => {
    if (scope?.id && selectedGroup !== '__srv__') {
      setSelectedGroup(scope.id);
    }
  }, [scope?.id]);

  // When user switches to a tab, auto-select its group
  useEffect(() => {
    if (!activeTabId) return;
    // System terminals → SRV group
    if (activeTabId === 'friday-server' || activeTabId === 'forge-logs' || activeTabId === 'vite-server') {
      setSelectedGroup('__srv__');
      return;
    }
    const session = implementationSessions.find(s => s.id === activeTabId);
    if (session) {
      setSelectedGroup(session.projectSlug);
    } else if (activeTabId === scope?.id) {
      setSelectedGroup(scope?.id);
    }
  }, [activeTabId, implementationSessions, scope?.id]);

  // SRV group attention: new output in inactive system terminals
  useEffect(() => {
    if (!window.electronAPI?.terminal?.onData) return;

    const removeData = window.electronAPI.terminal.onData((scopeId) => {
      if ((scopeId === 'friday-server' || scopeId === 'forge-logs' || scopeId === 'vite-server') && selectedGroup !== '__srv__') {
        setSrvAttention(true);
      }
    });

    return removeData;
  }, [selectedGroup]);

  // Listen for "Open Terminal" requests from FridayLogPreview
  useEffect(() => {
    const handler = (e) => {
      const { tabId } = e.detail || {};
      if (tabId === 'friday-server' || tabId === 'forge-logs' || tabId === 'vite-server') {
        setSelectedGroup('__srv__');
        setSrvAttention(false);
        onTabSelect(tabId);
      }
    };
    window.addEventListener('forge:open-terminal', handler);
    return () => window.removeEventListener('forge:open-terminal', handler);
  }, [onTabSelect]);

  // Group sessions by projectSlug
  const sessionsByProject = useMemo(() => {
    const groups = {};
    for (const session of implementationSessions) {
      const slug = session.projectSlug || 'studio';
      if (!groups[slug]) groups[slug] = [];
      groups[slug].push(session);
    }
    return groups;
  }, [implementationSessions]);

  // Detect status transitions for attention flash
  useEffect(() => {
    const newStatuses = {};
    for (const s of implementationSessions) {
      newStatuses[s.id] = s.status;
      const prev = prevStatusesRef.current[s.id];
      // If a session just transitioned from running → done/failed, mark its group as needing attention
      if (prev === 'running' && (s.status === 'done' || s.status === 'failed')) {
        const slug = s.projectSlug || 'studio';
        if (slug !== selectedGroup) {
          setSeenGroups(prev => {
            const next = new Set(prev);
            next.delete(slug);
            return next;
          });
        }
      }
    }
    prevStatusesRef.current = newStatuses;
  }, [implementationSessions, selectedGroup]);

  // Build ordered list of project groups
  const projectGroups = useMemo(() => {
    const slugs = new Set(['studio']);
    if (scope?.id && scope.id !== 'studio') slugs.add(scope.id);
    for (const slug of Object.keys(sessionsByProject)) slugs.add(slug);

    return Array.from(slugs).map(slug => {
      const sessions = sessionsByProject[slug] || [];
      const running = sessions.filter(s => s.status === 'running').length;
      const done = sessions.filter(s => s.status === 'done').length;
      const failed = sessions.filter(s => s.status === 'failed').length;
      const project = projects.find(p => p.slug === slug);
      const needsAttention = (done > 0 || failed > 0) && !seenGroups.has(slug);

      return {
        slug,
        label: getProjectLabel(slug),
        fullName: slug === 'studio' ? 'Studio' : (project?.name || slug),
        count: sessions.length,
        running,
        done,
        failed,
        needsAttention,
        sessions,
      };
    });
  }, [sessionsByProject, scope?.id, projects, seenGroups]);

  // Sessions visible in the bottom tier
  const visibleSessions = sessionsByProject[selectedGroup] || [];
  const isGroupScopeActive = selectedGroup === scope?.id;
  const showBottomTier = isGroupScopeActive || visibleSessions.length > 0 || selectedGroup === '__srv__';

  const handleGroupClick = (slug) => {
    setSelectedGroup(slug);
    setSeenGroups(prev => new Set([...prev, slug]));
    if (slug === scope?.id) {
      onTabSelect(scope?.id);
    } else if (sessionsByProject[slug]?.length > 0) {
      const currentInGroup = sessionsByProject[slug]?.find(s => s.id === activeTabId);
      if (!currentInGroup) {
        onTabSelect(sessionsByProject[slug][0].id);
      }
    }
    playSound('tab');
  };

  const handleSrvClick = () => {
    setSelectedGroup('__srv__');
    setSrvAttention(false);
    // Default to vite-server tab unless already on a SRV tab
    const srvTabs = ['vite-server', 'friday-server', 'forge-logs'];
    onTabSelect(srvTabs.includes(activeTabId) ? activeTabId : 'vite-server');
    playSound('tab');
  };

  const srvStatusDotColor = fridayProcessStatus === 'running' ? '#22C55E'
    : fridayProcessStatus === 'crashed' ? '#EF4444' : '#D946EF';

  return (
    <div className="border-b border-forge-border bg-forge-surface/50">
      {/* ══════ TOP TIER: Project Group Pills + SRV ══════ */}
      <div className="flex items-center gap-0.5 px-1.5 py-1">
        {projectGroups.map(group => {
          const isSelected = selectedGroup === group.slug;
          const attentionColor = group.failed > 0 ? '#EF4444' : group.done > 0 ? '#22C55E' : null;

          return (
            <button
              key={group.slug}
              onClick={() => handleGroupClick(group.slug)}
              title={`${group.fullName}${group.count > 0 ? ` — ${group.count} session${group.count !== 1 ? 's' : ''}` : ''}`}
              className={`
                relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold
                transition-all duration-200 select-none flex-shrink-0
                ${isSelected
                  ? 'bg-forge-bg/80 text-forge-text-secondary shadow-sm'
                  : 'text-forge-text-muted hover:text-forge-text-secondary hover:bg-forge-bg/40'
                }
              `}
              style={isSelected ? {
                boxShadow: `0 1px 0 0 ${group.slug === 'studio' ? '#C52638' : (attentionColor || 'var(--forge-accent, #C52638)')}`,
              } : undefined}
            >
              {group.needsAttention && !isSelected && (
                <span
                  className="absolute inset-0 rounded-md animate-attention-ring pointer-events-none"
                  style={{
                    boxShadow: `inset 0 0 0 1px ${attentionColor}60, 0 0 8px ${attentionColor}30`,
                  }}
                />
              )}

              {group.slug === 'studio' ? (
                <span className="w-1.5 h-1.5 rounded-full bg-forge-accent flex-shrink-0" />
              ) : group.running > 0 ? (
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse" style={{ backgroundColor: '#F97316' }} />
              ) : group.count > 0 ? (
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: group.failed > 0 ? '#EF4444' : group.done > 0 ? '#22C55E' : '#64748b' }} />
              ) : null}

              <span className="tracking-wide">{group.label}</span>

              {group.count > 0 && (
                <span
                  className={`min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold leading-none px-0.5
                    ${group.needsAttention && !isSelected ? 'animate-attention-badge' : ''}`}
                  style={{
                    backgroundColor: group.running > 0 ? '#F9731625' : group.failed > 0 ? '#EF444425' : group.done > 0 ? '#22C55E25' : '#64748b20',
                    color: group.running > 0 ? '#F97316' : group.failed > 0 ? '#EF4444' : group.done > 0 ? '#22C55E' : '#64748b',
                  }}
                >
                  {group.count}
                </span>
              )}
            </button>
          );
        })}

        {/* Spacer pushes SRV + controls to right */}
        <div className="flex-1" />

        {/* ── SRV System Group Pill ── */}
        <button
          onClick={handleSrvClick}
          title="Server terminals — Vite Dev + Friday Server + Forge Logs"
          className={`
            relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold
            transition-all duration-200 select-none flex-shrink-0
            ${selectedGroup === '__srv__'
              ? 'bg-forge-bg/80 text-fuchsia-400 shadow-sm'
              : 'text-forge-text-muted hover:text-fuchsia-400 hover:bg-forge-bg/40'
            }
          `}
          style={selectedGroup === '__srv__' ? {
            boxShadow: '0 1px 0 0 #D946EF',
            border: '1px solid rgba(217, 70, 239, 0.3)',
          } : {
            border: '1px solid transparent',
          }}
        >
          {srvAttention && selectedGroup !== '__srv__' && (
            <span
              className="absolute inset-0 rounded-md animate-attention-ring pointer-events-none"
              style={{ boxShadow: 'inset 0 0 0 1px #D946EF60, 0 0 8px #D946EF30' }}
            />
          )}
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: srvStatusDotColor }} />
          <span className="tracking-wide">SRV</span>
        </button>

        <span className="text-[9px] text-forge-text-muted/30 font-mono pr-1 hidden lg:inline select-none">
          {implementationSessions.length > 0
            ? `${implementationSessions.filter(s => s.status === 'running').length} active`
            : ''
          }
        </span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Redraw terminal (fixes display glitches)"
            className="text-[11px] text-forge-text-muted/40 hover:text-forge-text-secondary px-1.5 py-0.5
                       rounded hover:bg-forge-bg/40 transition-colors select-none"
          >
            {'\u21BB'}
          </button>
        )}
      </div>

      {/* ══════ BOTTOM TIER: Tabs for Selected Group ══════ */}
      {showBottomTier && (
        <div className="flex items-center border-t border-forge-border/40 bg-forge-bg/20">
          {/* ── Project group tabs ── */}
          {selectedGroup !== '__srv__' && (
            <>
              {isGroupScopeActive && (
                <button
                  onClick={() => onTabSelect(scope?.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono flex-shrink-0 transition-colors border-b-2 ${
                    (!activeTabId || activeTabId === scope?.id)
                      ? 'border-forge-accent text-forge-text-secondary bg-forge-bg/30'
                      : 'border-transparent text-forge-text-muted hover:text-forge-text-secondary hover:bg-forge-bg/20'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-forge-accent animate-pulse-glow flex-shrink-0" />
                  <span className="truncate max-w-[140px]">Terminal</span>
                </button>
              )}
              {visibleSessions.map(session => (
                <SessionTab
                  key={session.id}
                  session={session}
                  isActive={activeTabId === session.id}
                  agentBrains={agentBrains}
                  onSelect={onTabSelect}
                  onClose={onTabClose}
                />
              ))}
              {visibleSessions.length === 0 && !isGroupScopeActive && (
                <div className="px-3 py-1.5 text-[10px] text-forge-text-muted/50 font-mono italic">
                  No sessions
                </div>
              )}
            </>
          )}

          {/* ── SRV system tabs (no close button — system managed) ── */}
          {selectedGroup === '__srv__' && (
            <>
              <button
                onClick={() => onTabSelect('vite-server')}
                className={`flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono flex-shrink-0 transition-colors border-b-2 ${
                  activeTabId === 'vite-server'
                    ? 'border-cyan-500 text-cyan-400 bg-forge-bg/30'
                    : 'border-transparent text-forge-text-muted hover:text-cyan-400 hover:bg-forge-bg/20'
                }`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-cyan-400" />
                <span>{'\u26A1'} Vite Dev</span>
              </button>
              <button
                onClick={() => onTabSelect('friday-server')}
                className={`flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono flex-shrink-0 transition-colors border-b-2 ${
                  activeTabId === 'friday-server'
                    ? 'border-fuchsia-500 text-fuchsia-400 bg-forge-bg/30'
                    : 'border-transparent text-forge-text-muted hover:text-fuchsia-400 hover:bg-forge-bg/20'
                }`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: srvStatusDotColor }} />
                <span>{'\uD83D\uDFE3'} Friday Server</span>
              </button>
              <button
                onClick={() => onTabSelect('forge-logs')}
                className={`flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono flex-shrink-0 transition-colors border-b-2 ${
                  activeTabId === 'forge-logs'
                    ? 'border-blue-500 text-blue-400 bg-forge-bg/30'
                    : 'border-transparent text-forge-text-muted hover:text-blue-400 hover:bg-forge-bg/20'
                }`}
              >
                <span>{'\u26A1'} Forge Logs</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SessionTab({ session, isActive, agentBrains, onSelect, onClose }) {
  const statusIcon =
    session.status === 'running' ? '\u21BB' :
    session.status === 'done' ? '\u2713' :
    '\u2717';
  const statusColor =
    session.status === 'running' ? 'text-forge-text-secondary' :
    session.status === 'done' ? 'text-green-400' :
    'text-red-400';

  const agentId = session.agentId || null;
  const brain = agentId ? getAgentBrain(agentId, agentBrains) : null;
  const modelInfo = brain ? getModelDisplay(brain) : null;

  return (
    <div
      className={`group flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono flex-shrink-0 cursor-pointer
                  transition-colors border-b-2 ${
        isActive
          ? 'border-b-current bg-forge-bg/30'
          : 'border-transparent hover:bg-forge-bg/20'
      }`}
      style={isActive ? { borderBottomColor: session.agentColor } : undefined}
      onClick={() => onSelect(session.id)}
    >
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 ${session.status === 'running' ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: session.agentColor }}
      />
      <span className={`truncate max-w-[160px] ${isActive ? 'text-forge-text-secondary' : 'text-forge-text-muted'}`}>
        {session.label}
      </span>
      {modelInfo && (
        <span
          className="text-[8px] px-1 rounded font-medium flex-shrink-0"
          style={{ color: modelInfo.color, backgroundColor: `${modelInfo.color}15` }}
        >
          {modelInfo.name}
        </span>
      )}
      <span className={`flex-shrink-0 ${statusColor} ${session.status === 'running' ? 'animate-spin inline-block' : ''}`}>
        {statusIcon}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onClose(session.id); }}
        className="text-forge-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 text-sm flex-shrink-0"
        title={session.status === 'running' ? 'Stop & close' : 'Close tab'}
      >
        &times;
      </button>
    </div>
  );
}
