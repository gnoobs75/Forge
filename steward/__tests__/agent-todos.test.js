/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { classifyOrphan, replayLines, buildRollup } from '../agent-todos.js';

// ─────────────────────────────────────────────────────────────────────────────
// classifyOrphan
// ─────────────────────────────────────────────────────────────────────────────

describe('agent-todos — classifyOrphan', () => {
  it('classifies 4-min-old as auto', () => expect(classifyOrphan(240)).toBe('auto'));
  it('classifies 5-min-exact as banner', () => expect(classifyOrphan(300)).toBe('banner'));
  it('classifies 6-day-old as banner', () => expect(classifyOrphan(6 * 86400)).toBe('banner'));
  it('classifies 8-day-old as archive', () => expect(classifyOrphan(8 * 86400)).toBe('archive'));
  it('classifies 0s as auto', () => expect(classifyOrphan(0)).toBe('auto'));
  it('classifies exactly 7-day boundary (< 7d+1s) as banner', () => {
    expect(classifyOrphan(7 * 86400 - 1)).toBe('banner');
  });
  it('classifies exactly 7d as archive', () => {
    expect(classifyOrphan(7 * 86400)).toBe('archive');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// replayLines
// ─────────────────────────────────────────────────────────────────────────────

describe('agent-todos — replayLines', () => {
  it('replays add → update producing a single merged item', () => {
    const lines = [
      JSON.stringify({ ts: '2026-04-29T01:00:00Z', sessionId: 's1', action: 'add', id: 'sub-1', title: 'X', status: 'pending' }),
      JSON.stringify({ ts: '2026-04-29T01:01:00Z', sessionId: 's1', action: 'update', id: 'sub-1', status: 'in_progress' }),
    ];
    const map = replayLines(lines);
    expect(map.size).toBe(1);
    const item = map.get('sub-1');
    expect(item.status).toBe('in_progress');
    expect(item.title).toBe('X');
  });

  it('treats complete as status=completed', () => {
    const lines = [
      JSON.stringify({ ts: '2026-04-29T01:00:00Z', sessionId: 's1', action: 'add', id: 'sub-1', title: 'X', status: 'pending' }),
      JSON.stringify({ ts: '2026-04-29T01:01:00Z', sessionId: 's1', action: 'complete', id: 'sub-1' }),
    ];
    const map = replayLines(lines);
    expect(map.get('sub-1').status).toBe('completed');
  });

  it('treats cancel as status=cancelled', () => {
    const lines = [
      JSON.stringify({ ts: '2026-04-29T01:00:00Z', sessionId: 's1', action: 'add', id: 'sub-1', title: 'X' }),
      JSON.stringify({ ts: '2026-04-29T01:01:00Z', sessionId: 's1', action: 'cancel', id: 'sub-1', note: 'reason' }),
    ];
    const map = replayLines(lines);
    expect(map.get('sub-1').status).toBe('cancelled');
    expect(map.get('sub-1').note).toBe('reason');
  });

  it('skips half-written final line without crashing', () => {
    const lines = [
      JSON.stringify({ ts: '2026-04-29T01:00:00Z', sessionId: 's1', action: 'add', id: 'sub-1', title: 'X' }),
      '{"ts":"2026-04-29T01:0',  // half-written
    ];
    const map = replayLines(lines);
    expect(map.size).toBe(1);
    expect(map.get('sub-1').title).toBe('X');
  });

  it('returns empty map for empty input', () => {
    expect(replayLines([]).size).toBe(0);
  });

  it('skips blank lines without crashing', () => {
    const lines = [
      JSON.stringify({ ts: '2026-04-29T01:00:00Z', sessionId: 's1', action: 'add', id: 'sub-1', title: 'X' }),
      '',
      '   ',
    ];
    const map = replayLines(lines);
    expect(map.size).toBe(1);
  });

  it('last-write-wins on duplicate id', () => {
    const lines = [
      JSON.stringify({ ts: '2026-04-29T01:00:00Z', sessionId: 's1', action: 'add', id: 'sub-1', title: 'First', status: 'pending' }),
      JSON.stringify({ ts: '2026-04-29T01:01:00Z', sessionId: 's1', action: 'update', id: 'sub-1', title: 'Second', status: 'in_progress' }),
      JSON.stringify({ ts: '2026-04-29T01:02:00Z', sessionId: 's1', action: 'update', id: 'sub-1', note: 'extra' }),
    ];
    const map = replayLines(lines);
    expect(map.size).toBe(1);
    expect(map.get('sub-1').title).toBe('Second');
    expect(map.get('sub-1').status).toBe('in_progress');
    expect(map.get('sub-1').note).toBe('extra');
  });

  it('handles multiple distinct ids in same file', () => {
    const lines = [
      JSON.stringify({ ts: '2026-04-29T01:00:00Z', sessionId: 's1', action: 'add', id: 'sub-1', title: 'A', status: 'pending' }),
      JSON.stringify({ ts: '2026-04-29T01:00:01Z', sessionId: 's1', action: 'add', id: 'sub-2', title: 'B', status: 'pending' }),
      JSON.stringify({ ts: '2026-04-29T01:00:02Z', sessionId: 's1', action: 'add', id: 'sub-3', title: 'C', status: 'pending' }),
    ];
    const map = replayLines(lines);
    expect(map.size).toBe(3);
    expect(map.get('sub-1').title).toBe('A');
    expect(map.get('sub-2').title).toBe('B');
    expect(map.get('sub-3').title).toBe('C');
  });

  it('defaults status to pending when add has no status field', () => {
    const lines = [
      JSON.stringify({ ts: '2026-04-29T01:00:00Z', sessionId: 's1', action: 'add', id: 'sub-1', title: 'X' }),
    ];
    const map = replayLines(lines);
    expect(map.get('sub-1').status).toBe('pending');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildRollup
// ─────────────────────────────────────────────────────────────────────────────

describe('agent-todos — buildRollup', () => {
  // Helper to build a session state object in the same shape as
  // startAgentTodosWatcher's in-memory sessions Map stores them.
  function mkSession(sessionId, parent, items, lastWriteTs) {
    const itemsMap = new Map();
    for (const it of items) itemsMap.set(it.id, it);
    return { sessionId, parent, items: itemsMap, lastWriteTs };
  }

  it('returns empty rollup for empty sessions map', () => {
    const r = buildRollup(new Map(), new Set());
    expect(r.byParent).toEqual({});
    expect(r.orphans).toHaveLength(0);
    expect(r.untethered).toHaveLength(0);
  });

  it('groups items by parent under byParent', () => {
    const sessions = new Map();
    sessions.set('s1', mkSession('s1',
      { kind: 'strategic-todo', id: 'todo-002', project: 'arena' },
      [{ id: 'sub-1', title: 'A', status: 'completed', sessionId: 's1', ts: 'T1' }],
      Date.now() / 1000,
    ));
    const r = buildRollup(sessions, new Set(['s1']));
    expect(r.byParent['todo-002']).toBeDefined();
    expect(r.byParent['todo-002'].items).toHaveLength(1);
    expect(r.byParent['todo-002'].project).toBe('arena');
    expect(r.byParent['todo-002'].kind).toBe('strategic-todo');
  });

  it('marks orphans correctly with age and recovery class', () => {
    const now = 1_700_000_000; // arbitrary fixed seconds-since-epoch
    const sessions = new Map();
    sessions.set('s1', {
      sessionId: 's1',
      parent: { kind: 'strategic-todo', id: 'todo-002', project: 'arena' },
      items: new Map([['sub-1', { id: 'sub-1', title: 'In flight', status: 'in_progress', sessionId: 's1' }]]),
      lastWriteTs: now - 60, // 60s ago
    });
    const r = buildRollup(sessions, new Set(), () => now * 1000);
    expect(r.orphans).toHaveLength(1);
    expect(r.orphans[0].sessionId).toBe('s1');
    expect(r.orphans[0].recovery).toBe('auto');
    expect(r.orphans[0].ageSeconds).toBe(60);
  });

  it('does not list a session as orphaned when it is alive', () => {
    const now = 1_700_000_000;
    const sessions = new Map();
    sessions.set('s1', {
      sessionId: 's1',
      parent: { kind: 'strategic-todo', id: 'todo-002', project: 'arena' },
      items: new Map([['sub-1', { id: 'sub-1', status: 'in_progress', sessionId: 's1' }]]),
      lastWriteTs: now - 60,
    });
    const r = buildRollup(sessions, new Set(['s1']), () => now * 1000);
    expect(r.orphans).toHaveLength(0);
  });

  it('separates ad-hoc sessions into untethered', () => {
    const now = 1_700_000_000;
    const sessions = new Map();
    sessions.set('s1', {
      sessionId: 's1',
      parent: { kind: 'ad-hoc', id: null, project: null },
      items: new Map([['sub-1', { id: 'sub-1', status: 'in_progress', sessionId: 's1' }]]),
      lastWriteTs: now - 30,
    });
    const r = buildRollup(sessions, new Set(['s1']), () => now * 1000);
    expect(r.untethered).toHaveLength(1);
    expect(Object.keys(r.byParent)).toHaveLength(0);
  });

  it('counts open items (in_progress + pending) on byParent entry', () => {
    const now = 1_700_000_000;
    const sessions = new Map();
    sessions.set('s1', mkSession('s1',
      { kind: 'strategic-todo', id: 'todo-002', project: 'arena' },
      [
        { id: 'sub-1', status: 'completed', sessionId: 's1' },
        { id: 'sub-2', status: 'in_progress', sessionId: 's1' },
        { id: 'sub-3', status: 'pending', sessionId: 's1' },
        { id: 'sub-4', status: 'cancelled', sessionId: 's1' },
      ],
      now,
    ));
    const r = buildRollup(sessions, new Set(['s1']), () => now * 1000);
    expect(r.byParent['todo-002'].openCount).toBe(2);
  });

  it('two sessions writing to the same parent both appear under that parent', () => {
    const now = 1_700_000_000;
    const sessions = new Map();
    const parent = { kind: 'strategic-todo', id: 'todo-002', project: 'arena' };
    sessions.set('s1', mkSession('s1', parent, [{ id: 'sub-A', status: 'completed', sessionId: 's1' }], now));
    sessions.set('s2', mkSession('s2', parent, [{ id: 'sub-B', status: 'in_progress', sessionId: 's2' }], now));
    const r = buildRollup(sessions, new Set(['s1', 's2']), () => now * 1000);
    expect(r.byParent['todo-002'].items).toHaveLength(2);
  });

  it('includes parent info on orphan entry', () => {
    const now = 1_700_000_000;
    const sessions = new Map();
    sessions.set('s1', {
      sessionId: 's1',
      parent: { kind: 'strategic-todo', id: 'todo-007', project: 'expedition' },
      items: new Map([
        ['sub-1', { id: 'sub-1', title: 'Do thing A', status: 'in_progress', sessionId: 's1' }],
        ['sub-2', { id: 'sub-2', title: 'Do thing B', status: 'pending', sessionId: 's1' }],
      ]),
      lastWriteTs: now - 120, // 2 min — auto
    });
    const r = buildRollup(sessions, new Set(), () => now * 1000);
    expect(r.orphans).toHaveLength(1);
    const o = r.orphans[0];
    expect(o.parent.id).toBe('todo-007');
    expect(o.parent.project).toBe('expedition');
    expect(o.inProgress).toBe(1);
    expect(o.pending).toBe(1);
    expect(o.lastTitle).toBeTruthy();
    expect(o.recovery).toBe('auto');
  });

  it('orphan with ageSeconds > 7d is classified as archive', () => {
    const now = 1_700_000_000;
    const sessions = new Map();
    sessions.set('s1', {
      sessionId: 's1',
      parent: { kind: 'strategic-todo', id: 'todo-002', project: 'arena' },
      items: new Map([['sub-1', { id: 'sub-1', status: 'in_progress', sessionId: 's1' }]]),
      lastWriteTs: now - (8 * 86400), // 8 days old
    });
    const r = buildRollup(sessions, new Set(), () => now * 1000);
    expect(r.orphans).toHaveLength(1);
    expect(r.orphans[0].recovery).toBe('archive');
  });

  it('session with all items completed or cancelled is not orphaned', () => {
    const now = 1_700_000_000;
    const sessions = new Map();
    sessions.set('s1', mkSession('s1',
      { kind: 'strategic-todo', id: 'todo-002', project: 'arena' },
      [
        { id: 'sub-1', status: 'completed', sessionId: 's1' },
        { id: 'sub-2', status: 'cancelled', sessionId: 's1' },
      ],
      now - 60,
    ));
    // Session is not alive AND has only closed items — not an orphan (no open work)
    const r = buildRollup(sessions, new Set(), () => now * 1000);
    expect(r.orphans).toHaveLength(0);
  });

  it('untethered entry includes openCount and lastTitle', () => {
    const now = 1_700_000_000;
    const sessions = new Map();
    sessions.set('s1', {
      sessionId: 's1',
      parent: { kind: 'ad-hoc', id: null, project: null },
      items: new Map([
        ['sub-1', { id: 'sub-1', title: 'Freeform task', status: 'in_progress', sessionId: 's1' }],
        ['sub-2', { id: 'sub-2', title: 'Another task', status: 'pending', sessionId: 's1' }],
      ]),
      lastWriteTs: now - 10,
    });
    const r = buildRollup(sessions, new Set(['s1']), () => now * 1000);
    expect(r.untethered[0].openCount).toBe(2);
    expect(r.untethered[0].lastTitle).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Spec test T9 — heartbeat payload schema (spec §5.2)
//
// These tests validate that buildRollup produces a payload whose shape matches
// the §5.2 contract exactly. They also serve as a regression test for the
// `lastTs` field on byParent items (was `ts`-only before fix on 2026-04-29).
// ─────────────────────────────────────────────────────────────────────────────

describe('agent-todos — T9 heartbeat payload schema (§5.2)', () => {
  const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
  const VALID_PARENT_KINDS = new Set(['strategic-todo', 'recommendation', 'ad-hoc']);
  const VALID_RECOVERY = new Set(['auto', 'banner', 'archive']);

  function fixedNow() { return 1_700_000_000_000; }
  const nowSec = 1_700_000_000;

  it('byParent[id] entries carry { project, kind, items: [], openCount }', () => {
    const sessions = new Map();
    sessions.set('s1', {
      sessionId: 's1',
      parent: { kind: 'strategic-todo', id: 'todo-002', project: 'arena' },
      items: new Map([
        ['sub-1', { id: 'sub-1', title: 'A', status: 'completed', sessionId: 's1', ts: '2026-04-29T01:00:00Z' }],
        ['sub-2', { id: 'sub-2', title: 'B', status: 'in_progress', sessionId: 's1', ts: '2026-04-29T01:01:00Z' }],
      ]),
      lastWriteTs: nowSec - 30,
    });
    const r = buildRollup(sessions, new Set(['s1']), fixedNow);
    const entry = r.byParent['todo-002'];
    expect(entry).toBeDefined();
    expect(typeof entry.project).toBe('string');
    expect(VALID_PARENT_KINDS.has(entry.kind)).toBe(true);
    expect(Array.isArray(entry.items)).toBe(true);
    expect(typeof entry.openCount).toBe('number');
  });

  it('byParent items[] each carry id, title, status, sessionId, lastTs (regression — Bug 1 fix)', () => {
    const sessions = new Map();
    sessions.set('s1', {
      sessionId: 's1',
      parent: { kind: 'strategic-todo', id: 'todo-002', project: 'arena' },
      items: new Map([
        ['sub-1', { id: 'sub-1', title: 'A', status: 'pending', sessionId: 's1', ts: '2026-04-29T01:00:00Z' }],
      ]),
      lastWriteTs: nowSec,
    });
    const r = buildRollup(sessions, new Set(['s1']), fixedNow);
    for (const item of r.byParent['todo-002'].items) {
      expect(typeof item.id).toBe('string');
      expect(typeof item.title).toBe('string');
      expect(VALID_STATUSES.has(item.status)).toBe(true);
      expect(typeof item.sessionId).toBe('string');
      // Regression guard: lastTs is the spec-named field; prior to the
      // 2026-04-29 fix, items had `ts` but not `lastTs`, so the dashboard's
      // relTime(sub.lastTs) returned null and timestamps never rendered.
      expect(typeof item.lastTs).toBe('string');
      expect(item.lastTs).toBe(item.ts); // normalized from ts
    }
  });

  it('orphans[] entries carry parent, sessionId, lastWriteTs, ageSeconds, inProgress, pending, lastTitle, recovery', () => {
    const sessions = new Map();
    sessions.set('crashed-session', {
      sessionId: 'crashed-session',
      parent: { kind: 'strategic-todo', id: 'todo-007', project: 'expedition' },
      items: new Map([
        ['sub-1', { id: 'sub-1', title: 'In flight', status: 'in_progress', sessionId: 'crashed-session', ts: 'T1' }],
        ['sub-2', { id: 'sub-2', title: 'Queued',    status: 'pending',     sessionId: 'crashed-session', ts: 'T2' }],
      ]),
      lastWriteTs: nowSec - 120, // 2 min — auto
    });
    const r = buildRollup(sessions, new Set(), fixedNow);
    expect(r.orphans).toHaveLength(1);
    const o = r.orphans[0];
    expect(o.parent).toBeDefined();
    expect(VALID_PARENT_KINDS.has(o.parent.kind)).toBe(true);
    expect(typeof o.parent.id).toBe('string');
    expect(typeof o.parent.project).toBe('string');
    expect(typeof o.sessionId).toBe('string');
    // lastWriteTs is ISO-8601 per spec §5.2
    expect(typeof o.lastWriteTs).toBe('string');
    expect(o.lastWriteTs).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof o.ageSeconds).toBe('number');
    expect(typeof o.inProgress).toBe('number');
    expect(typeof o.pending).toBe('number');
    expect(typeof o.lastTitle).toBe('string');
    expect(VALID_RECOVERY.has(o.recovery)).toBe(true);
  });

  it('untethered[] entries carry sessionId, openCount, lastTitle (no parent fields)', () => {
    const sessions = new Map();
    sessions.set('adhoc-1', {
      sessionId: 'adhoc-1',
      parent: { kind: 'ad-hoc', id: null, project: null },
      items: new Map([
        ['sub-1', { id: 'sub-1', title: 'Freeform', status: 'in_progress', sessionId: 'adhoc-1', ts: 'T1' }],
      ]),
      lastWriteTs: nowSec - 10,
    });
    const r = buildRollup(sessions, new Set(['adhoc-1']), fixedNow);
    expect(r.untethered).toHaveLength(1);
    const u = r.untethered[0];
    expect(typeof u.sessionId).toBe('string');
    expect(typeof u.openCount).toBe('number');
    expect(typeof u.lastTitle).toBe('string');
    // Untethered entries have no parent or recovery fields per §5.2
    expect(u.parent).toBeUndefined();
    expect(u.recovery).toBe(undefined);
  });

  it('full payload is JSON-serializable (no circular refs, no functions, no undefined leaks)', () => {
    const sessions = new Map();
    sessions.set('s1', {
      sessionId: 's1',
      parent: { kind: 'strategic-todo', id: 'todo-002', project: 'arena' },
      items: new Map([
        ['sub-1', { id: 'sub-1', title: 'A', status: 'pending', sessionId: 's1', ts: 'T1' }],
      ]),
      lastWriteTs: nowSec,
    });
    sessions.set('crashed', {
      sessionId: 'crashed',
      parent: { kind: 'recommendation', id: 'ARE-018', project: 'arena' },
      items: new Map([['sub-1', { id: 'sub-1', status: 'in_progress', sessionId: 'crashed', ts: 'T1' }]]),
      lastWriteTs: nowSec - 90,
    });
    sessions.set('adhoc', {
      sessionId: 'adhoc',
      parent: { kind: 'ad-hoc', id: null, project: null },
      items: new Map([['sub-1', { id: 'sub-1', title: 'X', status: 'pending', sessionId: 'adhoc', ts: 'T1' }]]),
      lastWriteTs: nowSec,
    });
    const r = buildRollup(sessions, new Set(['s1', 'adhoc']), fixedNow);
    // Round-trip through JSON.parse/stringify — would throw on circular refs
    // and silently drop functions / undefined values. If the payload is
    // well-formed for IPC this should be lossless.
    const reconstructed = JSON.parse(JSON.stringify(r));
    expect(reconstructed.byParent['todo-002']).toBeDefined();
    expect(reconstructed.orphans).toHaveLength(1);
    expect(reconstructed.untethered).toHaveLength(1);
  });
});
