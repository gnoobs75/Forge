import type { FridayModule } from "../types.ts";
import { SessionRegistry } from "./session-registry.ts";
import { TerminalBridge } from "./terminal-bridge.ts";
import { MobileAlertManager } from "./alerts.ts";

export const mobileRegistry = new SessionRegistry();
let _mobileBridge: TerminalBridge | null = null;
let _mobileAlerts: MobileAlertManager | null = null;

export function getMobileBridge(): TerminalBridge | null {
  return _mobileBridge;
}

export const mobileClients = new Map<
  string,
  (msg: Record<string, unknown>) => void
>();

export function initMobileBridge(
  sendToElectron: (msg: Record<string, unknown>) => void,
): void {
  _mobileBridge = new TerminalBridge(mobileRegistry, sendToElectron);
  _mobileAlerts = new MobileAlertManager(mobileRegistry, (event) => {
    for (const send of mobileClients.values()) {
      try {
        send(event as unknown as Record<string, unknown>);
      } catch {}
    }
  });
  console.log("[Mobile] Bridge initialized — ready for connections");
}

const mobileModule = {
  name: "mobile",
  description:
    "Mobile companion API — REST endpoints, terminal bridge, session alerts",
  version: "1.0.0",
  tools: [],
  protocols: [],
  knowledge: [],
  triggers: [],
  clearance: ["read-fs", "network"] as const,
  async onLoad() {
    console.log("[Mobile] Module loaded");
  },
} satisfies FridayModule;

export default mobileModule;
