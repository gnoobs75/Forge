// Studio Steward — worker pool.
//
// Polls the tasks table, claims work, runs the injected jobRunner, persists
// the result. Concurrency cap is enforced by an in-flight counter.
//
// The jobRunner signature is intentionally generic so Phase 3's reactor
// can inject the real prompt-builder + claude-runner flow without this
// module knowing about reactor rules:
//
//   jobRunner(task) → Promise<{ outcome, output?, error? }>
//
// Polling is preferred over event-driven for simplicity. The pool exposes
// `signal()` for explicit wake-ups when the reactor enqueues work.

const DEFAULTS = Object.freeze({
  concurrency: 5,
  pollIntervalMs: 200,
});

export function createWorkerPool({ db, jobRunner, concurrency, pollIntervalMs, logger } = {}) {
  if (!db) throw new Error('createWorkerPool: db required');
  if (typeof jobRunner !== 'function') throw new Error('createWorkerPool: jobRunner required');

  const cfg = {
    concurrency: concurrency ?? DEFAULTS.concurrency,
    pollIntervalMs: pollIntervalMs ?? DEFAULTS.pollIntervalMs,
  };
  const log = logger || console;

  let inFlight = 0;
  let totalRun = 0;
  let totalErrored = 0;
  let totalSucceeded = 0;
  let running = false;
  let pollTimer = null;
  let stopRequested = false;
  let drainResolvers = [];

  function start() {
    if (running) return;
    running = true;
    stopRequested = false;
    // Crash recovery: any tasks that were in-flight when the previous
    // Steward died get moved back to the unclaimed queue.
    try {
      const requeued = db.requeueOrphans();
      if (requeued > 0) log.log?.(`[Steward pool] Requeued ${requeued} orphan task(s) from previous run`);
    } catch (err) {
      log.error?.('[Steward pool] requeueOrphans failed:', err);
    }
    schedulePoll(0);
  }

  async function stop({ drainMs = 5000 } = {}) {
    stopRequested = true;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    // Wait for in-flight tasks to finish (or timeout)
    if (inFlight === 0) {
      running = false;
      return { drainedCleanly: true, inFlight: 0 };
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        running = false;
        resolve({ drainedCleanly: false, inFlight });
      }, drainMs);
      drainResolvers.push(() => {
        clearTimeout(timer);
        running = false;
        resolve({ drainedCleanly: true, inFlight });
      });
    });
  }

  function signal() {
    // Wake the poller immediately
    if (running && !stopRequested) {
      if (pollTimer) clearTimeout(pollTimer);
      schedulePoll(0);
    }
  }

  function status() {
    return {
      running,
      inFlight,
      totalRun,
      totalSucceeded,
      totalErrored,
      concurrency: cfg.concurrency,
    };
  }

  function schedulePoll(delayMs) {
    pollTimer = setTimeout(poll, delayMs);
  }

  function poll() {
    pollTimer = null;
    if (!running || stopRequested) return;

    // Claim as many tasks as we have free slots for
    while (inFlight < cfg.concurrency) {
      let task;
      try {
        task = db.claimNextTask();
      } catch (err) {
        log.error?.('[Steward pool] claimNextTask failed:', err);
        break;
      }
      if (!task) break;
      inFlight++;
      runTask(task);
    }

    // Reschedule next poll
    if (!stopRequested) schedulePoll(cfg.pollIntervalMs);
  }

  async function runTask(task) {
    let outcome = 'error';
    let output = null;
    let error = null;
    try {
      const result = await jobRunner(task);
      outcome = result?.outcome || 'success';
      output = result?.output ?? null;
      error = result?.error ?? null;
    } catch (err) {
      outcome = 'error';
      error = err?.stack || String(err?.message || err);
    } finally {
      try {
        db.completeTask({ taskId: task.id, outcome, output, error });
      } catch (dbErr) {
        log.error?.('[Steward pool] completeTask failed for', task.id, dbErr);
      }
      totalRun++;
      if (outcome === 'success') totalSucceeded++;
      else if (outcome === 'error' || outcome === 'timeout') totalErrored++;
      inFlight--;
      if (inFlight === 0 && stopRequested) {
        const resolvers = drainResolvers;
        drainResolvers = [];
        for (const r of resolvers) r();
      }
    }
  }

  return { start, stop, signal, status };
}
