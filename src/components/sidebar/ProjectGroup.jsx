import React, { useState } from 'react';
import SessionRow from './SessionRow.jsx';

const LIVE_STATES = new Set(['starting', 'working', 'your-turn']);
const DORMANT_STATES = new Set(['detached', 'done']);

function aggregateSignals(sessions) {
  let fire = false, attention = false;
  for (const s of sessions) {
    if (s.state === 'working' || s.state === 'starting') fire = true;
    if (s.state === 'your-turn') attention = true;
  }
  return { fire, attention };
}

// Wraps a child row with a tree connector glyph (├─ or └─) absolutely
// positioned so it overlays SessionRow's existing pl-7 padding without
// shifting layout. `nested` adds an extra indent for dormant children.
function TreeChild({ children, isLast, nested }) {
  const left = nested ? 18 : 6;
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="absolute top-1/2 -translate-y-1/2 font-mono text-[10px] text-forge-text-muted/30 select-none pointer-events-none leading-none"
        style={{ left }}
      >{isLast ? '└─' : '├─'}</span>
      {children}
    </div>
  );
}

export default function ProjectGroup({
  slug, label, fullName, sessions, projectColor,
  isExpanded, isProjectScopeActive, activeTabId,
  onToggle, onSelectScope, onSelectSession, onCloseSession, onReattachSession, onNewSession,
  onHoverShowCwd, onHoverHide,
}) {
  const [dormantOpen, setDormantOpen] = useState(false);

  const live = sessions.filter(s => LIVE_STATES.has(s.state));
  const dormant = sessions.filter(s => DORMANT_STATES.has(s.state));
  const { fire, attention } = aggregateSignals(sessions);
  const stripeColor = projectColor || '#475569';

  const folderIcon = isExpanded ? '📂' : '📁';

  const toggleDormant = (e) => {
    e.stopPropagation();
    setDormantOpen(v => !v);
  };

  return (
    <div
      data-testid={`project-group-${slug}`}
      className="select-none relative"
    >
      {/* Color stripe — full block height, brighter when expanded */}
      <div
        data-testid="color-stripe"
        className="absolute left-0 top-0 bottom-0 w-[2px] pointer-events-none"
        style={{
          backgroundColor: stripeColor,
          opacity: isExpanded ? 0.9 : 0.35,
        }}
      />

      {/* Header row */}
      <div
        data-testid="project-header"
        onClick={() => onToggle(slug)}
        className={`flex items-center gap-2 pl-3 pr-2 py-1 cursor-pointer text-[11px] font-mono
          ${isExpanded ? 'text-forge-text-secondary bg-forge-bg/40' : 'text-forge-text-muted hover:text-forge-text-secondary hover:bg-forge-bg/20'}`}
      >
        <span
          data-testid="folder-icon"
          className="flex-shrink-0 text-[13px] leading-none"
          aria-hidden="true"
        >{folderIcon}</span>
        <span className="flex-1 truncate">{fullName}</span>

        {fire && (
          <span
            data-testid="signal-fire"
            className="flex-shrink-0 text-[12px] leading-none"
            title="Sessions running"
            aria-label="Sessions running"
          >🔥</span>
        )}
        {attention && (
          <span
            data-testid="signal-attention"
            className="flex-shrink-0 text-[12px] leading-none animate-pulse"
            title="Needs your attention"
            aria-label="Needs your attention"
          >❗</span>
        )}

        {live.length > 0 && (
          <span
            data-testid="live-count-badge"
            className="flex items-center gap-0.5 px-1 h-[14px] rounded-full text-[9px] font-bold leading-none bg-emerald-500/15 text-emerald-300"
          >
            <span aria-hidden="true">🟢</span>
            <span>{live.length}</span>
          </span>
        )}
        {dormant.length > 0 && (
          <span
            data-testid="dormant-count-badge"
            onClick={toggleDormant}
            className="flex items-center gap-0.5 px-1 h-[14px] rounded-full text-[9px] font-bold leading-none bg-slate-700/60 text-slate-400 hover:bg-slate-600/60 cursor-pointer"
            title={dormantOpen ? 'Hide dormant' : 'Show dormant'}
          >
            <span aria-hidden="true">💀</span>
            <span>{dormant.length}</span>
          </span>
        )}

        <span className="w-2.5 text-[9px] text-forge-text-muted/50 flex-shrink-0 text-right">
          {isExpanded ? '▾' : '▸'}
        </span>
      </div>

      {/* Children */}
      {isExpanded && (
        <div className="relative">
          {/* Vertical tree bar — runs from top of children area down to
              the new-session row, where the └─ glyph "joins" it. */}
          <div
            aria-hidden="true"
            className="absolute top-0 w-px bg-forge-text-muted/15 pointer-events-none"
            style={{ left: 10, bottom: 14 }}
          />

          {/* Project terminal pseudo-row */}
          <TreeChild>
            <div
              onClick={() => onSelectScope(slug)}
              data-active={isProjectScopeActive ? 'true' : 'false'}
              className={`flex items-center gap-2 pl-7 pr-2 py-1 cursor-pointer text-[11px] font-mono
                ${isProjectScopeActive
                  ? 'bg-forge-bg/60 text-forge-text-secondary'
                  : 'text-forge-text-muted hover:bg-forge-bg/30 hover:text-forge-text-secondary'}`}
              style={isProjectScopeActive
                ? { boxShadow: 'inset 2px 0 0 0 #C52638' } : undefined}
            >
              <span className="flex-shrink-0 text-[12px] leading-none" aria-hidden="true">🖥️</span>
              <span className="truncate">Terminal</span>
            </div>
          </TreeChild>

          {/* Live sessions */}
          {live.map(s => (
            <TreeChild key={s.id}>
              <SessionRow
                session={s}
                isActive={activeTabId === s.id}
                onSelect={onSelectSession}
                onClose={onCloseSession}
                onReattach={onReattachSession}
                onHoverShowCwd={onHoverShowCwd}
                onHoverHide={onHoverHide}
              />
            </TreeChild>
          ))}

          {/* Dormant divider + collapsible subsection */}
          {dormant.length > 0 && (
            <>
              <TreeChild>
                <div
                  data-testid="dormant-divider"
                  onClick={() => setDormantOpen(v => !v)}
                  className="flex items-center gap-2 pl-7 pr-2 py-1 cursor-pointer text-[10px] font-mono text-forge-text-muted/50 hover:text-forge-text-muted hover:bg-forge-bg/20"
                >
                  <span aria-hidden="true" className="text-[11px]">💀</span>
                  <span className="flex-1 truncate">Dormant ({dormant.length})</span>
                  <span className="text-[9px] flex-shrink-0">{dormantOpen ? '▾' : '▸'}</span>
                </div>
              </TreeChild>
              {dormantOpen && dormant.map((s, i) => (
                <TreeChild key={s.id} nested isLast={i === dormant.length - 1}>
                  <SessionRow
                    session={s}
                    isActive={activeTabId === s.id}
                    onSelect={onSelectSession}
                    onClose={onCloseSession}
                    onReattach={onReattachSession}
                    onHoverShowCwd={onHoverShowCwd}
                    onHoverHide={onHoverHide}
                  />
                </TreeChild>
              ))}
            </>
          )}

          {/* + new session — always the last visible row, gets └─ */}
          <TreeChild isLast>
            <div
              onClick={() => onNewSession(slug)}
              className="flex items-center gap-2 pl-7 pr-2 py-1 cursor-pointer text-[10px] font-mono text-forge-text-muted/50 hover:text-forge-accent hover:bg-forge-bg/20"
            >
              <span className="flex-shrink-0 text-[12px] leading-none" aria-hidden="true">➕</span>
              <span>new session</span>
            </div>
          </TreeChild>
        </div>
      )}
    </div>
  );
}
