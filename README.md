# The Forge

## Quick start

- **Double-click:** `Launch Forge.command` (Mac) or `Launch Forge.bat` (Windows)
- **CLI:** `npm run setup && npm run dev`
- **VS Code:** `Cmd+Shift+P` → `Run Task` → `Forge: First Run`

Requires Node 20+. The first run will prompt to install missing prereqs (Bun, and on Mac, Xcode Command Line Tools).

A Software Development Studio OS — Electron dashboard + integrated terminals + dual-brain AI assistant (Grok + Claude) + a Council of specialist agents for reviewing and shaping your codebase.

## What you get

- **Project dashboard** — track multiple projects with features, recommendations, ideas, and progress
- **Integrated terminal multiplexer** — tabbed terminals with agent sessions
- **Friday** — voice-enabled AI assistant with streaming responses (Grok) and deep-reasoning mode (Claude)
- **Council agents** — 14 specialist roles (Solutions Architect, Backend/Frontend Engineer, DevOps, QA Lead, etc.) that read your project state and produce structured recommendations
- **Mobile companion** — Expo app for remote session monitoring

## Prerequisites

- **Node 20+** (with npm)
- **[Bun](https://bun.sh)** — required for the Friday server
- **Git**
- Windows, macOS, or Linux

## Install

```bash
git clone https://github.com/gnoobs75/Forge.git
cd Forge
npm install
cd friday && bun install && cd ..
```

## Configure Friday (optional but recommended)

Friday won't respond without at least one LLM key. Copy the example env and add your keys:

```bash
cp friday/.env.example friday/.env
```

Edit `friday/.env`:
- `XAI_API_KEY` — for Grok (fast responses + native voice)
- `ANTHROPIC_API_KEY` — for Claude (deep reasoning, agent dispatch)

Friday can run with just one of the two; both enables the full dual-brain experience.

## Run

```bash
npm run dev
```

On first launch Forge will auto-create `hq-data/` with an empty skeleton and a `_template` project you can clone. The dashboard opens with no projects by default — use **New Project** in the UI to add one.

## Data layout

Forge stores all studio state under `hq-data/` (gitignored — stays local to your machine):

```
hq-data/
  projects/
    _template/          # reference shape for new projects
      project.json      # slug, name, tech stack, repoPath
      features.json     # feature registry (source of truth)
      context.md        # narrative architecture notes
      recommendations/  # agent output
      ideas/            # brainstorms
  activity-log.json     # audit trail
  agent-brains.json     # per-agent model assignment
  automation/           # schedules, chains, triggers
  knowledge/            # market intel cached by agents
  metering/             # token usage per provider
```

See [`docs/`](./docs) for architecture deep-dives.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Launch the Electron app with Vite dev server |
| `npm run build` | Build production binary via electron-builder |
| `npm run init:hq-data` | Manually bootstrap hq-data skeleton (automatic on first run) |
| `npm run friday:setup` | One-time setup for the Friday voice module |

## Architecture at a glance

- **`electron/`** — Electron main process: window management, PTY terminal broker, IPC handlers for hq-data, Friday server lifecycle
- **`src/`** — React dashboard UI (Zustand store, Tailwind)
- **`friday/`** — Bun/TypeScript server: brain router, Grok streaming, Claude subprocess, voice pipeline, studio tools module
- **`mobile/`** — Expo app for remote monitoring
- **`agents/`** — Markdown skill files defining Council agent personas
- **`config/paths.cjs`** — single-source path resolver (Forge-root vs legacy layouts)
- **`scripts/init-hq-data.cjs`** — idempotent hq-data bootstrap

## License

Personal project — no license attached yet.
