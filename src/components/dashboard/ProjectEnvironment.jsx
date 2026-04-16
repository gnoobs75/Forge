import React, { useState, useEffect, useMemo } from 'react';
import { playSound } from '../../utils/sounds';

/**
 * ProjectEnvironment card
 *
 * Shows three conditionally-rendered rows:
 *   1. Working Directory  — repoPath + action buttons
 *   2. Launchers          — one button per project.launchers entry
 *   3. Ports              — full list of project.ports with live status
 *
 * Hides entirely when none of the three rows have content.
 */
export default function ProjectEnvironment({ project }) {
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [portStatus, setPortStatus] = useState({}); // { [portNumber]: { up, latencyMs } }

  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  // Normalize project.ports to { [label]: number }
  const portMap = useMemo(() => {
    const out = {};
    if (!project?.ports) return out;
    for (const [label, info] of Object.entries(project.ports)) {
      const portNum = typeof info === 'number' ? info : info?.port;
      if (portNum) out[label] = portNum;
    }
    return out;
  }, [project?.ports]);

  const launchers = Array.isArray(project?.launchers) ? project.launchers : [];
  const hasRepoPath = !!project?.repoPath;
  const hasLaunchers = launchers.length > 0;
  const hasPorts = Object.keys(portMap).length > 0;

  // Subscribe to live port status from the existing broadcast
  useEffect(() => {
    if (!api?.ports?.onStatus) return;
    const unsubscribe = api.ports.onStatus((payload) => {
      // runHealthCheck() broadcasts { health: [...], collisions: [...] }
      // entries: { port, service, status: 'up'|'down'|'occupied', latencyMs }
      if (!payload) return;
      const entries = Array.isArray(payload.health) ? payload.health : (Array.isArray(payload) ? payload : []);
      const next = {};
      for (const e of entries) {
        if (typeof e?.port !== 'number') continue;
        const up = e.status === 'up' || e.status === 'occupied' || e.up === true;
        next[e.port] = { up, latencyMs: e.latencyMs ?? null };
      }
      setPortStatus((prev) => ({ ...prev, ...next }));
    });
    // Kick a refresh so we have data immediately
    if (api.ports.refresh) api.ports.refresh().catch(() => {});
    return unsubscribe;
  }, [api]);

  if (!hasRepoPath && !hasLaunchers && !hasPorts) return null;

  const flash = (msg) => {
    setError(msg);
    setTimeout(() => setError((prev) => (prev === msg ? null : prev)), 3000);
  };

  const handleResult = (result) => {
    if (result && result.ok === false) flash(result.error || 'Action failed');
  };

  const onOpenFolder = async () => {
    playSound('click');
    try { handleResult(await api?.project?.openFolder(project.repoPath)); }
    catch (err) { flash(err.message); }
  };

  const onCopyPath = async () => {
    playSound('click');
    try {
      await navigator.clipboard.writeText(project.repoPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      flash('Copy failed: ' + err.message);
    }
  };

  const onOpenTerminal = async () => {
    playSound('click');
    try { handleResult(await api?.project?.openTerminal(project.repoPath)); }
    catch (err) { flash(err.message); }
  };

  const onRunLauncher = async (script) => {
    playSound('click');
    try { handleResult(await api?.project?.runLauncher(project.repoPath, script)); }
    catch (err) { flash(err.message); }
  };

  return (
    <div className="card space-y-4">
      <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider border-l-2 border-forge-accent pl-3">
        Environment
      </h2>

      {/* Row 1: Working Directory */}
      {hasRepoPath && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-forge-text-muted">📁</span>
            <code className="text-[11px] font-mono text-forge-text-secondary truncate">
              {project.repoPath}
            </code>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={onOpenFolder} label="Open Folder" />
            <ActionButton onClick={onCopyPath} label={copied ? 'Copied!' : 'Copy'} />
            <ActionButton onClick={onOpenTerminal} label="Terminal" />
          </div>
        </div>
      )}

      {hasRepoPath && (hasLaunchers || hasPorts) && (
        <div className="border-t border-forge-border" />
      )}

      {/* Row 2: Launchers */}
      {hasLaunchers && (
        <div className="space-y-2">
          <div className="text-[10px] text-forge-text-muted uppercase tracking-wider">
            Launchers
          </div>
          <div className="flex flex-wrap gap-2">
            {launchers.map((l, i) => {
              const portNum = l.portLabel ? portMap[l.portLabel] : null;
              const status = portNum != null ? portStatus[portNum] : null;
              const dotColor = status?.up ? '#22C55E' : (portNum != null ? '#6B7280' : 'transparent');
              return (
                <button
                  key={i}
                  onClick={() => onRunLauncher(l.script)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-forge-border bg-forge-bg/50
                             hover:border-forge-accent-blue/50 hover:bg-forge-bg transition-all text-[11px]"
                  title={`Run ${l.script}`}
                >
                  {portNum != null && (
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                  )}
                  <span className="font-medium text-forge-text-primary">{l.name}</span>
                  {portNum != null && (
                    <span className="text-[10px] text-forge-text-muted font-mono">:{portNum}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasLaunchers && hasPorts && <div className="border-t border-forge-border" />}

      {/* Row 3: Ports */}
      {hasPorts && (
        <div className="space-y-2">
          <div className="text-[10px] text-forge-text-muted uppercase tracking-wider">
            Ports
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {Object.entries(portMap).map(([label, portNum]) => {
              const status = portStatus[portNum];
              const up = !!status?.up;
              return (
                <div key={label} className="flex items-center gap-2 text-[11px]">
                  <span className="font-medium text-forge-text-secondary">{label}</span>
                  <span className="font-mono text-forge-text-muted">:{portNum}</span>
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: up ? '#22C55E' : '#6B7280' }}
                  />
                  <span className="text-[10px] text-forge-text-muted">
                    {up ? `${status.latencyMs ?? '?'}ms` : 'down'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inline error */}
      {error && (
        <div className="p-2 rounded bg-red-400/10 border border-red-400/30 text-[11px] text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

function ActionButton({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 text-[11px] font-medium text-forge-text-secondary border border-forge-border rounded
                 hover:text-forge-accent-blue hover:border-forge-accent-blue/40 transition-colors"
    >
      {label}
    </button>
  );
}
