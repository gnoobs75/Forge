// spawnCouncilSession — multi-agent CLI session launcher
//
// Reuses the existing single-agent spawn IPC to boot claude in the project
// repo with one "lead" agent's skill loaded. After the terminal reports
// ready (we reuse the same ~500ms debounce pattern used in main.cjs for
// agent-session spawns), we auto-type `@Agent1 @Agent2 @Agent3 — ` so the
// user starts a conversation with every selected agent mentioned. The
// trailing em-dash + space is intentional: it leaves the cursor at the
// end of the line but does NOT submit, so the user can type their
// question before pressing enter.
//
// The session record is stamped with `agentSlug = "multi:slug-a+slug-b"`
// and `label = "Council: A + B + C"` so it's visually distinct from
// single-agent tabs.

import { AGENT_INVOKE } from '../components/dashboard/AgentDetailPanel';

// Default @Invoke generator: PascalCase the display name, strip non-alnum.
// Used as a fallback for agents that don't appear in AGENT_INVOKE.
function defaultInvokeFor(agent) {
  return '@' + agent.name.replace(/[^A-Za-z0-9]+/g, '');
}

function invokeFor(agent) {
  return AGENT_INVOKE[agent.id] || defaultInvokeFor(agent);
}

function initialsFor(agent) {
  const parts = agent.name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.map(p => p[0]).join('').toUpperCase();
}

function buildLabel(agents) {
  if (agents.length <= 3) return 'Council: ' + agents.map(a => a.name).join(' + ');
  return 'Council: ' + agents.map(initialsFor).join(' + ');
}

function buildSlug(agents) {
  return 'multi:' + agents.map(a => a.id).sort().join('+');
}

// Time (ms) after PTY spawn before we type the multi-agent prefix.
// The lead agent's own brief takes ~500ms to inject; we add headroom so
// we land inside claude's input line, not in the middle of its banner.
const POST_READY_DELAY_MS = 2500;

/**
 * Spawn a multi-agent council session.
 *
 * Flow:
 *   1. Sort selected agents alphabetically by id (stable, deterministic).
 *   2. Reuse useStore.startAgentSession with the lead (first-sorted) agent —
 *      this creates the session record AND schedules the terminal spawn
 *      via the existing implementationSessions effect in Terminal.jsx.
 *   3. After POST_READY_DELAY_MS, type `@Agent1 @Agent2 @Agent3 — ` into
 *      the pty via terminal.input. No newline — cursor stays at end.
 *
 * @param {object} opts
 * @param {Function} opts.startAgentSession - useStore.getState().startAgentSession
 * @param {object[]} opts.agents - full agent objects (id, name, color…)
 * @param {object} opts.project - project object (slug, repoPath, name)
 * @param {string} [opts.modelFlag] - claude --model flag for lead agent
 * @returns {object|null} the created session record, or null on failure
 */
export function spawnCouncilSession({ startAgentSession, agents, project, modelFlag }) {
  if (!agents || agents.length === 0) return null;
  if (!startAgentSession || !project) return null;

  // Stable sort by id — the lead agent (whose skill file loads at boot)
  // is the alphabetically-first of the selection.
  const sorted = [...agents].sort((a, b) => a.id.localeCompare(b.id));
  const leadAgent = sorted[0];

  const multiSlug = buildSlug(sorted);
  const label = buildLabel(sorted);

  // Reuse the single-agent spawn IPC via startAgentSession. Forge's
  // startAgentSession spreads `extras` into the session record, so
  // agentSlug/label/councilAgents overrides land cleanly.
  const session = startAgentSession(leadAgent, project, {
    modelFlag,
    agentSlug: multiSlug,
    label,
    councilAgents: sorted.map(a => ({ id: a.id, name: a.name, color: a.color })),
  });

  if (!session) return null;

  // Schedule the auto-type of the multi-agent prefix. We do this OUTSIDE
  // the store — the store stays pure state, the side-effect lives here.
  // If the Electron terminal API isn't available (dev/browser mode) this
  // is a no-op; the session still shows the council label in the tab.
  if (window.electronAPI?.terminal?.input) {
    const prefix = sorted.map(invokeFor).join(' ') + ' — ';
    setTimeout(() => {
      try {
        window.electronAPI.terminal.input(session.id, prefix);
      } catch (err) {
        // Non-fatal — user can still type the mentions manually.
        console.warn('[council] failed to auto-type multi-agent prefix:', err);
      }
    }, POST_READY_DELAY_MS);
  }

  return session;
}

// Exposed for tests / debug.
export const __private = {
  defaultInvokeFor,
  invokeFor,
  initialsFor,
  buildLabel,
  buildSlug,
  POST_READY_DELAY_MS,
};
