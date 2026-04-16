import { describe, it, expect } from "bun:test";
import { queryStudioExecute } from "../../src/modules/studio/query-studio.ts";

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
