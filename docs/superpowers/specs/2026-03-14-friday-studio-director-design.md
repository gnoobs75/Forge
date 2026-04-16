# Friday — Studio Director Integration

**Date:** 2026-03-14
**Status:** Approved design, ready for implementation planning

## Overview

Integrate Friday (F.R.I.D.A.Y. — Female Replacement Intelligent Digital Assistant Youth) as the Studio Director of Council of Elrond. Friday is an existing Bun-based agent runtime with Grok-powered voice (realtime WebSocket), SMARTS knowledge persistence, Sensorium environmental awareness, a module/plugin system, and clearance-gated permissions.

She becomes the voice-enabled executive layer of the studio — aware of all projects, agents, and data — able to command the 14 council agents, narrate studio events, deliver morning briefings, and respond to voice commands. Critically, she's **opt-in**: CoE works exactly as before without her.

**Source:** https://github.com/byronmcclain/friday.git

## Integration Model: Hybrid Sidecar

Friday runs as her own Bun server (port 3000). CoE's Electron main process connects as a WebSocket client. A custom **CoE Module** in Friday's forge system gives her native tools to read/write studio data and command agents. CoE gets a **Friday Panel** with VoiceOrb and a **floating mini-orb** on all views.

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│      CoE (Electron/Node)        │     │      Friday (Bun Server)        │
│                                 │     │                                 │
│  Dashboard (React)              │     │  Cortex (Grok LLM)             │
│  ├─ Friday Panel (VoiceOrb)  ◄──┼─WS──┼─► VoiceWorker (realtime)      │
│  ├─ Floating Mini-Orb          │     │  ├─ TextWorker (streamText)     │
│  ├─ All existing views          │     │  ├─ SMARTS (knowledge)          │
│  └─ Agent terminals             │     │  └─ Sensorium (env awareness)  │
│                                 │     │                                 │
│  Electron Main                  │     │  CoE Module (custom)            │
│  ├─ Friday Bridge (IPC↔WS)   ◄──┼─WS──┼─► read-features               │
│  ├─ PTY Manager (node-pty)      │     │  ├─ read-recommendations       │
│  ├─ chokidar watchers        ───┼─WS──┼─► read-activity-log           │
│  └─ Task Queue Dispatcher       │     │  ├─ read-progress              │
│                                 │     │  ├─ spawn-agent (→ IPC back)   │
│  hq-data/ (file system)        │     │  ├─ queue-task                  │
│  ├─ projects/*/features.json    │     │  └─ trigger-automation         │
│  ├─ task-queue.json (new)       │     │                                 │
│  └─ activity-log.json           │     │  GENESIS.md (Studio Director)   │
└─────────────────────────────────┘     └─────────────────────────────────┘
```

Key properties:
- Friday stays on Bun — no porting to Node
- Both systems independently upgradeable
- WebSocket is the only coupling point
- On/off toggle — when off, CoE runs exactly as before

## Phased Rollout

### Phase 1 — Studio Brain (text awareness)

Friday can answer any question about the studio. No voice yet, no agent commanding.

**CoE Module** — source lives in `council-of-elrond/friday-module/coe-studio/` (version-controlled with CoE). A setup script (`council-of-elrond/friday-module/setup.sh`) creates a symlink to `~/.friday/forge/coe-studio/`. Run manually after cloning (`npm run friday:setup` alias in package.json). The module's `onLoad()` checks for the symlink and logs a warning if missing, with instructions to run setup.

Read-only tools:

| Tool | Description | Clearance |
|------|-------------|-----------|
| `studio_projects` | Lists all projects with phase, progress %, platform | `read-fs` |
| `read_features` | Returns features.json for a project | `read-fs` |
| `read_recommendations` | Recent recs, filterable by agent/project/status | `read-fs` |
| `read_activity_log` | Recent agent actions across the studio | `read-fs` |
| `read_progress` | Progress scores for a project | `read-fs` |
| `read_context` | Project context.md | `read-fs` |
| `studio_overview` | Aggregated snapshot — all projects, agents, blockers, scheduled work | `read-fs` |

**Knowledge seeding** — on module load, auto-populates SMARTS with:
- Each project's identity (name, tech stack, audience, monetization, phase)
- The 14 agent roster (names, specialties, when to deploy each)
- Studio workflows (recommendations, automations, idea board)

**WebSocket Bridge** — Electron main process:
- Connects to Friday server at configured URL
- Relays messages between dashboard IPC and Friday WebSocket
- Connection lifecycle: connect on toggle-on, exponential backoff reconnect (1s → 2s → 4s → max 30s, 10 retries then give up), graceful disconnect on toggle-off
- On disconnect: mini-orb shows "off" state, Friday Panel shows "Disconnected — Reconnecting..." banner, in-flight task queue items marked `interrupted` (not lost)

**WebSocket Message Protocol** — JSON envelope over Friday's existing `/ws` endpoint:
```json
// CoE → Friday (text message)
{"type": "chat:message", "content": "What's Expedition's status?", "clientType": "text"}

// CoE → Friday (studio event for narration)
{"type": "coe:event", "event": "rec-created", "agent": "Market Analyst", "project": "expedition", "detail": "..."}

// Friday → CoE (text response stream)
{"type": "chat:delta", "content": "Expedition is at 85%...", "done": false}

// Friday → CoE (tool execution request — agent spawn)
{"type": "coe:command", "command": "spawn-agent", "args": {"agent": "qa-advisor", "project": "expedition", "instruction": "..."}, "confirmRequired": true}

// CoE → Friday (confirmation)
{"type": "coe:confirm", "commandId": "cmd-001", "approved": true}

// Phase 2 — binary audio frames use a separate channel
// CoE → Friday: {"type": "voice:start", "format": "pcm16", "sampleRate": 24000}
// Then raw binary frames over the same WebSocket (distinguished by message type: string = JSON, binary = audio)
// Friday → CoE: same pattern — JSON control messages + binary audio response frames
```
This extends Friday's existing WebSocket protocol (which already handles `chat:message`, `chat:delta`, `voice:audio`, `session:identify`). The `coe:event`, `coe:command`, and `coe:confirm` types are new.

**Basic Friday Panel** — React component:
- Text chat interface (no VoiceOrb yet)
- Studio status cards (project progress, active agents)
- Transcript feed

**Settings:**
- Friday enabled toggle (master on/off)
- Server URL
- Grok API key (safeStorage)

### Phase 2 — Voice & Visual

Friday speaks, listens, and proactively updates.

**VoiceOrb** — ported from Friday's web client:
- Three.js particle sphere with state-dependent animations
- States: idle pulse, speaking, listening, working, off
- Renders in the Friday Panel's left column

**Floating Mini-Orb** — persistent on all dashboard views:
- Bottom-right corner, 56px purple orb
- Speech bubble for ambient narration snippets
- Click to expand full Friday Panel
- Same 5 visual states as full VoiceOrb
- Dims during quiet mode

**Grok Realtime Voice Relay:**
- Browser captures mic audio via MediaRecorder → PCM 16-bit, 24kHz (matches Grok's expected format)
- Audio sent to Electron main process via IPC using `ArrayBuffer` (new IPC channel: `friday:audio-out`)
- Main process relays binary frames to Friday server via WebSocket
- Friday routes to Grok realtime WebSocket (STT + reasoning + TTS)
- Audio response streams back: Friday WS → CoE main (`friday:audio-in` IPC) → browser Web Audio API playback
- Voice: configurable (Eve default), Grok voices: Ara, Eve, Rex, Sal, Leo
- **Latency note:** 4-hop relay (browser → Electron → Friday → Grok → back) adds ~50-100ms vs. direct. Acceptable for conversational voice but worth monitoring. If latency is problematic, Phase 2.1 could establish a direct browser↔Friday WebSocket for audio only.

**Morning Briefing** — triggers on session connect:
- Friday reads: activity-log.json, task-queue.json, features.json changes, new recommendations, execution-log.json, scheduled automations
- Synthesizes into a spoken Studio Director summary
- Example: "Morning boss. Three things since last time. Market Analyst dropped a pricing analysis for Expedition. Creative Thinker posted two new ideas for TTR. QA Advisor is scheduled to run today."

**Ambient Narration** — ongoing while Friday is on:
- chokidar events forwarded to Friday via WebSocket
- Event-to-narration mapping:

| Event | Example narration |
|-------|-------------------|
| New recommendation | "Store Optimizer just filed a keyword analysis for TTR iOS." |
| Recommendation resolved | "Got it, marking that one done." |
| Agent terminal exits | "QA Advisor finished their assessment. Want me to summarize?" |
| New idea posted | "Creative Thinker has a new idea — something about an AOE superweapon." |
| Automation fires | "Studio Producer's daily report just kicked off." |
| features.json updated | "Tech Architect updated Expedition — 3 features moved to complete." |

- Throttled: events within 30s batched ("A few things just happened...")
- Quiet mode: "Friday, quiet" → stops narrating, keeps listening. "Friday, I'm back" → resumes. Mini-orb dims.

**Voice controls:**
- Push-to-talk hotkey (default: `Ctrl+Shift+F`)
- Wake word toggle ("Hey Friday" — requires always-on mic)
- Mute button

### Phase 3 — Agent Commander

Friday can dispatch agents and orchestrate multi-agent work.

**Write/command tools** added to CoE Module:

| Tool | Description | Clearance |
|------|-------------|-----------|
| `spawn_agent` | Sends `coe:command` via WS → CoE creates PTY with agent skill + custom instruction. New IPC channel `terminal:create-friday-task` extends existing PTY creation with an `instruction` field injected as the first user message after agent skill loads. | `exec-shell`, `write-fs` |
| `queue_task` | Sends `coe:command` via WS → CoE writes to task-queue.json. All task queue writes go through Electron (single writer) to avoid race conditions. Friday never writes the file directly. | `write-fs` |
| `post_activity` | Append to activity-log.json (Friday's own actions) | `write-fs` |
| `trigger_automation` | Fire an existing automation immediately | `exec-shell` |

**Authority model: Confirm-then-execute**
- Friday acknowledges the command, describes what she'll do, asks for approval
- Approve via voice ("do it"), click (approve button), or text
- Only then does she execute

**Single-agent flow (direct spawn):**
1. User: "Friday, get Market Analyst to look at Expedition pricing"
2. Friday: "I'll spawn Market Analyst for a pricing analysis on Expedition. Go ahead?"
3. User approves → PTY created via IPC → agent skill loaded → task instruction fed
4. Mini-orb shows "working" state
5. On completion: Friday reads output, narrates summary

**Multi-agent flow (task queue):**
1. User: "Full launch readiness on TTR iOS — QA, Store Optimizer, Market Analyst"
2. Friday builds task plan, confirms all three
3. User approves → dispatcher reads task-queue.json, spawns agents
4. Friday tracks progress, narrates each completion
5. When all done: aggregated summary

**Task queue** (`hq-data/task-queue.json`):
```json
{
  "id": "task-001",
  "requested_by": "friday",
  "timestamp": "2026-03-14T10:30:00Z",
  "project": "ttr-ios",
  "agents": [
    {"agent": "qa-advisor", "instruction": "Full launch readiness assessment", "status": "pending"},
    {"agent": "store-optimizer", "instruction": "Store listing audit", "status": "pending"},
    {"agent": "market-analyst", "instruction": "Competitive positioning check", "status": "pending"}
  ],
  "strategy": "parallel",
  "status": "pending-approval"
}
```

**Sequencing strategies:**
- `parallel` — all agents at once (default for independent tasks)
- `sequential` — one after another, each gets previous agent's output
- `conditional` — run first agent, only continue if it passes

**Task status flow:** `pending-approval` → `approved` → `in-progress` → `completed` / `failed`

**Silent vs. confirmed actions:**

| Action | Confirmation required? |
|--------|----------------------|
| Read any studio data | No |
| Summarize recommendations | No |
| Answer questions about features/progress | No |
| Search SMARTS knowledge | No |
| Spawn agent terminal | Yes |
| Write to hq-data | Yes |
| Trigger automation | Yes |
| Dismiss/resolve recommendation | Yes |

## UI Components

### Full Friday Panel

New top-level sidebar nav item (same level as Studio Overview, Recommendations, etc.). Clicking the floating mini-orb also navigates here. Grid layout:

- **Left column:** VoiceOrb (Three.js particle sphere), voice controls (push-to-talk, mute), session stats (uptime, Grok calls, tasks dispatched)
- **Top-right:** Studio snapshot cards (per-project progress %, phase, active agents)
- **Middle-right:** Transcript feed (morning briefing, voice exchanges, confirm prompts with approve/cancel buttons)
- **Bottom-right:** Text input fallback for typing

### Floating Mini-Orb

Persistent bottom-right corner on all dashboard views:

- 56px purple orb with breathing glow animation
- Speech bubble for narration snippets (auto-dismiss after 5s)
- 5 states:
  - **Idle pulse** (purple glow) — Friday listening
  - **Speaking** (green, particles animate) — Friday talking
  - **Listening** (blue, ring pulses with amplitude) — user speaking
  - **Working** (orange, spinning) — agent task in progress
  - **Off** (dimmed, static) — Friday disabled
- Click → navigates to full Friday Panel
- Name label below: "Friday"

## Friday's Identity (GENESIS)

Studio Director persona layered on Friday's base personality:

- Calls user "boss"
- Knows she manages 14 specialist agents across 3 games
- Uses game dev vocabulary (sprint, ship-blocking, polish pass, gold master)
- Confident, direct, slightly warm — competent exec who respects your time
- Has opinions about agent recommendations but defers game design decisions to boss + specialists
- Understands agent alliances and tensions
- Complements Studio Producer (operational scheduling) with executive direction
- Won't override explicit user choices or pretend to know things she doesn't
- Concise spoken sentences, effective pauses, matches urgency to context
- Default voice: Eve (configurable)

## Settings

New "Friday" section in CoE Settings Panel:

| Setting | Type | Default |
|---------|------|---------|
| Friday enabled | Toggle | Off |
| Friday server URL | Text | `ws://localhost:3000/ws` |
| Grok API key | Secret (safeStorage) | — |
| Voice | Dropdown (Ara/Eve/Rex/Sal/Leo) | Eve |
| Morning briefing | Toggle | On |
| Ambient narration | Toggle | On |
| Narration verbosity | Slider (Low/Medium/High) | Medium |
| Quiet hours | Time range | None |
| Push-to-talk key | Hotkey | `Ctrl+Shift+F` |
| Wake word | Toggle | Off |
| Confirm level | Dropdown | All commands |

Verbosity levels:
- **Low:** Blockers and errors only
- **Medium:** Recs, ideas, completions, blockers
- **High:** Everything including automation fires and feature updates

Confirm levels:
- **All commands:** Every agent spawn, write, automation trigger
- **Write operations only:** Reads and spawns are auto-approved
- **Never:** YOLO mode, Friday acts immediately

## Data Changes

**New file:** `hq-data/task-queue.json` — Friday's multi-agent task orchestration queue

**Modified:** `hq-data/activity-log.json` — Friday's own actions get logged with `agent: "Friday"`, `agentColor: "#D946EF"` (fuchsia — distinct from Player Psychologist's #7C3AED)

**New directory:** `council-of-elrond/friday-module/coe-studio/` — CoE Module source (symlinked to `~/.friday/forge/coe-studio/` at setup)

**New file:** Custom GENESIS.md for Studio Director persona — default location: `council-of-elrond/friday-module/GENESIS-studio-director.md`, configurable via `FRIDAY_GENESIS_PATH` env var

## New IPC Channels (preload.cjs)

Phase 1:
- `friday:connect` / `friday:disconnect` — toggle WebSocket bridge
- `friday:status` — connection state (connected/disconnected/reconnecting)
- `friday:send` — send text message to Friday
- `friday:message` — receive text/delta from Friday
- `friday:command-confirm` — Friday requesting confirmation for a command
- `friday:command-respond` — user approving/denying a command
- `friday:event` — forward chokidar events to Friday

Phase 2:
- `friday:audio-out` — send binary audio from browser mic to main process (ArrayBuffer)
- `friday:audio-in` — receive binary audio from Friday for playback (ArrayBuffer)
- `friday:voice-state` — voice session state changes (idle/listening/speaking)

Phase 3:
- `terminal:create-friday-task` — spawn agent PTY with custom instruction (extends existing terminal IPC pattern)
- `friday:task-update` — task queue status changes for UI updates

## Naming Convention: Grok vs. Groq

The codebase uses two similarly-named but unrelated LLM providers:
- **Grok** (xAI) — Friday's voice and reasoning engine. All references prefixed with `friday` or `xai` in code.
- **Groq** (Groq Inc.) — Council Chat banter engine. Existing references use `groq:` prefix.

Never abbreviate in variable names. Use full names: `fridayGrokKey`, `groqApiKey`. Never `grokKey` alone (ambiguous).

## Technical Constraints

- Friday runs on Bun, CoE runs on Node/Electron — no shared runtime
- WebSocket is the only coupling point between the two systems
- Grok API key required for voice (xAI, separate from Groq for council banter)
- Voice audio must relay through Electron main process (browser → IPC → WS → Friday → Grok → back)
- chokidar events are the source of truth for file change detection
- Task queue dispatcher runs in Electron main process (has PTY access)
- SMARTS knowledge persists in Friday's SQLite — survives restarts
- Friday's VoiceOrb is Three.js — compatible with CoE's existing Three.js usage (AvatarGrid)
