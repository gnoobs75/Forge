// friday/src/modules/mobile/terminal-bridge.ts
import type { SessionRegistry } from "./session-registry.ts";

type SendFn = (msg: Record<string, unknown>) => void;

interface Subscription {
  clientId: string;
  scopeId: string;
  send: SendFn;
}

export class TerminalBridge {
  private subscriptions = new Map<string, Subscription>();

  constructor(
    private registry: SessionRegistry,
    private sendToElectron: SendFn,
  ) {}

  subscribe(clientId: string, scopeId: string, send: SendFn): void {
    this.subscriptions.set(clientId, { clientId, scopeId, send });
    this.sendToElectron({
      type: "mobile:terminal:subscribe",
      scopeId,
    });
  }

  unsubscribe(clientId: string): void {
    const sub = this.subscriptions.get(clientId);
    if (sub) {
      this.sendToElectron({
        type: "mobile:terminal:unsubscribe",
        scopeId: sub.scopeId,
      });
      this.subscriptions.delete(clientId);
    }
  }

  sendInput(scopeId: string, data: string): void {
    this.registry.markInputSent(scopeId);
    this.sendToElectron({
      type: "mobile:terminal:input",
      scopeId,
      data,
    });
  }

  handleElectronMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;
    const scopeId = msg.scopeId as string;

    if (type === "mobile:terminal:data") {
      const data = msg.data as string;
      this.registry.appendOutput(scopeId, data);
      for (const sub of this.subscriptions.values()) {
        if (sub.scopeId === scopeId) {
          sub.send({ type: "terminal:data", scopeId, data });
        }
      }
    } else if (type === "mobile:terminal:exit") {
      this.registry.markComplete(scopeId);
      for (const sub of this.subscriptions.values()) {
        if (sub.scopeId === scopeId) {
          sub.send({
            type: "terminal:exit",
            scopeId,
            exitCode: msg.exitCode,
          });
        }
      }
    } else if (type === "mobile:terminal:sessions") {
      const sessions = msg.sessions as Array<{
        scopeId: string;
        project?: string;
        agent?: string;
        taskDescription?: string;
      }>;
      if (Array.isArray(sessions)) {
        for (const s of sessions) {
          if (!this.registry.get(s.scopeId)) {
            this.registry.register({
              scopeId: s.scopeId,
              project: s.project || "unknown",
              agent: s.agent || "unknown",
              taskDescription: s.taskDescription || "",
            });
          }
        }
      }
    }
  }
}
