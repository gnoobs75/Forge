/**
 * Recommendation ID allocator.
 *
 * New recommendations get a project-prefixed, zero-padded sequential ID like
 * "HOM-042". The counter lives alongside the project's recommendations at
 * {projectsRoot}/{slug}/rec-counter.json as { "next": N }. This helper
 * atomically reads + increments that file and returns the formatted ID.
 *
 * ID format: first 3 UPPERCASE letters of the slug (after stripping non-
 * alphanumeric), then "-", then a zero-padded 3-digit number. For slugs
 * under 3 clean chars the prefix is still uppercase + padded right with
 * nothing (unlikely; current projects are all safely >=3 chars).
 *
 * Concurrency: the counter is read, bumped, and written back under a simple
 * in-memory lock keyed by the counter path. Two parallel writes in the same
 * process serialize. Across processes we rely on the atomic tmp+rename
 * pattern — a concurrent external writer could still race; rec creation
 * isn't hot enough to warrant a file-lock library.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

/** @type {Map<string, Promise<unknown>>} per-counter-file serialization */
const _locks = new Map();

function stripNonAlnum(s) {
  return (s || '').replace(/[^a-zA-Z0-9]/g, '');
}

function prefixForSlug(slug) {
  return stripNonAlnum(slug).toUpperCase().slice(0, 3);
}

function pad(n) {
  return String(n).padStart(3, '0');
}

async function _readCounter(counterPath) {
  try {
    const raw = await fsp.readFile(counterPath, 'utf8');
    const parsed = JSON.parse(raw);
    const n = Number(parsed?.next);
    if (Number.isFinite(n) && n >= 1) return n;
    return 1;
  } catch (err) {
    // Missing file or invalid JSON — start at 1.
    return 1;
  }
}

async function _writeCounterAtomic(counterPath, next) {
  const dir = path.dirname(counterPath);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = counterPath + '.tmp-' + process.pid + '-' + Date.now();
  await fsp.writeFile(tmp, JSON.stringify({ next }, null, 2) + '\n', 'utf8');
  await fsp.rename(tmp, counterPath);
}

/**
 * Read, increment, and persist the counter for `projectSlug`; return the
 * newly assigned ID.
 *
 * @param {string} projectSlug      e.g. "homestead"
 * @param {string} projectsRoot     absolute path to hq-data/projects
 * @returns {Promise<string>}       e.g. "HOM-042"
 */
async function assignRecId(projectSlug, projectsRoot) {
  if (!projectSlug || typeof projectSlug !== 'string') {
    throw new Error('assignRecId: projectSlug required');
  }
  if (!projectsRoot || typeof projectsRoot !== 'string') {
    throw new Error('assignRecId: projectsRoot required');
  }

  const prefix = prefixForSlug(projectSlug);
  if (!prefix) throw new Error(`assignRecId: could not derive prefix from slug "${projectSlug}"`);

  const counterPath = path.join(projectsRoot, projectSlug, 'rec-counter.json');

  // Serialize writes to this counter within the current process.
  const prev = _locks.get(counterPath) ?? Promise.resolve();
  const next = prev.then(async () => {
    const current = await _readCounter(counterPath);
    const id = `${prefix}-${pad(current)}`;
    await _writeCounterAtomic(counterPath, current + 1);
    return id;
  });
  // Swallow rejection on the chain so a failure doesn't poison subsequent calls.
  _locks.set(counterPath, next.catch(() => {}));
  return next;
}

module.exports = {
  assignRecId,
  prefixForSlug,
  _readCounter,
  _writeCounterAtomic,
};
