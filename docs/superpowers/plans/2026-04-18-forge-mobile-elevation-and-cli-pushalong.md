# Forge Mobile Companion — Elevation, CLI Pushalong, & TestFlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the existing `Forge/mobile/` Expo app to a first-class tracked FORGE project with Android-emulator-from-Windows launchers, close the remaining gaps in the mobile→CLI pushalong loop (log-hydration-on-reconnect + larger buffer + verified end-to-end prompt reply), and produce a first TestFlight build from the MacBook.

**Architecture:** The plan is three phases that ship independently.

- **Phase 1 (data-only, no code):** Scaffold `hq-data/projects/forge-mobile/` with the standard project files (`project.json`, `features.json`, `context.md`, `progress.json`) plus a `tools.json` seeded with Expo launchers. This piggybacks on Forge's existing Project Tools tab (landed 2026-04-17 in commits for `terminal:create-tool` IPC + `ProjectTools.jsx` container) — no new Forge UI code required. The dashboard auto-discovers projects by scanning `hq-data/projects/*/project.json` (see `electron/main.cjs:1192`), so adding the folder makes the project appear.
- **Phase 2 (Friday + mobile code):** The backend pushalong is already wired — `electron/main.cjs:1977` routes `mobile:terminal:input` WebSocket messages to `proc.write(data)`, and `friday/src/modules/mobile/session-registry.ts:58` detects prompts via `detectPrompt()`. What's missing is reconnect-safe log hydration and a larger rolling buffer. Add a `/api/mobile/sessions/:scopeId/logs` REST endpoint, raise `MAX_OUTPUT_LINES` from 30 → 500, wire `mobile/app/session/[scopeId].tsx` to fetch history on mount.
- **Phase 3 (release config, no runtime code):** Fill `mobile/eas.json` Apple credentials, bump version/build numbers, run `eas build` + `eas submit` from macOS, log the launch in activity-log.

**Tech Stack:** Forge Electron + Vite + React 18 (dashboard); Friday Bun + TypeScript (server, routes, registry); Expo 54 + React Native 0.81 + Expo Router v6 (mobile); JSON config (hq-data).

---

## Execution context: running inside Forge

Same constraint as the 2026-04-17 plan — this may execute inside the Forge Electron app's own Claude CLI.

- **Forge renderer** (`src/**/*.jsx`): HMR reloads immediately, no restart.
- **Forge main/preload** (`electron/*.cjs`): requires full Electron restart. **No main.cjs edits are needed in this plan**, so no restart required.
- **Friday** (`friday/src/**/*.ts`): requires `bun run dev` or Friday server restart for route changes to take effect. Friday runs as a sibling process — restarting it does NOT kill the Forge Claude CLI.
- **Mobile** (`mobile/**/*.tsx`): Expo dev server hot-reloads; no restart needed if Metro is running.

---

## Defaults locked (decided before plan start)

1. **Project slug:** `forge-mobile` — matches the existing `expo.slug` in `mobile/app.json`.
2. **Project phase:** `build` — active development, pre-TestFlight.
3. **repoPath:** `c:\\Claude\\Samurai\\Forge\\mobile` (Windows double-backslash form, matches Homestead).
4. **Project color:** `#06B6D4` (Expo cyan, distinguishes from Homestead's phase color).
5. **Agent invocation:** FORGE agents are allowed to work on `forge-mobile` as a tracked project. The CLAUDE.md project-boundary list in `c:/Claude/Samurai/CLAUDE.md` must be updated.
6. **Activity logging:** All phase completions append to `hq-data/activity-log.json` with agent = "Claude (plan executor)", agentColor = `#06B6D4`.
7. **Commit strategy:**
   - Forge repo (`c:/Claude/Samurai/Forge/`): one commit per sub-task.
   - hq-data (if separate git repo — `c:/Claude/Samurai/hq-data/`): one commit per task OR `.claude/settings.local.json`-watched; check with `git status` first.
   - CLAUDE.md lives at `c:/Claude/Samurai/CLAUDE.md` — check if that's tracked in a parent repo or standalone.
8. **Mobile buffer size:** 500 lines (up from 30). Rationale: 30 is enough for prompt detection but insufficient for a mobile user scrolling back to understand a Claude session's reasoning. 500 is ~5-10 screens of terminal output — enough for one-agent-turn context without blowing memory (each session capped at ~50KB RAM).
9. **Logs endpoint shape:** `GET /api/mobile/sessions/:scopeId/logs` returns `{ lastOutput: string[], status, prompt, startedAt }` — the SessionInfo fields mobile needs for hydration.
10. **Voice input scope:** OUT of this plan. `VoiceInput.tsx` is stubbed; wiring real speech-to-text is a separate follow-up. This plan verifies **text input** end-to-end only.
11. **iOS bundle identifier:** `com.forge.mobile` (already set in `app.json:16`). Do not change.
12. **TestFlight profile:** `preview` build distribution `internal` for initial TestFlight — fewer approval steps than `production`.

---

## Schema reference (read-only for this plan)

From the 2026-04-17 Project Tools plan (already landed):

```ts
type Fidelity = 'iOS true' | 'iOS-like' | 'Android-native' | 'Web' | 'Neutral';
type Platform = 'win32' | 'darwin' | 'linux';

interface Tool {
  id: string; name: string; description: string; category: string;
  fidelity: Fidelity; command: string;
  cwd?: string; env?: Record<string, string>; docs?: string;
  setupRequired?: string; platforms?: Platform[];
}
interface ToolsConfig { tools: Tool[] }
```

Project discovery: `electron/main.cjs:1192` calls `fs.readdirSync(projectsDir, { withFileTypes: true })` on `hq-data/projects/`, then reads each subfolder's `project.json`. Required fields: `slug`, `name`, `description`, `repoPath`. `phase`, `progress`, `techStack`, `platforms`, `client` are optional but rendered if present.

Session registry (Friday): `friday/src/modules/mobile/session-registry.ts` — `MAX_OUTPUT_LINES = 30` at line 5 is the rolling buffer cap. `appendOutput()` at line 47 splits on `\n` and slices the tail. `detectPrompt()` at line 58 is already wired.

Mobile terminal bridge (Friday): `friday/src/modules/mobile/terminal-bridge.ts:39` — `sendInput(scopeId, data)` sends `mobile:terminal:input` to Electron. Electron main.cjs:1977 receives and calls `proc.write(data)`. This path is already complete.

---

# Phase 1 — Elevate `Forge/mobile/` to a FORGE project

## Task 1.1: Update CLAUDE.md project boundary

**Files:**
- Modify: `c:/Claude/Samurai/CLAUDE.md`

- [ ] **Step 1: Read the current boundary list**

Read `c:/Claude/Samurai/CLAUDE.md`. Find the section starting with `### Project Boundary — FORGE Projects ONLY`. The current list is four bullets: `safetyfirst-credentialing`, `council-of-elrond`, `homestead`, `_template`.

- [ ] **Step 2: Add forge-mobile to the boundary list**

Replace the bullet list (exact text) with this extended version:

```markdown
### Project Boundary — FORGE Projects ONLY
**CRITICAL: FORGE manages ONLY these software projects:**
- `safetyfirst-credentialing` — SafetyFirst healthcare credentialing platform (C:\Users\charl\Desktop\Ronin\SafetyFirst)
- `council-of-elrond` — CoE tracked as a FORGE client project
- `homestead` — Homestead project
- `forge-mobile` — Forge's own mobile companion app (C:\Claude\Samurai\Forge\mobile)
- `_template` — Cross-portfolio reports
```

Leave the rest of the Project Boundary section unchanged (the warnings about `expedition`, `ttr-ios`, `ttr-roblox`, `beatdown` still apply verbatim).

- [ ] **Step 3: Check whether CLAUDE.md is under git control**

Run:
```bash
cd c:/Claude/Samurai
git status CLAUDE.md 2>/dev/null
```

If output says "not a git repository" or CLAUDE.md is untracked at the Samurai level, skip the commit step. Otherwise commit:

```bash
cd c:/Claude/Samurai
git add CLAUDE.md
git commit -m "chore(forge): add forge-mobile to FORGE project boundary"
```

---

## Task 1.2: Create `hq-data/projects/forge-mobile/project.json`

**Files:**
- Create: `c:/Claude/Samurai/hq-data/projects/forge-mobile/project.json`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p "c:/Claude/Samurai/hq-data/projects/forge-mobile/recommendations"
mkdir -p "c:/Claude/Samurai/hq-data/projects/forge-mobile/ideas"
```

- [ ] **Step 2: Write project.json**

```json
{
  "slug": "forge-mobile",
  "name": "Forge Mobile",
  "description": "Mobile companion for Forge — Expo React Native app that connects to the Friday server over Tailscale + WebSocket to view sessions, launch agents, approve recommendations, and reply to Claude prompts from a phone.",
  "techStack": [
    "Expo (React Native 0.81)",
    "Expo Router v6",
    "TypeScript",
    "Zustand",
    "Tailwind + NativeWind v4",
    "expo-secure-store",
    "expo-speech",
    "expo-notifications",
    "React Native New Architecture"
  ],
  "platforms": ["iOS", "Android"],
  "client": "Internal — Charlton",
  "phase": "build",
  "repoPath": "C:\\Claude\\Samurai\\Forge\\mobile",
  "color": "#06B6D4",
  "progress": 70,
  "progressNotes": "Connection + auth + four tabs (Overview, Projects, Recommendations, CLI) shipped. Session detail screen shows live terminal output via WebSocket and sends mobile:terminal:input for prompt replies. Backend pushalong loop is wired end-to-end (electron/main.cjs:1977 routes input to PTY). Remaining: reconnect log hydration, larger rolling buffer, voice input, TestFlight build.",
  "deadline": null,
  "teamSize": 1,
  "lastUpdated": "2026-04-18T00:00:00Z"
}
```

- [ ] **Step 3: Commit (if hq-data is a git repo)**

```bash
cd c:/Claude/Samurai/hq-data
git status 2>/dev/null | head -3
```

If tracked:
```bash
git add projects/forge-mobile/project.json
git commit -m "feat(forge-mobile): register project.json"
```

If not tracked or not a git repo: skip. Forge's dashboard watches `hq-data/projects/` and will pick up the file regardless.

---

## Task 1.3: Create `context.md`

**Files:**
- Create: `c:/Claude/Samurai/hq-data/projects/forge-mobile/context.md`

- [ ] **Step 1: Write context.md**

```markdown
# Forge Mobile — Context

**What this is:** Forge's own mobile companion app, living at `C:\Claude\Samurai\Forge\mobile`. Expo React Native. Connects to the Friday server (the Forge backend) via HTTP + WebSocket over Tailscale with token auth.

## Why it exists

Charlton runs Forge on a Windows desktop. When an agent session hits a `(y/n)` or `[approve/dismiss]` prompt and the desk is unattended, the whole pipeline stalls. Mobile lets the user:
- See live session status (running / waiting / complete) from anywhere on Tailscale
- Read the last N lines of terminal output
- Reply to waiting prompts with one tap (yes / no / approve / dismiss)
- Launch a new agent session against a project without opening Forge
- Approve or dismiss recommendations

This isn't a standalone product — it's a remote control for Forge.

## Architecture

- **Entry:** `index.ts` → `App.tsx` → `app/_layout.tsx` (Expo Router root)
- **Auth:** Token + Tailscale IP in Expo Secure Store (`lib/connection.ts`)
- **State:** Zustand single store (`lib/store.ts`)
- **Transport:**
  - REST for reads/writes: `GET /api/mobile/*` (see `friday/src/modules/mobile/routes.ts`)
  - WebSocket for live terminal: `/ws/terminal/:scopeId` streams `terminal:data` + `terminal:exit`
  - WebSocket for session events: `/ws/mobile` broadcasts `session:needs-input`, `session:complete`
- **Tabs:** Overview, Projects, Recommendations, CLI (see `app/(tabs)/`)
- **Session detail:** `app/session/[scopeId].tsx` — live output + prompt reply UI

## What's shipped vs. stubbed

**Shipped (as of 2026-04-18):**
- Connection flow, four tabs, recommendation approval, agent launch, session list, live terminal stream, prompt-reply via text input, WebSocket reconnect logic.

**Stubbed:**
- `components/VoiceInput.tsx` — mic button with no speech-to-text wiring (falls back to text via native keyboard mic).
- No log-hydration-on-reconnect endpoint — the 30-line buffer in `friday/src/modules/mobile/session-registry.ts` is all the history mobile gets if it reconnects mid-session.
- TestFlight / App Store submission — `eas.json` has stub Apple credentials.

## Build/test from Windows

Use the Project Tools tab in Forge: launch **Expo on Android emulator** (requires Android Studio + AVD running). Web preview works cross-platform but has reduced native-module fidelity.

## Build from MacBook

From `cd c:/Claude/Samurai/Forge/mobile`:
- `npx expo prebuild --clean` regenerates `ios/` + `android/` native projects
- `eas build --platform ios --profile preview` builds for TestFlight
- `eas submit --platform ios --profile production` uploads

## Related

- Friday module: `friday/src/modules/mobile/` (routes, session-registry, terminal-bridge, prompt-detector)
- Forge Electron IPC: `electron/main.cjs:1977` (mobile:terminal:input → PTY write)
- Parent plan (this): `docs/superpowers/plans/2026-04-18-forge-mobile-elevation-and-cli-pushalong.md`
```

---

## Task 1.4: Create `features.json`

**Files:**
- Create: `c:/Claude/Samurai/hq-data/projects/forge-mobile/features.json`

- [ ] **Step 1: Write features.json**

```json
{
  "project": "forge-mobile",
  "lastUpdated": "2026-04-18T00:00:00Z",
  "features": [
    {
      "id": "connection-auth",
      "name": "Connection + Token Auth",
      "status": "completed",
      "description": "Token + Tailscale IP stored in Expo Secure Store. Connect screen validates reachability before enabling main tabs.",
      "phase": "v1",
      "testCoverage": "manual",
      "testNotes": "Verified on physical iPhone + Android emulator. Reconnect after token expiry surfaces the connect screen.",
      "codeLocations": ["mobile/lib/connection.ts", "mobile/app/connect.tsx"]
    },
    {
      "id": "tab-overview",
      "name": "Overview Tab",
      "status": "completed",
      "description": "Dashboard showing session stats (total/running/waiting/complete), recent activity log, waiting-session alerts.",
      "phase": "v1",
      "testCoverage": "manual",
      "codeLocations": ["mobile/app/(tabs)/index.tsx", "friday/src/modules/mobile/routes.ts"]
    },
    {
      "id": "tab-projects",
      "name": "Projects Tab",
      "status": "completed",
      "description": "Lists all FORGE projects with slug/name/phase/progress. Tap opens a modal with project details.",
      "phase": "v1",
      "testCoverage": "manual",
      "codeLocations": ["mobile/app/(tabs)/projects.tsx"]
    },
    {
      "id": "tab-recommendations",
      "name": "Recommendations Tab",
      "status": "completed",
      "description": "Lists all agent recommendations across projects with filter by project. Approve/dismiss actions call Friday REST.",
      "phase": "v1",
      "testCoverage": "manual",
      "codeLocations": ["mobile/app/(tabs)/recommendations.tsx", "friday/src/modules/mobile/routes.ts"]
    },
    {
      "id": "tab-cli",
      "name": "CLI Tab — Agent Launcher",
      "status": "completed",
      "description": "Launch a new agent session by picking agent + project. Calls Friday's /api/mobile/launch-agent which broadcasts forge:command IPC to Electron to spawn a PTY.",
      "phase": "v1",
      "testCoverage": "manual",
      "codeLocations": ["mobile/app/(tabs)/cli.tsx"]
    },
    {
      "id": "session-detail",
      "name": "Session Detail — Live Output + Prompt Reply",
      "status": "completed",
      "description": "Per-session screen shows last 30-50 lines of terminal output streaming over /ws/terminal/:scopeId. When a prompt is detected, shows PromptButtons (yes/no/approve/dismiss) or a text input. Sends mobile:terminal:input which writes directly to the PTY stdin.",
      "phase": "v1",
      "testCoverage": "manual",
      "testNotes": "Backend pushalong path verified: friday/terminal-bridge.ts:39 sendInput → electron/main.cjs:1977 mobile:terminal:input handler → proc.write(data).",
      "codeLocations": ["mobile/app/session/[scopeId].tsx", "mobile/components/PromptButtons.tsx", "friday/src/modules/mobile/terminal-bridge.ts", "electron/main.cjs:1977"]
    },
    {
      "id": "ideas-crud",
      "name": "Ideas CRUD",
      "status": "completed",
      "description": "Create / analyze / promote / dismiss ideas via Friday REST. Writes to hq-data/projects/{slug}/ideas/*.json.",
      "phase": "v1",
      "testCoverage": "manual",
      "codeLocations": ["mobile/app/(tabs)/cli.tsx", "friday/src/modules/mobile/routes.ts"]
    },
    {
      "id": "voice-input",
      "name": "Voice Input",
      "status": "stubbed",
      "description": "VoiceInput component shows a mic button but has no real speech-to-text wiring. Falls back to text input via native keyboard mic.",
      "phase": "v2",
      "codeLocations": ["mobile/components/VoiceInput.tsx"]
    },
    {
      "id": "log-hydration",
      "name": "Log Hydration on Reconnect",
      "status": "planned",
      "description": "When mobile reconnects to an in-progress session, it should fetch the buffered output from Friday before the WebSocket starts streaming new data. Currently the 30-line in-memory buffer in session-registry.ts is invisible to mobile.",
      "phase": "v1.1",
      "codeLocations": []
    },
    {
      "id": "larger-buffer",
      "name": "Larger Terminal Output Buffer",
      "status": "planned",
      "description": "Raise MAX_OUTPUT_LINES from 30 to 500 in session-registry.ts for better mobile context.",
      "phase": "v1.1",
      "codeLocations": ["friday/src/modules/mobile/session-registry.ts:5"]
    },
    {
      "id": "testflight-release",
      "name": "TestFlight MVP Release",
      "status": "planned",
      "description": "Fill eas.json Apple credentials, bump version, build + submit from MacBook.",
      "phase": "v1",
      "codeLocations": ["mobile/eas.json", "mobile/app.json", "mobile/package.json"]
    },
    {
      "id": "android-emulator-launcher",
      "name": "Android Emulator Launcher (Windows)",
      "status": "planned",
      "description": "tools.json launcher that runs npx expo start --android from the mobile folder against a running AVD. Uses the Project Tools tab landed 2026-04-17.",
      "phase": "v1",
      "codeLocations": ["hq-data/projects/forge-mobile/tools.json"]
    }
  ]
}
```

---

## Task 1.5: Create `progress.json` + empty scaffolding

**Files:**
- Create: `c:/Claude/Samurai/hq-data/projects/forge-mobile/progress.json`

- [ ] **Step 1: Write progress.json**

```json
{
  "project": "forge-mobile",
  "lastUpdated": "2026-04-18T00:00:00Z",
  "overall": 70,
  "phases": {
    "build": 70,
    "test": 20,
    "deploy": 0
  },
  "notes": "v1 foundation shipped. Pending: log hydration, larger buffer, TestFlight."
}
```

- [ ] **Step 2: Create empty `rec-counter.json`**

```json
{"next": 1}
```

Write to `c:/Claude/Samurai/hq-data/projects/forge-mobile/rec-counter.json`.

- [ ] **Step 3: Verify directory structure**

```bash
ls c:/Claude/Samurai/hq-data/projects/forge-mobile/
```

Expected output (6 entries):
```
context.md
features.json
ideas
progress.json
project.json
rec-counter.json
recommendations
```

The `ideas/` and `recommendations/` folders are empty — that's expected.

---

## Task 1.6: Create `tools.json` with Expo launchers

**Files:**
- Create: `c:/Claude/Samurai/hq-data/projects/forge-mobile/tools.json`

- [ ] **Step 1: Write tools.json**

```json
{
  "tools": [
    {
      "id": "expo-android",
      "name": "Expo on Android emulator",
      "description": "Launches Expo dev server targeting a running Android emulator. Closest-to-phone fidelity reachable on Windows.",
      "category": "Mobile Preview",
      "fidelity": "Android-native",
      "command": "npx expo start --android",
      "cwd": ".",
      "platforms": ["win32", "darwin", "linux"],
      "setupRequired": "Android Studio installed + an AVD emulator running before launch."
    },
    {
      "id": "expo-web",
      "name": "Expo web preview",
      "description": "Launches Expo dev server in web mode. Fast iteration, but no native modules (expo-secure-store, expo-notifications, etc. are no-ops).",
      "category": "Mobile Preview",
      "fidelity": "Web",
      "command": "npx expo start --web",
      "cwd": ".",
      "platforms": ["win32", "darwin", "linux"]
    },
    {
      "id": "expo-ios",
      "name": "Expo on iOS simulator",
      "description": "Launches Expo dev server targeting the iOS simulator. macOS-only.",
      "category": "Mobile Preview",
      "fidelity": "iOS true",
      "command": "npx expo start --ios",
      "cwd": ".",
      "platforms": ["darwin"],
      "setupRequired": "Xcode + iOS simulator installed."
    },
    {
      "id": "expo-prebuild",
      "name": "Expo prebuild (regen native)",
      "description": "Regenerates the ios/ and android/ native project folders from app.json. Needed before the first native build.",
      "category": "Build",
      "fidelity": "Neutral",
      "command": "npx expo prebuild --clean",
      "cwd": ".",
      "platforms": ["win32", "darwin", "linux"],
      "setupRequired": "Clears existing ios/android folders — commit any hand-edits first."
    },
    {
      "id": "expo-doctor",
      "name": "Expo doctor",
      "description": "Runs Expo's environment diagnostics — checks SDK compatibility, peer deps, native-module mismatches.",
      "category": "Build",
      "fidelity": "Neutral",
      "command": "npx expo-doctor",
      "cwd": ".",
      "platforms": ["win32", "darwin", "linux"]
    },
    {
      "id": "eas-build-ios-preview",
      "name": "EAS build iOS (TestFlight preview)",
      "description": "Kicks off a preview-profile iOS build on EAS. Result uploads to TestFlight after running eas submit.",
      "category": "Release",
      "fidelity": "iOS true",
      "command": "eas build --platform ios --profile preview",
      "cwd": ".",
      "platforms": ["darwin"],
      "setupRequired": "eas-cli logged in (eas login). mobile/eas.json Apple credentials filled."
    },
    {
      "id": "eas-submit-ios",
      "name": "EAS submit iOS → TestFlight",
      "description": "Submits the latest production-profile iOS build to App Store Connect / TestFlight.",
      "category": "Release",
      "fidelity": "iOS true",
      "command": "eas submit --platform ios --profile production",
      "cwd": ".",
      "platforms": ["darwin"],
      "setupRequired": "Build uploaded via eas build first. mobile/eas.json submit.production.ios fields filled."
    }
  ]
}
```

- [ ] **Step 2: Commit (if hq-data is a git repo)**

```bash
cd c:/Claude/Samurai/hq-data
git add projects/forge-mobile/
git commit -m "feat(forge-mobile): seed project files + tools.json (Expo launchers)"
```

---

## Task 1.7: Verify project appears in Forge dashboard

**Files:** none (verification only)

- [ ] **Step 1: Open Forge dashboard**

The user should have Forge open. If not, ask them to launch it. No Forge restart needed — the dashboard polls `hq-data/projects/` on project-list refresh.

- [ ] **Step 2: Verify Forge Mobile appears in the project list**

Dashboard → Projects. Expected: a new card titled "Forge Mobile" with progress 70, phase "build", color cyan (`#06B6D4`). If it doesn't appear after 10 seconds, reload the Forge window (Ctrl+R).

- [ ] **Step 3: Open the project detail page**

Click the Forge Mobile card. Expected: project detail page renders with tabs (Overview, Features, Bugs, Ideas, API, Integrations, Project Tools, Docs).

- [ ] **Step 4: Open the Project Tools tab**

Click "Project Tools". Expected: three category groups — **Mobile Preview** (2 cards on Windows — expo-android + expo-web; expo-ios hidden by platforms filter), **Build** (2 cards — prebuild + doctor), **Release** (both cards hidden on Windows by `platforms: ["darwin"]`).

- [ ] **Step 5: Smoke-test expo-android launcher**

Prerequisite: Android Studio is installed AND an AVD emulator is running. If the user doesn't have an AVD yet, they should create one via Android Studio → Device Manager → Create Device → pick Pixel 6 or similar → download a recent system image → Finish. Then start the emulator.

Click "Expo on Android emulator" → Launch. Expected:
- A new terminal tab opens, labeled "Expo on Android emulator — Forge Mobile"
- The terminal cwd is `c:\Claude\Samurai\Forge\mobile`
- `npx expo start --android` executes
- Expo dev server starts, detects the running AVD, installs Expo Go (or builds dev client), launches the Forge Mobile app on the emulator

If expo-android fails with "no emulator detected," the AVD isn't running — start it from Android Studio's Device Manager and click Launch again.

- [ ] **Step 6: Smoke-test expo-web launcher**

No AVD needed. Click "Expo web preview" → Launch. Expected: terminal opens, `npx expo start --web` runs, Expo opens `http://localhost:8081` in the default browser with the Forge Mobile app in web mode.

- [ ] **Step 7: Tear down**

Close the terminal tabs from steps 5 and 6. Verify PTY processes exit cleanly (check Forge DevTools console: `Tool PTY scope="tool-expo-android-..." exited code=0`).

---

# Phase 2 — Close the CLI-pushalong loop

## Task 2.1: End-to-end manual verification of existing pushalong

**Files:** none (verification only)

Before adding new code, verify what's already wired works end-to-end. This may surface problems the plan doesn't anticipate.

- [ ] **Step 1: Launch mobile + Forge + Friday**

On the Windows desktop:
1. Forge is running (dashboard visible).
2. Friday server is running (`friday serve` in a Forge terminal, or already started). Verify: `curl http://localhost:3000/api/mobile/status` returns `{ "status": "ok", ... }`.

On a phone on the same Tailscale network:
3. Forge Mobile app is installed (Expo Go during dev is fine). Connected to the Friday server (green dot on overview tab).

- [ ] **Step 2: Start an agent session from Forge that will definitely hit a prompt**

From Forge desktop → any project → Recommendations tab → pick any recommendation → click Implement. Or launch `@CodeReviewer` manually. The agent will run Claude Code which will eventually hit a `(y/n)` or tool-permission prompt.

- [ ] **Step 3: Watch the session appear on mobile**

On mobile: Overview tab should show waitingCount increment when the prompt lands. The CLI / Sessions tab should show the session with a red "waiting" dot.

- [ ] **Step 4: Open the session on mobile and send input**

Tap the session. The session detail screen opens. Expected:
- Last ~30 lines of terminal output visible
- Prompt detected — red "Quick Response" area shows PromptButtons (Yes / No, or Approve / Dismiss, depending on prompt shape)
- Tap "Yes" (or type + send via VoiceInput's text fallback)

- [ ] **Step 5: Verify input reaches Claude**

On Forge desktop: watch the agent's terminal tab. Expected: the input appears as a typed character at the prompt, Claude accepts it and continues.

- [ ] **Step 6: Document what works and what doesn't**

Create a verification note at `c:/Claude/Samurai/Forge/docs/superpowers/plans/forge-mobile-phase2-verify.md` with three sections:
- **Working:** (bullet list of everything that worked)
- **Broken:** (bullet list of anything that didn't — prompt not detected, input not landing, output cut off, UI glitch, etc.)
- **Missing:** (obvious gaps — no log history on reconnect, buffer too small, etc.)

If Broken is non-empty, the sub-tasks below may need reordering or additions. Flag to the user before proceeding.

---

## Task 2.2: Raise terminal output buffer from 30 to 500 lines

**Files:**
- Modify: `c:/Claude/Samurai/Forge/friday/src/modules/mobile/session-registry.ts:5`

- [ ] **Step 1: Edit the constant**

Replace line 5:
```ts
const MAX_OUTPUT_LINES = 30;
```
With:
```ts
const MAX_OUTPUT_LINES = 500;
```

- [ ] **Step 2: Verify the change**

```bash
grep -n "MAX_OUTPUT_LINES" c:/Claude/Samurai/Forge/friday/src/modules/mobile/session-registry.ts
```

Expected:
```
5:const MAX_OUTPUT_LINES = 500;
53:    if (session.lastOutput.length > MAX_OUTPUT_LINES) {
54:      session.lastOutput = session.lastOutput.slice(-MAX_OUTPUT_LINES);
```

- [ ] **Step 3: Restart Friday so the change takes effect**

If Friday was running under `bun run dev`, it auto-reloads — skip to step 4. Otherwise:
```bash
# In the Friday terminal:
# Ctrl+C, then:
bun run dev
```

- [ ] **Step 4: Commit**

```bash
cd c:/Claude/Samurai/Forge/friday
git add src/modules/mobile/session-registry.ts
git commit -m "feat(friday/mobile): raise session output buffer 30 → 500 lines"
```

---

## Task 2.3: Add `GET /api/mobile/sessions/:scopeId/logs` endpoint

**Files:**
- Modify: `c:/Claude/Samurai/Forge/friday/src/modules/mobile/routes.ts`
- Create: `c:/Claude/Samurai/Forge/friday/tests/unit/mobile-routes-logs.test.ts`

- [ ] **Step 1: Write the failing test**

Create the test file:

```ts
import { describe, it, expect } from "bun:test";
import { SessionRegistry } from "../../src/modules/mobile/session-registry.ts";
import { handleMobileRoute } from "../../src/modules/mobile/routes.ts";

describe("GET /api/mobile/sessions/:scopeId/logs", () => {
  it("returns 404 when session is not registered", async () => {
    const registry = new SessionRegistry();
    const req = new Request("http://x/api/mobile/sessions/tool-xyz/logs");
    const url = new URL(req.url);
    const res = await handleMobileRoute(req, url, registry, null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it("returns lastOutput + status + prompt for a registered session", async () => {
    const registry = new SessionRegistry();
    registry.register({
      scopeId: "impl-test-1",
      project: "forge-mobile",
      agent: "CodeReviewer",
      taskDescription: "test",
    });
    registry.appendOutput("impl-test-1", "line-a\nline-b\nline-c\n");

    const req = new Request("http://x/api/mobile/sessions/impl-test-1/logs");
    const url = new URL(req.url);
    const res = await handleMobileRoute(req, url, registry, null);

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.scopeId).toBe("impl-test-1");
    expect(body.status).toBe("running");
    expect(Array.isArray(body.lastOutput)).toBe(true);
    expect(body.lastOutput.join("")).toContain("line-a");
    expect(body.lastOutput.join("")).toContain("line-c");
    expect(body.prompt).toBeNull();
    expect(typeof body.startedAt).toBe("string");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd c:/Claude/Samurai/Forge/friday
bun test tests/unit/mobile-routes-logs.test.ts
```

Expected: 2 tests, both fail. First test fails because the route doesn't match (returns null from handleMobileRoute → test harness sees null). Second test fails the same way.

- [ ] **Step 3: Implement the route**

Edit `c:/Claude/Samurai/Forge/friday/src/modules/mobile/routes.ts`. Find the existing `/api/mobile/sessions` handler at line 83:

```ts
  if (p === "/api/mobile/sessions" && req.method === "GET") {
    return json({ sessions: registry.listAll() });
  }
```

Insert a new handler **after** that block (before the next `if (p === "/api/mobile/recommendations"` block at line 87):

```ts
  // GET /api/mobile/sessions/:scopeId/logs — hydrate buffered output on reconnect
  {
    const logsMatch = p.match(/^\/api\/mobile\/sessions\/([^/]+)\/logs$/);
    if (logsMatch && req.method === "GET") {
      const scopeId = decodeURIComponent(logsMatch[1]);
      const session = registry.get(scopeId);
      if (!session) {
        return json({ error: "session not found", scopeId }, 404);
      }
      return json({
        scopeId: session.scopeId,
        status: session.status,
        prompt: session.prompt,
        lastOutput: session.lastOutput,
        startedAt: session.startedAt,
        project: session.project,
        agent: session.agent,
        taskDescription: session.taskDescription,
      });
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd c:/Claude/Samurai/Forge/friday
bun test tests/unit/mobile-routes-logs.test.ts
```

Expected: 2 tests, both pass.

- [ ] **Step 5: Type-check**

```bash
cd c:/Claude/Samurai/Forge/friday
bun run typecheck
```

Expected: no new errors. (Pre-existing errors unrelated to this change are fine — note them in the commit message if any.)

- [ ] **Step 6: Lint**

```bash
cd c:/Claude/Samurai/Forge/friday
bun run lint
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
cd c:/Claude/Samurai/Forge/friday
git add src/modules/mobile/routes.ts tests/unit/mobile-routes-logs.test.ts
git commit -m "feat(friday/mobile): add GET /api/mobile/sessions/:scopeId/logs for reconnect hydration"
```

---

## Task 2.4: Wire mobile session screen to hydrate logs on mount

**Files:**
- Modify: `c:/Claude/Samurai/Forge/mobile/lib/api.ts`
- Modify: `c:/Claude/Samurai/Forge/mobile/app/session/[scopeId].tsx`

- [ ] **Step 1: Add `getSessionLogs` to the API client**

Read `c:/Claude/Samurai/Forge/mobile/lib/api.ts` first to see the existing client shape. It exports methods like `api.fetchOverview()`, `api.fetchSessions()`, etc.

Add this method to the api object (location: after `fetchSessions` or an equivalent sessions-read method — match the existing pattern). The function signature assumes the api object has a `get<T>(path)` helper; adjust to whatever the file already uses:

```ts
export async function getSessionLogs(scopeId: string): Promise<{
  scopeId: string;
  status: "running" | "waiting" | "complete";
  prompt: unknown | null;
  lastOutput: string[];
  startedAt: string;
  project: string;
  agent: string;
  taskDescription: string;
} | null> {
  try {
    return await api.get(`/api/mobile/sessions/${encodeURIComponent(scopeId)}/logs`);
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}
```

If `api.get` doesn't exist in that shape, find the pattern used by `fetchSessions` or `fetchOverview` and mirror it.

- [ ] **Step 2: Hydrate output on mount in the session screen**

Edit `c:/Claude/Samurai/Forge/mobile/app/session/[scopeId].tsx`. The existing `useEffect` starts a WebSocket at line 22. BEFORE the WebSocket connects, hydrate from the REST endpoint.

Add a new useEffect **above** the WebSocket useEffect (insert after line 21, before line 22):

```tsx
  useEffect(() => {
    if (!connection || !scopeId) return;
    let cancelled = false;
    (async () => {
      const logs = await getSessionLogs(scopeId);
      if (cancelled || !logs) return;
      setOutput(logs.lastOutput.slice(-500));
      setPrompt(logs.prompt ?? null);
      setStatus(logs.status);
    })();
    return () => { cancelled = true; };
  }, [scopeId, connection]);
```

Update the import at the top of the file (currently line 4-8 imports store/ws/components). Add:

```tsx
import { getSessionLogs } from "@/lib/api";
```

- [ ] **Step 3: Update the output slice cap**

Line 31 currently slices to 50:
```tsx
return newLines.slice(-50);
```

Raise to 500 so the hydrated buffer doesn't get truncated back down on first WebSocket message:
```tsx
return newLines.slice(-500);
```

- [ ] **Step 4: Verify in Expo dev server**

From Forge's Project Tools → Expo on Android emulator. With the emulator running, the app should hot-reload. Steps:

1. Launch an agent session from Forge desktop (anything that generates terminal output — even `@CodeReviewer` on a tiny project).
2. Kill the Forge Mobile app on the emulator mid-session (force-close).
3. Reopen Forge Mobile → CLI tab → tap the still-running session.
4. Expected: the session detail screen opens and **immediately shows the buffered output** (not a blank screen waiting for the WebSocket). New output continues to stream as the session progresses.

- [ ] **Step 5: Commit**

```bash
cd c:/Claude/Samurai/Forge
git add mobile/lib/api.ts mobile/app/session/[scopeId].tsx
git commit -m "feat(forge-mobile): hydrate session logs on reconnect via /api/mobile/sessions/:scopeId/logs"
```

---

## Task 2.5: Update forge-mobile features.json to reflect Phase 2 completion

**Files:**
- Modify: `c:/Claude/Samurai/hq-data/projects/forge-mobile/features.json`

- [ ] **Step 1: Mark the three v1.1 features complete**

Update these three feature entries in the `features` array:

```json
    {
      "id": "log-hydration",
      "name": "Log Hydration on Reconnect",
      "status": "completed",
      "description": "Mobile calls GET /api/mobile/sessions/:scopeId/logs on session screen mount, hydrates output + prompt + status before WebSocket streaming starts.",
      "phase": "v1.1",
      "testCoverage": "unit",
      "testNotes": "2 bun:test cases in friday/tests/unit/mobile-routes-logs.test.ts: 404 on unknown session, 200 with lastOutput on registered session.",
      "codeLocations": ["friday/src/modules/mobile/routes.ts", "mobile/app/session/[scopeId].tsx", "mobile/lib/api.ts"],
      "completedAt": "2026-04-18T00:00:00Z"
    },
    {
      "id": "larger-buffer",
      "name": "Larger Terminal Output Buffer",
      "status": "completed",
      "description": "MAX_OUTPUT_LINES raised 30 → 500 for mobile context.",
      "phase": "v1.1",
      "codeLocations": ["friday/src/modules/mobile/session-registry.ts:5"],
      "completedAt": "2026-04-18T00:00:00Z"
    }
```

Also update the top-level `lastUpdated` to the current ISO timestamp and `progress.json` `overall` from 70 → 80.

- [ ] **Step 2: Append to activity-log.json**

Read `c:/Claude/Samurai/hq-data/activity-log.json` to see the current max id. Append:

```json
  {"id": <next_id>, "agent": "Claude (plan executor)", "agentColor": "#06B6D4", "action": "Phase 2 complete — CLI pushalong loop hardened (log hydration + 500-line buffer)", "project": "Forge Mobile", "timestamp": "2026-04-18T00:00:00Z"}
```

Replace `<next_id>` with the actual next integer and the timestamp with now.

- [ ] **Step 3: Commit (if hq-data is a git repo)**

```bash
cd c:/Claude/Samurai/hq-data
git add projects/forge-mobile/features.json projects/forge-mobile/progress.json activity-log.json
git commit -m "feat(forge-mobile): mark Phase 2 features complete"
```

---

# Phase 3 — TestFlight MVP

## Task 3.1: Bump version + build number

**Files:**
- Modify: `c:/Claude/Samurai/Forge/mobile/package.json`
- Modify: `c:/Claude/Samurai/Forge/mobile/app.json`

- [ ] **Step 1: Bump package.json version**

Edit `mobile/package.json` line 3:
```json
  "version": "1.0.1",
```

- [ ] **Step 2: Bump app.json version + buildNumber**

Edit `mobile/app.json`:
- Line 5: `"version": "1.0.1",`
- Line 17: `"buildNumber": "2",`

- [ ] **Step 3: Commit**

```bash
cd c:/Claude/Samurai/Forge
git add mobile/package.json mobile/app.json
git commit -m "chore(forge-mobile): bump version 1.0.0 → 1.0.1 (TestFlight)"
```

---

## Task 3.2: Fill `eas.json` Apple credentials

**Files:**
- Modify: `c:/Claude/Samurai/Forge/mobile/eas.json`

This task **must run on the MacBook** (the user's stated environment for iOS builds). On Windows, skip and document for hand-off.

- [ ] **Step 1: Gather Apple credentials (on Mac)**

The user needs three values from their Apple Developer account:
- **Apple ID:** the email address used for Developer Program enrollment
- **App Store Connect App ID (ascAppId):** a 10-digit number. Create the app entry in App Store Connect first (https://appstoreconnect.apple.com → My Apps → + → New App). Bundle ID must match `com.forge.mobile`. Copy the App ID from the URL or app details page.
- **Apple Team ID:** 10-character alphanumeric. Found at https://developer.apple.com/account → Membership details.

- [ ] **Step 2: Fill eas.json**

Edit `mobile/eas.json`. Replace the `submit.production.ios` block:

```json
  "submit": {
    "production": {
      "ios": {
        "appleId": "<APPLE_ID_EMAIL>",
        "ascAppId": "<10_DIGIT_APP_ID>",
        "appleTeamId": "<10_CHAR_TEAM_ID>"
      }
    }
  }
```

Replace the three placeholders with actual values.

- [ ] **Step 3: Add `.gitignore` line for eas local secrets (precaution)**

Check if `mobile/.gitignore` already ignores `.easignore` or credential files:

```bash
grep -E "eas|credentials" c:/Claude/Samurai/Forge/mobile/.gitignore 2>/dev/null
```

If no match, the eas.json config itself is safe to commit (it only contains Apple IDs, not secrets — the EAS API key is in your eas-cli login session, not the file). Proceed.

- [ ] **Step 4: Commit**

```bash
cd c:/Claude/Samurai/Forge
git add mobile/eas.json
git commit -m "chore(forge-mobile): fill eas.json Apple credentials for TestFlight"
```

---

## Task 3.3: Build and submit from MacBook

**Files:** none (command execution)

This entire task runs on macOS. From the Forge Windows machine, hand off to the Mac. The user should have EAS CLI installed (`npm install -g eas-cli`).

- [ ] **Step 1: Pull latest on Mac**

```bash
cd c:/Claude/Samurai/Forge   # or the Mac equivalent path
git pull origin <branch>
cd mobile
```

- [ ] **Step 2: Login to EAS**

```bash
eas login
```
Use the same Apple ID / Expo account as the Apple Developer Program.

- [ ] **Step 3: Prebuild native projects**

```bash
npx expo prebuild --clean
```

Expected: generates/regenerates `ios/` and `android/` folders. This takes 30-90 seconds.

- [ ] **Step 4: Run iOS preview build**

```bash
eas build --platform ios --profile preview
```

Expected: EAS uploads the project, runs a cloud build, returns a build ID. Takes 15-30 minutes. Monitor at https://expo.dev/accounts/<your-account>/projects/forge-mobile/builds. On success, an IPA is available.

For the first build, EAS will prompt for:
- iOS Distribution Certificate (accept "Let EAS manage it")
- Provisioning Profile (same — let EAS manage)
- Push Notification key (skip for now unless using push)

- [ ] **Step 5: Submit to TestFlight**

Once build completes:
```bash
eas submit --platform ios --profile production --latest
```

Expected: uploads the IPA to App Store Connect. Takes 5-15 minutes. Once processed, the build appears in TestFlight under the "Builds" tab of the forge-mobile app entry. Apple Review is NOT required for internal testers — just add the user's Apple ID as an internal tester in App Store Connect → TestFlight → Internal Group.

- [ ] **Step 6: Install on phone**

Open TestFlight app on the iPhone. After ~10 min processing, the forge-mobile build is installable. Accept the invite email if prompted.

- [ ] **Step 7: Verify connection works on the TestFlight build**

On the phone's TestFlight app, launch Forge Mobile. Expected: Connect screen. Enter Tailscale IP + token. Green dot on Overview tab. Tabs render. Launch an agent session, reply to a prompt from the phone — same flow verified in Task 2.1 but from the signed TestFlight IPA.

---

## Task 3.4: Mark the release complete

**Files:**
- Modify: `c:/Claude/Samurai/hq-data/projects/forge-mobile/features.json`
- Modify: `c:/Claude/Samurai/hq-data/activity-log.json`
- Modify: `c:/Claude/Samurai/hq-data/projects/forge-mobile/progress.json`

- [ ] **Step 1: Mark testflight-release + android-emulator-launcher complete**

In features.json:

```json
    {
      "id": "testflight-release",
      "name": "TestFlight MVP Release",
      "status": "completed",
      "description": "v1.0.1 / build 2 submitted to TestFlight via eas submit. Internal testers can install.",
      "phase": "v1",
      "codeLocations": ["mobile/eas.json", "mobile/app.json", "mobile/package.json"],
      "completedAt": "<ISO_NOW>"
    },
    {
      "id": "android-emulator-launcher",
      "name": "Android Emulator Launcher (Windows)",
      "status": "completed",
      "description": "Project Tools tab surfaces expo-android / expo-web / expo-prebuild / expo-doctor launchers from hq-data/projects/forge-mobile/tools.json. Verified on Windows with AVD running.",
      "phase": "v1",
      "codeLocations": ["hq-data/projects/forge-mobile/tools.json"],
      "completedAt": "<ISO_NOW>"
    }
```

Replace `<ISO_NOW>` with the real timestamp.

- [ ] **Step 2: Bump progress.json**

```json
{
  "project": "forge-mobile",
  "lastUpdated": "<ISO_NOW>",
  "overall": 95,
  "phases": {
    "build": 100,
    "test": 60,
    "deploy": 90
  },
  "notes": "v1.0.1 shipped to TestFlight. Pending: voice input, live activity widgets, error reporting."
}
```

- [ ] **Step 3: Append activity-log entry**

```json
  {"id": <next_id>, "agent": "Claude (plan executor)", "agentColor": "#06B6D4", "action": "Forge Mobile v1.0.1 submitted to TestFlight", "project": "Forge Mobile", "timestamp": "<ISO_NOW>"}
```

- [ ] **Step 4: Commit (if hq-data is a git repo)**

```bash
cd c:/Claude/Samurai/hq-data
git add projects/forge-mobile/features.json projects/forge-mobile/progress.json activity-log.json
git commit -m "feat(forge-mobile): v1.0.1 TestFlight release logged"
```

---

## Self-review checklist

- [x] **Spec coverage:** Phase 1 elevates mobile via data-only changes piggybacking on existing Project Tools infra. Phase 2 closes the loop with one Friday endpoint + one mobile hydration hook + one constant bump. Phase 3 is purely release config + commands. No code invented that isn't necessary.
- [x] **No placeholders:** every task shows exact file paths, exact code, exact commands, expected output. `<APPLE_ID_EMAIL>` / `<ISO_NOW>` / `<next_id>` are runtime values the executor fills in — they're not "TBD."
- [x] **Type consistency:** `getSessionLogs` return shape matches the server response shape exactly. `MAX_OUTPUT_LINES` is one number; all consumers (session-registry lines 53-54) already reference the constant.
- [x] **Test coverage:** Friday endpoint has 2 bun:test cases (404 + 200). Forge renderer changes have no framework per project memory — verification is manual (Task 2.4 Step 4 + Task 1.7).
- [x] **Session-registry discipline:** the new endpoint is additive — doesn't touch `appendOutput()`, `markComplete()`, `markInputSent()`, so no risk to the existing prompt detection path.
- [x] **Mobile New Architecture:** `newArchEnabled: true` in app.json is already set; no RN modules added in this plan would regress it.
- [x] **Platform filters:** tools.json platform gates (`darwin` only for ios/eas) prevent Windows users from seeing launchers they can't use.
- [x] **Hq-data git handling:** every commit step first checks if hq-data is a git repo (`git status 2>/dev/null`). No forced commits.
- [x] **Forge restart avoidance:** no `electron/*.cjs` edits in this plan, so no Electron restart. Friday restart (auto via `bun run dev`) is low-cost.
- [x] **Phase independence:** Phase 1 ships value standalone (Android testing from Windows works). Phase 2 ships value standalone (mobile survives reconnects). Phase 3 ships value standalone (TestFlight install). A stop after any phase leaves the system in a better state.

---

## Execution order summary

1. **Phase 1 — Elevation (no code, ~30 min):** 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 smoke test. Ends with Expo on Android emulator launcher working from Forge on Windows.
2. **Phase 2 — Pushalong completeness (Friday + mobile, ~60 min):** 2.1 verify first (may surface reorder) → 2.2 buffer bump → 2.3 logs endpoint + test → 2.4 mobile hydration → 2.5 feature-registry update. Ends with mobile surviving reconnects cleanly.
3. **Phase 3 — TestFlight (macOS commands, ~30 min wall clock + 15-30 min EAS build queue):** 3.1 bump → 3.2 eas.json (on Mac) → 3.3 build+submit (on Mac) → 3.4 mark complete. Ends with Forge Mobile installed on iPhone via TestFlight.
