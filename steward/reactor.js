// Studio Steward — reactor.
//
// On each persisted event, walk the rule registry and decide which rules
// should fire. For each match, enqueue a task carrying (event_id, rule_id).
// The worker pool's jobRunner (built by makeJobRunner here) looks up the
// rule's handler and runs it with full event context.
//
// Phase 3 ships ONE built-in rule: rec-resolved-update-history. Future
// phases add Claude-driven rules backed by .md files in hq-data/.steward/rules/.

import { recResolvedUpdateHistory } from './built-in-rules/rec-resolved-update-history.js';
import { recResolvedUpdateFeatures } from './built-in-rules/rec-resolved-update-features.js';
import { prdMaintainOnHistoryChange } from './built-in-rules/prd-maintain-on-history-change.js';
import { manualTest } from './built-in-rules/manual-test.js';
import { bugFiledAppendTodo } from './built-in-rules/bug-filed-append-todo.js';
import { bugStatusChangedUpdateHistory } from './built-in-rules/bug-status-changed-update-history.js';
import { bugClosedFlipTodo } from './built-in-rules/bug-closed-flip-todo.js';
import { bugCriticalPingChat } from './built-in-rules/bug-critical-ping-chat.js';

// Built-in rule registry. Phase 5+ will extend this with file-loaded rules.
const BUILT_IN_RULES = [
  recResolvedUpdateHistory,
  recResolvedUpdateFeatures,
  prdMaintainOnHistoryChange,
  manualTest,
  bugFiledAppendTodo,
  bugStatusChangedUpdateHistory,
  bugClosedFlipTodo,
  bugCriticalPingChat,
];

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export function getRules() {
  // Stable priority sort: high first, then by registration order
  return [...BUILT_IN_RULES].sort((a, b) =>
    (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
  );
}

export function getRule(id) {
  return BUILT_IN_RULES.find(r => r.id === id) || null;
}

/**
 * Walk the rule registry and return the rules whose triggers match this event.
 *
 * Trigger spec is `{ source, kind, match }`. source/kind must match exactly;
 * `match(event)` is a fast predicate that gets the parsed event.
 */
export function matchRules(event) {
  if (!event) return [];
  const matched = [];
  for (const rule of getRules()) {
    const t = rule.trigger || {};
    if (t.source && t.source !== event.source) continue;
    if (t.kind && t.kind !== event.kind) continue;
    if (typeof t.match === 'function') {
      try {
        if (!t.match(event)) continue;
      } catch {
        // A throwing predicate excludes the rule but doesn't crash the reactor
        continue;
      }
    }
    matched.push(rule);
  }
  return matched;
}

/**
 * Build a jobRunner suitable for the worker pool. Each task carries the
 * rule_id; we look up the rule, fetch the event, and run the rule's handler.
 *
 * @param {object} ctx
 * @param {object} ctx.db        - db wrapper
 * @param {string} ctx.dataDir   - hq-data root absolute path
 * @returns {function(task): Promise<{outcome, output?, error?}>}
 */
export function makeJobRunner({ db, dataDir }) {
  return async function jobRunner(task) {
    const rule = getRule(task.rule_id);
    if (!rule) {
      return { outcome: 'error', error: `no built-in rule registered for "${task.rule_id}"` };
    }
    const event = db.getEvent(task.event_id);
    if (!event) {
      return { outcome: 'error', error: `event ${task.event_id} not found` };
    }
    try {
      const result = await rule.handler({
        event,
        dataDir,
        intentUUID: task.id,
      });
      return result || { outcome: 'success' };
    } catch (err) {
      return { outcome: 'error', error: err?.stack || String(err?.message || err) };
    }
  };
}

/**
 * For each matched rule, append an event-rule task to the queue.
 * Returns the list of newly-enqueued task IDs.
 */
export function enqueueMatches({ db, eventId, matchedRules }) {
  const taskIds = [];
  for (const rule of matchedRules) {
    try {
      const id = db.enqueueTask({ ruleId: rule.id, eventId });
      taskIds.push({ id, ruleId: rule.id });
    } catch (err) {
      // Don't let one bad rule block the others
      console.error('[Steward reactor] enqueueTask failed for rule', rule.id, err);
    }
  }
  return taskIds;
}
