// StewardLive — live data view of the Studio Steward.
//
// Mounted inside HelpPanel's "The Steward" tab below the static explainer
// cards. Subscribes to window.electronAPI?.steward.onStatus for live heartbeat
// updates (the Phase 1+2+3 daemon emits status every 30s; we also fire
// getStatus() on mount and after any control action for instant refresh).
//
// Pure React — no main.cjs or preload.cjs changes required, so this ships
// HMR-safe. The retry button gracefully degrades if window.electronAPI?.steward
// hasn't been refreshed with retryTask yet (next CoE restart picks it up).

import React, { useEffect, useState, useCallback } from 'react';

const OUTCOME_COLORS = {
  success: '#22C55E',
  skipped: '#94A3B8',
  error:   '#EF4444',
  timeout: '#F97316',
  'skipped-low-confidence': '#A78BFA',
};

function formatAgo(ms) {
  if (ms == null) return 'n/a';
  if (ms < 1000) return `${ms}ms ago`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ago`;
}

function formatAbsoluteTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return iso; }
}

export default function StewardLive() {
  const [status, setStatus] = useState(null);
  const [pauseInput, setPauseInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Subscribe + initial fetch
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI?.steward : null;
    if (!api?.getStatus) return;
    let cancelled = false;
    Promise.resolve(api.getStatus())
      .then(s => { if (!cancelled && s) setStatus(s); })
      .catch(() => {});
    const unsub = typeof api.onStatus === 'function'
      ? api.onStatus((s) => { if (!cancelled) setStatus(s); })
      : null;
    return () => {
      cancelled = true;
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    const api = window.electronAPI?.steward;
    if (!api?.getStatus) return;
    setBusy(true);
    try {
      const s = await api.getStatus();
      if (s) setStatus(s);
    } finally { setBusy(false); }
  }, []);

  const handlePause = useCallback(async () => {
    const api = window.electronAPI?.steward;
    if (!api?.pause || !pauseInput.trim()) return;
    await api.pause(pauseInput.trim());
    showToast(`Paused ${pauseInput.trim()}`, 'success');
    setPauseInput('');
    setTimeout(refreshStatus, 200);
  }, [pauseInput, refreshStatus, showToast]);

  const handleResume = useCallback(async (project) => {
    const api = window.electronAPI?.steward;
    if (!api?.resume) return;
    await api.resume(project);
    showToast(`Resumed ${project}`, 'success');
    setTimeout(refreshStatus, 200);
  }, [refreshStatus, showToast]);

  const handleRetry = useCallback(async (taskId) => {
    const api = window.electronAPI?.steward;
    // retryTask is a Phase 4 preload addition — degrades gracefully if absent
    if (typeof api?.retryTask !== 'function') {
      showToast('Restart CoE to enable retry (preload needs reload)', 'error');
      return;
    }
    await api.retryTask(taskId);
    showToast(`Re-queued ${taskId.slice(-8)}`, 'success');
    setTimeout(refreshStatus, 500);
  }, [refreshStatus, showToast]);

  const ipcMissing = typeof window === 'undefined' || !window.electronAPI?.steward;

  if (ipcMissing) {
    return (
      <div className="text-sm text-forge-text-muted italic">
        Steward IPC not exposed — running in browser-only mode? See <code className="text-forge-accent">window.electronAPI?.steward</code>.
      </div>
    );
  }

  if (!status) {
    return <div className="text-sm text-forge-text-muted">Loading Steward status…</div>;
  }

  const healthy = status.healthy && status.db?.open && status.pool?.running;
  const dotColor = healthy ? 'bg-green-400' : 'bg-yellow-400';

  return (
    <div className="space-y-4">
      {/* Heartbeat banner */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-forge-bg/50 border border-forge-border/50">
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor} flex-shrink-0`} />
        <div className="flex-1 text-sm">
          <div className="font-semibold text-forge-text-primary">
            {healthy ? 'Healthy' : 'Degraded'}
            {' · '}
            <span className="text-forge-text-secondary font-normal">
              queue: {status.queueDepth ?? 0}
              {' · '}
              workers: {status.pool?.inFlight ?? 0}/{status.pool?.concurrency ?? 0}
              {' · '}
              uptime: {formatAgo(status.uptimeMs)}
              {' · '}
              last event: {formatAgo(status.lastEventAgoMs)}
            </span>
          </div>
          <div className="text-xs text-forge-text-muted mt-0.5">
            db: {status.db?.open ? `open (schema v${status.db.schemaVersion})` : 'closed'}
            {' · '}
            pool: {status.pool?.running ? `running (${status.pool.totalSucceeded || 0} ✓ / ${status.pool.totalErrored || 0} ✗ / ${status.pool.totalRun || 0} total)` : 'stopped'}
            {' · '}
            failed: {status.failedCount ?? 0}
          </div>
        </div>
        <button
          onClick={refreshStatus}
          disabled={busy}
          className="px-3 py-1.5 text-xs rounded-lg border border-forge-border text-forge-text-secondary hover:text-forge-text-primary hover:border-forge-text-muted disabled:opacity-50"
        >
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`p-2 rounded-lg text-sm ${
          toast.kind === 'success' ? 'bg-green-400/10 text-green-400 border border-green-400/20' :
          toast.kind === 'error' ? 'bg-red-400/10 text-red-400 border border-red-400/20' :
          'bg-forge-bg/50 text-forge-text-secondary border border-forge-border'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Per-project pause */}
      <div className="p-3 rounded-lg bg-forge-bg/30 border border-forge-border/50">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-forge-text-primary">Per-project pause</div>
          <div className="text-xs text-forge-text-muted">
            paused: {status.config?.paused?.length || 0}
          </div>
        </div>
        {(status.config?.paused || []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {status.config.paused.map(p => (
              <span key={p} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-yellow-400/10 text-yellow-400 border border-yellow-400/30">
                {p}
                <button
                  onClick={() => handleResume(p)}
                  className="ml-0.5 text-yellow-400/70 hover:text-yellow-400"
                  title="Resume this project"
                >×</button>
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs text-forge-text-muted mb-2 italic">No projects paused — Steward is acting on every event.</div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={pauseInput}
            onChange={(e) => setPauseInput(e.target.value)}
            placeholder="project slug (e.g. arena)"
            className="flex-1 px-2 py-1 text-xs rounded bg-forge-bg border border-forge-border text-forge-text-primary placeholder:text-forge-text-muted"
            onKeyDown={(e) => e.key === 'Enter' && handlePause()}
          />
          <button
            onClick={handlePause}
            disabled={!pauseInput.trim()}
            className="px-3 py-1 text-xs rounded bg-forge-accent/10 text-forge-accent border border-forge-accent/20 hover:bg-forge-accent/20 disabled:opacity-30"
          >
            Pause
          </button>
        </div>
      </div>

      {/* Failed actions — surfaced first so user sees problems */}
      {(status.failedTasks || []).length > 0 && (
        <div className="p-3 rounded-lg bg-red-400/5 border border-red-400/20">
          <div className="text-sm font-semibold text-red-400 mb-2">
            Failed actions ({status.failedCount})
          </div>
          <div className="space-y-1.5">
            {status.failedTasks.map(t => (
              <div key={t.task_id} className="flex items-start gap-2 p-2 rounded bg-forge-bg/40 border border-forge-border/40">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-red-400">{t.outcome}</span>
                    <span className="text-forge-text-muted">·</span>
                    <span className="text-forge-text-secondary">{t.rule_id}</span>
                    <span className="text-forge-text-muted">·</span>
                    <span className="text-forge-text-muted">{t.project}</span>
                    <span className="text-forge-text-muted">·</span>
                    <span className="text-forge-text-muted">{formatAbsoluteTime(t.completed_at)}</span>
                  </div>
                  {t.error && (
                    <div className="text-xs text-forge-text-muted mt-1 font-mono truncate" title={t.error}>
                      {t.error.split('\n')[0].slice(0, 200)}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRetry(t.task_id)}
                  className="px-2 py-1 text-xs rounded border border-red-400/30 text-red-400 hover:bg-red-400/10 flex-shrink-0"
                  title="Re-queue this task"
                >
                  Retry
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent actions */}
      <div className="p-3 rounded-lg bg-forge-bg/30 border border-forge-border/50">
        <div className="text-sm font-semibold text-forge-text-primary mb-2">
          Recent actions ({(status.recentActions || []).length})
        </div>
        {(status.recentActions || []).length === 0 ? (
          <div className="text-xs text-forge-text-muted italic">
            No actions yet. Drop a recommendation file with <code className="text-forge-accent">status: "resolved"</code> into a project's recommendations dir to see the rec-resolved-update-history rule fire.
          </div>
        ) : (
          <div className="space-y-1">
            {status.recentActions.map(t => (
              <div key={t.task_id} className="flex items-start gap-2 py-1 border-b border-forge-border/20 last:border-b-0">
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: OUTCOME_COLORS[t.outcome] || '#666' }}
                  title={t.outcome}
                />
                <div className="flex-1 min-w-0 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-forge-text-primary">{t.rule_id}</span>
                    <span className="text-forge-text-muted">·</span>
                    <span className="text-forge-text-secondary">{t.project}</span>
                    <span className="text-forge-text-muted">·</span>
                    <span className="text-forge-text-muted" title={t.completed_at}>
                      {formatAbsoluteTime(t.completed_at)}
                    </span>
                    <span
                      className="text-[10px] uppercase tracking-wider px-1.5 rounded"
                      style={{
                        color: OUTCOME_COLORS[t.outcome] || '#666',
                        backgroundColor: `${OUTCOME_COLORS[t.outcome] || '#666'}10`,
                      }}
                    >
                      {t.outcome}
                    </span>
                  </div>
                  {t.output && (
                    <div className="text-forge-text-muted mt-0.5 truncate" title={t.output}>
                      {t.output.slice(0, 200)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
