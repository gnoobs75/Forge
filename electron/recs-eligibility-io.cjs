const fs = require('fs');
const path = require('path');

/**
 * Flip overnight_eligible on a single recommendation file.
 *
 * @param {string} hqDataDir   absolute path to hq-data/
 * @param {string} relPath     hq-data-relative path like "projects/arena/recommendations/ARE-018-...json"
 * @param {boolean} eligible   new value
 * @returns {{ok: boolean, error?: string}}
 */
function setRecEligibility(hqDataDir, relPath, eligible) {
  if (typeof relPath !== 'string' || !relPath.startsWith('projects/')) {
    return { ok: false, error: 'invalid relPath' };
  }
  if (!relPath.endsWith('.json')) {
    return { ok: false, error: 'not a JSON file' };
  }
  // Path-traversal guard
  const absPath = path.resolve(hqDataDir, relPath);
  const hqResolved = path.resolve(hqDataDir);
  if (!absPath.startsWith(hqResolved + path.sep)) {
    return { ok: false, error: 'path escapes hq-data' };
  }
  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf-8');
  } catch (err) {
    return { ok: false, error: `read failed: ${err.message}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `parse failed: ${err.message}` };
  }
  parsed.overnight_eligible = !!eligible;
  try {
    fs.writeFileSync(absPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
  } catch (err) {
    return { ok: false, error: `write failed: ${err.message}` };
  }
  return { ok: true };
}

module.exports = { setRecEligibility };
