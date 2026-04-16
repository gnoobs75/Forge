// Single-source path resolver for the Friday/Bun side of Forge.
//
// Mirrors Forge/config/paths.cjs — Electron and Friday must agree on which
// hq-data dir is "live" so writes from one side are visible to the other.
//
// Resolution order for hqData (first dir whose `projects/` subdir exists):
//   1. process.env.FORGE_HQ_DATA / FORGE_HQ_DATA_DIR
//   2. {forgeRoot}/hq-data           (fresh-install / portable layout)
//   3. {forgeRoot}/../hq-data        (legacy Samurai/ sibling layout)
// If none qualify, the fresh-install path is returned.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
// friday/src/config/paths.ts → up 3 = friday/, up 4 = Forge root
export const forgeRoot = path.resolve(path.dirname(thisFile), "..", "..", "..");

function pickByMarker(
	candidates: (string | undefined)[],
	markerSubpath: string,
	fallback: string,
): string {
	for (const c of candidates) {
		if (!c) continue;
		try {
			if (fs.existsSync(path.join(c, markerSubpath))) return c;
		} catch {}
	}
	return fallback;
}

const hqDataEnv = process.env.FORGE_HQ_DATA || process.env.FORGE_HQ_DATA_DIR;
const hqDataFresh = path.join(forgeRoot, "hq-data");
const hqDataLegacy = path.join(forgeRoot, "..", "hq-data");
export const hqData = pickByMarker(
	[hqDataEnv, hqDataFresh, hqDataLegacy],
	"projects",
	hqDataFresh,
);

export const agentsDir = path.join(forgeRoot, "agents");

export function hq(...parts: string[]): string {
	return path.join(hqData, ...parts);
}

export function projectPath(slug: string, ...parts: string[]): string {
	return path.join(hqData, "projects", slug, ...parts);
}

export function agentSkill(slug: string): string {
	return path.join(agentsDir, `${slug}.md`);
}

export const PATHS = {
	forgeRoot,
	hqData,
	agentsDir,
	hq,
	projectPath,
	agentSkill,
};
