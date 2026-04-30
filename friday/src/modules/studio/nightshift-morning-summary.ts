/**
 * nightshift.morning_summary — 2-sentence recap of last night's Night Shift run
 *
 * Two pure functions (formatSummary, readLatestRunLog) plus a FridayTool wrapper.
 * Handles both the spec's RunLog shape (outcomes[]) and the foreman's RunLogEntry
 * shape (dispatched[]) via normalization in readLatestRunLog.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { FridayTool, ToolResult } from "../types.ts";
import { findHqDir } from "./hq-utils.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Tier = "T1" | "T2" | "T3";

export type OutcomeStatus =
  | "success"
  | "parked"
  | "phase-deferred"
  | "blocked-overrun"
  | "blocked-verifier"
  | "blocked-needs-human"
  // Foreman RunLogEntry statuses (v1 compat)
  | "dispatched"
  | "failed"
  | "error"
  | string;

export interface Outcome {
  /** Path to the recommendation or todo file that was processed. */
  ref_filePath: string;
  tier: Tier;
  status: OutcomeStatus;
  commit?: string;
  tokens_used?: number;
  /** Mechanical reason string */
  reason?: string;
  /** Friday-narrated 2-sentence parked explanation (CF·T1) */
  parkedReason?: string;
}

export interface RunLog {
  started_at: string;
  ended_at: string;
  branch: string;
  preflight: {
    passed: boolean;
    failed: string[];
    details: Record<string, string>;
  };
  queue: Array<{
    source: string;
    tier: string;
    ref: unknown;
    estimatedTokens: number;
    reasonIncluded: string;
  }>;
  outcomes: Outcome[];
  tokens_total: number;
  tokens_cap: number;
  aborted: boolean;
  aborted_at?: string;
  skipped_count: number;
}

// ─── Normalizer: foreman RunLogEntry → RunLog ─────────────────────────────────

/**
 * The foreman (nightshift-foreman.ts) writes `dispatched[]` entries with
 * `filePath` (not `ref_filePath`) and a slightly different status vocabulary.
 * This function normalizes either shape to the canonical RunLog type.
 */
function normalizeRunLog(raw: Record<string, unknown>): RunLog {
  // If it already has an `outcomes` array, it's the canonical RunLog shape.
  if (Array.isArray(raw.outcomes)) {
    return raw as unknown as RunLog;
  }

  // Normalize the foreman's RunLogEntry shape.
  const dispatched = Array.isArray(raw.dispatched) ? (raw.dispatched as Array<Record<string, unknown>>) : [];

  const outcomes: Outcome[] = dispatched.map((d) => {
    const rawStatus = String(d.status ?? "unknown");
    let status: OutcomeStatus;

    // Map foreman statuses → canonical statuses
    switch (rawStatus) {
      case "dispatched":
        status = "success";
        break;
      case "phase-deferred":
        status = "phase-deferred";
        break;
      case "failed":
      case "error":
        status = "parked";
        break;
      default:
        status = rawStatus as OutcomeStatus;
    }

    return {
      ref_filePath: String(d.filePath ?? ""),
      tier: (d.tier as Tier) ?? "T1",
      status,
      parkedReason: typeof d.parkedReason === "string" ? d.parkedReason : undefined,
      reason: typeof d.output === "string" ? d.output.slice(0, 200) : undefined,
    };
  });

  // Derive started_at / ended_at from foreman fields
  const startedAt = typeof raw.startedAt === "string" ? raw.startedAt : new Date().toISOString();
  const endedAt = typeof raw.endedAt === "string" ? raw.endedAt : startedAt;

  return {
    started_at: startedAt,
    ended_at: endedAt,
    branch: typeof raw.branch === "string" ? raw.branch : "",
    preflight: (raw.preflight as RunLog["preflight"]) ?? { passed: true, failed: [], details: {} },
    queue: Array.isArray(raw.queue) ? (raw.queue as RunLog["queue"]) : [],
    outcomes,
    tokens_total: typeof raw.tokens_total === "number" ? raw.tokens_total : 0,
    tokens_cap: typeof raw.tokens_cap === "number" ? raw.tokens_cap : 0,
    aborted: raw.aborted === true,
    aborted_at: typeof raw.aborted_at === "string" ? raw.aborted_at : undefined,
    skipped_count: typeof raw.skipped_count === "number" ? raw.skipped_count : 0,
  };
}

// ─── Pure: pick the top parked item ──────────────────────────────────────────

/** Tier rank for sorting (higher = more urgent). */
const TIER_RANK: Record<Tier, number> = { T3: 3, T2: 2, T1: 1 };

/**
 * Given a list of parked outcomes, return the one with the highest tier.
 * Ties broken by shortest parkedReason (= more decisive) then first in list.
 */
function pickTopParked(parked: Outcome[]): Outcome | null {
  if (parked.length === 0) return null;

  return [...parked].sort((a, b) => {
    // Higher tier wins
    const tierDiff = (TIER_RANK[b.tier] ?? 0) - (TIER_RANK[a.tier] ?? 0);
    if (tierDiff !== 0) return tierDiff;

    // Tie: shorter parkedReason wins (more decisive)
    const aLen = a.parkedReason?.length ?? Infinity;
    const bLen = b.parkedReason?.length ?? Infinity;
    return aLen - bLen;
  })[0];
}

/** Whether a status represents a "parked" outcome. */
function isParked(status: OutcomeStatus): boolean {
  return (
    status === "parked" ||
    status === "blocked-overrun" ||
    status === "blocked-verifier" ||
    status === "blocked-needs-human"
  );
}

/** Whether a status represents a "deferred" outcome. */
function isDeferred(status: OutcomeStatus): boolean {
  return status === "phase-deferred";
}

/** Whether a status represents a "success" outcome. */
function isSuccess(status: OutcomeStatus): boolean {
  return status === "success";
}

// ─── Pure: formatSummary ──────────────────────────────────────────────────────

/**
 * Build a 2-sentence summary from a Night Shift run log (or null).
 *
 * Cases handled:
 *   - null                  → no run log found
 *   - preflight failed      → preflight-failed message with gate names
 *   - aborted run           → aborted message with time + skipped count
 *   - clean night           → shipped/parked/deferred counts + "Nothing needs your eyes"
 *   - parked items present  → counts + top parked item's parkedReason
 */
export function formatSummary(log: RunLog | null): string {
  // Case: no log at all
  if (log === null) {
    return "No Night Shift run log found for last night. Either nothing ran, or the log is missing.";
  }

  // Case: preflight failed (nothing ran)
  if (!log.preflight.passed && log.outcomes.length === 0) {
    const gates = log.preflight.failed.length > 0
      ? log.preflight.failed.join(", ")
      : "unknown gates";
    return `Night Shift didn't run last night — preflight failed: ${gates}.`;
  }

  // Count outcomes by category
  const shipped = log.outcomes.filter((o) => isSuccess(o.status)).length;
  const parkedOutcomes = log.outcomes.filter((o) => isParked(o.status));
  const parkedCount = parkedOutcomes.length;
  const deferredCount = log.outcomes.filter((o) => isDeferred(o.status)).length;

  // Case: aborted run
  if (log.aborted) {
    const abortTime = log.aborted_at
      ? formatTime(log.aborted_at)
      : "an unknown time";
    const skipped = log.skipped_count ?? 0;
    const sentence1 = `Last night was aborted at ${abortTime} after shipping ${shipped}, parking ${parkedCount}.`;
    const sentence2 = skipped > 0
      ? `Skipped ${skipped} queued item${skipped === 1 ? "" : "s"}.`
      : "No queued items were skipped.";
    return `${sentence1} ${sentence2}`;
  }

  // Normal run — sentence 1: counts
  const sentence1 = `Last night I shipped ${shipped}, parked ${parkedCount}, deferred ${deferredCount}.`;

  // Sentence 2: either highlight top parked item or give the all-clear
  if (parkedCount === 0 && deferredCount === 0) {
    return `${sentence1} Nothing needs your eyes.`;
  }

  if (parkedCount > 0) {
    const top = pickTopParked(parkedOutcomes);
    const blurb = top?.parkedReason?.trim() || "unspecified parked item";
    return `${sentence1} Top priority for review: ${blurb}`;
  }

  // Only deferred, no parked — let them know it's clean
  return `${sentence1} All deferrals are T2/T3 phase-deferred — nothing needs immediate review.`;
}

// ─── Helper: format aborted_at time ──────────────────────────────────────────

/**
 * Format an ISO-8601 timestamp to a human-friendly time string like "02:14am".
 * Falls back to the raw string if parsing fails.
 */
function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes().toString().padStart(2, "0");
    const ampm = h < 12 ? "am" : "pm";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m}${ampm}`;
  } catch {
    return isoStr;
  }
}

// ─── Pure: readLatestRunLog ───────────────────────────────────────────────────

/**
 * Find the latest run log file in a runs directory.
 * Picks the lexicographically last YYYY-MM-DD.json file (most recent date).
 * Returns the parsed RunLog with a _filename field, or null if none found.
 */
export function readLatestRunLog(
  runsDir: string,
): (RunLog & { _filename: string }) | null {
  let files: string[];
  try {
    files = fs
      .readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
  } catch {
    return null;
  }

  if (files.length === 0) return null;

  // Latest = last in sorted order (YYYY-MM-DD sorts chronologically)
  const latest = files[files.length - 1];
  const filePath = path.join(runsDir, latest);

  let raw: Record<string, unknown>;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    raw = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }

  const normalized = normalizeRunLog(raw);
  return { ...normalized, _filename: latest };
}

// ─── FridayTool ───────────────────────────────────────────────────────────────

export const nightshiftMorningSummaryTool: FridayTool = {
  name: "nightshift.morning_summary",
  description:
    "Two-sentence summary of last night's Night Shift run. Pass voice:true to also speak via Vox.",
  parameters: [
    {
      name: "voice",
      type: "boolean",
      description: "Speak the summary via Vox",
      required: false,
    },
  ],
  clearance: ["read-fs"],
  async execute(args, ctx): Promise<ToolResult> {
    // 1. Find hq-data dir
    const hqDir = findHqDir();
    if (!hqDir) {
      return {
        success: false,
        output: "",
        error: "HQ data directory not found — cannot locate Night Shift run logs",
      };
    }

    // 2. Read latest run log
    const runsDir = path.join(hqDir, ".nightshift", "runs");
    const logWithFilename = readLatestRunLog(runsDir);

    // 3. Build summary
    const summary = formatSummary(logWithFilename);

    // 4. Speak via Vox if requested
    const voiceRequested = args["voice"] === true;
    if (voiceRequested) {
      // TODO(CF·T4-vox): The Vox instance is not yet accessible from tool execute()
      // context. The ctx?.vox path would work if FridayRuntime exposed Vox on the
      // ToolContext. For now, check globalThis.fridayVox as a best-effort bridge —
      // if Friday ever plumbs Vox to tools, update this. Failing gracefully is correct
      // behaviour: the text return is the primary deliverable.
      const vox = (ctx as any)?.vox ?? (globalThis as any).fridayVox;
      if (vox && typeof vox.speak === "function" && vox.mode !== "off") {
        try {
          await (vox.speak(summary) as Promise<void>);
        } catch (err) {
          console.warn(
            "[nightshift.morning_summary] Vox.speak() failed (non-fatal):",
            (err as Error).message,
          );
        }
      } else {
        console.warn(
          "[nightshift.morning_summary] voice:true requested but Vox unavailable or in off mode.",
        );
      }
    }

    // 5. Return
    return {
      success: true,
      output: summary,
      artifacts: {
        filename: logWithFilename?._filename ?? null,
        summary,
      },
    };
  },
};
