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
