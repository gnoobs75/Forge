# Forge Mobile Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal iOS remote control app for the Forge with voice-first CLI interaction, deployed via TestFlight over Tailscale VPN.

**Architecture:** Extend Friday's Bun server (port 3100) with a mobile API module (REST + WebSocket). Build an Expo React Native app with 4-tab navigation. Terminal bridge relays PTY I/O between phone and Electron via Friday's existing WebSocket bridge to Electron main process.

**Tech Stack:** Expo (React Native) + TypeScript, Zustand, NativeWind, expo-notifications, expo-speech. Server: Bun (Friday), node-pty (Electron). Networking: Tailscale.

**Spec:** `docs/superpowers/specs/2026-04-04-forge-mobile-companion-design.md`

---

## File Map

### Server Side (friday/src/modules/mobile/)

| File | Responsibility |
|------|---------------|
| `friday/src/modules/mobile/index.ts` | Module barrel, registers with Friday module system |
| `friday/src/modules/mobile/types.ts` | SessionInfo, PromptType, MobileEvent types |
| `friday/src/modules/mobile/prompt-detector.ts` | Parse PTY output buffer for prompt patterns |
| `friday/src/modules/mobile/session-registry.ts` | Track active PTY sessions with status + prompt state |
| `friday/src/modules/mobile/routes.ts` | REST endpoint handlers for /api/mobile/* |
| `friday/src/modules/mobile/terminal-bridge.ts` | WebSocket relay between phone and Electron PTY |
| `friday/src/modules/mobile/alerts.ts` | Fire events when sessions need input |

### Server Side (modifications)

| File | Change |
|------|--------|
| `friday/src/server/index.ts` | Add mobile REST routes + /ws/mobile and /ws/terminal/:scopeId upgrade paths |
| `friday/src/server/protocol.ts` | Add mobile message types to ClientMessage/ServerMessage unions |
| `electron/main.cjs` | Add IPC handlers for mobile terminal bridge relay |

### Mobile App (Forge/mobile/)

| File | Responsibility |
|------|---------------|
| `mobile/app.json` | Expo config |
| `mobile/package.json` | Dependencies |
| `mobile/tsconfig.json` | TypeScript config |
| `mobile/eas.json` | EAS Build config for TestFlight |
| `mobile/tailwind.config.js` | NativeWind Tailwind config |
| `mobile/global.css` | Tailwind CSS imports |
| `mobile/nativewind-env.d.ts` | NativeWind type declarations |
| `mobile/app/_layout.tsx` | Root layout with auth gate |
| `mobile/app/connect.tsx` | First-run setup (IP + token) |
| `mobile/app/(tabs)/_layout.tsx` | Tab bar with badge counts |
| `mobile/app/(tabs)/index.tsx` | Overview tab |
| `mobile/app/(tabs)/recs.tsx` | Recommendations tab |
| `mobile/app/(tabs)/projects.tsx` | Projects tab |
| `mobile/app/(tabs)/cli.tsx` | CLI command center tab |
| `mobile/app/rec/[id].tsx` | Recommendation detail |
| `mobile/app/project/[slug].tsx` | Project detail |
| `mobile/app/session/[scopeId].tsx` | CLI session interaction view |
| `mobile/lib/api.ts` | REST client with Bearer auth |
| `mobile/lib/ws.ts` | WebSocket manager |
| `mobile/lib/store.ts` | Zustand store |
| `mobile/lib/prompt-types.ts` | Shared prompt type definitions |
| `mobile/lib/notifications.ts` | Local push notification setup |
| `mobile/lib/connection.ts` | Tailscale connection management + secure storage |
| `mobile/components/ActivityFeed.tsx` | Activity log list |
| `mobile/components/AlertBanner.tsx` | Sessions-need-input banner |
| `mobile/components/ProjectCard.tsx` | Project summary card |
| `mobile/components/RecommendationCard.tsx` | Rec summary card |
| `mobile/components/SessionTree.tsx` | CLI session tree grouped by project |
| `mobile/components/SessionInteraction.tsx` | Terminal output + prompt area |
| `mobile/components/PromptButtons.tsx` | Smart dynamic buttons |
| `mobile/components/VoiceInput.tsx` | Mic button + speech-to-text |
| `mobile/components/ConnectionStatus.tsx` | Tailscale + Forge status indicator |

---

## Task 1: Prompt Detector Module

**Files:**
- Create: `friday/src/modules/mobile/types.ts`
- Create: `friday/src/modules/mobile/prompt-detector.ts`
- Test: `friday/tests/unit/mobile/prompt-detector.test.ts`

This is a pure function with no dependencies — perfect starting point.

- [ ] **Step 1: Write the types file**

```typescript
// friday/src/modules/mobile/types.ts

export type PromptType = "binary" | "permission" | "numbered" | "open";

export interface DetectedPrompt {
  type: PromptType;
  /** Button labels to render (e.g. ["Yes", "No"] or ["1", "2", "3"]) */
  options: string[];
  /** The raw prompt line(s) detected */
  promptText: string;
}

export type SessionStatus = "running" | "waiting" | "idle" | "complete";

export interface SessionInfo {
  scopeId: string;
  project: string;
  agent: string;
  status: SessionStatus;
  prompt: DetectedPrompt | null;
  lastOutput: string[];
  startedAt: string;
  taskDescription: string;
}

export interface MobileEvent {
  type: "session:update" | "session:needs-input" | "session:complete" | "activity:new";
  data: Record<string, unknown>;
  timestamp: string;
}
```

- [ ] **Step 2: Write failing tests for prompt detector**

```typescript
// friday/tests/unit/mobile/prompt-detector.test.ts
import { describe, test, expect } from "bun:test";
import { detectPrompt } from "../../../src/modules/mobile/prompt-detector.ts";

describe("detectPrompt", () => {
  test("detects yes/no binary prompt", () => {
    const output = "I've implemented the changes.\n\nDo you want me to proceed? (yes/no)";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("binary");
    expect(result!.options).toContain("Yes");
    expect(result!.options).toContain("No");
  });

  test("detects y/n binary prompt", () => {
    const output = "Apply these changes? (y/n)";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("binary");
  });

  test("detects proceed/continue binary prompt", () => {
    const output = "Ready to deploy.\n\nShould I continue?";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("binary");
  });

  test("detects Claude Code permission prompt", () => {
    const output = "Claude wants to run: bash ls -la\n\nAllow? (y/n/yes, and never ask again)";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("permission");
    expect(result!.options).toContain("Allow");
    expect(result!.options).toContain("Deny");
    expect(result!.options).toContain("Yes, never ask again");
  });

  test("detects numbered option list", () => {
    const output = "Which approach?\n\n1. Simple REST API\n2. GraphQL endpoint\n3. WebSocket stream";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("numbered");
    expect(result!.options).toEqual(["1", "2", "3"]);
  });

  test("detects numbered options with parentheses", () => {
    const output = "Select:\n1) First option\n2) Second option";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("numbered");
    expect(result!.options).toEqual(["1", "2"]);
  });

  test("returns null for non-prompt output", () => {
    const output = "Building project...\nCompiling 42 files\nDone in 3.2s";
    const result = detectPrompt(output);
    expect(result).toBeNull();
  });

  test("returns open type for question without options", () => {
    const output = "What should I name the component?";
    const result = detectPrompt(output);
    // A trailing question mark alone isn't enough — this should be null
    // (we only detect structured prompts)
    expect(result).toBeNull();
  });

  test("handles ANSI escape codes in output", () => {
    const output = "\x1b[1m\x1b[33mDo you want to proceed?\x1b[0m (yes/no)";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("binary");
  });

  test("uses last chunk of output for detection", () => {
    const output = "Line 1\nLine 2\nLine 3\nProceed? (y/n)";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("binary");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd C:/Claude/Samurai/Forge/friday && bun test tests/unit/mobile/prompt-detector.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement prompt detector**

```typescript
// friday/src/modules/mobile/prompt-detector.ts
import type { DetectedPrompt } from "./types.ts";

/** Strip ANSI escape sequences from terminal output */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

/** Get the last N lines of output for prompt detection */
function lastLines(output: string, n = 10): string {
  const lines = output.trim().split("\n");
  return lines.slice(-n).join("\n");
}

const BINARY_PATTERNS = [
  /\(yes\/no\)/i,
  /\(y\/n\)/i,
  /\bproceed\s*\?/i,
  /\bcontinue\s*\?/i,
  /\bdo you want to\b/i,
  /\bshould I\b.*\?/i,
];

const PERMISSION_PATTERNS = [
  /\ballow\b.*\b(?:y\/n|yes.*never ask again)\b/i,
  /\bnever ask again\b/i,
  /wants to (?:run|execute|read|write|edit).*\ballow\b/i,
];

const NUMBERED_PATTERN = /^\s*(\d+)[.)]\s+\S/;

export function detectPrompt(rawOutput: string): DetectedPrompt | null {
  const clean = stripAnsi(rawOutput);
  const tail = lastLines(clean);

  // Check permission patterns first (more specific than binary)
  for (const pattern of PERMISSION_PATTERNS) {
    if (pattern.test(tail)) {
      return {
        type: "permission",
        options: ["Allow", "Deny", "Yes, never ask again"],
        promptText: tail.split("\n").slice(-3).join("\n").trim(),
      };
    }
  }

  // Check binary yes/no patterns
  for (const pattern of BINARY_PATTERNS) {
    if (pattern.test(tail)) {
      return {
        type: "binary",
        options: ["Yes", "No"],
        promptText: tail.split("\n").slice(-2).join("\n").trim(),
      };
    }
  }

  // Check for numbered option lists
  const lines = tail.split("\n");
  const numberedLines: string[] = [];
  for (const line of lines) {
    const match = line.match(NUMBERED_PATTERN);
    if (match) numberedLines.push(match[1]);
  }
  if (numberedLines.length >= 2) {
    return {
      type: "numbered",
      options: numberedLines,
      promptText: tail.trim(),
    };
  }

  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd C:/Claude/Samurai/Forge/friday && bun test tests/unit/mobile/prompt-detector.test.ts`
Expected: All 9 tests pass

- [ ] **Step 6: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add friday/src/modules/mobile/types.ts friday/src/modules/mobile/prompt-detector.ts friday/tests/unit/mobile/prompt-detector.test.ts
git commit -m "feat(mobile): add prompt detector + types for mobile module"
```

---

## Task 2: Session Registry

**Files:**
- Create: `friday/src/modules/mobile/session-registry.ts`
- Test: `friday/tests/unit/mobile/session-registry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// friday/tests/unit/mobile/session-registry.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { SessionRegistry } from "../../../src/modules/mobile/session-registry.ts";

describe("SessionRegistry", () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  test("registers a new session", () => {
    registry.register({
      scopeId: "abc-123",
      project: "safetyfirst",
      agent: "Backend Engineer",
      taskDescription: "API auth middleware",
    });
    const session = registry.get("abc-123");
    expect(session).not.toBeNull();
    expect(session!.status).toBe("running");
    expect(session!.prompt).toBeNull();
    expect(session!.lastOutput).toEqual([]);
  });

  test("updates session output and detects prompt", () => {
    registry.register({ scopeId: "abc-123", project: "test", agent: "Test Agent", taskDescription: "test" });
    registry.appendOutput("abc-123", "Do you want to proceed? (yes/no)");
    const session = registry.get("abc-123");
    expect(session!.status).toBe("waiting");
    expect(session!.prompt).not.toBeNull();
    expect(session!.prompt!.type).toBe("binary");
  });

  test("clears prompt when input is sent", () => {
    registry.register({ scopeId: "abc-123", project: "test", agent: "Test Agent", taskDescription: "test" });
    registry.appendOutput("abc-123", "Proceed? (y/n)");
    expect(registry.get("abc-123")!.status).toBe("waiting");
    registry.markInputSent("abc-123");
    expect(registry.get("abc-123")!.status).toBe("running");
    expect(registry.get("abc-123")!.prompt).toBeNull();
  });

  test("marks session complete on exit", () => {
    registry.register({ scopeId: "abc-123", project: "test", agent: "Test Agent", taskDescription: "test" });
    registry.markComplete("abc-123");
    expect(registry.get("abc-123")!.status).toBe("complete");
  });

  test("lists all sessions", () => {
    registry.register({ scopeId: "a", project: "p1", agent: "A1", taskDescription: "t1" });
    registry.register({ scopeId: "b", project: "p2", agent: "A2", taskDescription: "t2" });
    const all = registry.listAll();
    expect(all).toHaveLength(2);
  });

  test("lists sessions needing input", () => {
    registry.register({ scopeId: "a", project: "p1", agent: "A1", taskDescription: "t1" });
    registry.register({ scopeId: "b", project: "p2", agent: "A2", taskDescription: "t2" });
    registry.appendOutput("a", "Continue? (y/n)");
    const waiting = registry.listWaiting();
    expect(waiting).toHaveLength(1);
    expect(waiting[0].scopeId).toBe("a");
  });

  test("removes session", () => {
    registry.register({ scopeId: "a", project: "p1", agent: "A1", taskDescription: "t1" });
    registry.remove("a");
    expect(registry.get("a")).toBeNull();
  });

  test("keeps only last N lines of output", () => {
    registry.register({ scopeId: "a", project: "p1", agent: "A1", taskDescription: "t1" });
    const longOutput = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    registry.appendOutput("a", longOutput);
    expect(registry.get("a")!.lastOutput.length).toBeLessThanOrEqual(30);
  });

  test("fires onChange callback when session status changes", () => {
    const events: string[] = [];
    registry.onChange((scopeId, status) => events.push(`${scopeId}:${status}`));
    registry.register({ scopeId: "a", project: "p1", agent: "A1", taskDescription: "t1" });
    registry.appendOutput("a", "Proceed? (y/n)");
    expect(events).toContain("a:waiting");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Claude/Samurai/Forge/friday && bun test tests/unit/mobile/session-registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement session registry**

```typescript
// friday/src/modules/mobile/session-registry.ts
import type { SessionInfo, SessionStatus } from "./types.ts";
import { detectPrompt } from "./prompt-detector.ts";

const MAX_OUTPUT_LINES = 30;

type ChangeCallback = (scopeId: string, status: SessionStatus) => void;

interface RegisterOptions {
  scopeId: string;
  project: string;
  agent: string;
  taskDescription: string;
}

export class SessionRegistry {
  private sessions = new Map<string, SessionInfo>();
  private callbacks: ChangeCallback[] = [];

  onChange(cb: ChangeCallback): void {
    this.callbacks.push(cb);
  }

  private notify(scopeId: string, status: SessionStatus): void {
    for (const cb of this.callbacks) {
      try { cb(scopeId, status); } catch {}
    }
  }

  register(opts: RegisterOptions): void {
    this.sessions.set(opts.scopeId, {
      scopeId: opts.scopeId,
      project: opts.project,
      agent: opts.agent,
      status: "running",
      prompt: null,
      lastOutput: [],
      startedAt: new Date().toISOString(),
      taskDescription: opts.taskDescription,
    });
  }

  get(scopeId: string): SessionInfo | null {
    return this.sessions.get(scopeId) ?? null;
  }

  appendOutput(scopeId: string, data: string): void {
    const session = this.sessions.get(scopeId);
    if (!session) return;

    const newLines = data.split("\n");
    session.lastOutput.push(...newLines);
    if (session.lastOutput.length > MAX_OUTPUT_LINES) {
      session.lastOutput = session.lastOutput.slice(-MAX_OUTPUT_LINES);
    }

    const fullTail = session.lastOutput.join("\n");
    const detected = detectPrompt(fullTail);
    if (detected && session.status !== "waiting") {
      session.status = "waiting";
      session.prompt = detected;
      this.notify(scopeId, "waiting");
    }
  }

  markInputSent(scopeId: string): void {
    const session = this.sessions.get(scopeId);
    if (!session) return;
    session.status = "running";
    session.prompt = null;
  }

  markComplete(scopeId: string): void {
    const session = this.sessions.get(scopeId);
    if (!session) return;
    session.status = "complete";
    session.prompt = null;
    this.notify(scopeId, "complete");
  }

  remove(scopeId: string): void {
    this.sessions.delete(scopeId);
  }

  listAll(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  listWaiting(): SessionInfo[] {
    return this.listAll().filter((s) => s.status === "waiting");
  }

  listByProject(project: string): SessionInfo[] {
    return this.listAll().filter((s) => s.project === project);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Claude/Samurai/Forge/friday && bun test tests/unit/mobile/session-registry.test.ts`
Expected: All 8 tests pass

- [ ] **Step 5: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add friday/src/modules/mobile/session-registry.ts friday/tests/unit/mobile/session-registry.test.ts
git commit -m "feat(mobile): add session registry with prompt detection"
```

---

## Task 3: Mobile REST API Routes

**Files:**
- Create: `friday/src/modules/mobile/routes.ts`
- Test: `friday/tests/unit/mobile/routes.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// friday/tests/unit/mobile/routes.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { handleMobileRoute } from "../../../src/modules/mobile/routes.ts";
import { SessionRegistry } from "../../../src/modules/mobile/session-registry.ts";

// Mock hqDir for tests
const MOCK_HQ_DIR = null; // routes handle null gracefully

describe("handleMobileRoute", () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  test("GET /api/mobile/status returns health info", async () => {
    const req = new Request("http://localhost/api/mobile/status");
    const res = await handleMobileRoute(req, new URL(req.url), registry, MOCK_HQ_DIR);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("sessionCounts");
    expect(body).toHaveProperty("alertCount");
  });

  test("GET /api/mobile/sessions returns session list", async () => {
    registry.register({ scopeId: "s1", project: "test", agent: "Agent", taskDescription: "task" });
    registry.register({ scopeId: "s2", project: "test", agent: "Agent2", taskDescription: "task2" });
    const req = new Request("http://localhost/api/mobile/sessions");
    const res = await handleMobileRoute(req, new URL(req.url), registry, MOCK_HQ_DIR);
    expect(res).not.toBeNull();
    const body = await res!.json();
    expect(body.sessions).toHaveLength(2);
  });

  test("GET /api/mobile/sessions includes prompt info", async () => {
    registry.register({ scopeId: "s1", project: "test", agent: "Agent", taskDescription: "task" });
    registry.appendOutput("s1", "Continue? (y/n)");
    const req = new Request("http://localhost/api/mobile/sessions");
    const res = await handleMobileRoute(req, new URL(req.url), registry, MOCK_HQ_DIR);
    const body = await res!.json();
    expect(body.sessions[0].status).toBe("waiting");
    expect(body.sessions[0].prompt).not.toBeNull();
    expect(body.sessions[0].prompt.type).toBe("binary");
  });

  test("returns null for unknown routes", async () => {
    const req = new Request("http://localhost/api/mobile/unknown");
    const res = await handleMobileRoute(req, new URL(req.url), registry, MOCK_HQ_DIR);
    expect(res).toBeNull();
  });

  test("GET /api/mobile/overview returns activity and stats", async () => {
    registry.register({ scopeId: "s1", project: "p1", agent: "A", taskDescription: "t" });
    const req = new Request("http://localhost/api/mobile/overview");
    const res = await handleMobileRoute(req, new URL(req.url), registry, MOCK_HQ_DIR);
    expect(res).not.toBeNull();
    const body = await res!.json();
    expect(body).toHaveProperty("stats");
    expect(body).toHaveProperty("activity");
    expect(body.stats.totalSessions).toBe(1);
  });

  test("GET /api/mobile/projects returns project list", async () => {
    const req = new Request("http://localhost/api/mobile/projects");
    const res = await handleMobileRoute(req, new URL(req.url), registry, MOCK_HQ_DIR);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Claude/Samurai/Forge/friday && bun test tests/unit/mobile/routes.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement routes**

```typescript
// friday/src/modules/mobile/routes.ts
import * as fs from "node:fs";
import * as path from "node:path";
import type { SessionRegistry } from "./session-registry.ts";
import { readJsonSafe, getProjectSlugs } from "../studio/hq-utils.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleMobileRoute(
  req: Request,
  url: URL,
  registry: SessionRegistry,
  hqDir: string | null,
): Promise<Response | null> {
  const p = url.pathname;

  // GET /api/mobile/status
  if (p === "/api/mobile/status" && req.method === "GET") {
    const all = registry.listAll();
    const waiting = registry.listWaiting();
    return json({
      status: "ok",
      timestamp: new Date().toISOString(),
      sessionCounts: {
        total: all.length,
        running: all.filter((s) => s.status === "running").length,
        waiting: waiting.length,
        complete: all.filter((s) => s.status === "complete").length,
      },
      alertCount: waiting.length,
    });
  }

  // GET /api/mobile/overview
  if (p === "/api/mobile/overview" && req.method === "GET") {
    const all = registry.listAll();
    const waiting = registry.listWaiting();
    let activity: unknown[] = [];
    if (hqDir) {
      const logPath = path.join(hqDir, "activity-log.json");
      const logData = readJsonSafe(logPath);
      if (Array.isArray(logData)) {
        activity = logData.slice(-20).reverse();
      }
    }
    const projects = hqDir ? getProjectSlugs(hqDir) : [];
    return json({
      stats: {
        totalSessions: all.length,
        waitingCount: waiting.length,
        runningCount: all.filter((s) => s.status === "running").length,
        projectCount: projects.length,
      },
      activity,
      alerts: waiting.map((s) => ({
        scopeId: s.scopeId,
        project: s.project,
        agent: s.agent,
        promptType: s.prompt?.type,
      })),
    });
  }

  // GET /api/mobile/sessions
  if (p === "/api/mobile/sessions" && req.method === "GET") {
    return json({ sessions: registry.listAll() });
  }

  // GET /api/mobile/recommendations
  if (p === "/api/mobile/recommendations" && req.method === "GET") {
    const projectFilter = url.searchParams.get("project");
    const recs: unknown[] = [];
    if (hqDir) {
      const slugs = projectFilter ? [projectFilter] : getProjectSlugs(hqDir);
      for (const slug of slugs) {
        const recDir = path.join(hqDir, "projects", slug, "recommendations");
        try {
          const files = fs.readdirSync(recDir).filter((f) => f.endsWith(".json"));
          for (const file of files) {
            const rec = readJsonSafe(path.join(recDir, file));
            if (rec && rec.title && rec.agent) {
              rec._project = slug;
              rec._file = file;
              recs.push(rec);
            }
          }
        } catch {}
      }
    }
    recs.sort((a: any, b: any) =>
      (b.timestamp || "").localeCompare(a.timestamp || ""),
    );
    return json({ recommendations: recs });
  }

  // POST /api/mobile/recommendations/:id/action
  const recActionMatch = p.match(/^\/api\/mobile\/recommendations\/(.+)\/action$/);
  if (recActionMatch && req.method === "POST") {
    const recFile = decodeURIComponent(recActionMatch[1]);
    try {
      const body = await req.json();
      const action = body.action; // "approve" | "dismiss" | "implement"
      if (!hqDir) return json({ error: "hq-data not found" }, 500);

      // Find the recommendation file across projects
      const slugs = getProjectSlugs(hqDir);
      for (const slug of slugs) {
        const filePath = path.join(hqDir, "projects", slug, "recommendations", recFile);
        if (fs.existsSync(filePath)) {
          const rec = readJsonSafe(filePath);
          if (rec) {
            if (action === "approve") rec.status = "approved";
            else if (action === "dismiss") {
              rec.status = "dismissed";
              rec.dismissedAt = new Date().toISOString();
            }
            fs.writeFileSync(filePath, JSON.stringify(rec, null, 2));
            return json({ success: true, status: rec.status });
          }
        }
      }
      return json({ error: "Recommendation not found" }, 404);
    } catch (e) {
      return json({ error: "Invalid request body" }, 400);
    }
  }

  // GET /api/mobile/projects
  if (p === "/api/mobile/projects" && req.method === "GET") {
    const projects: unknown[] = [];
    if (hqDir) {
      const slugs = getProjectSlugs(hqDir);
      for (const slug of slugs) {
        const projectJson = readJsonSafe(path.join(hqDir, "projects", slug, "project.json"));
        const features = readJsonSafe(path.join(hqDir, "projects", slug, "features.json"));
        const progress = readJsonSafe(path.join(hqDir, "projects", slug, "progress.json"));
        const sessions = registry.listByProject(slug);
        projects.push({
          slug,
          name: projectJson?.name || slug,
          ...(projectJson || {}),
          featureCount: Array.isArray(features) ? features.length : 0,
          progress: progress?.overall ?? null,
          activeSessions: sessions.length,
          waitingSessions: sessions.filter((s) => s.status === "waiting").length,
        });
      }
    }
    return json({ projects });
  }

  // GET /api/mobile/projects/:slug
  const projectMatch = p.match(/^\/api\/mobile\/projects\/([^/]+)$/);
  if (projectMatch && req.method === "GET") {
    const slug = projectMatch[1];
    if (!hqDir) return json({ error: "hq-data not found" }, 500);
    const projectJson = readJsonSafe(path.join(hqDir, "projects", slug, "project.json"));
    if (!projectJson) return json({ error: "Project not found" }, 404);
    const features = readJsonSafe(path.join(hqDir, "projects", slug, "features.json"));
    const progress = readJsonSafe(path.join(hqDir, "projects", slug, "progress.json"));
    const sessions = registry.listByProject(slug);
    return json({
      ...projectJson,
      slug,
      features: features || [],
      progress: progress || null,
      sessions,
    });
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Claude/Samurai/Forge/friday && bun test tests/unit/mobile/routes.test.ts`
Expected: All 6 tests pass

- [ ] **Step 5: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add friday/src/modules/mobile/routes.ts friday/tests/unit/mobile/routes.test.ts
git commit -m "feat(mobile): add REST API routes for mobile endpoints"
```

---

## Task 4: Alerts Module

**Files:**
- Create: `friday/src/modules/mobile/alerts.ts`
- Test: `friday/tests/unit/mobile/alerts.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// friday/tests/unit/mobile/alerts.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { MobileAlertManager } from "../../../src/modules/mobile/alerts.ts";
import { SessionRegistry } from "../../../src/modules/mobile/session-registry.ts";
import type { MobileEvent } from "../../../src/modules/mobile/types.ts";

describe("MobileAlertManager", () => {
  let registry: SessionRegistry;
  let alerts: MobileAlertManager;
  let firedEvents: MobileEvent[];

  beforeEach(() => {
    registry = new SessionRegistry();
    firedEvents = [];
    alerts = new MobileAlertManager(registry, (event) => {
      firedEvents.push(event);
    });
  });

  test("fires session:needs-input when session starts waiting", () => {
    registry.register({ scopeId: "s1", project: "test", agent: "Agent", taskDescription: "task" });
    registry.appendOutput("s1", "Proceed? (y/n)");
    expect(firedEvents.length).toBe(1);
    expect(firedEvents[0].type).toBe("session:needs-input");
  });

  test("fires session:complete when session finishes", () => {
    registry.register({ scopeId: "s1", project: "test", agent: "Agent", taskDescription: "task" });
    registry.markComplete("s1");
    expect(firedEvents.some((e) => e.type === "session:complete")).toBe(true);
  });

  test("includes session info in event data", () => {
    registry.register({ scopeId: "s1", project: "safetyfirst", agent: "Backend Engineer", taskDescription: "API" });
    registry.appendOutput("s1", "Continue? (yes/no)");
    const event = firedEvents[0];
    expect(event.data.scopeId).toBe("s1");
    expect(event.data.project).toBe("safetyfirst");
    expect(event.data.agent).toBe("Backend Engineer");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Claude/Samurai/Forge/friday && bun test tests/unit/mobile/alerts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement alerts**

```typescript
// friday/src/modules/mobile/alerts.ts
import type { SessionRegistry } from "./session-registry.ts";
import type { MobileEvent, SessionStatus } from "./types.ts";

export class MobileAlertManager {
  constructor(
    registry: SessionRegistry,
    private emit: (event: MobileEvent) => void,
  ) {
    registry.onChange((scopeId, status) => {
      this.handleStatusChange(scopeId, status, registry);
    });
  }

  private handleStatusChange(
    scopeId: string,
    status: SessionStatus,
    registry: SessionRegistry,
  ): void {
    const session = registry.get(scopeId);
    if (!session) return;

    const eventData = {
      scopeId: session.scopeId,
      project: session.project,
      agent: session.agent,
      taskDescription: session.taskDescription,
      promptType: session.prompt?.type ?? null,
    };

    if (status === "waiting") {
      this.emit({
        type: "session:needs-input",
        data: eventData,
        timestamp: new Date().toISOString(),
      });
    } else if (status === "complete") {
      this.emit({
        type: "session:complete",
        data: eventData,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Claude/Samurai/Forge/friday && bun test tests/unit/mobile/alerts.test.ts`
Expected: All 3 tests pass

- [ ] **Step 5: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add friday/src/modules/mobile/alerts.ts friday/tests/unit/mobile/alerts.test.ts
git commit -m "feat(mobile): add alert manager for session status events"
```

---

## Task 5: Terminal Bridge

**Files:**
- Create: `friday/src/modules/mobile/terminal-bridge.ts`
- Test: `friday/tests/unit/mobile/terminal-bridge.test.ts`

This is the core piece — relays PTY I/O between mobile WebSocket clients and Electron's PTY processes via the existing Friday↔Electron WebSocket bridge.

- [ ] **Step 1: Write failing tests**

```typescript
// friday/tests/unit/mobile/terminal-bridge.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { TerminalBridge } from "../../../src/modules/mobile/terminal-bridge.ts";
import { SessionRegistry } from "../../../src/modules/mobile/session-registry.ts";

describe("TerminalBridge", () => {
  let registry: SessionRegistry;
  let bridge: TerminalBridge;
  let sentToElectron: any[];

  beforeEach(() => {
    registry = new SessionRegistry();
    sentToElectron = [];
    bridge = new TerminalBridge(registry, (msg) => {
      sentToElectron.push(msg);
    });
  });

  test("subscribes to terminal output for a scopeId", () => {
    const clientSend = (msg: any) => {};
    bridge.subscribe("client-1", "scope-abc", clientSend);
    expect(sentToElectron).toHaveLength(1);
    expect(sentToElectron[0]).toEqual({
      type: "mobile:terminal:subscribe",
      scopeId: "scope-abc",
    });
  });

  test("relays terminal output to subscribed client", () => {
    const received: any[] = [];
    const clientSend = (msg: any) => received.push(msg);
    bridge.subscribe("client-1", "scope-abc", clientSend);

    bridge.handleElectronMessage({
      type: "mobile:terminal:data",
      scopeId: "scope-abc",
      data: "Hello from terminal",
    });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("terminal:data");
    expect(received[0].data).toBe("Hello from terminal");
  });

  test("sends input to Electron for a terminal", () => {
    const clientSend = (msg: any) => {};
    bridge.subscribe("client-1", "scope-abc", clientSend);
    bridge.sendInput("scope-abc", "yes\r");

    // Should send subscribe + input
    expect(sentToElectron).toHaveLength(2);
    expect(sentToElectron[1]).toEqual({
      type: "mobile:terminal:input",
      scopeId: "scope-abc",
      data: "yes\r",
    });
  });

  test("updates session registry on output", () => {
    registry.register({ scopeId: "scope-abc", project: "test", agent: "Agent", taskDescription: "task" });
    const clientSend = (msg: any) => {};
    bridge.subscribe("client-1", "scope-abc", clientSend);

    bridge.handleElectronMessage({
      type: "mobile:terminal:data",
      scopeId: "scope-abc",
      data: "Proceed? (y/n)",
    });

    const session = registry.get("scope-abc");
    expect(session!.status).toBe("waiting");
  });

  test("marks input sent in registry when sending input", () => {
    registry.register({ scopeId: "scope-abc", project: "test", agent: "Agent", taskDescription: "task" });
    registry.appendOutput("scope-abc", "Continue? (y/n)");
    expect(registry.get("scope-abc")!.status).toBe("waiting");

    const clientSend = (msg: any) => {};
    bridge.subscribe("client-1", "scope-abc", clientSend);
    bridge.sendInput("scope-abc", "yes\r");

    expect(registry.get("scope-abc")!.status).toBe("running");
  });

  test("handles terminal exit", () => {
    registry.register({ scopeId: "scope-abc", project: "test", agent: "Agent", taskDescription: "task" });
    const received: any[] = [];
    const clientSend = (msg: any) => received.push(msg);
    bridge.subscribe("client-1", "scope-abc", clientSend);

    bridge.handleElectronMessage({
      type: "mobile:terminal:exit",
      scopeId: "scope-abc",
      exitCode: 0,
    });

    expect(registry.get("scope-abc")!.status).toBe("complete");
    expect(received.some((m) => m.type === "terminal:exit")).toBe(true);
  });

  test("unsubscribes client", () => {
    const received: any[] = [];
    const clientSend = (msg: any) => received.push(msg);
    bridge.subscribe("client-1", "scope-abc", clientSend);
    bridge.unsubscribe("client-1");

    bridge.handleElectronMessage({
      type: "mobile:terminal:data",
      scopeId: "scope-abc",
      data: "should not arrive",
    });

    // Only the subscribe confirmation should have been sent, no data relay
    expect(received).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Claude/Samurai/Forge/friday && bun test tests/unit/mobile/terminal-bridge.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement terminal bridge**

```typescript
// friday/src/modules/mobile/terminal-bridge.ts
import type { SessionRegistry } from "./session-registry.ts";

type SendFn = (msg: Record<string, unknown>) => void;

interface Subscription {
  clientId: string;
  scopeId: string;
  send: SendFn;
}

/**
 * Bridges mobile WebSocket clients to Electron's PTY processes.
 *
 * Flow:
 * 1. Phone connects WS → subscribe(clientId, scopeId, send)
 * 2. Bridge tells Electron to tee PTY output → sendToElectron({ type: "mobile:terminal:subscribe", scopeId })
 * 3. Electron sends output → handleElectronMessage({ type: "mobile:terminal:data", scopeId, data })
 * 4. Bridge relays to subscribed client + feeds session registry
 * 5. Client sends input → sendInput(scopeId, data) → sendToElectron({ type: "mobile:terminal:input", scopeId, data })
 */
export class TerminalBridge {
  private subscriptions = new Map<string, Subscription>(); // clientId → subscription

  constructor(
    private registry: SessionRegistry,
    private sendToElectron: SendFn,
  ) {}

  subscribe(clientId: string, scopeId: string, send: SendFn): void {
    this.subscriptions.set(clientId, { clientId, scopeId, send });
    this.sendToElectron({
      type: "mobile:terminal:subscribe",
      scopeId,
    });
  }

  unsubscribe(clientId: string): void {
    const sub = this.subscriptions.get(clientId);
    if (sub) {
      this.sendToElectron({
        type: "mobile:terminal:unsubscribe",
        scopeId: sub.scopeId,
      });
      this.subscriptions.delete(clientId);
    }
  }

  sendInput(scopeId: string, data: string): void {
    this.registry.markInputSent(scopeId);
    this.sendToElectron({
      type: "mobile:terminal:input",
      scopeId,
      data,
    });
  }

  handleElectronMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;
    const scopeId = msg.scopeId as string;

    if (type === "mobile:terminal:data") {
      const data = msg.data as string;
      // Feed session registry for prompt detection
      this.registry.appendOutput(scopeId, data);
      // Relay to subscribed clients
      for (const sub of this.subscriptions.values()) {
        if (sub.scopeId === scopeId) {
          sub.send({ type: "terminal:data", scopeId, data });
        }
      }
    } else if (type === "mobile:terminal:exit") {
      this.registry.markComplete(scopeId);
      for (const sub of this.subscriptions.values()) {
        if (sub.scopeId === scopeId) {
          sub.send({
            type: "terminal:exit",
            scopeId,
            exitCode: msg.exitCode,
          });
        }
      }
    } else if (type === "mobile:terminal:sessions") {
      // Bulk session list from Electron — sync registry
      const sessions = msg.sessions as Array<{
        scopeId: string;
        project?: string;
        agent?: string;
        taskDescription?: string;
      }>;
      if (Array.isArray(sessions)) {
        for (const s of sessions) {
          if (!this.registry.get(s.scopeId)) {
            this.registry.register({
              scopeId: s.scopeId,
              project: s.project || "unknown",
              agent: s.agent || "unknown",
              taskDescription: s.taskDescription || "",
            });
          }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Claude/Samurai/Forge/friday && bun test tests/unit/mobile/terminal-bridge.test.ts`
Expected: All 7 tests pass

- [ ] **Step 5: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add friday/src/modules/mobile/terminal-bridge.ts friday/tests/unit/mobile/terminal-bridge.test.ts
git commit -m "feat(mobile): add terminal bridge for PTY relay to mobile clients"
```

---

## Task 6: Mobile Module Barrel + Server Integration

**Files:**
- Create: `friday/src/modules/mobile/index.ts`
- Modify: `friday/src/server/index.ts`
- Modify: `friday/src/server/protocol.ts`

- [ ] **Step 1: Create module barrel**

```typescript
// friday/src/modules/mobile/index.ts
import type { FridayModule } from "../types.ts";
import { SessionRegistry } from "./session-registry.ts";
import { TerminalBridge } from "./terminal-bridge.ts";
import { MobileAlertManager } from "./alerts.ts";

// Singleton instances shared with server integration
export const mobileRegistry = new SessionRegistry();
export let mobileBridge: TerminalBridge | null = null;
export let mobileAlerts: MobileAlertManager | null = null;

/** Connected mobile WebSocket clients */
export const mobileClients = new Map<
  string,
  (msg: Record<string, unknown>) => void
>();

/** Initialize bridge with Electron send function */
export function initMobileBridge(
  sendToElectron: (msg: Record<string, unknown>) => void,
): void {
  mobileBridge = new TerminalBridge(mobileRegistry, sendToElectron);
  mobileAlerts = new MobileAlertManager(mobileRegistry, (event) => {
    // Broadcast to all connected mobile clients
    for (const send of mobileClients.values()) {
      try {
        send(event as unknown as Record<string, unknown>);
      } catch {}
    }
  });
  console.log("[Mobile] Bridge initialized — ready for connections");
}

const mobileModule = {
  name: "mobile",
  description:
    "Mobile companion API — REST endpoints, terminal bridge, session alerts",
  version: "1.0.0",
  tools: [],
  protocols: [],
  knowledge: [],
  triggers: [],
  clearance: ["read-fs", "network"] as const,
  async onLoad() {
    console.log("[Mobile] Module loaded");
  },
} satisfies FridayModule;

export default mobileModule;
```

- [ ] **Step 2: Add mobile message types to protocol.ts**

Add these types to `friday/src/server/protocol.ts`. Find the `ClientMessage` type union and add mobile types. Find the `ServerMessage` type union and add mobile types.

At the end of the file, add:

```typescript
// Mobile companion message types
export type MobileClientMessage =
  | { type: "mobile:identify"; id: string; platform: "ios" | "android"; appVersion: string }
  | { type: "mobile:terminal:subscribe"; id: string; scopeId: string }
  | { type: "mobile:terminal:unsubscribe"; id: string; scopeId: string }
  | { type: "mobile:terminal:input"; id: string; scopeId: string; data: string };

export type MobileServerMessage =
  | { type: "mobile:welcome"; clientId: string; sessionCount: number; alertCount: number }
  | { type: "terminal:data"; scopeId: string; data: string }
  | { type: "terminal:exit"; scopeId: string; exitCode: number }
  | { type: "session:update"; scopeId: string; status: string; prompt: unknown }
  | { type: "session:needs-input"; scopeId: string; project: string; agent: string; promptType: string }
  | { type: "session:complete"; scopeId: string; project: string; agent: string }
  | { type: "activity:new"; entry: unknown };
```

- [ ] **Step 3: Integrate mobile routes and WebSocket into server**

Modify `friday/src/server/index.ts`. Add the mobile imports at the top:

```typescript
import {
  mobileRegistry,
  mobileBridge,
  mobileClients,
  initMobileBridge,
} from "../modules/mobile/index.ts";
import { handleMobileRoute } from "../modules/mobile/routes.ts";
import { findHqDir } from "../modules/studio/hq-utils.ts";
```

In the `fetch()` handler, add mobile REST routes BEFORE the static file serving section (after the `/api/voice/turn` block):

```typescript
// Mobile API endpoints
if (url.pathname.startsWith("/api/mobile/")) {
  if (!authCheck(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const hqDir = findHqDir();
  const mobileResponse = await handleMobileRoute(req, url, mobileRegistry, hqDir);
  if (mobileResponse) return mobileResponse;
}
```

Add a second WebSocket upgrade path for mobile connections. Modify the existing `/ws` check to also handle `/ws/mobile` and `/ws/terminal/:scopeId`:

```typescript
// Mobile WebSocket upgrade
if (url.pathname === "/ws/mobile" || url.pathname.startsWith("/ws/terminal/")) {
  if (!authCheck(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const clientId = crypto.randomUUID();
  const isMobile = url.pathname === "/ws/mobile";
  const termScopeId = !isMobile
    ? url.pathname.replace("/ws/terminal/", "")
    : null;
  const upgraded = server.upgrade(req, {
    data: {
      clientId,
      handler: null, // No WebSocketHandler for mobile — handled separately
      _mobile: true,
      _termScopeId: termScopeId,
    },
  });
  if (upgraded) return undefined;
  return new Response("WebSocket upgrade failed", { status: 400 });
}
```

In the `websocket.open()` handler, add mobile client registration:

```typescript
open(ws: ServerWebSocket<WSData>) {
  const data = ws.data as any;
  if (data._mobile) {
    const send = (msg: Record<string, unknown>) => {
      try {
        if (ws.readyState === 1) ws.send(JSON.stringify(msg));
      } catch {}
    };
    if (data._termScopeId && mobileBridge) {
      // Terminal-specific connection
      mobileBridge.subscribe(data.clientId, data._termScopeId, send);
    } else {
      // General mobile event stream
      mobileClients.set(data.clientId, send);
      send({
        type: "mobile:welcome",
        clientId: data.clientId,
        sessionCount: mobileRegistry.listAll().length,
        alertCount: mobileRegistry.listWaiting().length,
      });
    }
  }
},
```

In the `websocket.message()` handler, add mobile message handling before the existing handler:

```typescript
async message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
  const data = ws.data as any;

  // Mobile client messages
  if (data._mobile && typeof message === "string") {
    try {
      const msg = JSON.parse(message);
      if (msg.type === "mobile:terminal:input" && mobileBridge) {
        mobileBridge.sendInput(msg.scopeId, msg.data);
      }
    } catch {}
    return;
  }

  // ... existing handler code
}
```

In the `websocket.close()` handler, add mobile cleanup:

```typescript
close(ws: ServerWebSocket<WSData>) {
  const data = ws.data as any;
  if (data._mobile) {
    mobileClients.delete(data.clientId);
    if (mobileBridge) mobileBridge.unsubscribe(data.clientId);
    return;
  }
  // ... existing close code
}
```

- [ ] **Step 4: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add friday/src/modules/mobile/index.ts friday/src/server/index.ts friday/src/server/protocol.ts
git commit -m "feat(mobile): wire mobile module into Friday server — REST routes + WebSocket channels"
```

---

## Task 7: Electron IPC Bridge for Mobile Terminal Relay

**Files:**
- Modify: `electron/main.cjs`

This adds IPC handlers so Friday can request terminal data relay and send input to PTY processes on behalf of mobile clients.

- [ ] **Step 1: Add mobile terminal relay handlers to electron/main.cjs**

Find the section where `fridayWs.onmessage` handles incoming messages (around line 1430 in `fridayConnect`). In the JSON message handler, add handling for mobile terminal messages. After the existing `coe:command` handling block, add:

```javascript
// Mobile terminal bridge messages
if (msg.type === 'mobile:terminal:subscribe') {
  const { scopeId } = msg;
  const entry = ptyProcesses.get(scopeId);
  const proc = entry?.proc || entry;
  if (proc && proc.onData) {
    // Set up output tee to Friday for this terminal
    if (!proc._mobileSubscribed) {
      proc._mobileSubscribed = true;
      proc.onData((data) => {
        if (fridayWs && fridayWs.readyState === 1) {
          fridayWs.send(JSON.stringify({
            type: 'mobile:terminal:data',
            scopeId,
            data,
          }));
        }
      });
      proc.onExit(({ exitCode }) => {
        if (fridayWs && fridayWs.readyState === 1) {
          fridayWs.send(JSON.stringify({
            type: 'mobile:terminal:exit',
            scopeId,
            exitCode,
          }));
        }
      });
    }
    console.log(`[Mobile] Subscribed to terminal: ${scopeId}`);
  } else {
    console.log(`[Mobile] Terminal not found: ${scopeId}`);
  }
}

if (msg.type === 'mobile:terminal:input') {
  const { scopeId, data } = msg;
  const entry = ptyProcesses.get(scopeId);
  const proc = entry?.proc || entry;
  if (proc) {
    proc.write(data);
    console.log(`[Mobile] Input sent to terminal ${scopeId}: ${data.length} chars`);
  }
}

if (msg.type === 'mobile:terminal:unsubscribe') {
  const { scopeId } = msg;
  console.log(`[Mobile] Unsubscribed from terminal: ${scopeId}`);
  // Note: node-pty onData listeners can't be removed individually,
  // but the flag prevents future subscriptions from being re-added
}

if (msg.type === 'mobile:list-sessions') {
  // Send all active PTY session info to Friday
  const sessions = [];
  for (const [scopeId, entry] of ptyProcesses.entries()) {
    const proc = entry?.proc || entry;
    if (proc && !proc.killed) {
      sessions.push({
        scopeId,
        project: entry?.projectSlug || 'unknown',
        agent: entry?.agentSlug || 'unknown',
        taskDescription: entry?.taskDescription || '',
      });
    }
  }
  fridayWs.send(JSON.stringify({
    type: 'mobile:terminal:sessions',
    sessions,
  }));
}
```

- [ ] **Step 2: Add session metadata to PTY process storage**

Find the `terminal:create-implementation` handler and the `terminal:create-agent-session` handler. Where PTY processes are stored in the `ptyProcesses` Map, ensure metadata is preserved. Find lines like `ptyProcesses.set(scopeId, proc)` in these handlers and change them to store metadata:

For `terminal:create-implementation`:
```javascript
ptyProcesses.set(scopeId, {
  proc,
  scope: '__impl__',
  projectSlug: projectSlug || 'unknown',
  agentSlug: agentSlug || 'unknown',
  taskDescription: prompt || '',
});
```

For `terminal:create-agent-session`:
```javascript
ptyProcesses.set(scopeId, {
  proc,
  scope: '__agent__',
  projectSlug: projectSlug || 'unknown',
  agentSlug: agentSlug || 'unknown',
  taskDescription: `Agent session: ${agentSlug}`,
});
```

- [ ] **Step 3: Send session list on Friday reconnect**

In the `fridayConnect` function, after the `session:identify` message is sent on WebSocket open, add a session list push:

```javascript
// After: fridayWs.send(JSON.stringify({ type: 'session:identify', ... }))
// Send current PTY session list to Friday for mobile registry sync
setTimeout(() => {
  if (fridayWs && fridayWs.readyState === 1) {
    fridayWs.send(JSON.stringify({ type: 'mobile:list-sessions' }));
  }
}, 1000);
```

- [ ] **Step 4: Test manually**

Start the Forge, open the terminal, check Friday server logs for `[Mobile] Module loaded`. Verify no errors on startup.

- [ ] **Step 5: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add electron/main.cjs
git commit -m "feat(mobile): add Electron IPC handlers for mobile terminal bridge relay"
```

---

## Task 8: Expo App Scaffold

**Files:**
- Create: `Forge/mobile/` (entire Expo project)

- [ ] **Step 1: Initialize Expo project**

```bash
cd C:/Claude/Samurai/Forge
npx create-expo-app@latest mobile --template blank-typescript
```

- [ ] **Step 2: Install dependencies**

```bash
cd C:/Claude/Samurai/Forge/mobile
npx expo install expo-router expo-constants expo-linking expo-status-bar expo-secure-store expo-notifications expo-speech expo-haptics react-native-safe-area-context react-native-screens react-native-gesture-handler
npm install zustand nativewind tailwindcss@3
```

- [ ] **Step 3: Configure app.json for Expo Router**

Replace `mobile/app.json`:

```json
{
  "expo": {
    "name": "Forge Mobile",
    "slug": "forge-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "forge-mobile",
    "userInterfaceStyle": "dark",
    "newArchEnabled": true,
    "splash": {
      "backgroundColor": "#0a0a0f"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.forge.mobile",
      "buildNumber": "1"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-notifications",
        {
          "sounds": []
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

- [ ] **Step 4: Configure EAS Build**

Create `mobile/eas.json`:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "",
        "ascAppId": "",
        "appleTeamId": ""
      }
    }
  }
}
```

- [ ] **Step 5: Configure NativeWind**

Create `mobile/tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{tsx,ts}", "./components/**/*.{tsx,ts}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: "#0a0a0f",
          surface: "#0d0d14",
          border: "rgba(255,255,255,0.08)",
          text: "#e0e0e0",
          muted: "#888888",
          accent: "#10b981",
          purple: "#8b5cf6",
          red: "#ef4444",
          amber: "#f59e0b",
        },
      },
    },
  },
  plugins: [],
};
```

Create `mobile/global.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Create `mobile/nativewind-env.d.ts`:

```typescript
/// <reference types="nativewind/types" />
```

Update `mobile/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts", "nativewind-env.d.ts"]
}
```

Add `mobile/babel.config.js`:

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

- [ ] **Step 6: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add mobile/
git commit -m "feat(mobile): scaffold Expo app with NativeWind, Expo Router, and EAS config"
```

---

## Task 9: Connection Management + API Client

**Files:**
- Create: `mobile/lib/connection.ts`
- Create: `mobile/lib/api.ts`
- Create: `mobile/lib/prompt-types.ts`

- [ ] **Step 1: Create shared prompt types**

```typescript
// mobile/lib/prompt-types.ts
export type PromptType = "binary" | "permission" | "numbered" | "open";

export interface DetectedPrompt {
  type: PromptType;
  options: string[];
  promptText: string;
}

export type SessionStatus = "running" | "waiting" | "idle" | "complete";

export interface SessionInfo {
  scopeId: string;
  project: string;
  agent: string;
  status: SessionStatus;
  prompt: DetectedPrompt | null;
  lastOutput: string[];
  startedAt: string;
  taskDescription: string;
}
```

- [ ] **Step 2: Create connection manager**

```typescript
// mobile/lib/connection.ts
import * as SecureStore from "expo-secure-store";

const STORE_KEY_HOST = "forge_host";
const STORE_KEY_TOKEN = "forge_token";

export interface ForgeConnection {
  host: string; // e.g. "100.64.0.1:3100" (Tailscale IP + port)
  token: string;
}

export async function saveConnection(conn: ForgeConnection): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY_HOST, conn.host);
  await SecureStore.setItemAsync(STORE_KEY_TOKEN, conn.token);
}

export async function loadConnection(): Promise<ForgeConnection | null> {
  const host = await SecureStore.getItemAsync(STORE_KEY_HOST);
  const token = await SecureStore.getItemAsync(STORE_KEY_TOKEN);
  if (!host || !token) return null;
  return { host, token };
}

export async function clearConnection(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEY_HOST);
  await SecureStore.deleteItemAsync(STORE_KEY_TOKEN);
}

export function baseUrl(conn: ForgeConnection): string {
  const h = conn.host.startsWith("http") ? conn.host : `http://${conn.host}`;
  return h.replace(/\/$/, "");
}

export function wsUrl(conn: ForgeConnection, path: string): string {
  const h = conn.host.replace(/^https?:\/\//, "");
  return `ws://${h}${path}`;
}
```

- [ ] **Step 3: Create API client**

```typescript
// mobile/lib/api.ts
import type { ForgeConnection } from "./connection";
import { baseUrl } from "./connection";
import type { SessionInfo } from "./prompt-types";

async function apiFetch<T>(
  conn: ForgeConnection,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${baseUrl(conn)}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${conn.token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export interface StatusResponse {
  status: string;
  timestamp: string;
  sessionCounts: {
    total: number;
    running: number;
    waiting: number;
    complete: number;
  };
  alertCount: number;
}

export interface OverviewResponse {
  stats: {
    totalSessions: number;
    waitingCount: number;
    runningCount: number;
    projectCount: number;
  };
  activity: Array<{
    id: number;
    agent: string;
    agentColor: string;
    action: string;
    project: string;
    timestamp: string;
  }>;
  alerts: Array<{
    scopeId: string;
    project: string;
    agent: string;
    promptType: string | null;
  }>;
}

export interface RecsResponse {
  recommendations: Array<{
    title: string;
    agent: string;
    agentColor: string;
    summary: string;
    status: string;
    timestamp: string;
    approaches: Array<{
      id: number;
      name: string;
      description: string;
      effort: string;
      impact: string;
    }>;
    recommended: number;
    reasoning: string;
    _project: string;
    _file: string;
  }>;
}

export interface ProjectSummary {
  slug: string;
  name: string;
  featureCount: number;
  progress: number | null;
  activeSessions: number;
  waitingSessions: number;
}

export interface ProjectDetail {
  slug: string;
  name: string;
  features: unknown[];
  progress: unknown;
  sessions: SessionInfo[];
}

export const api = {
  status: (conn: ForgeConnection) =>
    apiFetch<StatusResponse>(conn, "/api/mobile/status"),

  overview: (conn: ForgeConnection) =>
    apiFetch<OverviewResponse>(conn, "/api/mobile/overview"),

  sessions: (conn: ForgeConnection) =>
    apiFetch<{ sessions: SessionInfo[] }>(conn, "/api/mobile/sessions"),

  recommendations: (conn: ForgeConnection, project?: string) => {
    const qs = project ? `?project=${encodeURIComponent(project)}` : "";
    return apiFetch<RecsResponse>(conn, `/api/mobile/recommendations${qs}`);
  },

  recAction: (conn: ForgeConnection, file: string, action: string) =>
    apiFetch<{ success: boolean }>(
      conn,
      `/api/mobile/recommendations/${encodeURIComponent(file)}/action`,
      { method: "POST", body: JSON.stringify({ action }) },
    ),

  projects: (conn: ForgeConnection) =>
    apiFetch<{ projects: ProjectSummary[] }>(conn, "/api/mobile/projects"),

  project: (conn: ForgeConnection, slug: string) =>
    apiFetch<ProjectDetail>(conn, `/api/mobile/projects/${slug}`),
};
```

- [ ] **Step 4: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add mobile/lib/
git commit -m "feat(mobile): add connection manager, API client, and shared types"
```

---

## Task 10: Zustand Store + WebSocket Manager

**Files:**
- Create: `mobile/lib/store.ts`
- Create: `mobile/lib/ws.ts`
- Create: `mobile/lib/notifications.ts`

- [ ] **Step 1: Create WebSocket manager**

```typescript
// mobile/lib/ws.ts
import type { ForgeConnection } from "./connection";
import { wsUrl } from "./connection";

type MessageHandler = (msg: Record<string, unknown>) => void;

export class ForgeWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnect = 10;
  private handlers = new Map<string, MessageHandler[]>();

  constructor(
    private conn: ForgeConnection,
    private path: string,
  ) {}

  connect(): void {
    const url = wsUrl(this.conn, `${this.path}?token=${this.conn.token}`);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.emit("_connected", {});
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const type = msg.type as string;
        this.emit(type, msg);
        this.emit("*", msg); // wildcard
      } catch {}
    };

    this.ws.onclose = (event) => {
      this.emit("_disconnected", { code: event.code });
      if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnect) {
        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
        this.reconnectTimer = setTimeout(() => {
          this.reconnectAttempts++;
          this.connect();
        }, delay);
      }
    };

    this.ws.onerror = () => {};
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    const list = this.handlers.get(type) || [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => {
      const l = this.handlers.get(type) || [];
      this.handlers.set(
        type,
        l.filter((h) => h !== handler),
      );
    };
  }

  private emit(type: string, msg: Record<string, unknown>): void {
    const list = this.handlers.get(type) || [];
    for (const h of list) {
      try { h(msg); } catch {}
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000);
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
```

- [ ] **Step 2: Create notifications helper**

```typescript
// mobile/lib/notifications.ts
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function notifySessionNeedsInput(
  scopeId: string,
  agent: string,
  project: string,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${agent} needs input`,
      body: `Project: ${project}`,
      data: { scopeId, screen: "session" },
    },
    trigger: null, // immediate
  });
}

// Handle notification tap → navigate to session
Notifications.addNotificationResponseReceivedListener((response) => {
  const data = response.notification.request.content.data;
  if (data?.scopeId) {
    router.push(`/session/${data.scopeId}`);
  }
});
```

- [ ] **Step 3: Create Zustand store**

```typescript
// mobile/lib/store.ts
import { create } from "zustand";
import type { ForgeConnection } from "./connection";
import type { SessionInfo } from "./prompt-types";
import type {
  StatusResponse,
  OverviewResponse,
  RecsResponse,
  ProjectSummary,
} from "./api";
import { api } from "./api";
import { ForgeWebSocket } from "./ws";
import { notifySessionNeedsInput } from "./notifications";

interface ForgeStore {
  // Connection
  connection: ForgeConnection | null;
  connected: boolean;
  setConnection: (conn: ForgeConnection | null) => void;

  // WebSocket
  mobileWs: ForgeWebSocket | null;
  connectWs: () => void;
  disconnectWs: () => void;

  // Data
  status: StatusResponse | null;
  overview: OverviewResponse | null;
  sessions: SessionInfo[];
  recommendations: RecsResponse["recommendations"];
  projects: ProjectSummary[];

  // Actions
  fetchStatus: () => Promise<void>;
  fetchOverview: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  fetchRecommendations: (project?: string) => Promise<void>;
  fetchProjects: () => Promise<void>;
  refreshAll: () => Promise<void>;

  // Loading
  loading: boolean;
  error: string | null;
}

export const useForgeStore = create<ForgeStore>((set, get) => ({
  connection: null,
  connected: false,
  setConnection: (conn) => set({ connection: conn }),

  mobileWs: null,

  connectWs: () => {
    const { connection } = get();
    if (!connection) return;

    const ws = new ForgeWebSocket(connection, "/ws/mobile");

    ws.on("_connected", () => set({ connected: true }));
    ws.on("_disconnected", () => set({ connected: false }));

    ws.on("session:needs-input", (msg) => {
      const { scopeId, agent, project } = msg.data as Record<string, string>;
      notifySessionNeedsInput(scopeId, agent, project);
      // Refresh sessions to update UI
      get().fetchSessions();
    });

    ws.on("session:complete", () => {
      get().fetchSessions();
    });

    ws.on("activity:new", () => {
      get().fetchOverview();
    });

    ws.connect();
    set({ mobileWs: ws });
  },

  disconnectWs: () => {
    get().mobileWs?.disconnect();
    set({ mobileWs: null, connected: false });
  },

  status: null,
  overview: null,
  sessions: [],
  recommendations: [],
  projects: [],
  loading: false,
  error: null,

  fetchStatus: async () => {
    const { connection } = get();
    if (!connection) return;
    try {
      const status = await api.status(connection);
      set({ status, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchOverview: async () => {
    const { connection } = get();
    if (!connection) return;
    try {
      const overview = await api.overview(connection);
      set({ overview, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchSessions: async () => {
    const { connection } = get();
    if (!connection) return;
    try {
      const data = await api.sessions(connection);
      set({ sessions: data.sessions, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchRecommendations: async (project?: string) => {
    const { connection } = get();
    if (!connection) return;
    try {
      const data = await api.recommendations(connection, project);
      set({ recommendations: data.recommendations, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchProjects: async () => {
    const { connection } = get();
    if (!connection) return;
    try {
      const data = await api.projects(connection);
      set({ projects: data.projects, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  refreshAll: async () => {
    set({ loading: true });
    const { fetchStatus, fetchOverview, fetchSessions, fetchRecommendations, fetchProjects } = get();
    await Promise.allSettled([
      fetchStatus(),
      fetchOverview(),
      fetchSessions(),
      fetchRecommendations(),
      fetchProjects(),
    ]);
    set({ loading: false });
  },
}));
```

- [ ] **Step 4: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add mobile/lib/
git commit -m "feat(mobile): add Zustand store, WebSocket manager, and notifications"
```

---

## Task 11: App Layout + Connect Screen

**Files:**
- Create: `mobile/app/_layout.tsx`
- Create: `mobile/app/connect.tsx`

- [ ] **Step 1: Create root layout with auth gate**

```tsx
// mobile/app/_layout.tsx
import "../global.css";
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { loadConnection } from "@/lib/connection";
import { useForgeStore } from "@/lib/store";
import { requestPermissions } from "@/lib/notifications";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const setConnection = useForgeStore((s) => s.setConnection);
  const connection = useForgeStore((s) => s.connection);

  useEffect(() => {
    (async () => {
      const conn = await loadConnection();
      if (conn) setConnection(conn);
      await requestPermissions();
      setReady(true);
    })();
  }, []);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0a0a0f" },
          animation: "fade",
        }}
      >
        {!connection ? (
          <Stack.Screen name="connect" />
        ) : (
          <Stack.Screen name="(tabs)" />
        )}
        <Stack.Screen
          name="session/[scopeId]"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="rec/[id]"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="project/[slug]"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
      </Stack>
    </>
  );
}
```

- [ ] **Step 2: Create connect screen**

```tsx
// mobile/app/connect.tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useForgeStore } from "@/lib/store";
import { saveConnection } from "@/lib/connection";
import { api } from "@/lib/api";

export default function ConnectScreen() {
  const [host, setHost] = useState("");
  const [token, setToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setConnection = useForgeStore((s) => s.setConnection);

  const handleConnect = async () => {
    if (!host.trim() || !token.trim()) {
      setError("Both fields are required");
      return;
    }
    setTesting(true);
    setError(null);
    const conn = { host: host.trim(), token: token.trim() };
    try {
      await api.status(conn);
      await saveConnection(conn);
      setConnection(conn);
    } catch (e) {
      setError(`Connection failed: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <View className="flex-1 bg-forge-bg justify-center px-8">
      <Text className="text-3xl font-bold text-forge-text mb-2">
        Forge Mobile
      </Text>
      <Text className="text-forge-muted mb-8">
        Connect to your Forge instance over Tailscale
      </Text>

      <Text className="text-forge-muted text-sm mb-2">
        Forge Address (Tailscale IP:Port)
      </Text>
      <TextInput
        className="bg-forge-surface border border-forge-border rounded-xl px-4 py-3 text-forge-text mb-4"
        placeholder="100.64.0.1:3100"
        placeholderTextColor="#666"
        value={host}
        onChangeText={setHost}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <Text className="text-forge-muted text-sm mb-2">
        Auth Token (FRIDAY_REMOTE_TOKEN)
      </Text>
      <TextInput
        className="bg-forge-surface border border-forge-border rounded-xl px-4 py-3 text-forge-text mb-6"
        placeholder="your-token-here"
        placeholderTextColor="#666"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      {error && (
        <Text className="text-forge-red text-sm mb-4">{error}</Text>
      )}

      <Pressable
        className="bg-forge-accent rounded-xl py-4 items-center"
        onPress={handleConnect}
        disabled={testing}
      >
        {testing ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-bold text-lg">Connect</Text>
        )}
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add mobile/app/_layout.tsx mobile/app/connect.tsx
git commit -m "feat(mobile): add root layout with auth gate and connect screen"
```

---

## Task 12: Tab Navigation + Overview Screen

**Files:**
- Create: `mobile/app/(tabs)/_layout.tsx`
- Create: `mobile/app/(tabs)/index.tsx`
- Create: `mobile/components/AlertBanner.tsx`
- Create: `mobile/components/ActivityFeed.tsx`
- Create: `mobile/components/ConnectionStatus.tsx`

- [ ] **Step 1: Create tab layout with badge counts**

```tsx
// mobile/app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { useEffect } from "react";
import { useForgeStore } from "@/lib/store";

export default function TabLayout() {
  const connectWs = useForgeStore((s) => s.connectWs);
  const refreshAll = useForgeStore((s) => s.refreshAll);
  const waitingCount = useForgeStore(
    (s) => s.sessions.filter((ses) => ses.status === "waiting").length,
  );

  useEffect(() => {
    connectWs();
    refreshAll();
    const interval = setInterval(refreshAll, 15000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0a0a0f",
          borderTopColor: "rgba(255,255,255,0.08)",
        },
        tabBarActiveTintColor: "#10b981",
        tabBarInactiveTintColor: "#666",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Overview",
          tabBarIcon: ({ color }) => (
            <TabIcon label="O" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="recs"
        options={{
          title: "Recs",
          tabBarIcon: ({ color }) => (
            <TabIcon label="R" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarIcon: ({ color }) => (
            <TabIcon label="P" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cli"
        options={{
          title: "CLI",
          tabBarBadge: waitingCount > 0 ? waitingCount : undefined,
          tabBarBadgeStyle: { backgroundColor: "#ef4444" },
          tabBarIcon: ({ color }) => (
            <TabIcon label=">" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({ label, color }: { label: string; color: string }) {
  const { Text } = require("react-native");
  return (
    <Text style={{ color, fontSize: 18, fontWeight: "700", fontFamily: "monospace" }}>
      {label}
    </Text>
  );
}
```

- [ ] **Step 2: Create components**

```tsx
// mobile/components/ConnectionStatus.tsx
import { View, Text } from "react-native";
import { useForgeStore } from "@/lib/store";

export function ConnectionStatus() {
  const connected = useForgeStore((s) => s.connected);
  return (
    <View className="flex-row items-center gap-2">
      <View
        className={`w-2 h-2 rounded-full ${connected ? "bg-forge-accent" : "bg-forge-red"}`}
      />
      <Text className="text-forge-muted text-xs">
        {connected ? "Tailscale Connected" : "Disconnected"}
      </Text>
    </View>
  );
}
```

```tsx
// mobile/components/AlertBanner.tsx
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import type { OverviewResponse } from "@/lib/api";

interface Props {
  alerts: OverviewResponse["alerts"];
}

export function AlertBanner({ alerts }: Props) {
  if (!alerts.length) return null;

  return (
    <Pressable
      className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-3"
      onPress={() => router.push("/(tabs)/cli")}
    >
      <View className="flex-row items-center gap-3">
        <View className="w-2 h-2 rounded-full bg-forge-red" />
        <View>
          <Text className="text-forge-red font-semibold text-sm">
            {alerts.length} session{alerts.length > 1 ? "s" : ""} need{alerts.length === 1 ? "s" : ""} input
          </Text>
          <Text className="text-forge-muted text-xs mt-0.5">
            {alerts.map((a) => `${a.project}: ${a.agent}`).join(" · ")}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
```

```tsx
// mobile/components/ActivityFeed.tsx
import { View, Text, FlatList } from "react-native";

interface ActivityEntry {
  id: number;
  agent: string;
  agentColor: string;
  action: string;
  project: string;
  timestamp: string;
}

interface Props {
  entries: ActivityEntry[];
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ActivityFeed({ entries }: Props) {
  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => String(item.id)}
      scrollEnabled={false}
      renderItem={({ item }) => (
        <View className="flex-row gap-3 py-2.5 border-b border-forge-border">
          <View
            className="w-8 h-8 rounded-lg items-center justify-center"
            style={{ backgroundColor: item.agentColor + "33" }}
          >
            <Text style={{ color: item.agentColor, fontSize: 12, fontWeight: "700" }}>
              {item.agent.charAt(0)}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-forge-text text-sm">
              <Text className="font-semibold">{item.agent}</Text> {item.action}
            </Text>
            <Text className="text-forge-muted text-xs mt-0.5">
              {item.project} · {timeAgo(item.timestamp)}
            </Text>
          </View>
        </View>
      )}
    />
  );
}
```

- [ ] **Step 3: Create Overview tab**

```tsx
// mobile/app/(tabs)/index.tsx
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useState } from "react";
import { useForgeStore } from "@/lib/store";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { AlertBanner } from "@/components/AlertBanner";
import { ActivityFeed } from "@/components/ActivityFeed";

export default function OverviewScreen() {
  const overview = useForgeStore((s) => s.overview);
  const refreshAll = useForgeStore((s) => s.refreshAll);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  return (
    <ScrollView
      className="flex-1 bg-forge-bg"
      contentContainerClassName="p-4 pt-16"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
      }
    >
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <Text className="text-2xl font-bold text-forge-text">Forge HQ</Text>
          <Text className="text-forge-muted text-xs mt-1">
            {overview?.stats.projectCount ?? 0} projects ·{" "}
            {overview?.stats.totalSessions ?? 0} sessions
          </Text>
        </View>
        <ConnectionStatus />
      </View>

      <AlertBanner alerts={overview?.alerts ?? []} />

      {overview?.stats && (
        <View className="flex-row gap-3 mb-4">
          <StatCard label="Running" value={overview.stats.runningCount} color="#10b981" />
          <StatCard label="Waiting" value={overview.stats.waitingCount} color="#ef4444" />
          <StatCard label="Projects" value={overview.stats.projectCount} color="#8b5cf6" />
        </View>
      )}

      <Text className="text-forge-muted text-xs uppercase tracking-wider mb-2">
        Recent Activity
      </Text>
      <ActivityFeed entries={overview?.activity ?? []} />
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View
      className="flex-1 rounded-xl p-3 border"
      style={{
        backgroundColor: color + "0D",
        borderColor: color + "26",
      }}
    >
      <Text style={{ color, fontSize: 24, fontWeight: "700" }}>{value}</Text>
      <Text className="text-forge-muted text-xs">{label}</Text>
    </View>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add mobile/app/ mobile/components/
git commit -m "feat(mobile): add tab navigation, Overview screen, and core components"
```

---

## Task 13: Recommendations + Projects Tabs

**Files:**
- Create: `mobile/app/(tabs)/recs.tsx`
- Create: `mobile/app/(tabs)/projects.tsx`
- Create: `mobile/app/rec/[id].tsx`
- Create: `mobile/app/project/[slug].tsx`
- Create: `mobile/components/RecommendationCard.tsx`
- Create: `mobile/components/ProjectCard.tsx`

- [ ] **Step 1: Create RecommendationCard and ProjectCard components**

```tsx
// mobile/components/RecommendationCard.tsx
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";

interface Props {
  rec: {
    title: string;
    agent: string;
    agentColor: string;
    summary: string;
    status: string;
    _project: string;
    _file: string;
  };
}

export function RecommendationCard({ rec }: Props) {
  return (
    <Pressable
      className="bg-forge-surface border border-forge-border rounded-xl p-4 mb-3"
      onPress={() =>
        router.push(`/rec/${encodeURIComponent(rec._file)}`)
      }
    >
      <View className="flex-row items-center gap-2 mb-2">
        <View
          className="w-6 h-6 rounded-md items-center justify-center"
          style={{ backgroundColor: rec.agentColor + "33" }}
        >
          <Text style={{ color: rec.agentColor, fontSize: 10, fontWeight: "700" }}>
            {rec.agent.charAt(0)}
          </Text>
        </View>
        <Text className="text-forge-muted text-xs flex-1">{rec.agent}</Text>
        <Text className="text-forge-muted text-xs bg-forge-border/50 px-2 py-0.5 rounded">
          {rec._project}
        </Text>
      </View>
      <Text className="text-forge-text font-semibold text-sm mb-1">
        {rec.title}
      </Text>
      <Text className="text-forge-muted text-xs" numberOfLines={2}>
        {rec.summary}
      </Text>
    </Pressable>
  );
}
```

```tsx
// mobile/components/ProjectCard.tsx
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import type { ProjectSummary } from "@/lib/api";

interface Props {
  project: ProjectSummary;
}

export function ProjectCard({ project }: Props) {
  return (
    <Pressable
      className="bg-forge-surface border border-forge-border rounded-xl p-4 mb-3"
      onPress={() => router.push(`/project/${project.slug}`)}
    >
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-forge-text font-semibold text-base">
          {project.name}
        </Text>
        {project.waitingSessions > 0 && (
          <View className="bg-forge-red/20 px-2 py-0.5 rounded-full">
            <Text className="text-forge-red text-xs font-semibold">
              {project.waitingSessions} waiting
            </Text>
          </View>
        )}
      </View>
      <View className="flex-row gap-4">
        <Text className="text-forge-muted text-xs">
          {project.featureCount} features
        </Text>
        <Text className="text-forge-muted text-xs">
          {project.activeSessions} sessions
        </Text>
        {project.progress !== null && (
          <Text className="text-forge-accent text-xs">
            {Math.round(project.progress * 100)}% complete
          </Text>
        )}
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 2: Create Recs and Projects tabs**

```tsx
// mobile/app/(tabs)/recs.tsx
import { View, Text, ScrollView, RefreshControl, Pressable } from "react-native";
import { useState } from "react";
import { useForgeStore } from "@/lib/store";
import { RecommendationCard } from "@/components/RecommendationCard";

export default function RecsScreen() {
  const recommendations = useForgeStore((s) => s.recommendations);
  const projects = useForgeStore((s) => s.projects);
  const fetchRecommendations = useForgeStore((s) => s.fetchRecommendations);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRecommendations(filter ?? undefined);
    setRefreshing(false);
  };

  const filtered = filter
    ? recommendations.filter((r) => r._project === filter)
    : recommendations;

  return (
    <ScrollView
      className="flex-1 bg-forge-bg"
      contentContainerClassName="p-4 pt-16"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
      }
    >
      <Text className="text-2xl font-bold text-forge-text mb-4">
        Recommendations
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
        <Pressable
          className={`px-3 py-1.5 rounded-full mr-2 ${!filter ? "bg-forge-accent" : "bg-forge-surface border border-forge-border"}`}
          onPress={() => setFilter(null)}
        >
          <Text className={!filter ? "text-white text-xs font-semibold" : "text-forge-muted text-xs"}>
            All
          </Text>
        </Pressable>
        {projects.map((p) => (
          <Pressable
            key={p.slug}
            className={`px-3 py-1.5 rounded-full mr-2 ${filter === p.slug ? "bg-forge-accent" : "bg-forge-surface border border-forge-border"}`}
            onPress={() => setFilter(p.slug)}
          >
            <Text
              className={
                filter === p.slug
                  ? "text-white text-xs font-semibold"
                  : "text-forge-muted text-xs"
              }
            >
              {p.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {filtered.map((rec) => (
        <RecommendationCard key={rec._file} rec={rec} />
      ))}
      {filtered.length === 0 && (
        <Text className="text-forge-muted text-center mt-8">No recommendations</Text>
      )}
    </ScrollView>
  );
}
```

```tsx
// mobile/app/(tabs)/projects.tsx
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useState } from "react";
import { useForgeStore } from "@/lib/store";
import { ProjectCard } from "@/components/ProjectCard";

export default function ProjectsScreen() {
  const projects = useForgeStore((s) => s.projects);
  const fetchProjects = useForgeStore((s) => s.fetchProjects);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProjects();
    setRefreshing(false);
  };

  return (
    <ScrollView
      className="flex-1 bg-forge-bg"
      contentContainerClassName="p-4 pt-16"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
      }
    >
      <Text className="text-2xl font-bold text-forge-text mb-4">Projects</Text>
      {projects.map((p) => (
        <ProjectCard key={p.slug} project={p} />
      ))}
      {projects.length === 0 && (
        <Text className="text-forge-muted text-center mt-8">No projects</Text>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 3: Create detail screens**

```tsx
// mobile/app/rec/[id].tsx
import { View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useForgeStore } from "@/lib/store";
import { api } from "@/lib/api";

export default function RecDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recommendations = useForgeStore((s) => s.recommendations);
  const connection = useForgeStore((s) => s.connection);
  const fetchRecommendations = useForgeStore((s) => s.fetchRecommendations);
  const rec = recommendations.find((r) => r._file === decodeURIComponent(id ?? ""));

  if (!rec) {
    return (
      <View className="flex-1 bg-forge-bg justify-center items-center">
        <Text className="text-forge-muted">Recommendation not found</Text>
      </View>
    );
  }

  const handleAction = async (action: string) => {
    if (!connection) return;
    await api.recAction(connection, rec._file, action);
    await fetchRecommendations();
    router.back();
  };

  return (
    <ScrollView className="flex-1 bg-forge-bg" contentContainerClassName="p-4 pt-8">
      <Pressable onPress={() => router.back()} className="mb-4">
        <Text className="text-forge-accent">Back</Text>
      </Pressable>

      <View className="flex-row items-center gap-2 mb-3">
        <View
          className="w-8 h-8 rounded-lg items-center justify-center"
          style={{ backgroundColor: rec.agentColor + "33" }}
        >
          <Text style={{ color: rec.agentColor, fontSize: 14, fontWeight: "700" }}>
            {rec.agent.charAt(0)}
          </Text>
        </View>
        <View>
          <Text className="text-forge-text font-semibold">{rec.agent}</Text>
          <Text className="text-forge-muted text-xs">{rec._project}</Text>
        </View>
      </View>

      <Text className="text-xl font-bold text-forge-text mb-2">{rec.title}</Text>
      <Text className="text-forge-muted text-sm mb-6">{rec.summary}</Text>

      <Text className="text-forge-muted text-xs uppercase tracking-wider mb-3">
        Approaches
      </Text>
      {rec.approaches?.map((approach) => (
        <View
          key={approach.id}
          className={`bg-forge-surface border rounded-xl p-4 mb-3 ${approach.id === rec.recommended ? "border-forge-accent" : "border-forge-border"}`}
        >
          {approach.id === rec.recommended && (
            <Text className="text-forge-accent text-xs font-semibold mb-1">
              Recommended
            </Text>
          )}
          <Text className="text-forge-text font-semibold text-sm mb-1">
            {approach.name}
          </Text>
          <Text className="text-forge-muted text-xs mb-2">
            {approach.description}
          </Text>
          <View className="flex-row gap-3">
            <Text className="text-forge-muted text-xs">
              Effort: {approach.effort}
            </Text>
            <Text className="text-forge-muted text-xs">
              Impact: {approach.impact}
            </Text>
          </View>
        </View>
      ))}

      {rec.reasoning && (
        <View className="bg-forge-surface border border-forge-border rounded-xl p-4 mb-6">
          <Text className="text-forge-muted text-xs uppercase tracking-wider mb-2">
            Reasoning
          </Text>
          <Text className="text-forge-text text-sm">{rec.reasoning}</Text>
        </View>
      )}

      <View className="flex-row gap-3 mb-8">
        <Pressable
          className="flex-1 bg-forge-accent rounded-xl py-3 items-center"
          onPress={() => handleAction("approve")}
        >
          <Text className="text-white font-bold">Approve</Text>
        </Pressable>
        <Pressable
          className="flex-1 bg-forge-surface border border-forge-border rounded-xl py-3 items-center"
          onPress={() => handleAction("dismiss")}
        >
          <Text className="text-forge-muted font-bold">Dismiss</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
```

```tsx
// mobile/app/project/[slug].tsx
import { View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import { useForgeStore } from "@/lib/store";
import { api, type ProjectDetail } from "@/lib/api";

export default function ProjectDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const connection = useForgeStore((s) => s.connection);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);

  useEffect(() => {
    if (connection && slug) {
      api.project(connection, slug).then(setDetail);
    }
  }, [slug, connection]);

  if (!detail) {
    return (
      <View className="flex-1 bg-forge-bg justify-center items-center">
        <Text className="text-forge-muted">Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-forge-bg" contentContainerClassName="p-4 pt-8">
      <Pressable onPress={() => router.back()} className="mb-4">
        <Text className="text-forge-accent">Back</Text>
      </Pressable>

      <Text className="text-2xl font-bold text-forge-text mb-1">
        {detail.name}
      </Text>
      <Text className="text-forge-muted text-xs mb-6">{detail.slug}</Text>

      <Text className="text-forge-muted text-xs uppercase tracking-wider mb-3">
        Active Sessions
      </Text>
      {detail.sessions?.map((s) => (
        <Pressable
          key={s.scopeId}
          className="bg-forge-surface border border-forge-border rounded-xl p-3 mb-2 flex-row items-center gap-3"
          onPress={() => router.push(`/session/${s.scopeId}`)}
        >
          <View
            className={`w-2 h-2 rounded-full ${s.status === "waiting" ? "bg-forge-red" : s.status === "running" ? "bg-forge-accent" : "bg-forge-muted"}`}
          />
          <View className="flex-1">
            <Text className="text-forge-text text-sm font-semibold">
              {s.agent}
            </Text>
            <Text className="text-forge-muted text-xs">
              {s.taskDescription}
            </Text>
          </View>
          <Text
            className={`text-xs font-semibold ${s.status === "waiting" ? "text-forge-red" : "text-forge-muted"}`}
          >
            {s.status.toUpperCase()}
          </Text>
        </Pressable>
      ))}

      <Text className="text-forge-muted text-xs uppercase tracking-wider mb-3 mt-4">
        Features ({(detail.features as unknown[]).length})
      </Text>
      {(detail.features as any[]).slice(0, 10).map((f, i) => (
        <View key={i} className="flex-row items-center gap-2 py-1.5">
          <Text className="text-forge-accent text-xs">
            {f.status === "complete" ? "done" : f.status || "---"}
          </Text>
          <Text className="text-forge-text text-sm flex-1">
            {f.name || f.title || JSON.stringify(f).slice(0, 50)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add mobile/app/ mobile/components/
git commit -m "feat(mobile): add Recommendations tab, Projects tab, and detail screens"
```

---

## Task 14: CLI Tab + Session Tree

**Files:**
- Create: `mobile/app/(tabs)/cli.tsx`
- Create: `mobile/components/SessionTree.tsx`

- [ ] **Step 1: Create SessionTree component**

```tsx
// mobile/components/SessionTree.tsx
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import type { SessionInfo } from "@/lib/prompt-types";

interface Props {
  sessions: SessionInfo[];
}

function groupByProject(sessions: SessionInfo[]): Map<string, SessionInfo[]> {
  const groups = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    const list = groups.get(s.project) || [];
    list.push(s);
    groups.set(s.project, list);
  }
  return groups;
}

const STATUS_COLORS: Record<string, string> = {
  running: "#10b981",
  waiting: "#ef4444",
  idle: "#666666",
  complete: "#666666",
};

const STATUS_LABELS: Record<string, string> = {
  running: "RUNNING",
  waiting: "NEEDS INPUT",
  idle: "IDLE",
  complete: "COMPLETE",
};

export function SessionTree({ sessions }: Props) {
  const groups = groupByProject(sessions);

  if (sessions.length === 0) {
    return (
      <View className="items-center mt-12">
        <Text className="text-forge-muted text-sm">No active CLI sessions</Text>
        <Text className="text-forge-muted text-xs mt-1">
          Sessions will appear here when agents are running
        </Text>
      </View>
    );
  }

  return (
    <View>
      {Array.from(groups.entries()).map(([project, projectSessions]) => (
        <View key={project} className="mb-5">
          <View className="flex-row items-center gap-2 mb-2">
            <View className="w-1.5 h-1.5 rounded-full bg-forge-purple" />
            <Text className="text-forge-text font-semibold text-base">
              {project}
            </Text>
            <Text className="text-forge-muted text-xs">
              {projectSessions.length} session{projectSessions.length > 1 ? "s" : ""}
            </Text>
          </View>

          <View className="ml-3 border-l border-forge-border pl-3">
            {projectSessions.map((s) => {
              const color = STATUS_COLORS[s.status] || "#666";
              const isWaiting = s.status === "waiting";

              return (
                <Pressable
                  key={s.scopeId}
                  className={`rounded-xl p-3 mb-2 border ${isWaiting ? "bg-red-500/5 border-red-500/20" : "bg-forge-surface border-forge-border"}`}
                  onPress={() => router.push(`/session/${s.scopeId}`)}
                >
                  <View className="flex-row justify-between items-center">
                    <View className="flex-row items-center gap-2">
                      <View
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: color,
                          ...(isWaiting && {
                            shadowColor: color,
                            shadowOffset: { width: 0, height: 0 },
                            shadowOpacity: 0.5,
                            shadowRadius: 3,
                          }),
                        }}
                      />
                      <Text className="text-forge-text text-sm font-medium">
                        {s.agent}
                      </Text>
                    </View>
                    <Text
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        color,
                        backgroundColor: color + "1A",
                      }}
                    >
                      {STATUS_LABELS[s.status]}
                    </Text>
                  </View>
                  <Text className="text-forge-muted text-xs mt-1 ml-4">
                    {s.taskDescription}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Create CLI tab**

```tsx
// mobile/app/(tabs)/cli.tsx
import { Text, ScrollView, RefreshControl } from "react-native";
import { useState } from "react";
import { useForgeStore } from "@/lib/store";
import { SessionTree } from "@/components/SessionTree";

export default function CLIScreen() {
  const sessions = useForgeStore((s) => s.sessions);
  const fetchSessions = useForgeStore((s) => s.fetchSessions);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  };

  // Sort: waiting first, then running, then complete
  const sorted = [...sessions].sort((a, b) => {
    const order = { waiting: 0, running: 1, idle: 2, complete: 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  return (
    <ScrollView
      className="flex-1 bg-forge-bg"
      contentContainerClassName="p-4 pt-16"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
      }
    >
      <Text className="text-2xl font-bold text-forge-text mb-4">
        CLI Command Center
      </Text>
      <SessionTree sessions={sorted} />
    </ScrollView>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add mobile/app/ mobile/components/
git commit -m "feat(mobile): add CLI tab with session tree grouped by project"
```

---

## Task 15: Session Interaction View (Smart Buttons + Voice)

**Files:**
- Create: `mobile/app/session/[scopeId].tsx`
- Create: `mobile/components/SessionInteraction.tsx`
- Create: `mobile/components/PromptButtons.tsx`
- Create: `mobile/components/VoiceInput.tsx`

- [ ] **Step 1: Create PromptButtons component**

```tsx
// mobile/components/PromptButtons.tsx
import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import type { DetectedPrompt } from "@/lib/prompt-types";

interface Props {
  prompt: DetectedPrompt;
  onSend: (text: string) => void;
}

export function PromptButtons({ prompt, onSend }: Props) {
  const send = (text: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSend(text);
  };

  if (prompt.type === "binary") {
    return (
      <View className="flex-row gap-3 mb-3">
        <Pressable
          className="flex-1 bg-forge-accent py-4 rounded-xl items-center"
          style={{ shadowColor: "#10b981", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8 }}
          onPress={() => send("yes\n")}
        >
          <Text className="text-white text-lg font-bold">YES</Text>
        </Pressable>
        <Pressable
          className="flex-1 bg-forge-red py-4 rounded-xl items-center"
          style={{ shadowColor: "#ef4444", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8 }}
          onPress={() => send("no\n")}
        >
          <Text className="text-white text-lg font-bold">NO</Text>
        </Pressable>
      </View>
    );
  }

  if (prompt.type === "permission") {
    return (
      <View>
        <View className="flex-row gap-3 mb-2">
          <Pressable
            className="flex-1 bg-forge-accent py-4 rounded-xl items-center"
            onPress={() => send("y\n")}
          >
            <Text className="text-white text-lg font-bold">Allow</Text>
          </Pressable>
          <Pressable
            className="flex-1 bg-forge-red py-4 rounded-xl items-center"
            onPress={() => send("n\n")}
          >
            <Text className="text-white text-lg font-bold">Deny</Text>
          </Pressable>
        </View>
        <Pressable
          className="bg-forge-accent/20 border border-forge-accent/30 py-3 rounded-xl items-center mb-3"
          onPress={() => send("yes, and never ask again\n")}
        >
          <Text className="text-forge-accent font-semibold">
            Yes, never ask again
          </Text>
        </Pressable>
      </View>
    );
  }

  if (prompt.type === "numbered") {
    return (
      <View className="flex-row flex-wrap gap-2 mb-3">
        {prompt.options.map((opt) => (
          <Pressable
            key={opt}
            className="bg-amber-500/20 border border-amber-500/30 px-5 py-3 rounded-xl"
            onPress={() => send(`${opt}\n`)}
          >
            <Text className="text-forge-amber text-lg font-bold">{opt}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return null;
}
```

- [ ] **Step 2: Create VoiceInput component**

```tsx
// mobile/components/VoiceInput.tsx
import { useState, useEffect } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";

interface Props {
  onSend: (text: string) => void;
}

export function VoiceInput({ onSend }: Props) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);

  // Note: expo-speech is TTS only. For STT we use the native iOS
  // speech recognition via a simple approach: the TextInput with
  // dictation enabled (iOS shows mic button on keyboard automatically)

  const handleSend = () => {
    if (!text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(text.trim() + "\n");
    setText("");
  };

  return (
    <View className="border-t border-forge-border pt-3">
      <View className="flex-row gap-2 items-center">
        <TextInput
          className="flex-1 bg-forge-surface border border-forge-border rounded-2xl px-4 py-2.5 text-forge-text text-sm"
          placeholder="Type or tap mic to speak..."
          placeholderTextColor="#666"
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          autoCorrect={false}
          enablesReturnKeyAutomatically
        />
        <Pressable
          className="w-11 h-11 rounded-full bg-forge-purple items-center justify-center"
          style={{
            shadowColor: "#8b5cf6",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
          }}
          onPress={handleSend}
        >
          <Text className="text-white text-lg">
            {text.trim() ? ">" : "mic"}
          </Text>
        </Pressable>
      </View>
      <Text className="text-forge-muted text-xs mt-2 text-center">
        iOS keyboard mic button enables voice dictation
      </Text>
    </View>
  );
}
```

- [ ] **Step 3: Create session interaction screen**

```tsx
// mobile/app/session/[scopeId].tsx
import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useForgeStore } from "@/lib/store";
import { ForgeWebSocket } from "@/lib/ws";
import { PromptButtons } from "@/components/PromptButtons";
import { VoiceInput } from "@/components/VoiceInput";
import type { DetectedPrompt, SessionInfo } from "@/lib/prompt-types";

export default function SessionScreen() {
  const { scopeId } = useLocalSearchParams<{ scopeId: string }>();
  const connection = useForgeStore((s) => s.connection);
  const sessions = useForgeStore((s) => s.sessions);
  const session = sessions.find((s) => s.scopeId === scopeId);

  const [output, setOutput] = useState<string[]>(session?.lastOutput || []);
  const [prompt, setPrompt] = useState<DetectedPrompt | null>(
    session?.prompt || null,
  );
  const [status, setStatus] = useState(session?.status || "running");
  const wsRef = useRef<ForgeWebSocket | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!connection || !scopeId) return;

    const ws = new ForgeWebSocket(connection, `/ws/terminal/${scopeId}`);

    ws.on("terminal:data", (msg) => {
      const data = msg.data as string;
      setOutput((prev) => {
        const newLines = [...prev, ...data.split("\n")];
        return newLines.slice(-50); // Keep last 50 lines
      });
    });

    ws.on("terminal:exit", () => {
      setStatus("complete");
      setPrompt(null);
    });

    ws.connect();
    wsRef.current = ws;

    return () => {
      ws.disconnect();
    };
  }, [scopeId, connection]);

  // Update prompt from session registry updates
  useEffect(() => {
    if (session) {
      setPrompt(session.prompt);
      setStatus(session.status);
    }
  }, [session?.prompt, session?.status]);

  // Auto-scroll on new output
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [output.length]);

  const sendInput = (text: string) => {
    wsRef.current?.send({
      type: "mobile:terminal:input",
      scopeId,
      data: text,
    });
    setPrompt(null);
    setStatus("running");
  };

  const statusColor =
    status === "waiting"
      ? "#ef4444"
      : status === "running"
        ? "#10b981"
        : "#666";

  return (
    <View className="flex-1 bg-forge-bg">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-14 pb-3 border-b border-forge-border">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()}>
            <Text className="text-forge-accent text-lg">Back</Text>
          </Pressable>
          <View>
            <Text className="text-forge-text font-semibold">
              {session?.agent || "Terminal"}
            </Text>
            <Text className="text-forge-muted text-xs">
              {session?.project} · {session?.taskDescription}
            </Text>
          </View>
        </View>
        <View
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
      </View>

      {/* Terminal Output */}
      <ScrollView
        ref={scrollRef}
        className="flex-1 bg-black/30 px-4 py-3"
        contentContainerClassName="pb-4"
      >
        {output.map((line, i) => (
          <Text
            key={i}
            className="text-gray-400 text-xs"
            style={{ fontFamily: "monospace", lineHeight: 18 }}
          >
            {line}
          </Text>
        ))}

        {prompt && (
          <View className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-2">
            <Text className="text-forge-text text-sm font-medium">
              {prompt.promptText}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Input Area */}
      <View className="px-4 pb-8 pt-3 bg-forge-bg">
        {status === "waiting" && prompt && (
          <>
            <Text className="text-forge-red text-xs font-semibold uppercase tracking-wider mb-2">
              Quick Response
            </Text>
            <PromptButtons prompt={prompt} onSend={sendInput} />
          </>
        )}
        <VoiceInput onSend={sendInput} />
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd C:/Claude/Samurai/Forge
git add mobile/app/session/ mobile/components/PromptButtons.tsx mobile/components/VoiceInput.tsx mobile/components/SessionInteraction.tsx
git commit -m "feat(mobile): add session interaction view with smart prompt buttons and voice input"
```

---

## Task 16: Integration Test + Manual Verification

- [ ] **Step 1: Run all server-side tests**

```bash
cd C:/Claude/Samurai/Forge/friday
bun test tests/unit/mobile/
```

Expected: All tests pass across prompt-detector, session-registry, routes, alerts, terminal-bridge.

- [ ] **Step 2: Start Forge and verify Friday mobile module loads**

Start the Forge Electron app. Check Friday server logs for:
- `[Mobile] Module loaded`
- No startup errors

- [ ] **Step 3: Test mobile REST endpoints with curl**

```bash
# Test status endpoint (replace token)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3100/api/mobile/status

# Test overview
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3100/api/mobile/overview

# Test sessions
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3100/api/mobile/sessions

# Test projects
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3100/api/mobile/projects

# Test recommendations
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3100/api/mobile/recommendations
```

- [ ] **Step 4: Start Expo app**

```bash
cd C:/Claude/Samurai/Forge/mobile
npx expo start
```

Scan QR code with Expo Go on phone. Verify connect screen appears.

- [ ] **Step 5: Test connection flow**

Enter Tailscale IP + port and token on the connect screen. Verify:
- Connection test passes
- App transitions to tab view
- Overview shows activity and stats
- Recs tab shows recommendations
- Projects tab shows project list
- CLI tab shows any active sessions

- [ ] **Step 6: Commit final state**

```bash
cd C:/Claude/Samurai/Forge
git add -A
git commit -m "feat(mobile): Forge Mobile Companion v1 — complete implementation"
```

---

## Summary

| Task | Component | New Files | Tests |
|------|-----------|-----------|-------|
| 1 | Prompt Detector | 2 | 9 |
| 2 | Session Registry | 1 | 8 |
| 3 | REST Routes | 1 | 6 |
| 4 | Alerts | 1 | 3 |
| 5 | Terminal Bridge | 1 | 7 |
| 6 | Module Barrel + Server Integration | 1 + 2 mods | — |
| 7 | Electron IPC Bridge | 1 mod | manual |
| 8 | Expo Scaffold | ~8 config files | — |
| 9 | Connection + API Client | 3 | — |
| 10 | Store + WS + Notifications | 3 | — |
| 11 | Root Layout + Connect | 2 | — |
| 12 | Tab Layout + Overview | 5 | — |
| 13 | Recs + Projects Tabs | 6 | — |
| 14 | CLI Tab + Session Tree | 2 | — |
| 15 | Session Interaction | 4 | — |
| 16 | Integration Test | — | manual |
