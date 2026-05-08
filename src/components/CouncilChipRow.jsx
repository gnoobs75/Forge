import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { playSound } from '../utils/sounds';
import { getAgentBrain, getModelFlag } from '../utils/brainConfig';
import { spawnCouncilSession } from '../utils/spawnCouncilSession';

// Quick agent dispatch bar with Ctrl+Click multi-select. Normal click on a
// chip spawns that single agent against the project. Ctrl/Cmd/Shift+Click
// toggles selection; once 1+ are selected, a sticky action row appears
// with Assemble Council + Clear. Assemble fires spawnCouncilSession,
// which creates a single PTY tab labeled "Council: A + B + C" and
// auto-types `@AgentA @AgentB @AgentC — ` so the user can finish the
// prompt themselves.
export default function CouncilChipRow({ project, agents, agentBrains, setActiveAgent, startAgentSession }) {
  const rawSelection = useStore((s) => s.councilSelection[project.slug]);
  const toggleCouncilAgent = useStore((s) => s.toggleCouncilAgent);
  const clearCouncilSelection = useStore((s) => s.clearCouncilSelection);

  // Stable Set for membership checks. rawSelection may be undefined; the
  // useMemo means the Set reference only changes when the selection
  // array actually changes (Zustand v5 selector discipline).
  const selectionSet = useMemo(
    () => new Set(rawSelection || []),
    [rawSelection]
  );

  const selectedAgents = useMemo(() => {
    if (!rawSelection || rawSelection.length === 0) return [];
    const bySlug = new Set(rawSelection);
    return agents
      .filter((a) => bySlug.has(a.id))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [rawSelection, agents]);

  const selectionCount = selectedAgents.length;
  const containerRef = useRef(null);
  const assembleBtnRef = useRef(null);

  // Auto-focus Assemble on the 0 → 1 transition only. Without this gate
  // each subsequent Ctrl+Click would steal focus back from the user.
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (prevCountRef.current === 0 && selectionCount > 0) {
      requestAnimationFrame(() => {
        try { assembleBtnRef.current?.focus({ preventScroll: true }); } catch {}
      });
    }
    prevCountRef.current = selectionCount;
  }, [selectionCount]);

  const spawnSingle = useCallback((agent) => {
    if (window.electronAPI?.terminal) {
      const brain = getAgentBrain(agent.id, agentBrains);
      const mFlag = getModelFlag(brain);
      startAgentSession(agent, project, { modelFlag: mFlag });
      playSound('spawn');
    } else {
      setActiveAgent?.(agent.id);
    }
  }, [agentBrains, project, startAgentSession, setActiveAgent]);

  const handleChipClick = useCallback((e, agent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      toggleCouncilAgent(project.slug, agent.id);
      playSound('click');
      return;
    }
    spawnSingle(agent);
  }, [toggleCouncilAgent, project.slug, spawnSingle]);

  const handleAssemble = useCallback(() => {
    if (selectedAgents.length === 0) return;
    if (window.electronAPI?.terminal) {
      const lead = selectedAgents[0];
      const brain = getAgentBrain(lead.id, agentBrains);
      const modelFlag = getModelFlag(brain);
      spawnCouncilSession({
        startAgentSession,
        agents: selectedAgents,
        project,
        modelFlag,
      });
      playSound('spawn');
    } else {
      setActiveAgent?.(selectedAgents[0].id);
    }
    clearCouncilSelection(project.slug);
  }, [selectedAgents, agentBrains, project, startAgentSession, setActiveAgent, clearCouncilSelection]);

  const handleClear = useCallback(() => {
    clearCouncilSelection(project.slug);
    playSound('click');
  }, [clearCouncilSelection, project.slug]);

  // Escape clears selection.
  useEffect(() => {
    if (selectionCount === 0) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectionCount, handleClear]);

  // Click outside the chip row also clears selection.
  useEffect(() => {
    if (selectionCount === 0) return;
    const onMouseDown = (e) => {
      const el = containerRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      handleClear();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [selectionCount, handleClear]);

  return (
    <div className="card" ref={containerRef}>
      <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
        Ask Your Team About {project.name}
      </h2>
      <div className="flex flex-wrap gap-2">
        {agents.map((agent) => {
          const selected = selectionSet.has(agent.id);
          const chipClass = selected
            ? 'flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-all hover:scale-105'
            : 'flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-forge-border bg-forge-bg/50 text-[10px] font-medium transition-all hover:scale-105';
          const chipStyle = selected
            ? { backgroundColor: agent.color, borderColor: agent.color, color: '#ffffff' }
            : undefined;
          return (
            <button
              key={agent.id}
              onClick={(e) => handleChipClick(e, agent)}
              className={chipClass}
              style={chipStyle}
              onMouseEnter={(e) => {
                if (!selected) {
                  e.currentTarget.style.borderColor = `${agent.color}40`;
                  e.currentTarget.style.backgroundColor = `${agent.color}10`;
                }
              }}
              onMouseLeave={(e) => {
                if (!selected) {
                  e.currentTarget.style.borderColor = '';
                  e.currentTarget.style.backgroundColor = '';
                }
              }}
              title={`@${agent.name.replace(/\s+/g, '')} — ${agent.role}`}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: selected ? '#ffffff' : agent.color }}
              />
              <span className={selected ? '' : 'text-forge-text-secondary'}>{agent.name}</span>
              {selected && (
                <span className="ml-0.5 text-[10px] leading-none" aria-hidden="true">
                  {'✓'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectionCount === 0 && (
        <div className="mt-2 text-[10px] text-forge-text-muted">
          {'\u{1F4A1} '}Ctrl+Click agents to brief multiple at once.
        </div>
      )}

      {selectionCount >= 1 && (
        <div className="mt-3 pt-3 border-t border-forge-border flex items-center gap-3 flex-wrap">
          <span className="text-xs font-mono text-forge-text-secondary">
            {selectionCount} agent{selectionCount === 1 ? '' : 's'} selected
          </span>
          <span className="text-forge-text-muted text-[10px]">&middot;</span>
          <div className="flex items-center gap-1 flex-wrap">
            {selectedAgents.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: `${a.color}22`, color: a.color }}
                title={a.name}
              >
                <span
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: a.color }}
                />
                {a.name}
              </span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              ref={assembleBtnRef}
              onClick={handleAssemble}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAssemble();
                }
              }}
              className="px-3 py-1 rounded-lg text-[11px] font-medium bg-forge-accent text-forge-bg hover:brightness-110 transition-all"
            >
              {'⏎'} Assemble Council
            </button>
            <button
              onClick={handleClear}
              className="px-3 py-1 rounded-lg text-[11px] font-medium text-forge-text-muted hover:text-forge-text-primary border border-forge-border hover:border-forge-text-muted transition-all"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
