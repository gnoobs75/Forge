// Built-in rule: bug-filed-attempt-fix
//
// Unified bug auto-fix rule. A single agent invocation gets full context,
// full tool access, and returns one of four discriminated outcomes:
//
//   "fixed"          → agent edited + verify passed; rule commits to bugfix/{bugId},
//                      then auto-merges to master (Tier 1) or holds for review (Tier 2)
//   "needs-info"     → agent needs boss reply; status flips, comment posted
//   "needs-session"  → agent flags this for an interactive boss-driven session
//   "wontfix"        → agent rejects the bug as out-of-scope / WAI / duplicate
//
// ─── TRIGGER ────────────────────────────────────────────────────────────────
// chokidar 'add' on projects/<slug>/bugs/<id>.json with status='open' AND
// assignedTo set, OR 'change' when autoFixRequested=true (Re-run path).
//
// ─── GATES ──────────────────────────────────────────────────────────────────
//   bug.autoFixSkip === true               → skip (boss reserved this for manual handling)
//   bug.overnightEligible === true         → skip (Night Shift foreman handles it)
//   bug.autoFixAttempted === true && !autoFixRequested → skip (idempotency)
//   .steward/config.json bugAutoFix.enabled === false  → skip
//   bug.severity in skipSeverities         → skip
//   bug.severity strictly < minSeverity    → skip
//   daily-counter cap exceeded (when cap !== null) → skip
//   project repo is dirty                  → skip (won't pollute boss's WIP)
//   project repo HEAD not on master/main   → skip (won't pollute feature branches)
//
// ─── COST GATES ─────────────────────────────────────────────────────────────
// `.steward/config.json` → bugAutoFix:
//   enabled       (default true; opt-out by flipping to false)
//   dailyCap      (default null = NO CAP; per-day ceiling on Claude runs when set)
//   timeoutMs     (default 600_000; 10 min)
//   verifyCommand (per-project default in PROJECT_VERIFY_COMMANDS — Forge ships
//                  empty; the rule short-circuits with a "no verifyCommand"
//                  skip until the boss configures it for a project)
//   skipSeverities (default []; e.g. ["low"] to save budget)
//
// Counter persists at `.steward/.bug-attempt-counter.json` (incremented on
// each agent run for visibility, even when cap is null).
//
// ─── BRANCH STRATEGY ────────────────────────────────────────────────────────
// One branch per bug: `bugfix/{bugId}` (e.g. `bugfix/BUG-20260504-6d24dc`).
// First attempt creates it off master. Re-attempts rebase the existing
// branch onto current master so each run is verified against latest tip.
// HEAD is always returned to master after the agent runs.
//
// On a successful re-verify, an inline tier-policy decides whether to
// auto-merge to master:
//   • Tier 1 (auto-merge):  diff is small + outside Tier-4 paths → merge
//                           --ff-only to master, push, status=closed,
//                           delete branch. The Resolves: trailer is what
//                           commit-references-rec.js reads downstream.
//   • Tier 2 (hold):        diff is large or touches Tier-4 paths
//                           (electron/main.cjs, electron/preload.cjs,
//                           package.json, package-lock.json, schema
//                           migrations). Push branch to origin, status
//                           stays `fixing`, comment "ready to merge —
//                           needs review". Boss merges manually.
//   • Tier 3 (rejected):    re-verify failed → discard the branch's
//                           commits (existing reject behavior).
//
// Auto-merge can be disabled globally with
// `.steward/config.json` → `bugAutoFix.autoMergeOnGreen = false` —
// every successful fix is held for review (Tier 2 behavior). Default true.
//
// Night Shift foreman uses `nightshift/<date>` per its existing convention
// (separate code path).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { studioWrite, commitIntent } from '../studio-write.js';
import { runClaude } from '../worker/claude-runner.js';

const BUG_PATH_REGEX = /^projects\/([^/]+)\/bugs\/[^/]+\.json$/;

const ATTEMPT_DEFAULTS = Object.freeze({
  enabled: true,             // default ON — boss explicitly opted in (no cap)
  dailyCap: null,            // null = no cap; counter still increments for visibility
  timeoutMs: 600_000,        // 10 min — agent does diagnose + fix + verify in one run
  skipSeverities: [],
  minSeverity: null,         // optional floor; severity strictly below this skips
  verifyCommand: null,       // resolved per-project via PROJECT_VERIFY_COMMANDS
  // Branch-per-bug + auto-merge
  autoMergeOnGreen: true,    // Tier-1 promote: merge ff-only to master on green re-verify
  autoMergeMaxLines: 200,    // diffs larger than this go to Tier 2 (hold for review)
  autoMergePush: true,       // push master after merge (set false for offline / no-remote dev)
});

// Files where an automated fix can have outsized blast radius. ANY change
// inside these paths/globs forces Tier 2 (hold for review) regardless of
// diff size. Mirrors the Night Shift §3.5 no-fly-list philosophy.
const TIER4_PATH_PATTERNS = Object.freeze([
  /^electron\/main\.cjs$/,
  /^electron\/preload\.cjs$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /^playwright\.config\.[cm]?js$/,
  /\.steward\/.*$/,            // never auto-merge changes to Steward state
  /^migrations\//,             // schema migrations
]);

export function bugfixBranchName(bugId) {
  if (typeof bugId !== 'string' || bugId.length === 0) {
    throw new Error('bugfixBranchName: bugId required');
  }
  return `bugfix/${bugId}`;
}

const SEVERITY_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });

// Per-project verify command defaults. Forge ships empty — each project's
// owner adds their own via `.steward/config.json`'s `bugAutoFix.verifyCommand`
// or by extending this map. Without a verify command the rule short-circuits
// with a "no verifyCommand" skip, so the auto-fix loop is opt-in per project.
const PROJECT_VERIFY_COMMANDS = Object.freeze({});

const ALLOWED_BASE_BRANCHES = Object.freeze(['master', 'main']);

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for tests)

export function shouldAttempt(bug, event) {
  if (!bug || typeof bug !== 'object') return { ok: false, reason: 'no bug' };
  if (!bug.assignedTo || typeof bug.assignedTo !== 'string') {
    return { ok: false, reason: 'unassigned' };
  }
  if (bug.autoFixSkip === true) {
    return { ok: false, reason: 'autoFixSkip flag set — boss is handling manually' };
  }
  if (bug.overnightEligible === true) {
    return { ok: false, reason: 'overnightEligible — Night Shift foreman owns this bug' };
  }
  if (bug.status !== 'open') return { ok: false, reason: `status="${bug.status}"` };

  // Unified gate: fire on add OR change as long as the bug is open + assigned
  // and (a) hasn't been attempted yet, OR (b) re-run was explicitly requested.
  // The runaway guard is `autoFixAttempted`; the boss clears it via the
  // Re-run button (which sets autoFixRequested:true).
  if (bug.autoFixAttempted === true && bug.autoFixRequested !== true) {
    return { ok: false, reason: 'already attempted (set autoFixRequested:true to retry)' };
  }
  if (bug.autoFixRequested === true) return { ok: true, reason: 're-run requested' };
  return { ok: true, reason: event === 'change' ? 'open assigned bug, change event' : 'fresh open bug' };
}

export function agentSlugFromName(name) {
  return String(name || '').toLowerCase().trim().replace(/\s+/g, '-');
}

export function severityPasses(bug, cfg) {
  const sev = bug.severity;
  if (Array.isArray(cfg.skipSeverities) && cfg.skipSeverities.includes(sev)) {
    return { ok: false, reason: `severity "${sev}" is in skipSeverities` };
  }
  if (cfg.minSeverity && SEVERITY_RANK[sev] !== undefined && SEVERITY_RANK[cfg.minSeverity] !== undefined) {
    if (SEVERITY_RANK[sev] > SEVERITY_RANK[cfg.minSeverity]) {
      return { ok: false, reason: `severity "${sev}" below minSeverity "${cfg.minSeverity}"` };
    }
  }
  return { ok: true };
}

export function parseAttemptResult(stdout) {
  if (typeof stdout !== 'string') return null;
  const trimmed = stdout.trim();
  // Take the LAST JSON object — agents often think out loud first.
  const candidates = extractJsonObjects(trimmed);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const obj = tryJson(candidates[i]);
    if (obj && typeof obj === 'object' && typeof obj.outcome === 'string') return obj;
  }
  return null;
}

function extractJsonObjects(s) {
  const out = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (c === '\\') { escape = true; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

function tryJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

const VALID_OUTCOMES = new Set(['fixed', 'needs-info', 'needs-session', 'wontfix']);

export function outcomeToStatus(outcome) {
  if (!VALID_OUTCOMES.has(outcome)) return null;
  switch (outcome) {
    case 'fixed':         return 'fixing';        // intermediate; promote step flips to 'closed' on Tier 1 auto-merge
    case 'needs-info':    return 'needs-info';
    case 'needs-session': return 'needs-session';
    case 'wontfix':       return 'wontfix';
  }
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function readCounter(counterPath) {
  if (!fs.existsSync(counterPath)) return { date: todayUtc(), count: 0 };
  try {
    const doc = JSON.parse(fs.readFileSync(counterPath, 'utf-8'));
    if (!doc || typeof doc !== 'object' || doc.date !== todayUtc()) {
      return { date: todayUtc(), count: 0 };
    }
    return { date: doc.date, count: Number(doc.count) || 0 };
  } catch {
    return { date: todayUtc(), count: 0 };
  }
}

export function writeCounter(counterPath, counter) {
  fs.mkdirSync(path.dirname(counterPath), { recursive: true });
  fs.writeFileSync(counterPath, JSON.stringify(counter, null, 2));
}

// ────────────────────────────────────────────────────────────────────────────
// Branch handling — branch-per-bug

/**
 * Refuses unless HEAD is on master/main AND the tree is clean.
 *
 * Returns { ok: boolean, reason?: string, baseBranch?: string }.
 */
export function checkRepoReady(repoPath, _spawnSync) {
  const fn = _spawnSync || spawnSync;
  // HEAD branch
  const branchR = fn('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath, encoding: 'utf-8' });
  if (branchR.status !== 0) {
    return { ok: false, reason: `git rev-parse HEAD failed: ${branchR.stderr}` };
  }
  const branch = (branchR.stdout || '').trim();
  if (!ALLOWED_BASE_BRANCHES.includes(branch)) {
    return { ok: false, reason: `HEAD is on "${branch}", not master/main — won't pollute feature branches` };
  }
  // Dirty tree
  const statusR = fn('git', ['status', '--porcelain'], { cwd: repoPath, encoding: 'utf-8' });
  if (statusR.status !== 0) {
    return { ok: false, reason: `git status failed: ${statusR.stderr}` };
  }
  if ((statusR.stdout || '').trim().length > 0) {
    return { ok: false, reason: 'repo has uncommitted changes; refusing to auto-fix on a dirty tree' };
  }
  return { ok: true, baseBranch: branch };
}

/**
 * Switch to or create the per-bug branch off the current HEAD
 * (which checkRepoReady has confirmed is master/main + clean). If the
 * branch exists (re-attempt path), rebase it onto the current HEAD
 * before returning so verify always runs against latest master tip.
 *
 * Returns { ok: boolean, reason?: string }.
 */
export function enterBugfixBranch(repoPath, branchName, _spawnSync) {
  const fn = _spawnSync || spawnSync;
  // Does the branch exist?
  const lookup = fn('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branchName}`], { cwd: repoPath, encoding: 'utf-8' });
  const exists = lookup.status === 0;
  if (!exists) {
    const create = fn('git', ['checkout', '-b', branchName], { cwd: repoPath, encoding: 'utf-8' });
    if (create.status !== 0) {
      return { ok: false, reason: `checkout -b ${branchName} failed: ${create.stderr}` };
    }
    return { ok: true };
  }
  // Exists — switch + rebase onto current master
  const baseBranchR = fn('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath, encoding: 'utf-8' });
  const baseBranch = (baseBranchR.stdout || '').trim();
  const switchR = fn('git', ['checkout', branchName], { cwd: repoPath, encoding: 'utf-8' });
  if (switchR.status !== 0) {
    return { ok: false, reason: `checkout ${branchName} failed: ${switchR.stderr}` };
  }
  const rebaseR = fn('git', ['rebase', baseBranch], { cwd: repoPath, encoding: 'utf-8' });
  if (rebaseR.status !== 0) {
    // Abort the rebase to leave the repo in a defined state, then bail.
    fn('git', ['rebase', '--abort'], { cwd: repoPath, encoding: 'utf-8' });
    fn('git', ['checkout', baseBranch], { cwd: repoPath, encoding: 'utf-8' });
    return {
      ok: false,
      reason: `rebase of ${branchName} onto ${baseBranch} failed (${(rebaseR.stderr || '').trim().slice(0, 200)}); restored ${baseBranch}`,
    };
  }
  return { ok: true };
}

/**
 * After (success or failure), leave HEAD on master/main so subsequent
 * sessions don't accidentally inherit the bugfix branch.
 *
 * Robust recovery: `git reset --hard HEAD` first to discard any uncommitted
 * edits the agent left behind (a partial run can leave the working tree
 * dirty, which makes `git checkout master` refuse with "would overwrite
 * local changes"). The agent's intended changes are committed on the
 * bugfix branch already; uncommitted leftovers are by definition not part
 * of what we want to keep.
 *
 * Returns { ok, reason } so callers can detect cleanup failures (which
 * would leave HEAD on the bugfix branch and trip checkRepoReady on the
 * next attempt).
 */
export function returnToBase(repoPath, baseBranch, _spawnSync) {
  const fn = _spawnSync || spawnSync;
  const reset = fn('git', ['reset', '--hard', 'HEAD'], { cwd: repoPath, encoding: 'utf-8' });
  if (reset.status !== 0) {
    console.error('[bug-filed-attempt-fix] git reset --hard failed:', (reset.stderr || '').trim());
    // Try checkout anyway — it may succeed if the leftover is something
    // reset doesn't catch (e.g. untracked files in non-overlapping paths).
  }
  const checkout = fn('git', ['checkout', baseBranch], { cwd: repoPath, encoding: 'utf-8' });
  if (checkout.status !== 0) {
    console.error(`[bug-filed-attempt-fix] git checkout ${baseBranch} failed after reset:`, (checkout.stderr || '').trim());
    return { ok: false, reason: `git checkout ${baseBranch} failed: ${(checkout.stderr || '').trim().slice(0, 200)}` };
  }
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Screenshot resolution — same shape as before, exported for reuse

/**
 * Resolve a screenshot for the agent's Read tool.
 *
 * Modern bugs (post-migration) carry `screenshotPath` — a path relative to
 * hq-data root — and we hand back the absolute path. Legacy bugs that
 * still have inline `screenshotBase64` get decoded to a temp PNG; we
 * return the temp path and a cleanup() to delete it after the run.
 */
export function resolveScreenshotForAgent({ bug, dataDir }) {
  if (typeof bug.screenshotPath === 'string' && bug.screenshotPath.length > 0) {
    const abs = path.join(dataDir, bug.screenshotPath);
    if (fs.existsSync(abs)) return { absPath: abs, cleanup: null };
  }
  if (typeof bug.screenshotBase64 === 'string' && bug.screenshotBase64.length > 0) {
    const m = /^data:image\/(?:png|jpeg|jpg|webp);base64,(.+)$/i.exec(bug.screenshotBase64);
    if (!m) return { absPath: null, cleanup: null };
    let buf;
    try { buf = Buffer.from(m[1], 'base64'); } catch { return { absPath: null, cleanup: null }; }
    const tmpPath = path.join(os.tmpdir(), `bug-attempt-${bug.id || 'unknown'}-${process.pid}-${Date.now()}.png`);
    try { fs.writeFileSync(tmpPath, buf); } catch { return { absPath: null, cleanup: null }; }
    return { absPath: tmpPath, cleanup: () => { try { fs.unlinkSync(tmpPath); } catch { /* ignore */ } } };
  }
  return { absPath: null, cleanup: null };
}

// ────────────────────────────────────────────────────────────────────────────

export const bugFiledAttemptFix = {
  id: 'bug-filed-attempt-fix',
  priority: 'high',
  description: 'Spawn the assigned Council agent to diagnose + (when confident) fix a bug end-to-end. On green re-verify, auto-merges to master (Tier 1) or holds the per-bug branch (Tier 2) for review.',

  trigger: {
    source: 'hq',
    kind: 'file-changed',
    match: (event) => {
      const p = event?.payload?.path;
      if (typeof p !== 'string') return false;
      const evt = event.payload.event;
      if (evt !== 'add' && evt !== 'change') return false;
      return BUG_PATH_REGEX.test(p);
    },
  },

  handler: async ({ event, dataDir, intentUUID, _runClaude, _spawnSync }) => {
    const relPath = event.payload.path;
    const m = BUG_PATH_REGEX.exec(relPath);
    if (!m) return { outcome: 'skipped', output: 'path did not match bugs pattern' };
    const slug = m[1];

    const bugAbsPath = path.join(dataDir, relPath);
    if (!fs.existsSync(bugAbsPath)) {
      return { outcome: 'skipped', output: `bug file not found: ${bugAbsPath}` };
    }
    let bug;
    try { bug = JSON.parse(fs.readFileSync(bugAbsPath, 'utf-8')); }
    catch (err) { return { outcome: 'error', error: `failed to parse bug JSON: ${err.message}` }; }

    const gate = shouldAttempt(bug, event.payload.event);
    if (!gate.ok) return { outcome: 'skipped', output: `not eligible: ${gate.reason}` };

    const configPath = path.join(dataDir, '.steward', 'config.json');
    const cfg = readAttemptConfig(configPath, slug);

    if (!cfg.enabled) {
      return {
        outcome: 'skipped',
        output: 'bug auto-fix disabled (.steward/config.json → bugAutoFix.enabled = false)',
      };
    }

    const sevCheck = severityPasses(bug, cfg);
    if (!sevCheck.ok) return { outcome: 'skipped', output: sevCheck.reason };

    const counterPath = path.join(dataDir, '.steward', '.bug-attempt-counter.json');
    const counter = readCounter(counterPath);
    if (cfg.dailyCap !== null && counter.count >= cfg.dailyCap) {
      return {
        outcome: 'skipped',
        output: `daily cap reached (${counter.count}/${cfg.dailyCap})`,
      };
    }

    const projectJsonPath = path.join(dataDir, 'projects', slug, 'project.json');
    const repoPath = readRepoPath(projectJsonPath);
    if (!repoPath) {
      return { outcome: 'error', error: `project.json missing repoPath for ${slug}` };
    }
    if (!fs.existsSync(repoPath)) {
      return { outcome: 'error', error: `repoPath does not exist: ${repoPath}` };
    }

    if (!cfg.verifyCommand) {
      // No verify command configured — agent CAN'T fix (no way to validate).
      // Skip but recommend session.
      return {
        outcome: 'skipped',
        output: `no verifyCommand for "${slug}"; flag bug overnightEligible=false + open session manually, OR add bugAutoFix.verifyCommand to .steward/config.json`,
      };
    }

    const repoCheck = checkRepoReady(repoPath, _spawnSync);
    if (!repoCheck.ok) return { outcome: 'skipped', output: repoCheck.reason };
    const baseBranch = repoCheck.baseBranch;

    // Branch per bug: `bugfix/{bugId}`. First attempt creates it off master;
    // re-attempts rebase the existing branch onto current master so verify
    // always runs against latest tip.
    const branchName = bugfixBranchName(bug.id);
    const enter = enterBugfixBranch(repoPath, branchName, _spawnSync);
    if (!enter.ok) {
      return { outcome: 'error', error: `branch setup: ${enter.reason}` };
    }

    // Resolve agent skill brief. Forge stores agent skill files at the
    // Forge project root (`<forge>/agents/<slug>.md`). dataDir is
    // `<forge>/hq-data`, so `..` walks up to the Forge root.
    const agentSlug = agentSlugFromName(bug.assignedTo);
    const forgeRoot = path.resolve(dataDir, '..');
    const skillPath = path.join(forgeRoot, 'agents', `${agentSlug}.md`);
    let skillBrief = '';
    if (fs.existsSync(skillPath)) {
      skillBrief = fs.readFileSync(skillPath, 'utf-8').slice(0, 8000);
    }

    const screenshot = resolveScreenshotForAgent({ bug, dataDir });
    const baselineSha = readHeadSha(repoPath, _spawnSync);
    const prompt = buildAttemptPrompt({
      bug, skillBrief, agentName: bug.assignedTo, slug,
      verifyCommand: cfg.verifyCommand,
      screenshotAbsPath: screenshot.absPath,
      branchName,
    });

    // Run agent. Headless `claude -p` has no PTY for permission prompts —
    // pass --dangerously-skip-permissions so Read/Grep/Edit/Write/Bash
    // calls don't block. Same posture friday-dispatch uses for review
    // agents in main.cjs.
    const claudeRunner = _runClaude || runClaude;
    let result;
    try {
      result = await claudeRunner({
        prompt,
        cwd: repoPath,
        timeoutMs: cfg.timeoutMs,
        extraArgs: ['--dangerously-skip-permissions'],
      });
    } catch (err) {
      if (screenshot.cleanup) screenshot.cleanup();
      returnToBase(repoPath, baseBranch, _spawnSync);
      return { outcome: 'error', error: `runClaude threw: ${err?.message || err}` };
    }
    if (screenshot.cleanup) screenshot.cleanup();

    // Counter increments regardless of outcome — visibility of spend.
    writeCounter(counterPath, { date: counter.date, count: counter.count + 1 });

    // Always set autoFixAttempted to prevent runaway re-fires (boss clears
    // manually OR sets autoFixRequested=true to retry).
    bug.autoFixAttempted = true;
    bug.attemptedAt = new Date().toISOString();
    bug.attemptedBy = bug.assignedTo;
    bug.autoFixRequested = false;

    if (!result.ok) {
      returnToBase(repoPath, baseBranch, _spawnSync);
      const stderrTail = (result.stderr || '').slice(-1000);
      const stdoutTail = (result.stdout || '').slice(-500);
      return await persistOutcome({
        bug, bugAbsPath, intentUUID, status: 'open',
        commentKind: 'auto-fix-error',
        commentText: `**Auto-fix run failed** (timedOut=${result.timedOut}, code=${result.code}, duration=${result.durationMs}ms).\n\n**stderr:**\n\`\`\`\n${stderrTail || '(empty)'}\n\`\`\`${stdoutTail ? `\n\n**stdout tail:**\n\`\`\`\n${stdoutTail}\n\`\`\`` : ''}`,
      });
    }

    const parsed = parseAttemptResult(result.stdout);
    if (!parsed) {
      returnToBase(repoPath, baseBranch, _spawnSync);
      // Include the actual agent output so the failure is diagnosable without
      // a code change. Truncate from both ends to keep the comment readable.
      const stdoutLen = result.stdout.length;
      const stdoutSample = stdoutLen > 1500
        ? `${result.stdout.slice(0, 750)}\n\n[...${stdoutLen - 1500} chars omitted...]\n\n${result.stdout.slice(-750)}`
        : result.stdout;
      const stderrTail = (result.stderr || '').slice(-500);
      return await persistOutcome({
        bug, bugAbsPath, intentUUID, status: 'open',
        commentKind: 'auto-fix-error',
        commentText: `**Could not parse agent output as JSON** (${stdoutLen} chars). Agent ran but didn't return a recognizable outcome JSON object. Use Open Session to investigate.\n\n**stdout:**\n\`\`\`\n${stdoutSample}\n\`\`\`${stderrTail ? `\n\n**stderr tail:**\n\`\`\`\n${stderrTail}\n\`\`\`` : ''}`,
      });
    }

    const newStatus = outcomeToStatus(parsed.outcome);
    if (!newStatus) {
      returnToBase(repoPath, baseBranch, _spawnSync);
      return await persistOutcome({
        bug, bugAbsPath, intentUUID, status: 'open',
        commentKind: 'auto-fix-error',
        commentText: `Agent returned unknown outcome "${parsed.outcome}". Output may be corrupted.`,
      });
    }

    // Branch on outcome
    if (parsed.outcome === 'fixed') {
      // Independent re-verify (Tier 3 gate)
      const verify = runVerify(repoPath, cfg.verifyCommand, _spawnSync);
      if (!verify.ok) {
        // Agent reported success but our re-verify failed — reject.
        // Discard the agent's commits by hard-resetting the bug branch to
        // baseBranch tip (after our earlier rebase, the right ref).
        spawnSync('git', ['reset', '--hard', baseBranch], { cwd: repoPath, encoding: 'utf-8' });
        returnToBase(repoPath, baseBranch, _spawnSync);
        return await persistOutcome({
          bug, bugAbsPath, intentUUID, status: 'needs-session',
          commentKind: 'auto-fix-failure',
          commentText: `**Auto-fix rejected by re-verify.**\n\nAgent reported success but \`${cfg.verifyCommand}\` failed when the Steward re-ran it (exit ${verify.code}). Commits discarded.\n\n**Tail:**\n\`\`\`\n${verify.tail}\n\`\`\`\n\nUse **Open Session** to investigate.`,
        });
      }

      const headSha = readHeadSha(repoPath, _spawnSync);
      if (!headSha || headSha === baselineSha) {
        // Agent reported fixed but didn't actually commit. Treat as needs-session.
        returnToBase(repoPath, baseBranch, _spawnSync);
        return await persistOutcome({
          bug, bugAbsPath, intentUUID, status: 'needs-session',
          commentKind: 'auto-fix-failure',
          commentText: `Agent reported \`fixed\` but HEAD did not advance (still \`${baselineSha?.slice(0, 8)}\`). No commits made. Use **Open Session** to investigate.`,
        });
      }

      // Success path — record on bug record before the promote step decides
      // whether to land it on master.
      bug.attemptOutcome = 'fixed';
      bug.attemptSha = headSha;
      bug.attemptSummary = parsed.summary || '';
      bug.attemptChangedFiles = Array.isArray(parsed.changedFiles) ? parsed.changedFiles : [];
      bug.attemptBranch = branchName;

      // ─── Promote tier policy ──────────────────────────────────────────
      // Decide auto-merge vs hold-for-review based on the diff. Auto-merge
      // can be globally disabled via cfg.autoMergeOnGreen=false (every fix
      // becomes Tier 2). returnToBase puts us on master before merge —
      // fastForwardMerge requires that.
      returnToBase(repoPath, baseBranch, _spawnSync);

      const diff = getBranchDiff(repoPath, baseBranch, branchName, _spawnSync);
      const classification = diff.ok
        ? classifyDiff(diff, { autoMergeMaxLines: cfg.autoMergeMaxLines })
        : { tier: 'hold', reason: `diff inspection failed: ${diff.reason}`, tier4Hits: [], sizeOverLimit: false };

      const wantAutoMerge = cfg.autoMergeOnGreen === true && classification.tier === 'auto-merge';

      if (wantAutoMerge) {
        // Tier 1: ff-merge to master, push, status=closed, delete branch.
        const merge = fastForwardMerge(repoPath, baseBranch, branchName, _spawnSync);
        if (!merge.ok) {
          // Fall through to Tier 2 — diff classified as auto-merge but ff
          // failed (likely raced master moved). Push the branch + hold.
          const push = pushBugBranch(repoPath, branchName, _spawnSync);
          bug.attemptPromote = 'hold-after-ff-failure';
          const commentText = formatFixedComment(parsed, headSha, cfg.verifyCommand, branchName, {
            promote: 'hold',
            promoteReason: `auto-merge fast-forward failed (${merge.reason}); branch ${push.ok ? 'pushed' : 'NOT pushed: ' + push.reason} for manual merge`,
          });
          return await persistOutcome({
            bug, bugAbsPath, intentUUID, status: 'fixing',
            commentKind: 'auto-fix-success', commentText,
            successMessage: `auto-fixed ${bug.id} → ${branchName} ${headSha.slice(0, 8)} (held: ff failed)`,
          });
        }
        // Push master if configured (best-effort)
        let pushNote = '';
        if (cfg.autoMergePush) {
          const push = pushBaseBranch(repoPath, baseBranch, _spawnSync);
          pushNote = push.ok ? 'pushed to origin' : `local merge only — push failed: ${push.reason}`;
        } else {
          pushNote = 'autoMergePush disabled — local merge only';
        }
        // Best-effort branch cleanup (non-fatal)
        deleteBugBranch(repoPath, branchName, _spawnSync);
        bug.attemptPromote = 'auto-merged';

        const commentText = formatFixedComment(parsed, headSha, cfg.verifyCommand, branchName, {
          promote: 'auto-merge',
          promoteReason: classification.reason,
          pushNote,
        });
        // status=closed: commit-references-rec.js will see the Resolves: trailer
        // on the merge commit and re-confirm, but we set it here authoritatively.
        return await persistOutcome({
          bug, bugAbsPath, intentUUID, status: 'closed',
          commentKind: 'auto-fix-success', commentText,
          successMessage: `auto-fixed + merged ${bug.id} → ${baseBranch} ${headSha.slice(0, 8)}`,
        });
      }

      // Tier 2: hold for review. Push branch to origin so the boss can
      // review/merge from anywhere; status stays `fixing`.
      const push = pushBugBranch(repoPath, branchName, _spawnSync);
      bug.attemptPromote = 'hold';

      const holdReason = !cfg.autoMergeOnGreen
        ? 'autoMergeOnGreen disabled in config — held for review'
        : classification.reason;
      const commentText = formatFixedComment(parsed, headSha, cfg.verifyCommand, branchName, {
        promote: 'hold',
        promoteReason: holdReason,
        pushNote: push.ok ? 'branch pushed to origin' : `branch push failed: ${push.reason}`,
      });
      return await persistOutcome({
        bug, bugAbsPath, intentUUID, status: 'fixing',
        commentKind: 'auto-fix-success', commentText,
        successMessage: `auto-fixed ${bug.id} → ${branchName} ${headSha.slice(0, 8)} (held: ${holdReason})`,
      });
    }

    // needs-info / needs-session / wontfix — no commits
    returnToBase(repoPath, baseBranch, _spawnSync);
    bug.attemptOutcome = parsed.outcome;
    bug.attemptSummary = parsed.comment || parsed.reason || '';
    bug.attemptConfidence = parsed.confidence || null;
    bug.attemptSuspectedFiles = Array.isArray(parsed.suspectedFiles) ? parsed.suspectedFiles : [];

    const commentText = formatEscapeComment(parsed);
    return await persistOutcome({
      bug, bugAbsPath, intentUUID, status: newStatus,
      commentKind: 'auto-fix-' + parsed.outcome, commentText,
      successMessage: `${bug.id} → ${parsed.outcome} (${counter.count + 1}${cfg.dailyCap !== null ? `/${cfg.dailyCap}` : ''})`,
    });
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers

async function persistOutcome({ bug, bugAbsPath, intentUUID, status, commentKind, commentText, successMessage }) {
  const now = new Date().toISOString();
  if (!Array.isArray(bug.comments)) bug.comments = [];
  bug.comments.push({
    author: bug.assignedTo || 'steward',
    text: commentText,
    timestamp: now,
    kind: commentKind,
  });
  bug.status = status;
  bug.updatedAt = now;

  let bugRepoPath;
  try {
    bugRepoPath = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: path.dirname(bugAbsPath), encoding: 'utf-8',
    }).trim();
  } catch (err) {
    return { outcome: 'error', error: `git rev-parse failed: ${err.message}` };
  }
  await studioWrite({
    path: bugAbsPath, content: bug, intentUUID, format: 'json',
    repoPath: bugRepoPath, debounceMs: 100,
  });
  const commitResult = await commitIntent(intentUUID, `attempt-fix bug ${bug.id} → ${bug.attemptOutcome || status}`);
  if (!commitResult.committed) {
    return { outcome: 'error', error: `commitIntent: ${commitResult.reason}` };
  }
  return {
    outcome: 'success',
    output: successMessage || `bug ${bug.id} → status ${status}`,
  };
}

function readAttemptConfig(configPath, slug) {
  let raw = {};
  if (fs.existsSync(configPath)) {
    try { raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { raw = {}; }
  }
  const merged = { ...ATTEMPT_DEFAULTS, ...(raw.bugAutoFix || {}) };
  if (!merged.verifyCommand) {
    merged.verifyCommand = PROJECT_VERIFY_COMMANDS[slug] || null;
  }
  return merged;
}

function readRepoPath(projectJsonPath) {
  if (!fs.existsSync(projectJsonPath)) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
    // Forge's project.json uses `repoPath` (camelCase); CoE used `repo_path`.
    // Accept either so a CoE-format project.json still works after a copy.
    if (typeof doc.repoPath === 'string') return doc.repoPath;
    if (typeof doc.repo_path === 'string') return doc.repo_path;
    return null;
  } catch { return null; }
}

function readHeadSha(repoPath, _spawnSync) {
  const fn = _spawnSync || spawnSync;
  const r = fn('git', ['rev-parse', 'HEAD'], { cwd: repoPath, encoding: 'utf-8' });
  if (r.status !== 0) return null;
  return (r.stdout || '').trim() || null;
}

function getBranchTip(repoPath, branchName, _spawnSync) {
  const fn = _spawnSync || spawnSync;
  const r = fn('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branchName}`], { cwd: repoPath, encoding: 'utf-8' });
  if (r.status !== 0) return null;
  return (r.stdout || '').trim() || null;
}

function runVerify(repoPath, verifyCommand, _spawnSync) {
  const fn = _spawnSync || spawnSync;
  const r = fn(verifyCommand, {
    cwd: repoPath, shell: true, encoding: 'utf-8',
    maxBuffer: 4 * 1024 * 1024,
  });
  const tail = ((r.stdout || '') + (r.stderr || '')).split('\n').slice(-30).join('\n');
  return { ok: r.status === 0, code: r.status, tail };
}

// ────────────────────────────────────────────────────────────────────────────
// Promote-tier helpers (auto-merge to master on green re-verify)

/**
 * Read the diff between baseBranch and the bug branch's tip. Returns the
 * list of changed paths (project-relative, forward-slash) plus the total
 * line delta (additions + deletions).
 */
export function getBranchDiff(repoPath, baseBranch, branchName, _spawnSync) {
  const fn = _spawnSync || spawnSync;
  const namesR = fn('git', ['diff', '--name-only', `${baseBranch}...${branchName}`], {
    cwd: repoPath, encoding: 'utf-8',
  });
  if (namesR.status !== 0) {
    return { ok: false, reason: `git diff --name-only failed: ${(namesR.stderr || '').trim()}` };
  }
  const files = (namesR.stdout || '').split('\n').map(s => s.trim()).filter(Boolean);

  const statR = fn('git', ['diff', '--shortstat', `${baseBranch}...${branchName}`], {
    cwd: repoPath, encoding: 'utf-8',
  });
  let linesChanged = 0;
  if (statR.status === 0) {
    // Output looks like: " 2 files changed, 14 insertions(+), 3 deletions(-)"
    const ins = /(\d+) insertion/.exec(statR.stdout || '');
    const del = /(\d+) deletion/.exec(statR.stdout || '');
    linesChanged = (ins ? Number(ins[1]) : 0) + (del ? Number(del[1]) : 0);
  }
  return { ok: true, files, linesChanged };
}

/**
 * Decide promote tier based on the diff. Pure helper — exported for tests.
 *   - 'auto-merge': diff is small AND outside Tier-4 paths (Tier 1)
 *   - 'hold':       diff is large OR touches Tier-4 paths (Tier 2)
 * Returns { tier, reason, tier4Hits, sizeOverLimit }.
 */
export function classifyDiff({ files, linesChanged }, { autoMergeMaxLines, tier4Patterns }) {
  const patterns = tier4Patterns || TIER4_PATH_PATTERNS;
  const tier4Hits = files.filter(f => patterns.some(re => re.test(f)));
  const sizeOverLimit = linesChanged > autoMergeMaxLines;
  if (tier4Hits.length > 0) {
    return { tier: 'hold', reason: `touches Tier-4 paths: ${tier4Hits.join(', ')}`, tier4Hits, sizeOverLimit };
  }
  if (sizeOverLimit) {
    return { tier: 'hold', reason: `diff is ${linesChanged} lines (cap ${autoMergeMaxLines})`, tier4Hits, sizeOverLimit };
  }
  return { tier: 'auto-merge', reason: `${linesChanged} lines across ${files.length} file(s); no Tier-4 paths`, tier4Hits, sizeOverLimit };
}

/**
 * Fast-forward merge of branchName into baseBranch. Requires HEAD to be on
 * baseBranch and tree to be clean. Returns { ok, reason }.
 */
export function fastForwardMerge(repoPath, baseBranch, branchName, _spawnSync) {
  const fn = _spawnSync || spawnSync;
  // We need to be on baseBranch
  const headR = fn('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath, encoding: 'utf-8' });
  if (headR.status !== 0 || (headR.stdout || '').trim() !== baseBranch) {
    return { ok: false, reason: `HEAD not on ${baseBranch} (was ${(headR.stdout || '').trim()})` };
  }
  const mergeR = fn('git', ['merge', '--ff-only', branchName], { cwd: repoPath, encoding: 'utf-8' });
  if (mergeR.status !== 0) {
    return { ok: false, reason: `git merge --ff-only ${branchName} failed: ${(mergeR.stderr || '').trim().slice(0, 200)}` };
  }
  return { ok: true };
}

/**
 * Push baseBranch to its tracking remote. Returns { ok, reason }. Failure
 * here is non-fatal in the calling flow — the merge is local and can be
 * pushed manually later — but we surface the reason so the boss sees it.
 */
export function pushBaseBranch(repoPath, baseBranch, _spawnSync) {
  const fn = _spawnSync || spawnSync;
  const r = fn('git', ['push', 'origin', baseBranch], { cwd: repoPath, encoding: 'utf-8' });
  if (r.status !== 0) {
    return { ok: false, reason: (r.stderr || '').trim().slice(0, 300) };
  }
  return { ok: true };
}

/**
 * Push the bug branch to origin so the boss can review/merge from the
 * dashboard or CLI. Sets upstream so subsequent re-attempts can fast-push.
 */
export function pushBugBranch(repoPath, branchName, _spawnSync) {
  const fn = _spawnSync || spawnSync;
  const r = fn('git', ['push', '--set-upstream', 'origin', branchName], { cwd: repoPath, encoding: 'utf-8' });
  if (r.status !== 0) {
    return { ok: false, reason: (r.stderr || '').trim().slice(0, 300) };
  }
  return { ok: true };
}

/**
 * Delete the bug branch locally + on origin (best-effort, non-fatal).
 */
export function deleteBugBranch(repoPath, branchName, _spawnSync) {
  const fn = _spawnSync || spawnSync;
  fn('git', ['branch', '-D', branchName], { cwd: repoPath, encoding: 'utf-8' });
  fn('git', ['push', 'origin', '--delete', branchName], { cwd: repoPath, encoding: 'utf-8' });
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt + comment formatting

export function buildAttemptPrompt({ bug, skillBrief, agentName, slug, verifyCommand, screenshotAbsPath, branchName }) {
  // Optional runtime context. CoE bugs from the in-game reporter ship
  // gameContext with sector/ship/FPS/event tape; Forge bugs from Phase 10
  // generally won't have any of this. The prompt section is omitted entirely
  // when bug.runtimeContext / bug.gameContext is empty so the agent doesn't
  // see "Sector: (unknown)" boilerplate.
  const ctx = bug.runtimeContext || bug.gameContext || {};
  const hasContext =
    ctx && (
      ctx.sectorName || ctx.sectorId || ctx.fps ||
      (Array.isArray(ctx.recentErrors) && ctx.recentErrors.length) ||
      (Array.isArray(ctx.recentEvents) && ctx.recentEvents.length) ||
      ctx.ship
    );

  let runtimeBlock = '';
  if (hasContext) {
    const recentErrors = Array.isArray(ctx.recentErrors)
      ? ctx.recentErrors.slice(-10).map(e => `- [${e.kind || 'error'}] ${truncate(e.msg, 200)}`).join('\n')
      : '(none)';
    const recentEvents = Array.isArray(ctx.recentEvents)
      ? ctx.recentEvents.slice(-10).map(e => `- ${e.type || e.event || 'event'} ${truncate(JSON.stringify(e.payload || e.data || ''), 120)}`).join('\n')
      : '(none)';
    const ship = ctx.ship ? `${ctx.ship.class || '?'} hull=${ctx.ship.hull?.cur ?? '?'}/${ctx.ship.hull?.max ?? '?'}` : null;

    const lines = ['═══════════════════════ RUNTIME CONTEXT ═══════════════════════'];
    if (ctx.sectorName || ctx.sectorId) lines.push(`Sector: ${ctx.sectorName || ctx.sectorId} ${ctx.sectorRing != null ? `Ring: ${ctx.sectorRing}` : ''}`.trim());
    if (ship) lines.push(`Player: ${ship}`);
    if (ctx.fps != null) lines.push(`FPS: ${ctx.fps}  Quality: ${ctx.graphicsQuality || '?'}`);
    if (Array.isArray(ctx.recentErrors)) lines.push(`\nRecent errors:\n${recentErrors}`);
    if (Array.isArray(ctx.recentEvents)) lines.push(`\nRecent events:\n${recentEvents}`);
    runtimeBlock = '\n\n' + lines.join('\n');
  }

  const conversation = Array.isArray(bug.comments) && bug.comments.length
    ? bug.comments.slice(-12).map(c => `[${c.author || '?'} @ ${c.timestamp || '?'}${c.kind ? ` · ${c.kind}` : ''}]\n${c.text || ''}`).join('\n\n---\n\n')
    : '(no prior comments)';

  const screenshotBlock = screenshotAbsPath
    ? `\n═══════════════════════ SCREENSHOT ═══════════════════════\nA screenshot of the bug at file time. **Use your Read tool on this file before grepping** — for visual / UI bugs the pixels reveal what no description can:\n\n  ${screenshotAbsPath}\n`
    : '';

  return `You are ${agentName} on the Forge Council. The boss has filed bug ${bug.id} against the ${slug} project and assigned it to you. Your job is to either fix it now (when you're confident the fix is small and focused) or to surface what's blocking that decision.

You have the project repo open at the cwd. You have read access (Read, Grep, Glob), edit access (Edit, Write), and shell access (Bash). You are on the \`${branchName}\` branch — commit your changes here. Do not push.${screenshotBlock}

═══════════════════════ AGENT BRIEF ═══════════════════════
${skillBrief || '(no skill file found — use general engineering judgment)'}

═══════════════════════ BUG ═══════════════════════
ID: ${bug.id}
Title: ${bug.title}
Severity: ${bug.severity} | Priority: ${bug.priority} | Category: ${bug.category}
Reported by: ${bug.reportedBy} at ${bug.createdAt}
Page route: ${bug.pageRoute || '(none)'}

Description:
${bug.description || '(empty)'}

Steps to reproduce:
${bug.stepsToReproduce || '(empty)'}

═══════════════════════ CONVERSATION ═══════════════════════
The boss may have replied to earlier triage attempts. Read these carefully — they often resolve "needs-info" gaps from prior runs:

${conversation}${runtimeBlock}

═══════════════════════ YOUR TASK ═══════════════════════
Step 1 — DIAGNOSE: read the bug body, look at the screenshot if present, then grep the codebase to confirm the issue and locate the suspect code. Form a hypothesis. Estimate scope.

Step 2 — DECIDE: pick exactly one outcome.

  • "fixed"          — You're highly confident. The fix is SMALL AND FOCUSED. You will edit, run \`${verifyCommand}\`, and commit on this branch.
  • "needs-info"     — Description ambiguous, repro path unclear, or critical context missing. List the specific questions in \`questions[]\`.
  • "needs-session"  — You have a hypothesis but the fix is too large for a confident one-shot, OR the repro requires hands-on iteration with the boss watching. List a few \`suggestedFirstSteps[]\` to seed the boss-driven session.
  • "wontfix"        — Out of scope, working as designed, duplicate of a known issue, or not actually a bug. Explain in \`reason\`.

Step 3 — IF "fixed":
  a. Make the SMALLEST FOCUSED CHANGE that fixes the bug. Do not refactor surrounding code. Do not add features. The boss WILL reject scope creep.
  b. Run the verify command yourself: \`${verifyCommand}\`. It must pass.
  c. Commit with message:
        \`fix(<area>): <one-line summary>\`
        followed by a blank line and:
        \`Resolves: ${bug.id}\`
  d. Report \`success: true\` with \`commitSha\` (first 8 chars), \`changedFiles[]\`, and the last ~10 lines of verify output.

Step 4 — Return ONE JSON object — no markdown fence, no preamble, no trailing text:

  // For outcome=fixed:
  {
    "outcome": "fixed",
    "summary": "1-2 sentences: what changed and why.",
    "changedFiles": ["relative/path1", "relative/path2"],
    "commitSha": "first 8 chars",
    "verifyOutput": "last ~10 lines of verify",
    "confidence": "high"
  }

  // For outcome=needs-info:
  {
    "outcome": "needs-info",
    "comment": "Markdown body the boss reads on the bug card.",
    "questions": ["specific question 1", "specific question 2"],
    "suspectedFiles": ["paths you grep'd"],
    "confidence": "low"
  }

  // For outcome=needs-session:
  {
    "outcome": "needs-session",
    "comment": "Why this needs hands-on iteration.",
    "suggestedFirstSteps": ["where to start when the session opens"],
    "suspectedFiles": ["paths you grep'd"],
    "confidence": "medium"
  }

  // For outcome=wontfix:
  {
    "outcome": "wontfix",
    "reason": "Out-of-scope / WAI / dup / etc.",
    "comment": "Markdown body the boss reads on the bug card.",
    "confidence": "high"
  }

The Steward will INDEPENDENTLY re-run \`${verifyCommand}\` after a "fixed" outcome. If your reported success doesn't match the re-verify, the auto-fix is REJECTED and the bug will flip to needs-session for the boss to investigate. DO NOT commit half-finished work.

When in doubt, return needs-session — the boss is right there in the chat after you escalate.`;
}

/**
 * Build the auto-fix-success comment. The 5th positional arg is an optional
 * promote-context object: { promote: 'auto-merge'|'hold', promoteReason, pushNote }.
 * Older callers passing 4 args still work — the comment renders without the
 * promote section.
 */
export function formatFixedComment(parsed, headSha, verifyCommand, branchName, promote) {
  const files = Array.isArray(parsed.changedFiles) && parsed.changedFiles.length
    ? parsed.changedFiles.map(f => `- \`${f}\``).join('\n')
    : '(none reported)';
  const tail = parsed.verifyOutput ? `\n\n**Verify (\`${verifyCommand}\`):**\n\`\`\`\n${parsed.verifyOutput}\n\`\`\`` : '';

  let promoteBlock = '';
  if (promote && typeof promote === 'object') {
    if (promote.promote === 'auto-merge') {
      const push = promote.pushNote ? ` (${promote.pushNote})` : '';
      promoteBlock = `\n\n**Promote → auto-merged to master**${push}\n_${promote.promoteReason || ''}_`;
    } else if (promote.promote === 'hold') {
      const push = promote.pushNote ? ` (${promote.pushNote})` : '';
      promoteBlock = `\n\n**Promote → held for review**${push}\n_${promote.promoteReason || ''}_\n\nReview the diff on \`${branchName}\` and merge manually when ready.`;
    }
  }

  return `**Auto-fix landed** at \`${headSha.slice(0, 8)}\` on branch \`${branchName}\`\n\n${parsed.summary || '(no summary)'}\n\n**Changed files:**\n${files}${tail}${promoteBlock}`;
}

export function formatEscapeComment(parsed) {
  const conf = parsed.confidence ? ` _(confidence: ${parsed.confidence})_` : '';
  const head = `**Auto-fix outcome:** ${parsed.outcome}${conf}`;
  const body = parsed.comment || parsed.reason || '';

  let extra = '';
  if (parsed.outcome === 'needs-info' && Array.isArray(parsed.questions) && parsed.questions.length) {
    extra += `\n\n**Need from you:**\n${parsed.questions.map(q => `- ${q}`).join('\n')}`;
  } else if (parsed.outcome === 'needs-session' && Array.isArray(parsed.suggestedFirstSteps) && parsed.suggestedFirstSteps.length) {
    extra += `\n\n**Suggested first steps when session opens:**\n${parsed.suggestedFirstSteps.map(s => `- ${s}`).join('\n')}`;
  }
  if (Array.isArray(parsed.suspectedFiles) && parsed.suspectedFiles.length) {
    extra += `\n\n**Suspected files:**\n${parsed.suspectedFiles.map(f => `- \`${f}\``).join('\n')}`;
  }
  return `${head}\n\n${body}${extra}`;
}

function truncate(s, n) {
  if (typeof s !== 'string') s = String(s ?? '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}
