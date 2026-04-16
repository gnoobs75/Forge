import { describe, it, expect } from "bun:test";
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
