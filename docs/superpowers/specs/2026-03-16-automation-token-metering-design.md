# Automation + Token Metering Design

> Wake up CoE's dormant automation system and track every token spent — per agent, per project, per feature lifecycle.

**Date:** 2026-03-16
**Status:** Approved
**Approach:** JSON Ledger (Approach A)

---

## Problem

CoE has a fully-built automation system (schedules, chains, triggers) that's entirely dormant — all rules disabled. 14 agents have no cost visibility. There's no way to answer "how much did that feature cost from idea to ship?" or "which agent burns the most tokens?" Token tracking exists only for Groq Council Chat (in-memory, daily, lost on restart).

## Goals

1. **Persistent token metering** across Claude (estimated), Grok (actual), and Groq (info only)
2. **Feature lifecycle cost tracking** — total tokens from Idea → Analysis → Recommendation → Implementation → QA
3. **Dashboard visualization** — provider cards, agent/project breakdowns, lifecycle pipeline, 7-day trend
4. **Friday voice-queryable** — "How much did the scavenger system cost?"
5. **Budget alerts** — daily/weekly thresholds with notifications via dashboard toast, Friday voice, and optional Slack
6. **Activate automation** — enable 8 dormant rules with metering baked into every execution

## Non-Goals

- Precise Claude token counting (subprocess doesn't expose usage — we estimate at ~4 chars/token)
- Cost in dollars (token counts only — pricing changes, Max plan is flat rate)
- Hard budget enforcement that kills running sessions (too dangerous)
- Groq in budget calculations (tracked for visibility only)

---

## Architecture

### Data Model — Metering Record

Every token-consuming action writes one record:

```json
{
  "id": "meter-2026-03-16-a1b2c3",
  "timestamp": "2026-03-16T14:30:00.000Z",

  "provider": "claude | grok | groq",
  "model": "claude-opus-4-6 | grok-4-1-fast | llama-3.3-70b",

  "source": "agent-dispatch | friday-inference | council-chat | idea-generation | idea-analysis | implementation | automation",
  "agent": "Studio Producer",
  "agentSlug": "studio-producer",
  "project": "expedition",

  "linkType": "idea | recommendation | automation",
  "linkId": "2026-03-15-agent-implement-a-scavenger-system...",

  "tokens": {
    "input": 4200,
    "output": 1800,
    "total": 6000,
    "estimated": true
  },

  "durationMs": 12400,
  "status": "completed | failed | timeout"
}
```

Key fields:
- **`linkType` + `linkId`** — ties cost to an idea or recommendation for lifecycle tracking
- **`estimated: true`** — flags Claude records using char-to-token estimation
- **`source`** — distinguishes automation vs manual dispatch vs Friday chat
- **`provider: "groq"`** — included for visibility, excluded from budget calculations

### File Structure

```
hq-data/metering/
├── 2026-03-16.json      # One file per day — array of records
├── 2026-03-15.json
├── budgets.json          # Daily/weekly limits + alert thresholds
└── summary.json          # Rolling aggregates — updated on each write
```

Daily files keep individual files small and enable easy archival. `summary.json` is a precomputed cache so the dashboard doesn't parse every daily file for totals.

### summary.json Structure

```json
{
  "today": {
    "date": "2026-03-16",
    "claude": { "input": 45000, "output": 12000, "total": 57000, "sessions": 8 },
    "grok": { "input": 8000, "output": 3000, "total": 11000, "sessions": 24 },
    "groq": { "input": 2000, "output": 500, "total": 2500, "sessions": 45 }
  },
  "thisWeek": { "claude": {}, "grok": {}, "groq": {} },
  "byAgent": {
    "studio-producer": { "claude": 18000, "grok": 3000, "sessions": 3 },
    "qa-advisor": { "claude": 12000, "grok": 0, "sessions": 2 }
  },
  "byProject": {
    "expedition": { "claude": 30000, "grok": 5000, "sessions": 5 },
    "ttr-ios": { "claude": 15000, "grok": 3000, "sessions": 3 }
  },
  "automation": {
    "claude": 25000,
    "grok": 2000,
    "sessions": 4
  }
}
```

Updated atomically on each `writeMeterRecord()` call. Recomputed from daily files on app start (handles crash recovery).

### budgets.json Structure

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

---

## Instrumentation Points

### 5 Writers — All Use Shared `writeMeterRecord()`

#### 1. Friday Cortex — Grok Inferences
**File:** `friday/src/core/cortex.ts`
**Where:** After `chatStream()` and `chatWithRouting()` resolve their usage Promise
**Data:** Actual `inputTokens`/`outputTokens` from AI SDK. `provider: "grok"`, `source: "friday-inference"`.

#### 2. Friday ClaudeBrain — Claude Subprocess
**File:** `friday/src/core/claude-brain.ts`
**Where:** After subprocess completes
**Data:** Estimated tokens: (system prompt chars + user message chars) / 4 for input, response chars / 4 for output. `provider: "claude"`, `estimated: true`.

#### 3. Agent Dispatch — Claude Code Sessions
**File:** `friday/src/modules/studio/dispatch-agent.ts`
**Where:** On subprocess completion (also add `completedAt` to DispatchRecord)
**Data:** Estimated tokens from prompt size + output text length. `provider: "claude"`, `source: "agent-dispatch"` or `"automation"`. Includes `linkId` if dispatched for a specific idea/recommendation.

#### 4. Electron main.cjs — Groq Council Chat
**File:** `electron/main.cjs` (groq:generate handler)
**Where:** After each Groq API call
**Data:** Actual `prompt_tokens` + `completion_tokens` from Groq response headers. `provider: "groq"`, `source: "council-chat"`. Write to metering file via IPC or direct file write.

#### 5. Electron main.cjs — Idea Pipeline
**File:** `electron/main.cjs` (terminal:create-agent-skill-analysis, idea generation)
**Where:** On PTY close event
**Data:** Estimated tokens from captured output length. `provider: "claude"`, `source: "idea-generation"` or `"idea-analysis"`. `linkType: "idea"`, `linkId` set to the idea filename.

### Shared Writer: `writeMeterRecord()`

**Location:** `friday/src/modules/studio/metering.ts` — importable by Friday runtime. Electron main process writes metering records by directly appending to the daily JSON file (simple `fs.readFileSync` + `JSON.parse` + push + `fs.writeFileSync`). No shared module import across process boundaries.

**Write ownership to avoid races:**
- **Daily files (`YYYY-MM-DD.json`):** Both processes append independently — each record has a unique `id`, so concurrent appends are safe (read-parse-push-write is atomic per process, and records never conflict).
- **`summary.json`:** Only recomputed on dashboard load or Friday boot (not written on every record). Computed by scanning today's daily file. This eliminates the race condition entirely — no two processes write `summary.json` simultaneously.

**Week boundary:** `thisWeek` resets on Monday 00:00 local time. Computed by scanning daily files from the current Monday forward.

**Lifecycle aggregates:** Precomputed in `summary.json` under a `byFeature` key (top 20 by cost) to avoid scanning all daily files at render time. Recomputed on dashboard load alongside other aggregates.

Behavior:
1. Append record to today's daily file (`YYYY-MM-DD.json`)
2. (summary.json recomputed on read, not on write)
3. Check budget thresholds (read today's daily file, sum totals, compare):
   - Compare `summary.json` today totals against `budgets.json` limits
   - If `total >= limit * warnAt` → fire warning notification
   - If `total >= limit` → fire critical notification
4. Notifications dispatched via:
   - CoE dashboard toast (IPC `friday:event` or file-watch trigger)
   - Friday Vox voice alert (if active)
   - Slack webhook (if configured)

### Claude Token Estimation

`claude -p` does not expose token usage. We estimate:
- **Input tokens:** (system prompt length + user message length) / 4
- **Output tokens:** response text length / 4
- **Accuracy:** ~85% (Claude's tokenizer averages ~3.5-4.5 chars/token for English)
- All Claude records marked `estimated: true`

For agent dispatches, the system prompt is the agent skill file content + project context — we know their exact sizes. The instruction prompt is passed to `dispatch-agent.ts`. The output is captured stdout (truncated to 32KB — increase to 64KB for better estimation).

---

## Dashboard — Metering Tab

New tab in CoE dashboard, or sub-tab within Automation.

### Layout (4 sections)

#### Top Row: Provider Cards (3 columns)
- **Claude** — token count today, session count, budget bar (% of daily limit), color-coded (green/yellow/red)
- **Grok** — same layout, amber theme
- **Groq** — dimmed, "info only" label, no budget bar

Data source: `summary.json` → `today` object. Polled via chokidar file watch or 30s interval.

#### Middle Row: Breakdowns (2 columns)
- **Left: Cost by Agent** — horizontal bar chart, each agent in their color, sorted by total tokens descending
- **Right: Cost by Project** — horizontal bar chart, each project in their color

Data source: `summary.json` → `byAgent` and `byProject` objects.

#### Feature Lifecycle Panel
- List of features (ideas + recommendations) with total token cost
- Each feature shows pipeline stages: Idea → Analysis → Rec → Implementation → QA
- Each stage shows its token cost; pending stages shown as dashed outlines
- Sorted by total cost descending

Data source: Scan daily metering files, group by `linkId`, sum per `source` category.

#### Bottom: 7-Day Trend
- Recharts stacked area/bar chart
- Claude (purple) + Grok (amber) stacked, Groq as thin gray line
- X-axis: last 7 days, Y-axis: total tokens
- Today highlighted

Data source: Read last 7 daily files, sum per provider per day.

---

## Automation Activation

### Enable Default Rules

Set `enabled: true` for all 8 defaults in `hq-data/automation/`:

**3 Schedules:**
1. `default-daily-producer` — Studio Producer daily report, all projects
2. `default-weekly-producer` — Studio Producer weekly plan, all projects
3. `default-monthly-market` — Market Analyst knowledge refresh, all projects

**2 Triggers:**
4. `default-trigger-git-knowledge` — Git push (knowledgeWorthy) → Market Analyst
5. `default-trigger-git-progress` — Git push (significant) → QA Advisor

**3 Chains:**
6. `default-chain-impl-qa` — Agent creates rec → QA Advisor validates
7. `default-chain-resolved-qa` — Agent resolves rec → QA updates context.md
8. `default-chain-qa-producer` — QA creates rec → Studio Producer reprioritizes

### Fix Execution Status Tracking

Current bug: execution log entries stuck in "started" status. Fix:
- Ensure completion callback fires reliably in the automation runtime
- Write `completed`/`failed`/`timeout` status back to `execution-log.json`
- Write a metering record on each execution completion with `source: "automation"`

### Automation Cost Card

Add to Metering dashboard: card showing total tokens spent by automated runs vs manual dispatches. Enables evaluating whether automation is worth the token investment.

---

## Friday Integration

### studio.query Enhancements

Extend existing `studio.query` keyword matching to recognize metering queries:
- "spend", "cost", "budget", "tokens", "metering" → search `hq-data/metering/`
- Return formatted summaries from `summary.json` for quick queries
- Search daily files by `linkId` for lifecycle cost queries

Example queries Friday can answer:
- "How much did we spend today?" → today's totals from summary.json
- "What's the most expensive agent?" → byAgent breakdown
- "How much did the scavenger system cost?" → search daily files by linkId, sum lifecycle
- "Are we over budget?" → compare summary.json against budgets.json

### Budget Alerts via Voice

When `writeMeterRecord()` crosses a threshold:
- Notification written to Friday's push channel
- If Vox active: "Boss, we've hit 80% of today's Claude budget — 400K tokens across 8 sessions"
- Dashboard toast shown simultaneously

### Morning Briefing Addition

On session start, include cost summary: "Yesterday the studio used 180K Claude tokens across 12 sessions. Expedition consumed 65% of the budget. No alerts triggered."

---

## File Changes Summary

| File | Action | What |
|------|--------|------|
| `hq-data/metering/budgets.json` | Create | Default budget config |
| `hq-data/metering/summary.json` | Create | Rolling aggregates (auto-maintained) |
| `hq-data/metering/*.json` | Auto-created | Daily metering records |
| `friday/src/core/cortex.ts` | Modify | Write Grok metering records after inference |
| `friday/src/core/claude-brain.ts` | Modify | Write Claude metering records after subprocess |
| `friday/src/modules/studio/dispatch-agent.ts` | Modify | Add completedAt, write metering records, increase output capture |
| `friday/src/modules/studio/types.ts` | Modify | Add completedAt to DispatchRecord |
| `friday/src/modules/studio/query-studio.ts` | Modify | Add metering query patterns |
| `electron/main.cjs` | Modify | Write Groq + idea pipeline metering records |
| `hq-data/automation/schedules.json` | Modify | Enable 3 default schedules |
| `hq-data/automation/chains.json` | Modify | Enable 3 default chains |
| `hq-data/automation/triggers.json` | Modify | Enable 2 default triggers |
| `src/components/dashboard/MeteringPanel.jsx` | Create | New dashboard tab with all visualizations |
| `src/store/useStore.js` | Modify | Add metering state slice |
| Shared metering writer utility | Create | `writeMeterRecord()` used by Friday + Electron |

---

## Testing Strategy

- Unit tests for `writeMeterRecord()` — record writing, summary updates, budget threshold detection
- Unit tests for token estimation (chars → tokens at ~4:1 ratio)
- Unit tests for summary.json recomputation from daily files
- Integration test: dispatch an agent, verify metering record appears
- Dashboard: verify cards update when metering files change (chokidar watch)
- Budget alerts: verify notification fires at 80% threshold

## Future Upgrades

- **SQLite migration** — if JSON files become slow at scale (months of data), migrate to SQLite with same schema
- **Dollar cost estimation** — apply per-model pricing to token counts (when useful)
- **Historical analytics** — monthly reports, agent efficiency scoring, cost-per-feature trends
- **Hard budget caps** — optionally prevent new agent dispatches when budget exhausted
