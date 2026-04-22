# Forge Mac Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a cross-platform bootstrap so a fresh `git clone` of Forge runs on Mac with one command (or one double-click) while Windows keeps working unchanged.

**Architecture:** Node-only setup orchestrator (`scripts/setup.mjs`) detects prereqs (Bun, Xcode CLI), offers installs interactively, performs idempotent dep installs (root `npm` + `friday/` `bun`), scaffolds `hq-data/` via the existing `init-hq-data.cjs`, and copies `friday/.env.example` → `friday/.env` if missing. Two double-click launchers (`Launch Forge.command` / `Launch Forge.bat`) handle the Node bootstrap (since `setup.mjs` needs Node to run) and chain setup + dev on first run. VS Code tasks expose the same flow inside the editor. `.nvmrc` and a `package.json` `engines` field pin Node 20.

**Tech Stack:** Node 20 built-ins (`child_process`, `fs`, `path`, `os`, `readline`), bash (Mac launcher), batch (Windows launcher), JSON (VS Code config).

**Reference spec:** `docs/superpowers/specs/2026-04-21-forge-mac-bootstrap-design.md`

**Platform note:** The developer's current machine is Windows. Every task here runs on Windows. Mac verification is a manual, user-owned handoff captured in Task 7.

**Testing note:** Forge has no vitest/jest/playwright harness. Verification per task is (a) `node --check` for `.mjs` files, (b) `npx jsonlint` or `node -e 'JSON.parse(...)'` for JSON, (c) explicit Windows smoke test in Task 6, (d) commit + push.

---

### Task 1: Create `scripts/setup.mjs`

**Files:**
- Create: `scripts/setup.mjs`

- [ ] **Step 1: Write the setup orchestrator**

Create `scripts/setup.mjs` with this exact content:

```javascript
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

  const lockFiles = ["package-lock.json", "bun.lock", "bun.lockb"]
    .map((f) => join(dir, f))
    .filter(existsSync);

  if (lockFiles.length === 0) return false;

  const nmTime = statSync(nodeModules).mtimeMs;
  return lockFiles.some((lock) => statSync(lock).mtimeMs > nmTime);
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
```

- [ ] **Step 2: Syntax-check the script**

Run: `node --check scripts/setup.mjs`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/setup.mjs
git commit -m "feat(setup): add cross-platform bootstrap (scripts/setup.mjs)"
```

---

### Task 2: Create double-click launchers

**Files:**
- Create: `Launch Forge.command`
- Create: `Launch Forge.bat`

- [ ] **Step 1: Write `Launch Forge.command`** (Mac/Linux)

Create `Launch Forge.command` with this exact content:

```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"

# Node bootstrap — the only prereq setup.mjs cannot check from inside Node.
if ! command -v node >/dev/null 2>&1; then
  echo "Node is required but not installed."
  if command -v brew >/dev/null 2>&1; then
    read -rp "Install Node 20 via Homebrew? [y/N] " reply
    if [[ "$reply" =~ ^[Yy] ]]; then
      brew install node@20 && brew link --overwrite node@20
    else
      echo "Install Node from https://nodejs.org, then re-run."
      exit 1
    fi
  else
    echo "Install Homebrew (https://brew.sh) then Node, or download Node from https://nodejs.org"
    exit 1
  fi
fi

# First-run detection: missing deps OR missing .env means setup hasn't run.
if [ ! -d "node_modules" ] || [ ! -f "friday/.env" ]; then
  node scripts/setup.mjs || exit 1
fi

npm run dev
```

- [ ] **Step 2: Write `Launch Forge.bat`** (Windows)

Create `Launch Forge.bat` with this exact content:

```batch
@echo off
cd /d "%~dp0"

where node >nul 2>&1
if not errorlevel 1 goto :node_ok

echo Node is required but not installed.
where winget >nul 2>&1
if errorlevel 1 goto :node_manual

set /p REPLY=Install Node 20 LTS via winget? [y/N] 
if /i "%REPLY%"=="y" goto :winget_install
goto :node_manual

:winget_install
winget install OpenJS.NodeJS.LTS
goto :node_ok

:node_manual
echo Download Node from https://nodejs.org, then re-run.
exit /b 1

:node_ok
if not exist "node_modules" goto :setup
if not exist "friday\.env" goto :setup
goto :dev

:setup
node scripts\setup.mjs
if errorlevel 1 exit /b 1

:dev
npm run dev
```

- [ ] **Step 3: Verify the `.bat` parses** (Windows only)

Run: `cmd //c "Launch Forge.bat" --help 2>&1 | head -5`

This won't actually "run" meaningfully (no `--help` flag exists), but `cmd` will refuse to execute a `.bat` with a syntax error. Expected: either the script begins executing the first `where node` branch, or it prints an error from one of our `echo` lines. A parse error would print "The syntax of the command is incorrect" or similar.

Alternative low-risk check — open the `.bat` in Notepad and eyeball for literal CRLF vs LF line endings (batch files require CRLF on Windows). If git has normalized it to LF, fix with:

```bash
unix2dos "Launch Forge.bat" 2>/dev/null || true
```

(If `unix2dos` is missing, skip — git's autocrlf on Windows usually handles this.)

- [ ] **Step 4: Commit**

```bash
git add "Launch Forge.command" "Launch Forge.bat"
git commit -m "feat(setup): add double-click launchers (Mac .command + Windows .bat)"
```

---

### Task 3: Create VS Code config and `.nvmrc`

**Files:**
- Create: `.nvmrc`
- Create: `.vscode/tasks.json`
- Create: `.vscode/launch.json`

- [ ] **Step 1: Write `.nvmrc`**

Create `.nvmrc` with exactly this content (one line, no quotes, trailing newline):

```
20
```

- [ ] **Step 2: Write `.vscode/tasks.json`**

Create `.vscode/tasks.json` with this exact content:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Forge: Setup",
      "type": "shell",
      "command": "node scripts/setup.mjs",
      "presentation": { "reveal": "always", "panel": "dedicated" },
      "problemMatcher": []
    },
    {
      "label": "Forge: Dev",
      "type": "npm",
      "script": "dev",
      "presentation": { "reveal": "always", "panel": "dedicated" },
      "problemMatcher": []
    },
    {
      "label": "Forge: First Run",
      "dependsOn": ["Forge: Setup", "Forge: Dev"],
      "dependsOrder": "sequence"
    }
  ]
}
```

- [ ] **Step 3: Write `.vscode/launch.json`**

Create `.vscode/launch.json` with this exact content:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Electron",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "runtimeArgs": ["."],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal"
    }
  ]
}
```

- [ ] **Step 4: Validate JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('.vscode/tasks.json','utf8')); JSON.parse(require('fs').readFileSync('.vscode/launch.json','utf8')); console.log('ok')"
```
Expected output: `ok`

- [ ] **Step 5: Commit**

```bash
git add .nvmrc .vscode/tasks.json .vscode/launch.json
git commit -m "feat(setup): add .nvmrc and VS Code tasks/launch config"
```

---

### Task 4: Modify `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `setup` script and `engines` field**

Current `scripts` block is:

```json
"scripts": {
  "dev": "electron .",
  "build": "vite build && electron-builder",
  "vite": "vite",
  "electron": "electron .",
  "init:hq-data": "node scripts/init-hq-data.cjs",
  "friday:setup": "bash friday-module/setup.sh",
  "test": "vitest run",
  "test:watch": "vitest"
},
```

Make two edits to `package.json`:

**Edit A**: Add `"setup": "node scripts/setup.mjs"` as the first script in the `scripts` block:

```json
"scripts": {
  "setup": "node scripts/setup.mjs",
  "dev": "electron .",
  "build": "vite build && electron-builder",
  "vite": "vite",
  "electron": "electron .",
  "init:hq-data": "node scripts/init-hq-data.cjs",
  "friday:setup": "bash friday-module/setup.sh",
  "test": "vitest run",
  "test:watch": "vitest"
},
```

**Edit B**: Add an `engines` field immediately after the `scripts` block (before `dependencies`):

```json
"engines": {
  "node": ">=20"
},
```

- [ ] **Step 2: Validate JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('ok')"
```
Expected output: `ok`

- [ ] **Step 3: Verify the script runs**

Run: `npm run setup -- --help 2>&1 | head -3` (we haven't wired `--help`, but this verifies npm resolves the script and Node can start it.)

Expected: at minimum, you see the `[setup] Forge setup on win32` banner before any error. If you see `Missing script: "setup"`, Edit A wasn't applied correctly.

Abort the run with Ctrl+C before it prompts for Bun install — this is just a wiring check.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat(setup): add npm setup script and engines.node constraint"
```

---

### Task 5: Update `README.md` quickstart

**Files:**
- Modify (or create): `README.md`

- [ ] **Step 1: Check if README exists**

Run: `ls README.md 2>/dev/null`

If the file exists, open it and **prepend** the quickstart block below to the top of the file (above the existing content). If it does not exist, create it with just the quickstart block plus a `# The Forge` title line.

- [ ] **Step 2: Write the quickstart block**

Block to insert (either at top of existing README or as the full body of a new one, with `# The Forge\n\n` title prepended if new):

```markdown
## Quick start

- **Double-click:** `Launch Forge.command` (Mac) or `Launch Forge.bat` (Windows)
- **CLI:** `npm run setup && npm run dev`
- **VS Code:** `Cmd+Shift+P` → `Run Task` → `Forge: First Run`

Requires Node 20+. The first run will prompt to install missing prereqs (Bun, and on Mac, Xcode Command Line Tools).
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add quickstart section to README"
```

---

### Task 6: Windows dry-run verification

**Files:** none modified; this is a smoke test.

The goal of this task is to prove `setup.mjs` doesn't regress the current Windows dev loop and that idempotency holds. Do NOT delete real `node_modules/` — we rename so rollback is instant.

- [ ] **Step 1: Run setup on the current (already-installed) state**

Run: `npm run setup`

Expected output (in order, roughly):
```
[setup] Forge setup on win32
[setup] root deps up to date — skip
[setup] friday deps up to date — skip
[setup] hq-data already present — skip
[setup] friday/.env already exists — skip
[setup]
[setup] Setup complete. Next: npm run dev (or double-click Launch Forge)
```

Exit code 0. If Bun is missing and setup prompts, answer `n` — this isn't what we're testing here.

- [ ] **Step 2: Simulate fresh-clone by renaming `node_modules/`**

Run:
```bash
mv node_modules node_modules.bak
mv friday/node_modules friday/node_modules.bak
```

- [ ] **Step 3: Re-run setup and observe real install path**

Run: `npm run setup`

Expected: both installs run. `root deps` and `friday deps` lines appear without the `— skip` suffix. Setup exits 0.

- [ ] **Step 4: Launch Electron to verify end-to-end**

Run: `npm run dev`

Expected: Electron window opens as it does today. Close it with Ctrl+C.

- [ ] **Step 5: Restore original node_modules**

Rather than keeping the freshly-installed ones, swap back to the original to avoid any drift:

```bash
rm -rf node_modules friday/node_modules
mv node_modules.bak node_modules
mv friday/node_modules.bak friday/node_modules
```

- [ ] **Step 6: Run setup once more to confirm idempotency after restore**

Run: `npm run setup`

Expected: all steps skip again. Exit 0.

- [ ] **Step 7: No commit**

This task produces no file changes. If verification passed, proceed. If anything failed, file a follow-up fix task referencing the failure output.

---

### Task 7: Push to remote and hand off Mac verification

**Files:** none; this is a ship step.

- [ ] **Step 1: Review the full commit set**

Run: `git log --oneline origin/main..HEAD`

Expected: commits from Tasks 1–5 (roughly 5 commits). Confirm none are stray.

- [ ] **Step 2: Push to origin/main**

Run: `git push origin main`

Expected: push succeeds, ~5 commits land on `origin/main`.

- [ ] **Step 3: Write a Mac-verification checklist for the user**

Output the following block to the user so they can execute it on their Mac when they get there:

```
Mac verification checklist (user-owned, runs on the Mac):

1. git clone https://github.com/gnoobs75/Forge.git
   cd Forge

2. Option A — Double-click in Finder:
   - Open Finder, navigate to the Forge folder
   - Right-click "Launch Forge.command" → Open (first time, bypasses Gatekeeper)
   - Terminal opens; follow any prereq prompts (Homebrew/Node if missing, then Bun, then Xcode CLI)

   Option B — Terminal:
   - chmod +x "Launch Forge.command"   # one-time
   - ./Launch\ Forge.command
   OR:
   - npm run setup
   - npm run dev

   Option C — VS Code:
   - open -a "Visual Studio Code" .
   - Cmd+Shift+P → "Run Task" → "Forge: First Run"

3. Edit friday/.env and set XAI_API_KEY before Electron tries to talk to Friday.

4. Report back any failures with the full [setup] ... output.
```

- [ ] **Step 4: Done**

Mark this plan complete. No further commits until Mac feedback arrives.

---

## Spec coverage self-check

Against the spec's File footprint table:

| Spec file | Task |
|---|---|
| `scripts/setup.mjs` | Task 1 |
| `Launch Forge.command` | Task 2 |
| `Launch Forge.bat` | Task 2 |
| `.nvmrc` | Task 3 |
| `.vscode/tasks.json` | Task 3 |
| `.vscode/launch.json` | Task 3 |
| `package.json` (modify) | Task 4 |
| `README.md` (modify) | Task 5 |

All eight files covered. Testing strategy from spec (syntax check, Windows dry-run, idempotency, prereq prompt) maps to Task 1 Step 2, Task 6, and implicit in Task 1's code (prompt path is user-exercisable any time `bun` is missing).

Spec risks covered:
- Xcode CLI GUI + 20-minute timeout: handled in `ensureXcodeCli` polling loop.
- Homebrew absent: handled in launcher's `command -v brew` branch.
- VS Code task naming: `Forge:` prefix used consistently.
- Open question on placeholder `XAI_API_KEY` detection: deferred per spec.
