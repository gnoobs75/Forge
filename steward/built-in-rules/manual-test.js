// Built-in rule: manual-test
//
// A no-op handler used by the `steward:control { action: 'enqueue-test-task' }`
// debug action. Lets developers verify the daemon can enqueue + dispatch +
// complete a task end-to-end without needing real studio events.
//
// Trigger never matches naturally — the control action enqueues a task with
// rule_id='manual-test' directly, bypassing the trigger filter.

export const manualTest = {
  id: 'manual-test',
  priority: 'low',
  description: 'Debug-only no-op rule used by the enqueue-test-task control action.',

  trigger: {
    // Never matches a real event — only enqueued via enqueue-test-task
    source: '__never__',
    kind: '__never__',
    match: () => false,
  },

  handler: async ({ event, intentUUID }) => {
    return {
      outcome: 'success',
      output: `[manual-test] event=${event?.id || 'none'} intent=${intentUUID}`,
    };
  },
};
