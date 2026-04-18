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

  it('concurrent save() calls serialize — final file matches last caller\'s state', async () => {
    const r = new Registry(filePath);
    await r.load();

    // Three overlapping save() calls: upsert, save (no await), upsert, save (no await), etc.
    // If saves raced concurrently, the writeFile → rename pairs would interleave
    // and the final file could be missing tabs (or corrupt).
    r.upsert({ id: 'A', label: 'A' });
    const p1 = r.save();
    r.upsert({ id: 'B', label: 'B' });
    const p2 = r.save();
    r.upsert({ id: 'C', label: 'C' });
    const p3 = r.save();

    await Promise.all([p1, p2, p3]);

    // Final on-disk state must contain all three tabs. Since each save serializes
    // the then-current full tabs array, once the last save in the chain runs,
    // the file reflects {A, B, C}. This is the invariant serialization guarantees.
    const r2 = new Registry(filePath);
    await r2.load();
    const ids = r2.list().map(t => t.id).sort();
    expect(ids).toEqual(['A', 'B', 'C']);

    // And no .tmp stragglers — each rename completed cleanly.
    const files = readdirSync(dir);
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
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
