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

    expect(received).toHaveLength(0);
  });
});
