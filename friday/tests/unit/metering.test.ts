import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  estimateTokens,
  getTodayFileName,
  writeMeterRecord,
  computeSummary,
  checkBudgets,
  meterRecordId,
} from "../../src/modules/studio/metering.ts";
import type { MeterRecord } from "../../src/modules/studio/types.ts";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "metering-test-"));
}

function makeRecord(overrides: Partial<MeterRecord> = {}): MeterRecord {
  return {
    id: meterRecordId(),
    timestamp: new Date().toISOString(),
    provider: "claude",
    model: "claude-3-5-sonnet",
    source: "agent-dispatch",
    agent: "Market Analyst",
    agentSlug: "market-analyst",
    project: "expedition",
    linkType: null,
    linkId: null,
    tokens: { input: 100, output: 200, total: 300, estimated: false },
    durationMs: 1500,
    status: "completed",
    ...overrides,
  };
}

function makeBudgetsFile(dir: string, overrides: object = {}): void {
  const budgets = {
    daily: {
      claude: { tokenLimit: 500000, warnAt: 0.8 },
      grok: { tokenLimit: 200000, warnAt: 0.8 },
    },
    weekly: {
      claude: { tokenLimit: 2000000, warnAt: 0.8 },
      grok: { tokenLimit: 1000000, warnAt: 0.8 },
    },
    perSession: {
      claude: { tokenLimit: 100000 },
    },
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, "budgets.json"), JSON.stringify(budgets));
}

// ─── estimateTokens ───────────────────────────────────────────────────────────

describe("estimateTokens", () => {
  it("estimates at ~4 chars per token", () => {
    const result = estimateTokens(400, 800);
    expect(result.input).toBe(100);
    expect(result.output).toBe(200);
    expect(result.total).toBe(300);
    expect(result.estimated).toBe(true);
  });

  it("rounds down fractional tokens", () => {
    const result = estimateTokens(10, 10);
    expect(result.input).toBe(2);   // floor(10/4)=2
    expect(result.output).toBe(2);
    expect(result.total).toBe(4);
  });

  it("handles zero input and output", () => {
    const result = estimateTokens(0, 0);
    expect(result.input).toBe(0);
    expect(result.output).toBe(0);
    expect(result.total).toBe(0);
    expect(result.estimated).toBe(true);
  });

  it("handles zero output only", () => {
    const result = estimateTokens(400, 0);
    expect(result.input).toBe(100);
    expect(result.output).toBe(0);
    expect(result.total).toBe(100);
  });
});

// ─── getTodayFileName ─────────────────────────────────────────────────────────

describe("getTodayFileName", () => {
  it("returns a YYYY-MM-DD.json format string", () => {
    const name = getTodayFileName();
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("matches today's date", () => {
    const name = getTodayFileName();
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    expect(name).toBe(`${year}-${month}-${day}.json`);
  });
});

// ─── meterRecordId ────────────────────────────────────────────────────────────

describe("meterRecordId", () => {
  it("returns a string starting with meter-", () => {
    const id = meterRecordId();
    expect(id).toMatch(/^meter-\d{4}-\d{2}-\d{2}-[a-f0-9]{8}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 20 }, () => meterRecordId()));
    expect(ids.size).toBe(20);
  });
});

// ─── writeMeterRecord ─────────────────────────────────────────────────────────

describe("writeMeterRecord", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the daily file on first write", () => {
    const record = makeRecord();
    writeMeterRecord(record, tmpDir);

    const today = getTodayFileName();
    const filePath = path.join(tmpDir, today);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("writes a valid JSON array with the record", () => {
    const record = makeRecord();
    writeMeterRecord(record, tmpDir);

    const today = getTodayFileName();
    const contents = JSON.parse(fs.readFileSync(path.join(tmpDir, today), "utf-8"));
    expect(Array.isArray(contents)).toBe(true);
    expect(contents).toHaveLength(1);
    expect(contents[0].id).toBe(record.id);
    expect(contents[0].provider).toBe("claude");
  });

  it("appends multiple records to the same daily file", () => {
    const r1 = makeRecord({ id: "meter-2026-03-16-aaaaaa01" });
    const r2 = makeRecord({ id: "meter-2026-03-16-aaaaaa02", provider: "grok" });
    const r3 = makeRecord({ id: "meter-2026-03-16-aaaaaa03", provider: "groq" });

    writeMeterRecord(r1, tmpDir);
    writeMeterRecord(r2, tmpDir);
    writeMeterRecord(r3, tmpDir);

    const today = getTodayFileName();
    const contents = JSON.parse(fs.readFileSync(path.join(tmpDir, today), "utf-8"));
    expect(contents).toHaveLength(3);
    expect(contents[0].id).toBe(r1.id);
    expect(contents[1].id).toBe(r2.id);
    expect(contents[2].id).toBe(r3.id);
  });

  it("preserves all record fields correctly", () => {
    const record = makeRecord({
      linkType: "recommendation",
      linkId: "rec-abc123",
      tokens: { input: 500, output: 1000, total: 1500, estimated: true },
      durationMs: 3200,
      status: "completed",
    });
    writeMeterRecord(record, tmpDir);

    const today = getTodayFileName();
    const contents = JSON.parse(fs.readFileSync(path.join(tmpDir, today), "utf-8"));
    const saved = contents[0];
    expect(saved.linkType).toBe("recommendation");
    expect(saved.linkId).toBe("rec-abc123");
    expect(saved.tokens.input).toBe(500);
    expect(saved.tokens.total).toBe(1500);
    expect(saved.tokens.estimated).toBe(true);
    expect(saved.durationMs).toBe(3200);
  });
});

// ─── computeSummary ───────────────────────────────────────────────────────────

describe("computeSummary", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns zero totals when no daily files exist", () => {
    const summary = computeSummary(tmpDir);
    expect(summary.today.claude.total).toBe(0);
    expect(summary.today.grok.total).toBe(0);
    expect(summary.today.groq.total).toBe(0);
    expect(summary.today.claude.sessions).toBe(0);
  });

  it("computes today totals from written records", () => {
    const claudeRecord = makeRecord({
      provider: "claude",
      tokens: { input: 1000, output: 2000, total: 3000, estimated: false },
    });
    const grokRecord = makeRecord({
      provider: "grok",
      tokens: { input: 500, output: 500, total: 1000, estimated: false },
    });
    writeMeterRecord(claudeRecord, tmpDir);
    writeMeterRecord(grokRecord, tmpDir);

    const summary = computeSummary(tmpDir);
    expect(summary.today.claude.total).toBe(3000);
    expect(summary.today.claude.input).toBe(1000);
    expect(summary.today.claude.output).toBe(2000);
    expect(summary.today.claude.sessions).toBe(1);
    expect(summary.today.grok.total).toBe(1000);
    expect(summary.today.grok.sessions).toBe(1);
    expect(summary.today.groq.total).toBe(0);
  });

  it("accumulates multiple records for same provider", () => {
    writeMeterRecord(makeRecord({ provider: "claude", tokens: { input: 100, output: 200, total: 300, estimated: false } }), tmpDir);
    writeMeterRecord(makeRecord({ provider: "claude", tokens: { input: 200, output: 400, total: 600, estimated: false } }), tmpDir);

    const summary = computeSummary(tmpDir);
    expect(summary.today.claude.total).toBe(900);
    expect(summary.today.claude.sessions).toBe(2);
  });

  it("computes byAgent breakdown", () => {
    writeMeterRecord(makeRecord({
      provider: "claude",
      agent: "Market Analyst",
      agentSlug: "market-analyst",
      tokens: { input: 100, output: 200, total: 300, estimated: false },
    }), tmpDir);
    writeMeterRecord(makeRecord({
      provider: "grok",
      agent: "Market Analyst",
      agentSlug: "market-analyst",
      tokens: { input: 50, output: 50, total: 100, estimated: false },
    }), tmpDir);
    writeMeterRecord(makeRecord({
      provider: "claude",
      agent: "QA Advisor",
      agentSlug: "qa-advisor",
      tokens: { input: 400, output: 800, total: 1200, estimated: false },
    }), tmpDir);

    const summary = computeSummary(tmpDir);
    expect(summary.byAgent["market-analyst"]).toBeDefined();
    expect(summary.byAgent["market-analyst"]!.claude).toBe(300);
    expect(summary.byAgent["market-analyst"]!.grok).toBe(100);
    expect(summary.byAgent["market-analyst"]!.sessions).toBe(2);
    expect(summary.byAgent["qa-advisor"]!.claude).toBe(1200);
    expect(summary.byAgent["qa-advisor"]!.sessions).toBe(1);
  });

  it("computes byProject breakdown", () => {
    writeMeterRecord(makeRecord({
      provider: "claude",
      project: "expedition",
      tokens: { input: 100, output: 200, total: 300, estimated: false },
    }), tmpDir);
    writeMeterRecord(makeRecord({
      provider: "grok",
      project: "ttr-ios",
      tokens: { input: 50, output: 50, total: 100, estimated: false },
    }), tmpDir);

    const summary = computeSummary(tmpDir);
    expect(summary.byProject["expedition"]).toBeDefined();
    expect(summary.byProject["expedition"]!.claude).toBe(300);
    expect(summary.byProject["ttr-ios"]!.grok).toBe(100);
  });

  it("computes automation totals separately", () => {
    writeMeterRecord(makeRecord({
      provider: "claude",
      source: "automation",
      tokens: { input: 200, output: 400, total: 600, estimated: false },
    }), tmpDir);
    writeMeterRecord(makeRecord({
      provider: "grok",
      source: "automation",
      tokens: { input: 100, output: 100, total: 200, estimated: false },
    }), tmpDir);

    const summary = computeSummary(tmpDir);
    expect(summary.automation.claude).toBe(600);
    expect(summary.automation.grok).toBe(200);
    expect(summary.automation.sessions).toBe(2);
  });

  it("includes today's date in summary.today.date", () => {
    const summary = computeSummary(tmpDir);
    expect(summary.today.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("thisWeek aggregates today's records", () => {
    writeMeterRecord(makeRecord({
      provider: "claude",
      tokens: { input: 100, output: 200, total: 300, estimated: false },
    }), tmpDir);

    const summary = computeSummary(tmpDir);
    // thisWeek must be at least as large as today (same day is in the week)
    expect(summary.thisWeek.claude.total).toBeGreaterThanOrEqual(summary.today.claude.total);
    expect(summary.thisWeek.claude.sessions).toBeGreaterThanOrEqual(summary.today.claude.sessions);
  });
});

// ─── checkBudgets ─────────────────────────────────────────────────────────────

describe("checkBudgets", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    makeBudgetsFile(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when well under budget", () => {
    // 10 tokens vs 500000 limit
    writeMeterRecord(makeRecord({
      provider: "claude",
      tokens: { input: 5, output: 5, total: 10, estimated: false },
    }), tmpDir);

    const alerts = checkBudgets(tmpDir);
    expect(alerts).toEqual([]);
  });

  it("returns a warning alert when daily claude crosses warnAt threshold (80%)", () => {
    // tokenLimit = 500000, warnAt = 0.8 → warn at 400000
    // write a record with 410000 tokens
    writeMeterRecord(makeRecord({
      provider: "claude",
      tokens: { input: 200000, output: 210000, total: 410000, estimated: false },
    }), tmpDir);

    const alerts = checkBudgets(tmpDir);
    const warnAlert = alerts.find((a) => a.provider === "claude" && a.period === "daily" && a.level === "warning");
    expect(warnAlert).toBeDefined();
  });

  it("returns a critical alert when daily claude reaches 100% of limit", () => {
    // write 510000 tokens (over 500000 limit)
    writeMeterRecord(makeRecord({
      provider: "claude",
      tokens: { input: 250000, output: 260000, total: 510000, estimated: false },
    }), tmpDir);

    const alerts = checkBudgets(tmpDir);
    const critAlert = alerts.find((a) => a.provider === "claude" && a.period === "daily" && a.level === "critical");
    expect(critAlert).toBeDefined();
  });

  it("returns grok warning when grok daily limit is crossed at 80%", () => {
    // grok daily limit = 200000, warnAt = 0.8 → warn at 160000
    writeMeterRecord(makeRecord({
      provider: "grok",
      tokens: { input: 80000, output: 90000, total: 170000, estimated: false },
    }), tmpDir);

    const alerts = checkBudgets(tmpDir);
    const grokWarn = alerts.find((a) => a.provider === "grok" && a.level === "warning");
    expect(grokWarn).toBeDefined();
  });

  it("returns no alerts when no budgets.json exists", () => {
    const emptyDir = makeTmpDir();
    try {
      const alerts = checkBudgets(emptyDir);
      expect(alerts).toEqual([]);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
