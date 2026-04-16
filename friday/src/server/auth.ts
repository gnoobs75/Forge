import { timingSafeEqual } from "node:crypto";

const LOCALHOST_ORIGINS = new Set([
  "http://localhost:3100",
  "http://localhost:5173",
  "http://localhost:5180",
  "http://127.0.0.1:3100",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5180",
]);

export function validateToken(
  expected: string,
  provided: string | undefined | null,
): boolean {
  if (!provided || !expected) return false;
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

function extractToken(req: Request): string | null {
  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

function isLocalhost(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin && LOCALHOST_ORIGINS.has(origin)) return true;
  // No Origin header means the request came from a non-browser context (Electron
  // main process, curl during local dev, etc.) — treat as localhost by design.
  if (!origin) return true;
  return false;
}

export type AuthChecker = (req: Request) => boolean;

export function createAuthChecker(remoteToken: string | undefined): AuthChecker {
  if (!remoteToken) {
    return (req: Request) => {
      const origin = req.headers.get("origin");
      if (origin && !LOCALHOST_ORIGINS.has(origin)) return false;
      return true;
    };
  }
  return (req: Request) => {
    if (isLocalhost(req)) return true;
    const token = extractToken(req);
    return validateToken(remoteToken, token);
  };
}
