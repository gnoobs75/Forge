/* @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  studioWrite,
  commitIntent,
  injectOriginTag,
  readOriginTag,
  isStewardWrite,
  getPendingWrites,
  getOpenIntents,
  _resetForTests,
} from '../studio-write.js';
import { ulid } from '../db/ulid.js';

function gitInit(repo) {
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'tester'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo });
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'initial'], { cwd: repo });
}

function lastCommitMessage(repo) {
  return execFileSync('git', ['-C', repo, 'log', '-1', '--pretty=%s'], { encoding: 'utf-8' }).trim();
}

function lastCommitAuthor(repo) {
  return execFileSync('git', ['-C', repo, 'log', '-1', '--pretty=%an <%ae>'], { encoding: 'utf-8' }).trim();
}

describe('studio-write — origin tag injection (loop-breaker #1)', () => {
  beforeEach(() => _resetForTests());

  it('prepends md tag with intent UUID', () => {
    const tagged = injectOriginTag('# Hello\n\nbody', 'A1B2C3D4E5F6G7H8J9K0M1N2P3', 'md');
    expect(tagged).toMatch(/^<!-- steward-write: A1B2C3D4E5F6G7H8J9K0M1N2P3 -->\n# Hello/);
  });

  it('replaces existing md tag rather than stacking', () => {
    const original = '<!-- steward-write: 11111111111111111111111111 -->\n# Hello';
    const tagged = injectOriginTag(original, '22222222222222222222222222', 'md');
    expect(tagged).toMatch(/^<!-- steward-write: 22222222222222222222222222 -->\n# Hello$/);
    expect((tagged.match(/steward-write/g) || []).length).toBe(1);
  });

  it('adds _steward field to JSON at top of object', () => {
    const tagged = injectOriginTag({ name: 'arena', count: 5 }, 'AAAA1111BBBB2222CCCC3333DD', 'json');
    const parsed = JSON.parse(tagged);
    expect(Object.keys(parsed)[0]).toBe('_steward');
    expect(parsed._steward.lastWriteUUID).toBe('AAAA1111BBBB2222CCCC3333DD');
    expect(parsed._steward.lastWriteTs).toMatch(/T/);
    expect(parsed.name).toBe('arena');
    expect(parsed.count).toBe(5);
  });

  it('replaces existing JSON _steward rather than nesting', () => {
    const orig = { _steward: { lastWriteUUID: 'OLD', lastWriteTs: '2020-01-01' }, count: 5 };
    const tagged = injectOriginTag(orig, 'NEW1111122222333334444455', 'json');
    const parsed = JSON.parse(tagged);
    expect(parsed._steward.lastWriteUUID).toBe('NEW1111122222333334444455');
    expect(parsed.count).toBe(5);
  });

  it('readOriginTag returns the embedded UUID for both formats', () => {
    const md = injectOriginTag('body', 'AAAAAAAAAAAAAAAAAAAAAAAAAA', 'md');
    expect(readOriginTag(md, 'md')).toBe('AAAAAAAAAAAAAAAAAAAAAAAAAA');
    const json = injectOriginTag({ x: 1 }, 'BBBBBBBBBBBBBBBBBBBBBBBBBB', 'json');
    expect(readOriginTag(json, 'json')).toBe('BBBBBBBBBBBBBBBBBBBBBBBBBB');
  });

  it('readOriginTag returns null for untagged content', () => {
    expect(readOriginTag('# Just markdown', 'md')).toBeNull();
    expect(readOriginTag('{"name":"untagged"}', 'json')).toBeNull();
  });
});

describe('studio-write — debounce + write (loop-breaker #2)', () => {
  let tmpRepo;
  beforeEach(() => {
    _resetForTests();
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-w-'));
    gitInit(tmpRepo);
  });
  afterEach(() => {
    if (tmpRepo && fs.existsSync(tmpRepo)) fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it('coalesces multiple rapid writes to the same path into the last value', async () => {
    const target = path.join(tmpRepo, 'note.md');
    const intent = ulid();
    // Three writes within debounce window — only the third should land
    const p1 = studioWrite({ path: target, content: 'first', intentUUID: intent, format: 'md', repoPath: tmpRepo, debounceMs: 50 });
    const p2 = studioWrite({ path: target, content: 'second', intentUUID: intent, format: 'md', repoPath: tmpRepo, debounceMs: 50 });
    const p3 = studioWrite({ path: target, content: 'third', intentUUID: intent, format: 'md', repoPath: tmpRepo, debounceMs: 50 });
    const results = await Promise.all([p1, p2, p3]);
    // All three promises resolve (they share a single flush)
    expect(results).toHaveLength(3);
    expect(results.every(r => r.written)).toBe(true);
    // File contains the final value with the tag
    const content = fs.readFileSync(target, 'utf-8');
    expect(content).toMatch(/^<!-- steward-write: /);
    expect(content).toContain('third');
    expect(content).not.toContain('first');
    expect(content).not.toContain('second');
  });

  it('writes to different paths happen independently', async () => {
    const a = path.join(tmpRepo, 'a.md');
    const b = path.join(tmpRepo, 'b.md');
    const intent = ulid();
    await Promise.all([
      studioWrite({ path: a, content: 'A', intentUUID: intent, format: 'md', repoPath: tmpRepo, debounceMs: 30 }),
      studioWrite({ path: b, content: 'B', intentUUID: intent, format: 'md', repoPath: tmpRepo, debounceMs: 30 }),
    ]);
    expect(fs.readFileSync(a, 'utf-8')).toContain('A');
    expect(fs.readFileSync(b, 'utf-8')).toContain('B');
  });

  it('creates parent directories', async () => {
    const target = path.join(tmpRepo, 'deep', 'nested', 'file.json');
    await studioWrite({ path: target, content: { x: 1 }, intentUUID: ulid(), format: 'json', repoPath: tmpRepo, debounceMs: 30 });
    expect(fs.existsSync(target)).toBe(true);
  });
});

describe('studio-write — commitIntent (loop-breaker #3)', () => {
  let tmpRepo;
  beforeEach(() => {
    _resetForTests();
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-c-'));
    gitInit(tmpRepo);
  });
  afterEach(() => {
    if (tmpRepo && fs.existsSync(tmpRepo)) fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it('makes a single git commit grouping all paths from one intent', async () => {
    const intent = ulid();
    await studioWrite({ path: path.join(tmpRepo, 'a.md'), content: 'A', intentUUID: intent, format: 'md', repoPath: tmpRepo, debounceMs: 20 });
    await studioWrite({ path: path.join(tmpRepo, 'b.md'), content: 'B', intentUUID: intent, format: 'md', repoPath: tmpRepo, debounceMs: 20 });
    await studioWrite({ path: path.join(tmpRepo, 'c.json'), content: { v: 1 }, intentUUID: intent, format: 'json', repoPath: tmpRepo, debounceMs: 20 });

    const result = await commitIntent(intent, 'append history.json + flip features.json');
    expect(result.committed).toBe(true);
    expect(result.results).toHaveLength(1); // one repo
    expect(result.results[0].sha).toMatch(/^[0-9a-f]{40}$/);

    const msg = lastCommitMessage(tmpRepo);
    expect(msg).toMatch(/^steward: append history\.json/);
    expect(msg).toContain('[intent:');
    expect(lastCommitAuthor(tmpRepo)).toContain('steward');

    // All three files in the one commit
    const filesInCommit = execFileSync('git', ['-C', tmpRepo, 'show', '--name-only', '--pretty=', 'HEAD'], { encoding: 'utf-8' })
      .split('\n').filter(Boolean);
    expect(filesInCommit.sort()).toEqual(['a.md', 'b.md', 'c.json'].sort());
  });

  it('clears the intent after committing', async () => {
    const intent = ulid();
    await studioWrite({ path: path.join(tmpRepo, 'x.md'), content: 'x', intentUUID: intent, format: 'md', repoPath: tmpRepo, debounceMs: 20 });
    expect(getOpenIntents()[intent]).toBeDefined();
    await commitIntent(intent, 'test');
    expect(getOpenIntents()[intent]).toBeUndefined();
  });

  it('returns committed:false when no writes are pending for the intent', async () => {
    const result = await commitIntent('NEVER1111111111111111111111', 'noop');
    expect(result.committed).toBe(false);
    expect(result.reason).toBe('no pending writes for intent');
  });

  it('different intents produce separate commits', async () => {
    const i1 = ulid();
    const i2 = ulid();
    await studioWrite({ path: path.join(tmpRepo, 'one.md'), content: '1', intentUUID: i1, format: 'md', repoPath: tmpRepo, debounceMs: 10 });
    await studioWrite({ path: path.join(tmpRepo, 'two.md'), content: '2', intentUUID: i2, format: 'md', repoPath: tmpRepo, debounceMs: 10 });
    await commitIntent(i1, 'first');
    await commitIntent(i2, 'second');
    const log = execFileSync('git', ['-C', tmpRepo, 'log', '--pretty=%s'], { encoding: 'utf-8' });
    expect(log).toMatch(/steward: second .*\nsteward: first/);
  });

  it('serializes concurrent commits to the same repo (no HEAD lock race)', async () => {
    // Reproduces the concurrency bug observed in production: two rules fire
    // off the same chokidar event, both call commitIntent in parallel, and
    // the second loses the race with `cannot lock ref 'HEAD'`. With the
    // per-repo mutex, both commits land cleanly.
    const i1 = ulid();
    const i2 = ulid();
    await studioWrite({ path: path.join(tmpRepo, 'history.json'), content: { entries: [] }, intentUUID: i1, format: 'json', repoPath: tmpRepo, debounceMs: 10 });
    await studioWrite({ path: path.join(tmpRepo, 'features.json'), content: { features: [] }, intentUUID: i2, format: 'json', repoPath: tmpRepo, debounceMs: 10 });
    // Fire BOTH commits in parallel — without the mutex, one would lose HEAD lock.
    const [r1, r2] = await Promise.all([
      commitIntent(i1, 'append history.json'),
      commitIntent(i2, 'flip features.json'),
    ]);
    expect(r1.committed).toBe(true);
    expect(r2.committed).toBe(true);
    expect(r1.results[0].error).toBeUndefined();
    expect(r2.results[0].error).toBeUndefined();
    expect(r1.results[0].sha).toMatch(/^[0-9a-f]{40}$/);
    expect(r2.results[0].sha).toMatch(/^[0-9a-f]{40}$/);
    expect(r1.results[0].sha).not.toBe(r2.results[0].sha);
    // Both commits exist in the log
    const log = execFileSync('git', ['-C', tmpRepo, 'log', '--pretty=%s'], { encoding: 'utf-8' });
    expect(log).toMatch(/steward: append history\.json/);
    expect(log).toMatch(/steward: flip features\.json/);
  });
});

describe('studio-write — isStewardWrite content sniff', () => {
  let tmpDir;
  beforeEach(() => {
    _resetForTests();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-s-'));
  });
  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects tagged .md', () => {
    const f = path.join(tmpDir, 'x.md');
    fs.writeFileSync(f, '<!-- steward-write: AAAAAAAAAAAAAAAAAAAAAAAAAA -->\nbody');
    expect(isStewardWrite(f)).toBe(true);
  });

  it('detects tagged .json', () => {
    const f = path.join(tmpDir, 'x.json');
    fs.writeFileSync(f, JSON.stringify({ _steward: { lastWriteUUID: 'X', lastWriteTs: 'now' }, k: 1 }));
    expect(isStewardWrite(f)).toBe(true);
  });

  it('returns false for human-edited .md', () => {
    const f = path.join(tmpDir, 'human.md');
    fs.writeFileSync(f, '# A human wrote this\n');
    expect(isStewardWrite(f)).toBe(false);
  });

  it('returns false for human-edited .json', () => {
    const f = path.join(tmpDir, 'human.json');
    fs.writeFileSync(f, '{"name":"human"}');
    expect(isStewardWrite(f)).toBe(false);
  });

  it('returns false for missing file', () => {
    expect(isStewardWrite(path.join(tmpDir, 'nope.md'))).toBe(false);
  });

  it('returns false for unsupported extensions (defensive — chokidar should still see them)', () => {
    const f = path.join(tmpDir, 'x.txt');
    fs.writeFileSync(f, '<!-- steward-write: AAAAAAAAAAAAAAAAAAAAAAAAAA -->\nbody');
    expect(isStewardWrite(f)).toBe(false);
  });
});
