// Studio Steward — supervisor with exponential backoff restart.
//
// Tracks restart attempts within a sliding window. Once maxRetries
// is hit inside windowMs, canRestart() returns false until enough
// attempts age out of the window. Delay between attempts grows
// exponentially up to maxDelayMs.
//
// Designed to be called from electron/main.cjs around the steward
// child process lifecycle. Pure logic — no timers, no fork; the
// caller drives.

import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Defense-in-depth: pause firing when HEAD is on a nightshift/* branch.
// The primary mechanism is the foreman writing paused-by:"nightshift" to
// .steward/config.json before checkout; this is a second layer so a crashed
// foreman can't leave the Steward double-firing during a Night Shift session.
// ---------------------------------------------------------------------------

// Cache the branch check for 1 second to avoid hammering git on every event.
let cachedBranch = null;
let cachedAt = 0;

/**
 * Returns true if the repo HEAD is currently on a nightshift/* branch.
 *
 * @param {string}   repoRoot  - Absolute path to the repo root.
 * @param {function} gitExec   - Callable that returns the branch string (injectable for tests).
 *                               Receives (cmd, opts) and returns the branch name string.
 *                               Defaults to a real execSync call.
 * @param {function} now       - Returns current time in ms (injectable for tests).
 */
export function isOnNightshiftBranch(
  repoRoot,
  gitExec = (cmd, opts) => execSync(cmd, { ...opts, encoding: 'utf8' }),
  now = Date.now,
) {
  const t = now();
  if (cachedBranch !== null && t - cachedAt < 1000) {
    return cachedBranch.startsWith('nightshift/');
  }
  try {
    const branch = gitExec('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot });
    cachedBranch = String(branch).trim();
    cachedAt = t;
    return cachedBranch.startsWith('nightshift/');
  } catch {
    // If we can't determine the branch (no git, detached HEAD), don't pause —
    // err on the side of running normally rather than silently going dark.
    cachedBranch = '';
    cachedAt = t;
    return false;
  }
}

/** Reset the branch cache between tests. Not for production use. */
export function _resetBranchCacheForTest() {
  cachedBranch = null;
  cachedAt = 0;
}

// ---------------------------------------------------------------------------

const DEFAULTS = Object.freeze({
  maxRetries: 5,
  windowMs: 5 * 60 * 1000,    // 5 minutes
  baseDelayMs: 100,
  maxDelayMs: 30 * 1000,      // 30 seconds
});

export function createSupervisor(opts = {}) {
  const { maxRetries, windowMs, baseDelayMs, maxDelayMs } = { ...DEFAULTS, ...opts };
  let attempts = []; // array of timestamps (ms since epoch)

  function pruneExpired(now) {
    attempts = attempts.filter(t => now - t < windowMs);
  }

  return {
    canRestart(now = Date.now()) {
      pruneExpired(now);
      return attempts.length < maxRetries;
    },
    nextDelay(now = Date.now()) {
      pruneExpired(now);
      const exp = baseDelayMs * Math.pow(2, attempts.length);
      return Math.min(maxDelayMs, exp);
    },
    recordAttempt(now = Date.now()) {
      pruneExpired(now);
      attempts.push(now);
    },
    reset() {
      attempts = [];
    },
    get attemptCount() {
      return attempts.length;
    },
  };
}
