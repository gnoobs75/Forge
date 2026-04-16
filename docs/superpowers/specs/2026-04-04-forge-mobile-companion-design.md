# Forge Mobile Companion — Design Spec

**Date:** 2026-04-04
**Status:** Approved

## Overview

A personal iOS remote control app for the Forge, deployed via TestFlight. Connects to the Forge running on the user's home machine over Tailscale VPN. Core purpose: monitor agent activity, manage recommendations, and interact with CLI sessions remotely — primarily via voice and large tap-friendly buttons.

Not intended for App Store distribution. Personal use only.

## Architecture

**Approach:** Extend the existing Friday Bun server (port 3100) with a mobile API module. No new processes. The phone connects via Tailscale to `<forge-tailscale-ip>:3100`. Auth uses the existing `FRIDAY_REMOTE_TOKEN` Bearer token.

**Networking:** Tailscale mesh VPN. Zero config, encrypted, no exposed ports, no domain needed. Install Tailscale on the Forge machine and the iPhone. They see each other on a private network from anywhere.

## Mobile App

**Framework:** Expo (React Native) + TypeScript
**Navigation:** Expo Router (file-based, tab layout)
**State:** Zustand (consistent with Forge desktop)
**Styling:** NativeWind (Tailwind for React Native)
**Voice Input:** expo-speech + iOS native speech-to-text
**Notifications:** expo-notifications (local push when sessions need input)
**WebSocket:** React Native built-in WebSocket
**Deploy:** EAS Build → TestFlight. OTA updates via `eas update` for JS-only changes.
**Location:** `Forge/mobile/`

## Navigation — Four Tabs

### Tab 1: Overview
At-a-glance status dashboard.
- Tailscale + Forge connection status indicator
- Alert banner when CLI sessions need input (red, pulsing, tap to jump to CLI tab)
- Activity ticker — latest agent actions from `activity-log.json`
- Quick stats: project count, active agents, running sessions
- Push notifications fire when a session transitions to "needs input"

### Tab 2: Recommendations
Agent recommendations across projects.
- Filterable list by project
- Each rec shows: agent, title, summary, effort/impact, status
- Tap to see full approaches with trade-offs
- Actions: approve, dismiss, kick off implementation
- Activity feed per project (filtered view of activity log)

### Tab 3: Projects
Project-level detail.
- Project cards with health status summary
- Tap for detail: feature registry, progress scores, metering/token usage
- Link to project's active CLI sessions

### Tab 4: CLI Command Center
Tree view of all active CLI sessions, grouped by project.
- Status badges per session: 🟢 running, 🔴 needs input (pulsing), ⏸ idle, ✓ complete
- Badge count on tab icon shows sessions needing input
- Tap a session to enter the interaction view

### CLI Session Interaction View
Full-screen view when tapped into a specific session.

**Header:** Agent name + avatar, project name, task description, status indicator, back button.

**Terminal Output:** Last ~20 lines of PTY output, monospace, dark background. The detected prompt is highlighted at the bottom.

**Smart Prompt Buttons:** Dynamically generated based on prompt detection:
- **Binary prompts** (yes/no, y/n, proceed?, continue?) → Big green YES / red NO buttons
- **Permission prompts** (allow/deny tool use) → Allow, Deny, "Yes, never ask again" buttons
- **Numbered choices** (1. Option A, 2. Option B) → Numbered tap chips
- **Open-ended** (no detected pattern) → Text input + mic button only

**Voice Input:** Purple mic button. Tap to activate iOS speech-to-text, result sent as terminal input. Works for quick ("yes") and long ("yes but also add validation on the email field") responses.

**Text Input:** Fallback text field with send button. Always available below the prompt buttons.

### Other Screens

- **connect.tsx** — First-run setup: enter Forge Tailscale IP + auth token. Saved to secure storage.
- **rec/[id].tsx** — Recommendation detail with full approaches list.
- **project/[slug].tsx** — Project detail with features, progress, metering.
- **session/[scopeId].tsx** — The CLI interaction view described above.

## Server Side

All new server code lives in `friday/src/modules/mobile/`. No new processes — extends the existing Friday Bun server.

### New Files

```
friday/src/modules/mobile/
├── index.ts              — Module entry, registers routes + WS handlers
├── routes.ts             — REST API endpoints (/api/mobile/*)
├── terminal-bridge.ts    — WS relay: phone ↔ Friday ↔ Electron PTY
├── session-registry.ts   — Tracks active sessions, status, metadata
├── prompt-detector.ts    — Parses PTY output for prompt patterns
└── alerts.ts             — Fires events when sessions need input
```

### REST Endpoints

All require `Authorization: Bearer {FRIDAY_REMOTE_TOKEN}`.

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/mobile/status` | Connection health, session counts, alert count |
| GET | `/api/mobile/overview` | Activity feed, stats, alert badges |
| GET | `/api/mobile/recommendations` | Recommendations across projects (filterable by `?project=slug`) |
| POST | `/api/mobile/recommendations/:id/action` | Approve / dismiss / implement a recommendation |
| GET | `/api/mobile/projects` | Project list with health summary |
| GET | `/api/mobile/projects/:slug` | Project detail: features, progress, metering |
| GET | `/api/mobile/sessions` | All CLI sessions with status + detected prompt type |

### WebSocket Channels

| Path | Purpose |
|------|---------|
| `/ws/mobile` | Real-time event stream: activity updates, session status changes, input-needed alerts |
| `/ws/terminal/:scopeId` | Live PTY stream for a specific session. Sends output frames, accepts input text. |

### Terminal Bridge

Friday cannot directly access Electron's node-pty instances — they live in the Electron main process. The bridge works via the existing WebSocket connection between Friday and Electron:

1. Phone connects to `/ws/terminal/:scopeId`
2. Friday sends `terminal:subscribe { scopeId }` to Electron via IPC bridge
3. Electron tees PTY output to Friday over the bridge
4. Friday relays to phone, runs prompt detector on each chunk
5. Phone sends input → Friday → Electron IPC → PTY write

### Prompt Detector

Regex-based parser that runs on the PTY output buffer. Detects:

- **Binary:** `(yes|no)`, `(y/n)`, `proceed?`, `continue?`, `Do you want to`
- **Permission:** `allow`, `deny`, Claude Code tool permission patterns
- **Numbered:** Lines matching `^\s*\d+[.)]\s+` (numbered option lists)
- **"Never ask again":** Claude Code's specific permission prompt pattern

Returns a `PromptType` enum + extracted options for the phone to render buttons.

### Session Registry

In-memory `Map<scopeId, SessionInfo>` synced with Electron's PTY process map via IPC.

```typescript
interface SessionInfo {
  scopeId: string;
  project: string;           // project slug
  agent: string;             // agent name (if known)
  status: 'running' | 'waiting' | 'idle' | 'complete';
  promptType: PromptType | null;
  promptOptions: string[];   // detected button labels
  lastOutput: string[];      // last ~20 lines
  startedAt: string;         // ISO timestamp
  taskDescription: string;   // what the session is working on
}
```

### Electron Modifications

Minimal changes to `electron/main.cjs`:
- New IPC handler: `mobile:list-sessions` — returns PTY process metadata
- New IPC handler: `mobile:subscribe-terminal` — tees PTY output to Friday WS
- Extend existing Friday WS bridge to relay terminal subscribe/input/output messages
- Emit session lifecycle events (created, exited) to Friday

### Alert System

When the prompt detector identifies a session in "waiting" state:
1. Updates session registry
2. Fires `session:needs-input` event over `/ws/mobile`
3. Phone receives event, shows local push notification (even when backgrounded)
4. Notification tap deep-links to `session/[scopeId]`

## Mobile App File Structure

```
Forge/mobile/
├── app/
│   ├── _layout.tsx              — Root layout (auth gate, connection check)
│   ├── connect.tsx              — First-run setup screen
│   ├── (tabs)/
│   │   ├── _layout.tsx          — Tab bar with badge counts
│   │   ├── index.tsx            — Overview tab
│   │   ├── recs.tsx             — Recommendations tab
│   │   ├── projects.tsx         — Projects tab
│   │   └── cli.tsx              — CLI command center tab
│   ├── rec/[id].tsx             — Recommendation detail
│   ├── project/[slug].tsx       — Project detail
│   └── session/[scopeId].tsx    — CLI session interaction
├── components/
│   ├── ActivityFeed.tsx
│   ├── AlertBanner.tsx
│   ├── ProjectCard.tsx
│   ├── RecommendationCard.tsx
│   ├── SessionTree.tsx
│   ├── SessionInteraction.tsx
│   ├── PromptButtons.tsx
│   ├── VoiceInput.tsx
│   └── ConnectionStatus.tsx
├── lib/
│   ├── api.ts                   — REST client with auth
│   ├── ws.ts                    — WebSocket manager (mobile + terminal channels)
│   ├── store.ts                 — Zustand store
│   ├── prompt-types.ts          — Shared prompt type definitions
│   └── notifications.ts         — Push notification setup
├── app.json                     — Expo config
├── eas.json                     — EAS Build config
├── package.json
└── tsconfig.json
```

## Design Principles

- **Voice-first for longer input, tap-first for quick responses.** The big buttons are for keeping agents unblocked fast. Voice is for when you need to give real instructions.
- **Smart, not raw.** This is not a terminal emulator on a phone. It's a prompt responder that shows you just enough context to make a decision.
- **Glanceable.** Overview tab answers "is anything blocked?" in under a second. Badge on CLI tab tells you how many sessions need you without opening it.
- **Personal tool.** No multi-user auth, no App Store compliance, no analytics. Just works for one person over Tailscale.

## Out of Scope (v1)

- Full terminal emulator (scroll through all output)
- Agent dispatch from phone (kick off new agents — only respond to running ones)
- Friday voice chat from phone (use existing Friday web UI for that)
- Multi-user access
- App Store submission
