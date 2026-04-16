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
