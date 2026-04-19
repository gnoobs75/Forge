// friday/src/modules/mobile/session-registry.ts
import type { SessionInfo, SessionStatus } from "./types.ts";
import { detectPrompt } from "./prompt-detector.ts";

const MAX_OUTPUT_LINES = 500;

type ChangeCallback = (scopeId: string, status: SessionStatus) => void;

interface RegisterOptions {
  scopeId: string;
  project: string;
  agent: string;
  taskDescription: string;
}

export class SessionRegistry {
  private sessions = new Map<string, SessionInfo>();
  private callbacks: ChangeCallback[] = [];

  onChange(cb: ChangeCallback): void {
    this.callbacks.push(cb);
  }

  private notify(scopeId: string, status: SessionStatus): void {
    for (const cb of this.callbacks) {
      try { cb(scopeId, status); } catch {}
    }
  }

  register(opts: RegisterOptions): void {
    this.sessions.set(opts.scopeId, {
      scopeId: opts.scopeId,
      project: opts.project,
      agent: opts.agent,
      status: "running",
      prompt: null,
      lastOutput: [],
      startedAt: new Date().toISOString(),
      taskDescription: opts.taskDescription,
    });
  }

  get(scopeId: string): SessionInfo | null {
    return this.sessions.get(scopeId) ?? null;
  }

  appendOutput(scopeId: string, data: string): void {
    const session = this.sessions.get(scopeId);
    if (!session) return;

    const newLines = data.split("\n");
    session.lastOutput.push(...newLines);
    if (session.lastOutput.length > MAX_OUTPUT_LINES) {
      session.lastOutput = session.lastOutput.slice(-MAX_OUTPUT_LINES);
    }

    const fullTail = session.lastOutput.join("\n");
    const detected = detectPrompt(fullTail);
    if (detected && session.status !== "waiting") {
      session.status = "waiting";
      session.prompt = detected;
      this.notify(scopeId, "waiting");
    }
  }

  markInputSent(scopeId: string): void {
    const session = this.sessions.get(scopeId);
    if (!session) return;
    session.status = "running";
    session.prompt = null;
  }

  markComplete(scopeId: string): void {
    const session = this.sessions.get(scopeId);
    if (!session) return;
    session.status = "complete";
    session.prompt = null;
    this.notify(scopeId, "complete");
  }

  remove(scopeId: string): void {
    this.sessions.delete(scopeId);
  }

  listAll(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  listWaiting(): SessionInfo[] {
    return this.listAll().filter((s) => s.status === "waiting");
  }

  listByProject(project: string): SessionInfo[] {
    return this.listAll().filter((s) => s.project === project);
  }
}
