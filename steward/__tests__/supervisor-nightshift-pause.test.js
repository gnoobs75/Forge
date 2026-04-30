/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { isOnNightshiftBranch, _resetBranchCacheForTest } from '../supervisor.js';

describe('Steward — nightshift branch pause defense', () => {
  it('returns true when HEAD is on a nightshift/<date> branch', () => {
    _resetBranchCacheForTest();
    const result = isOnNightshiftBranch('/repo', () => 'nightshift/2026-04-29');
    expect(result).toBe(true);
  });

  it('returns false when HEAD is on master', () => {
    _resetBranchCacheForTest();
    const result = isOnNightshiftBranch('/repo', () => 'master');
    expect(result).toBe(false);
  });

  it('returns false when git fails (detached HEAD or no git)', () => {
    _resetBranchCacheForTest();
    const result = isOnNightshiftBranch('/repo', () => { throw new Error('no git'); });
    expect(result).toBe(false);
  });

  it('returns false on feature branches that contain "nightshift" but do not start with the prefix', () => {
    _resetBranchCacheForTest();
    const result = isOnNightshiftBranch('/repo', () => 'feature/my-nightshift-prep');
    expect(result).toBe(false);
  });

  it('caches the branch for ~1 second', () => {
    _resetBranchCacheForTest();
    let calls = 0;
    const exec = () => { calls++; return 'master'; };
    const t0 = 1_000_000;
    isOnNightshiftBranch('/repo', exec, () => t0);
    isOnNightshiftBranch('/repo', exec, () => t0 + 100);
    isOnNightshiftBranch('/repo', exec, () => t0 + 999);
    expect(calls).toBe(1); // 3 calls, but cached on 2nd and 3rd
  });

  it('refreshes the cache after 1 second elapses', () => {
    _resetBranchCacheForTest();
    let calls = 0;
    const exec = () => { calls++; return 'master'; };
    const t0 = 1_000_000;
    isOnNightshiftBranch('/repo', exec, () => t0);
    isOnNightshiftBranch('/repo', exec, () => t0 + 1100);
    expect(calls).toBe(2);
  });
});
