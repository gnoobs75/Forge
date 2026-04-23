#!/usr/bin/env node
// scripts/setup.mjs — Forge cross-platform bootstrap.
//
// Detects missing prereqs (Bun, Xcode CLI on Mac), offers to install them,
// performs idempotent dep installs (root npm + friday/ bun), scaffolds
// hq-data/ via init-hq-data.cjs, copies friday/.env.example to friday/.env,
// and marks the Mac/Linux launcher executable.
//
// Safe to re-run: every step no-ops when already satisfied.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  statSync,
  copyFileSync,
  chmodSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { platform } from "node:os";
import readline from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);

const IS_WINDOWS = platform() === "win32";
const IS_MAC = platform() === "darwin";

const log = (msg) => console.log(`[setup] ${msg}`);
const warn = (msg) => console.warn(`[setup] WARN: ${msg}`);

function checkNodeVersion() {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major < 20) {
    console.error(
      `[setup] FAIL: Node ${process.versions.node} detected; Node 20+ required. ` +
        `Upgrade via nvm/fnm or https://nodejs.org`
    );
    return false;
  }
  return true;
}

function hasCommand(cmd) {
  const probe = spawnSync(IS_WINDOWS ? "where" : "which", [cmd], {
    stdio: "ignore",
  });
  return probe.status === 0;
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function yesOrNo(question) {
  const answer = (await prompt(`${question} [y/N] `)).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

function runCommand(cmd, args, opts = {}) {
  // shell:true on Windows so npm/bun (.cmd shims) resolve correctly.
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: IS_WINDOWS,
    cwd: opts.cwd || REPO_ROOT,
  });
  return result.status === 0;
}

async function ensureBun() {
  if (hasCommand("bun")) return true;

  log("Bun is required but not installed.");
  const install = await yesOrNo("Install Bun now via the official installer?");
  if (!install) {
    log("Install manually:");
    if (IS_WINDOWS) log('  powershell -c "irm bun.sh/install.ps1 | iex"');
    else log("  curl -fsSL https://bun.sh/install | bash");
    return false;
  }

  const ok = IS_WINDOWS
    ? runCommand("powershell", ["-c", "irm bun.sh/install.ps1 | iex"])
    : runCommand("bash", ["-c", "curl -fsSL https://bun.sh/install | bash"]);

  if (!ok) {
    console.error("[setup] FAIL: Bun installer exited non-zero. See output above.");
    return false;
  }

  if (!hasCommand("bun")) {
    log("Bun installed, but not yet on this shell's PATH.");
    log("Open a new terminal and re-run: npm run setup");
    return false;
  }
  return true;
}

async function ensureXcodeCli() {
  if (!IS_MAC) return true;

  const probe = spawnSync("xcode-select", ["-p"], { stdio: "ignore" });
  if (probe.status === 0) return true;

  log("Xcode Command Line Tools are required on Mac (needed to build node-pty).");
  const install = await yesOrNo("Install now? This will pop a GUI installer.");
  if (!install) {
    log("Install manually: xcode-select --install");
    return false;
  }

  log("Launching installer — follow the prompts...");
  spawnSync("xcode-select", ["--install"], { stdio: "inherit" });

  log("Waiting for Xcode CLI install to finish (up to 20 minutes)...");
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const check = spawnSync("xcode-select", ["-p"], { stdio: "ignore" });
    if (check.status === 0) {
      console.log();
      log("Xcode CLI install detected.");
      return true;
    }
    await new Promise((r) => setTimeout(r, 10_000));
    process.stdout.write(".");
  }
  console.log();
  console.error(
    "[setup] FAIL: Xcode CLI install did not complete within 20 minutes. " +
      "Re-run setup once done."
  );
  return false;
}

function needsInstall(dir) {
  const nodeModules = join(dir, "node_modules");
  if (!existsSync(nodeModules)) return true;

  // npm writes node_modules/.package-lock.json only on an actual install.
  // A no-op `npm install` bumps package-lock.json's mtime without updating
  // node_modules/, so compare against the internal marker instead.
  const npmLock = join(dir, "package-lock.json");
  const npmMarker = join(nodeModules, ".package-lock.json");
  if (existsSync(npmLock) && existsSync(npmMarker)) {
    return statSync(npmLock).mtimeMs > statSync(npmMarker).mtimeMs;
  }

  // Bun has no analogous marker, but it does touch node_modules/ on install,
  // so the directory mtime is a reliable comparison point.
  const bunLocks = ["bun.lock", "bun.lockb"]
    .map((f) => join(dir, f))
    .filter(existsSync);
  if (bunLocks.length === 0) return false;

  const nmTime = statSync(nodeModules).mtimeMs;
  return bunLocks.some((lock) => statSync(lock).mtimeMs > nmTime);
}

function installRoot() {
  if (!needsInstall(REPO_ROOT)) {
    log("root deps up to date — skip");
    return true;
  }
  log("Installing root dependencies (npm install)...");
  return runCommand("npm", ["install"]);
}

function installFriday() {
  const fridayDir = join(REPO_ROOT, "friday");
  if (!existsSync(fridayDir)) {
    warn("friday/ directory missing — skipping");
    return true;
  }
  if (!needsInstall(fridayDir)) {
    log("friday deps up to date — skip");
    return true;
  }
  log("Installing friday dependencies (bun install)...");
  return runCommand("bun", ["install"], { cwd: fridayDir });
}

function initHqData() {
  const localProjects = join(REPO_ROOT, "hq-data", "projects");
  const legacyProjects = join(REPO_ROOT, "..", "hq-data", "projects");
  if (existsSync(localProjects) || existsSync(legacyProjects)) {
    log("hq-data already present — skip");
    return true;
  }
  log("Initializing hq-data/ skeleton...");
  return runCommand("node", ["scripts/init-hq-data.cjs"]);
}

function scaffoldEnv() {
  const envPath = join(REPO_ROOT, "friday", ".env");
  const examplePath = join(REPO_ROOT, "friday", ".env.example");
  if (existsSync(envPath)) {
    log("friday/.env already exists — skip");
    return;
  }
  if (!existsSync(examplePath)) {
    warn("friday/.env.example missing — cannot scaffold .env");
    return;
  }
  copyFileSync(examplePath, envPath);
  log("Created friday/.env — edit to add XAI_API_KEY before starting");
}

function markLauncherExecutable() {
  if (IS_WINDOWS) return;
  const launcher = join(REPO_ROOT, "Launch Forge.command");
  if (!existsSync(launcher)) return;
  try {
    chmodSync(launcher, 0o755);
    log("Marked Launch Forge.command executable");
  } catch (err) {
    warn(`Could not chmod launcher: ${err.message}`);
  }
}

async function main() {
  log(`Forge setup on ${platform()}`);

  if (!checkNodeVersion()) {
    process.exit(1);
  }
  if (!(await ensureBun())) {
    process.exit(1);
  }
  if (!(await ensureXcodeCli())) {
    process.exit(1);
  }
  if (!installRoot()) {
    console.error("[setup] FAIL: root npm install failed");
    process.exit(1);
  }
  if (!installFriday()) {
    console.error("[setup] FAIL: friday bun install failed");
    process.exit(1);
  }
  if (!initHqData()) {
    console.error("[setup] FAIL: hq-data init failed");
    process.exit(1);
  }
  scaffoldEnv();
  markLauncherExecutable();

  log("");
  log("Setup complete. Next: npm run dev (or double-click Launch Forge)");
}

main().catch((err) => {
  console.error("[setup] Unexpected error:", err);
  process.exit(1);
});
