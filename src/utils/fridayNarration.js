// Maps chokidar file events to narration events for Friday
// Throttles: events within 30s get batched

const NARRATION_THROTTLE_MS = 30000;
let eventBuffer = [];
let flushTimer = null;

const EVENT_PATTERNS = [
  {
    pattern: /recommendations\/.*\.json$/,
    action: 'add',
    toEvent: (filePath) => {
      const filename = filePath.split('/').pop().replace('.json', '');
      return { event: 'rec-created', detail: `New recommendation: ${filename}` };
    },
  },
  {
    pattern: /ideas\/.*\.json$/,
    action: 'add',
    toEvent: (filePath) => {
      const filename = filePath.split('/').pop().replace('.json', '');
      return { event: 'idea-posted', detail: `New idea: ${filename}` };
    },
  },
  {
    pattern: /features\.json$/,
    action: 'change',
    toEvent: (filePath) => {
      const slug = filePath.split('/projects/')[1]?.split('/')[0] || 'unknown';
      return { event: 'features-updated', detail: `Features updated for ${slug}`, project: slug };
    },
  },
  {
    pattern: /execution-log\.json$/,
    action: 'change',
    toEvent: () => ({ event: 'automation-fired', detail: 'Automation executed' }),
  },
];

export function processFileEvent(filePath, action, sendToFriday) {
  // Normalize path
  const normalized = filePath.replace(/\\/g, '/');

  for (const rule of EVENT_PATTERNS) {
    if (rule.pattern.test(normalized) && (!rule.action || rule.action === action)) {
      const coeEvent = rule.toEvent(normalized);
      console.log(`[Friday Narration] Matched: ${action} ${normalized.split('/').pop()} → ${coeEvent.event}`);
      eventBuffer.push({ ...coeEvent, timestamp: Date.now() });
      scheduleFlush(sendToFriday);
      return;
    }
  }
  // No match — that's fine, most file changes aren't narration-worthy
}

function scheduleFlush(sendToFriday) {
  if (flushTimer) {
    console.log(`[Friday Narration] Flush already scheduled — buffered ${eventBuffer.length} events`);
    return;
  }
  console.log(`[Friday Narration] Scheduling flush in ${NARRATION_THROTTLE_MS / 1000}s (${eventBuffer.length} events buffered)`);
  flushTimer = setTimeout(() => {
    flushEvents(sendToFriday);
    flushTimer = null;
  }, NARRATION_THROTTLE_MS);
}

function flushEvents(sendToFriday) {
  if (eventBuffer.length === 0) return;

  console.log(`[Friday Narration] Flushing ${eventBuffer.length} event(s)`);

  if (eventBuffer.length === 1) {
    sendToFriday(eventBuffer[0]);
  } else {
    // Batch: send summary
    const summary = eventBuffer.map(e => e.detail).join('; ');
    console.log(`[Friday Narration] Batch: ${summary}`);
    sendToFriday({
      event: 'batch',
      detail: `${eventBuffer.length} things happened: ${summary}`,
      events: eventBuffer,
    });
  }

  eventBuffer = [];
}

// Force flush (e.g., on disconnect)
export function flushNarrationBuffer(sendToFriday) {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  console.log(`[Friday Narration] Force flush — ${eventBuffer.length} events`);
  flushEvents(sendToFriday);
}
