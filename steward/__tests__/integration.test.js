/* @vitest-environment node */
//
// Integration test — fork the actual steward subprocess and exercise the
// IPC channel end-to-end: wait for ready announcement, send a synthetic
// studio event, verify the ack, send a control message, verify the
// status response. No Electron required.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fork } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STEWARD_ENTRY = path.resolve(__dirname, '..', 'index.js');

function waitForMessage(child, predicate, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.removeListener('message', onMsg);
      reject(new Error(`Timeout waiting for message after ${timeoutMs}ms`));
    }, timeoutMs);
    function onMsg(msg) {
      if (predicate(msg)) {
        clearTimeout(timer);
        child.removeListener('message', onMsg);
        resolve(msg);
      }
    }
    child.on('message', onMsg);
  });
}

describe('steward integration — fork + IPC handshake', () => {
  let tmpDataDir;
  let child;

  beforeEach(() => {
    tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-it-'));
  });

  afterEach(async () => {
    if (child && child.connected) {
      // disconnect() triggers our process.on('disconnect') handler which
      // closes the db and exits cleanly — important on Windows where SQLite
      // WAL files hold locks that block fs.rmSync.
      const exitPromise = new Promise(resolve => child.once('exit', resolve));
      try { child.disconnect(); } catch {}
      // Force-kill if disconnect doesn't trigger exit within 1s
      const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1000);
      await exitPromise;
      clearTimeout(timer);
    }
    // Give the OS a beat to release file handles before rmSync
    await new Promise(r => setTimeout(r, 50));
    if (tmpDataDir && fs.existsSync(tmpDataDir)) {
      try {
        fs.rmSync(tmpDataDir, { recursive: true, force: true });
      } catch {
        // Windows occasionally still holds a handle; retry once after a delay
        await new Promise(r => setTimeout(r, 200));
        try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch { /* leak temp dir, OS will clean */ }
      }
    }
  });

  it('emits steward:ready then steward:status on first boot', async () => {
    child = fork(STEWARD_ENTRY, [], {
      env: { ...process.env, STEWARD_DATA_DIR: tmpDataDir },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    const ready = await waitForMessage(child, m => m?.type === 'steward:ready');
    expect(ready.pid).toBe(child.pid);
    expect(ready.configEnabled).toBe(true);

    const status = await waitForMessage(child, m => m?.type === 'steward:status');
    expect(status.healthy).toBe(true);
    expect(status.config.enabled).toBe(true);
    expect(status.config.concurrency).toBe(5);
    expect(status.queueDepth).toBe(0);
    expect(status.eventCounters['hq:file-changed']).toBe(0);
  });

  it('acks a forwarded studio event and updates lastEventAgoMs', async () => {
    child = fork(STEWARD_ENTRY, [], {
      env: { ...process.env, STEWARD_DATA_DIR: tmpDataDir },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    await waitForMessage(child, m => m?.type === 'steward:ready');

    child.send({ type: 'hq:file-changed', payload: { event: 'add', path: 'test/file.json' } });
    const ack = await waitForMessage(child, m => m?.type === 'steward:event-ack');
    expect(ack.eventType).toBe('hq:file-changed');
    expect(ack.total).toBe(1);

    // Now query status — eventCounters should reflect the event
    child.send({ type: 'steward:control', payload: { action: 'getStatus' } });
    const status = await waitForMessage(child, m =>
      m?.type === 'steward:status' && m.eventCounters['hq:file-changed'] > 0
    );
    expect(status.eventCounters['hq:file-changed']).toBe(1);
    expect(status.lastEventAgoMs).toBeGreaterThanOrEqual(0);
    expect(status.lastEventAgoMs).toBeLessThan(2000);
  });

  it('handles pause + resume control + persists to config.json', async () => {
    child = fork(STEWARD_ENTRY, [], {
      env: { ...process.env, STEWARD_DATA_DIR: tmpDataDir },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    await waitForMessage(child, m => m?.type === 'steward:ready');

    child.send({ type: 'steward:control', payload: { action: 'pause', project: 'arena' } });
    const pauseAck = await waitForMessage(child, m =>
      m?.type === 'steward:control-ack' && m.action === 'pause'
    );
    expect(pauseAck.project).toBe('arena');

    // Verify persistence
    const configPath = path.join(tmpDataDir, '.steward', 'config.json');
    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(persisted.paused).toContain('arena');

    // Resume
    child.send({ type: 'steward:control', payload: { action: 'resume', project: 'arena' } });
    await waitForMessage(child, m => m?.type === 'steward:control-ack' && m.action === 'resume');
    const persisted2 = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(persisted2.paused).not.toContain('arena');
  });

  it('exits within 1s when parent disconnects', async () => {
    // We assert the child exits promptly on parent disconnect — the exit
    // code itself varies by platform (Windows often surfaces 1 even when
    // our handler runs cleanly because Node auto-tears-down on disconnect
    // before our setTimeout(50ms) fires). What we actually care about is
    // that the child doesn't become a zombie when the parent goes away.
    child = fork(STEWARD_ENTRY, [], {
      env: { ...process.env, STEWARD_DATA_DIR: tmpDataDir },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    await waitForMessage(child, m => m?.type === 'steward:ready');

    const t0 = Date.now();
    const exitPromise = new Promise(resolve => child.once('exit', resolve));
    child.disconnect();
    await exitPromise;
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(1000);
    expect(child.killed || child.exitCode !== null).toBe(true);
  });
});
