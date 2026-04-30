// Studio Steward — config loader
//
// Persisted at hq-data/.steward/config.json. The file is created with
// DEFAULTS on first load if missing, and merged with DEFAULTS on every
// load so newly-introduced fields don't go undefined when reading a
// pre-existing config.

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = Object.freeze({
  // Phase 1: default ON so the daemon spawns immediately on first app start
  // (Phase 4 ships a Settings → Steward toggle UI; once that exists the design
  // intent is opt-in default, but until then default-off would just hide the
  // feature behind a JSON-edit). The COE_STEWARD_DISABLE=1 env override is
  // honored by the supervisor in main.cjs for users who want to opt out
  // without editing the file.
  enabled: true,
  concurrency: 5,        // max concurrent claude -p workers (Phase 2)
  paused: [],            // per-project pause list (e.g. ['arena'])
  confidenceThreshold: 0.75,  // PRD stable-section gate (Phase 5)
  heartbeatIntervalMs: 30_000,
});

export function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(DEFAULTS, null, 2));
    return { ...DEFAULTS };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return { ...DEFAULTS, ...raw };
  } catch {
    // Corrupt JSON — fall back to defaults but don't overwrite the bad file
    // (so the user can recover their changes if they made any)
    return { ...DEFAULTS };
  }
}

export function saveConfig(configPath, config) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
