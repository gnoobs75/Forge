# Friday Dual-Brain Architecture — Design Spec

## Overview

Friday gains a configurable dual-brain system where **Grok** handles all voice I/O and fast queries, while **Claude Code CLI** (`claude -p`) handles complex cognitive tasks — free on Claude Max. A **BrainRouter** auto-selects the appropriate brain per message, with user overrides from the CoE dashboard. Claude's text responses are piped through Grok TTS for seamless voice output.

Additionally, Friday gains **Studio Tools** — a tool suite that lets her query, command, and update the Council of Elrond studio system. The centerpiece is `dispatch_agent`, which spawns Claude Code sessions with agent skills asynchronously, making Friday a true Studio Director who orchestrates her 14-agent team.

## Architecture

```
User Message (text or voice transcript)
       ↓
   BrainRouter
   ├── analyzes: mode, keywords, length, voice state
   ├── checks: dashboard brain mode override
   └── returns: { brain: 'grok' | 'claude', reason }
       ↓                         ↓
   GROK PATH                  CLAUDE PATH
       ↓                         ↓
   Cortex.chatStream()       ClaudeBrain.reason()
   (AI SDK streamText)       (claude -p subprocess)
       ↓                         ↓
   Response text              Response text
       ↓                         ↓
       └────────┬─────────────────┘
                ↓
   HistoryManager.push(response, { brain })
                ↓
   If voice mode → pipe text to Grok TTS
   UI → show brain badge + latency on message
```

### Voice + Claude Reasoning Flow

```
1. User presses PTT, speaks
2. Grok WebSocket: server VAD → Whisper STT → transcript text
3. VoiceSessionManager: receives transcript
4. BrainRouter: keyword "analyze" + length 12 words → routes to Claude
5. ClaudeBrain: spawns `claude -p` with enriched system prompt + user question
6. Claude responds with analysis text (~3-8 sec)
7. Response text sent to Grok WebSocket as conversation.item.create + response.create
8. Grok speaks the response aloud in Friday's voice (Eve/Ara/etc.)
9. UI: transcript shows message with "Claude" brain badge + response time
```

### Agent Dispatch Flow (Async)

```
1. Friday decides (or user asks) to dispatch an agent
2. dispatch_agent tool called: agent="qa-advisor", project="expedition"
3. Friday spawns: claude -p --system-prompt <agent-skill> "Analyze expedition..."
4. Friday immediately responds: "QA Advisor is reviewing Expedition now."
5. Subprocess runs in background (30-120 sec)
6. Agent writes recommendation JSON → hq-data/projects/expedition/recommendations/
7. Agent appends to activity-log.json
8. Friday's existing chokidar file watcher fires → file:created signal
9. Directive matches signal → Friday reads new recommendation
10. Friday notifies user: "QA Advisor just finished. Here's the summary..."
11. If voice mode: speaks summary via Grok TTS
```

## Components

### 1. BrainRouter (`src/core/brain-router.ts`)

**Purpose:** Decides which brain handles each message.

**Interface:**
```typescript
interface BrainRouterConfig {
  mode: 'auto' | 'grok' | 'claude';      // Dashboard override
  shortQueryThreshold: number;             // Words — below this → Grok (default: 20)
  claudeKeywords: string[];                // Trigger words for Claude routing
  voiceClaudeEnabled: boolean;             // Allow Claude during voice (default: true)
}

interface BrainDecision {
  brain: 'grok' | 'claude';
  reason: string;                          // Human-readable explanation
}

class BrainRouter {
  constructor(config: BrainRouterConfig);
  route(message: string, context: RouteContext): BrainDecision;
  updateConfig(partial: Partial<BrainRouterConfig>): void;
}

interface RouteContext {
  isVoice: boolean;                        // PTT voice mode active
  forcedBrain?: 'grok' | 'claude';        // @grok / @claude prefix
  hasToolCalls?: boolean;                  // Message likely needs tools
  previousBrain?: 'grok' | 'claude';      // Last brain used — prevents thrashing on follow-ups
}
```

**Routing Logic (in priority order):**

1. **Forced prefix** — `@claude` or `@grok` in message → route to that brain, strip prefix. Works in both text and voice mode (voice: Grok handles STT/TTS transport, but Claude does the reasoning).
2. **Dashboard mode override** — if mode is `grok` or `claude`, use that. Note: STT and TTS audio transport always flow through Grok regardless — this controls which brain does the *thinking*.
3. **Voice mode + voiceClaudeEnabled=false** — Grok (skip Claude latency)
4. **Keyword match** — message contains any claudeKeywords AND word count >= 5 → Claude (length gate prevents false positives like "I plan to grab lunch")
5. **Follow-up continuity** — if no keyword match and `previousBrain` is set, continue with previous brain (prevents thrashing on follow-ups like "what about the other one?" — works for all message lengths)
6. **Length check** — message word count < shortQueryThreshold → Grok
7. **Default** — Grok (fast path)

**Default Keywords:**
```
analyze, compare, explain why, review, design, plan, evaluate,
summarize, assess, recommend, critique, break down, deep dive,
what do you think about, walk me through
```

**Config persistence flow:**
1. CoE dashboard saves to `localStorage('coe-friday-brain')` for UI state restore
2. On save, dashboard sends IPC `config:update` with section `brain` to Friday's Bun server
3. Friday server stores config in memory (BrainRouter instance) — no server-side file persistence needed since config is re-sent on each session start via IPC

### 2. ClaudeBrain (`src/core/claude-brain.ts`)

**Purpose:** Wraps Claude Code CLI subprocess for reasoning tasks.

**Interface:**
```typescript
interface ClaudeBrainConfig {
  timeout: number;                         // Max subprocess duration (default: 60s)
  claudePath: string;                      // Path to claude CLI (default: 'claude')
  maxOutputChars: number;                  // Truncate response (default: 32000)
}

interface ClaudeResponse {
  text: string;
  durationMs: number;
  truncated: boolean;
}

class ClaudeBrain {
  constructor(config: ClaudeBrainConfig);

  /** Fire-and-forget reasoning — spawns claude -p subprocess */
  reason(prompt: string, systemContext: string): Promise<ClaudeResponse>;

  /** Check if claude CLI is available */
  isAvailable(): Promise<boolean>;
}
```

**Implementation Details:**

- Spawns via `Bun.spawn()` (Friday runs on Bun — `Bun.spawn` returns `Subprocess` with `.stdout` as `ReadableStream`, not Node's event-emitter `ChildProcess`):
  ```
  claude -p "prompt"
  ```
  Note: `-p` / `--print` already implies non-interactive mode and exits after responding. No additional flags needed.
- System context injected as part of the prompt (Claude Code's `-p` flag doesn't accept a separate system prompt, so we prepend it):
  ```
  <system>
  {Genesis prompt}
  {SMARTS knowledge}
  {Studio context}
  {Sensorium environment}
  </system>

  {user message}
  ```
- Captures stdout as response text (read `Subprocess.stdout` ReadableStream to completion)
- Timeout via AbortController — calls `subprocess.kill()` on expiry
- Stderr captured via `Subprocess.stderr` ReadableStream for error reporting
- Returns `ClaudeResponse` with text + timing metrics
- **Voice mode truncation:** When `isVoice` context is true, `maxOutputChars` is clamped to `Math.min(maxOutputChars, 2000)` to prevent excessively long TTS output

**Error Handling:**
- Claude not found → log warning, BrainRouter falls back to Grok permanently
- Timeout → return partial output + "(response truncated due to timeout)"
- Non-zero exit → return stderr as error, fall back to Grok for this message
- Empty response → retry once, then fall back to Grok

### 3. Studio Tools (`src/modules/studio/`)

A new FridayModule providing three tools for CoE interaction.

#### 3a. `dispatch_agent` Tool

**Purpose:** Spawn a Claude Code session with an agent skill to perform work asynchronously.

**Parameters:**
```typescript
{
  agent: string;          // Agent slug: "market-analyst", "qa-advisor", etc.
  project: string;        // Project slug: "expedition", "ttr-ios", "ttr-roblox"
  prompt: string;         // What to ask the agent to do
  priority?: 'normal' | 'urgent';  // Urgent = notify immediately on completion
}
```

**Implementation:**
- Validates agent slug against known agent list (14 agents)
- Validates project slug against known projects
- Resolves agent skill file: `council-of-elrond/agents/{agent-slug}.md`
- Reads skill file content into a string via `Bun.file().text()`
- Spawns background subprocess via `Bun.spawn()`:
  ```
  claude -p --system-prompt "<skill file content as string>" "For project {project}: {prompt}"
  ```
  Note: `--system-prompt` takes a prompt string, NOT a file path. The skill file must be read and its content passed as the flag value.
- **Subprocess environment:**
  - CWD: `C:\Claude\Agency` (project root — so agents can resolve `hq-data/` paths)
  - Inherits process.env (agents need access to PATH for git, etc.)
  - No `--dangerously-skip-permissions` — agents run with standard Claude Code permissions
- Tracks in-flight dispatches via a `Map<dispatchId, DispatchRecord>`
- Returns immediately: `"Dispatched {Agent Name} to work on {Project}. I'll report back when they're done."`

**DispatchRecord:**
```typescript
{
  id: string;
  agent: string;
  project: string;
  prompt: string;
  startedAt: Date;
  process: Subprocess;                     // Bun.spawn() return type
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
}
```

**Cancellation:**
- `cancel(dispatchId: string): boolean` — kills the subprocess, sets status to `cancelled`, notifies user
- UI: Active Dispatches list shows a cancel button per running dispatch
- Returns false if dispatch not found or already completed

**Completion detection (two paths):**
1. **Process exit** — subprocess completes → read stdout → parse for recommendation JSON → save to hq-data
2. **File watcher** — if agent writes directly to hq-data (existing agent protocol), chokidar detects new file → `file:created` signal

**On completion:**
- Emit `custom:agent-dispatch-completed` signal with agent name + summary
- If voice mode active → Friday speaks summary via Grok TTS
- If urgent → push notification via NotificationManager
- Update dispatch record status
- Append to activity-log.json

**Timeout:** Default 120 seconds. On timeout, kill process, mark failed, notify user.

**Concurrency:** Max 3 simultaneous dispatches. Queue additional requests.

#### 3b. `query_studio` Tool

**Purpose:** Read HQ data directly — recommendations, features, progress, activity log.

**Parameters:**
```typescript
{
  query: string;          // Keyword search string — matched against titles, agents, summaries
  scope?: string;         // "all" | project slug (default: "all")
  type?: string;          // "recommendations" | "features" | "progress" | "activity" | "all"
  limit?: number;         // Max results (default: 10)
}
```

**Query interpretation:** The `query` string is a simple keyword search (case-insensitive substring match) applied to relevant text fields per type:
- `recommendations`: matches against `title`, `agent`, `summary`
- `features`: matches against `name`, `description`, `status`
- `activity`: matches against `agent`, `action`, `project`
- `progress`: no filtering, returns full progress snapshot

**Implementation:**
- Reads from `hq-data/` filesystem (same paths as studio-context.ts)
- For recommendations: reads JSON files, filters by project/date/agent + keyword match
- For features: reads features.json, filters by status + keyword match
- For activity: reads activity-log.json, returns latest N entries matching query
- For progress: reads progress.json, returns category scores + blockers
- Returns formatted text summary (not raw JSON — Friday will speak this)

**Clearance:** `read-fs`

#### 3c. `update_studio` Tool

**Purpose:** Write to HQ data — create recommendations, append activity log, update features.

**Parameters:**
```typescript
{
  action: 'create-recommendation' | 'log-activity' | 'update-feature';
  project: string;
  data: Record<string, any>;   // Action-specific payload (see schemas below)
}
```

**Validation schemas per action:**

`create-recommendation` — required fields (per CLAUDE.md recommendation protocol):
```typescript
{
  agent: string;           // Agent name
  agentColor: string;      // Hex color
  title: string;           // Short actionable title
  summary: string;         // 1-2 sentence summary
  approaches: Array<{      // MUST be an array
    id: number;
    name: string;
    description: string;
    trade_offs: string;
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
  }>;
  recommended: number;     // Approach id
  reasoning: string;
  status: 'active';
}
// Auto-populated: project (from param), timestamp (ISO-8601), type ('recommendation')
```

`log-activity` — required fields:
```typescript
{ agent: string; agentColor: string; action: string; }
// Auto-populated: id (next sequential), project (from param), timestamp
```

`update-feature` — required fields:
```typescript
{ featureId: string; updates: { status?: string; description?: string; } }
```

**Implementation:**
- `create-recommendation`: validates against schema above, rejects with descriptive error if missing required fields, writes JSON to `hq-data/projects/{slug}/recommendations/`
- `log-activity`: validates required fields, appends entry to `hq-data/activity-log.json`
- `update-feature`: finds feature by id in `hq-data/projects/{slug}/features.json`, merges updates

**Clearance:** `write-fs`

### 4. Modified Cortex (`src/core/cortex.ts`)

**Minimal changes to existing Cortex:**

- New method `chatWithRouting(message, routeContext)`:
  1. Calls `BrainRouter.route(message, context)` to get decision
  2. If `grok` → existing `chatStream(message)` path (returns native ChatStream)
  3. If `claude` → calls `ClaudeBrain.reason()` with enriched prompt, then wraps the result:
     - `ClaudeResponse.text` → chunked into an async iterable yielding `ChatStreamChunk` objects
     - `toolCalls`: empty array (Claude path doesn't execute tools — tool use stays on Grok)
     - `usage`: `{ inputTokens: 0, outputTokens: text.length }` (approximate — no real token count from CLI)
     - `finishReason`: `'stop'` (or `'length'` if `truncated` is true)
     - `brain`: `'claude'` — new metadata field added to `ChatStreamResult`
  4. Records brain decision in message metadata for UI (brain badge + durationMs)
  5. Returns unified `ChatStream` compatible with existing consumers

- Voice mode modification in `VoiceSessionManager.processVoiceTurn()`:
  1. After STT transcript received, call `BrainRouter.route(transcript, { isVoice: true })`
  2. If Grok → existing path (Cortex.chatStreamVoice)
  3. If Claude → call `ClaudeBrain.reason()`, then inject response into Grok WebSocket:
     - `conversation.item.create` with role=assistant, content=claude_response_text
     - `response.create` with modalities=["audio"] to make Grok speak it

### 5. Persona Page — Brain Tab Additions

New settings card in BrainTab.jsx:

**Brain Routing:**
- Brain Mode: Auto / Grok Only / Claude Only (segmented button)
- Short Query Threshold: 20 words (number input)
- Claude Keywords: editable tag list
- Voice Claude Enabled: toggle
- Show Brain Badge: toggle

**Claude Brain:**
- Claude CLI Path: text input (default: "claude")
- Claude Timeout: 60s (number input)
- Max Output: 32000 chars (number input)
- Claude Available: status indicator (checks `claude --version`)

**Agent Dispatch:**
- Max Concurrent Dispatches: 3 (number input)
- Dispatch Timeout: 120s (number input)
- Active Dispatches: live list showing in-flight agent work

### 6. Chat UI Changes

Each message in TranscriptFeed gets a small brain badge:

```
┌─────────────────────────────────────┐
│ 🧠 Claude · 4.2s                    │
│ Based on my analysis of Expedition's │
│ monetization strategy...             │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ⚡ Grok · 0.3s                      │
│ It's 3:42 PM, Boss.                 │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 🤖 QA Advisor dispatched            │
│ Reviewing Expedition launch          │
│ readiness. I'll report back.         │
└─────────────────────────────────────┘
```

### 7. Architecture HTML Updates

Add to `docs/friday-architecture.html`:
- Dual-brain routing diagram (BrainRouter → Grok/Claude paths)
- Studio Tools section (dispatch_agent, query_studio, update_studio)
- Agent dispatch async flow
- Voice + Claude pipeline

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `council-of-elrond/friday/src/core/brain-router.ts` | Create | Routing logic + config |
| `council-of-elrond/friday/src/core/claude-brain.ts` | Create | Claude CLI subprocess wrapper |
| `council-of-elrond/friday/src/modules/studio/index.ts` | Create | Studio module (FridayModule) |
| `council-of-elrond/friday/src/modules/studio/dispatch-agent.ts` | Create | dispatch_agent tool |
| `council-of-elrond/friday/src/modules/studio/query-studio.ts` | Create | query_studio tool |
| `council-of-elrond/friday/src/modules/studio/update-studio.ts` | Create | update_studio tool |
| `council-of-elrond/friday/src/core/cortex.ts` | Modify | Add chatWithRouting(), brain metadata |
| `council-of-elrond/friday/src/core/voice/session-manager.ts` | Modify | Claude→Grok TTS passthrough |
| `council-of-elrond/friday/src/core/runtime.ts` | Modify | Boot BrainRouter + ClaudeBrain + studio module |
| `council-of-elrond/src/components/dashboard/friday/persona/BrainTab.jsx` | Modify | Add brain routing + Claude + dispatch settings |
| `council-of-elrond/src/components/dashboard/friday/TranscriptFeed.jsx` | Modify | Brain badge on messages |
| `council-of-elrond/docs/friday-architecture.html` | Modify | Add dual-brain + studio tools sections |

## Boot Sequence Addition

```
existing boot...
  → vox
  → studio context
  → ClaudeBrain (check claude CLI availability)
  → BrainRouter (load config from localStorage/IPC)
  → cortex (inject brainRouter + claudeBrain references)
  → register studio tools (dispatch_agent, query_studio, update_studio)
  → arc-rhythm
  → modules
  → session:start
```

## Error Handling

| Scenario | Response |
|----------|----------|
| Claude CLI not found | Log warning, BrainRouter permanently routes to Grok, UI shows "Claude unavailable" |
| Claude subprocess timeout | Return partial output, fall back to Grok |
| Claude non-zero exit | Log error, fall back to Grok for this message |
| Invalid agent/project slug | Return descriptive error: "Unknown agent '{slug}'. Available: market-analyst, qa-advisor, ..." — do not spawn subprocess |
| Agent dispatch timeout | Kill process, mark failed, notify user |
| Max dispatches reached | Queue request, notify user of queue position |
| Grok WebSocket down during Claude→TTS | Return text-only (no speech), queue for retry |
| Both brains fail | Return error message, emit error signal |

## Config Defaults

```typescript
const BRAIN_ROUTER_DEFAULTS = {
  mode: 'auto',
  shortQueryThreshold: 20,
  claudeKeywords: [
    'analyze', 'compare', 'explain why', 'review', 'design',
    'plan', 'evaluate', 'summarize', 'assess', 'recommend',
    'critique', 'break down', 'deep dive', 'what do you think',
    'walk me through',
  ],
  voiceClaudeEnabled: true,
};

const UI_DEFAULTS = {
  showBrainBadge: true,       // UI concern — passed to dashboard, not used by router
};

const CLAUDE_BRAIN_DEFAULTS = {
  timeout: 60,
  claudePath: 'claude',
  maxOutputChars: 32000,
};

const DISPATCH_DEFAULTS = {
  maxConcurrent: 3,
  dispatchTimeout: 120,
};
```

## Test Strategy

| Component | Approach | Key Cases |
|-----------|----------|-----------|
| BrainRouter | Unit tests (pure logic, no I/O) | Forced prefix routing, keyword matching with length gate, follow-up continuity, mode overrides, voice+claude disabled |
| ClaudeBrain | Unit tests with mock `Bun.spawn()` | Success path, timeout + partial output, non-zero exit, empty response retry, voice mode truncation |
| dispatch_agent | Unit tests with mock subprocess | Valid/invalid slugs, concurrent limit + queuing, timeout + kill, cancellation, completion detection |
| query_studio | Unit tests with mock filesystem | Keyword filtering per type, scope filtering, limit, empty results |
| update_studio | Unit tests with mock filesystem | Schema validation per action, rejection on missing fields, file write verification |
| Cortex.chatWithRouting | Integration tests | Grok path passthrough, Claude path ChatStream wrapping, brain metadata propagation |
| VoiceSessionManager | Integration tests | Claude→Grok TTS handoff, voice mode output truncation |
