import { describe, it, expect } from "bun:test";
import { validateToken, createAuthChecker } from "../../src/server/auth.ts";

describe("validateToken", () => {
  it("returns true for matching token", () => {
    expect(validateToken("secret123", "secret123")).toBe(true);
  });

  it("returns false for mismatched token", () => {
    expect(validateToken("secret123", "wrong")).toBe(false);
  });

  it("returns false for empty token", () => {
    expect(validateToken("secret123", "")).toBe(false);
  });

  it("returns false for null/undefined token", () => {
    expect(validateToken("secret123", undefined)).toBe(false);
  });

  it("uses timing-safe comparison", () => {
    expect(validateToken("secret123", "secret124")).toBe(false);
    expect(validateToken("secret123", "x")).toBe(false);
  });
});

describe("createAuthChecker", () => {
  it("allows all requests when no remote token configured", () => {
    const check = createAuthChecker(undefined);
    expect(check(new Request("http://localhost:3100/ws"))).toBe(true);
  });

  it("allows localhost origins when remote token set", () => {
    const check = createAuthChecker("secret");
    const req = new Request("http://localhost:3100/ws", {
      headers: { origin: "http://localhost:3100" },
    });
    expect(check(req)).toBe(true);
  });

  it("requires token for non-localhost origins", () => {
    const check = createAuthChecker("secret");
    const req = new Request("https://friday.example.com/ws?token=secret", {
      headers: { origin: "https://friday.example.com" },
    });
    expect(check(req)).toBe(true);
  });

  it("rejects non-localhost without token", () => {
    const check = createAuthChecker("secret");
    const req = new Request("https://friday.example.com/ws", {
      headers: { origin: "https://friday.example.com" },
    });
    expect(check(req)).toBe(false);
  });

  it("accepts token in Authorization header", () => {
    const check = createAuthChecker("secret");
    const req = new Request("https://friday.example.com/ws", {
      headers: {
        origin: "https://friday.example.com",
        Authorization: "Bearer secret",
      },
    });
    expect(check(req)).toBe(true);
  });

  it("rejects non-localhost origin when no remote token configured", () => {
    const check = createAuthChecker(undefined);
    const req = new Request("https://friday.example.com/ws", {
      headers: { origin: "https://friday.example.com" },
    });
    expect(check(req)).toBe(false);
  });

  it("treats no Origin header as localhost (Electron / curl)", () => {
    const check = createAuthChecker("secret");
    // No origin header — intentional bypass for non-browser callers
    const req = new Request("http://localhost:3100/ws");
    expect(check(req)).toBe(true);
  });

  it("rejects wrong token in Authorization header", () => {
    const check = createAuthChecker("secret");
    const req = new Request("https://friday.example.com/ws", {
      headers: {
        origin: "https://friday.example.com",
        Authorization: "Bearer wrongtoken",
      },
    });
    expect(check(req)).toBe(false);
  });
});
