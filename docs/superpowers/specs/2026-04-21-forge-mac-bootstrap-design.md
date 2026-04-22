# Forge Mac Bootstrap — Design Spec

## Overview

A one-command, cross-platform bootstrap that makes a fresh `git clone` of Forge run on Mac (and continue running on Windows) with minimal ceremony. Developer experience targets: double-click a file in Finder/Explorer, or run `npm run setup && npm run dev` in a terminal, or `Cmd+Shift+P → Run Task` in VS Code — any of the three should work.

## Problem

Today, bringing up Forge on a fresh machine requires:

1. `npm install` at repo root (Electron + renderer)
2. `cd friday && bun install` (Friday runtime uses Bun, not Node)
3. `npm run init:hq-data` to scaffold `hq-data/` skeleton
4. Manually copy `friday/.env.example` → `friday/.env` and add `XAI_API_KEY`
5. Install prereqs by hand: Node 20+, Bun, Xcode Command Line Tools (Mac, needed to build `node-pty`)

There is no setup script, no `.nvmrc`, no `engines` field, no launcher, and no VS Code task config. Existing contributors memorize the steps; newcomers bounce.

Additionally, the portability audit (2026-04-21) confirmed Forge's source code is already Mac-safe — no hardcoded Windows paths, no platform-only code in critical paths, and the `hq-data` resolver already supports both `{Forge}/hq-data` (fresh) and `{Forge}/../hq-data` (legacy Samurai sibling) layouts. The remaining work is purely bootstrap, not refactoring.

## Goals

- `git clone` → one command (or one double-click) → working Electron app.
- Cross-platform: Mac is the new target, Windows must keep working identically.
- Idempotent: safe to re-run after partial success, no destructive side effects.
- Friendly: prompts to install missing prereqs where possible; never silent failure.
- Additive: no changes to existing runtime code, only new scripts and config.

## Non-goals

- Installing `mobile/` dependencies — out of scope per brainstorm. Mobile stays untouched; a separate `setup:mobile` can be added later.
- Auto-configuring `XAI_API_KEY` — we scaffold `friday/.env` from the committed `.env.example`, user still edits it to add keys.
- Replacing `init-hq-data.cjs` — we call it, don't rewrite it.
- Building a production installer (`.dmg`, `.msi`, `.pkg`). This is a dev bootstrap, not a release artifact.
- Adding a Friday-attach debug launch config. Friday runs inside Electron as a subprocess; defer until a real need appears.
- CI pipelines, hermetic builds, Nix flakes, or Docker. Out of scope.

## Decisions from brainstorm

| Question | Choice |
|---|---|
| What does "start" launch? | **Electron only** (Friday subprocess auto-starts inside Electron as today). Mobile excluded. |
| Setup and start separate? | **Two explicit commands** — `npm run setup` (idempotent) + `npm run dev`. Launchers chain them. |
| Setup script shape? | **Cross-platform Node script** (`scripts/setup.mjs`) + VS Code task layer. No bash. |
| Prereq handling? | **Detect + offer to install** — prompt user `[y/N]`, run official installer, re-verify. Fall back to printed instructions on decline or failure. |
| Double-click launcher? | **Yes, both platforms** — `Launch Forge.command` for Mac, `Launch Forge.bat` for Windows. |

## File footprint

| File | Action | Purpose |
|---|---|---|
| `scripts/setup.mjs` | new | Cross-platform bootstrap orchestrator. |
| `Launch Forge.command` | new | Mac/Linux double-click entry. Wraps Node presence check + `setup` + `dev`. |
| `Launch Forge.bat` | new | Windows double-click entry. Same shape as `.command`. |
| `.nvmrc` | new | Pins Node 20 for `nvm` / `fnm` / `volta` users. |
| `.vscode/tasks.json` | new | "Forge: Setup", "Forge: Dev", "Forge: First Run" tasks. |
| `.vscode/launch.json` | new | "Launch Electron" debug configuration. |
| `package.json` | modify | Add `"setup"` script and `"engines": { "node": ">=20" }`. |
| `README.md` | modify (create if missing) | Three-line quickstart. |

No existing runtime code changes. No modifications to `electron/main.cjs`, `friday/`, or `mobile/`.

## Component: `scripts/setup.mjs`

A single `.mjs` file, ~150–200 lines, runnable as `node scripts/setup.mjs`. Uses only Node's built-in modules (`child_process`, `fs`, `path`, `os`, `readline`).

### Execution flow

```
1. Print banner + detected platform (darwin / win32 / linux)

2. Prereq checks (collect results, offer installs one at a time):
   - Node ≥ 20          (always verified since we're running on Node; if < 20 → hard fail with upgrade instructions)
   - Bun present        → on missing, prompt offer (see "Prereq install offers")
   - Xcode CLI (Mac)    → on missing, prompt offer
   - git                → skipped; clone implies git present

3. Root install:
   - If node_modules/ missing OR package-lock.json newer than node_modules/.package-lock.json → `npm install` (stdio inherited)
   - Else: skip with "[setup] root deps up to date"

4. Friday install:
   - Same freshness check in friday/ → `bun install`

5. hq-data init:
   - If hq-data/projects/ exists → skip
   - Else → spawn `node scripts/init-hq-data.cjs`

6. Friday .env scaffold:
   - If friday/.env missing AND friday/.env.example exists → copy, print "[setup] Created friday/.env — edit to add XAI_API_KEY"
   - Else: skip (never overwrite existing .env)

7. Mark launcher executable (Mac/Linux only):
   - chmod +x "Launch Forge.command" if not already

8. Final summary:
   - List steps that ran, steps skipped, steps failed
   - Next step: "Run: npm run dev" (or double-click Launch Forge.command)
   - Exit 0 on success, non-zero on any fatal error
```

### Prereq install offers

Each missing prereq triggers an interactive prompt:

```
[setup] Bun is required but not installed.
        Install Bun now via the official installer? [y/N]
```

On `y`: run the installer, stream output, re-verify after. On failure or decline: print the manual install command and exit.

| Prereq | macOS install | Windows install | Fallback |
|---|---|---|---|
| Bun | `curl -fsSL https://bun.sh/install \| bash` | `powershell -c "irm bun.sh/install.ps1 \| iex"` | Print URL: https://bun.sh |
| Xcode CLI | `xcode-select --install` (pops GUI; we wait for completion) | N/A | Print instructions |
| Node | **Not handled in setup.mjs** — see launcher section | | |

### Error handling

| Failure | Response |
|---|---|
| Prereq declined or failed to install | Print exact manual command, exit non-zero. Re-run after manual fix. |
| `npm install` fails | Stream error live, exit non-zero. |
| `bun install` fails | Same. |
| `init-hq-data.cjs` crashes | Same. |
| `friday/.env.example` missing | Warn and continue — not fatal; user can still run manually. |
| Re-run after partial success | Completed steps no-op via freshness checks; failed step retries from scratch. |
| Re-run after full success | All steps no-op. |

### Idempotency guarantees

- Never overwrites `friday/.env`.
- Never re-runs `npm install` if `node_modules/` is up-to-date relative to `package-lock.json` mtime.
- Never re-runs `init-hq-data.cjs` if `hq-data/projects/` exists.
- `chmod +x` on the launcher is a no-op if the bit is already set.

## Component: `Launch Forge.command` (Mac/Linux)

Double-clickable from Finder. macOS recognizes `.command` extension and opens Terminal, runs the script, leaves Terminal window open on exit for inspection.

```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"

# Node bootstrap — the only prereq we can't check from setup.mjs
if ! command -v node >/dev/null 2>&1; then
  echo "Node is required but not installed."
  if command -v brew >/dev/null 2>&1; then
    read -rp "Install Node 20 via Homebrew? [y/N] " reply
    if [[ "$reply" =~ ^[Yy] ]]; then
      brew install node@20 && brew link --overwrite node@20
    else
      echo "Install Node from https://nodejs.org, then re-run."; exit 1
    fi
  else
    echo "Install Homebrew (https://brew.sh) then Node, or download Node from https://nodejs.org"; exit 1
  fi
fi

# First-run detection: missing deps OR missing .env means setup hasn't run
if [ ! -d "node_modules" ] || [ ! -f "friday/.env" ]; then
  node scripts/setup.mjs || exit 1
fi

npm run dev
```

**One-time chmod:** The `x` bit is preserved by git (via `core.fileMode`), so after the first `setup.mjs` run (which `chmod +x`es the launcher), it stays executable forever. The initial paper cut is a single `chmod +x "Launch Forge.command"` or one `npm run setup` invocation.

## Component: `Launch Forge.bat` (Windows)

Parallel structure, PowerShell-assisted for the interactive `winget` offer.

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

Control flow uses `goto` labels to avoid nested `if` blocks with `%var%` expansion timing issues — `set /p` inside a paren block followed by `%REPLY%` expands at parse-time and reads empty, which is a classic `.bat` gotcha.

## Component: `.vscode/tasks.json`

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

## Component: `.vscode/launch.json`

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

No "Attach to Friday" configuration — Friday is launched as a subprocess by Electron main; its logs stream into Electron's console. Add later if and when an attach workflow is actually needed.

## `package.json` modifications

```json
{
  "scripts": {
    "setup": "node scripts/setup.mjs",
    "dev": "electron .",
    // ... existing scripts untouched
  },
  "engines": {
    "node": ">=20"
  }
}
```

The `engines` field is advisory (warns on `npm install` if mismatched); the hard enforcement happens inside `setup.mjs`.

## `.nvmrc`

```
20
```

Single line, consumed by `nvm`, `fnm`, and `volta`. Independent of the `engines` check.

## README quickstart

Three lines replace or prepend any existing setup prose:

```markdown
## Quick start

- **Double-click:** `Launch Forge.command` (Mac) or `Launch Forge.bat` (Windows)
- **CLI:** `npm run setup && npm run dev`
- **VS Code:** `Cmd+Shift+P` → `Run Task` → `Forge: First Run`
```

## Testing strategy

Per user memory, Forge has no vitest/jest/playwright harness. Verification is:

1. **Syntax checks:** `node --check scripts/setup.mjs` after authoring.
2. **Windows dry-run:** after implementation, simulate fresh clone by:
   - Renaming `node_modules/` and `friday/node_modules/` aside
   - Running `npm run setup`
   - Verifying `npm run dev` launches Electron successfully
   - Restoring moved directories afterward
3. **Mac verification:** user runs on their target Mac to confirm. Not reproducible from Windows dev box.
4. **Idempotency check:** run `npm run setup` twice in a row, confirm second run is all skips.
5. **Prereq prompt path:** manually unset `PATH` to hide `bun`, run `setup.mjs`, confirm prompt appears and declining prints instructions cleanly.

## Risks and open questions

**Risk: Xcode CLI install is interactive via GUI.** `xcode-select --install` pops an Apple-signed GUI installer the user must click through, and can take 5–15 minutes. `setup.mjs` polls `xcode-select -p` after triggering, with a 20-minute timeout and clear status updates. Acceptable one-time cost.

**Risk: Homebrew not present on fresh Macs.** The launcher offers `brew install node@20` only if `brew` exists. Otherwise it prints the nodejs.org URL and exits. This is the right shape — don't chain-install Homebrew to install Node; too many prompts, too much surface area.

**Risk: VS Code task labels conflict with existing projects.** Mitigated by the `Forge:` prefix. If the user opens a multi-root workspace that includes Forge plus something else, the tasks namespace cleanly.

**Open question (defer):** Should the launcher detect when `friday/.env` exists but `XAI_API_KEY` is still the placeholder (`xai-...`)? Would help on "I copied the template but forgot to fill it in" — but duplicates Friday's own startup check, and friction adds up. Defer unless newcomers actually hit this.
