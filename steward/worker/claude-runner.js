// Studio Steward — Claude CLI runner.
//
// Spawns `claude -p <prompt>` in a target cwd (typically a project repo or
// hq-data root). Captures stdout/stderr, enforces a timeout, retries
// once on empty response. Returns a structured result the worker pool
// can persist into the tasks table.
//
// Extracted from friday/src/core/claude-brain.ts (Bun.spawn + Friday's
// metering) and ported to Node child_process.spawn for the Steward's
// subprocess context. No metering coupling — the Steward will add its
// own metering separately if needed.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULTS = Object.freeze({
  // On Windows, npm installs `claude` as both a bash shim (no extension —
  // can't be CreateProcess'd) and a `claude.cmd` Windows shim. With
  // shell:false (our default), spawn() needs the explicit .cmd extension.
  // Linux/macOS use the extensionless shim.
  claudePath: process.platform === 'win32' ? 'claude.cmd' : 'claude',
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

  // On Windows, claude.cmd requires shell:true to spawn (Node CVE-2024-27980).
  // shell:true makes cmd.exe responsible for quoting, which is brittle for
  // long/multiline prompts. Workaround: write the full prompt to a temp file
  // and pass a short outer prompt that instructs the agent to Read it. Same
  // pattern the friday-dispatch path uses in main.cjs.
  let promptForCli = fullPrompt;
  let tmpFile = null;
  if (process.platform === 'win32' && fullPrompt.length > 0) {
    tmpFile = path.join(
      os.tmpdir(),
      `claude-runner-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`,
    );
    try {
      fs.writeFileSync(tmpFile, fullPrompt, 'utf-8');
      const briefPath = tmpFile.replace(/\\/g, '/');
      promptForCli = `Read the agent brief at ${briefPath} and follow its instructions exactly. Your output must be the single JSON object the brief asks for — no prose, no markdown fences, no commentary.`;
    } catch (err) {
      // If we couldn't write the temp file, fall back to inline prompt.
      // (Will likely fail on multi-line content, but at least we tried.)
      tmpFile = null;
    }
  }

  const args = ['-p', promptForCli, ...(opts.extraArgs || [])];
  const spawnFn = opts._spawn || spawn;

  let result;
  try {
    result = await runOnce({ ...cfg, args, fullPrompt: promptForCli, spawnFn });
  } finally {
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

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
      // Windows: claude.cmd is a batch file. Node ≥20.12 refuses to spawn
      // .cmd/.bat without shell:true (CVE-2024-27980). BUT shell:true on
      // Windows passes args concatenated and UNQUOTED to cmd.exe (Node 24+
      // deprecation warning confirms), so a multi-word prompt gets split at
      // every space and claude sees the prompt as just its first word.
      //
      // Workaround: spawn cmd.exe directly, build the full command line
      // ourselves with proper double-quote escaping, and pass it via /c with
      // windowsVerbatimArguments so Node doesn't re-process our quoting.
      const isWin = process.platform === 'win32';
      let spawnTarget, spawnArgs, spawnOpts;
      if (isWin) {
        const needsQuote = (s) => /[\s"&|<>^()%!,;`'@]/.test(String(s));
        const dquote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
        const fullLine = [claudePath, ...args]
          .map((a) => (needsQuote(a) ? dquote(a) : a))
          .join(' ');
        spawnTarget = 'cmd.exe';
        spawnArgs = ['/d', '/s', '/c', fullLine];
        spawnOpts = {
          cwd: cwd || process.cwd(),
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsVerbatimArguments: true,
        };
      } else {
        spawnTarget = claudePath;
        spawnArgs = args;
        spawnOpts = {
          cwd: cwd || process.cwd(),
          stdio: ['ignore', 'pipe', 'pipe'],
        };
      }
      proc = spawnFn(spawnTarget, spawnArgs, spawnOpts);
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
