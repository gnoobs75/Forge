/* @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { matchRules, makeJobRunner, enqueueMatches } from '../reactor.js';
import { openDb } from '../db/index.js';
import { _resetForTests } from '../studio-write.js';

function gitInit(repo) {
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'tester'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo });
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'initial'], { cwd: repo });
}

describe('rec-resolved-update-features rule', () => {
  let tmpDir, db, dataDir;

  beforeEach(() => {
    _resetForTests();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-feats-'));
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

  function writeFeatures(features) {
    const fp = path.join(dataDir, 'projects', 'arena', 'features.json');
    fs.writeFileSync(fp, JSON.stringify({ source: 'test', features }, null, 2));
    return fp;
  }

  function readFeatures() {
    return JSON.parse(fs.readFileSync(path.join(dataDir, 'projects', 'arena', 'features.json'), 'utf-8'));
  }

  function fireRecEvent(relPath) {
    const eventId = db.appendEvent({
      project: 'arena', source: 'hq', kind: 'file-changed',
      payload: { event: 'change', path: relPath },
    });
    return enqueueMatches({ db, eventId, matchedRules: matchRules(db.getEvent(eventId)) });
  }

  function findFeaturesTask() {
    // After enqueue, two tasks land — for the features rule we want the one
    // with rule_id 'rec-resolved-update-features'. Worker picks oldest first.
    const all = db.raw.prepare('SELECT * FROM tasks WHERE rule_id = ? AND completed_at IS NULL ORDER BY enqueued_at ASC').all('rec-resolved-update-features');
    return all[0];
  }

  it('flips affected features from in-progress to complete + makes a steward: commit', async () => {
    writeFeatures([
      { id: 'feat-001', name: 'Render', status: 'complete' },
      { id: 'feat-002', name: 'Combat', status: 'in-progress' },
      { id: 'feat-003', name: 'Audio',  status: 'in-progress' },
    ]);
    const relPath = writeRec('ARE-100.json', {
      id: 'ARE-100',
      agent: 'Tech Architect',
      title: 'Combat + Audio polish',
      summary: 'Shipped two systems',
      status: 'resolved',
      features_affected: ['feat-002', 'feat-003'],
    });
    fireRecEvent(relPath);

    const featuresTask = findFeaturesTask();
    expect(featuresTask).toBeDefined();
    // Claim it (advance state) then run via the jobRunner
    const taskRow = db.claimNextTask();  // claims oldest unclaimed — could be either rule
    // Find and claim the features task specifically
    let taskToRun = taskRow;
    if (taskRow.rule_id !== 'rec-resolved-update-features') {
      // The oldest was the other rule; complete it as no-op and claim the next
      db.completeTask({ taskId: taskRow.id, outcome: 'success' });
      taskToRun = db.claimNextTask();
    }
    expect(taskToRun.rule_id).toBe('rec-resolved-update-features');

    const result = await makeJobRunner({ db, dataDir })(taskToRun);
    expect(result.outcome).toBe('success');
    expect(result.output).toContain('flipped 2 feature(s)');

    const updated = readFeatures();
    expect(updated._steward).toBeDefined();
    expect(updated.features.find(f => f.id === 'feat-002').status).toBe('complete');
    expect(updated.features.find(f => f.id === 'feat-003').status).toBe('complete');
    // feat-001 was already complete and not in features_affected → unchanged
    expect(updated.features.find(f => f.id === 'feat-001').status).toBe('complete');
    expect(updated.lastUpdated).toMatch(/T/);

    const log = execFileSync('git', ['-C', tmpDir, 'log', '-1', '--pretty=%s'], { encoding: 'utf-8' });
    expect(log).toMatch(/^steward: flip features\.json — 2 features.*ARE-100/);
  });

  it('skips when rec lists no features_affected', async () => {
    writeFeatures([{ id: 'feat-001', name: 'A', status: 'in-progress' }]);
    const relPath = writeRec('ARE-101.json', {
      id: 'ARE-101', agent: 'X', title: 'no targets', summary: '', status: 'resolved',
      // no features_affected
    });
    fireRecEvent(relPath);

    // Claim until we get the features rule
    let task;
    while ((task = db.claimNextTask())) {
      if (task.rule_id === 'rec-resolved-update-features') break;
      db.completeTask({ taskId: task.id, outcome: 'success' });
    }
    const result = await makeJobRunner({ db, dataDir })(task);
    expect(result.outcome).toBe('skipped');
    expect(result.output).toMatch(/no features_affected/);
  });

  it('honors legacy "feature_ids" field as a synonym for features_affected', async () => {
    writeFeatures([{ id: 'feat-x', name: 'X', status: 'in-progress' }]);
    const relPath = writeRec('ARE-LEGACY.json', {
      id: 'ARE-LEGACY', agent: 'X', title: 'legacy field', summary: '',
      status: 'resolved',
      feature_ids: ['feat-x'],   // legacy name
    });
    fireRecEvent(relPath);

    let task;
    while ((task = db.claimNextTask())) {
      if (task.rule_id === 'rec-resolved-update-features') break;
      db.completeTask({ taskId: task.id, outcome: 'success' });
    }
    const result = await makeJobRunner({ db, dataDir })(task);
    expect(result.outcome).toBe('success');
    expect(readFeatures().features.find(f => f.id === 'feat-x').status).toBe('complete');
  });

  it('skips when all referenced features are already complete (idempotency)', async () => {
    writeFeatures([
      { id: 'feat-001', name: 'A', status: 'complete' },
      { id: 'feat-002', name: 'B', status: 'complete' },
    ]);
    const relPath = writeRec('ARE-IDEM.json', {
      id: 'ARE-IDEM', agent: 'X', title: '...', summary: '', status: 'resolved',
      features_affected: ['feat-001', 'feat-002'],
    });
    fireRecEvent(relPath);
    let task;
    while ((task = db.claimNextTask())) {
      if (task.rule_id === 'rec-resolved-update-features') break;
      db.completeTask({ taskId: task.id, outcome: 'success' });
    }
    const result = await makeJobRunner({ db, dataDir })(task);
    expect(result.outcome).toBe('skipped');
    expect(result.output).toMatch(/already complete/);
    // No commit landed
    const log = execFileSync('git', ['-C', tmpDir, 'log', '--pretty=%s'], { encoding: 'utf-8' });
    expect(log).not.toMatch(/steward: flip features/);
  });

  it('skips when no referenced ids match any known feature', async () => {
    writeFeatures([{ id: 'feat-known', name: 'K', status: 'in-progress' }]);
    const relPath = writeRec('ARE-UNKNOWN.json', {
      id: 'ARE-UNKNOWN', agent: 'X', title: '...', summary: '', status: 'resolved',
      features_affected: ['feat-ghost-1', 'feat-ghost-2'],
    });
    fireRecEvent(relPath);
    let task;
    while ((task = db.claimNextTask())) {
      if (task.rule_id === 'rec-resolved-update-features') break;
      db.completeTask({ taskId: task.id, outcome: 'success' });
    }
    const result = await makeJobRunner({ db, dataDir })(task);
    expect(result.outcome).toBe('skipped');
    expect(result.output).toMatch(/unknown ids/);
  });

  it('skips when status is not resolved', async () => {
    writeFeatures([{ id: 'feat-1', name: 'A', status: 'in-progress' }]);
    const relPath = writeRec('ARE-ACTIVE.json', {
      id: 'ARE-ACTIVE', agent: 'X', title: '...', summary: '', status: 'active',
      features_affected: ['feat-1'],
    });
    fireRecEvent(relPath);
    let task;
    while ((task = db.claimNextTask())) {
      if (task.rule_id === 'rec-resolved-update-features') break;
      db.completeTask({ taskId: task.id, outcome: 'success' });
    }
    const result = await makeJobRunner({ db, dataDir })(task);
    expect(result.outcome).toBe('skipped');
    expect(result.output).toMatch(/not resolved/);
  });
});
