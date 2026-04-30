// Studio Steward — Claude CLI runner.
//
// Spawns `claude -p <prompt>` in a target cwd (typically a game repo or
// hq-data root). Captures stdout/stderr, enforces a timeout, retries
// once on empty response. Returns a structured result the worker pool
// can persist into the tasks table.
//
// Extracted from friday/src/core/claude-brain.ts (Bun.spawn + Friday's
// metering) and ported to Node child_process.spawn for the Steward's
// subprocess context. No metering coupling — the Steward will add its
// own metering separately if needed.

import { spawn } from 'node:child_process';

export const DEFAULTS = Object.freeze({
  claudePath: 'claude',
  timeoutMs: 120_000,         // 2 minutes default per task
  maxOutputChars: 32_000,     // truncate captured stdout
  retryOnEmpty: true,
});

/**
 * Runs `claude -p <prompt>` and returns the result.
 *
 * @param {object} opts
 * @param {string} opts.prompt           - The full prompt to pass to claude -p
 * @param {string} [opts.systemContext]  - Prepended to prompt with a blank line
 * @param {string} [opts.cwd]            - Working directory for claude (defaults to process.cwd())
 * @param {string[]} [opts.extraArgs]    - Additional CLI args (e.g. ['--output-format','json'])
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.maxOutputChars]
 * @param {string} [opts.claudePath]
 * @param {boolean} [opts.retryOnEmpty]
 * @param {function} [opts._spawn]       - Injection point for tests (defaults to child_process.spawn)
 * @returns {Promise<{ok: boolean, stdout: string, stderr: string, code: number|null, signal: string|null, durationMs: number, truncated: boolean, timedOut: boolean, retried: boolean}>}
 */
export async function runClaude(opts) {
  const cfg = { ...DEFAULTS, ...opts };
  const fullPrompt = buildPrompt(opts.prompt, opts.systemContext);
  const args = ['-p', fullPrompt, ...(opts.extraArgs || [])];
  const spawnFn = opts._spawn || spawn;

  const result = await runOnce({ ...cfg, args, fullPrompt, spawnFn });

  // Empty-response retry once
  if (cfg.retryOnEmpty && result.ok && !result.timedOut && result.stdout.trim() === '' && !opts._isRetry) {
    const retried = await runClaude({ ...opts, _isRetry: true, retryOnEmpty: false });
    return { ...retried, retried: true };
  }

  return result;
}

function buildPrompt(prompt, systemContext) {
  if (!systemContext) return prompt;
  return `${systemContext}\n\n${prompt}`;
}

function runOnce({ args, claudePath, cwd, timeoutMs, maxOutputChars, spawnFn }) {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let truncated = false;

    let proc;
    try {
      proc = spawnFn(claudePath, args, {
        cwd: cwd || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        // shell:false (default) — args are passed as-is, no shell escaping needed
      });
    } catch (err) {
      resolve({
        ok: false, stdout: '', stderr: String(err.message || err),
        code: null, signal: null,
        durationMs: Date.now() - start,
        truncated: false, timedOut: false, retried: false,
      });
      return;
    }

    proc.stdout.on('data', (chunk) => {
      const next = stdout + chunk.toString();
      if (next.length > maxOutputChars) {
        stdout = next.slice(0, maxOutputChars);
        truncated = true;
        // We could destroy stdout here, but Claude may still produce useful
        // exit info. Just stop accumulating instead.
      } else {
        stdout = next;
      }
    });

    proc.stderr.on('data', (chunk) => {
      // Cap stderr at maxOutputChars too — stderr can balloon on errors
      const next = stderr + chunk.toString();
      stderr = next.length > maxOutputChars ? next.slice(0, maxOutputChars) : next;
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGTERM'); } catch {}
      // Give it 1s to die gracefully then force-kill
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 1000);
    }, timeoutMs);

    proc.on('exit', (code, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      resolve({
        ok: code === 0 && !timedOut,
        stdout,
        stderr,
        code,
        signal,
        durationMs,
        truncated,
        timedOut,
        retried: false,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        stdout,
        stderr: stderr + String(err.message || err),
        code: null, signal: null,
        durationMs: Date.now() - start,
        truncated, timedOut: false, retried: false,
      });
    });
  });
}

/**
 * Quick health check — runs `claude --version` to verify the CLI is on PATH.
 */
export async function isClaudeAvailable(claudePath = DEFAULTS.claudePath) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(claudePath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { resolve(false); return; }
    proc.on('exit', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}
