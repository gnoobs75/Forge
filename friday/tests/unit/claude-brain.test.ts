import { describe, it, expect } from "bun:test";
import { ClaudeBrain, type ClaudeBrainConfig } from "../../src/core/claude-brain.ts";

const DEFAULTS: ClaudeBrainConfig = {
  timeout: 60,
  claudePath: "claude",
  maxOutputChars: 32000,
};

describe("ClaudeBrain", () => {
  describe("reason()", () => {
    it("returns response text and duration", async () => {
      const brain = new ClaudeBrain(DEFAULTS);
      const originalSpawn = Bun.spawn;
      const mockProc = {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("Analysis result here"));
            controller.close();
          },
        }),
        stderr: new ReadableStream({ start(c) { c.close(); } }),
        exited: Promise.resolve(0),
        kill: () => {},
        pid: 12345,
      };
      // @ts-expect-error — mock override
      Bun.spawn = () => mockProc;

      const result = await brain.reason("analyze this", "<system>test</system>");

      expect(result.text).toBe("Analysis result here");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.truncated).toBe(false);

      Bun.spawn = originalSpawn;
    });

    it("truncates output exceeding maxOutputChars", async () => {
      const brain = new ClaudeBrain({ ...DEFAULTS, maxOutputChars: 10 });
      const originalSpawn = Bun.spawn;
      const mockProc = {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("A very long response that exceeds the limit"));
            controller.close();
          },
        }),
        stderr: new ReadableStream({ start(c) { c.close(); } }),
        exited: Promise.resolve(0),
        kill: () => {},
        pid: 12345,
      };
      // @ts-expect-error — mock override
      Bun.spawn = () => mockProc;

      const result = await brain.reason("test", "");
      expect(result.text.length).toBeLessThanOrEqual(10);
      expect(result.truncated).toBe(true);

      Bun.spawn = originalSpawn;
    });

    it("handles non-zero exit code", async () => {
      const brain = new ClaudeBrain(DEFAULTS);
      const originalSpawn = Bun.spawn;
      const mockProc = {
        stdout: new ReadableStream({ start(c) { c.close(); } }),
        stderr: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("Error: something failed"));
            controller.close();
          },
        }),
        exited: Promise.resolve(1),
        kill: () => {},
        pid: 12345,
      };
      // @ts-expect-error — mock override
      Bun.spawn = () => mockProc;

      const result = await brain.reason("test", "");
      expect(result.text).toContain("Error");

      Bun.spawn = originalSpawn;
    });

    it("returns timeout message when process exceeds timeout", async () => {
      const brain = new ClaudeBrain({ ...DEFAULTS, timeout: 1 }); // 1 second timeout
      const originalSpawn = Bun.spawn;
      let stdoutController: ReadableStreamDefaultController<Uint8Array>;
      const mockProc = {
        stdout: new ReadableStream({
          start(controller) {
            stdoutController = controller;
            controller.enqueue(new TextEncoder().encode("Partial output"));
            // Don't close — simulates hanging process
          },
        }),
        stderr: new ReadableStream({ start(c) { c.close(); } }),
        exited: new Promise(() => {}), // Never resolves
        kill: () => { stdoutController?.close(); }, // Close stream on kill
        pid: 12345,
      };
      // @ts-expect-error — mock override
      Bun.spawn = () => mockProc;

      const result = await brain.reason("test", "");
      expect(result.truncated).toBe(true);
      expect(result.text).toContain("timeout");

      Bun.spawn = originalSpawn;
    });

    it("retries once on empty response then returns fallback", async () => {
      const brain = new ClaudeBrain(DEFAULTS);
      const originalSpawn = Bun.spawn;
      let callCount = 0;
      // @ts-expect-error — mock override
      Bun.spawn = () => {
        callCount++;
        return {
          stdout: new ReadableStream({ start(c) { c.close(); } }), // empty
          stderr: new ReadableStream({ start(c) { c.close(); } }),
          exited: Promise.resolve(0),
          kill: () => {},
          pid: 12345,
        };
      };

      const result = await brain.reason("test", "");
      expect(callCount).toBe(2); // Initial + 1 retry
      expect(result.text).toContain("empty");

      Bun.spawn = originalSpawn;
    });
  });

  describe("isAvailable()", () => {
    it("returns true when claude CLI responds", async () => {
      const brain = new ClaudeBrain(DEFAULTS);
      const originalSpawn = Bun.spawn;
      const mockProc = {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("1.0.0"));
            controller.close();
          },
        }),
        stderr: new ReadableStream({ start(c) { c.close(); } }),
        exited: Promise.resolve(0),
        kill: () => {},
        pid: 12345,
      };
      // @ts-expect-error — mock override
      Bun.spawn = () => mockProc;

      const available = await brain.isAvailable();
      expect(available).toBe(true);

      Bun.spawn = originalSpawn;
    });
  });

  describe("buildPrompt()", () => {
    it("prepends system context to user message", () => {
      const brain = new ClaudeBrain(DEFAULTS);
      const prompt = brain.buildPrompt("what is 2+2", "<system>\nYou are Friday\n</system>");
      expect(prompt).toContain("<system>");
      expect(prompt).toContain("You are Friday");
      expect(prompt).toContain("what is 2+2");
    });
  });
});
