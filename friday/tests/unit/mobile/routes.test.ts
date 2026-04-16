// friday/tests/unit/mobile/routes.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { handleMobileRoute } from "../../../src/modules/mobile/routes.ts";
import { SessionRegistry } from "../../../src/modules/mobile/session-registry.ts";

const MOCK_HQ_DIR = null;

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
