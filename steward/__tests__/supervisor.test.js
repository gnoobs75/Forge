/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { createSupervisor } from '../supervisor.js';

describe('steward/supervisor', () => {
  it('allows restart when no attempts have been made', () => {
    const sup = createSupervisor();
    expect(sup.canRestart()).toBe(true);
    expect(sup.attemptCount).toBe(0);
  });

  it('grows next-delay exponentially with each attempt', () => {
    const sup = createSupervisor({ baseDelayMs: 100, maxDelayMs: 30_000 });
    expect(sup.nextDelay()).toBe(100);
    sup.recordAttempt();
    expect(sup.nextDelay()).toBe(200);
    sup.recordAttempt();
    expect(sup.nextDelay()).toBe(400);
    sup.recordAttempt();
    expect(sup.nextDelay()).toBe(800);
  });

  it('caps delay at maxDelayMs', () => {
    const sup = createSupervisor({ baseDelayMs: 100, maxDelayMs: 1000 });
    for (let i = 0; i < 10; i++) sup.recordAttempt();
    expect(sup.nextDelay()).toBe(1000);
  });

  it('blocks restart when maxRetries reached within window', () => {
    const sup = createSupervisor({ maxRetries: 3 });
    sup.recordAttempt();
    sup.recordAttempt();
    sup.recordAttempt();
    expect(sup.canRestart()).toBe(false);
  });

  it('allows restart after old attempts age out of the window', () => {
    const sup = createSupervisor({ maxRetries: 3, windowMs: 1000 });
    const t0 = 1_000_000;
    sup.recordAttempt(t0);
    sup.recordAttempt(t0 + 100);
    sup.recordAttempt(t0 + 200);
    expect(sup.canRestart(t0 + 300)).toBe(false);
    // After window expires for ALL three attempts
    expect(sup.canRestart(t0 + 1500)).toBe(true);
    expect(sup.attemptCount).toBe(0); // pruning side-effect
  });

  it('reset clears all attempts immediately', () => {
    const sup = createSupervisor({ maxRetries: 3 });
    sup.recordAttempt();
    sup.recordAttempt();
    sup.recordAttempt();
    expect(sup.canRestart()).toBe(false);
    sup.reset();
    expect(sup.canRestart()).toBe(true);
    expect(sup.attemptCount).toBe(0);
  });

  it('default config matches the studio-steward design (5 retries / 5 min window)', () => {
    const sup = createSupervisor();
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) sup.recordAttempt(t0 + i * 1000);
    expect(sup.canRestart(t0 + 5_500)).toBe(false);
    // All five attempts age out after 5 minutes
    expect(sup.canRestart(t0 + 5 * 60 * 1000 + 100)).toBe(true);
  });
});
