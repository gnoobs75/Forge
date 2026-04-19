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
