import { describe, it, expect } from 'vitest';
import { jeevesNarrate } from '../jeevesNarrate';

// Minimal action factory so each test reads as the spec intended:
// "given an action that came from rule X with outcome Y, narrate it."
function makeAction(overrides = {}) {
  return {
    task_id: 't-123',
    rule_id: 'rec-resolved-update-history',
    event_id: 'e-1',
    completed_at: '2026-04-28T12:00:00.000Z',
    outcome: 'success',
    output: '',
    error: null,
    project: 'arena',
    source: 'hq',
    kind: 'file-changed',
    payload: {},
    ...overrides,
  };
}

describe('jeevesNarrate — rec-resolved-update-history', () => {
  it('narrates a successful history append using recId from output', () => {
    const action = makeAction({
      rule_id: 'rec-resolved-update-history',
      output: 'journaled ARE-018-card-ledger for arena → 3464f028',
      payload: { path: 'projects/arena/recommendations/ARE-018-card-ledger.json' },
    });
    const r = jeevesNarrate(action);
    expect(r.headline).toBe('Logged ARE-018-card-ledger to history.json');
    expect(r.why).toBe('Triggered when ARE-018-card-ledger flipped to resolved. Appended one entry.');
    expect(r.where).toBe('arena');
    expect(r.when).toBe('2026-04-28T12:00:00.000Z');
    expect(r.ruleId).toBe('rec-resolved-update-history');
    expect(r.outcome).toBe('success');
  });

  it('falls back to recId derived from payload.path when output lacks one', () => {
    const action = makeAction({
      rule_id: 'rec-resolved-update-history',
      output: '',
      payload: { path: 'projects/arena/recommendations/ARE-099-foo.json' },
    });
    const r = jeevesNarrate(action);
    expect(r.headline).toBe('Logged ARE-099-foo to history.json');
  });

  it('falls back to "the recommendation" when no recId can be extracted', () => {
    const action = makeAction({
      rule_id: 'rec-resolved-update-history',
      output: '',
      payload: {},
    });
    const r = jeevesNarrate(action);
    expect(r.headline).toBe('Logged the recommendation to history.json');
  });
});

describe('jeevesNarrate — rec-resolved-update-features', () => {
  it('narrates a single-feature flip', () => {
    const action = makeAction({
      rule_id: 'rec-resolved-update-features',
      output: 'flipped 1 feature(s) for arena → 3464f028: card-ledger',
      payload: {
        path: 'projects/arena/recommendations/ARE-018-card-ledger.json',
        features_affected: ['card-ledger'],
      },
    });
    const r = jeevesNarrate(action);
    expect(r.headline).toBe('Flipped feature card-ledger to complete in features.json');
    expect(r.why).toBe('Triggered when ARE-018-card-ledger flipped to resolved with features_affected.');
  });

  it('narrates a multi-feature flip with count', () => {
    const action = makeAction({
      rule_id: 'rec-resolved-update-features',
      output: 'flipped 3 feature(s) for arena → 3464f028: a, b, c',
      payload: {
        path: 'projects/arena/recommendations/ARE-018-card-ledger.json',
        features_affected: ['a', 'b', 'c'],
      },
    });
    const r = jeevesNarrate(action);
    expect(r.headline).toBe('Flipped 3 features to complete in features.json');
  });
});

describe('jeevesNarrate — prd-maintain-on-history-change', () => {
  it('narrates a PRD refresh using project slug', () => {
    const action = makeAction({
      rule_id: 'prd-maintain-on-history-change',
      project: 'arena',
      output: 'rebuilt prd.md sections: implementationStatus, recentlyShipped',
      payload: { path: 'projects/arena/history.json' },
    });
    const r = jeevesNarrate(action);
    expect(r.headline).toBe('Refreshed arena PRD');
    expect(r.why).toBe("Triggered when arena's history/features/todo changed. Recomputed dynamic sections.");
  });
});

describe('jeevesNarrate — manual-test', () => {
  it('narrates a debug ping with a constant message', () => {
    const action = makeAction({
      rule_id: 'manual-test',
      output: '[manual-test] event=none intent=abc',
    });
    const r = jeevesNarrate(action);
    expect(r.headline).toBe('Acknowledged a debug ping');
    expect(r.why).toBe('Triggered manually via the Steward control panel.');
  });
});

describe('jeevesNarrate — unknown rule fallback', () => {
  it('uses output as headline when rule_id is unknown', () => {
    const action = makeAction({
      rule_id: 'some-future-rule',
      output: 'did a thing',
      source: 'hq',
      kind: 'file-changed',
      project: 'arena',
    });
    const r = jeevesNarrate(action);
    expect(r.headline).toBe('did a thing');
    expect(r.why).toBe('Triggered by hq:file-changed on arena.');
  });

  it('falls back to "Ran {ruleId}" when there is no output', () => {
    const action = makeAction({
      rule_id: 'some-future-rule',
      output: '',
      source: 'hq',
      kind: 'file-changed',
      project: 'arena',
    });
    const r = jeevesNarrate(action);
    expect(r.headline).toBe('Ran some-future-rule');
  });
});

describe('jeevesNarrate — outcome modifiers', () => {
  it('prepends "Skipped: " when outcome is skipped', () => {
    const action = makeAction({
      rule_id: 'rec-resolved-update-history',
      outcome: 'skipped',
      output: '',
      payload: { path: 'projects/arena/recommendations/ARE-018-card-ledger.json' },
    });
    const r = jeevesNarrate(action);
    expect(r.headline).toBe('Skipped: Logged ARE-018-card-ledger to history.json');
    expect(r.outcome).toBe('skipped');
  });

  it('prepends "Failed: " and prefers action.error over the rule headline', () => {
    const action = makeAction({
      rule_id: 'rec-resolved-update-history',
      outcome: 'error',
      error: 'git commit failed: nothing to commit',
      output: '',
      payload: { path: 'projects/arena/recommendations/ARE-018-card-ledger.json' },
    });
    const r = jeevesNarrate(action);
    expect(r.headline).toBe('Failed: git commit failed: nothing to commit');
    expect(r.outcome).toBe('error');
  });

  it('falls back to base headline on error when action.error is missing', () => {
    const action = makeAction({
      rule_id: 'rec-resolved-update-history',
      outcome: 'error',
      error: null,
      output: '',
      payload: { path: 'projects/arena/recommendations/ARE-018-card-ledger.json' },
    });
    const r = jeevesNarrate(action);
    expect(r.headline).toBe('Failed: Logged ARE-018-card-ledger to history.json');
  });

  it('uses only the first line of a multiline error', () => {
    const action = makeAction({
      rule_id: 'manual-test',
      outcome: 'error',
      error: 'first line of error\nstack trace here\n  more lines',
    });
    const r = jeevesNarrate(action);
    expect(r.headline).toBe('Failed: first line of error');
  });
});

describe('jeevesNarrate — defensive defaults', () => {
  it('handles a null/undefined action without throwing', () => {
    expect(() => jeevesNarrate(null)).not.toThrow();
    expect(() => jeevesNarrate(undefined)).not.toThrow();
    const r = jeevesNarrate(null);
    expect(r.outcome).toBe('unknown');
    expect(r.ruleId).toBe(null);
  });

  it('returns sensible fields when payload is missing', () => {
    const action = makeAction({ rule_id: 'rec-resolved-update-history', payload: undefined, output: '' });
    expect(() => jeevesNarrate(action)).not.toThrow();
    const r = jeevesNarrate(action);
    expect(r.ruleId).toBe('rec-resolved-update-history');
  });
});
