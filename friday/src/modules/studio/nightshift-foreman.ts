/**
 * Night Shift Foreman — overnight autonomous work orchestrator
 *
 * Three pieces:
 *   1. runPreflightChecks() — pure, deterministic gate evaluation
 *   2. computeQueue()       — pure, deterministic queue builder
 *   3. FridayTool wrappers  — nightshift.dry_run + nightshift.run (v1: T1 only)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import type { FridayTool, FridayModule, ToolResult } from "../types.ts";
import { findHqDir, readJsonSafe } from "./hq-utils.ts";
import { dispatchAgent } from "./dispatch-agent.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PreflightState {
	/** Output of `git status --porcelain` */
	gitStatus: string;
	/** Output of `git rev-parse --abbrev-ref HEAD` */
	branch: string;
	/** Names of branches matching `nightshift/*` */
	branches: string[];
	/** 0-100, computed by CoE's metering aggregator */
	weeklyBurnPct: number;
	weeklyHaltThresholdPct: number;
	/** Count of overnight_eligible items found */
	eligibleCount: number;
	/** last-modified of hq-data/.steward/config.json within last 60s */
	stewardHealthy: boolean;
	/** Value of nightshift config.enabled */
	configEnabled: boolean;
	/** Free bytes on the drive containing the hq-data path; null if unavailable */
	diskFreeBytes: number | null;
	/** Minimum required free bytes before Night Shift will run (default 5 GB) */
	diskMinBytes: number;
	/** Current highest GPU temperature in °C; null if nvidia-smi unavailable */
	gpuTempC: number | null;
	/** Maximum allowed GPU temperature in °C before Night Shift is blocked (default 75) */
	gpuMaxTempC: number;
}

export interface PreflightResult {
	passed: boolean;
	failed: string[];
	details: Record<string, string>;
}

export type Tier = "T1" | "T2" | "T3";

export interface QueueItemInput {
	_filePath: string;
	project: string;
	overnight_eligible: boolean;
	verify?: string;
	tier?: Tier;
	priority?: "high" | "medium" | "low";
	/** For budget math; default 5000 if absent */
	estimatedTokens?: number;
	approaches?: unknown[];
	category?: string;
	// Other fields ignored
	[key: string]: unknown;
}

export interface QueueComputeInput {
	recs: QueueItemInput[];
	todos: QueueItemInput[];
	tierCaps: { T1: number | null; T2: number; T3: number };
	/** 0-100 */
	perProjectMaxPct: number;
	perNightTokenCap: number;
}

export interface QueueItem {
	source: "rec" | "todo";
	ref: QueueItemInput;
	tier: Tier;
	estimatedTokens: number;
	reasonIncluded: string;
}

// ─── Night Shift config shape ─────────────────────────────────────────────────

interface NightShiftConfig {
	enabled: boolean;
	weeklyHaltThresholdPct?: number;
	perNightTokenCap?: number;
	perProjectMaxPct?: number;
	tierCaps?: { T1: number | null; T2: number; T3: number };
}

// ─── Environment query helpers ────────────────────────────────────────────────

/**
 * Check free disk space on the drive containing the given path.
 * Returns bytes free, or null if the check couldn't be performed.
 *
 * Pure-ish: takes a `runner` dep (default: child_process.execSync) so tests can stub.
 */
export function getDiskFreeBytes(
	targetPath: string,
	runner: (cmd: string) => string = (cmd) => execSync(cmd, { encoding: "utf-8" }),
): number | null {
	try {
		let output: string;
		if (process.platform === "win32") {
			// PowerShell: get the free bytes for the drive qualifier (e.g. "C")
			const qualifier = path.parse(targetPath).root.replace(/[/\\]/g, "").replace(/:$/, "");
			const cmd = `powershell -NoProfile -Command "(Get-PSDrive -Name '${qualifier}').Free"`;
			output = runner(cmd);
		} else {
			output = runner(`df -B1 "${targetPath}" | tail -1 | awk '{print $4}'`);
		}
		const parsed = parseInt(output.trim(), 10);
		if (isNaN(parsed)) return null;
		return parsed;
	} catch {
		return null;
	}
}

/**
 * Read the highest-temperature GPU's current temperature in °C.
 * Returns null if nvidia-smi is unavailable, fails, or returns nothing.
 */
export function getGpuTempC(
	runner: (cmd: string) => string = (cmd) => execSync(cmd, { encoding: "utf-8" }),
): number | null {
	try {
		const output = runner(
			"nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits",
		);
		const lines = output
			.trim()
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean);
		if (lines.length === 0) return null;
		const temps = lines.map((l) => parseInt(l, 10)).filter((n) => !isNaN(n));
		if (temps.length === 0) return null;
		return Math.max(...temps);
	} catch {
		return null;
	}
}

// ─── 1. Pure preflight checks ─────────────────────────────────────────────────

/**
 * Evaluate all Night Shift preflight gates. Pure, no side effects.
 */
export function runPreflightChecks(state: PreflightState): PreflightResult {
	const failed: string[] = [];
	const details: Record<string, string> = {};

	// config-enabled
	if (!state.configEnabled) {
		failed.push("config-enabled");
		details["config-enabled"] = "Night Shift is disabled in config";
	} else {
		details["config-enabled"] = "Night Shift is enabled";
	}

	// clean-tree
	if (state.gitStatus.trim() !== "") {
		failed.push("clean-tree");
		details["clean-tree"] = `Dirty working tree:\n${state.gitStatus.trim()}`;
	} else {
		details["clean-tree"] = "Working tree is clean";
	}

	// on-master
	if (state.branch !== "master") {
		failed.push("on-master");
		details["on-master"] = `Currently on branch '${state.branch}', expected 'master'`;
	} else {
		details["on-master"] = "On master branch";
	}

	// no-stale-nightshift-branches
	if (state.branches.length > 0) {
		failed.push("no-stale-nightshift-branches");
		details["no-stale-nightshift-branches"] = `Stale nightshift branches exist: ${state.branches.join(", ")}`;
	} else {
		details["no-stale-nightshift-branches"] = "No stale nightshift branches";
	}

	// weekly-burn-below-threshold
	if (state.weeklyBurnPct >= state.weeklyHaltThresholdPct) {
		failed.push("weekly-burn-below-threshold");
		details["weekly-burn-below-threshold"] =
			`Weekly burn ${state.weeklyBurnPct}% >= halt threshold ${state.weeklyHaltThresholdPct}%`;
	} else {
		details["weekly-burn-below-threshold"] =
			`Weekly burn ${state.weeklyBurnPct}% is below threshold ${state.weeklyHaltThresholdPct}%`;
	}

	// has-eligible-work
	if (state.eligibleCount <= 0) {
		failed.push("has-eligible-work");
		details["has-eligible-work"] = "No overnight_eligible work items found";
	} else {
		details["has-eligible-work"] = `${state.eligibleCount} eligible item(s) found`;
	}

	// steward-healthy
	if (!state.stewardHealthy) {
		failed.push("steward-healthy");
		details["steward-healthy"] = "Studio Steward config not recently modified — daemon may be stale";
	} else {
		details["steward-healthy"] = "Studio Steward appears healthy";
	}

	// disk-space-ok (best-effort: null = pass)
	if (state.diskFreeBytes !== null && state.diskFreeBytes < state.diskMinBytes) {
		failed.push("disk-space-ok");
		const freeGB = (state.diskFreeBytes / (1024 * 1024 * 1024)).toFixed(1);
		const minGB = (state.diskMinBytes / (1024 * 1024 * 1024)).toFixed(1);
		details["disk-space-ok"] = `Disk too full: ${freeGB} GB free, need at least ${minGB} GB`;
	} else if (state.diskFreeBytes === null) {
		details["disk-space-ok"] = "Disk check unavailable — skipping (best-effort)";
	} else {
		const freeGB = (state.diskFreeBytes / (1024 * 1024 * 1024)).toFixed(1);
		details["disk-space-ok"] = `Disk OK: ${freeGB} GB free`;
	}

	// gpu-thermal-ok (best-effort: null = pass)
	if (state.gpuTempC !== null && state.gpuTempC > state.gpuMaxTempC) {
		failed.push("gpu-thermal-ok");
		details["gpu-thermal-ok"] = `GPU too hot: ${state.gpuTempC}°C exceeds max ${state.gpuMaxTempC}°C`;
	} else if (state.gpuTempC === null) {
		details["gpu-thermal-ok"] = "GPU check unavailable — skipping (best-effort)";
	} else {
		details["gpu-thermal-ok"] = `GPU thermal OK: ${state.gpuTempC}°C (max ${state.gpuMaxTempC}°C)`;
	}

	return {
		passed: failed.length === 0,
		failed,
		details,
	};
}

// ─── 2. Queue computation ─────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * Infer tier when not explicitly set.
 *
 * Heuristic for v1:
 * - If the item has no `verify` field AND its `category` ends with `-question` or `-review`
 *   → T1 (draft/research)
 * - Otherwise → T3 (real code work, conservative)
 */
function inferTier(item: QueueItemInput): Tier {
	if (item.tier) return item.tier;
	const cat = typeof item.category === "string" ? item.category : "";
	if (!item.verify && (cat.endsWith("-question") || cat.endsWith("-review"))) {
		return "T1";
	}
	return "T3";
}

/**
 * Build the Night Shift dispatch queue. Pure, deterministic.
 */
export function computeQueue(input: QueueComputeInput): QueueItem[] {
	const { recs, todos, tierCaps, perProjectMaxPct, perNightTokenCap } = input;

	// 1. Annotate and filter to overnight_eligible items only
	type Candidate = {
		source: "rec" | "todo";
		ref: QueueItemInput;
		tier: Tier;
		estimatedTokens: number;
		priorityOrder: number;
	};

	const eligible: Candidate[] = [];

	for (const rec of recs) {
		if (!rec.overnight_eligible) continue;
		eligible.push({
			source: "rec",
			ref: rec,
			tier: inferTier(rec),
			estimatedTokens: rec.estimatedTokens ?? 5000,
			priorityOrder: PRIORITY_ORDER[rec.priority ?? "low"] ?? 2,
		});
	}
	for (const todo of todos) {
		if (!todo.overnight_eligible) continue;
		eligible.push({
			source: "todo",
			ref: todo,
			tier: inferTier(todo),
			estimatedTokens: todo.estimatedTokens ?? 5000,
			priorityOrder: PRIORITY_ORDER[todo.priority ?? "low"] ?? 2,
		});
	}

	// 2. Sort: priority desc (high=0 first), then _filePath asc (deterministic)
	eligible.sort((a, b) => {
		if (a.priorityOrder !== b.priorityOrder) return a.priorityOrder - b.priorityOrder;
		return a.ref._filePath.localeCompare(b.ref._filePath);
	});

	// 3. Apply caps
	const perProjectTokenBudget = Math.floor((perNightTokenCap * perProjectMaxPct) / 100);
	const tierCounters: Record<Tier, number> = { T1: 0, T2: 0, T3: 0 };
	const projectTokenUsed: Record<string, number> = {};
	let nightTotalTokens = 0;

	const queue: QueueItem[] = [];

	for (const candidate of eligible) {
		const { source, ref, tier, estimatedTokens } = candidate;
		const project = ref.project;

		// Per-tier cap
		const tierCap = tierCaps[tier];
		if (tierCap !== null && tierCounters[tier] >= tierCap) continue;

		// Per-project cap
		const projUsed = projectTokenUsed[project] ?? 0;
		if (projUsed + estimatedTokens > perProjectTokenBudget) continue;

		// Per-night cap
		if (nightTotalTokens + estimatedTokens > perNightTokenCap) continue;

		// Include
		tierCounters[tier]++;
		projectTokenUsed[project] = projUsed + estimatedTokens;
		nightTotalTokens += estimatedTokens;

		const projBudgetUsed = projectTokenUsed[project];
		const reasonIncluded = [
			`Tier ${tier}`,
			`fits per-project cap (${projBudgetUsed}/${perProjectTokenBudget})`,
			`fits per-night cap (${nightTotalTokens}/${perNightTokenCap})`,
		].join(", ");

		queue.push({ source, ref, tier, estimatedTokens, reasonIncluded });
	}

	return queue;
}

// ─── 3. State gathering helpers ───────────────────────────────────────────────

const NIGHTSHIFT_CONFIG_PATH = "C:/Claude/Agency/hq-data/.nightshift/config.json";
const STEWARD_CONFIG_PATH = "C:/Claude/Agency/hq-data/.steward/config.json";
const STEWARD_HEALTHY_WINDOW_MS = 60 * 1000; // 60s

/** Default config when nightshift config.json is absent or invalid */
const DEFAULT_NIGHTSHIFT_CONFIG: NightShiftConfig = {
	enabled: false,
	weeklyHaltThresholdPct: 80,
	perNightTokenCap: 100_000,
	perProjectMaxPct: 40,
	tierCaps: { T1: null, T2: 20, T3: 5 },
};

function loadNightShiftConfig(): NightShiftConfig {
	try {
		const raw = fs.readFileSync(NIGHTSHIFT_CONFIG_PATH, "utf-8");
		const parsed = JSON.parse(raw) as Partial<NightShiftConfig>;
		return { ...DEFAULT_NIGHTSHIFT_CONFIG, ...parsed };
	} catch {
		return { ...DEFAULT_NIGHTSHIFT_CONFIG };
	}
}

function isStewardHealthy(): boolean {
	try {
		const stat = fs.statSync(STEWARD_CONFIG_PATH);
		return Date.now() - stat.mtimeMs <= STEWARD_HEALTHY_WINDOW_MS;
	} catch {
		return false;
	}
}

/** Run a shell command and return stdout (trimmed). Returns "" on error. */
async function shell(cmd: string): Promise<string> {
	try {
		const proc = Bun.spawn(["cmd", "/c", cmd], {
			stdout: "pipe",
			stderr: "pipe",
		});
		await proc.exited;
		return (await new Response(proc.stdout).text()).trim();
	} catch {
		return "";
	}
}

interface GatheredState {
	gitStatus: string;
	branch: string;
	branches: string[];
	weeklyBurnPct: number;
	eligibleCount: number;
	stewardHealthy: boolean;
	config: NightShiftConfig;
	allEligible: { recs: QueueItemInput[]; todos: QueueItemInput[] };
}

async function gatherState(): Promise<GatheredState> {
	const [gitStatus, branch, branchesRaw] = await Promise.all([
		shell("git -C C:/Claude/Agency status --porcelain"),
		shell("git -C C:/Claude/Agency rev-parse --abbrev-ref HEAD"),
		shell("git -C C:/Claude/Agency branch --list nightshift/*"),
	]);

	const branches = branchesRaw
		.split("\n")
		.map((b) => b.trim().replace(/^\*\s*/, ""))
		.filter(Boolean);

	const config = loadNightShiftConfig();
	const stewardHealthy = isStewardHealthy();

	// Scan for overnight_eligible items
	const hqDir = findHqDir() ?? "C:/Claude/Agency/hq-data";
	const projectsDir = path.join(hqDir, "projects");

	const recs: QueueItemInput[] = [];
	const todos: QueueItemInput[] = [];

	try {
		const slugs = fs.readdirSync(projectsDir).filter((d) => {
			try { return fs.statSync(path.join(projectsDir, d)).isDirectory(); }
			catch { return false; }
		});

		for (const slug of slugs) {
			// Scan recommendations
			const recsDir = path.join(projectsDir, slug, "recommendations");
			try {
				const files = fs.readdirSync(recsDir).filter((f) => f.endsWith(".json"));
				for (const file of files) {
					const filePath = path.join(recsDir, file);
					const data = readJsonSafe(filePath);
					if (data?.overnight_eligible === true) {
						recs.push({ ...data, _filePath: filePath, project: data.project ?? slug });
					}
				}
			} catch { /* recs dir may not exist */ }

			// Scan todo.json
			const todoPath = path.join(projectsDir, slug, "todo.json");
			const todoData = readJsonSafe(todoPath);
			if (Array.isArray(todoData)) {
				for (const item of todoData) {
					if (item?.overnight_eligible === true) {
						todos.push({ ...item, _filePath: todoPath, project: item.project ?? slug });
					}
				}
			} else if (todoData && typeof todoData === "object") {
				// Some todo.json files are wrapped objects
				const items = todoData.items ?? todoData.todos ?? [];
				if (Array.isArray(items)) {
					for (const item of items) {
						if (item?.overnight_eligible === true) {
							todos.push({ ...item, _filePath: todoPath, project: item.project ?? slug });
						}
					}
				}
			}
		}
	} catch { /* projectsDir missing */ }

	// Compute weekly burn pct from metering
	let weeklyBurnPct = 0;
	try {
		const meteringDir = path.join(hqDir, "metering");
		const budgetsPath = path.join(meteringDir, "budgets.json");
		const budgets = readJsonSafe(budgetsPath);
		const weeklyClaudeLimit = budgets?.weekly?.claude?.tokenLimit ?? 0;

		if (weeklyClaudeLimit > 0) {
			// Sum last 7 days of metering files
			let weeklyUsed = 0;
			const today = new Date();
			for (let i = 0; i < 7; i++) {
				const d = new Date(today);
				d.setDate(today.getDate() - i);
				const dateStr = d.toISOString().slice(0, 10);
				const dayFile = path.join(meteringDir, `${dateStr}.json`);
				const records = readJsonSafe(dayFile);
				if (Array.isArray(records)) {
					for (const r of records) {
						if (r?.provider === "claude" && typeof r?.tokens?.total === "number") {
							weeklyUsed += r.tokens.total;
						}
					}
				}
			}
			weeklyBurnPct = Math.round((weeklyUsed / weeklyClaudeLimit) * 100);
		}
	} catch { /* metering not available */ }

	return {
		gitStatus,
		branch,
		branches,
		weeklyBurnPct,
		eligibleCount: recs.length + todos.length,
		stewardHealthy,
		config,
		allEligible: { recs, todos },
	};
}

// ─── Narration types and helper ───────────────────────────────────────────────

/**
 * A Claude runner dependency — a simple async function that takes a prompt
 * string and returns Claude's text response. `(prompt: string) => Promise<string>`
 * is enough for both the real ClaudeBrain.reason() wrapper and test stubs.
 */
export type ClaudeRunner = (prompt: string) => Promise<string>;

/**
 * Describes a task that was parked (failed/blocked) during a Night Shift run.
 * Passed to `narrateParkedReason` so Claude can produce a human-readable explanation.
 */
export interface ParkedOutcome {
	/** Human-readable title or file path of the task */
	title: string;
	/** Tier at which the task was queued (T1/T2/T3) */
	tier: Tier;
	/** Mechanical park status string, e.g. "blocked-verifier", "failed", "error" */
	status: string;
	/** Last 200 lines of verifier / agent output, if captured */
	verifierOutput?: string;
}

/**
 * Generate a 2-sentence developer-readable explanation for why a task parked.
 * Best-effort — falls back to the mechanical status string if the inline Claude
 * call fails or times out (30s cap by default, 200-token response).
 *
 * Pure-ish: takes a Claude runner as a dep so tests can stub it.
 */
export async function narrateParkedReason(
	outcome: ParkedOutcome,
	claudeRunner: ClaudeRunner,
	options?: { timeoutMs?: number; maxTokens?: number },
): Promise<string> {
	const { title, tier, status, verifierOutput } = outcome;
	const timeoutMs = options?.timeoutMs ?? 30_000;

	const prompt = `The following Night Shift task was attempted by a Council agent and parked:

- Title: ${title}
- Tier: ${tier}
- Mechanical status: ${status}
- Verifier output (last 200 lines):
\`\`\`
${verifierOutput || "(no verifier output captured)"}
\`\`\`

Write exactly 2 sentences a developer can read at 7am. Be specific about what failed and what would unblock it. Don't speculate beyond the output you have. Don't include any preamble — just the 2 sentences.`;

	const timeoutPromise = new Promise<"timeout">((resolve) =>
		setTimeout(() => resolve("timeout"), timeoutMs),
	);

	try {
		const raceResult = await Promise.race([claudeRunner(prompt), timeoutPromise]);
		if (raceResult === "timeout") {
			console.warn(`[nightshift-foreman] narrateParkedReason timed out for "${title}", falling back to mechanical status`);
			return status;
		}
		const text = (raceResult as string).trim();
		if (!text) return status;
		// Trim to a reasonable length (keep ~3 sentences max, hard cap at 800 chars)
		return text.length > 800 ? text.slice(0, 800) : text;
	} catch (err) {
		console.warn(`[nightshift-foreman] narrateParkedReason failed for "${title}":`, (err as Error).message, "— falling back to mechanical status");
		return status;
	}
}

// ─── ref_id derivation ───────────────────────────────────────────────────────

/**
 * Derive the ref_id (STEWARD_PARENT_* value) for a queue item.
 *
 * For recs:  prefer the `id` field on the item; if absent, derive from the
 *            filename stem (e.g. "ARE-018-v1-studio-producer-card-ledger").
 * For todos: use the `id` field directly (e.g. "todo-002").
 * Returns undefined when the id can't be determined (ad-hoc dispatches).
 */
export function deriveRefId(item: QueueItem): string | undefined {
	// Prefer explicit id field on the source JSON
	const explicit = (item.ref as any).id;
	if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

	// For recs, fall back to the filename stem
	if (item.source === "rec") {
		const stem = path.basename(item.ref._filePath, ".json");
		if (stem) return stem;
	}

	return undefined;
}

// ─── Abort flag helpers ───────────────────────────────────────────────────────

/**
 * Returns the path to the abort flag file for the given hq-data directory.
 */
function abortFlagPath(dataDir: string): string {
	return path.join(dataDir, ".nightshift", "abort.flag");
}

/**
 * Check whether an abort flag is present in the given hq-data directory.
 * Pure function — no side effects.
 *
 * Exported so tests can exercise it directly without spawning a full run.
 */
export function checkAbortFlag(dataDir: string): boolean {
	try {
		return fs.existsSync(abortFlagPath(dataDir));
	} catch {
		return false;
	}
}

/**
 * Clear a stale abort flag from a previous run. Best-effort — ENOENT is silently
 * ignored; any other error is logged but does not stop the run.
 */
export function clearAbortFlag(dataDir: string): void {
	const flagPath = abortFlagPath(dataDir);
	try {
		fs.unlinkSync(flagPath);
		console.log("[nightshift-foreman] Cleared stale abort flag from previous run.");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			console.warn("[nightshift-foreman] Could not clear abort flag (ignoring):", (err as Error).message);
		}
		// ENOENT = no stale flag; that's fine
	}
}

// ─── Run log writer ───────────────────────────────────────────────────────────

/**
 * A single dispatched task entry in the Night Shift run log.
 *
 * `parkedReason` is populated when `status` is a park-class value
 * ("failed", "error", "blocked-verifier", "blocked-overrun", "blocked-needs-human").
 * It contains a 2-sentence developer-readable explanation generated by an inline
 * Claude call. Falls back to the mechanical `status` string if the call fails or
 * times out.
 *
 * `ref_id` matches the value passed as `STEWARD_PARENT_REC` or `STEWARD_PARENT_TODO`
 * to the dispatched agent. The dashboard uses this to look up agent substep traces
 * from the `steward:status` heartbeat's `agentTodos.byParent` map.
 */
interface DispatchedEntry {
	tier: Tier;
	filePath: string;
	/** The recommendation or todo id used as the STEWARD_PARENT_* env var for this dispatch.
	 *  Undefined for ad-hoc dispatches. The dashboard NightShiftReview uses this as the key
	 *  into agentTodos.byParent to render per-outcome substep traces. */
	ref_id?: string;
	project: string;
	status: string;
	output?: string;
	/** Claude-written 2-sentence explanation of why this task was parked, if applicable */
	parkedReason?: string;
}

interface RunLogEntry {
	date: string;
	startedAt: string;
	preflight: PreflightResult;
	queue: QueueItem[];
	dispatched: DispatchedEntry[];
	summary: string;
	/** Whether the run was cut short by an abort flag. */
	aborted: boolean;
	/** ISO-8601 timestamp of when the abort was detected, if applicable. */
	aborted_at?: string;
	/** Number of queued items that were not dispatched because the run was aborted. */
	skipped_count: number;
}

function writeRunLog(entry: RunLogEntry): void {
	const hqDir = findHqDir() ?? "C:/Claude/Agency/hq-data";
	const runsDir = path.join(hqDir, ".nightshift", "runs");
	try {
		fs.mkdirSync(runsDir, { recursive: true });
		const logPath = path.join(runsDir, `${entry.date}.json`);
		fs.writeFileSync(logPath, JSON.stringify(entry, null, 2), "utf-8");
	} catch (err) {
		console.error("[nightshift-foreman] Failed to write run log:", (err as Error).message);
	}
}

// ─── FridayTool: nightshift.dry_run ──────────────────────────────────────────

export const nightshiftDryRunTool: FridayTool = {
	name: "nightshift.dry_run",
	description:
		"Compute the queue Night Shift would run tonight without dispatching. Returns preflight result + planned queue.",
	parameters: [],
	clearance: ["read-fs"],
	async execute(_args, _ctx): Promise<ToolResult> {
		let state: GatheredState;
		try {
			state = await gatherState();
		} catch (err) {
			return {
				success: false,
				output: "",
				error: `Failed to gather system state: ${(err as Error).message}`,
			};
		}

		const hqDir = findHqDir() ?? "C:/Claude/Agency/hq-data";
		let diskFreeBytes: number | null = null;
		let gpuTempC: number | null = null;
		try { diskFreeBytes = getDiskFreeBytes(hqDir); } catch { /* best-effort */ }
		try { gpuTempC = getGpuTempC(); } catch { /* best-effort */ }

		const preflightState: PreflightState = {
			gitStatus: state.gitStatus,
			branch: state.branch,
			branches: state.branches,
			weeklyBurnPct: state.weeklyBurnPct,
			weeklyHaltThresholdPct: state.config.weeklyHaltThresholdPct ?? 80,
			eligibleCount: state.eligibleCount,
			stewardHealthy: state.stewardHealthy,
			configEnabled: state.config.enabled,
			diskFreeBytes,
			diskMinBytes: 5 * 1024 * 1024 * 1024,
			gpuTempC,
			gpuMaxTempC: 75,
		};

		const preflight = runPreflightChecks(preflightState);

		const queue = computeQueue({
			recs: state.allEligible.recs,
			todos: state.allEligible.todos,
			tierCaps: state.config.tierCaps ?? DEFAULT_NIGHTSHIFT_CONFIG.tierCaps!,
			perProjectMaxPct: state.config.perProjectMaxPct ?? 40,
			perNightTokenCap: state.config.perNightTokenCap ?? 100_000,
		});

		const t1Items = queue.filter((q) => q.tier === "T1");
		const t2t3Items = queue.filter((q) => q.tier !== "T1");
		const totalTokens = queue.reduce((s, q) => s + q.estimatedTokens, 0);

		const summary = [
			`Preflight: ${preflight.passed ? "PASSED" : `FAILED (${preflight.failed.join(", ")})`}`,
			`Queue: ${queue.length} items (${totalTokens.toLocaleString()} estimated tokens)`,
			`  T1 (would dispatch): ${t1Items.length}`,
			`  T2/T3 (phase-deferred in v1): ${t2t3Items.length}`,
		].join("\n");

		// Write preview.json so the dashboard "Tonight's Plan" card can read a cached version.
		const previewData = {
			generated_at: new Date().toISOString(),
			preflight,
			queue: queue.map((q) => ({
				source: q.source,
				tier: q.tier,
				ref: {
					_filePath: q.ref._filePath,
					project: q.ref.project,
					title: (q.ref as any).title ?? q.ref._filePath,
				},
				estimatedTokens: q.estimatedTokens,
				reasonIncluded: q.reasonIncluded,
			})),
			tokens_estimated_total: totalTokens,
			per_project_breakdown: queue.reduce((acc, q) => {
				acc[q.ref.project] = (acc[q.ref.project] ?? 0) + q.estimatedTokens;
				return acc;
			}, {} as Record<string, number>),
		};

		const previewPath = path.join(hqDir, ".nightshift", "preview.json");
		const tmpPath = previewPath + ".tmp";
		try {
			fs.mkdirSync(path.dirname(previewPath), { recursive: true });
			fs.writeFileSync(tmpPath, JSON.stringify(previewData, null, 2) + "\n", "utf-8");
			fs.renameSync(tmpPath, previewPath);
		} catch (err) {
			console.warn(`[nightshift dry_run] failed to write preview.json: ${(err as Error).message}`);
			// Don't throw — the tool's primary job is the return value, not the cache write
		}

		return {
			success: true,
			output: summary,
			artifacts: {
				preflight,
				queue: queue.map((q) => ({
					source: q.source,
					filePath: q.ref._filePath,
					project: q.ref.project,
					tier: q.tier,
					estimatedTokens: q.estimatedTokens,
					reasonIncluded: q.reasonIncluded,
				})),
				summary,
			},
		};
	},
};

// ─── FridayTool: nightshift.run ───────────────────────────────────────────────

export const nightshiftRunTool: FridayTool = {
	name: "nightshift.run",
	description:
		"Run a Night Shift session. v1 dispatches T1 work only. Returns run log.",
	parameters: [
		{
			name: "force",
			type: "boolean",
			description: "Skip pre-flight gates (use carefully)",
			required: false,
		},
	],
	clearance: ["exec-shell", "write-fs"],
	async execute(args, ctx): Promise<ToolResult> {
		const force = args["force"] === true;
		const startedAt = new Date();
		const dateStr = startedAt.toISOString().slice(0, 10);

		let state: GatheredState;
		try {
			state = await gatherState();
		} catch (err) {
			return {
				success: false,
				output: "",
				error: `Failed to gather system state: ${(err as Error).message}`,
			};
		}

		let diskFreeBytesRun: number | null = null;
		let gpuTempCRun: number | null = null;
		try { diskFreeBytesRun = getDiskFreeBytes(findHqDir() ?? "C:/Claude/Agency/hq-data"); } catch { /* best-effort */ }
		try { gpuTempCRun = getGpuTempC(); } catch { /* best-effort */ }

		const preflightState: PreflightState = {
			gitStatus: state.gitStatus,
			branch: state.branch,
			branches: state.branches,
			weeklyBurnPct: state.weeklyBurnPct,
			weeklyHaltThresholdPct: state.config.weeklyHaltThresholdPct ?? 80,
			eligibleCount: state.eligibleCount,
			stewardHealthy: state.stewardHealthy,
			configEnabled: state.config.enabled,
			diskFreeBytes: diskFreeBytesRun,
			diskMinBytes: 5 * 1024 * 1024 * 1024,
			gpuTempC: gpuTempCRun,
			gpuMaxTempC: 75,
		};

		const preflight = runPreflightChecks(preflightState);

		if (!preflight.passed && !force) {
			const logEntry: RunLogEntry = {
				date: dateStr,
				startedAt: startedAt.toISOString(),
				preflight,
				queue: [],
				dispatched: [],
				summary: `Aborted: preflight failed (${preflight.failed.join(", ")})`,
			};
			writeRunLog(logEntry);

			return {
				success: false,
				output: `Night Shift aborted — preflight failed:\n${preflight.failed.map((f) => `  • ${f}: ${preflight.details[f]}`).join("\n")}`,
				error: "Preflight gates failed",
				artifacts: { preflight },
			};
		}

		const queue = computeQueue({
			recs: state.allEligible.recs,
			todos: state.allEligible.todos,
			tierCaps: state.config.tierCaps ?? DEFAULT_NIGHTSHIFT_CONFIG.tierCaps!,
			perProjectMaxPct: state.config.perProjectMaxPct ?? 40,
			perNightTokenCap: state.config.perNightTokenCap ?? 100_000,
		});

		// v1: only dispatch T1 items — T2/T3 are phase-deferred
		const t1Items = queue.filter((q) => q.tier === "T1");
		const phaseDeferredItems = queue.filter((q) => q.tier !== "T1");

		const dispatched: RunLogEntry["dispatched"] = [];

		// ── Abort-flag setup ────────────────────────────────────────────────────
		// Resolve the hq-data dir once for flag checks during the run.
		const hqDirForAbort = findHqDir() ?? "C:/Claude/Agency/hq-data";

		// Clear any stale flag from a previous abort so it doesn't block this run.
		clearAbortFlag(hqDirForAbort);

		// Abort state
		let aborted = false;
		let abortedAt: string | undefined;

		// Best-effort Claude runner for parked-reason narration.
		// Uses `claude -p` non-interactively — same primitive as ClaudeBrain.reason().
		// Defined locally so it composes with narrateParkedReason without importing
		// the full ClaudeBrain class (which carries metering / config overhead we
		// don't need for a single best-effort call).
		const claudeRunnerForNarration: ClaudeRunner = async (prompt: string): Promise<string> => {
			const proc = Bun.spawn(["claude", "-p", prompt], {
				stdout: "pipe",
				stderr: "pipe",
			});
			await proc.exited;
			const stdout = (await new Response(proc.stdout).text()).trim();
			return stdout || "(no output from Claude)";
		};

		// Dispatch T1 items via the existing dispatch_agent tool
		for (const item of t1Items) {
			// ── Abort check between dispatches ────────────────────────────────
			// Check BEFORE accepting a new task so we never start a dispatch that
			// the user has asked us to skip. Already-in-flight dispatches (awaited
			// below) are allowed to finish or hit their own per-task timeout.
			if (checkAbortFlag(hqDirForAbort)) {
				aborted = true;
				abortedAt = new Date().toISOString();
				console.log("[nightshift-foreman] Abort flag detected — stopping new dispatches.");
				break;
			}

			const project = item.ref.project;
			const agentSlug = (item.ref as any).agent_slug ?? (item.ref as any).agent ?? "studio-producer";

			try {
				// TODO(nightshift-v2): Use proper agent selection based on rec type.
				// For v1, we call dispatch_agent with the project + file path as context.
				// The dispatch_agent tool handles the terminal spawn + result watching.
				// This loop is intentionally skeletal — the orchestration wiring for
				// multi-agent overnight runs belongs in nightshift-v2 once the queue
				// schema (agent_slug field on recs/todos) is standardized.
				const result = await dispatchAgent.execute(
					{
						agent: agentSlug,
						project,
						prompt: `Night Shift session (${dateStr}): Process ${item.source} item at ${item.ref._filePath}. Follow your skill file protocol.`,
					},
					ctx,
				);

				const refId = deriveRefId(item);

				if (result.success) {
					dispatched.push({
						tier: item.tier,
						filePath: item.ref._filePath,
						...(refId !== undefined ? { ref_id: refId } : {}),
						project,
						status: "dispatched",
						output: result.output,
					});
				} else {
					// Task was parked — generate a human-readable explanation
					const verifierLines = (result.output ?? "").split("\n").slice(-200).join("\n");
					const parkedReason = await narrateParkedReason(
						{
							title: item.ref._filePath,
							tier: item.tier,
							status: "failed",
							verifierOutput: verifierLines,
						},
						claudeRunnerForNarration,
					);
					dispatched.push({
						tier: item.tier,
						filePath: item.ref._filePath,
						...(refId !== undefined ? { ref_id: refId } : {}),
						project,
						status: "failed",
						output: result.output,
						parkedReason,
					});
				}
			} catch (err) {
				// Task threw — treat as a park, narrate the error
				const errMessage = (err as Error).message;
				const refId = deriveRefId(item);
				const parkedReason = await narrateParkedReason(
					{
						title: item.ref._filePath,
						tier: item.tier,
						status: "error",
						verifierOutput: errMessage,
					},
					claudeRunnerForNarration,
				);
				dispatched.push({
					tier: item.tier,
					filePath: item.ref._filePath,
					...(refId !== undefined ? { ref_id: refId } : {}),
					project,
					status: "error",
					output: errMessage,
					parkedReason,
				});
			}
		}

		// Items not reached because of an abort are counted as skipped.
		// Determine which T1 items never made it into dispatched[].
		const dispatchedFilePaths = new Set(dispatched.map((d) => d.filePath));
		const skippedT1Items = t1Items.filter((item) => !dispatchedFilePaths.has(item.ref._filePath));
		const skippedCount = skippedT1Items.length;

		// Mark T2/T3 as phase-deferred (these are always skipped in v1, not aborted)
		for (const item of phaseDeferredItems) {
			const refId = deriveRefId(item);
			dispatched.push({
				tier: item.tier,
				filePath: item.ref._filePath,
				...(refId !== undefined ? { ref_id: refId } : {}),
				project: item.ref.project,
				status: "phase-deferred",
			});
		}

		const dispatchedCount = dispatched.filter((d) => d.status === "dispatched").length;
		const failedCount = dispatched.filter((d) => d.status === "failed" || d.status === "error").length;
		const deferredCount = dispatched.filter((d) => d.status === "phase-deferred").length;

		const summaryLines = [
			`Night Shift run (${dateStr})`,
			`Preflight: ${preflight.passed ? "PASSED" : "FORCED (skipped)"}`,
			`Queue: ${queue.length} items`,
			`  Dispatched (T1): ${dispatchedCount}`,
			`  Failed: ${failedCount}`,
			`  Phase-deferred (T2/T3, v1): ${deferredCount}`,
		];
		if (aborted) {
			summaryLines.push(`  Skipped (abort): ${skippedCount}`);
			summaryLines.push(`ABORTED at ${abortedAt}`);
		}
		const summary = summaryLines.join("\n");

		const logEntry: RunLogEntry = {
			date: dateStr,
			startedAt: startedAt.toISOString(),
			preflight,
			queue,
			dispatched,
			summary,
			aborted,
			...(abortedAt ? { aborted_at: abortedAt } : {}),
			skipped_count: skippedCount,
		};
		writeRunLog(logEntry);

		return {
			success: true,
			output: summary,
			artifacts: { preflight, queue, dispatched, summary, aborted, skipped_count: skippedCount },
		};
	},
};

// ─── FridayTool: nightshift.abort ────────────────────────────────────────────

export const nightshiftAbortTool: FridayTool = {
	name: "nightshift.abort",
	description:
		"Touch the abort flag to halt an in-flight Night Shift run gracefully. In-flight tasks finish; no new tasks are dispatched after the current one completes.",
	parameters: [],
	clearance: ["write-fs"],
	async execute(_args, _ctx): Promise<ToolResult> {
		const hqDir = findHqDir() ?? "C:/Claude/Agency/hq-data";
		const nightshiftDir = path.join(hqDir, ".nightshift");
		const flagPath = path.join(nightshiftDir, "abort.flag");

		try {
			fs.mkdirSync(nightshiftDir, { recursive: true });
			const timestamp = new Date().toISOString();
			fs.writeFileSync(flagPath, `${timestamp}\n`, "utf-8");

			return {
				success: true,
				output: `Abort flag set at ${flagPath}. In-flight tasks will finish; no new Night Shift dispatches will start.`,
				artifacts: { aborted: true, flagPath, timestamp },
			};
		} catch (err) {
			return {
				success: false,
				output: "",
				error: `Failed to write abort flag: ${(err as Error).message}`,
			};
		}
	},
};

// ─── FridayTool: nightshift.abort_status ─────────────────────────────────────

export const nightshiftAbortStatusTool: FridayTool = {
	name: "nightshift.abort_status",
	description:
		"Check whether an abort flag is currently set and report the last run-log status (aborted vs completed vs unknown).",
	parameters: [],
	clearance: ["read-fs"],
	async execute(_args, _ctx): Promise<ToolResult> {
		const hqDir = findHqDir() ?? "C:/Claude/Agency/hq-data";
		const flagPath = path.join(hqDir, ".nightshift", "abort.flag");

		// 1. Check abort flag
		let flagSet = false;
		let flagSetAt: string | undefined;
		try {
			const stat = fs.statSync(flagPath);
			flagSet = true;
			flagSetAt = stat.mtime.toISOString();
		} catch {
			// ENOENT → flag not set
		}

		// 2. Find latest run log
		let lastRunStatus: "aborted" | "completed" | "unknown" = "unknown";
		let lastRunDate: string | undefined;
		try {
			const runsDir = path.join(hqDir, ".nightshift", "runs");
			const files = fs.readdirSync(runsDir)
				.filter((f) => f.endsWith(".json"))
				.sort()
				.reverse(); // most recent first

			if (files.length > 0) {
				const latestFile = path.join(runsDir, files[0]!);
				const data = readJsonSafe(latestFile);
				lastRunDate = files[0]!.replace(".json", "");
				if (data && typeof data.aborted === "boolean") {
					lastRunStatus = data.aborted ? "aborted" : "completed";
				} else if (data) {
					// Older log without aborted field — treat as completed
					lastRunStatus = "completed";
				}
			}
		} catch {
			// runs dir may not exist yet
		}

		const lines = [
			`Abort flag: ${flagSet ? `SET (since ${flagSetAt})` : "not set"}`,
			`Last run: ${lastRunDate ?? "none"} — ${lastRunStatus}`,
		];

		return {
			success: true,
			output: lines.join("\n"),
			artifacts: { flagSet, flagSetAt, lastRunStatus, lastRunDate },
		};
	},
};

// ─── FridayModule export ──────────────────────────────────────────────────────

// Exported as individual tools for registration in studio/index.ts
// (The studio module is the parent barrel — we add to its tools array there.)
