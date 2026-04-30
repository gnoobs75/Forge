/* @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { matchRules, makeJobRunner, enqueueMatches, getRule } from '../reactor.js';
import { openDb } from '../db/index.js';
import { _resetForTests } from '../studio-write.js';
import { parse } from '../prd/parser.js';

function gitInit(repo) {
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'tester'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo });
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'initial'], { cwd: repo });
}

describe('prd-maintain-on-history-change rule', () => {
  let tmpDir, db, dataDir;

  beforeEach(() => {
    _resetForTests();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-prd-'));
    dataDir = path.join(tmpDir, 'hq-data');
    fs.mkdirSync(path.join(dataDir, '.steward'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'projects', 'arena'), { recursive: true });
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

  function writeProjectFile(name, content) {
    const fp = path.join(dataDir, 'projects', 'arena', name);
    fs.writeFileSync(fp, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    return `projects/arena/${name}`;
  }

  function fireFileChange(relPath) {
    const eventId = db.appendEvent({
      project: 'arena', source: 'hq', kind: 'file-changed',
      payload: { event: 'change', path: relPath },
    });
    return enqueueMatches({ db, eventId, matchedRules: matchRules(db.getEvent(eventId)) });
  }

  async function runPrdRuleForLastEvent() {
    const runner = makeJobRunner({ db, dataDir });
    let task;
    let result;
    while ((task = db.claimNextTask())) {
      const r = await runner(task);
      if (task.rule_id === 'prd-maintain-on-history-change') result = r;
    }
    return result;
  }

  it('matchRules picks up history/features/todo changes only', () => {
    const prdRule = getRule('prd-maintain-on-history-change');
    expect(prdRule).not.toBeNull();
    expect(prdRule.trigger.match({ payload: { event: 'change', path: 'projects/arena/history.json' } })).toBe(true);
    expect(prdRule.trigger.match({ payload: { event: 'change', path: 'projects/arena/features.json' } })).toBe(true);
    expect(prdRule.trigger.match({ payload: { event: 'change', path: 'projects/arena/todo.json' } })).toBe(true);
    // Not matched
    expect(prdRule.trigger.match({ payload: { event: 'change', path: 'projects/arena/prd.md' } })).toBe(false);
    expect(prdRule.trigger.match({ payload: { event: 'change', path: 'projects/arena/recommendations/x.json' } })).toBe(false);
    expect(prdRule.trigger.match({ payload: { event: 'unlink', path: 'projects/arena/history.json' } })).toBe(false);
  });

  it('seeds prd.md when missing + makes a steward: seed commit', async () => {
    writeProjectFile('history.json', { entries: [
      { date: '2026-04-28', id: 'EVT-1', agent: 'Tech Architect', title: 'Bootstrapped renderer', summary: 'fps stable' },
    ]});
    writeProjectFile('features.json', { features: [
      { id: 'feat-1', name: 'Renderer', status: 'complete', category: 'Rendering' },
    ]});
    fireFileChange('projects/arena/history.json');

    const result = await runPrdRuleForLastEvent();
    expect(result.outcome).toBe('success');
    expect(result.output).toContain('seeded');

    const prdPath = path.join(dataDir, 'projects', 'arena', 'prd.md');
    expect(fs.existsSync(prdPath)).toBe(true);
    const prd = parse(fs.readFileSync(prdPath, 'utf-8'));
    expect(prd.originTag).not.toBeNull();
    expect(prd.title).toBe('Arena — PRD');
    // Stable section has placeholder, dynamic sections have real content
    expect(prd.sections.find(s => s.heading === 'Vision').body).toContain('TBD');
    expect(prd.sections.find(s => s.heading === 'Implementation Status').body).toContain('`feat-1`');
    expect(prd.sections.find(s => s.heading === 'Recently Shipped').body).toContain('Bootstrapped renderer');

    const log = execFileSync('git', ['-C', tmpDir, 'log', '-1', '--pretty=%s'], { encoding: 'utf-8' });
    expect(log).toMatch(/^steward: seed prd\.md \(arena\)/);
  });

  it('updates an existing prd.md without touching stable sections', async () => {
    // First create a PRD with a custom Vision
    const md = [
      '<!-- steward-write: AAAAAAAAAAAAAAAAAAAAAAAAAA -->',
      '# Arena — PRD',
      '',
      '## Vision',
      '',
      'Arena is a 2v2 tactical card battle on a 10x10 grid.',
      '',
      '## Pillars',
      '',
      '_TBD_',
      '',
      '## Out of Scope',
      '',
      '_TBD_',
      '',
      '---',
      '',
      '## Implementation Status',
      '',
      '_(old content that will be replaced)_',
      '',
      '## Recently Shipped',
      '',
      '_(old content)_',
      '',
      '## Open Questions',
      '',
      '_(old content)_',
      '',
    ].join('\n');
    writeProjectFile('prd.md', md);
    writeProjectFile('history.json', { entries: [
      { date: '2026-04-28', id: 'NEW-1', agent: 'X', title: 'New ship', summary: '' },
    ]});

    fireFileChange('projects/arena/history.json');
    const result = await runPrdRuleForLastEvent();
    expect(result.outcome).toBe('success');
    expect(result.output).toContain('updated');
    expect(result.output).toContain('Recently Shipped');

    const prdAfter = parse(fs.readFileSync(path.join(dataDir, 'projects', 'arena', 'prd.md'), 'utf-8'));
    // Stable Vision preserved verbatim
    expect(prdAfter.sections.find(s => s.heading === 'Vision').body)
      .toBe('Arena is a 2v2 tactical card battle on a 10x10 grid.');
    // Recently Shipped now reflects new history
    expect(prdAfter.sections.find(s => s.heading === 'Recently Shipped').body)
      .toContain('New ship');
  });

  it('idempotent: second event with no source-file changes skips', async () => {
    writeProjectFile('history.json', { entries: [
      { date: '2026-04-28', id: 'EVT-1', agent: 'X', title: 'Thing', summary: '' },
    ]});
    fireFileChange('projects/arena/history.json');
    const first = await runPrdRuleForLastEvent();
    expect(first.outcome).toBe('success');

    // Second event with no underlying change
    fireFileChange('projects/arena/history.json');
    const second = await runPrdRuleForLastEvent();
    expect(second.outcome).toBe('skipped');
    expect(second.output).toMatch(/no dynamic-section changes/);
  });

  it('skips when no PRD exists AND no source files (nothing to do)', async () => {
    // Don't write any project files
    fireFileChange('projects/arena/history.json');
    const result = await runPrdRuleForLastEvent();
    expect(result.outcome).toBe('skipped');
    expect(result.output).toContain('nothing to do');
  });
});
