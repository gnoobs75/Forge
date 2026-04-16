/**
 * Metering writer module — token usage tracking for all AI providers.
 *
 * Provides:
 *   estimateTokens()   — ~4 chars/token heuristic
 *   getTodayFileName() — YYYY-MM-DD.json
 *   getMeteringDir()   — resolve hq-data/metering/ or use override
 *   writeMeterRecord() — append to today's daily file
 *   computeSummary()   — aggregate daily files → MeterSummary
 *   checkBudgets()     — compare summary to budgets.json → BudgetAlert[]
 *   meterRecordId()    — unique meter-YYYY-MM-DD-xxxxxxxx ID
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { findHqDir } from "./hq-utils.ts";
import type { MeterRecord, MeterSummary, ProviderTotals, BudgetConfig } from "./types.ts";

// ─── Public types ──────────────────────────────────────────────────────────────

export interface TokenEstimate {
  input: number;
  output: number;
  total: number;
  estimated: true;
}

export interface BudgetAlert {
  provider: "claude" | "grok" | "groq";
  period: "daily" | "weekly";
  level: "warning" | "critical";
  used: number;
  limit: number;
  pct: number;
  message: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Estimate token counts from character lengths at ~4 chars/token. */
export function estimateTokens(inputChars: number, outputChars: number): TokenEstimate {
  const input = Math.floor(inputChars / CHARS_PER_TOKEN);
  const output = Math.floor(outputChars / CHARS_PER_TOKEN);
  return { input, output, total: input + output, estimated: true };
}

/** Returns today's daily file name: YYYY-MM-DD.json */
export function getTodayFileName(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}.json`;
}

/** Returns ISO date string for a Date: YYYY-MM-DD */
function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Monday 00:00:00.000 local time of the week containing `d`. */
function getMonday(d: Date): Date {
  const result = new Date(d);
  const dow = result.getDay(); // 0=Sun, 1=Mon...
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  result.setDate(result.getDate() - daysFromMonday);
  result.setHours(0, 0, 0, 0);
  return result;
}

/** Generate a unique meter record ID: meter-YYYY-MM-DD-xxxxxxxx */
export function meterRecordId(): string {
  const today = getTodayFileName().replace(".json", "");
  const hex = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `meter-${today}-${hex}`;
}

/** Resolve the metering directory. Uses override if given, else hq-data/metering/. */
export function getMeteringDir(overrideDir?: string): string | null {
  if (overrideDir) return overrideDir;
  const hqDir = findHqDir();
  if (!hqDir) return null;
  return path.join(hqDir, "metering");
}

/** Read a JSON array from a daily metering file, returning [] on missing/corrupt. */
function readDailyFile(filePath: string): MeterRecord[] {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Writer ───────────────────────────────────────────────────────────────────

/**
 * Append a MeterRecord to today's daily file in the metering directory.
 * Creates the directory and file if they don't exist.
 */
export function writeMeterRecord(record: MeterRecord, meteringDir?: string): void {
  const dir = meteringDir ?? getMeteringDir();
  if (!dir) return;

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // already exists
  }

  const filePath = path.join(dir, getTodayFileName());
  const existing = readDailyFile(filePath);
  existing.push(record);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), "utf-8");
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function emptyProviderTotals(): ProviderTotals {
  return { input: 0, output: 0, total: 0, sessions: 0 };
}

function addToTotals(totals: ProviderTotals, record: MeterRecord): void {
  totals.input += record.tokens.input;
  totals.output += record.tokens.output;
  totals.total += record.tokens.total;
  totals.sessions += 1;
}

/**
 * Compute a MeterSummary by reading all daily JSON files in meteringDir.
 * Summary is NOT persisted — computed on demand.
 */
export function computeSummary(meteringDir?: string): MeterSummary {
  const dir = meteringDir ?? getMeteringDir();

  const today = new Date();
  const todayStr = toDateString(today);
  const monday = getMonday(today);

  const summary: MeterSummary = {
    today: {
      date: todayStr,
      claude: emptyProviderTotals(),
      grok: emptyProviderTotals(),
      groq: emptyProviderTotals(),
    },
    thisWeek: {
      claude: emptyProviderTotals(),
      grok: emptyProviderTotals(),
      groq: emptyProviderTotals(),
    },
    byAgent: {},
    byProject: {},
    byFeature: [],
    automation: { claude: 0, grok: 0, sessions: 0 },
  };

  if (!dir) return summary;

  // Read all daily JSON files in the directory
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  } catch {
    return summary;
  }

  // Feature accumulator: linkId → { linkType, project, totalTokens, stages }
  const featureMap = new Map<string, {
    linkId: string;
    linkType: string;
    title: string;
    project: string;
    totalTokens: number;
    stages: Record<string, number>;
  }>();

  for (const fileName of files) {
    const fileDateStr = fileName.replace(".json", "");
    const fileDate = new Date(`${fileDateStr}T00:00:00`);

    const isToday = fileDateStr === todayStr;
    const isThisWeek = fileDate >= monday;

    if (!isToday && !isThisWeek) continue; // skip older files we don't need

    const records = readDailyFile(path.join(dir, fileName));

    for (const record of records) {
      const provider = record.provider;

      // Today
      if (isToday && (provider === "claude" || provider === "grok" || provider === "groq")) {
        addToTotals(summary.today[provider], record);
      }

      // This week
      if (isThisWeek && (provider === "claude" || provider === "grok" || provider === "groq")) {
        addToTotals(summary.thisWeek[provider], record);
      }

      // byAgent
      if (record.agentSlug) {
        const key = record.agentSlug;
        if (!summary.byAgent[key]) {
          summary.byAgent[key] = { claude: 0, grok: 0, sessions: 0 };
        }
        if (provider === "claude") summary.byAgent[key].claude += record.tokens.total;
        else if (provider === "grok" || provider === "groq") summary.byAgent[key].grok += record.tokens.total;
        summary.byAgent[key].sessions += 1;
      }

      // byProject
      if (record.project) {
        const key = record.project;
        if (!summary.byProject[key]) {
          summary.byProject[key] = { claude: 0, grok: 0, sessions: 0 };
        }
        if (provider === "claude") summary.byProject[key].claude += record.tokens.total;
        else if (provider === "grok" || provider === "groq") summary.byProject[key].grok += record.tokens.total;
        summary.byProject[key].sessions += 1;
      }

      // byFeature
      if (record.linkId && record.linkType) {
        const key = record.linkId;
        if (!featureMap.has(key)) {
          featureMap.set(key, {
            linkId: record.linkId,
            linkType: record.linkType,
            title: record.linkId,
            project: record.project ?? "",
            totalTokens: 0,
            stages: {},
          });
        }
        const entry = featureMap.get(key)!;
        entry.totalTokens += record.tokens.total;
        const stageKey = record.source;
        entry.stages[stageKey] = (entry.stages[stageKey] ?? 0) + record.tokens.total;
      }

      // Automation
      if (record.source === "automation") {
        if (provider === "claude") summary.automation.claude += record.tokens.total;
        else if (provider === "grok" || provider === "groq") summary.automation.grok += record.tokens.total;
        summary.automation.sessions += 1;
      }
    }
  }

  summary.byFeature = Array.from(featureMap.values());
  return summary;
}

// ─── Budget Checks ────────────────────────────────────────────────────────────

/**
 * Compare current usage summary against budgets.json.
 * Returns an array of BudgetAlert for any threshold crossed.
 */
export function checkBudgets(meteringDir?: string): BudgetAlert[] {
  const dir = meteringDir ?? getMeteringDir();
  if (!dir) return [];

  // Load budgets
  const budgetsPath = path.join(dir, "budgets.json");
  let budgets: BudgetConfig;
  try {
    budgets = JSON.parse(fs.readFileSync(budgetsPath, "utf-8")) as BudgetConfig;
  } catch {
    return [];
  }

  const summary = computeSummary(dir);
  const alerts: BudgetAlert[] = [];

  type ProviderKey = "claude" | "grok";

  function check(
    provider: ProviderKey,
    period: "daily" | "weekly",
    used: number,
    limit: number,
    warnAt: number,
  ): void {
    if (limit <= 0) return;
    const pct = used / limit;
    if (pct >= 1.0) {
      alerts.push({
        provider,
        period,
        level: "critical",
        used,
        limit,
        pct,
        message: `${provider} ${period} token limit reached: ${used.toLocaleString()} / ${limit.toLocaleString()} (${Math.round(pct * 100)}%)`,
      });
    } else if (pct >= warnAt) {
      alerts.push({
        provider,
        period,
        level: "warning",
        used,
        limit,
        pct,
        message: `${provider} ${period} token usage at ${Math.round(pct * 100)}%: ${used.toLocaleString()} / ${limit.toLocaleString()}`,
      });
    }
  }

  // Daily checks
  const dc = budgets.daily.claude;
  const dg = budgets.daily.grok;
  check("claude", "daily", summary.today.claude.total, dc.tokenLimit, dc.warnAt);
  check("grok", "daily", summary.today.grok.total + summary.today.groq.total, dg.tokenLimit, dg.warnAt);

  // Weekly checks
  const wc = budgets.weekly.claude;
  const wg = budgets.weekly.grok;
  check("claude", "weekly", summary.thisWeek.claude.total, wc.tokenLimit, wc.warnAt);
  check("grok", "weekly", summary.thisWeek.grok.total + summary.thisWeek.groq.total, wg.tokenLimit, wg.warnAt);

  return alerts;
}
