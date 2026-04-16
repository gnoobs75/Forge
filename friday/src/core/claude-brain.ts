import { writeMeterRecord, estimateTokens, meterRecordId } from "../modules/studio/metering.ts";

export interface ClaudeBrainConfig {
  timeout: number;        // seconds
  claudePath: string;
  maxOutputChars: number;
}

export interface ClaudeResponse {
  text: string;
  durationMs: number;
  truncated: boolean;
}

export const CLAUDE_BRAIN_DEFAULTS: ClaudeBrainConfig = {
  timeout: 60,
  claudePath: "claude",
  maxOutputChars: 32000,
};

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export class ClaudeBrain {
  private config: ClaudeBrainConfig;
  private _available: boolean | null = null;

  constructor(config: ClaudeBrainConfig) {
    this.config = { ...config };
  }

  buildPrompt(userMessage: string, systemContext: string): string {
    if (!systemContext) return userMessage;
    return `${systemContext}\n\n${userMessage}`;
  }

  async reason(
    prompt: string,
    systemContext: string,
    options?: { isVoice?: boolean; isRetry?: boolean },
  ): Promise<ClaudeResponse> {
    const start = Date.now();
    const fullPrompt = this.buildPrompt(prompt, systemContext);

    const maxChars = options?.isVoice
      ? Math.min(this.config.maxOutputChars, 2000)
      : this.config.maxOutputChars;

    const proc = Bun.spawn([this.config.claudePath, "-p", fullPrompt], {
      stdout: "pipe",
      stderr: "pipe",
    });

    // Timeout via race
    const timeoutMs = this.config.timeout * 1000;
    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), timeoutMs),
    );

    const exitPromise = proc.exited.then((code) => ({ code }));
    const race = await Promise.race([exitPromise, timeoutPromise]);

    if (race === "timeout") {
      proc.kill();
      const partialStdout = await readStream(proc.stdout as ReadableStream<Uint8Array>);
      const text = partialStdout.slice(0, maxChars);
      const durationMs = Date.now() - start;
      try {
        const tokenEst = estimateTokens(fullPrompt.length, partialStdout.length);
        writeMeterRecord({
          id: meterRecordId(),
          timestamp: new Date().toISOString(),
          provider: "claude",
          model: "claude-code",
          source: "friday-inference",
          agent: null,
          agentSlug: null,
          project: null,
          linkType: null,
          linkId: null,
          tokens: tokenEst,
          durationMs,
          status: "timeout",
        });
      } catch { /* Metering failure must never break the brain */ }
      return {
        text: text ? `${text}\n\n(response truncated due to timeout)` : "(Claude timed out with no output)",
        durationMs,
        truncated: true,
      };
    }

    const { code } = race as { code: number };
    const stdout = await readStream(proc.stdout as ReadableStream<Uint8Array>);
    const stderr = await readStream(proc.stderr as ReadableStream<Uint8Array>);

    if (code !== 0) {
      const durationMs = Date.now() - start;
      try {
        const tokenEst = estimateTokens(fullPrompt.length, stderr.length);
        writeMeterRecord({
          id: meterRecordId(),
          timestamp: new Date().toISOString(),
          provider: "claude",
          model: "claude-code",
          source: "friday-inference",
          agent: null,
          agentSlug: null,
          project: null,
          linkType: null,
          linkId: null,
          tokens: tokenEst,
          durationMs,
          status: "failed",
        });
      } catch { /* Metering failure must never break the brain */ }
      return {
        text: stderr || `Claude exited with code ${code}`,
        durationMs,
        truncated: false,
      };
    }

    // Empty response → retry once
    if (!stdout.trim()) {
      if (!options?.isRetry) {
        return this.reason(prompt, systemContext, { ...options, isRetry: true });
      }
      return {
        text: "(Claude returned empty response after retry)",
        durationMs: Date.now() - start,
        truncated: false,
      };
    }

    const durationMs = Date.now() - start;
    const truncated = stdout.length > maxChars;
    try {
      const tokenEst = estimateTokens(fullPrompt.length, stdout.length);
      writeMeterRecord({
        id: meterRecordId(),
        timestamp: new Date().toISOString(),
        provider: "claude",
        model: "claude-code",
        source: "friday-inference",
        agent: null,
        agentSlug: null,
        project: null,
        linkType: null,
        linkId: null,
        tokens: tokenEst,
        durationMs,
        status: "completed",
      });
    } catch { /* Metering failure must never break the brain */ }
    return {
      text: truncated ? stdout.slice(0, maxChars) : stdout,
      durationMs,
      truncated,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (this._available !== null) return this._available;
    try {
      const proc = Bun.spawn([this.config.claudePath, "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const code = await proc.exited;
      this._available = code === 0;
    } catch {
      this._available = false;
    }
    return this._available;
  }

  updateConfig(partial: Partial<ClaudeBrainConfig>): void {
    Object.assign(this.config, partial);
  }
}
