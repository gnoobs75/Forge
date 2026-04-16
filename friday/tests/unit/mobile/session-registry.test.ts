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
    expect(waiting[0]!.scopeId).toBe("a");
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
