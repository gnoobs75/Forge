// friday/src/modules/mobile/types.ts

export type PromptType = "binary" | "permission" | "numbered" | "open";

export interface DetectedPrompt {
  type: PromptType;
  options: string[];
  promptText: string;
}

export type SessionStatus = "running" | "waiting" | "idle" | "complete";

export interface SessionInfo {
  scopeId: string;
  project: string;
  agent: string;
  status: SessionStatus;
  prompt: DetectedPrompt | null;
  lastOutput: string[];
  startedAt: string;
  taskDescription: string;
}

export interface MobileEvent {
  type: "session:update" | "session:needs-input" | "session:complete" | "activity:new";
  data: Record<string, unknown>;
  timestamp: string;
}
