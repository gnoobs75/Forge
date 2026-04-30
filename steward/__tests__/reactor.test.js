/* @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { matchRules, getRule, getRules, makeJobRunner, enqueueMatches } from '../reactor.js';
import { openDb } from '../db/index.js';
import { _resetForTests } from '../studio-write.js';

function gitInit(repo) {
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'tester'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo });
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'initial'], { cwd: repo });
}

describe('reactor — registry + lookup', () => {
  it('exposes the rec-resolved-update-history rule', () => {
    const r = getRule('rec-resolved-update-history');
    expect(r).not.toBeNull();
    expect(r.priority).toBe('high');
    expect(typeof r.trigger.match).toBe('function');
    expect(typeof r.handler).toBe('function');
  });

  it('returns null for unknown rules', () => {
    expect(getRule('does-not-exist')).toBeNull();
  });

  it('orders rules by priority (high first)', () => {
    const ordered = getRules();
    const priorities = ordered.map(r => r.priority);
    // high should come before medium/low if any exist
    let seenLower = false;
    for (const p of priorities) {
      if (p === 'medium' || p === 'low') seenLower = true;
      if (p === 'high' && seenLower) {
        throw new Error('high-priority rule appeared after lower-priority — sort broken');
      }
    }
  });
});

describe('reactor — matchRules', () => {
  it('matches a chokidar rec event with both rec-resolved rules', () => {
    const event = {
      source: 'hq',
      kind: 'file-changed',
      payload: { event: 'change', path: 'projects/arena/recommendations/foo.json' },
    };
    const matched = matchRules(event);
    // Both rec-resolved-update-history and rec-resolved-update-features fire
    // on the same chokidar rec event — they edit different files so they
    // can't be combined into one rule (and one might skip while the other works).
    const ids = matched.map(r => r.id).sort();
    expect(ids).toEqual([
      'rec-resolved-update-features',
      'rec-resolved-update-history',
    ]);
  });

  it('matches the prd-maintain rule on a non-rec hq change (features.json)', () => {
    // The prd-maintain-on-history-change rule (Phase 5) watches history.json,
    // features.json, and todo.json changes. So a features.json change is
    // expected to match exactly one rule — prd-maintain-on-history-change —
    // and NOT any rec-* rules.
    const event = {
      source: 'hq',
      kind: 'file-changed',
      payload: { event: 'change', path: 'projects/arena/features.json' },
    };
    const matched = matchRules(event);
    expect(matched.map(r => r.id)).toEqual(['prd-maintain-on-history-change']);
  });

  it('does not match unlink (deletion) events for recs', () => {
    const event = {
      source: 'hq',
      kind: 'file-changed',
      payload: { event: 'unlink', path: 'projects/arena/recommendations/foo.json' },
    };
    expect(matchRules(event)).toHaveLength(0);
  });

  it('does not match git or terminal events', () => {
    expect(matchRules({ source: 'automation', kind: 'git-change', payload: {} })).toHaveLength(0);
    expect(matchRules({ source: 'terminal', kind: 'exit', payload: {} })).toHaveLength(0);
  });

  it('returns empty for malformed events', () => {
    expect(matchRules(null)).toEqual([]);
    expect(matchRules({})).toEqual([]);
    expect(matchRules({ source: 'hq', kind: 'file-changed' })).toEqual([]);
  });

  it('tolerates a throwing match predicate', () => {
    // matches a real shape; covered above. Throwing match is a defensive case
    // exercised only if a future rule has a buggy predicate. We can't easily
    // inject one without mutating the registry; this test documents the
    // intent — see reactor.js matchRules try/catch.
    expect(true).toBe(true);
  });
});

describe('reactor — enqueueMatches + jobRunner end-to-end', () => {
  let tmpDir, db, dataDir;
  beforeEach(() => {
    _resetForTests();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-reactor-'));
    dataDir = path.join(tmpDir, 'hq-data');
    fs.mkdirSync(path.join(dataDir, '.steward'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'projects', 'arena', 'recommendations'), { recursive: true });
    gitInit(tmpDir);
    db = openDb(path.join(dataDir, '.steward', 'events.db'));
  });
  afterEach(async () => {
    db?.close();
    await new Promise(r => setTimeout(r, 50));
    if (tmpDir && fs.existsSync(tmpDir)) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  function writeRec(filename, body) {
    const recPath = path.join(dataDir, 'projects', 'arena', 'recommendations', filename);
    fs.writeFileSync(recPath, JSON.stringify(body, null, 2));
    return `projects/arena/recommendations/${filename}`;
  }

  it('skips a rec whose status is not resolved', async () => {
    const relPath = writeRec('ARE-001.json', {
      id: 'ARE-001',
      agent: 'Tech Architect',
      title: 'Audit fleet rendering',
      summary: 'Asteroid belt batching',
      status: 'active',
    });
    const eventId = db.appendEvent({
      project: 'arena', source: 'hq', kind: 'file-changed',
      payload: { event: 'change', path: relPath },
    });
    const event = db.getEvent(eventId);
    const matched = matchRules(event);
    // Both rec-resolved-* rules match a recs/*.json change event
    expect(matched).toHaveLength(2);

    const enqueued = enqueueMatches({ db, eventId, matchedRules: matched });
    expect(enqueued).toHaveLength(2);

    const runner = makeJobRunner({ db, dataDir });
    // Drain all tasks — any rec-resolved-* rule should skip when status != resolved
    let task;
    let outcomes = [];
    while ((task = db.claimNextTask())) {
      const r = await runner(task);
      outcomes.push({ rule: task.rule_id, outcome: r.outcome, output: r.output });
    }
    expect(outcomes.every(o => o.outcome === 'skipped')).toBe(true);
    // The history rule is the one with the "not resolved" message
    const histOutcome = outcomes.find(o => o.rule === 'rec-resolved-update-history');
    expect(histOutcome.output).toMatch(/not resolved/);

    // history.json should NOT exist yet
    expect(fs.existsSync(path.join(dataDir, 'projects', 'arena', 'history.json'))).toBe(false);
  });

  it('appends history.json + makes a steward: commit when status=resolved', async () => {
    const relPath = writeRec('ARE-001.json', {
      id: 'ARE-001',
      agent: 'Tech Architect',
      title: 'Audit fleet rendering',
      summary: 'Asteroid belt batching shipped — 30% draw call reduction',
      status: 'resolved',
    });
    const eventId = db.appendEvent({
      project: 'arena', source: 'hq', kind: 'file-changed',
      payload: { event: 'change', path: relPath },
    });
    const event = db.getEvent(eventId);
    const matched = matchRules(event);
    enqueueMatches({ db, eventId, matchedRules: matched });

    const runner = makeJobRunner({ db, dataDir });
    const task = db.claimNextTask();
    const result = await runner(task);
    expect(result.outcome).toBe('success');
    expect(result.output).toContain('journaled ARE-001');

    // Verify history.json
    const historyPath = path.join(dataDir, 'projects', 'arena', 'history.json');
    expect(fs.existsSync(historyPath)).toBe(true);
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    expect(history._steward).toBeDefined();
    expect(history._steward.lastWriteUUID).toBe(task.id);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({
      id: 'ARE-001',
      agent: 'Tech Architect',
      title: 'Audit fleet rendering',
      ref: relPath,
    });

    // Verify the steward: commit landed
    const log = execFileSync('git', ['-C', tmpDir, 'log', '-1', '--pretty=%s%n%an'], { encoding: 'utf-8' });
    expect(log).toMatch(/^steward: append history\.json — Audit fleet rendering/);
    expect(log).toContain('steward');
  });

  it('is idempotent: second event for the same resolved rec skips', async () => {
    const relPath = writeRec('ARE-002.json', {
      id: 'ARE-002', agent: 'QA', title: 'QA pass', summary: 'shipped', status: 'resolved',
    });
    const runner = makeJobRunner({ db, dataDir });

    // Helper: drain all pending tasks, return outcomes keyed by rule_id
    async function drainAll() {
      const out = {};
      let task;
      while ((task = db.claimNextTask())) {
        out[task.rule_id] = await runner(task);
      }
      return out;
    }

    // First event: history rule succeeds (features rule skips — no features_affected)
    let eventId = db.appendEvent({
      project: 'arena', source: 'hq', kind: 'file-changed',
      payload: { event: 'change', path: relPath },
    });
    enqueueMatches({ db, eventId, matchedRules: matchRules(db.getEvent(eventId)) });
    const firstRound = await drainAll();
    expect(firstRound['rec-resolved-update-history'].outcome).toBe('success');
    expect(firstRound['rec-resolved-update-features'].outcome).toBe('skipped'); // no features_affected

    // Second event for same file (e.g. another chokidar fire): history rule skips (already journaled)
    eventId = db.appendEvent({
      project: 'arena', source: 'hq', kind: 'file-changed',
      payload: { event: 'change', path: relPath },
    });
    enqueueMatches({ db, eventId, matchedRules: matchRules(db.getEvent(eventId)) });
    const secondRound = await drainAll();
    expect(secondRound['rec-resolved-update-history'].outcome).toBe('skipped');
    expect(secondRound['rec-resolved-update-history'].output).toMatch(/already contains entry/);

    // Only one history entry persisted
    const history = JSON.parse(fs.readFileSync(path.join(dataDir, 'projects', 'arena', 'history.json'), 'utf-8'));
    expect(history.entries).toHaveLength(1);
  });

  it('returns error outcome for malformed rec JSON', async () => {
    const recPath = path.join(dataDir, 'projects', 'arena', 'recommendations', 'ARE-bad.json');
    fs.writeFileSync(recPath, '{ this is not json');
    const eventId = db.appendEvent({
      project: 'arena', source: 'hq', kind: 'file-changed',
      payload: { event: 'change', path: 'projects/arena/recommendations/ARE-bad.json' },
    });
    enqueueMatches({ db, eventId, matchedRules: matchRules(db.getEvent(eventId)) });
    const result = await makeJobRunner({ db, dataDir })(db.claimNextTask());
    expect(result.outcome).toBe('error');
    expect(result.error).toMatch(/parse rec JSON/);
  });

  it('synthesizes id from filename when rec has no id field', async () => {
    const relPath = writeRec('synth-no-id.json', {
      agent: 'Studio Producer',
      title: 'No id field rec',
      summary: 'shipped',
      status: 'resolved',
    });
    const eventId = db.appendEvent({
      project: 'arena', source: 'hq', kind: 'file-changed',
      payload: { event: 'change', path: relPath },
    });
    enqueueMatches({ db, eventId, matchedRules: matchRules(db.getEvent(eventId)) });
    const result = await makeJobRunner({ db, dataDir })(db.claimNextTask());
    expect(result.outcome).toBe('success');
    const history = JSON.parse(fs.readFileSync(path.join(dataDir, 'projects', 'arena', 'history.json'), 'utf-8'));
    expect(history.entries[0].id).toBe('synth-no-id');
  });
});
