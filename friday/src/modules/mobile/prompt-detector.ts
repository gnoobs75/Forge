// friday/src/modules/mobile/prompt-detector.ts
import type { DetectedPrompt } from "./types.ts";

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function lastLines(output: string, n = 10): string {
  const lines = output.trim().split("\n");
  return lines.slice(-n).join("\n");
}

const BINARY_PATTERNS = [
  /\(yes\/no\)/i,
  /\(y\/n\)/i,
  /\bproceed\s*\?/i,
  /\bcontinue\s*\?/i,
  /\bdo you want to\b/i,
  /^\s*should I\b.*\?/im,
];

const PERMISSION_PATTERNS = [
  /\ballow\b.*\b(?:y\/n|yes.*never ask again)\b/i,
  /\bnever ask again\b/i,
  /wants to (?:run|execute|read|write|edit).*\ballow\b/i,
];

const NUMBERED_PATTERN = /^\s*(\d+)[.)]\s+\S/;

export function detectPrompt(rawOutput: string): DetectedPrompt | null {
  const clean = stripAnsi(rawOutput);
  const tail = lastLines(clean);

  for (const pattern of PERMISSION_PATTERNS) {
    if (pattern.test(tail)) {
      return {
        type: "permission",
        options: ["Allow", "Deny", "Yes, never ask again"],
        promptText: tail.split("\n").slice(-3).join("\n").trim(),
      };
    }
  }

  for (const pattern of BINARY_PATTERNS) {
    if (pattern.test(tail)) {
      return {
        type: "binary",
        options: ["Yes", "No"],
        promptText: tail.split("\n").slice(-2).join("\n").trim(),
      };
    }
  }

  const lines = tail.split("\n");
  const numberedLines: string[] = [];
  for (const line of lines) {
    const match = line.match(NUMBERED_PATTERN);
    if (match) numberedLines.push(match[1]);
  }
  if (numberedLines.length >= 2) {
    return {
      type: "numbered",
      options: numberedLines,
      promptText: tail.trim(),
    };
  }

  return null;
}
