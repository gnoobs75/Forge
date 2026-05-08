// electron/bugs-session-io.cjs
//
// "Open Session" backend for the Bug Feedback Loop.
//
// When the boss clicks Open Session on a bug card, the renderer invokes
// `bug:spawn-session`. Main calls `spawnBugSession` here, which:
//
//   1. Reads the bug JSON from hq-data
//   2. Resolves the assigned agent slug, project slug, repo path
//   3. Builds an instruction string with the bug body, screenshot path,
//      conversation, and instructions to mark resolved when done
//   4. Either dispatches via the supplied executeFridayCommand callback
//      (when the active-PTY count is below cap) OR appends to the queue
//      (drained by drainBugSessionQueue when a PTY exits).
//
// The cap matches Friday's existing concurrent-agent ceiling so this
// surface plays nicely with rec-spawned sessions on the same dashboard.

const fs = require('fs');
const path = require('path');

const DEFAULT_AGENT_CAP = 8;
const bugSessionQueue = [];   // [{ bugId, dispatchedAt: null }]

/**
 * Build the instruction string the spawned agent receives. Mirrors the
 * pattern in main.cjs's spawn-agent path but adds bug-specific framing.
 *
 * Comments are limited to the last 12 to keep the prompt manageable.
 */
function buildBugSessionInstruction(bug, dataDir) {
  const lines = [];
  lines.push(`Bug ${bug.id} on ${bug.project}.`);
  lines.push('');
  lines.push('The boss has opened an interactive session with you. They are right here in the chat — converse to resolve the bug together.');
  lines.push('');
  lines.push(`**Title:** ${bug.title}`);
  lines.push(`**Severity:** ${bug.severity}  **Category:** ${bug.category}  **Status:** ${bug.status}`);
  lines.push(`**Page route:** ${bug.pageRoute || '(none)'}`);
  lines.push('');
  lines.push('**Description**');
  lines.push(bug.description || '(empty)');
  lines.push('');
  lines.push('**Steps to reproduce**');
  lines.push(bug.stepsToReproduce || '(empty)');
  lines.push('');

  // Screenshot — resolve to absolute path
  const shotAbs = resolveScreenshotAbs(bug, dataDir);
  if (shotAbs) {
    lines.push('**Screenshot**');
    lines.push(`Use your Read tool on this file before grepping. The pixels reveal what no description can:`);
    lines.push(`  ${shotAbs}`);
    lines.push('');
  }

  // Conversation
  if (Array.isArray(bug.comments) && bug.comments.length > 0) {
    lines.push('**Conversation so far** (most recent last)');
    const recent = bug.comments.slice(-12);
    for (const c of recent) {
      const who = c.author || '?';
      const when = c.timestamp || '?';
      const kind = c.kind ? ` · ${c.kind}` : '';
      lines.push(`---`);
      lines.push(`[${who} @ ${when}${kind}]`);
      lines.push(c.text || '');
    }
    lines.push('---');
    lines.push('');
  }

  // Prior auto-fix attempt summary
  if (bug.attemptOutcome) {
    lines.push('**Prior auto-fix attempt**');
    lines.push(`Outcome: \`${bug.attemptOutcome}\` (confidence: ${bug.attemptConfidence || '?'})`);
    if (bug.attemptSummary) lines.push(`Summary: ${bug.attemptSummary}`);
    if (Array.isArray(bug.attemptSuspectedFiles) && bug.attemptSuspectedFiles.length) {
      lines.push(`Suspected files: ${bug.attemptSuspectedFiles.map(f => `\`${f}\``).join(', ')}`);
    }
    lines.push('');
  }

  lines.push('**Your task**');
  lines.push('Resolve the bug with the boss. You have read/edit/shell access to the project repo. Make the smallest focused change that fixes it. Run the project verify command before claiming it\'s fixed.');
  lines.push('');
  lines.push('**When the bug is resolved**, edit the bug JSON file directly to flip status to "closed" and append a resolution comment:');
  lines.push('');
  lines.push(`  ${path.join(dataDir, 'projects', bug.project || '<slug>', 'bugs', `${bug.id}.json`)}`);
  lines.push('');
  lines.push('Set `status: "closed"`, `updatedAt: <ISO-8601>`, and append to `comments[]`:');
  lines.push('  `{ "author": "<your-name>", "text": "<resolution summary, with commit SHA>", "timestamp": "<ISO-8601>", "kind": "resolution" }`');
  lines.push('');
  lines.push('If the boss decides to walk away mid-conversation without a fix, leave status as `fixing` (it\'s already there) — boss will re-open the session later.');

  return lines.join('\n');
}

function resolveScreenshotAbs(bug, dataDir) {
  if (typeof bug.screenshotPath === 'string' && bug.screenshotPath.length > 0) {
    const abs = path.join(dataDir, bug.screenshotPath);
    if (fs.existsSync(abs)) return abs;
  }
  // We don't decode inline base64 here — the rule does that with cleanup.
  // For a long-running session we'd leak the temp file, so skip.
  return null;
}

/**
 * Find the bug JSON across projects.
 */
function findBugFile(dataDir, bugId) {
  const projectsDir = path.join(dataDir, 'projects');
  if (!fs.existsSync(projectsDir)) return null;
  for (const slug of fs.readdirSync(projectsDir)) {
    const candidate = path.join(projectsDir, slug, 'bugs', `${bugId}.json`);
    if (fs.existsSync(candidate)) return { slug, absPath: candidate };
  }
  return null;
}

/**
 * Mutate a bug JSON file via callback. Used when status flips to 'fixing'
 * on session open.
 */
function patchBug(absPath, mutator) {
  try {
    const doc = JSON.parse(fs.readFileSync(absPath, 'utf-8'));
    const next = mutator({ ...doc });
    fs.writeFileSync(absPath, JSON.stringify(next, null, 2));
    return next;
  } catch (err) {
    console.error('[bugs-session-io] patchBug failed:', err);
    return null;
  }
}

/**
 * Top-level entry — called from main.cjs's IPC handler.
 *
 * @param {object} ctx
 * @param {string} ctx.dataDir       - Absolute path to hq-data
 * @param {string} ctx.bugId         - Bug ID
 * @param {function} ctx.dispatch    - (commandId, command, args) => void; binds to executeFridayCommand
 * @param {function} ctx.activeCount - () => number; current active PTY/agent session count
 * @param {number} [ctx.agentCap]    - Concurrent agent cap (default 8)
 * @returns {Promise<{ok: boolean, status: 'dispatched'|'queued'|'error', queueDepth?: number, error?: string}>}
 */
async function spawnBugSession({ dataDir, bugId, dispatch, activeCount, agentCap }) {
  if (typeof bugId !== 'string' || bugId.length === 0) {
    return { ok: false, status: 'error', error: 'missing bugId' };
  }
  const found = findBugFile(dataDir, bugId);
  if (!found) {
    return { ok: false, status: 'error', error: `bug ${bugId} not found` };
  }

  let bug;
  try { bug = JSON.parse(fs.readFileSync(found.absPath, 'utf-8')); }
  catch (err) { return { ok: false, status: 'error', error: `parse ${bugId}: ${err.message}` }; }

  if (!bug.assignedTo) {
    return { ok: false, status: 'error', error: 'bug has no assignedTo — assign a Council agent first' };
  }

  const cap = (typeof agentCap === 'number' && agentCap > 0) ? agentCap : DEFAULT_AGENT_CAP;
  const active = typeof activeCount === 'function' ? activeCount() : 0;

  if (active >= cap) {
    // Queue it — first-in-first-out
    if (!bugSessionQueue.find(q => q.bugId === bugId)) {
      bugSessionQueue.push({ bugId, queuedAt: Date.now() });
    }
    return { ok: true, status: 'queued', queueDepth: bugSessionQueue.length };
  }

  // Dispatch immediately
  return await dispatchOne({ bug, found, dispatch, dataDir });
}

async function dispatchOne({ bug, found, dispatch, dataDir }) {
  // Flip status → fixing on session open (signals "actively being worked")
  patchBug(found.absPath, (doc) => {
    if (doc.status === 'closed' || doc.status === 'wontfix') return doc;   // don't clobber terminal
    doc.status = 'fixing';
    doc.updatedAt = new Date().toISOString();
    return doc;
  });

  const agentSlug = String(bug.assignedTo || '').toLowerCase().trim().replace(/\s+/g, '-');
  const instruction = buildBugSessionInstruction(bug, dataDir);
  const commandId = `bug-session-${bug.id}-${Date.now()}`;

  try {
    dispatch(commandId, 'spawn-agent', {
      agent: agentSlug,
      project: found.slug,
      instruction,
      bugId: bug.id,
    });
    return { ok: true, status: 'dispatched' };
  } catch (err) {
    return { ok: false, status: 'error', error: `dispatch failed: ${err?.message || err}` };
  }
}

/**
 * Drain the queue when a PTY exits. Caller passes the same dispatch +
 * activeCount callbacks. Drains as many as cap allows (typically 1 per call).
 */
async function drainBugSessionQueue({ dataDir, dispatch, activeCount, agentCap }) {
  const cap = (typeof agentCap === 'number' && agentCap > 0) ? agentCap : DEFAULT_AGENT_CAP;
  while (bugSessionQueue.length > 0 && (activeCount() < cap)) {
    const next = bugSessionQueue.shift();
    const found = findBugFile(dataDir, next.bugId);
    if (!found) continue;
    let bug;
    try { bug = JSON.parse(fs.readFileSync(found.absPath, 'utf-8')); } catch { continue; }
    if (bug.status === 'closed' || bug.status === 'wontfix') continue;
    await dispatchOne({ bug, found, dispatch, dataDir });
  }
  return bugSessionQueue.length;
}

function getBugSessionQueueDepth() {
  return bugSessionQueue.length;
}

module.exports = {
  spawnBugSession,
  drainBugSessionQueue,
  getBugSessionQueueDepth,
  // exported for tests
  buildBugSessionInstruction,
  findBugFile,
};
