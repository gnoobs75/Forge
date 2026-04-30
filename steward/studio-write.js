// Studio Steward — studioWrite() shim with three loop-breakers.
//
// Every write the Steward makes goes through this function. It:
//   1. Injects an origin tag (HTML comment for .md, _steward field for .json)
//      so chokidar can recognize Steward-authored writes and skip them.
//   2. Per-path debounce: multiple studioWrite calls to the same path within
//      500ms coalesce to last-value-wins, single disk write.
//   3. Tracks paths per intent UUID. commitIntent() makes a single git commit
//      with all paths from one intent — preserves the "logical change = one
//      commit" property the design demands.
//
// API:
//   studioWrite({ path, content, intentUUID, format, repoPath }) → Promise<{written}>
//   commitIntent(intentUUID, message, opts?) → Promise<{committed, results}>
//   isStewardWrite(filePath) → boolean    (defense-in-depth content sniff)
//   readOriginTag(content, format) → string | null    (for tests + reactor)
//
// Per the no-branches design, commits go directly to whatever branch is
// checked out (master) with author "steward <noreply@steward>". No push.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const STEWARD_AUTHOR = 'steward <noreply@steward>';
const MD_TAG_REGEX = /^<!-- steward-write: ([0-9A-HJKMNP-TV-Z]{26}) -->\n?/;
const DEFAULT_DEBOUNCE_MS = 500;

// In-process state (per Steward run; cleared on subprocess restart)
const pendingWrites = new Map();   // path → { content, intentUUID, format, repoPath, timer, resolvers: [] }
const intentBatches = new Map();   // intentUUID → Map<repoPath, Set<absPath>>

// ────────────────────────────────────────────────────────────────────────────
// Origin tag injection (loop-breaker #1)

export function injectOriginTag(content, intentUUID, format) {
  if (format === 'md') return injectMdTag(content, intentUUID);
  if (format === 'json') return injectJsonTag(content, intentUUID);
  // Unknown format — pass through unmodified
  return content;
}

function injectMdTag(content, intentUUID) {
  const tag = `<!-- steward-write: ${intentUUID} -->\n`;
  if (typeof content !== 'string') content = String(content);
  // Replace existing tag if present, else prepend
  const stripped = content.replace(MD_TAG_REGEX, '');
  return tag + stripped;
}

function injectJsonTag(content, intentUUID) {
  // Accept either a string (parse it) or an already-parsed object
  let obj;
  if (typeof content === 'string') {
    try { obj = JSON.parse(content); } catch { obj = {}; }
  } else if (content && typeof content === 'object') {
    obj = content;
  } else {
    obj = {};
  }
  // Always re-write _steward at the TOP of the object so it's easy to spot.
  // We achieve top placement by reconstructing key order.
  const { _steward, ...rest } = obj;
  const tagged = {
    _steward: { lastWriteUUID: intentUUID, lastWriteTs: new Date().toISOString() },
    ...rest,
  };
  return JSON.stringify(tagged, null, 2) + '\n';
}

export function readOriginTag(content, format) {
  if (format === 'md') {
    const m = MD_TAG_REGEX.exec(content);
    return m ? m[1] : null;
  }
  if (format === 'json') {
    try {
      const obj = JSON.parse(content);
      return obj?._steward?.lastWriteUUID ?? null;
    } catch { return null; }
  }
  return null;
}

export function isStewardWrite(filePath) {
  // Defense-in-depth content sniff for chokidar's ignored callback.
  // Sync read on every chokidar event is expensive; awaitWriteFinish is the
  // primary timing defense. This catches paths that slip through.
  if (!fs.existsSync(filePath)) return false;
  let format;
  if (filePath.endsWith('.md')) format = 'md';
  else if (filePath.endsWith('.json')) format = 'json';
  else return false;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return readOriginTag(content, format) !== null;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// studioWrite — public API

export function studioWrite({
  path: filePath,
  content,
  intentUUID,
  format,
  repoPath,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}) {
  if (!filePath) return Promise.reject(new Error('studioWrite: path required'));
  if (!intentUUID) return Promise.reject(new Error('studioWrite: intentUUID required'));
  if (!format) {
    if (filePath.endsWith('.md')) format = 'md';
    else if (filePath.endsWith('.json')) format = 'json';
    else format = 'raw';
  }

  // Loop-breaker #2: per-path debounce — coalesce rapid writes to same path
  return new Promise((resolve, reject) => {
    const existing = pendingWrites.get(filePath);
    if (existing?.timer) clearTimeout(existing.timer);

    const tagged = injectOriginTag(content, intentUUID, format);

    const entry = {
      content: tagged,
      intentUUID,
      format,
      repoPath,
      resolvers: [...(existing?.resolvers || []), resolve],
      rejecters: [...(existing?.rejecters || []), reject],
    };
    entry.timer = setTimeout(() => flushPending(filePath, entry), debounceMs);
    pendingWrites.set(filePath, entry);
  });
}

function flushPending(filePath, entry) {
  pendingWrites.delete(filePath);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, entry.content);

    // Loop-breaker #3 setup: track this path under its intent UUID so commitIntent
    // can group all paths from one logical change into one git commit.
    if (entry.repoPath) {
      if (!intentBatches.has(entry.intentUUID)) intentBatches.set(entry.intentUUID, new Map());
      const repoMap = intentBatches.get(entry.intentUUID);
      if (!repoMap.has(entry.repoPath)) repoMap.set(entry.repoPath, new Set());
      repoMap.get(entry.repoPath).add(filePath);
    }

    for (const r of entry.resolvers) r({ written: true, path: filePath, intentUUID: entry.intentUUID });
  } catch (err) {
    for (const rj of entry.rejecters) rj(err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// commitIntent — loop-breaker #3 follow-through

export async function commitIntent(intentUUID, message, opts = {}) {
  const repoMap = intentBatches.get(intentUUID);
  if (!repoMap || repoMap.size === 0) {
    return { committed: false, reason: 'no pending writes for intent', intentUUID };
  }

  const author = opts.author || STEWARD_AUTHOR;
  const uuidShort = intentUUID.slice(-8);
  const fullMessage = `steward: ${message} [intent: ${uuidShort}]`;

  const results = [];
  for (const [repoPath, pathSet] of repoMap.entries()) {
    const paths = [...pathSet];
    try {
      // git -C <repo> add <paths…>
      const relPaths = paths.map(p => path.relative(repoPath, p));
      await execFileP('git', ['-C', repoPath, 'add', ...relPaths]);
      // git -C <repo> commit -m "<msg>" --author "<author>" --no-gpg-sign
      // Use --allow-empty so a no-op commit doesn't error if files were
      // already in the previous commit (rare but possible with debounce).
      const { stdout } = await execFileP('git', [
        '-C', repoPath,
        'commit',
        '-m', fullMessage,
        '--author', author,
        '--no-gpg-sign',
      ]);
      // Get the SHA we just made
      const { stdout: sha } = await execFileP('git', ['-C', repoPath, 'rev-parse', 'HEAD']);
      results.push({ repoPath, paths, sha: sha.trim(), stdout });
    } catch (err) {
      results.push({ repoPath, paths, error: err.stderr?.toString() || err.message });
    }
  }

  intentBatches.delete(intentUUID);
  return { committed: true, intentUUID, message: fullMessage, results };
}

// ────────────────────────────────────────────────────────────────────────────
// Diagnostics + lifecycle

export function getPendingWrites() {
  return [...pendingWrites.keys()];
}

export function getOpenIntents() {
  const out = {};
  for (const [uuid, repoMap] of intentBatches.entries()) {
    out[uuid] = {};
    for (const [repo, paths] of repoMap.entries()) {
      out[uuid][repo] = [...paths];
    }
  }
  return out;
}

export function _resetForTests() {
  for (const e of pendingWrites.values()) if (e.timer) clearTimeout(e.timer);
  pendingWrites.clear();
  intentBatches.clear();
}
