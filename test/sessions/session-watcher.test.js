import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SessionWatcher, unescapeCwd } = require('../../electron/sessions/session-watcher.js');

describe('unescapeCwd', () => {
  it('unescapes drive-letter Windows cwd', () => {
    expect(unescapeCwd('C--Claude-Samurai-Forge')).toBe('C:/Claude/Samurai/Forge');
  });

  it('passes through non-drive paths (best effort)', () => {
    // No drive letter pattern -> just hyphen-to-slash.
    expect(unescapeCwd('tmp-proj')).toBe('tmp/proj');
  });
});

describe('SessionWatcher', () => {
  let root;
  let watcher;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'forge-watch-'));
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
      watcher = null;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('emits sessionFile when a new .jsonl appears under a project subdir', async () => {
    watcher = new SessionWatcher(root);

    const events = [];
    watcher.on('sessionFile', (e) => events.push(e));

    await watcher.start();

    const projDir = join(root, 'C--tmp-proj');
    mkdirSync(projDir, { recursive: true });
    const jsonlPath = join(projDir, 'abc-uuid.jsonl');
    writeFileSync(jsonlPath, '', 'utf8');

    // awaitWriteFinish stability is 200ms; give chokidar a comfortable margin.
    await new Promise((r) => setTimeout(r, 800));

    const match = events.find((e) => e.sessionId === 'abc-uuid');
    expect(match).toBeTruthy();
    expect(match.cwd).toBe('C:/tmp/proj');
    expect(match.path).toBe(jsonlPath);
    expect(typeof match.mtimeMs).toBe('number');
  });

  it('start() throws when called twice on the same instance', async () => {
    watcher = new SessionWatcher(root);
    await watcher.start();
    await expect(watcher.start()).rejects.toThrow(/already started/);
  });
});
