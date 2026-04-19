import { describe, it, expect } from "bun:test";
import { SessionRegistry } from "../../src/modules/mobile/session-registry.ts";
import { handleMobileRoute } from "../../src/modules/mobile/routes.ts";

describe("GET /api/mobile/sessions/:scopeId/logs", () => {
  it("404s when session is missing, 200s with buffered output when present", async () => {
    const registry = new SessionRegistry();

    const missing = await handleMobileRoute(
      new Request("http://x/api/mobile/sessions/nope/logs"),
      new URL("http://x/api/mobile/sessions/nope/logs"),
      registry,
      null,
    );
    expect(missing!.status).toBe(404);

    registry.register({
      scopeId: "impl-test-1",
      project: "forge-mobile",
      agent: "CodeReviewer",
      taskDescription: "test",
    });
    registry.appendOutput("impl-test-1", "line-a\nline-b\nline-c\n");

    const hit = await handleMobileRoute(
      new Request("http://x/api/mobile/sessions/impl-test-1/logs"),
      new URL("http://x/api/mobile/sessions/impl-test-1/logs"),
      registry,
      null,
    );
    expect(hit!.status).toBe(200);
    const body = await hit!.json();
    expect(body.scopeId).toBe("impl-test-1");
    expect(body.status).toBe("running");
    expect(body.lastOutput.join("")).toContain("line-a");
    expect(body.lastOutput.join("")).toContain("line-c");
    expect(body.prompt).toBeNull();
    expect(typeof body.startedAt).toBe("string");
  });
});
