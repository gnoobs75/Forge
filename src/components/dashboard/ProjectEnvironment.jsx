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

  const onRemoveLauncher = async (index) => {
    playSound('click');
    try {
      const cfgPath = `projects/${project.slug}/project.json`;
      const read = await api.hq.readFile(cfgPath);
      if (!read?.ok) { flash('Could not read project.json'); return; }
      let cfg;
      try { cfg = JSON.parse(read.data); }
      catch { flash('project.json is not valid JSON'); return; }
      const existing = Array.isArray(cfg.launchers) ? cfg.launchers : [];
      if (index < 0 || index >= existing.length) return;
      cfg.launchers = existing.filter((_, i) => i !== index);
      const write = await api.hq.writeFile(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
      if (!write?.ok) flash(write?.error || 'Could not save project.json');
    } catch (err) {
      flash(err.message);
    }
  };

  const onAddLauncher = async () => {
    playSound('click');
    try {
      const pick = await api?.project?.pickLauncher(project.repoPath);
      if (!pick || pick.canceled) return;
      if (pick.ok === false) {
        flash(pick.error || 'Picker failed');
        return;
      }
      const newEntry = {
        name: deriveLauncherName(pick.relativePath),
        script: pick.relativePath,
      };
      const cfgPath = `projects/${project.slug}/project.json`;
      const read = await api.hq.readFile(cfgPath);
      if (!read?.ok) {
        flash('Could not read project.json');
        return;
      }
      let cfg;
      try { cfg = JSON.parse(read.data); }
      catch { flash('project.json is not valid JSON'); return; }
      const existing = Array.isArray(cfg.launchers) ? cfg.launchers : [];
      if (existing.some((l) => l.script === newEntry.script)) {
        flash(`Launcher for "${newEntry.script}" already exists`);
        return;
      }
      cfg.launchers = [...existing, newEntry];
      const write = await api.hq.writeFile(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
      if (!write?.ok) {
        flash(write?.error || 'Could not save project.json');
      }
    } catch (err) {
      flash(err.message);
    }
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

      {hasRepoPath && <div className="border-t border-forge-border" />}

      {/* Row 2: Launchers — always shown when repoPath exists (for the + button) */}
      {hasRepoPath && (
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
                <div
                  key={i}
                  className="group flex items-center rounded-lg border border-forge-border bg-forge-bg/50
                             hover:border-forge-accent-blue/50 hover:bg-forge-bg transition-all"
                >
                  <button
                    onClick={() => onRunLauncher(l.script)}
                    className="flex items-center gap-2 pl-3 pr-2 py-1.5 text-[11px]"
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
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveLauncher(i); }}
                    className="px-2 py-1.5 text-[11px] text-forge-text-muted
                               hover:text-red-400 transition-colors opacity-50 group-hover:opacity-100"
                    title={`Remove ${l.name}`}
                    aria-label={`Remove ${l.name}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              onClick={onAddLauncher}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-forge-border
                         text-forge-text-muted hover:text-forge-accent-blue hover:border-forge-accent-blue/50
                         transition-all text-[11px]"
              title="Browse to a .bat / .vbs / .cmd file inside the project"
            >
              <span className="text-sm leading-none">+</span>
              <span>{hasLaunchers ? 'Add Launcher' : 'Add a Launcher'}</span>
            </button>
          </div>
        </div>
      )}

      {hasRepoPath && hasPorts && <div className="border-t border-forge-border" />}

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

function deriveLauncherName(relativePath) {
  const base = relativePath.split(/[\\/]/).pop() || relativePath;
  const noExt = base.replace(/\.[^.]+$/, '');
  return noExt
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || base;
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
