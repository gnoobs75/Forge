# Agent Launch Flow

How agent launches converge on a single Electron handler that injects **persona + working directory + project files** for every dispatch.

## Flow Diagram

```mermaid
flowchart TD
    subgraph Entry["Entry Points"]
        A1[Dashboard UI<br/>ProjectDetail / Recommendations]
        A2[Friday Tool Call<br/>studio.dispatch_agent]
        A3[Mobile Companion<br/>friday/mobile/routes.ts]
        A4[Terminal Automation<br/>Terminal.jsx + buildAgentTaskPrompt]
    end

    A1 -->|IPC: friday:command| B
    A2 -->|broadcastFn forge:command| B
    A3 -->|WS broadcast| B
    A4 -->|IPC: friday:command| B

    B[executeFridayCommand<br/>electron/main.cjs:1830]
    B --> C{command === 'spawn-agent'}

    C --> D[resolveProjectCwd projectSlug<br/>main.cjs:98]
    D --> D1[Read hq-data/projects/SLUG/project.json]
    D1 --> D2[Return pj.repoPath<br/>fallback STUDIO_DIR + warn]

    C --> E[Build Agent Brief<br/>tmp file: forge-friday-dispatch-*.md]
    E --> E1["Persona header:<br/>'You are @AgentName.<br/>Load Forge/agents/SLUG.md'"]
    E -.tmp file name.-> E0[forge-friday-dispatch-*.md]
    E --> E2["Working dir line:<br/>'Your working directory is CWD'"]
    E --> E3["Project files:<br/>hq-data/projects/SLUG/<br/>features.json + context.md"]
    E --> E4[Task instruction]

    D2 --> F
    E1 --> F
    E2 --> F
    E3 --> F
    E4 --> F

    F[pty.spawn shell<br/>cwd: resolved repoPath<br/>env: ptyEnv]
    F --> G["proc.write:<br/>claude [--dangerously-skip-permissions]<br/>'Read brief at TMPFILE'"]
    G --> H[Claude Code subprocess<br/>runs INSIDE project repo]

    H --> H1[Loads agent persona from<br/>Forge/agents/SLUG.md]
    H --> H2[Reads project.json + features.json + context.md]
    H --> H3[Operates on real project code at repoPath]

    style B fill:#4a3,color:#fff
    style D fill:#a63,color:#fff
    style E fill:#36a,color:#fff
    style F fill:#a36,color:#fff
```

## The Three Guarantees

Every launch path converges on `executeFridayCommand('spawn-agent', ...)` in `Forge/electron/main.cjs:1834`, which enforces:

| Guarantee | Where | Code |
|---|---|---|
| **Persona** | Brief tmp file references `Forge/agents/{slug}.md` | main.cjs:1910-1911 |
| **Working Directory** | `resolveProjectCwd(projectSlug)` reads `project.json.repoPath` | main.cjs:98-111, 1850 |
| **Project Files** | Brief instructs agent to read `hq-data/projects/{slug}/features.json` + `context.md` | main.cjs:1915-1916 |

## Entry Point → Handler Map

| Entry Point | File | Path to Handler |
|---|---|---|
| Dashboard launch button | `src/components/dashboard/*` | `useStore.js` → IPC `friday:command` → `executeFridayCommand` |
| Friday LLM tool | `friday/src/modules/studio/dispatch-agent.ts:73` | `broadcastFn({type:'forge:command'})` → server WS → Electron → `executeFridayCommand` |
| Mobile companion | `friday/src/modules/mobile/routes.ts` | WS broadcast → Electron → `executeFridayCommand` |
| Terminal automation | `src/components/Terminal.jsx:328` | `buildAgentTaskPrompt` → IPC → `executeFridayCommand` |

## Single Point of Truth

Because all paths funnel through `resolveProjectCwd` and the same brief-builder, fixing the cwd resolution in one place fixes it for **every** entry point — dashboard, Friday, mobile, and automation.

## Known Gap

**Fixed:** `dispatch-agent.ts` previously pointed `AGENTS_DIR` at the legacy Forge path and the standalone `Bun.spawn` fallback hardcoded `cwd: "C:/Claude/Samurai"`. Both now resolve to Forge paths (`Forge/agents/` and `projectInfo.repoPath`).
