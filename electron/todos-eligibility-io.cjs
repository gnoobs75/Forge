const fs = require('fs');
const path = require('path');

const SLUG_RE = /^[a-z0-9_-]+$/;

/**
 * Flip overnight_eligible on a single todo item inside a project's todo.json.
 *
 * @param {string} hqDataDir
 * @param {string} projectSlug
 * @param {string} itemId
 * @param {boolean} eligible
 * @returns {{ok: boolean, error?: string}}
 */
function setTodoEligibility(hqDataDir, projectSlug, itemId, eligible) {
  if (typeof projectSlug !== 'string' || !SLUG_RE.test(projectSlug)) {
    return { ok: false, error: 'invalid projectSlug' };
  }
  if (typeof itemId !== 'string' || itemId.length === 0) {
    return { ok: false, error: 'invalid itemId' };
  }
  const todoPath = path.resolve(hqDataDir, 'projects', projectSlug, 'todo.json');
  let raw;
  try { raw = fs.readFileSync(todoPath, 'utf-8'); }
  catch (err) { return { ok: false, error: `read failed: ${err.message}` }; }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (err) { return { ok: false, error: `parse failed: ${err.message}` }; }
  if (!Array.isArray(parsed.items)) {
    return { ok: false, error: 'todo.json missing items[] array' };
  }
  const idx = parsed.items.findIndex((i) => i && i.id === itemId);
  if (idx === -1) {
    return { ok: false, error: `todo item "${itemId}" not found` };
  }
  parsed.items[idx] = { ...parsed.items[idx], overnight_eligible: !!eligible };
  parsed.lastUpdated = new Date().toISOString();
  try {
    fs.writeFileSync(todoPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
  } catch (err) {
    return { ok: false, error: `write failed: ${err.message}` };
  }
  return { ok: true };
}

module.exports = { setTodoEligibility };
