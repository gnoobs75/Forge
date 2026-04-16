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
