/* @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { runClaude, isClaudeAvailable } from '../worker/claude-runner.js';

// Build a fake spawn() that returns an EventEmitter-based fake child process.
// Lets us simulate stdout/stderr/exit deterministically.
function mockSpawn({ stdoutChunks = [], stderrChunks = [], exitCode = 0, exitDelayMs = 10, hang = false }) {
  return function fakeSpawn() {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    let exited = false;
    // When the runner times out, it calls proc.kill('SIGTERM'); our fake
    // honors that by emitting an exit so the runner's promise resolves.
    proc.kill = (sig) => {
      if (exited) return;
      exited = true;
      setImmediate(() => proc.emit('exit', null, sig || 'SIGTERM'));
    };

    setTimeout(() => {
      for (const c of stdoutChunks) proc.stdout.emit('data', Buffer.from(c));
      for (const c of stderrChunks) proc.stderr.emit('data', Buffer.from(c));
      if (!hang) {
        setTimeout(() => {
          if (!exited) {
            exited = true;
            proc.emit('exit', exitCode, null);
          }
        }, exitDelayMs);
      }
    }, 0);

    return proc;
  };
}

describe('runClaude — basic run', () => {
  it('returns ok:true with stdout on exit code 0', async () => {
    const r = await runClaude({
      prompt: 'hi',
      _spawn: mockSpawn({ stdoutChunks: ['hello world\n'], exitCode: 0 }),
    });
    expect(r.ok).toBe(true);
    expect(r.stdout).toBe('hello world\n');
    expect(r.code).toBe(0);
    expect(r.timedOut).toBe(false);
    expect(r.truncated).toBe(false);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('captures stderr alongside stdout', async () => {
    const r = await runClaude({
      prompt: 'hi',
      _spawn: mockSpawn({ stdoutChunks: ['out'], stderrChunks: ['err'], exitCode: 0 }),
    });
    expect(r.stdout).toBe('out');
    expect(r.stderr).toBe('err');
  });

  it('returns ok:false on non-zero exit code', async () => {
    const r = await runClaude({
      prompt: 'fail',
      _spawn: mockSpawn({ stdoutChunks: [''], stderrChunks: ['boom'], exitCode: 1 }),
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe('boom');
  });
});

describe('runClaude — system context prepending', () => {
  it('prepends systemContext with blank line', async () => {
    let receivedArgs;
    const fakeSpawn = (cmd, args) => {
      receivedArgs = args;
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = () => {};
      setTimeout(() => proc.emit('exit', 0, null), 5);
      return proc;
    };
    await runClaude({ prompt: 'do it', systemContext: 'You are X.', _spawn: fakeSpawn });
    expect(receivedArgs[0]).toBe('-p');
    expect(receivedArgs[1]).toBe('You are X.\n\ndo it');
  });

  it('passes prompt as-is when no systemContext', async () => {
    let receivedArgs;
    const fakeSpawn = (cmd, args) => {
      receivedArgs = args;
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = () => {};
      setTimeout(() => proc.emit('exit', 0, null), 5);
      return proc;
    };
    await runClaude({ prompt: 'plain', _spawn: fakeSpawn });
    expect(receivedArgs[1]).toBe('plain');
  });
});

describe('runClaude — timeout', () => {
  it('times out and reports timedOut:true', async () => {
    const r = await runClaude({
      prompt: 'slow',
      timeoutMs: 50,
      retryOnEmpty: false,
      _spawn: mockSpawn({ hang: true }),
    });
    expect(r.timedOut).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.durationMs).toBeGreaterThanOrEqual(40);
  }, 5000);
});

describe('runClaude — output truncation', () => {
  it('truncates stdout at maxOutputChars and sets truncated:true', async () => {
    const big = 'a'.repeat(1000);
    const r = await runClaude({
      prompt: 'big',
      maxOutputChars: 100,
      retryOnEmpty: false,
      _spawn: mockSpawn({ stdoutChunks: [big], exitCode: 0 }),
    });
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBe(100);
  });
});

describe('runClaude — empty-response retry', () => {
  it('retries once on empty stdout when retryOnEmpty:true', async () => {
    let calls = 0;
    const fakeSpawn = () => {
      calls++;
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = () => {};
      setTimeout(() => {
        if (calls === 1) {
          // First call: empty stdout
          proc.emit('exit', 0, null);
        } else {
          // Retry: actual content
          proc.stdout.emit('data', Buffer.from('content on retry'));
          proc.emit('exit', 0, null);
        }
      }, 5);
      return proc;
    };

    const r = await runClaude({ prompt: 'x', retryOnEmpty: true, _spawn: fakeSpawn });
    expect(calls).toBe(2);
    expect(r.retried).toBe(true);
    expect(r.stdout).toBe('content on retry');
  });

  it('does not retry when retryOnEmpty:false', async () => {
    let calls = 0;
    const fakeSpawn = () => {
      calls++;
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = () => {};
      setTimeout(() => proc.emit('exit', 0, null), 5);
      return proc;
    };
    const r = await runClaude({ prompt: 'x', retryOnEmpty: false, _spawn: fakeSpawn });
    expect(calls).toBe(1);
    expect(r.retried).toBe(false);
    expect(r.stdout).toBe('');
  });

  it('does not infinite-loop: retry returning empty also resolves', async () => {
    let calls = 0;
    const fakeSpawn = () => {
      calls++;
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = () => {};
      setTimeout(() => proc.emit('exit', 0, null), 5);
      return proc;
    };
    const r = await runClaude({ prompt: 'x', retryOnEmpty: true, _spawn: fakeSpawn });
    expect(calls).toBe(2); // original + one retry, no more
    expect(r.retried).toBe(true);
  });
});

describe('runClaude — spawn failure', () => {
  it('captures synchronous spawn throw', async () => {
    const fakeSpawn = () => { throw new Error('ENOENT'); };
    const r = await runClaude({ prompt: 'x', retryOnEmpty: false, _spawn: fakeSpawn });
    expect(r.ok).toBe(false);
    expect(r.stderr).toContain('ENOENT');
  });

  it('captures async error event', async () => {
    const fakeSpawn = () => {
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = () => {};
      setTimeout(() => proc.emit('error', new Error('spawn EPERM')), 5);
      return proc;
    };
    const r = await runClaude({ prompt: 'x', retryOnEmpty: false, _spawn: fakeSpawn });
    expect(r.ok).toBe(false);
    expect(r.stderr).toContain('EPERM');
  });
});

describe('isClaudeAvailable', () => {
  it('returns false when claude binary is not on PATH', async () => {
    const ok = await isClaudeAvailable('definitely-not-a-real-binary-12345');
    expect(ok).toBe(false);
  });
});
