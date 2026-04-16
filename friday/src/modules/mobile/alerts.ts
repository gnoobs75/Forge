// friday/src/modules/mobile/alerts.ts
import type { SessionRegistry } from "./session-registry.ts";
import type { MobileEvent, SessionStatus } from "./types.ts";

export class MobileAlertManager {
  constructor(
    registry: SessionRegistry,
    private emit: (event: MobileEvent) => void,
  ) {
    registry.onChange((scopeId, status) => {
      this.handleStatusChange(scopeId, status, registry);
    });
  }

  private handleStatusChange(
    scopeId: string,
    status: SessionStatus,
    registry: SessionRegistry,
  ): void {
    const session = registry.get(scopeId);
    if (!session) return;

    const eventData = {
      scopeId: session.scopeId,
      project: session.project,
      agent: session.agent,
      taskDescription: session.taskDescription,
      promptType: session.prompt?.type ?? null,
    };

    if (status === "waiting") {
      this.emit({
        type: "session:needs-input",
        data: eventData,
        timestamp: new Date().toISOString(),
      });
    } else if (status === "complete") {
      this.emit({
        type: "session:complete",
        data: eventData,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
