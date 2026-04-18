import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Registry } = require('../../electron/sessions/registry.js');

describe('Registry', () => {
  let dir;
  let filePath;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-registry-'));
    filePath = join(dir, 'tabs.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns [] when no file exists', async () => {
    const r = new Registry(filePath);
    await r.load();
    expect(r.list()).toEqual([]);
  });

  it('upsert + save -> reload returns same tabs', async () => {
    const r = new Registry(filePath);
    await r.load();
    const tab = {
      id: 'abc',
      sessionId: null,
      cwd: '/tmp/proj',
      pid: null,
      status: 'active',
      label: 'hello',
      createdAt: 1,
      lastActivityAt: 1,
      scopeId: null,
      restoreFailureCount: 0,
    };
    r.upsert(tab);
    await r.save();

    const r2 = new Registry(filePath);
    await r2.load();
    expect(r2.list()).toEqual([tab]);
    expect(r2.get('abc')).toEqual(tab);
  });

  it('remove deletes by id', async () => {
    const r = new Registry(filePath);
    await r.load();
    r.upsert({ id: 'a', label: 'A' });
    r.upsert({ id: 'b', label: 'B' });
    r.remove('a');
    expect(r.list().map(t => t.id)).toEqual(['b']);
  });

  it('cleanup: no .tmp remains after save()', async () => {
    const r = new Registry(filePath);
    await r.load();
    r.upsert({ id: 'x', label: 'X' });
    await r.save();
    const files = readdirSync(dir);
    expect(files).toContain('tabs.json');
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
  });

  it('corrupt file: rename to .bak-<timestamp> and load as empty', async () => {
    writeFileSync(filePath, '{not-json,,', 'utf8');
    const r = new Registry(filePath);
    await r.load();
    expect(r.list()).toEqual([]);
    const files = readdirSync(dir);
    const bak = files.find(f => f.startsWith('tabs.json.bak-'));
    expect(bak).toBeTruthy();
    // Backup still contains the original corrupt content.
    expect(readFileSync(join(dir, bak), 'utf8')).toBe('{not-json,,');
  });

  it('load() re-throws on non-ENOENT I/O errors (does not blank the registry)', async () => {
    // Create a directory at the registry filepath so readFile throws EISDIR.
    mkdirSync(filePath, { recursive: true });

    const r = new Registry(filePath);
    // Seed a pre-existing in-memory tab so we can confirm it is NOT blanked.
    r.upsert({ id: 'preexisting', label: 'keep-me' });

    await expect(r.load()).rejects.toThrow();
    // Tabs must remain as they were — an I/O error must never wipe state.
    expect(r.list().map(t => t.id)).toEqual(['preexisting']);
  });
});
