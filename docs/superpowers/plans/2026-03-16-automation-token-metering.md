# Automation + Token Metering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wake up CoE's dormant automation system and add persistent token metering across Claude (estimated), Grok (actual), and Groq (info only) — with a dashboard tab, Friday voice queries, and budget alerts.

**Architecture:** JSON-file-based metering ledger in `hq-data/metering/`. Daily files hold individual records, `summary.json` is a read-time aggregate cache. Five instrumentation points write records: Cortex (Grok), ClaudeBrain (Claude), dispatch-agent (Claude Code), Electron Groq handler, and Electron idea pipeline. Dashboard reads files via chokidar. Friday queries via studio.query.

**Tech Stack:** Bun (Friday runtime), React 18 + Recharts (dashboard), TypeScript, JSON file I/O, chokidar (file watching)

**Spec:** `docs/superpowers/specs/2026-03-16-automation-token-metering-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `hq-data/metering/budgets.json` | Create | Default budget thresholds |
| `friday/src/modules/studio/metering.ts` | Create | `writeMeterRecord()`, `computeSummary()`, `checkBudgets()`, `estimateTokens()` |
| `friday/tests/unit/metering.test.ts` | Create | Unit tests for metering module |
| `friday/src/modules/studio/types.ts` | Modify | Add `MeterRecord` type, extend `DispatchRecord` |
| `friday/src/modules/studio/dispatch-agent.ts` | Modify | Add completedAt, duration, write metering record on completion |
| `friday/src/core/claude-brain.ts` | Modify | Write metering record after subprocess completes |
| `friday/src/core/cortex.ts` | Modify | Write metering record after Grok inference resolves usage |
| `friday/src/modules/studio/query-studio.ts` | Modify | Add metering query keywords and handlers |
| `electron/main.cjs` | Modify | Write Groq metering records, idea pipeline metering |
| `hq-data/automation/schedules.json` | Modify | Enable 3 default schedules |
| `hq-data/automation/chains.json` | Modify | Enable 3 default chains |
| `hq-data/automation/triggers.json` | Modify | Enable 2 default triggers |
| `src/components/dashboard/MeteringPanel.jsx` | Create | Full metering dashboard tab |
| `src/store/useStore.js` | Modify | Add metering state slice + loaders |
| `src/components/dashboard/StudioOverview.jsx` | Modify | Add Metering tab to navigation |

---

## Chunk 1: Metering Core — Types, Writer, Tests

### Task 1: Add metering types to studio types

**Files:**
- Modify: `friday/src/modules/studio/types.ts`

- [ ] **Step 1: Add MeterRecord interface and extend DispatchRecord**

Add after the existing `DispatchRecord` interface (after line 11):

```typescript
export interface MeterRecord {
  id: string;
  timestamp: string;
  provider: "claude" | "grok" | "groq";
  model: string;
  source: "agent-dispatch" | "friday-inference" | "council-chat" | "idea-generation" | "idea-analysis" | "implementation" | "automation";
  agent: string | null;
  agentSlug: string | null;
  project: string | null;
  linkType: "idea" | "recommendation" | "automation" | null;
  linkId: string | null;
  tokens: {
    input: number;
    output: number;
    total: number;
    estimated: boolean;
  };
  durationMs: number;
  status: "completed" | "failed" | "timeout";
}

export interface ProviderTotals {
  input: number;
  output: number;
  total: number;
  sessions: number;
}

export interface MeterSummary {
  today: {
    date: string;
    claude: ProviderTotals;
    grok: ProviderTotals;
    groq: ProviderTotals;
  };
  thisWeek: {
    claude: ProviderTotals;
    grok: ProviderTotals;
    groq: ProviderTotals;
  };
  byAgent: Record<string, { claude: number; grok: number; sessions: number }>;
  byProject: Record<string, { claude: number; grok: number; sessions: number }>;
  byFeature: Array<{
    linkId: string;
    linkType: string;
    title: string;
    project: string;
    totalTokens: number;
    stages: Record<string, number>;
  }>;
  automation: { claude: number; grok: number; sessions: number };
}

export interface BudgetConfig {
  daily: {
    claude: { tokenLimit: number; warnAt: number };
    grok: { tokenLimit: number; warnAt: number };
  };
  weekly: {
    claude: { tokenLimit: number; warnAt: number };
    grok: { tokenLimit: number; warnAt: number };
  };
  perSession: {
    claude: { tokenLimit: number };
  };
}
```

Also add `completedAt` and `durationMs` to `DispatchRecord`:

```typescript
// Add to DispatchRecord interface:
completedAt?: Date;
durationMs?: number;
```

- [ ] **Step 2: Commit**

```bash
git add friday/src/modules/studio/types.ts
git commit -m "feat(metering): add MeterRecord, MeterSummary, BudgetConfig types"
```

### Task 2: Create metering writer module

**Files:**
- Create: `friday/src/modules/studio/metering.ts`
- Create: `hq-data/metering/budgets.json`

- [ ] **Step 1: Create default budgets.json**

Create `hq-data/metering/budgets.json`:

```json
{
  "daily": {
    "claude": { "tokenLimit": 500000, "warnAt": 0.8 },
    "grok": { "tokenLimit": 200000, "warnAt": 0.8 }
  },
  "weekly": {
    "claude": { "tokenLimit": 2000000, "warnAt": 0.8 },
    "grok": { "tokenLimit": 1000000, "warnAt": 0.8 }
  },
  "perSession": {
    "claude": { "tokenLimit": 100000 }
  }
}
```

- [ ] **Step 2: Write failing tests**

Create `friday/tests/unit/metering.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  writeMeterRecord,
  computeSummary,
  checkBudgets,
  estimateTokens,
  getTodayFileName,
} from "../../src/modules/studio/metering.ts";
import type { MeterRecord } from "../../src/modules/studio/types.ts";

const TEST_DIR = join(import.meta.dir, "../../test-metering-tmp");

function makeRecord(overrides: Partial<MeterRecord> = {}): MeterRecord {
  return {
    id: `meter-test-${Date.now()}`,
    timestamp: new Date().toISOString(),
    provider: "claude",
    model: "claude-opus-4-6",
    source: "agent-dispatch",
    agent: "Studio Producer",
    agentSlug: "studio-producer",
    project: "expedition",
    linkType: null,
    linkId: null,
    tokens: { input: 1000, output: 500, total: 1500, estimated: true },
    durationMs: 5000,
    status: "completed",
    ...overrides,
  };
}

describe("estimateTokens", () => {
  it("estimates tokens from char count at ~4 chars per token", () => {
    const result = estimateTokens(4000, 2000);
    expect(result.input).toBe(1000);
    expect(result.output).toBe(500);
    expect(result.total).toBe(1500);
    expect(result.estimated).toBe(true);
  });

  it("handles zero-length input", () => {
    const result = estimateTokens(0, 0);
    expect(result.total).toBe(0);
  });
});

describe("getTodayFileName", () => {
  it("returns YYYY-MM-DD.json format", () => {
    const name = getTodayFileName();
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe("writeMeterRecord", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("creates daily file and appends record", () => {
    const record = makeRecord();
    writeMeterRecord(record, TEST_DIR);

    const todayFile = join(TEST_DIR, getTodayFileName());
    expect(existsSync(todayFile)).toBe(true);

    const data = JSON.parse(readFileSync(todayFile, "utf-8"));
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(record.id);
  });

  it("appends to existing daily file", () => {
    const r1 = makeRecord({ id: "meter-1" });
    const r2 = makeRecord({ id: "meter-2" });
    writeMeterRecord(r1, TEST_DIR);
    writeMeterRecord(r2, TEST_DIR);

    const data = JSON.parse(readFileSync(join(TEST_DIR, getTodayFileName()), "utf-8"));
    expect(data).toHaveLength(2);
  });
});

describe("computeSummary", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("computes today totals from daily file", () => {
    const r1 = makeRecord({ tokens: { input: 1000, output: 500, total: 1500, estimated: true } });
    const r2 = makeRecord({
      provider: "grok",
      tokens: { input: 200, output: 100, total: 300, estimated: false },
    });
    writeMeterRecord(r1, TEST_DIR);
    writeMeterRecord(r2, TEST_DIR);

    const summary = computeSummary(TEST_DIR);
    expect(summary.today.claude.total).toBe(1500);
    expect(summary.today.grok.total).toBe(300);
    expect(summary.today.claude.sessions).toBe(1);
  });

  it("computes byAgent breakdown", () => {
    const r1 = makeRecord({ agentSlug: "studio-producer", tokens: { input: 1000, output: 500, total: 1500, estimated: true } });
    const r2 = makeRecord({ agentSlug: "qa-advisor", tokens: { input: 500, output: 300, total: 800, estimated: true } });
    writeMeterRecord(r1, TEST_DIR);
    writeMeterRecord(r2, TEST_DIR);

    const summary = computeSummary(TEST_DIR);
    expect(summary.byAgent["studio-producer"].claude).toBe(1500);
    expect(summary.byAgent["qa-advisor"].claude).toBe(800);
  });

  it("computes byProject breakdown", () => {
    const r1 = makeRecord({ project: "expedition", tokens: { input: 1000, output: 500, total: 1500, estimated: true } });
    const r2 = makeRecord({ project: "ttr-ios", tokens: { input: 500, output: 300, total: 800, estimated: true } });
    writeMeterRecord(r1, TEST_DIR);
    writeMeterRecord(r2, TEST_DIR);

    const summary = computeSummary(TEST_DIR);
    expect(summary.byProject["expedition"].claude).toBe(1500);
    expect(summary.byProject["ttr-ios"].claude).toBe(800);
  });
});

describe("checkBudgets", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("returns no alerts when under budget", () => {
    const r = makeRecord({ tokens: { input: 100, output: 50, total: 150, estimated: true } });
    writeMeterRecord(r, TEST_DIR);
    const alerts = checkBudgets(TEST_DIR);
    expect(alerts).toHaveLength(0);
  });

  it("returns warning when at 80% of daily budget", () => {
    // Write a record with 400K tokens (80% of 500K default)
    const r = makeRecord({ tokens: { input: 300000, output: 100000, total: 400000, estimated: true } });
    writeMeterRecord(r, TEST_DIR);

    // Write budgets file
    writeFileSync(join(TEST_DIR, "budgets.json"), JSON.stringify({
      daily: { claude: { tokenLimit: 500000, warnAt: 0.8 }, grok: { tokenLimit: 200000, warnAt: 0.8 } },
      weekly: { claude: { tokenLimit: 2000000, warnAt: 0.8 }, grok: { tokenLimit: 1000000, warnAt: 0.8 } },
      perSession: { claude: { tokenLimit: 100000 } },
    }));

    const alerts = checkBudgets(TEST_DIR);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].level).toBe("warning");
    expect(alerts[0].provider).toBe("claude");
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

Run: `cd friday && bun test tests/unit/metering.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement metering module**

Create `friday/src/modules/studio/metering.ts`:

```typescript
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { MeterRecord, MeterSummary, ProviderTotals, BudgetConfig } from "./types.ts";
import { findHqDir } from "./hq-utils.ts";

const CHARS_PER_TOKEN = 4;

export function estimateTokens(
  inputChars: number,
  outputChars: number,
): { input: number; output: number; total: number; estimated: boolean } {
  const input = Math.round(inputChars / CHARS_PER_TOKEN);
  const output = Math.round(outputChars / CHARS_PER_TOKEN);
  return { input, output, total: input + output, estimated: true };
}

export function getTodayFileName(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}.json`;
}

export function getMeteringDir(overrideDir?: string): string {
  if (overrideDir) return overrideDir;
  const hqDir = findHqDir();
  if (!hqDir) throw new Error("Cannot find hq-data directory for metering");
  return join(hqDir, "metering");
}

export function writeMeterRecord(record: MeterRecord, meteringDir?: string): void {
  const dir = getMeteringDir(meteringDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filePath = join(dir, getTodayFileName());
  let records: MeterRecord[] = [];
  if (existsSync(filePath)) {
    try {
      records = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      records = [];
    }
  }
  records.push(record);
  writeFileSync(filePath, JSON.stringify(records, null, 2));
}

function emptyTotals(): ProviderTotals {
  return { input: 0, output: 0, total: 0, sessions: 0 };
}

function getMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function computeSummary(meteringDir?: string): MeterSummary {
  const dir = getMeteringDir(meteringDir);
  const today = getTodayFileName().replace(".json", "");
  const monday = getMonday();

  const summary: MeterSummary = {
    today: { date: today, claude: emptyTotals(), grok: emptyTotals(), groq: emptyTotals() },
    thisWeek: { claude: emptyTotals(), grok: emptyTotals(), groq: emptyTotals() },
    byAgent: {},
    byProject: {},
    byFeature: [],
    automation: { claude: 0, grok: 0, sessions: 0 },
  };

  if (!existsSync(dir)) return summary;

  const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const featureMap = new Map<string, { linkType: string; project: string; totalTokens: number; stages: Record<string, number> }>();

  for (const file of files) {
    const dateStr = file.replace(".json", "");
    const fileDate = new Date(dateStr + "T00:00:00");
    const isToday = dateStr === today;
    const isThisWeek = fileDate >= monday;

    if (!isToday && !isThisWeek) continue;

    let records: MeterRecord[];
    try {
      records = JSON.parse(readFileSync(join(dir, file), "utf-8"));
    } catch {
      continue;
    }

    for (const r of records) {
      const provider = r.provider as "claude" | "grok" | "groq";

      if (isToday) {
        summary.today[provider].input += r.tokens.input;
        summary.today[provider].output += r.tokens.output;
        summary.today[provider].total += r.tokens.total;
        summary.today[provider].sessions += 1;
      }

      if (isThisWeek) {
        summary.thisWeek[provider].input += r.tokens.input;
        summary.thisWeek[provider].output += r.tokens.output;
        summary.thisWeek[provider].total += r.tokens.total;
        summary.thisWeek[provider].sessions += 1;
      }

      // byAgent (today only)
      if (isToday && r.agentSlug) {
        if (!summary.byAgent[r.agentSlug]) {
          summary.byAgent[r.agentSlug] = { claude: 0, grok: 0, sessions: 0 };
        }
        const ag = summary.byAgent[r.agentSlug];
        if (provider === "claude") ag.claude += r.tokens.total;
        if (provider === "grok") ag.grok += r.tokens.total;
        ag.sessions += 1;
      }

      // byProject (today only)
      if (isToday && r.project) {
        if (!summary.byProject[r.project]) {
          summary.byProject[r.project] = { claude: 0, grok: 0, sessions: 0 };
        }
        const pj = summary.byProject[r.project];
        if (provider === "claude") pj.claude += r.tokens.total;
        if (provider === "grok") pj.grok += r.tokens.total;
        pj.sessions += 1;
      }

      // automation (today only)
      if (isToday && r.source === "automation") {
        if (provider === "claude") summary.automation.claude += r.tokens.total;
        if (provider === "grok") summary.automation.grok += r.tokens.total;
        summary.automation.sessions += 1;
      }

      // byFeature (all time in loaded range)
      if (r.linkId) {
        if (!featureMap.has(r.linkId)) {
          featureMap.set(r.linkId, {
            linkType: r.linkType ?? "unknown",
            project: r.project ?? "",
            totalTokens: 0,
            stages: {},
          });
        }
        const feat = featureMap.get(r.linkId)!;
        feat.totalTokens += r.tokens.total;
        feat.stages[r.source] = (feat.stages[r.source] ?? 0) + r.tokens.total;
      }
    }
  }

  // Top 20 features by cost
  summary.byFeature = [...featureMap.entries()]
    .map(([linkId, data]) => ({ linkId, title: linkId, ...data }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 20);

  return summary;
}

export interface BudgetAlert {
  level: "warning" | "critical";
  provider: "claude" | "grok";
  period: "daily" | "weekly";
  current: number;
  limit: number;
  percent: number;
}

export function checkBudgets(meteringDir?: string): BudgetAlert[] {
  const dir = getMeteringDir(meteringDir);
  const alerts: BudgetAlert[] = [];

  const budgetPath = join(dir, "budgets.json");
  if (!existsSync(budgetPath)) return alerts;

  let budgets: BudgetConfig;
  try {
    budgets = JSON.parse(readFileSync(budgetPath, "utf-8"));
  } catch {
    return alerts;
  }

  const summary = computeSummary(meteringDir);

  // Check daily budgets
  for (const provider of ["claude", "grok"] as const) {
    const config = budgets.daily[provider];
    if (!config) continue;
    const current = summary.today[provider].total;
    const percent = current / config.tokenLimit;
    if (percent >= 1) {
      alerts.push({ level: "critical", provider, period: "daily", current, limit: config.tokenLimit, percent });
    } else if (percent >= config.warnAt) {
      alerts.push({ level: "warning", provider, period: "daily", current, limit: config.tokenLimit, percent });
    }
  }

  // Check weekly budgets
  for (const provider of ["claude", "grok"] as const) {
    const config = budgets.weekly[provider];
    if (!config) continue;
    const current = summary.thisWeek[provider].total;
    const percent = current / config.tokenLimit;
    if (percent >= 1) {
      alerts.push({ level: "critical", provider, period: "weekly", current, limit: config.tokenLimit, percent });
    } else if (percent >= config.warnAt) {
      alerts.push({ level: "warning", provider, period: "weekly", current, limit: config.tokenLimit, percent });
    }
  }

  return alerts;
}

/** Create a unique metering record ID */
export function meterRecordId(): string {
  return `meter-${getTodayFileName().replace(".json", "")}-${crypto.randomUUID().slice(0, 8)}`;
}
```

- [ ] **Step 5: Run tests — verify they pass**

Run: `cd friday && bun test tests/unit/metering.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add friday/src/modules/studio/metering.ts friday/tests/unit/metering.test.ts hq-data/metering/budgets.json
git commit -m "feat(metering): add metering writer, summary computation, budget alerts with tests"
```

---

## Chunk 2: Instrument Friday Runtime (Cortex, ClaudeBrain, Dispatch)

### Task 3: Instrument ClaudeBrain with metering

**Files:**
- Modify: `friday/src/core/claude-brain.ts`

- [ ] **Step 1: Add metering import and record writing**

At top of file, add import:
```typescript
import { writeMeterRecord, estimateTokens, meterRecordId } from "../modules/studio/metering.ts";
```

In the `reason()` method, after the subprocess completes and response is captured (after the try/catch around line 81-106), add metering before the return:

```typescript
// After: const durationMs = Date.now() - start;
// After: response text is captured in `stdout`
// Before: return { text: stdout, durationMs, truncated }

try {
  const tokenEst = estimateTokens(fullPrompt.length, stdout.length);
  writeMeterRecord({
    id: meterRecordId(),
    timestamp: new Date().toISOString(),
    provider: "claude",
    model: "claude-code",
    source: "friday-inference",
    agent: null,
    agentSlug: null,
    project: null,
    linkType: null,
    linkId: null,
    tokens: tokenEst,
    durationMs,
    status: "completed",
  });
} catch {
  // Metering failure must never break the brain
}
```

For the timeout/error paths, write a metering record with `status: "timeout"` or `status: "failed"`.

- [ ] **Step 2: Run existing ClaudeBrain tests**

Run: `cd friday && bun test tests/unit/claude-brain.test.ts`
Expected: All PASS (metering writes are fire-and-forget, won't break existing behavior)

- [ ] **Step 3: Commit**

```bash
git add friday/src/core/claude-brain.ts
git commit -m "feat(metering): instrument ClaudeBrain with token estimation"
```

### Task 4: Instrument Cortex with Grok metering

**Files:**
- Modify: `friday/src/core/cortex.ts`

- [ ] **Step 1: Add metering import**

At top of `cortex.ts`, add:
```typescript
import { writeMeterRecord, meterRecordId } from "../modules/studio/metering.ts";
```

- [ ] **Step 2: Add metering after chatStream usage resolves**

In the `chatStream()` method, after the usage Promise resolves (around line 269-271 where `historyManager.recordUsage` is called), add:

```typescript
// After: this.historyManager.recordUsage(usage.inputTokens + usage.outputTokens);
try {
  writeMeterRecord({
    id: meterRecordId(),
    timestamp: new Date().toISOString(),
    provider: "grok",
    model: this.config.model ?? "grok-unknown",
    source: "friday-inference",
    agent: null,
    agentSlug: null,
    project: null,
    linkType: null,
    linkId: null,
    tokens: {
      input: usage.inputTokens ?? 0,
      output: usage.outputTokens ?? 0,
      total: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
      estimated: false,
    },
    durationMs: Date.now() - startTime,
    status: "completed",
  });
} catch {
  // Metering failure must never break inference
}
```

Note: You'll need to capture `startTime = Date.now()` at the beginning of `chatStream()`.

- [ ] **Step 3: Add metering to chatWithRouting Claude path**

In `chatWithRouting()` (around line 339-345), after the Claude brain response is captured and audit is logged, the metering is already handled by ClaudeBrain itself (Task 3). No additional instrumentation needed here — the ClaudeBrain.reason() call will write its own record.

- [ ] **Step 4: Run existing Cortex tests**

Run: `cd friday && bun test tests/unit/cortex.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add friday/src/core/cortex.ts
git commit -m "feat(metering): instrument Cortex with Grok token metering"
```

### Task 5: Instrument dispatch-agent with metering

**Files:**
- Modify: `friday/src/modules/studio/dispatch-agent.ts`

- [ ] **Step 1: Add metering imports and completedAt tracking**

Add imports at top:
```typescript
import { writeMeterRecord, estimateTokens, meterRecordId } from "./metering.ts";
```

In the DispatchRecord creation (around line 55-65), ensure `startedAt` captures the millisecond timestamp.

- [ ] **Step 2: Add metering on subprocess completion**

In the `proc.exited` callback (around lines 98-105 in fallback mode), and in the broadcast completion path, add:

```typescript
// On subprocess completion (success or failure):
const durationMs = Date.now() - dispatch.startedAt.getTime();
dispatch.completedAt = new Date();
dispatch.durationMs = durationMs;

const outputText = dispatch.output ?? "";
const promptText = instruction; // The full prompt passed to claude -p
const tokenEst = estimateTokens(promptText.length, outputText.length);

try {
  writeMeterRecord({
    id: meterRecordId(),
    timestamp: new Date().toISOString(),
    provider: "claude",
    model: "claude-code",
    source: dispatch.prompt?.includes("[automation]") ? "automation" : "agent-dispatch",
    agent: dispatch.agent,
    agentSlug: dispatch.agentSlug,
    project: dispatch.project,
    linkType: null,  // Set by caller if dispatching for a specific idea/rec
    linkId: null,
    tokens: tokenEst,
    durationMs,
    status: dispatch.status === "completed" ? "completed" : dispatch.status === "timeout" ? "timeout" : "failed",
  });
} catch {
  // Metering failure must never break dispatch
}
```

- [ ] **Step 3: Increase output capture buffer**

Change the output truncation limit from 32KB to 64KB for better token estimation:

```typescript
// Find the truncation constant and change from 32768 to 65536
const MAX_OUTPUT = 65536;
```

- [ ] **Step 4: Run existing dispatch tests**

Run: `cd friday && bun test tests/unit/dispatch-agent.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add friday/src/modules/studio/dispatch-agent.ts
git commit -m "feat(metering): instrument agent dispatch with token estimation and duration tracking"
```

---

## Chunk 3: Instrument Electron (Groq + Idea Pipeline)

### Task 6: Instrument Groq handler in Electron main

**Files:**
- Modify: `electron/main.cjs`

- [ ] **Step 1: Add metering writer function for Electron**

Near the top of `main.cjs` (after the existing require statements), add a simple metering writer that writes directly to the JSON file (no shared module import — Electron is CommonJS, Friday is ESM):

```javascript
// --- Metering writer (standalone for Electron main process) ---
const meteringDir = path.join(__dirname, '..', 'hq-data', 'metering');

function writeMeteringRecord(record) {
  try {
    if (!fs.existsSync(meteringDir)) fs.mkdirSync(meteringDir, { recursive: true });
    const d = new Date();
    const fileName = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.json`;
    const filePath = path.join(meteringDir, fileName);
    let records = [];
    if (fs.existsSync(filePath)) {
      try { records = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch {}
    }
    records.push(record);
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
  } catch (err) {
    console.error('[Metering] Write failed:', err.message);
  }
}

function meterRecordId() {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return `meter-${date}-${crypto.randomUUID().slice(0, 8)}`;
}
```

- [ ] **Step 2: Add metering to groq:generate handler**

In the `groq:generate` handler (around line 975-976 where `groqUsage.tokensToday` is incremented), add:

```javascript
// After: groqUsage.tokensToday += (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0);
writeMeteringRecord({
  id: meterRecordId(),
  timestamp: new Date().toISOString(),
  provider: 'groq',
  model: model || 'llama-3.3-70b',
  source: 'council-chat',
  agent: null,
  agentSlug: null,
  project: null,
  linkType: null,
  linkId: null,
  tokens: {
    input: usage?.prompt_tokens || 0,
    output: usage?.completion_tokens || 0,
    total: (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0),
    estimated: false,
  },
  durationMs: 0, // Groq calls are fast, not worth tracking
  status: 'completed',
});
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.cjs
git commit -m "feat(metering): instrument Groq Council Chat with metering records"
```

### Task 7: Instrument idea pipeline in Electron main

**Files:**
- Modify: `electron/main.cjs`

- [ ] **Step 1: Add metering to agent session PTY close handler**

In the `terminal:create-agent-session` handler (around line 1568-1575 where the PTY exit callback fires), add duration tracking and metering:

```javascript
// At session creation, capture start time:
const sessionStart = Date.now();

// In the exit callback:
const durationMs = Date.now() - sessionStart;
const outputLength = /* accumulated output length from PTY data events */;
const inputEstimate = /* agent skill content + project context length */ 0;
writeMeteringRecord({
  id: meterRecordId(),
  timestamp: new Date().toISOString(),
  provider: 'claude',
  model: 'claude-code',
  source: type === 'idea-analysis' ? 'idea-analysis' : type === 'idea-generation' ? 'idea-generation' : 'agent-dispatch',
  agent: agentName || null,
  agentSlug: agentSlug || null,
  project: project || null,
  linkType: ideaId ? 'idea' : recId ? 'recommendation' : null,
  linkId: ideaId || recId || null,
  tokens: {
    input: Math.round(inputEstimate / 4),
    output: Math.round(outputLength / 4),
    total: Math.round((inputEstimate + outputLength) / 4),
    estimated: true,
  },
  durationMs,
  status: 'completed',
});
```

Note: You'll need to accumulate PTY output length in a variable during the `pty.onData` callback. Not the full text (too much memory), just a running character count.

- [ ] **Step 2: Commit**

```bash
git add electron/main.cjs
git commit -m "feat(metering): instrument idea pipeline with metering records"
```

---

## Chunk 4: Activate Automation

### Task 8: Enable default automation rules

**Files:**
- Modify: `hq-data/automation/schedules.json`
- Modify: `hq-data/automation/chains.json`
- Modify: `hq-data/automation/triggers.json`

- [ ] **Step 1: Enable 3 default schedules**

In `schedules.json`, set `"enabled": true` for all three default entries:
- `default-weekly-producer`
- `default-daily-producer`
- `default-monthly-market`

- [ ] **Step 2: Verify chains and triggers don't need an enabled flag**

Chains and triggers use `isDefault: true` — check if the automation runtime checks an `enabled` field. If it does, add `"enabled": true` to each. If `isDefault` already means active, no change needed.

- [ ] **Step 3: Commit**

```bash
git add hq-data/automation/schedules.json hq-data/automation/chains.json hq-data/automation/triggers.json
git commit -m "feat(automation): enable 8 default automation rules (schedules, chains, triggers)"
```

---

## Chunk 5: Friday Integration — studio.query Metering Queries

### Task 9: Add metering query support to studio.query

**Files:**
- Modify: `friday/src/modules/studio/query-studio.ts`

- [ ] **Step 1: Add metering query function**

Add a new function after the existing query functions (after `queryProgress()`):

```typescript
import { computeSummary, checkBudgets, getMeteringDir } from "./metering.ts";

function queryMetering(query: string): string {
  try {
    const summary = computeSummary();
    const alerts = checkBudgets();

    const parts: string[] = [];

    // Budget status
    if (query.match(/budget|over|limit|alert/i)) {
      if (alerts.length === 0) {
        parts.push("All budgets healthy — no alerts.");
      } else {
        for (const a of alerts) {
          parts.push(`${a.level.toUpperCase()}: ${a.provider} ${a.period} at ${Math.round(a.percent * 100)}% (${a.current.toLocaleString()} / ${a.limit.toLocaleString()} tokens)`);
        }
      }
    }

    // Today's summary
    if (query.match(/today|spend|cost|usage|token/i)) {
      const t = summary.today;
      parts.push(`Today (${t.date}):`);
      parts.push(`  Claude: ${t.claude.total.toLocaleString()} tokens (${t.claude.sessions} sessions, estimated)`);
      parts.push(`  Grok: ${t.grok.total.toLocaleString()} tokens (${t.grok.sessions} sessions, actual)`);
      parts.push(`  Groq: ${t.groq.total.toLocaleString()} tokens (${t.groq.sessions} calls, info only)`);
    }

    // Agent breakdown
    if (query.match(/agent|who|expensive/i)) {
      const agents = Object.entries(summary.byAgent).sort((a, b) => (b[1].claude + b[1].grok) - (a[1].claude + a[1].grok));
      parts.push("By agent (today):");
      for (const [slug, data] of agents.slice(0, 5)) {
        parts.push(`  ${slug}: ${(data.claude + data.grok).toLocaleString()} tokens (${data.sessions} sessions)`);
      }
    }

    // Project breakdown
    if (query.match(/project/i)) {
      parts.push("By project (today):");
      for (const [slug, data] of Object.entries(summary.byProject)) {
        parts.push(`  ${slug}: ${(data.claude + data.grok).toLocaleString()} tokens`);
      }
    }

    // Feature lifecycle
    if (query.match(/feature|lifecycle|idea|scavenger|gravity/i) && summary.byFeature.length > 0) {
      parts.push("Top features by cost:");
      for (const f of summary.byFeature.slice(0, 5)) {
        parts.push(`  ${f.linkId}: ${f.totalTokens.toLocaleString()} tokens (${Object.keys(f.stages).join(" → ")})`);
      }
    }

    return parts.length > 0 ? parts.join("\n") : "No metering data found. Try asking about today's spend, budget status, or agent costs.";
  } catch (err) {
    return `Metering query error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
```

- [ ] **Step 2: Wire metering queries into the main execute function**

In `queryStudioExecute()` (around line 92-124), add a keyword check before the existing query dispatch:

```typescript
// At the top of queryStudioExecute, before other queries:
if (query.match(/meter|budget|token|spend|cost|expensive/i)) {
  return queryMetering(query);
}
```

- [ ] **Step 3: Run existing query tests**

Run: `cd friday && bun test tests/unit/query-studio.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add friday/src/modules/studio/query-studio.ts
git commit -m "feat(metering): add metering query support to studio.query for Friday voice"
```

---

## Chunk 6: Dashboard — MeteringPanel

### Task 10: Create MeteringPanel dashboard component

**Files:**
- Create: `src/components/dashboard/MeteringPanel.jsx`
- Modify: `src/store/useStore.js`
- Modify: `src/components/dashboard/StudioOverview.jsx` (or wherever tabs are defined)

- [ ] **Step 1: Add metering state to Zustand store**

In `useStore.js`, add to the store initialization (around line 132):

```javascript
// Metering state
meteringData: null, // MeterSummary object, loaded from summary computation
meteringLoading: false,
```

Add a loader action:

```javascript
loadMeteringData: async () => {
  set({ meteringLoading: true });
  try {
    const meteringDir = path.join(get().hqDataDir || '', 'metering');
    // Read today's daily file and compute summary client-side
    // (or read pre-computed summary.json if we add a computation step)
    const todayFile = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.json`;
    })();

    const todayPath = path.join(meteringDir, todayFile);
    const budgetsPath = path.join(meteringDir, 'budgets.json');

    let todayRecords = [];
    let budgets = null;

    try {
      const content = await window.electronAPI?.readFile?.(todayPath);
      if (content) todayRecords = JSON.parse(content);
    } catch {}

    try {
      const content = await window.electronAPI?.readFile?.(budgetsPath);
      if (content) budgets = JSON.parse(content);
    } catch {}

    // Compute summary from today's records
    const summary = computeMeteringSummary(todayRecords, budgets);
    set({ meteringData: summary, meteringLoading: false });
  } catch {
    set({ meteringLoading: false });
  }
},
```

Note: The `computeMeteringSummary` function will be a simplified client-side version that processes today's records into the summary shape. Add it as a helper in the store file or a separate utility.

- [ ] **Step 2: Create MeteringPanel.jsx**

Create `src/components/dashboard/MeteringPanel.jsx` with 4 sections:
1. **Provider cards** (3 columns) — Claude, Grok, Groq with token counts and budget bars
2. **Agent/Project breakdowns** (2 columns) — horizontal bars with agent/project colors
3. **Feature lifecycle** — pipeline visualization (Idea → Analysis → Rec → Implementation → QA)
4. **7-day trend** — Recharts stacked bar chart

The component reads from `useStore` metering state, refreshes on a 30-second interval and when the metering directory changes (chokidar watch via IPC).

This is a large component (~400-500 lines). Follow the existing dashboard component patterns (e.g., `AutomationPanel.jsx` for structure, `AgentScoreboard.jsx` for Recharts usage). Use the Friday dark theme (`#0B0E14` bg, amber highlights, agent colors from the AGENT_REGISTRY).

Key sub-components to create inline:
- `ProviderCard({ provider, totals, budget, color })` — single provider stats card
- `BreakdownBars({ data, colorMap, label })` — horizontal bar chart
- `FeatureLifecycle({ features })` — pipeline stage visualization
- `WeeklyTrend({ dailyData })` — Recharts BarChart

- [ ] **Step 3: Add Metering tab to dashboard navigation**

Find where dashboard tabs are defined (likely `StudioOverview.jsx` or the parent layout component) and add a "Metering" tab that renders `<MeteringPanel />`.

- [ ] **Step 4: Verify the dashboard builds**

Run: `cd council-of-elrond && npx vite build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/MeteringPanel.jsx src/store/useStore.js
git commit -m "feat(metering): add MeteringPanel dashboard tab with provider cards, breakdowns, lifecycle, trend"
```

---

## Known Gaps — Address During Implementation

These items from the spec are not fully decomposed into tasks above. The implementer should address them:

1. **Budget alert notifications:** `writeMeterRecord()` should call `checkBudgets()` after writing, and if alerts are returned, dispatch notifications via Friday's notification system (dashboard toast via IPC, Vox voice alert, optional Slack). Wire this in the metering module after the core is working.

2. **Morning briefing cost summary:** In Friday's session start flow, call `computeSummary()` for yesterday's date and include a one-line cost summary in the briefing. This is a small addition to the existing morning briefing logic.

3. **Automation execution status fix:** The execution log has entries stuck in "started" — trace the `emitAutomationEvent` → `startAutomationTask` flow in `useStore.js` and ensure the completion callback writes back `completed`/`failed`/`timeout`. Each completion should also write a metering record.

4. **Automation cost card in MeteringPanel:** The `summary.automation` field provides automated vs manual token comparison. Add a small card to MeteringPanel showing this breakdown.

5. **Task 7 PTY output tracking:** The idea pipeline metering needs a running character counter on `pty.onData`. Add `let outputChars = 0;` before the PTY creation and `outputChars += data.length;` in the data callback. Use this for the token estimation.

6. **Task 10 store loader:** The dashboard reads files via `window.electronAPI.readFile()` (IPC to main process), not `path.join()` directly. The `computeMeteringSummary` helper should be a pure function that takes `(records[], budgets)` and returns a summary object — same logic as the Friday-side `computeSummary()` but operating on already-loaded data.

7. **7-day trend data:** The store loader should also read the last 7 daily files via IPC for the trend chart, not just today's file.

---

## Verification

### End-to-End Test: Metering Flow
1. Start Friday: `cd friday && bun run serve`
2. Send a message via the web UI — triggers Grok inference
3. Check `hq-data/metering/YYYY-MM-DD.json` — should contain a Grok metering record
4. Ask Friday "@claude What's 2+2?" — triggers ClaudeBrain, should write a Claude metering record
5. Dispatch an agent via studio tools — should write an agent-dispatch metering record
6. Open CoE dashboard → Metering tab — should show today's data

### End-to-End Test: Budget Alerts
1. Set a very low budget in `hq-data/metering/budgets.json` (e.g., `"tokenLimit": 100`)
2. Send a message to Friday
3. Verify a budget alert notification appears

### End-to-End Test: Friday Voice Query
1. Ask Friday "How much did we spend today?"
2. Verify she responds with today's token totals

### Existing Tests
1. `cd friday && bun test tests/unit/metering.test.ts` — metering module tests
2. `cd friday && bun test` — all existing tests still pass
3. `cd council-of-elrond && npx vite build` — dashboard build succeeds
