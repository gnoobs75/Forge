# Friday Dual-Brain Architecture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable dual-brain system to Friday where Grok handles voice I/O and fast queries while Claude Code CLI handles complex cognitive tasks, plus Studio Tools for agent dispatch and HQ data interaction.

**Architecture:** BrainRouter decides per-message which brain handles it (Grok via existing Cortex or Claude Code CLI subprocess). Studio Tools module provides `dispatch_agent`, `query_studio`, and `update_studio` as FridayTools. Dashboard BrainTab gets new settings cards; TranscriptFeed gets brain badges.

**Tech Stack:** Bun (runtime), TypeScript (strict), AI SDK v6, `Bun.spawn()` for Claude CLI, React 18 + Tailwind CSS (dashboard), Zustand (state), `bun:test` (testing)

**Spec:** `docs/superpowers/specs/2026-03-15-friday-dual-brain-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `friday/src/core/brain-router.ts` | Create | Pure routing logic — analyzes message + context, returns brain decision |
| `friday/src/core/claude-brain.ts` | Create | Claude Code CLI subprocess wrapper — spawn, capture, timeout, error handling |
| `friday/src/modules/studio/index.ts` | Create | Studio FridayModule — registers 3 tools + onLoad |
| `friday/src/modules/studio/dispatch-agent.ts` | Create | `dispatch_agent` tool — async Claude Code subprocess with agent skill |
| `friday/src/modules/studio/query-studio.ts` | Create | `query_studio` tool — read HQ data with keyword filtering |
| `friday/src/modules/studio/update-studio.ts` | Create | `update_studio` tool — write recommendations, activity, features |
| `friday/src/modules/studio/types.ts` | Create | Shared types: DispatchRecord, agent/project registries |
| `friday/src/modules/studio/hq-utils.ts` | Create | Shared HQ data utilities: findHqDir, readJsonSafe, getProjectSlugs |
| `friday/src/core/cortex.ts` | Modify | Add `chatWithRouting()` method, brain metadata on ChatStream |
| `friday/src/core/stream-types.ts` | Modify | Add `brain` field to ChatStream |
| `friday/src/core/voice/session-manager.ts` | Modify | Route voice transcripts through BrainRouter, Claude→Grok TTS passthrough |
| `friday/src/core/runtime.ts` | Modify | Boot BrainRouter + ClaudeBrain, inject into Cortex |
| `friday/tests/unit/brain-router.test.ts` | Create | Unit tests for routing logic |
| `friday/tests/unit/claude-brain.test.ts` | Create | Unit tests with mock Bun.spawn |
| `friday/tests/unit/studio-dispatch.test.ts` | Create | Unit tests for dispatch_agent tool |
| `friday/tests/unit/studio-query.test.ts` | Create | Unit tests for query_studio tool |
| `friday/tests/unit/studio-update.test.ts` | Create | Unit tests for update_studio tool |
| `src/components/dashboard/friday/persona/BrainTab.jsx` | Modify | Add Brain Routing, Claude Brain, Agent Dispatch settings cards |
| `src/components/dashboard/friday/TranscriptFeed.jsx` | Modify | Brain badge on assistant messages |
| `docs/friday-architecture.html` | Modify | Add dual-brain + studio tools sections |

---

## Chunk 1: BrainRouter — Pure Routing Logic

### Task 1: BrainRouter — Core Routing

**Files:**
- Create: `friday/src/core/brain-router.ts`
- Test: `friday/tests/unit/brain-router.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// friday/tests/unit/brain-router.test.ts
import { describe, it, expect } from "bun:test";
import { BrainRouter, type BrainRouterConfig, type RouteContext } from "../../src/core/brain-router.ts";

const DEFAULTS: BrainRouterConfig = {
  mode: "auto",
  shortQueryThreshold: 20,
  claudeKeywords: [
    "analyze", "compare", "explain why", "review", "design",
    "plan", "evaluate", "summarize", "assess", "recommend",
    "critique", "break down", "deep dive", "what do you think",
    "walk me through",
  ],
  voiceClaudeEnabled: true,
};

const ctx = (overrides?: Partial<RouteContext>): RouteContext => ({
  isVoice: false,
  ...overrides,
});

describe("BrainRouter", () => {
  describe("forced prefix", () => {
    it("routes to claude when @claude prefix present", () => {
      const router = new BrainRouter(DEFAULTS);
      const result = router.route("@claude analyze this game", ctx());
      expect(result.brain).toBe("claude");
      expect(result.strippedMessage).toBe("analyze this game");
    });

    it("routes to grok when @grok prefix present", () => {
      const router = new BrainRouter(DEFAULTS);
      const result = router.route("@grok what time is it", ctx());
      expect(result.brain).toBe("grok");
      expect(result.strippedMessage).toBe("what time is it");
    });

    it("forced prefix overrides dashboard mode", () => {
      const router = new BrainRouter({ ...DEFAULTS, mode: "grok" });
      const result = router.route("@claude analyze this", ctx());
      expect(result.brain).toBe("claude");
    });

    it("forced prefix works in voice mode", () => {
      const router = new BrainRouter(DEFAULTS);
      const result = router.route("@claude analyze the expedition monetization strategy for me", ctx({ isVoice: true }));
      expect(result.brain).toBe("claude");
    });
  });

  describe("dashboard mode override", () => {
    it("forces grok when mode is grok", () => {
      const router = new BrainRouter({ ...DEFAULTS, mode: "grok" });
      const result = router.route("analyze the expedition monetization strategy deeply", ctx());
      expect(result.brain).toBe("grok");
    });

    it("forces claude when mode is claude", () => {
      const router = new BrainRouter({ ...DEFAULTS, mode: "claude" });
      const result = router.route("hi", ctx());
      expect(result.brain).toBe("claude");
    });
  });

  describe("voice mode + voiceClaudeEnabled", () => {
    it("routes to grok when voiceClaudeEnabled is false in voice mode", () => {
      const router = new BrainRouter({ ...DEFAULTS, voiceClaudeEnabled: false });
      const result = router.route("analyze the expedition monetization strategy in detail", ctx({ isVoice: true }));
      expect(result.brain).toBe("grok");
    });

    it("allows claude in voice mode when voiceClaudeEnabled is true", () => {
      const router = new BrainRouter(DEFAULTS);
      const result = router.route("analyze the expedition monetization strategy in detail", ctx({ isVoice: true }));
      expect(result.brain).toBe("claude");
    });
  });

  describe("keyword matching with length gate", () => {
    it("routes to claude when keyword present and word count >= 5", () => {
      const router = new BrainRouter(DEFAULTS);
      const result = router.route("analyze the expedition monetization strategy", ctx());
      expect(result.brain).toBe("claude");
    });

    it("does NOT route to claude when keyword present but word count < 5", () => {
      const router = new BrainRouter(DEFAULTS);
      const result = router.route("I plan to eat", ctx());
      expect(result.brain).toBe("grok");
    });

    it("matches multi-word keywords", () => {
      const router = new BrainRouter(DEFAULTS);
      const result = router.route("can you walk me through the codebase architecture", ctx());
      expect(result.brain).toBe("claude");
    });
  });

  describe("length check", () => {
    it("routes short queries to grok", () => {
      const router = new BrainRouter(DEFAULTS);
      const result = router.route("what time is it", ctx());
      expect(result.brain).toBe("grok");
    });
  });

  describe("follow-up continuity", () => {
    it("continues with previous brain on ambiguous short follow-up", () => {
      const router = new BrainRouter(DEFAULTS);
      const result = router.route("what about the other one", ctx({ previousBrain: "claude" }));
      expect(result.brain).toBe("claude");
    });

    it("continues with previous brain on long message with no keyword", () => {
      const router = new BrainRouter(DEFAULTS);
      const result = router.route("I was thinking we could also add some new levels to the game that have a different feel to them", ctx({ previousBrain: "claude" }));
      expect(result.brain).toBe("claude");
    });

    it("defaults to grok when no previousBrain", () => {
      const router = new BrainRouter(DEFAULTS);
      const result = router.route("what about the other one", ctx());
      expect(result.brain).toBe("grok");
    });

    it("keyword still overrides follow-up continuity", () => {
      const router = new BrainRouter(DEFAULTS);
      // previousBrain is grok, but keyword "analyze" triggers claude
      const result = router.route("analyze the expedition monetization strategy", ctx({ previousBrain: "grok" }));
      expect(result.brain).toBe("claude");
    });
  });

  describe("updateConfig", () => {
    it("merges partial config", () => {
      const router = new BrainRouter(DEFAULTS);
      router.updateConfig({ mode: "claude" });
      const result = router.route("hi", ctx());
      expect(result.brain).toBe("claude");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/brain-router.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement BrainRouter**

```typescript
// friday/src/core/brain-router.ts

export interface BrainRouterConfig {
  mode: "auto" | "grok" | "claude";
  shortQueryThreshold: number;
  claudeKeywords: string[];
  voiceClaudeEnabled: boolean;
}

export interface RouteContext {
  isVoice: boolean;
  forcedBrain?: "grok" | "claude";
  hasToolCalls?: boolean;
  previousBrain?: "grok" | "claude";
}

export interface BrainDecision {
  brain: "grok" | "claude";
  reason: string;
  strippedMessage: string;
}

export const BRAIN_ROUTER_DEFAULTS: BrainRouterConfig = {
  mode: "auto",
  shortQueryThreshold: 20,
  claudeKeywords: [
    "analyze", "compare", "explain why", "review", "design",
    "plan", "evaluate", "summarize", "assess", "recommend",
    "critique", "break down", "deep dive", "what do you think",
    "walk me through",
  ],
  voiceClaudeEnabled: true,
};

export class BrainRouter {
  private config: BrainRouterConfig;

  constructor(config: BrainRouterConfig) {
    this.config = { ...config };
  }

  route(message: string, context: RouteContext): BrainDecision {
    let stripped = message;

    // 1. Forced prefix — highest priority
    const prefixMatch = message.match(/^@(claude|grok)\s+/i);
    if (prefixMatch) {
      const brain = prefixMatch[1]!.toLowerCase() as "grok" | "claude";
      stripped = message.slice(prefixMatch[0].length);
      return { brain, reason: `Forced via @${brain} prefix`, strippedMessage: stripped };
    }

    // Also check context.forcedBrain (set by caller)
    if (context.forcedBrain) {
      return {
        brain: context.forcedBrain,
        reason: `Forced brain: ${context.forcedBrain}`,
        strippedMessage: stripped,
      };
    }

    // 2. Dashboard mode override
    if (this.config.mode !== "auto") {
      return {
        brain: this.config.mode,
        reason: `Dashboard mode: ${this.config.mode}`,
        strippedMessage: stripped,
      };
    }

    // 3. Voice mode + voiceClaudeEnabled=false
    if (context.isVoice && !this.config.voiceClaudeEnabled) {
      return { brain: "grok", reason: "Voice mode, Claude disabled", strippedMessage: stripped };
    }

    // 4. Keyword match (only if word count >= 5)
    const words = message.trim().split(/\s+/);
    const wordCount = words.length;
    if (wordCount >= 5) {
      const lower = message.toLowerCase();
      for (const keyword of this.config.claudeKeywords) {
        if (lower.includes(keyword)) {
          return {
            brain: "claude",
            reason: `Keyword match: "${keyword}"`,
            strippedMessage: stripped,
          };
        }
      }
    }

    // 5. Follow-up continuity — if no keyword matched, stay on same brain as last turn
    if (context.previousBrain) {
      return {
        brain: context.previousBrain,
        reason: `Follow-up continuity (previous: ${context.previousBrain})`,
        strippedMessage: stripped,
      };
    }

    // 6. Length check — short queries go to Grok
    if (wordCount < this.config.shortQueryThreshold) {
      return { brain: "grok", reason: "Short query", strippedMessage: stripped };
    }

    // 7. Default — Grok
    return { brain: "grok", reason: "Default (no keyword match)", strippedMessage: stripped };
  }

  updateConfig(partial: Partial<BrainRouterConfig>): void {
    Object.assign(this.config, partial);
  }

  getConfig(): Readonly<BrainRouterConfig> {
    return { ...this.config };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/brain-router.test.ts`
Expected: All 15 tests PASS

- [ ] **Step 5: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond/friday
git add src/core/brain-router.ts tests/unit/brain-router.test.ts
git commit -m "feat(friday): add BrainRouter — pure routing logic for dual-brain system"
```

---

## Chunk 2: ClaudeBrain — CLI Subprocess Wrapper

### Task 2: ClaudeBrain — Claude Code CLI Wrapper

**Files:**
- Create: `friday/src/core/claude-brain.ts`
- Test: `friday/tests/unit/claude-brain.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// friday/tests/unit/claude-brain.test.ts
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { ClaudeBrain, type ClaudeBrainConfig } from "../../src/core/claude-brain.ts";

const DEFAULTS: ClaudeBrainConfig = {
  timeout: 60,
  claudePath: "claude",
  maxOutputChars: 32000,
};

describe("ClaudeBrain", () => {
  describe("reason()", () => {
    it("returns response text and duration", async () => {
      const brain = new ClaudeBrain(DEFAULTS);
      // Mock Bun.spawn to return a successful process
      const originalSpawn = Bun.spawn;
      const mockProc = {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("Analysis result here"));
            controller.close();
          },
        }),
        stderr: new ReadableStream({ start(c) { c.close(); } }),
        exited: Promise.resolve(0),
        kill: () => {},
        pid: 12345,
      };
      // @ts-expect-error — mock override
      Bun.spawn = () => mockProc;

      const result = await brain.reason("analyze this", "<system>test</system>");

      expect(result.text).toBe("Analysis result here");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.truncated).toBe(false);

      Bun.spawn = originalSpawn;
    });

    it("truncates output exceeding maxOutputChars", async () => {
      const brain = new ClaudeBrain({ ...DEFAULTS, maxOutputChars: 10 });
      const originalSpawn = Bun.spawn;
      const mockProc = {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("A very long response that exceeds the limit"));
            controller.close();
          },
        }),
        stderr: new ReadableStream({ start(c) { c.close(); } }),
        exited: Promise.resolve(0),
        kill: () => {},
        pid: 12345,
      };
      // @ts-expect-error — mock override
      Bun.spawn = () => mockProc;

      const result = await brain.reason("test", "");
      expect(result.text.length).toBeLessThanOrEqual(10);
      expect(result.truncated).toBe(true);

      Bun.spawn = originalSpawn;
    });

    it("handles non-zero exit code", async () => {
      const brain = new ClaudeBrain(DEFAULTS);
      const originalSpawn = Bun.spawn;
      const mockProc = {
        stdout: new ReadableStream({ start(c) { c.close(); } }),
        stderr: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("Error: something failed"));
            controller.close();
          },
        }),
        exited: Promise.resolve(1),
        kill: () => {},
        pid: 12345,
      };
      // @ts-expect-error — mock override
      Bun.spawn = () => mockProc;

      const result = await brain.reason("test", "");
      expect(result.text).toContain("Error");

      Bun.spawn = originalSpawn;
    });
  });

    it("returns timeout message when process exceeds timeout", async () => {
      const brain = new ClaudeBrain({ ...DEFAULTS, timeout: 1 }); // 1 second timeout
      const originalSpawn = Bun.spawn;
      const mockProc = {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("Partial output"));
            // Never close — simulates hanging process
          },
        }),
        stderr: new ReadableStream({ start(c) { c.close(); } }),
        exited: new Promise(() => {}), // Never resolves
        kill: () => {},
        pid: 12345,
      };
      // @ts-expect-error — mock override
      Bun.spawn = () => mockProc;

      const result = await brain.reason("test", "");
      expect(result.truncated).toBe(true);
      expect(result.text).toContain("timeout");

      Bun.spawn = originalSpawn;
    });

    it("retries once on empty response then returns fallback", async () => {
      const brain = new ClaudeBrain(DEFAULTS);
      const originalSpawn = Bun.spawn;
      let callCount = 0;
      // @ts-expect-error — mock override
      Bun.spawn = () => {
        callCount++;
        return {
          stdout: new ReadableStream({ start(c) { c.close(); } }), // empty
          stderr: new ReadableStream({ start(c) { c.close(); } }),
          exited: Promise.resolve(0),
          kill: () => {},
          pid: 12345,
        };
      };

      const result = await brain.reason("test", "");
      expect(callCount).toBe(2); // Initial + 1 retry
      expect(result.text).toContain("empty");

      Bun.spawn = originalSpawn;
    });
  });

  describe("isAvailable()", () => {
    it("returns true when claude CLI responds", async () => {
      const brain = new ClaudeBrain(DEFAULTS);
      const originalSpawn = Bun.spawn;
      const mockProc = {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("1.0.0"));
            controller.close();
          },
        }),
        stderr: new ReadableStream({ start(c) { c.close(); } }),
        exited: Promise.resolve(0),
        kill: () => {},
        pid: 12345,
      };
      // @ts-expect-error — mock override
      Bun.spawn = () => mockProc;

      const available = await brain.isAvailable();
      expect(available).toBe(true);

      Bun.spawn = originalSpawn;
    });
  });

  describe("buildPrompt()", () => {
    it("prepends system context to user message", () => {
      const brain = new ClaudeBrain(DEFAULTS);
      const prompt = brain.buildPrompt("what is 2+2", "<system>\nYou are Friday\n</system>");
      expect(prompt).toContain("<system>");
      expect(prompt).toContain("You are Friday");
      expect(prompt).toContain("what is 2+2");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/claude-brain.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ClaudeBrain**

```typescript
// friday/src/core/claude-brain.ts

export interface ClaudeBrainConfig {
  timeout: number;        // seconds
  claudePath: string;
  maxOutputChars: number;
}

export interface ClaudeResponse {
  text: string;
  durationMs: number;
  truncated: boolean;
}

export const CLAUDE_BRAIN_DEFAULTS: ClaudeBrainConfig = {
  timeout: 60,
  claudePath: "claude",
  maxOutputChars: 32000,
};

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export class ClaudeBrain {
  private config: ClaudeBrainConfig;
  private _available: boolean | null = null;

  constructor(config: ClaudeBrainConfig) {
    this.config = { ...config };
  }

  buildPrompt(userMessage: string, systemContext: string): string {
    if (!systemContext) return userMessage;
    return `${systemContext}\n\n${userMessage}`;
  }

  async reason(
    prompt: string,
    systemContext: string,
    options?: { isVoice?: boolean; isRetry?: boolean },
  ): Promise<ClaudeResponse> {
    const start = Date.now();
    const fullPrompt = this.buildPrompt(prompt, systemContext);

    const maxChars = options?.isVoice
      ? Math.min(this.config.maxOutputChars, 2000)
      : this.config.maxOutputChars;

    const proc = Bun.spawn([this.config.claudePath, "-p", fullPrompt], {
      stdout: "pipe",
      stderr: "pipe",
    });

    // Timeout via race
    const timeoutMs = this.config.timeout * 1000;
    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), timeoutMs),
    );

    const exitPromise = proc.exited.then((code) => ({ code }));
    const race = await Promise.race([exitPromise, timeoutPromise]);

    if (race === "timeout") {
      proc.kill();
      const partialStdout = await readStream(proc.stdout as ReadableStream<Uint8Array>);
      const text = partialStdout.slice(0, maxChars);
      return {
        text: text ? `${text}\n\n(response truncated due to timeout)` : "(Claude timed out with no output)",
        durationMs: Date.now() - start,
        truncated: true,
      };
    }

    const { code } = race as { code: number };
    const stdout = await readStream(proc.stdout as ReadableStream<Uint8Array>);
    const stderr = await readStream(proc.stderr as ReadableStream<Uint8Array>);

    if (code !== 0) {
      return {
        text: stderr || `Claude exited with code ${code}`,
        durationMs: Date.now() - start,
        truncated: false,
      };
    }

    // Empty response → retry once
    if (!stdout.trim()) {
      if (!options?.isRetry) {
        return this.reason(prompt, systemContext, { ...options, isRetry: true });
      }
      return {
        text: "(Claude returned empty response after retry)",
        durationMs: Date.now() - start,
        truncated: false,
      };
    }

    const truncated = stdout.length > maxChars;
    return {
      text: truncated ? stdout.slice(0, maxChars) : stdout,
      durationMs: Date.now() - start,
      truncated,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (this._available !== null) return this._available;
    try {
      const proc = Bun.spawn([this.config.claudePath, "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const code = await proc.exited;
      this._available = code === 0;
    } catch {
      this._available = false;
    }
    return this._available;
  }

  updateConfig(partial: Partial<ClaudeBrainConfig>): void {
    Object.assign(this.config, partial);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/claude-brain.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond/friday
git add src/core/claude-brain.ts tests/unit/claude-brain.test.ts
git commit -m "feat(friday): add ClaudeBrain — Claude Code CLI subprocess wrapper"
```

---

## Chunk 3: Studio Tools Module — Types & query_studio

### Task 3: Studio Module Types

**Files:**
- Create: `friday/src/modules/studio/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// friday/src/modules/studio/types.ts

export interface DispatchRecord {
  id: string;
  agent: string;
  agentSlug: string;
  project: string;
  prompt: string;
  startedAt: Date;
  status: "running" | "completed" | "failed" | "timeout" | "cancelled";
  output?: string;
  error?: string;
}

export interface AgentInfo {
  slug: string;
  name: string;
  color: string;
  skillFile: string;
}

export interface ProjectInfo {
  slug: string;
  name: string;
}

// Registry of known agents — slugs must match council-of-elrond/agents/*.md filenames
export const AGENT_REGISTRY: AgentInfo[] = [
  { slug: "market-analyst", name: "Market Analyst", color: "#3B82F6", skillFile: "market-analyst.md" },
  { slug: "store-optimizer", name: "Store Optimizer", color: "#22C55E", skillFile: "store-optimizer.md" },
  { slug: "growth-strategist", name: "Growth Strategist", color: "#F97316", skillFile: "growth-strategist.md" },
  { slug: "brand-director", name: "Brand Director", color: "#8B5CF6", skillFile: "brand-director.md" },
  { slug: "content-producer", name: "Content Producer", color: "#EC4899", skillFile: "content-producer.md" },
  { slug: "community-manager", name: "Community Manager", color: "#06B6D4", skillFile: "community-manager.md" },
  { slug: "qa-advisor", name: "QA Advisor", color: "#EF4444", skillFile: "qa-advisor.md" },
  { slug: "studio-producer", name: "Studio Producer", color: "#EAB308", skillFile: "studio-producer.md" },
  { slug: "monetization", name: "Monetization Strategist", color: "#10B981", skillFile: "monetization-strategist.md" },
  { slug: "player-psych", name: "Player Psychologist", color: "#7C3AED", skillFile: "player-psychologist.md" },
  { slug: "art-director", name: "Art Director", color: "#F59E0B", skillFile: "art-director.md" },
  { slug: "creative-thinker", name: "Creative Thinker", color: "#FF6B6B", skillFile: "creative-thinker.md" },
  { slug: "tech-architect", name: "Tech Architect", color: "#0EA5E9", skillFile: "tech-architect.md" },
  { slug: "hr-director", name: "HR Director", color: "#D4A574", skillFile: "hr-director.md" },
];

export const PROJECT_REGISTRY: ProjectInfo[] = [
  { slug: "expedition", name: "Expedition" },
  { slug: "ttr-ios", name: "TTR iOS" },
  { slug: "ttr-roblox", name: "TTR Roblox" },
];

export function findAgent(slug: string): AgentInfo | undefined {
  return AGENT_REGISTRY.find((a) => a.slug === slug);
}

export function findProject(slug: string): ProjectInfo | undefined {
  return PROJECT_REGISTRY.find((p) => p.slug === slug);
}

export function listAgentSlugs(): string[] {
  return AGENT_REGISTRY.map((a) => a.slug);
}

export function listProjectSlugs(): string[] {
  return PROJECT_REGISTRY.map((p) => p.slug);
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond/friday
git add src/modules/studio/types.ts
git commit -m "feat(friday): add studio module types — agent registry, dispatch record"
```

### Task 4: query_studio Tool

**Files:**
- Create: `friday/src/modules/studio/query-studio.ts`
- Test: `friday/tests/unit/studio-query.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// friday/tests/unit/studio-query.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { queryStudioExecute } from "../../src/modules/studio/query-studio.ts";

// We test the execute function directly, passing mock args
// The tool itself is a FridayTool wrapper

describe("query_studio", () => {
  describe("recommendations query", () => {
    it("returns formatted recommendations matching keyword", async () => {
      const result = await queryStudioExecute({
        query: "monetization",
        type: "recommendations",
        scope: "expedition",
        limit: 5,
      });
      expect(result.success).toBe(true);
      expect(typeof result.output).toBe("string");
    });

    it("returns empty message when no matches found", async () => {
      const result = await queryStudioExecute({
        query: "xyznonexistent123",
        type: "recommendations",
        scope: "all",
        limit: 5,
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("No");
    });
  });

  describe("features query", () => {
    it("returns features for a project", async () => {
      const result = await queryStudioExecute({
        query: "",
        type: "features",
        scope: "expedition",
        limit: 10,
      });
      expect(result.success).toBe(true);
      expect(typeof result.output).toBe("string");
    });
  });

  describe("activity query", () => {
    it("returns recent activity entries", async () => {
      const result = await queryStudioExecute({
        query: "",
        type: "activity",
        scope: "all",
        limit: 5,
      });
      expect(result.success).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/studio-query.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement query_studio**

First, create the shared HQ utilities file:

```typescript
// friday/src/modules/studio/hq-utils.ts

import * as fs from "node:fs";
import * as path from "node:path";

const HQ_DATA_CANDIDATES = [
  process.env.COE_HQ_DATA_DIR,
  path.resolve("../../hq-data"),
  path.resolve("../hq-data"),
  "C:/Claude/Agency/hq-data",
].filter(Boolean) as string[];

export function findHqDir(): string | null {
  for (const candidate of HQ_DATA_CANDIDATES) {
    try {
      if (fs.existsSync(path.join(candidate, "projects"))) return candidate;
    } catch {}
  }
  return null;
}

export function readJsonSafe(filePath: string): any {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch { return null; }
}

export function matchesQuery(text: string, query: string): boolean {
  if (!query) return true;
  return text.toLowerCase().includes(query.toLowerCase());
}

export function getProjectSlugs(hqDir: string): string[] {
  const projectsDir = path.join(hqDir, "projects");
  try {
    return fs.readdirSync(projectsDir)
      .filter((d) => {
        try { return fs.statSync(path.join(projectsDir, d)).isDirectory(); }
        catch { return false; }
      })
      .filter((d) => d !== "council-of-elrond");
  } catch { return []; }
}
```

Then the query_studio tool imports from hq-utils:

```typescript
// friday/src/modules/studio/query-studio.ts

import * as fs from "node:fs";
import * as path from "node:path";
import type { FridayTool, ToolResult } from "../types.ts";
import { findHqDir, readJsonSafe, matchesQuery, getProjectSlugs } from "./hq-utils.ts";

function queryRecommendations(hqDir: string, query: string, scope: string, limit: number): string {
  const slugs = scope === "all" ? getProjectSlugs(hqDir) : [scope];
  const results: string[] = [];

  for (const slug of slugs) {
    const recsDir = path.join(hqDir, "projects", slug, "recommendations");
    try {
      const files = fs.readdirSync(recsDir)
        .filter((f) => f.endsWith(".json"))
        .sort().reverse();

      for (const file of files) {
        if (results.length >= limit) break;
        const rec = readJsonSafe(path.join(recsDir, file));
        if (!rec) continue;
        const searchText = `${rec.title || ""} ${rec.agent || ""} ${rec.summary || ""}`;
        if (matchesQuery(searchText, query)) {
          results.push(`- [${file.slice(0, 10)}] **${rec.agent}**: ${rec.title} — ${rec.summary || ""} (${rec.status || "active"}) [${slug}]`);
        }
      }
    } catch {}
  }

  if (results.length === 0) return `No recommendations found matching "${query}".`;
  return `**Recommendations** (${results.length} results):\n${results.join("\n")}`;
}

function queryFeatures(hqDir: string, query: string, scope: string, limit: number): string {
  const slugs = scope === "all" ? getProjectSlugs(hqDir) : [scope];
  const results: string[] = [];

  for (const slug of slugs) {
    const features = readJsonSafe(path.join(hqDir, "projects", slug, "features.json"));
    if (!Array.isArray(features)) continue;
    for (const f of features) {
      if (results.length >= limit) break;
      const searchText = `${f.name || ""} ${f.description || ""} ${f.status || ""}`;
      if (matchesQuery(searchText, query)) {
        results.push(`- **${f.name}**: ${f.description || ""} — ${f.status || "unknown"} [${slug}]`);
      }
    }
  }

  if (results.length === 0) return `No features found matching "${query}".`;
  return `**Features** (${results.length} results):\n${results.join("\n")}`;
}

function queryActivity(hqDir: string, query: string, limit: number): string {
  const log = readJsonSafe(path.join(hqDir, "activity-log.json"));
  if (!Array.isArray(log)) return "No activity log found.";

  const filtered = [...log].reverse().filter((e: any) => {
    const searchText = `${e.agent || ""} ${e.action || ""} ${e.project || ""}`;
    return matchesQuery(searchText, query);
  }).slice(0, limit);

  if (filtered.length === 0) return `No activity found matching "${query}".`;
  return `**Recent Activity** (${filtered.length} entries):\n${filtered.map((e: any) => `- [${e.timestamp?.slice(0, 10) || "?"}] ${e.agent}: ${e.action} (${e.project || "studio"})`).join("\n")}`;
}

function queryProgress(hqDir: string, scope: string): string {
  const slugs = scope === "all" ? getProjectSlugs(hqDir) : [scope];
  const parts: string[] = [];

  for (const slug of slugs) {
    const progress = readJsonSafe(path.join(hqDir, "projects", slug, "progress.json"));
    if (!progress) continue;
    parts.push(`**${slug}** — ${progress.overall || 0}% overall (${progress.phase || "unknown"})`);
    if (progress.categories) {
      const cats = Object.entries(progress.categories)
        .map(([k, v]: [string, any]) => `${k}: ${v?.score ?? v?.progress ?? 0}%`)
        .join(", ");
      parts.push(`  Scores: ${cats}`);
    }
    if (progress.blockers?.length > 0) {
      const active = progress.blockers.filter((b: any) => !b.resolved);
      if (active.length > 0) {
        parts.push(`  Blockers: ${active.map((b: any) => b.name || b.description).join("; ")}`);
      }
    }
  }

  if (parts.length === 0) return "No progress data found.";
  return parts.join("\n");
}

export async function queryStudioExecute(args: {
  query: string;
  type?: string;
  scope?: string;
  limit?: number;
}): Promise<ToolResult> {
  const hqDir = findHqDir();
  if (!hqDir) {
    return { success: false, output: "", error: "HQ data directory not found" };
  }

  const query = args.query || "";
  const type = args.type || "all";
  const scope = args.scope || "all";
  const limit = args.limit || 10;

  const parts: string[] = [];

  if (type === "recommendations" || type === "all") {
    parts.push(queryRecommendations(hqDir, query, scope, limit));
  }
  if (type === "features" || type === "all") {
    parts.push(queryFeatures(hqDir, query, scope, limit));
  }
  if (type === "activity" || type === "all") {
    parts.push(queryActivity(hqDir, query, limit));
  }
  if (type === "progress" || type === "all") {
    parts.push(queryProgress(hqDir, scope));
  }

  return { success: true, output: parts.join("\n\n") };
}

export const queryStudio: FridayTool = {
  name: "studio.query",
  description: "Query the Council of Elrond studio data — recommendations, features, progress, and activity log. Returns formatted text summaries.",
  parameters: [
    { name: "query", type: "string", description: "Keyword search string — matched against titles, agents, summaries", required: true },
    { name: "type", type: "string", description: "Data type: recommendations | features | progress | activity | all", required: false, default: "all" },
    { name: "scope", type: "string", description: "Project slug to filter by, or 'all' for all projects", required: false, default: "all" },
    { name: "limit", type: "number", description: "Maximum results to return", required: false, default: 10 },
  ],
  clearance: ["read-fs"],
  async execute(args, _context) {
    return queryStudioExecute(args as any);
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/studio-query.test.ts`
Expected: All tests PASS (tests run against real HQ data on disk)

- [ ] **Step 5: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond/friday
git add src/modules/studio/query-studio.ts tests/unit/studio-query.test.ts
git commit -m "feat(friday): add query_studio tool — keyword search across HQ data"
```

### Task 5: update_studio Tool

**Files:**
- Create: `friday/src/modules/studio/update-studio.ts`
- Test: `friday/tests/unit/studio-update.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// friday/tests/unit/studio-update.test.ts
import { describe, it, expect, afterEach } from "bun:test";
import { validateRecommendation, validateActivity, validateFeatureUpdate } from "../../src/modules/studio/update-studio.ts";

describe("update_studio validation", () => {
  describe("validateRecommendation", () => {
    it("accepts valid recommendation data", () => {
      const result = validateRecommendation({
        agent: "QA Advisor",
        agentColor: "#EF4444",
        title: "Launch Readiness Check",
        summary: "Run a full readiness check",
        approaches: [{ id: 1, name: "Full scan", description: "Scan everything", trade_offs: "Slow", effort: "high", impact: "high" }],
        recommended: 1,
        reasoning: "Because quality matters",
        status: "active",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects when title is missing", () => {
      const result = validateRecommendation({
        agent: "QA Advisor",
        agentColor: "#EF4444",
        summary: "test",
        approaches: [],
        recommended: 1,
        reasoning: "test",
        status: "active",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("title");
    });

    it("rejects when approaches is not an array", () => {
      const result = validateRecommendation({
        agent: "QA Advisor",
        agentColor: "#EF4444",
        title: "Test",
        summary: "test",
        approaches: "not an array",
        recommended: 1,
        reasoning: "test",
        status: "active",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("approaches");
    });
  });

  describe("validateActivity", () => {
    it("accepts valid activity data", () => {
      const result = validateActivity({
        agent: "QA Advisor",
        agentColor: "#EF4444",
        action: "Reviewed launch readiness",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects when agent is missing", () => {
      const result = validateActivity({ action: "test" });
      expect(result.valid).toBe(false);
    });
  });

  describe("validateFeatureUpdate", () => {
    it("accepts valid feature update", () => {
      const result = validateFeatureUpdate({
        featureId: "crafting-system",
        updates: { status: "complete" },
      });
      expect(result.valid).toBe(true);
    });

    it("rejects when featureId is missing", () => {
      const result = validateFeatureUpdate({ updates: { status: "complete" } });
      expect(result.valid).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/studio-update.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement update_studio**

```typescript
// friday/src/modules/studio/update-studio.ts

import * as fs from "node:fs";
import * as path from "node:path";
import type { FridayTool, ToolResult } from "../types.ts";
import { findHqDir, readJsonSafe } from "./hq-utils.ts";

interface ValidationResult {
  valid: boolean;
  error?: string;
}

const REQUIRED_REC_FIELDS = ["agent", "agentColor", "title", "summary", "approaches", "recommended", "reasoning", "status"];

export function validateRecommendation(data: any): ValidationResult {
  for (const field of REQUIRED_REC_FIELDS) {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }
  if (!Array.isArray(data.approaches)) {
    return { valid: false, error: "approaches must be an array" };
  }
  return { valid: true };
}

export function validateActivity(data: any): ValidationResult {
  for (const field of ["agent", "agentColor", "action"]) {
    if (!data[field]) return { valid: false, error: `Missing required field: ${field}` };
  }
  return { valid: true };
}

export function validateFeatureUpdate(data: any): ValidationResult {
  if (!data.featureId) return { valid: false, error: "Missing required field: featureId" };
  if (!data.updates || typeof data.updates !== "object") return { valid: false, error: "Missing required field: updates" };
  return { valid: true };
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

async function createRecommendation(hqDir: string, project: string, data: any): Promise<ToolResult> {
  const validation = validateRecommendation(data);
  if (!validation.valid) {
    return { success: false, output: "", error: validation.error };
  }

  const now = new Date().toISOString();
  const datePrefix = now.slice(0, 10);
  const agentSlug = slugify(data.agent);
  const titleSlug = slugify(data.title);
  const filename = `${datePrefix}-${agentSlug}-${titleSlug}.json`;

  const rec = {
    ...data,
    project,
    timestamp: now,
    type: "recommendation",
  };

  const recsDir = path.join(hqDir, "projects", project, "recommendations");
  fs.mkdirSync(recsDir, { recursive: true });
  fs.writeFileSync(path.join(recsDir, filename), JSON.stringify(rec, null, 2));

  return { success: true, output: `Recommendation created: ${filename}` };
}

async function logActivity(hqDir: string, project: string, data: any): Promise<ToolResult> {
  const validation = validateActivity(data);
  if (!validation.valid) {
    return { success: false, output: "", error: validation.error };
  }

  const logPath = path.join(hqDir, "activity-log.json");
  const log = readJsonSafe(logPath) || [];
  const nextId = log.length > 0 ? Math.max(...log.map((e: any) => e.id || 0)) + 1 : 1;

  log.push({
    id: nextId,
    agent: data.agent,
    agentColor: data.agentColor,
    action: data.action,
    project,
    timestamp: new Date().toISOString(),
  });

  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  return { success: true, output: `Activity logged: ${data.action}` };
}

async function updateFeature(hqDir: string, project: string, data: any): Promise<ToolResult> {
  const validation = validateFeatureUpdate(data);
  if (!validation.valid) {
    return { success: false, output: "", error: validation.error };
  }

  const featuresPath = path.join(hqDir, "projects", project, "features.json");
  const features = readJsonSafe(featuresPath);
  if (!Array.isArray(features)) {
    return { success: false, output: "", error: `features.json not found for project ${project}` };
  }

  const feature = features.find((f: any) => f.id === data.featureId || f.name === data.featureId);
  if (!feature) {
    return { success: false, output: "", error: `Feature not found: ${data.featureId}` };
  }

  Object.assign(feature, data.updates);
  fs.writeFileSync(featuresPath, JSON.stringify(features, null, 2));
  return { success: true, output: `Feature updated: ${data.featureId}` };
}

export const updateStudio: FridayTool = {
  name: "studio.update",
  description: "Write to Council of Elrond studio data — create recommendations, log activity, or update features.",
  parameters: [
    { name: "action", type: "string", description: "Action: create-recommendation | log-activity | update-feature", required: true },
    { name: "project", type: "string", description: "Project slug: expedition, ttr-ios, ttr-roblox", required: true },
    { name: "data", type: "object", description: "Action-specific payload (see spec for schemas)", required: true },
  ],
  clearance: ["write-fs"],
  async execute(args, _context) {
    const hqDir = findHqDir();
    if (!hqDir) return { success: false, output: "", error: "HQ data directory not found" };

    const action = args.action as string;
    const project = args.project as string;
    const data = args.data as Record<string, any>;

    switch (action) {
      case "create-recommendation": return createRecommendation(hqDir, project, data);
      case "log-activity": return logActivity(hqDir, project, data);
      case "update-feature": return updateFeature(hqDir, project, data);
      default: return { success: false, output: "", error: `Unknown action: ${action}` };
    }
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/studio-update.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond/friday
git add src/modules/studio/update-studio.ts tests/unit/studio-update.test.ts
git commit -m "feat(friday): add update_studio tool — write recommendations, activity, features"
```

---

## Chunk 4: dispatch_agent Tool

### Task 6: dispatch_agent Tool

**Files:**
- Create: `friday/src/modules/studio/dispatch-agent.ts`
- Test: `friday/tests/unit/studio-dispatch.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// friday/tests/unit/studio-dispatch.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DispatchManager } from "../../src/modules/studio/dispatch-agent.ts";
import { AGENT_REGISTRY } from "../../src/modules/studio/types.ts";

describe("DispatchManager", () => {
  let manager: DispatchManager;

  beforeEach(() => {
    manager = new DispatchManager({
      maxConcurrent: 3,
      dispatchTimeout: 5, // 5 seconds for tests
      agentsDir: "C:/Claude/Agency/council-of-elrond/agents",
      projectRoot: "C:/Claude/Agency",
    });
  });

  afterEach(() => {
    manager.cancelAll();
  });

  describe("validation", () => {
    it("rejects unknown agent slug", () => {
      const result = manager.validate("fake-agent", "expedition");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unknown agent");
      expect(result.error).toContain("Available:");
    });

    it("accepts valid agent slug", () => {
      const result = manager.validate("qa-advisor", "expedition");
      expect(result.valid).toBe(true);
    });
  });

  describe("concurrency", () => {
    it("tracks active dispatch count", () => {
      expect(manager.activeCount).toBe(0);
    });

    it("returns queue position when at max concurrent", async () => {
      // Fill up slots with mock dispatches
      manager._testAddMockDispatch("d1");
      manager._testAddMockDispatch("d2");
      manager._testAddMockDispatch("d3");

      expect(manager.activeCount).toBe(3);
      expect(manager.canDispatch()).toBe(false);
    });
  });

  describe("cancel", () => {
    it("cancels a running dispatch", () => {
      manager._testAddMockDispatch("d1");
      const cancelled = manager.cancel("d1");
      expect(cancelled).toBe(true);
      expect(manager.activeCount).toBe(0);
    });

    it("returns false for unknown dispatch id", () => {
      const cancelled = manager.cancel("nonexistent");
      expect(cancelled).toBe(false);
    });
  });

  describe("getActiveDispatches", () => {
    it("returns list of running dispatches", () => {
      manager._testAddMockDispatch("d1");
      const active = manager.getActiveDispatches();
      expect(active.length).toBe(1);
      expect(active[0]!.id).toBe("d1");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/studio-dispatch.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement dispatch_agent**

```typescript
// friday/src/modules/studio/dispatch-agent.ts

import * as fs from "node:fs";
import * as path from "node:path";
import type { FridayTool, ToolResult } from "../types.ts";
import { type DispatchRecord, type AgentInfo, findAgent, findProject, listAgentSlugs, listProjectSlugs, AGENT_REGISTRY } from "./types.ts";

export interface DispatchConfig {
  maxConcurrent: number;
  dispatchTimeout: number; // seconds
  agentsDir: string;       // path to council-of-elrond/agents/
  projectRoot: string;     // CWD for subprocess (C:/Claude/Agency)
}

export const DISPATCH_DEFAULTS: DispatchConfig = {
  maxConcurrent: 3,
  dispatchTimeout: 120,
  agentsDir: "C:/Claude/Agency/council-of-elrond/agents",
  projectRoot: "C:/Claude/Agency",
};

export class DispatchManager {
  private dispatches = new Map<string, DispatchRecord & { process?: any }>();
  private config: DispatchConfig;
  private onComplete?: (record: DispatchRecord) => void;

  constructor(config: DispatchConfig) {
    this.config = { ...config };
  }

  setOnComplete(handler: (record: DispatchRecord) => void): void {
    this.onComplete = handler;
  }

  get activeCount(): number {
    let count = 0;
    for (const d of this.dispatches.values()) {
      if (d.status === "running") count++;
    }
    return count;
  }

  canDispatch(): boolean {
    return this.activeCount < this.config.maxConcurrent;
  }

  validate(agentSlug: string, projectSlug: string): { valid: boolean; error?: string; agent?: AgentInfo } {
    const agent = findAgent(agentSlug);
    if (!agent) {
      return {
        valid: false,
        error: `Unknown agent "${agentSlug}". Available: ${listAgentSlugs().join(", ")}`,
      };
    }
    const project = findProject(projectSlug);
    if (!project) {
      return {
        valid: false,
        error: `Unknown project "${projectSlug}". Available: ${listProjectSlugs().join(", ")}`,
      };
    }
    return { valid: true, agent };
  }

  async dispatch(
    agentSlug: string,
    projectSlug: string,
    prompt: string,
    priority: "normal" | "urgent" = "normal",
  ): Promise<ToolResult> {
    const validation = this.validate(agentSlug, projectSlug);
    if (!validation.valid) {
      return { success: false, output: "", error: validation.error };
    }

    if (!this.canDispatch()) {
      return {
        success: false,
        output: "",
        error: `Max concurrent dispatches (${this.config.maxConcurrent}) reached. ${this.activeCount} agents running. Try again when one completes.`,
      };
    }

    const agent = validation.agent!;
    const id = crypto.randomUUID();

    // Read agent skill file
    const skillPath = path.join(this.config.agentsDir, agent.skillFile);
    let skillContent: string;
    try {
      skillContent = fs.readFileSync(skillPath, "utf-8");
    } catch {
      return { success: false, output: "", error: `Agent skill file not found: ${skillPath}` };
    }

    const fullPrompt = `For project ${projectSlug}: ${prompt}`;

    const record: DispatchRecord = {
      id,
      agent: agent.name,
      agentSlug,
      project: projectSlug,
      prompt,
      startedAt: new Date(),
      status: "running",
    };

    try {
      const proc = Bun.spawn(["claude", "-p", "--system-prompt", skillContent, fullPrompt], {
        cwd: this.config.projectRoot,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env },
      });

      this.dispatches.set(id, { ...record, process: proc });

      // Background: handle completion
      this.watchProcess(id, proc);
    } catch (err) {
      record.status = "failed";
      record.error = err instanceof Error ? err.message : String(err);
      this.dispatches.set(id, record);
      return { success: false, output: "", error: `Failed to spawn claude: ${record.error}` };
    }

    return {
      success: true,
      output: `Dispatched ${agent.name} to work on ${projectSlug}. I'll report back when they're done.`,
      artifacts: { dispatchId: id, agent: agent.name, project: projectSlug },
    };
  }

  private async watchProcess(id: string, proc: any): Promise<void> {
    const timeoutMs = this.config.dispatchTimeout * 1000;
    const timeoutHandle = setTimeout(() => {
      const dispatch = this.dispatches.get(id);
      if (dispatch && dispatch.status === "running") {
        try { proc.kill(); } catch {}
        dispatch.status = "timeout";
        dispatch.error = `Timed out after ${this.config.dispatchTimeout}s`;
        this.onComplete?.(dispatch);
      }
    }, timeoutMs);

    try {
      const code = await proc.exited;
      clearTimeout(timeoutHandle);

      const dispatch = this.dispatches.get(id);
      if (!dispatch || dispatch.status !== "running") return; // Already cancelled/timed out

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if (code === 0) {
        dispatch.status = "completed";
        dispatch.output = stdout;
      } else {
        dispatch.status = "failed";
        dispatch.error = stderr || `Process exited with code ${code}`;
      }

      this.onComplete?.(dispatch);
    } catch (err) {
      clearTimeout(timeoutHandle);
      const dispatch = this.dispatches.get(id);
      if (dispatch && dispatch.status === "running") {
        dispatch.status = "failed";
        dispatch.error = err instanceof Error ? err.message : String(err);
        this.onComplete?.(dispatch);
      }
    }
  }

  cancel(dispatchId: string): boolean {
    const dispatch = this.dispatches.get(dispatchId);
    if (!dispatch || dispatch.status !== "running") return false;

    try { dispatch.process?.kill(); } catch {}
    dispatch.status = "cancelled";
    this.dispatches.delete(dispatchId);
    return true;
  }

  cancelAll(): void {
    for (const [id, dispatch] of this.dispatches) {
      if (dispatch.status === "running") {
        try { dispatch.process?.kill(); } catch {}
        dispatch.status = "cancelled";
      }
    }
    this.dispatches.clear();
  }

  getActiveDispatches(): DispatchRecord[] {
    const active: DispatchRecord[] = [];
    for (const d of this.dispatches.values()) {
      if (d.status === "running") {
        const { process: _, ...record } = d;
        active.push(record);
      }
    }
    return active;
  }

  getDispatch(id: string): DispatchRecord | undefined {
    const d = this.dispatches.get(id);
    if (!d) return undefined;
    const { process: _, ...record } = d;
    return record;
  }

  updateConfig(partial: Partial<DispatchConfig>): void {
    Object.assign(this.config, partial);
  }

  // Test helper — adds a mock dispatch without spawning a real process
  _testAddMockDispatch(id: string): void {
    this.dispatches.set(id, {
      id,
      agent: "Test Agent",
      agentSlug: "test",
      project: "test",
      prompt: "test",
      startedAt: new Date(),
      status: "running",
      process: { kill: () => {} },
    });
  }
}

export function createDispatchTool(manager: DispatchManager): FridayTool {
  return {
    name: "studio.dispatch_agent",
    description: "Dispatch a Council of Elrond agent to perform work asynchronously. The agent runs in a background Claude Code session and reports back when done.",
    parameters: [
      { name: "agent", type: "string", description: `Agent slug. Available: ${listAgentSlugs().join(", ")}`, required: true },
      { name: "project", type: "string", description: "Project slug: expedition, ttr-ios, ttr-roblox", required: true },
      { name: "prompt", type: "string", description: "What to ask the agent to do", required: true },
      { name: "priority", type: "string", description: "normal or urgent (urgent = immediate notification)", required: false, default: "normal" },
    ],
    clearance: ["exec-shell"],
    async execute(args, _context) {
      return manager.dispatch(
        args.agent as string,
        args.project as string,
        args.prompt as string,
        (args.priority as "normal" | "urgent") || "normal",
      );
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/studio-dispatch.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond/friday
git add src/modules/studio/dispatch-agent.ts tests/unit/studio-dispatch.test.ts
git commit -m "feat(friday): add dispatch_agent tool — async Claude Code agent subprocess"
```

### Task 7: Studio Module Index

**Files:**
- Create: `friday/src/modules/studio/index.ts`

- [ ] **Step 1: Create the studio module index**

```typescript
// friday/src/modules/studio/index.ts

import type { FridayModule } from "../types.ts";
import { queryStudio } from "./query-studio.ts";
import { updateStudio } from "./update-studio.ts";
import { DispatchManager, createDispatchTool, DISPATCH_DEFAULTS } from "./dispatch-agent.ts";

// The DispatchManager is created at module level so it persists across tool calls.
// The runtime injects config overrides via the module's onLoad hook (IPC from dashboard).
const dispatchManager = new DispatchManager(DISPATCH_DEFAULTS);

const studioModule = {
  name: "studio",
  description: "Council of Elrond studio integration — query HQ data, dispatch agents, update project records",
  version: "1.0.0",
  tools: [queryStudio, updateStudio, createDispatchTool(dispatchManager)],
  protocols: [],
  knowledge: [],
  triggers: ["custom:agent-dispatch-completed"],
  clearance: ["read-fs", "write-fs", "exec-shell"],
  async onLoad() {
    console.log("[Studio] Studio module loaded — 3 tools registered");
  },
} satisfies FridayModule;

export default studioModule;
export { dispatchManager };
```

- [ ] **Step 2: Verify the module loads correctly**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun run -e "import m from './src/modules/studio/index.ts'; console.log(m.name, m.tools.length, 'tools')"`
Expected: `studio 3 tools`

- [ ] **Step 3: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond/friday
git add src/modules/studio/index.ts
git commit -m "feat(friday): add studio FridayModule — registers query, update, dispatch tools"
```

---

## Chunk 5: Cortex Integration — chatWithRouting + Runtime Boot

### Task 8: Extend ChatStream with brain metadata

**Files:**
- Modify: `friday/src/core/stream-types.ts`

- [ ] **Step 1: Add brain field to ChatStream**

Add a `brain` field to the `ChatStream` interface in `friday/src/core/stream-types.ts`:

```typescript
// Add after line 16 (after `usage: PromiseLike<TokenUsage>;`)
/** Which brain produced this response (grok or claude) */
brain?: "grok" | "claude";
/** Response duration in milliseconds */
durationMs?: number;
```

- [ ] **Step 2: Run existing tests to ensure nothing breaks**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/cortex-ai-sdk.test.ts`
Expected: All existing tests PASS (new fields are optional)

- [ ] **Step 3: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond/friday
git add src/core/stream-types.ts
git commit -m "feat(friday): add brain metadata fields to ChatStream interface"
```

### Task 9: Add chatWithRouting() to Cortex

**Files:**
- Modify: `friday/src/core/cortex.ts`

- [ ] **Step 1: Add BrainRouter and ClaudeBrain imports**

At the top of `friday/src/core/cortex.ts`, add after the existing imports (after line 20):

```typescript
import { BrainRouter, type BrainRouterConfig, type RouteContext, BRAIN_ROUTER_DEFAULTS } from "./brain-router.ts";
import { ClaudeBrain, type ClaudeBrainConfig, CLAUDE_BRAIN_DEFAULTS } from "./claude-brain.ts";
import { createPushIterable } from "./workers/push-iterable.ts";
```

- [ ] **Step 2: Add brainRouter and claudeBrain fields to CortexConfig**

In the `CortexConfig` interface (around line 26-44), add:

```typescript
/** BrainRouter config — enables dual-brain routing */
brainRouter?: BrainRouter;
/** ClaudeBrain instance — Claude Code CLI subprocess */
claudeBrain?: ClaudeBrain;
```

- [ ] **Step 3: Store references in Cortex constructor**

In the Cortex class, add private fields (after line 50):

```typescript
private brainRouter?: BrainRouter;
private claudeBrain?: ClaudeBrain;
private lastBrain?: "grok" | "claude";
```

In the constructor body, store the injected references:

```typescript
this.brainRouter = cfg.brainRouter;
this.claudeBrain = cfg.claudeBrain;
```

- [ ] **Step 4: Add chatWithRouting() method**

Add after the `chat()` method (after line 283):

```typescript
async chatWithRouting(
  userMessage: string,
  routeContext?: Partial<RouteContext>,
): Promise<ChatStream> {
  // If no brain router configured, fall through to Grok
  if (!this.brainRouter || !this.claudeBrain) {
    return this.chatStream(userMessage);
  }

  const ctx: RouteContext = {
    isVoice: false,
    previousBrain: this.lastBrain,
    ...routeContext,
  };

  const decision = this.brainRouter.route(userMessage, ctx);
  this.lastBrain = decision.brain;
  const messageToProcess = decision.strippedMessage;

  if (decision.brain === "grok") {
    const stream = await this.chatStream(messageToProcess);
    return { ...stream, brain: "grok" };
  }

  // Claude path — fire-and-forget subprocess
  const start = Date.now();
  const systemContext = await this.buildSystemPrompt(messageToProcess);

  this.audit?.log({
    action: "inference:start",
    source: "claude-brain",
    detail: `routing=${decision.reason}`,
    success: true,
  });

  try {
    const response = await this.claudeBrain.reason(
      messageToProcess,
      `<system>\n${systemContext}\n</system>`,
      { isVoice: ctx.isVoice },
    );

    const durationMs = response.durationMs;
    this.audit?.log({
      action: "inference:complete",
      source: "claude-brain",
      detail: `${durationMs}ms, ${response.text.length} chars`,
      success: true,
    });

    // Record in history
    this.historyManager.push({ role: "user", content: messageToProcess });
    this.historyManager.push({ role: "assistant", content: response.text });

    // Wrap response as ChatStream using PushIterable
    const textPush = createPushIterable<string>({ collect: true });

    // Chunk the text to simulate streaming (for consistent consumer interface)
    const chunkSize = 100;
    for (let i = 0; i < response.text.length; i += chunkSize) {
      textPush.push(response.text.slice(i, i + chunkSize));
    }
    textPush.done();

    // Speak via Vox if enabled (Claude doesn't use VoiceWorker)
    if (this.vox && this.vox.mode !== "off" && !ctx.isVoice) {
      this.vox.speak(response.text).catch(() => {});
    }

    return {
      textStream: textPush.iterable,
      fullText: Promise.resolve(response.text),
      usage: Promise.resolve({
        inputTokens: 0,
        outputTokens: response.text.length,
      }),
      brain: "claude",
      durationMs,
    };
  } catch (err) {
    this.audit?.log({
      action: "inference:error",
      source: "claude-brain",
      detail: err instanceof Error ? err.message : String(err),
      success: false,
    });
    // Fall back to Grok
    this.lastBrain = "grok";
    const stream = await this.chatStream(messageToProcess);
    return { ...stream, brain: "grok" };
  }
}
```

- [ ] **Step 5: Run existing cortex tests to verify nothing breaks**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/cortex-ai-sdk.test.ts tests/unit/cortex-tools.test.ts tests/unit/cortex-voice.test.ts`
Expected: All existing tests PASS

- [ ] **Step 6: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond/friday
git add src/core/cortex.ts
git commit -m "feat(friday): add chatWithRouting() — dual-brain routing through Cortex"
```

### Task 10: Boot BrainRouter + ClaudeBrain in Runtime

**Files:**
- Modify: `friday/src/core/runtime.ts`

- [ ] **Step 1: Add imports**

At the top of `friday/src/core/runtime.ts`, add after the existing imports (after line 42):

```typescript
import { BrainRouter, BRAIN_ROUTER_DEFAULTS } from "./brain-router.ts";
import { ClaudeBrain, CLAUDE_BRAIN_DEFAULTS } from "./claude-brain.ts";
```

- [ ] **Step 2: Add RuntimeConfig fields**

In the `RuntimeConfig` interface (around line 44-57), add:

```typescript
enableBrainRouter?: boolean;
```

- [ ] **Step 3: Add private fields to FridayRuntime**

Add after the other private fields (look for `private _cortex` etc.):

```typescript
private _brainRouter?: BrainRouter;
private _claudeBrain?: ClaudeBrain;
```

- [ ] **Step 4: Add getters**

Add public getters alongside existing ones:

```typescript
get brainRouter(): BrainRouter | undefined { return this._brainRouter; }
get claudeBrain(): ClaudeBrain | undefined { return this._claudeBrain; }
```

- [ ] **Step 5: Boot BrainRouter + ClaudeBrain before Cortex**

In `boot()`, add AFTER the `studioContext` loading (after line 377) and BEFORE `this._cortex = new Cortex(...)` (line 379):

```typescript
// Dual-brain: BrainRouter + ClaudeBrain (before Cortex so refs are available)
if (config.enableBrainRouter !== false) {
  this._claudeBrain = new ClaudeBrain(CLAUDE_BRAIN_DEFAULTS);
  const claudeAvailable = await this._claudeBrain.isAvailable();
  if (claudeAvailable) {
    this._brainRouter = new BrainRouter(BRAIN_ROUTER_DEFAULTS);
    onProgress?.("brain-router", "Dual-brain routing enabled (Claude CLI available)");
  } else {
    this._claudeBrain = undefined;
    onProgress?.("brain-router", "Claude CLI not found — Grok-only mode");
  }
}
```

- [ ] **Step 6: Pass references to Cortex constructor**

In the `new Cortex({...})` call (around line 379-396), add after the existing fields:

```typescript
brainRouter: this._brainRouter,
claudeBrain: this._claudeBrain,
```

- [ ] **Step 7: Run all tests**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test`
Expected: All 1129+ tests PASS

- [ ] **Step 8: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond/friday
git add src/core/runtime.ts
git commit -m "feat(friday): boot BrainRouter + ClaudeBrain in runtime — dual-brain activation"
```

---

## Chunk 6: Voice Pipeline — Claude→Grok TTS Passthrough

### Task 11: VoiceSessionManager — Claude→Grok TTS Passthrough

**Files:**
- Modify: `friday/src/core/voice/session-manager.ts`

The voice pipeline routes through `cortex.chatWithRouting()` so that Claude gets the full enriched system prompt (SMARTS, Sensorium, Genesis). When `chatWithRouting()` returns a Claude response, we inject the text into the Grok WebSocket for TTS synthesis.

- [ ] **Step 1: Modify processVoiceTurn to route through chatWithRouting**

Find the `processVoiceTurn` method (around line 351). Replace it:

```typescript
private async processVoiceTurn(transcript: string): Promise<void> {
  if (!this.voiceWorker) return;
  this.emitStateChange("thinking");

  try {
    // Check BrainRouter decision WITHOUT executing inference first.
    // This avoids double inference: we don't want chatWithRouting() running
    // a full Grok chatStream() only to throw it away and re-run via chatStreamVoice().
    const cortex = this.cortex;
    const brainRouter = (cortex as any).brainRouter;

    if (brainRouter) {
      const decision = brainRouter.route(transcript, { isVoice: true, previousBrain: (cortex as any).lastBrain });

      if (decision.brain === "claude") {
        // Claude path — use chatWithRouting() which provides enriched system prompt
        const stream = await cortex.chatWithRouting(decision.strippedMessage, { isVoice: true });
        const text = await stream.fullText;

        // Inject Claude's text response into Grok WebSocket for TTS synthesis
        this.sendToGrok(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "assistant",
            content: [{
              type: "input_text",
              text,
            }],
          },
        }));

        // Tell Grok to speak it (audio only, no additional text generation)
        this.sendToGrok(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["audio"],
          },
        }));

        // Broadcast to other clients
        this.hub?.broadcast({
          type: "conversation:message",
          role: "assistant",
          content: text,
          source: "voice",
        }, this.clientId);

        return;
      }
    }

    // Grok path — existing flow: Grok handles both reasoning + speech natively
    // No BrainRouter, or BrainRouter decided Grok — go straight to chatStreamVoice()
    const voiceStream = await cortex.chatStreamVoice(
      transcript,
      this.voiceWorker,
    );
    await voiceStream.fullText;
  } catch (err) {
    this.log(
      "ERROR",
      err instanceof Error ? err.message : String(err),
    );
    this.emitStateChange("error");
  } finally {
    this._activeTurn = null;
  }
}
```

**Key design decision:** We query BrainRouter for the routing decision FIRST, without executing any inference. Only when the decision is `"claude"` do we call `chatWithRouting()` (which runs ClaudeBrain with enriched system prompt). When the decision is `"grok"` (or no BrainRouter is configured), we go directly to `chatStreamVoice()` — avoiding the double-inference problem where `chatWithRouting()` would run a text-only Grok chatStream only to discard it and re-run via chatStreamVoice().

Note: Accessing `brainRouter` via `(cortex as any)` is a pragmatic choice to avoid adding a public `getRouteDecision()` method to Cortex just for this one caller. An alternative is to expose `cortex.brainRouter` as a readonly property — the implementer should choose based on the codebase's conventions.

- [ ] **Step 2: Run voice tests**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/cortex-voice.test.ts`
Expected: All existing voice tests PASS (chatWithRouting falls through to chatStream when no BrainRouter configured)

- [ ] **Step 3: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond/friday
git add src/core/voice/session-manager.ts
git commit -m "feat(friday): voice pipeline Claude→Grok TTS passthrough via chatWithRouting"
```

---

## Chunk 7: Dashboard UI — BrainTab + TranscriptFeed + Architecture HTML

### Task 12: BrainTab — Add Dual-Brain Settings

**Files:**
- Modify: `src/components/dashboard/friday/persona/BrainTab.jsx`

- [ ] **Step 1: Read current BrainTab.jsx** (already read above — 136 lines)

- [ ] **Step 2: Add Brain Routing, Claude Brain, and Agent Dispatch settings cards**

Add three new SettingsCards after the existing Conversation Memory card. Each gets its own config/dirty/save state block:

```jsx
// Add after the existing Conversation Memory SettingsCard (line 131)
// and before the Toast (line 133)

// --- BRAIN ROUTING CONFIG ---
const BRAIN_DEFAULTS = {
  mode: 'auto',
  shortQueryThreshold: 20,
  claudeKeywords: 'analyze, compare, explain why, review, design, plan, evaluate, summarize, assess, recommend, critique, break down, deep dive, what do you think, walk me through',
  voiceClaudeEnabled: true,
  showBrainBadge: true,
};

// Add state for brain config (inside BrainTab component, after existing state):
const [brainConfig, setBrainConfig] = useState(() => {
  try {
    const saved = localStorage.getItem('coe-friday-brain');
    return saved ? { ...BRAIN_DEFAULTS, ...JSON.parse(saved) } : { ...BRAIN_DEFAULTS };
  } catch { return { ...BRAIN_DEFAULTS }; }
});
const [brainDirty, setBrainDirty] = useState(false);

const updateBrain = useCallback((key, value) => {
  setBrainConfig(prev => ({ ...prev, [key]: value }));
  setBrainDirty(true);
}, []);

const handleBrainSave = useCallback(() => {
  localStorage.setItem('coe-friday-brain', JSON.stringify(brainConfig));
  window.electronAPI?.friday?.send({
    type: 'config:update', id: crypto.randomUUID(),
    section: 'brain', config: brainConfig,
  });
  setBrainDirty(false);
  setToast('Brain routing settings saved');
}, [brainConfig]);

const handleBrainReset = useCallback(() => {
  setBrainConfig({ ...BRAIN_DEFAULTS });
  setBrainDirty(true);
}, []);

// --- CLAUDE CONFIG ---
const CLAUDE_DEFAULTS = {
  claudePath: 'claude',
  claudeTimeout: 60,
  maxOutputChars: 32000,
};

const [claudeConfig, setClaudeConfig] = useState(() => {
  try {
    const saved = localStorage.getItem('coe-friday-claude');
    return saved ? { ...CLAUDE_DEFAULTS, ...JSON.parse(saved) } : { ...CLAUDE_DEFAULTS };
  } catch { return { ...CLAUDE_DEFAULTS }; }
});
const [claudeDirty, setClaudeDirty] = useState(false);

const updateClaude = useCallback((key, value) => {
  setClaudeConfig(prev => ({ ...prev, [key]: value }));
  setClaudeDirty(true);
}, []);

const handleClaudeSave = useCallback(() => {
  localStorage.setItem('coe-friday-claude', JSON.stringify(claudeConfig));
  window.electronAPI?.friday?.send({
    type: 'config:update', id: crypto.randomUUID(),
    section: 'claude-brain', config: claudeConfig,
  });
  setClaudeDirty(false);
  setToast('Claude Brain settings saved');
}, [claudeConfig]);

const handleClaudeReset = useCallback(() => {
  setClaudeConfig({ ...CLAUDE_DEFAULTS });
  setClaudeDirty(true);
}, []);

// --- DISPATCH CONFIG ---
const DISPATCH_DEFAULTS = {
  maxConcurrent: 3,
  dispatchTimeout: 120,
};

const [dispatchConfig, setDispatchConfig] = useState(() => {
  try {
    const saved = localStorage.getItem('coe-friday-dispatch');
    return saved ? { ...DISPATCH_DEFAULTS, ...JSON.parse(saved) } : { ...DISPATCH_DEFAULTS };
  } catch { return { ...DISPATCH_DEFAULTS }; }
});
const [dispatchDirty, setDispatchDirty] = useState(false);

const updateDispatch = useCallback((key, value) => {
  setDispatchConfig(prev => ({ ...prev, [key]: value }));
  setDispatchDirty(true);
}, []);

const handleDispatchSave = useCallback(() => {
  localStorage.setItem('coe-friday-dispatch', JSON.stringify(dispatchConfig));
  window.electronAPI?.friday?.send({
    type: 'config:update', id: crypto.randomUUID(),
    section: 'dispatch', config: dispatchConfig,
  });
  setDispatchDirty(false);
  setToast('Dispatch settings saved');
}, [dispatchConfig]);

const handleDispatchReset = useCallback(() => {
  setDispatchConfig({ ...DISPATCH_DEFAULTS });
  setDispatchDirty(true);
}, []);
```

Then add the JSX cards:

```jsx
{/* Brain Routing */}
<SettingsCard
  title="Brain Routing"
  icon="&#x1F500;"
  description="Controls which brain (Grok or Claude) handles each message."
  onSave={handleBrainSave}
  onReset={handleBrainReset}
  dirty={brainDirty}
>
  <div className="mb-3">
    <label className="text-[11px] font-mono text-coe-text-secondary mb-1.5 block">Brain Mode</label>
    <div className="flex gap-1">
      {['auto', 'grok', 'claude'].map(mode => (
        <button key={mode} onClick={() => updateBrain('mode', mode)}
          className={`px-3 py-1 text-[11px] font-mono rounded-md border transition-colors ${
            brainConfig.mode === mode
              ? 'border-fuchsia-500 bg-fuchsia-500/20 text-fuchsia-300'
              : 'border-coe-border text-coe-text-muted hover:border-coe-text-secondary'
          }`}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</button>
      ))}
    </div>
    <p className="text-[10px] text-coe-text-muted mt-1">Auto = smart routing based on keywords and message length. Grok/Claude = force all messages to one brain.</p>
  </div>
  <SettingControl label="Short Query Threshold" value={brainConfig.shortQueryThreshold}
    onChange={(v) => updateBrain('shortQueryThreshold', v)} type="number"
    min={5} max={100} step={5} suffix="words"
    help="Messages shorter than this go to Grok (fast path)."
    barneyHelp="If your message is shorter than this many words, Friday routes it to Grok for a quick answer instead of waking up Claude for heavy thinking. Short questions like 'what time is it' don't need a genius — they need speed."
  />
  <SettingControl label="Claude Keywords" value={brainConfig.claudeKeywords}
    onChange={(v) => updateBrain('claudeKeywords', v)} type="textarea" rows={3}
    help="Comma-separated trigger words. If a message contains any of these AND is 5+ words, route to Claude."
    barneyHelp="These are the magic words that tell Friday 'this needs deep thinking.' When you say 'analyze my monetization' or 'walk me through the code,' the word 'analyze' or 'walk me through' triggers Claude instead of Grok. Short messages with these words are ignored to avoid false positives."
  />
  <SettingControl label="Voice Claude Enabled" value={brainConfig.voiceClaudeEnabled}
    onChange={(v) => updateBrain('voiceClaudeEnabled', v)} type="toggle"
    help="Allow Claude routing during Push-to-Talk voice mode."
    barneyHelp="When you're talking to Friday by voice, should she ever route your questions to Claude? Claude takes longer (3-8 seconds) but gives deeper answers. Grok responds instantly with speech. If disabled, all voice queries stay on Grok for speed."
  />
  <SettingControl label="Show Brain Badge" value={brainConfig.showBrainBadge}
    onChange={(v) => updateBrain('showBrainBadge', v)} type="toggle"
    help="Display which brain handled each message in the transcript."
    barneyHelp="Shows a small badge on each message in the chat — either '⚡ Grok' or '🧠 Claude' — so you can see which brain answered. Useful for understanding routing behavior."
  />
</SettingsCard>

{/* Claude Brain */}
<SettingsCard
  title="Claude Brain"
  icon="&#x1F9E0;"
  description="Configure the Claude Code CLI subprocess used for complex reasoning."
  onSave={handleClaudeSave}
  onReset={handleClaudeReset}
  dirty={claudeDirty}
>
  <SettingControl label="Claude CLI Path" value={claudeConfig.claudePath}
    onChange={(v) => updateClaude('claudePath', v)} type="text"
    help="Path to the claude CLI executable."
    barneyHelp="Where to find the Claude Code CLI on your system. Usually just 'claude' if it's in your PATH. If you installed it somewhere custom, put the full path here."
  />
  <SettingControl label="Claude Timeout" value={claudeConfig.claudeTimeout}
    onChange={(v) => updateClaude('claudeTimeout', v)} type="number"
    min={10} max={300} step={5} suffix="sec"
    help="Maximum time for a Claude subprocess to respond before being killed."
    barneyHelp="How long Friday waits for Claude to finish thinking before giving up. Complex analysis might need 30-60 seconds. If Claude is consistently timing out, either your questions are too complex or something's stuck."
  />
  <SettingControl label="Max Output Characters" value={claudeConfig.maxOutputChars}
    onChange={(v) => updateClaude('maxOutputChars', v)} type="number"
    min={1000} max={100000} step={1000} suffix="chars"
    help="Truncate Claude responses longer than this. Voice mode auto-caps at 2000."
    barneyHelp="The maximum length of Claude's response. In voice mode, this is automatically capped at 2,000 characters so Grok doesn't have to read you a novel. In text mode, 32,000 characters is plenty for detailed analysis."
  />
</SettingsCard>

{/* Agent Dispatch */}
<SettingsCard
  title="Agent Dispatch"
  icon="&#x1F916;"
  description="Controls how Friday dispatches Council agents for background work."
  onSave={handleDispatchSave}
  onReset={handleDispatchReset}
  dirty={dispatchDirty}
>
  <SettingControl label="Max Concurrent Dispatches" value={dispatchConfig.maxConcurrent}
    onChange={(v) => updateDispatch('maxConcurrent', v)} type="number"
    min={1} max={10} step={1}
    help="Maximum simultaneous agent dispatches. Additional requests are queued."
    barneyHelp="How many agents Friday can run at the same time. Each agent is a separate Claude Code session doing real work. Running too many at once can slow things down, so 3 is a good default."
  />
  <SettingControl label="Dispatch Timeout" value={dispatchConfig.dispatchTimeout}
    onChange={(v) => updateDispatch('dispatchTimeout', v)} type="number"
    min={30} max={600} step={10} suffix="sec"
    help="Maximum time for an agent dispatch to complete before being killed."
    barneyHelp="How long to wait for an agent to finish its work. Most agent tasks (analysis, recommendations) take 30-120 seconds. If an agent is doing a deep codebase scan, it might need longer."
  />
</SettingsCard>
```

- [ ] **Step 3: Verify build compiles**

Run: `cd C:/Claude/Agency/council-of-elrond && npx vite build --logLevel error`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond
git add src/components/dashboard/friday/persona/BrainTab.jsx
git commit -m "feat(coe): add Brain Routing, Claude Brain, Agent Dispatch settings to BrainTab"
```

### Task 13: TranscriptFeed — Brain Badges

**Files:**
- Modify: `src/components/dashboard/friday/TranscriptFeed.jsx`

- [ ] **Step 1: Read current TranscriptFeed.jsx** (already read — 154 lines)

- [ ] **Step 2: Add brain badge to assistant messages**

In the message rendering section (around line 95-120), find where assistant messages render their header and add a brain badge component:

```jsx
// Add this helper component at the bottom of the file, before the export:

function BrainBadge({ brain, durationMs }) {
  if (!brain) return null;

  const isClaude = brain === 'claude';
  const icon = isClaude ? '🧠' : '⚡';
  const label = isClaude ? 'Claude' : 'Grok';
  const color = isClaude ? 'text-purple-400' : 'text-amber-400';
  const duration = durationMs ? `${(durationMs / 1000).toFixed(1)}s` : '';

  return (
    <span className={`text-[9px] font-mono ${color} ml-2 opacity-70`}>
      {icon} {label}{duration ? ` · ${duration}` : ''}
    </span>
  );
}
```

Then in the message header rendering for assistant messages, add `<BrainBadge brain={msg.brain} durationMs={msg.durationMs} />` after the timestamp.

The message data structure needs `brain` and `durationMs` optional fields — these will be set by the server when sending `chat:response` messages with brain metadata.

- [ ] **Step 3: Verify build compiles**

Run: `cd C:/Claude/Agency/council-of-elrond && npx vite build --logLevel error`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond
git add src/components/dashboard/friday/TranscriptFeed.jsx
git commit -m "feat(coe): add brain badges to TranscriptFeed — shows Grok/Claude per message"
```

### Task 14: Architecture HTML — Dual-Brain + Studio Tools Sections

**Files:**
- Modify: `docs/friday-architecture.html`

- [ ] **Step 1: Read current architecture HTML structure**

The file is 1267 lines. Read the section headings to find where to insert new content.

- [ ] **Step 2: Add Dual-Brain Routing section**

Insert a new section after the "Core Subsystems" grid (look for the section that lists the 12 subsystem cards). Add a new `<section>` with:

- **Dual-Brain Architecture** heading
- Side-by-side comparison: Grok Path (fast, voice native, streaming) vs Claude Path (deep reasoning, CLI subprocess, async)
- BrainRouter flow diagram (ASCII art or styled divs): Message → BrainRouter → [Grok | Claude] → Response → [History + TTS]
- Routing priority table (7 rules)

- [ ] **Step 3: Add Studio Tools section**

Add another section with:

- **Studio Director Tools** heading
- Three tool cards: `dispatch_agent` (async subprocess), `query_studio` (HQ data read), `update_studio` (HQ data write)
- Agent Dispatch flow: dispatch → background subprocess → file watcher → signal → notify

- [ ] **Step 4: Add Voice + Claude Pipeline section**

Add a pipeline visualization showing:

```
Voice + Claude Flow:
PTT → Grok STT → Transcript → BrainRouter → Claude CLI → Response Text
→ Grok WebSocket (conversation.item.create) → Grok TTS → Speaker
```

- [ ] **Step 5: Verify the HTML renders correctly**

Open `docs/friday-architecture.html` in a browser and verify all new sections display properly.

- [ ] **Step 6: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond
git add docs/friday-architecture.html
git commit -m "docs: add dual-brain routing, studio tools, voice+claude pipeline to architecture HTML"
```

---

## Chunk 8: Integration Wiring + Final Verification

### Task 15: Wire IPC Config Handlers — Protocol + Handler Changes

**Files:**
- Modify: `friday/src/server/protocol.ts`
- Modify: `friday/src/server/handler.ts`

The dashboard sends `config:update` messages via `window.electronAPI.friday.send()`, which relays through Electron's main process WebSocket to Friday's server. Currently, `config:update` is NOT a recognized message type in `protocol.ts` — it's silently dropped by `parseClientMessage()`. We need to add it.

- [ ] **Step 1: Add `config:update` to protocol.ts**

In `friday/src/server/protocol.ts`, add the new message type to the `ClientMessage` union (after line 24):

```typescript
| { type: "config:update"; id: string; section: string; config: Record<string, unknown> }
```

Add to the `VALID_TYPES` set (after `"voice:mode"`):

```typescript
"config:update",
```

Add to `REQUIRED_FIELDS` (after the `voice:mode` entry):

```typescript
"config:update": ["id", "section", "config"],
```

Add a field type validation (after the `voice` check around line 133):

```typescript
if ("section" in parsed && typeof parsed.section !== "string") return null;
if ("config" in parsed && (typeof parsed.config !== "object" || parsed.config === null)) return null;
```

- [ ] **Step 2: Add config:update handler to handler.ts**

In `friday/src/server/handler.ts`, find the `handleRuntimeMessage` method's switch statement (around line 227). Add a new case before the `default` or after the last existing case:

```typescript
case "config:update": {
  const section = (msg as any).section as string;
  const config = (msg as any).config as Record<string, unknown>;

  switch (section) {
    case "brain":
      this.runtime.brainRouter?.updateConfig(config);
      break;
    case "claude-brain":
      this.runtime.claudeBrain?.updateConfig(config);
      break;
    case "dispatch":
      // DispatchManager is inside the studio module — access via runtime module registry
      // The studio module exports dispatchManager, but we update via the runtime's module reference
      // For now, dispatch config is stored in localStorage only — runtime uses defaults
      break;
    case "voice":
      // Voice config is handled by VoiceSessionManager (already exists)
      break;
    default:
      console.log(`[Handler] Unknown config section: ${section}`);
  }

  send({
    type: "protocol:response",
    requestId: msg.id,
    content: `Config section "${section}" updated`,
    success: true,
  });
  break;
}
```

Note: The `handleRuntimeMessage` switch currently has cases for `chat`, `protocol`, `voice:start`, `voice:stop`, `voice:mode`, `history:list`, `history:load`, `smarts:list`, `smarts:search`, `session:list-protocols`. The `config:update` case follows the same pattern.

- [ ] **Step 3: Also add `chat:response` brain metadata**

In the `chat` case of `handleRuntimeMessage` (around line 251), change `this.runtime.cortex.chatStream(msg.content)` to `this.runtime.cortex.chatWithRouting(msg.content)` so text chat also benefits from dual-brain routing:

```typescript
// Change this line:
const stream = await this.runtime.cortex.chatStream(msg.content);
// To:
const stream = await this.runtime.cortex.chatWithRouting(msg.content);
```

And update the `chat:response` message to include brain metadata:

```typescript
send({
  type: "chat:response",
  requestId: msg.id,
  content: fullText,
  source: "cortex",
  brain: stream.brain,
  durationMs: stream.durationMs,
});
```

This requires adding `brain` and `durationMs` as optional fields to the `chat:response` ServerMessage type in `protocol.ts`:

```typescript
| {
    type: "chat:response";
    requestId: string;
    content: string;
    source: "cortex" | "protocol";
    brain?: "grok" | "claude";
    durationMs?: number;
  }
```

- [ ] **Step 4: Run tests**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test tests/unit/handler.test.ts`
Expected: All existing handler tests PASS (new fields are optional)

- [ ] **Step 5: Commit**

```bash
cd C:/Claude/Agency/council-of-elrond/friday
git add src/server/protocol.ts src/server/handler.ts
git commit -m "feat(friday): wire config:update IPC + dual-brain routing in chat handler"
```

### Task 16: Full Test Suite Verification

- [ ] **Step 1: Run all Friday tests**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun test`
Expected: All tests PASS (1129+ existing + ~25 new)

- [ ] **Step 2: Run CoE dashboard build**

Run: `cd C:/Claude/Agency/council-of-elrond && npx vite build --logLevel error`
Expected: Build succeeds with no errors

- [ ] **Step 3: Run typecheck**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun run typecheck`
Expected: No type errors

- [ ] **Step 4: Run lint**

Run: `cd C:/Claude/Agency/council-of-elrond/friday && bun run lint`
Expected: No lint errors (or only pre-existing ones)

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
cd C:/Claude/Agency/council-of-elrond
git add -A
git commit -m "fix: address lint/type issues from dual-brain integration"
```
