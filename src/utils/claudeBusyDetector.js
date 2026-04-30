// Detects when Claude Code CLI is "computing" by parsing PTY output.
//
// Strategy: watch the raw terminal stream for sentinels the Claude CLI prints
// only while it is actively thinking or running a tool. When a sentinel fires,
// mark busy=true for the scope; if no sentinel is seen for IDLE_MS, flip back
// to busy=false.
//
// Why this approach: session.status === 'running' is too coarse (true while the
// user is typing a prompt). IPC-level hooks would require patching the CLI. So
// we tap the stream we already have.

import { useStore } from '../store/useStore';

// Longer idle timeout so brief gaps between spinner frames don't flap the busy
// flag on/off and retrigger SFX. Smoothes over 1-2s pauses during tool use.
const IDLE_MS = 4000;

// Braille spinner frames the CLI cycles through during thinking.
const SPINNER_CHARS = /[\u280B\u2819\u2839\u2838\u283C\u2834\u2826\u2827\u2807\u280F]/;
const ESC_INTERRUPT = /esc to interrupt/i;

// Strip ANSI/OSC control sequences so our regex sees clean text.
// Covers CSI (ESC [...), OSC (ESC ]...), and bare ESC M / ESC =.
const ANSI_RE = /\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*\x07|[@-Z\\-_])/g;
function stripAnsi(s) {
  return s.replace(ANSI_RE, '');
}

const state = new Map(); // scopeId -> { timer, busy }

function setBusy(scopeId, value) {
  const entry = state.get(scopeId) || { timer: null, busy: false };
  if (entry.busy === value) return;
  entry.busy = value;
  state.set(scopeId, entry);
  try {
    useStore.getState().setClaudeBusy(scopeId, value);
  } catch (e) {
    // Store may not have slice yet on first reload — fail silent.
  }
}

function scheduleIdle(scopeId) {
  const entry = state.get(scopeId) || { timer: null, busy: false };
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => setBusy(scopeId, false), IDLE_MS);
  state.set(scopeId, entry);
}

// Called from Terminal.jsx onData handler. Non-blocking, cheap.
export function trackBusyFromData(scopeId, data) {
  if (!scopeId || !data) return;
  // Only watch Claude-bearing scopes. impl-/agent-/auto- all run claude; tool-
  // scopes don't. The scope- prefix (project scope) may have claude too.
  if (scopeId.startsWith('tool-')) return;

  const clean = stripAnsi(data);
  if (SPINNER_CHARS.test(clean) || ESC_INTERRUPT.test(clean)) {
    setBusy(scopeId, true);
    scheduleIdle(scopeId);
  }
}

// Cleanup on scope close.
export function resetBusy(scopeId) {
  const entry = state.get(scopeId);
  if (entry?.timer) clearTimeout(entry.timer);
  state.delete(scopeId);
  try { useStore.getState().setClaudeBusy(scopeId, false); } catch {}
}
