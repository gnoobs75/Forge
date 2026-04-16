// Single-source path resolver for the Forge Electron main + preload processes.
//
// Resolution order for hqData (first existing dir wins):
//   1. process.env.FORGE_HQ_DATA / FORGE_HQ_DATA_DIR (explicit override)
//   2. {forgeRoot}/hq-data           (fresh-install / portable layout)
//   3. {forgeRoot}/../hq-data        (legacy Samurai/ sibling layout)
// If none exist, the fresh-install path is returned so the init script can create it.
//
// CLAUDE.md is resolved similarly: env override → Forge/CLAUDE.md → ../CLAUDE.md.

const path = require('node:path');
const fs = require('node:fs');

const forgeRoot = path.resolve(__dirname, '..');

function pickByMarker(candidates, markerSubpath, fallback) {
  // Returns the first candidate whose markerSubpath exists (e.g., "projects" inside hq-data).
  // Falls through to fallback if none qualify.
  for (const c of candidates) {
    if (!c) continue;
    try {
      if (fs.existsSync(path.join(c, markerSubpath))) return c;
    } catch {}
  }
  return fallback;
}

function pickFile(candidates, fallback) {
  for (const c of candidates) {
    if (!c) continue;
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {}
  }
  return fallback;
}

const hqDataEnv = process.env.FORGE_HQ_DATA || process.env.FORGE_HQ_DATA_DIR;
const hqDataFresh = path.join(forgeRoot, 'hq-data');
const hqDataLegacy = path.join(forgeRoot, '..', 'hq-data');
// A "real" hq-data dir contains a projects/ subdir. Empty stubs (no projects/) are skipped.
const hqData = pickByMarker([hqDataEnv, hqDataFresh, hqDataLegacy], 'projects', hqDataFresh);

const claudeMdEnv = process.env.FORGE_CLAUDE_MD;
const claudeMdFresh = path.join(forgeRoot, 'CLAUDE.md');
const claudeMdLegacy = path.join(forgeRoot, '..', 'CLAUDE.md');
const claudeMd = pickFile([claudeMdEnv, claudeMdFresh, claudeMdLegacy], claudeMdFresh);

const agentsDir = path.join(forgeRoot, 'agents');

const PATHS = {
  forgeRoot,
  hqData,
  agentsDir,
  claudeMd,
  // Convenience joiners — all return absolute paths
  hq: (...parts) => path.join(hqData, ...parts),
  projects: (slug, ...parts) => path.join(hqData, 'projects', slug, ...parts),
  knowledge: (...parts) => path.join(hqData, 'knowledge', ...parts),
  automation: (...parts) => path.join(hqData, 'automation', ...parts),
  reports: (...parts) => path.join(hqData, 'reports', ...parts),
  metering: (...parts) => path.join(hqData, 'metering', ...parts),
  agentSkill: (slug) => path.join(agentsDir, `${slug}.md`),
};

module.exports = PATHS;
