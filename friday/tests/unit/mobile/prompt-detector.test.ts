// friday/tests/unit/mobile/prompt-detector.test.ts
import { describe, test, expect } from "bun:test";
import { detectPrompt } from "../../../src/modules/mobile/prompt-detector.ts";

describe("detectPrompt", () => {
  test("detects yes/no binary prompt", () => {
    const output = "I've implemented the changes.\n\nDo you want me to proceed? (yes/no)";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("binary");
    expect(result!.options).toContain("Yes");
    expect(result!.options).toContain("No");
  });

  test("detects y/n binary prompt", () => {
    const output = "Apply these changes? (y/n)";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("binary");
  });

  test("detects proceed/continue binary prompt", () => {
    const output = "Ready to deploy.\n\nShould I continue?";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("binary");
  });

  test("detects Claude Code permission prompt", () => {
    const output = "Claude wants to run: bash ls -la\n\nAllow? (y/n/yes, and never ask again)";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("permission");
    expect(result!.options).toContain("Allow");
    expect(result!.options).toContain("Deny");
    expect(result!.options).toContain("Yes, never ask again");
  });

  test("detects numbered option list", () => {
    const output = "Which approach?\n\n1. Simple REST API\n2. GraphQL endpoint\n3. WebSocket stream";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("numbered");
    expect(result!.options).toEqual(["1", "2", "3"]);
  });

  test("detects numbered options with parentheses", () => {
    const output = "Select:\n1) First option\n2) Second option";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("numbered");
    expect(result!.options).toEqual(["1", "2"]);
  });

  test("returns null for non-prompt output", () => {
    const output = "Building project...\nCompiling 42 files\nDone in 3.2s";
    const result = detectPrompt(output);
    expect(result).toBeNull();
  });

  test("returns null for question without options", () => {
    const output = "What should I name the component?";
    const result = detectPrompt(output);
    expect(result).toBeNull();
  });

  test("handles ANSI escape codes in output", () => {
    const output = "\x1b[1m\x1b[33mDo you want to proceed?\x1b[0m (yes/no)";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("binary");
  });

  test("uses last chunk of output for detection", () => {
    const output = "Line 1\nLine 2\nLine 3\nProceed? (y/n)";
    const result = detectPrompt(output);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("binary");
  });
});
