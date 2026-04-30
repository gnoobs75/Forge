const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  enabled: false,
  time_window: { start: '23:00', end: '07:00', drain_at: '06:30' },
  weekly_target_tokens: 700000,
  weekly_halt_threshold_pct: 80,
  per_night_token_cap: 200000,
  per_task_token_cap: 50000,
  per_task_minute_cap: 30,
  max_concurrent_dispatches: 3,
  tier_caps: { T1: null, T2: 20, T3: 5 },
  per_project_token_share_max_pct: 40,
  stash_dirty_tree: false,
};

function configPath(hqDataDir) {
  return path.join(hqDataDir, '.nightshift', 'config.json');
}

function readConfig(hqDataDir) {
  const p = configPath(hqDataDir);
  if (!fs.existsSync(p)) {
    return { ok: true, data: { ...DEFAULTS, _exists: false } };
  }
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ok: true, data: { ...DEFAULTS, ...parsed, _exists: true } };
  } catch (err) {
    return { ok: false, error: `parse: ${err.message}` };
  }
}

function writeConfig(hqDataDir, partial) {
  if (!partial || typeof partial !== 'object') {
    return { ok: false, error: 'partial must be an object' };
  }
  const p = configPath(hqDataDir);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  } catch (err) {
    return { ok: false, error: `mkdir: ${err.message}` };
  }
  const current = readConfig(hqDataDir);
  const base = current.ok ? current.data : { ...DEFAULTS };
  const merged = { ...base, ...partial };
  delete merged._exists;
  // Validate the shape we care about most
  if (typeof merged.enabled !== 'boolean') {
    return { ok: false, error: 'enabled must be boolean' };
  }
  if (!merged.time_window || typeof merged.time_window.start !== 'string' || typeof merged.time_window.end !== 'string') {
    return { ok: false, error: 'time_window.start and time_window.end required' };
  }
  if (typeof merged.weekly_target_tokens !== 'number' || merged.weekly_target_tokens < 0) {
    return { ok: false, error: 'weekly_target_tokens must be a non-negative number' };
  }
  try {
    fs.writeFileSync(p, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    return { ok: true, data: merged };
  } catch (err) {
    return { ok: false, error: `write: ${err.message}` };
  }
}

module.exports = { DEFAULTS, readConfig, writeConfig, configPath };
