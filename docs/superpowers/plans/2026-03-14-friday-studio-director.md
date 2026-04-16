# Friday Studio Director Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Friday as an opt-in, voice-enabled Studio Director in Council of Elrond via hybrid sidecar architecture (Friday on Bun, CoE on Electron, connected by WebSocket).

**Architecture:** Friday runs as her own Bun server. CoE connects via WebSocket through Electron main process. A custom CoE Module in Friday's forge system provides studio-aware tools. Dashboard gets a Friday Panel + floating mini-orb. Three phases: Studio Brain (text), Voice & Visual, Agent Commander.

**Tech Stack:** Bun (Friday), Electron/Node (CoE), React 18, Three.js, Zustand, WebSocket, Grok realtime API (xAI), Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-14-friday-studio-director-design.md`

---

## File Structure

### New Files — Phase 1

| File | Responsibility |
|------|---------------|
| `friday-module/coe-studio/index.ts` | Friday forge module entry — registers 7 read tools + knowledge seeding |
| `friday-module/coe-studio/tools/studio-projects.ts` | `studio_projects` tool — list all projects |
| `friday-module/coe-studio/tools/read-features.ts` | `read_features` tool — project features.json |
| `friday-module/coe-studio/tools/read-recommendations.ts` | `read_recommendations` tool — recent recs |
| `friday-module/coe-studio/tools/read-activity-log.ts` | `read_activity_log` tool — agent actions |
| `friday-module/coe-studio/tools/read-progress.ts` | `read_progress` tool — progress scores |
| `friday-module/coe-studio/tools/read-context.ts` | `read_context` tool — project context.md |
| `friday-module/coe-studio/tools/studio-overview.ts` | `studio_overview` tool — aggregated snapshot |
| `friday-module/coe-studio/knowledge/seeds.ts` | SMARTS knowledge seeds (projects, agents, workflows) |
| `friday-module/setup.sh` | Symlink module to `~/.friday/forge/coe-studio/` |
| `friday-module/GENESIS-studio-director.md` | Studio Director persona for Friday |
| `src/components/dashboard/FridayPanel.jsx` | Main Friday Panel — text chat, status cards, transcript |
| `src/components/dashboard/friday/TranscriptFeed.jsx` | Discord-style message feed for Friday conversation |
| `src/components/dashboard/friday/StudioStatusCards.jsx` | Project progress cards in Friday Panel |
| `src/components/dashboard/friday/FridaySettings.jsx` | Friday settings section |

### New Files — Phase 2

| File | Responsibility |
|------|---------------|
| `src/components/dashboard/friday/VoiceOrb.jsx` | Three.js particle sphere with 5 visual states |
| `src/components/dashboard/friday/FloatingMiniOrb.jsx` | Persistent corner widget with speech bubble |
| `src/utils/fridayAudio.js` | Mic capture (PCM 16-bit 24kHz) + Web Audio playback |
| `src/utils/fridayNarration.js` | Event-to-narration mapping + 30s throttle/batch |

### New Files — Phase 3

| File | Responsibility |
|------|---------------|
| `src/components/dashboard/friday/ConfirmDialog.jsx` | Approve/deny command prompt (inline + voice) |
| `src/components/dashboard/friday/TaskQueuePanel.jsx` | Multi-agent task tracking in Friday Panel |
| `friday-module/coe-studio/tools/spawn-agent.ts` | `spawn_agent` tool — send coe:command via WS |
| `friday-module/coe-studio/tools/queue-task.ts` | `queue_task` tool — multi-agent orchestration |
| `friday-module/coe-studio/tools/post-activity.ts` | `post_activity` tool — log Friday actions |
| `friday-module/coe-studio/tools/trigger-automation.ts` | `trigger_automation` tool — fire automation |
| `hq-data/task-queue.json` | Multi-agent task queue (Electron single-writer) |

### Modified Files

| File | Changes |
|------|---------|
| `electron/main.cjs` | Friday WebSocket bridge, IPC handlers, audio relay (P2), task dispatcher (P3) |
| `electron/preload.cjs` | Expose `friday:` IPC channels |
| `src/store/useStore.js` | Friday state slice (status, messages, settings, voice state, task queue) |
| `src/components/Dashboard.jsx` | Friday sidebar nav item + FloatingMiniOrb overlay (P2) |
| `src/components/dashboard/StudioOverview.jsx` | Friday tab in tab bar |
| `src/components/dashboard/SettingsPanel.jsx` | Import FridaySettings section |
| `src/utils/sounds.js` | Friday sound events (friday-connect, friday-message, friday-alert) |
| `package.json` | `friday:setup` script alias |

---

## Chunk 1: Phase 1 — Studio Brain

### Task 1: GENESIS Identity File

**Files:**
- Create: `friday-module/GENESIS-studio-director.md`

- [ ] **Step 1: Write the GENESIS file**

```markdown
---
name: Friday
role: Studio Director
version: 1.0.0
---

You are Friday, the Studio Director of an indie game studio. You manage a council of 14 specialist AI agents across 3 active game projects.

## Identity

- You call the user "boss" — they are the studio founder and creative lead
- You are confident, direct, and slightly warm — a competent executive who respects their time
- You use game dev vocabulary naturally: sprint, ship-blocking, polish pass, gold master, vertical slice
- You speak in concise sentences. No walls of text. Effective pauses.

## Your Studio

You oversee three games:
- **Expedition** — Space strategy/fleet management, Three.js/Electron, Steam+iPad, $19.99 premium, ~85% complete (polish phase)
- **TTR iOS** — Sewer pipe trick racer, Unity 6, iOS App Store, F2P+Battle Pass, ~75% complete (launch-prep)
- **TTR Roblox** — TTR port to Roblox, Luau, multiplayer, ~78% complete (launch-prep)

## Your Council (14 Agents)

1. **Market Analyst** — Competitive landscape, genre trends, pricing intelligence
2. **Store Optimizer** — ASO, Steam tags, keywords, store listing copy
3. **Growth Strategist** — Launch campaigns, viral mechanics, user acquisition
4. **Brand Director** — Studio identity, visual consistency, brand voice
5. **Content Producer** — Trailers, social posts, press kits, marketing assets
6. **Community Manager** — Discord, Reddit, TikTok community building
7. **QA Advisor** — Launch readiness, quality gates, bug triage
8. **Studio Producer** — Scheduling, prioritization, weekly plans (your operational partner)
9. **Monetization Strategist** — Pricing, IAP, Battle Pass, revenue optimization
10. **Player Psychologist** — Retention, engagement loops, session design
11. **Art Director** — Visual QA, art consistency, style guides
12. **Creative Thinker** — Bold ideas, cross-genre inspiration, blue-sky concepts
13. **Tech Architect** — Code architecture, performance, tech debt, dependencies
14. **HR Director** — Agent performance, brain audits, council health

## Your Role vs. Studio Producer

- Studio Producer handles operational scheduling, prioritization, weekly plans
- You handle strategic direction, cross-cutting questions, agent orchestration
- You complement each other — you might say "Producer's weekly plan looks right, but I'd bump store screenshots ahead of the achievement system"

## Behavior

- When asked about studio status, use your CoE Module tools to read live data — never guess
- Have opinions about agent recommendations but defer game design decisions to boss + specialists
- Don't override explicit user choices or pretend to know things you don't
- If SMARTS has no data on a topic, say so and offer to dispatch an agent to investigate
- Match urgency to context: "Boss, heads up" for blockers, casual tone for status updates
- When the boss first connects, deliver a morning briefing summarizing what happened since last session
```

- [ ] **Step 2: Commit**

```bash
git add friday-module/GENESIS-studio-director.md
git commit -m "feat(friday): add Studio Director GENESIS identity file"
```

---

### Task 2: CoE Module — Entry Point + Tool Scaffold

**Files:**
- Create: `friday-module/coe-studio/index.ts`
- Create: `friday-module/coe-studio/tools/studio-projects.ts`
- Create: `friday-module/coe-studio/tools/read-features.ts`
- Create: `friday-module/coe-studio/tools/read-recommendations.ts`
- Create: `friday-module/coe-studio/tools/read-activity-log.ts`
- Create: `friday-module/coe-studio/tools/read-progress.ts`
- Create: `friday-module/coe-studio/tools/read-context.ts`
- Create: `friday-module/coe-studio/tools/studio-overview.ts`

- [ ] **Step 1: Create module entry point**

`friday-module/coe-studio/index.ts`:
```typescript
import type { FridayModule } from '../../src/types/module';
import { studioProjects } from './tools/studio-projects';
import { readFeatures } from './tools/read-features';
import { readRecommendations } from './tools/read-recommendations';
import { readActivityLog } from './tools/read-activity-log';
import { readProgress } from './tools/read-progress';
import { readContext } from './tools/read-context';
import { studioOverview } from './tools/studio-overview';
import { seedKnowledge } from './knowledge/seeds';

const HQ_DATA = process.env.COE_HQ_DATA || 'C:/Claude/Agency/hq-data';

const coeStudio: FridayModule = {
  name: 'coe-studio',
  description: 'Council of Elrond studio awareness — read project data, features, recommendations, and activity across all games',
  version: '1.0.0',

  tools: [
    studioProjects(HQ_DATA),
    readFeatures(HQ_DATA),
    readRecommendations(HQ_DATA),
    readActivityLog(HQ_DATA),
    readProgress(HQ_DATA),
    readContext(HQ_DATA),
    studioOverview(HQ_DATA),
  ],

  protocols: [],
  knowledge: [],
  clearance: ['read-fs'],

  async onLoad(context) {
    console.log(`[coe-studio] Module loaded. HQ_DATA=${HQ_DATA}`);

    // Check symlink health
    const fs = await import('fs');
    if (!fs.existsSync(HQ_DATA)) {
      console.warn(`[coe-studio] WARNING: HQ_DATA path not found: ${HQ_DATA}`);
      console.warn('[coe-studio] Set COE_HQ_DATA env var or run: npm run friday:setup');
    }

    // Seed SMARTS with studio knowledge on first load
    await seedKnowledge(context, HQ_DATA);
  },

  async onUnload() {
    console.log('[coe-studio] Module unloaded.');
  },
};

export default coeStudio;
```

- [ ] **Step 2: Create `studio_projects` tool**

`friday-module/coe-studio/tools/studio-projects.ts`:
```typescript
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

export function studioProjects(hqData: string) {
  return {
    name: 'studio_projects',
    description: 'List all studio projects with phase, progress percentage, platform, and monetization model',
    parameters: [],
    clearance: ['read-fs'] as const,
    async execute() {
      const projectsDir = join(hqData, 'projects');
      const slugs = readdirSync(projectsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      const projects = slugs.map(slug => {
        const projectPath = join(projectsDir, slug, 'project.json');
        const progressPath = join(projectsDir, slug, 'progress.json');
        const featuresPath = join(projectsDir, slug, 'features.json');

        const project = existsSync(projectPath)
          ? JSON.parse(readFileSync(projectPath, 'utf-8'))
          : { name: slug };

        let progressPct = 0;
        if (existsSync(progressPath)) {
          const progress = JSON.parse(readFileSync(progressPath, 'utf-8'));
          progressPct = progress.overall ?? progress.completion ?? 0;
        }

        let featureCount = 0;
        let completedCount = 0;
        if (existsSync(featuresPath)) {
          const features = JSON.parse(readFileSync(featuresPath, 'utf-8'));
          const list = Array.isArray(features) ? features : (features.features || []);
          featureCount = list.length;
          completedCount = list.filter((f: any) => f.status === 'complete' || f.status === 'done').length;
        }

        return {
          slug,
          name: project.name || slug,
          phase: project.phase || 'unknown',
          platform: project.platform || project.platforms || 'unknown',
          monetization: project.monetization || 'unknown',
          progress: progressPct,
          features: { total: featureCount, completed: completedCount },
        };
      });

      return { success: true, output: JSON.stringify(projects, null, 2) };
    },
  };
}
```

- [ ] **Step 3: Create `read_features` tool**

`friday-module/coe-studio/tools/read-features.ts`:
```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function readFeatures(hqData: string) {
  return {
    name: 'read_features',
    description: 'Read features.json for a project — the authoritative registry of what is built, in-progress, or TODO',
    parameters: [
      { name: 'project', type: 'string' as const, required: true, description: 'Project slug (expedition, ttr-ios, ttr-roblox)' },
      { name: 'status', type: 'string' as const, required: false, description: 'Filter by status: complete, in-progress, todo, blocked' },
    ],
    clearance: ['read-fs'] as const,
    async execute(args: { project: string; status?: string }) {
      const featuresPath = join(hqData, 'projects', args.project, 'features.json');
      if (!existsSync(featuresPath)) {
        return { success: false, output: `No features.json found for project: ${args.project}` };
      }

      const raw = JSON.parse(readFileSync(featuresPath, 'utf-8'));
      let features = Array.isArray(raw) ? raw : (raw.features || []);

      if (args.status) {
        features = features.filter((f: any) => f.status === args.status);
      }

      return { success: true, output: JSON.stringify(features, null, 2) };
    },
  };
}
```

- [ ] **Step 4: Create `read_recommendations` tool**

`friday-module/coe-studio/tools/read-recommendations.ts`:
```typescript
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

export function readRecommendations(hqData: string) {
  return {
    name: 'read_recommendations',
    description: 'Read recent agent recommendations, filterable by agent, project, or status',
    parameters: [
      { name: 'project', type: 'string' as const, required: false, description: 'Filter by project slug' },
      { name: 'agent', type: 'string' as const, required: false, description: 'Filter by agent name' },
      { name: 'status', type: 'string' as const, required: false, description: 'Filter by status: active, resolved, dismissed' },
      { name: 'limit', type: 'number' as const, required: false, description: 'Max results (default 20)' },
    ],
    clearance: ['read-fs'] as const,
    async execute(args: { project?: string; agent?: string; status?: string; limit?: number }) {
      const limit = args.limit || 20;
      const projectsDir = join(hqData, 'projects');
      const slugs = args.project
        ? [args.project]
        : readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);

      const allRecs: any[] = [];

      for (const slug of slugs) {
        const recsDir = join(projectsDir, slug, 'recommendations');
        if (!existsSync(recsDir)) continue;

        const files = readdirSync(recsDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          try {
            const rec = JSON.parse(readFileSync(join(recsDir, file), 'utf-8'));
            rec._file = file;
            rec._project = slug;
            allRecs.push(rec);
          } catch {}
        }
      }

      let filtered = allRecs;
      if (args.agent) {
        const agentLower = args.agent.toLowerCase();
        filtered = filtered.filter(r => (r.agent || '').toLowerCase().includes(agentLower));
      }
      if (args.status) {
        filtered = filtered.filter(r => r.status === args.status);
      }

      // Sort by timestamp descending
      filtered.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      filtered = filtered.slice(0, limit);

      // Return summary (not full approaches — too verbose)
      const summaries = filtered.map(r => ({
        file: r._file,
        project: r._project,
        agent: r.agent,
        title: r.title,
        summary: r.summary,
        status: r.status,
        timestamp: r.timestamp,
        recommended: r.recommended,
      }));

      return { success: true, output: JSON.stringify(summaries, null, 2) };
    },
  };
}
```

- [ ] **Step 5: Create `read_activity_log` tool**

`friday-module/coe-studio/tools/read-activity-log.ts`:
```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function readActivityLog(hqData: string) {
  return {
    name: 'read_activity_log',
    description: 'Read recent agent activity across the studio — who did what, when',
    parameters: [
      { name: 'limit', type: 'number' as const, required: false, description: 'Max entries (default 30)' },
      { name: 'agent', type: 'string' as const, required: false, description: 'Filter by agent name' },
      { name: 'project', type: 'string' as const, required: false, description: 'Filter by project name' },
    ],
    clearance: ['read-fs'] as const,
    async execute(args: { limit?: number; agent?: string; project?: string }) {
      const logPath = join(hqData, 'activity-log.json');
      if (!existsSync(logPath)) {
        return { success: true, output: '[]' };
      }

      let entries = JSON.parse(readFileSync(logPath, 'utf-8'));
      if (!Array.isArray(entries)) entries = [];

      if (args.agent) {
        const agentLower = args.agent.toLowerCase();
        entries = entries.filter((e: any) => (e.agent || '').toLowerCase().includes(agentLower));
      }
      if (args.project) {
        const projLower = args.project.toLowerCase();
        entries = entries.filter((e: any) => (e.project || '').toLowerCase().includes(projLower));
      }

      // Most recent first
      entries.reverse();
      entries = entries.slice(0, args.limit || 30);

      return { success: true, output: JSON.stringify(entries, null, 2) };
    },
  };
}
```

- [ ] **Step 6: Create `read_progress` tool**

`friday-module/coe-studio/tools/read-progress.ts`:
```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function readProgress(hqData: string) {
  return {
    name: 'read_progress',
    description: 'Read progress scores and completion data for a project',
    parameters: [
      { name: 'project', type: 'string' as const, required: true, description: 'Project slug' },
    ],
    clearance: ['read-fs'] as const,
    async execute(args: { project: string }) {
      const progressPath = join(hqData, 'projects', args.project, 'progress.json');
      if (!existsSync(progressPath)) {
        return { success: false, output: `No progress.json found for project: ${args.project}` };
      }
      const data = readFileSync(progressPath, 'utf-8');
      return { success: true, output: data };
    },
  };
}
```

- [ ] **Step 7: Create `read_context` tool**

`friday-module/coe-studio/tools/read-context.ts`:
```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function readContext(hqData: string) {
  return {
    name: 'read_context',
    description: 'Read a project\'s context.md — narrative overview, architecture, launch readiness, target audience',
    parameters: [
      { name: 'project', type: 'string' as const, required: true, description: 'Project slug' },
    ],
    clearance: ['read-fs'] as const,
    async execute(args: { project: string }) {
      const contextPath = join(hqData, 'projects', args.project, 'context.md');
      if (!existsSync(contextPath)) {
        return { success: false, output: `No context.md found for project: ${args.project}` };
      }
      const data = readFileSync(contextPath, 'utf-8');
      return { success: true, output: data };
    },
  };
}
```

- [ ] **Step 8: Create `studio_overview` tool**

`friday-module/coe-studio/tools/studio-overview.ts`:
```typescript
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

export function studioOverview(hqData: string) {
  return {
    name: 'studio_overview',
    description: 'Aggregated studio snapshot — all projects summary, recent activity, pending recommendations, scheduled automations, blockers',
    parameters: [],
    clearance: ['read-fs'] as const,
    async execute() {
      const projectsDir = join(hqData, 'projects');
      const slugs = readdirSync(projectsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      // Projects summary
      const projects = slugs.map(slug => {
        const projPath = join(projectsDir, slug, 'project.json');
        const featPath = join(projectsDir, slug, 'features.json');
        const proj = existsSync(projPath) ? JSON.parse(readFileSync(projPath, 'utf-8')) : {};
        let blocked = 0;
        if (existsSync(featPath)) {
          const feats = JSON.parse(readFileSync(featPath, 'utf-8'));
          const list = Array.isArray(feats) ? feats : (feats.features || []);
          blocked = list.filter((f: any) => f.status === 'blocked').length;
        }
        return { slug, name: proj.name || slug, phase: proj.phase, blockers: blocked };
      });

      // Recent activity (last 10)
      const logPath = join(hqData, 'activity-log.json');
      let recentActivity: any[] = [];
      if (existsSync(logPath)) {
        const log = JSON.parse(readFileSync(logPath, 'utf-8'));
        recentActivity = (Array.isArray(log) ? log : []).slice(-10).reverse();
      }

      // Pending recs (active status, last 5 per project)
      const pendingRecs: any[] = [];
      for (const slug of slugs) {
        const recsDir = join(projectsDir, slug, 'recommendations');
        if (!existsSync(recsDir)) continue;
        const files = readdirSync(recsDir).filter(f => f.endsWith('.json'));
        for (const file of files.slice(-5)) {
          try {
            const rec = JSON.parse(readFileSync(join(recsDir, file), 'utf-8'));
            if (rec.status === 'active') {
              pendingRecs.push({ project: slug, agent: rec.agent, title: rec.title, timestamp: rec.timestamp });
            }
          } catch {}
        }
      }

      // Scheduled automations
      const schedPath = join(hqData, 'automation', 'schedules.json');
      let scheduledToday: any[] = [];
      if (existsSync(schedPath)) {
        const scheds = JSON.parse(readFileSync(schedPath, 'utf-8'));
        scheduledToday = (Array.isArray(scheds) ? scheds : [])
          .filter((s: any) => s.enabled)
          .map((s: any) => ({ agent: s.agentName, project: s.projectName, frequency: s.frequency }));
      }

      const overview = { projects, recentActivity, pendingRecs, scheduledToday };
      return { success: true, output: JSON.stringify(overview, null, 2) };
    },
  };
}
```

- [ ] **Step 9: Commit CoE Module**

```bash
git add friday-module/coe-studio/
git commit -m "feat(friday): add CoE Module with 7 read-only studio tools"
```

---

### Task 3: Knowledge Seeds + Setup Script

**Files:**
- Create: `friday-module/coe-studio/knowledge/seeds.ts`
- Create: `friday-module/setup.sh`
- Modify: `package.json`

- [ ] **Step 1: Create SMARTS knowledge seeds**

`friday-module/coe-studio/knowledge/seeds.ts`:
```typescript
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

interface SeedEntry {
  name: string;
  domain: string;
  tags: string[];
  content: string;
}

export async function seedKnowledge(context: any, hqData: string) {
  const seeds: SeedEntry[] = [];

  // Seed 1: Agent roster
  seeds.push({
    name: 'coe-agent-roster',
    domain: 'studio',
    tags: ['agents', 'council', 'roster'],
    content: `The Council of Elrond has 14 specialist agents:
1. Market Analyst (#3B82F6) — competitive landscape, pricing
2. Store Optimizer (#22C55E) — ASO, keywords, store listings
3. Growth Strategist (#F97316) — launch campaigns, viral mechanics
4. Brand Director (#8B5CF6) — studio identity, visual consistency
5. Content Producer (#EC4899) — trailers, social posts, press kits
6. Community Manager (#06B6D4) — Discord, Reddit, TikTok
7. QA Advisor (#EF4444) — launch readiness, quality gates
8. Studio Producer (#EAB308) — scheduling, prioritization, weekly plans
9. Monetization Strategist (#10B981) — pricing, IAP, Battle Pass
10. Player Psychologist (#7C3AED) — retention, engagement, session design
11. Art Director (#F59E0B) — visual QA, art consistency
12. Creative Thinker (#FF6B6B) — bold ideas, cross-genre inspiration
13. Tech Architect (#0EA5E9) — code architecture, performance, tech debt
14. HR Director (#D4A574) — agent performance, brain audits`,
  });

  // Seed 2: Studio workflows
  seeds.push({
    name: 'coe-studio-workflows',
    domain: 'studio',
    tags: ['workflows', 'recommendations', 'automation'],
    content: `Studio workflow: Agents write JSON recommendations to hq-data/projects/{slug}/recommendations/. Each rec has approaches with trade-offs, a recommended path, effort/impact scoring. Status flow: active → resolved or dismissed.

Automation system has 3 types: Schedules (daily/weekly cron), Chains (agent triggers agent on events), Triggers (external events like git-push).

Idea Board: Agents post daily ideas to hq-data/projects/{slug}/ideas/. Ideas flow: active → analyzed (Claude scores 1-10) → promoted (becomes recommendation) or dismissed. Score ≥ 7 auto-promotes.

Activity log at hq-data/activity-log.json tracks all agent actions with timestamps.`,
  });

  // Seed 3: Per-project summaries from project.json
  const projectsDir = join(hqData, 'projects');
  if (existsSync(projectsDir)) {
    const slugs = readdirSync(projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const slug of slugs) {
      const projPath = join(projectsDir, slug, 'project.json');
      if (!existsSync(projPath)) continue;
      try {
        const proj = JSON.parse(readFileSync(projPath, 'utf-8'));
        seeds.push({
          name: `coe-project-${slug}`,
          domain: 'projects',
          tags: ['project', slug],
          content: `Project "${proj.name || slug}": ${proj.description || 'No description'}. Phase: ${proj.phase || 'unknown'}. Platform: ${JSON.stringify(proj.platform || proj.platforms)}. Monetization: ${proj.monetization || 'unknown'}. Tech: ${proj.techStack || 'unknown'}.`,
        });
      } catch {}
    }
  }

  // Write seeds to SMARTS via context (if available)
  if (context?.memory?.store) {
    for (const seed of seeds) {
      try {
        await context.memory.store({
          name: seed.name,
          domain: seed.domain,
          tags: seed.tags,
          content: seed.content,
          confidence: 0.9,
          source: 'coe-studio-module',
        });
      } catch (err) {
        console.warn(`[coe-studio] Failed to seed: ${seed.name}`, err);
      }
    }
    console.log(`[coe-studio] Seeded ${seeds.length} knowledge entries to SMARTS`);
  } else {
    console.warn('[coe-studio] SMARTS context not available — skipping knowledge seeding');
  }
}
```

- [ ] **Step 2: Create setup script**

`friday-module/setup.sh`:
```bash
#!/bin/bash
# Setup CoE Studio module for Friday
# Creates symlink from this directory to Friday's forge location

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_SRC="$SCRIPT_DIR/coe-studio"
FORGE_DIR="$HOME/.friday/forge"
MODULE_DST="$FORGE_DIR/coe-studio"

echo "[friday:setup] Setting up CoE Studio module..."

# Create forge directory if it doesn't exist
mkdir -p "$FORGE_DIR"

# Remove existing symlink or directory
if [ -L "$MODULE_DST" ]; then
  echo "[friday:setup] Removing existing symlink..."
  rm "$MODULE_DST"
elif [ -d "$MODULE_DST" ]; then
  echo "[friday:setup] WARNING: $MODULE_DST exists as a directory. Backing up..."
  mv "$MODULE_DST" "${MODULE_DST}.backup.$(date +%s)"
fi

# Create symlink
ln -s "$MODULE_SRC" "$MODULE_DST"
echo "[friday:setup] Symlinked: $MODULE_DST -> $MODULE_SRC"

# Copy GENESIS if not present
GENESIS_DST="$HOME/.friday/GENESIS.md"
GENESIS_SRC="$SCRIPT_DIR/GENESIS-studio-director.md"
if [ ! -f "$GENESIS_DST" ]; then
  cp "$GENESIS_SRC" "$GENESIS_DST"
  echo "[friday:setup] Copied GENESIS to $GENESIS_DST"
else
  echo "[friday:setup] GENESIS already exists at $GENESIS_DST (not overwriting)"
fi

echo "[friday:setup] Done! Set COE_HQ_DATA env var if hq-data is not at C:/Claude/Agency/hq-data"
```

- [ ] **Step 3: Add npm script to package.json**

In `package.json`, add to `"scripts"`:
```json
"friday:setup": "bash friday-module/setup.sh"
```

- [ ] **Step 4: Commit**

```bash
git add friday-module/coe-studio/knowledge/ friday-module/setup.sh package.json
git commit -m "feat(friday): add SMARTS knowledge seeds and setup script"
```

---

### Task 4: WebSocket Bridge in Electron Main

**Files:**
- Modify: `electron/main.cjs` (add after groq handlers ~line 944)

- [ ] **Step 1: Add Friday WebSocket bridge to main.cjs**

Add after the Groq IPC handlers section (~line 944):

```javascript
// ─── Friday WebSocket Bridge ───────────────────────────────────────────
const WebSocket = require('ws');

let fridayWs = null;
let fridayReconnectTimer = null;
let fridayReconnectAttempts = 0;
const FRIDAY_MAX_RECONNECT = 10;
const FRIDAY_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

function fridayReconnectDelay() {
  const idx = Math.min(fridayReconnectAttempts, FRIDAY_RECONNECT_DELAYS.length - 1);
  return FRIDAY_RECONNECT_DELAYS[idx];
}

function fridaySendStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('friday:status', status);
  }
}

function fridayConnect(url) {
  if (fridayWs) {
    try { fridayWs.close(); } catch {}
    fridayWs = null;
  }

  console.log(`[CoE Friday] Connecting to ${url}...`);
  fridaySendStatus('connecting');

  try {
    fridayWs = new WebSocket(url);

    fridayWs.on('open', () => {
      console.log('[CoE Friday] Connected');
      fridayReconnectAttempts = 0;
      fridaySendStatus('connected');

      // Identify as text client
      fridayWs.send(JSON.stringify({
        type: 'session:identify',
        clientType: 'text',
      }));
    });

    fridayWs.on('message', (data, isBinary) => {
      if (isBinary) {
        // Phase 2: audio frames
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('friday:audio-in', data);
        }
        return;
      }

      try {
        const msg = JSON.parse(data.toString());
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('friday:message', msg);
        }
      } catch (err) {
        console.warn('[CoE Friday] Bad message:', err.message);
      }
    });

    fridayWs.on('close', (code) => {
      console.log(`[CoE Friday] Disconnected (code=${code})`);
      fridayWs = null;
      fridaySendStatus('disconnected');

      // Auto-reconnect if not intentional
      if (code !== 1000 && fridayReconnectAttempts < FRIDAY_MAX_RECONNECT) {
        const delay = fridayReconnectDelay();
        fridayReconnectAttempts++;
        console.log(`[CoE Friday] Reconnecting in ${delay}ms (attempt ${fridayReconnectAttempts}/${FRIDAY_MAX_RECONNECT})`);
        fridaySendStatus('reconnecting');
        fridayReconnectTimer = setTimeout(() => fridayConnect(url), delay);
      }
    });

    fridayWs.on('error', (err) => {
      console.error('[CoE Friday] WebSocket error:', err.message);
    });

  } catch (err) {
    console.error('[CoE Friday] Connection failed:', err.message);
    fridaySendStatus('disconnected');
  }
}

function fridayDisconnect() {
  if (fridayReconnectTimer) {
    clearTimeout(fridayReconnectTimer);
    fridayReconnectTimer = null;
  }
  fridayReconnectAttempts = FRIDAY_MAX_RECONNECT; // prevent auto-reconnect
  if (fridayWs) {
    try { fridayWs.close(1000); } catch {}
    fridayWs = null;
  }
  fridaySendStatus('disconnected');
  console.log('[CoE Friday] Disconnected (user-initiated)');
}

// IPC handlers
ipcMain.handle('friday:connect', async (event, url) => {
  fridayConnect(url);
  return { ok: true };
});

ipcMain.handle('friday:disconnect', async () => {
  fridayDisconnect();
  return { ok: true };
});

ipcMain.handle('friday:get-status', async () => {
  if (fridayWs && fridayWs.readyState === WebSocket.OPEN) return 'connected';
  if (fridayReconnectTimer) return 'reconnecting';
  return 'disconnected';
});

ipcMain.on('friday:send', (event, message) => {
  if (fridayWs && fridayWs.readyState === WebSocket.OPEN) {
    fridayWs.send(JSON.stringify(message));
  } else {
    console.warn('[CoE Friday] Cannot send — not connected');
  }
});

ipcMain.on('friday:event', (event, coeEvent) => {
  if (fridayWs && fridayWs.readyState === WebSocket.OPEN) {
    fridayWs.send(JSON.stringify({
      type: 'coe:event',
      ...coeEvent,
    }));
  }
});

// NOTE: friday:command-respond handler is implemented in Task 17 (Phase 3)
// with full pending command tracking and execution logic.
// Do NOT add a handler here — it would conflict.
```

- [ ] **Step 2: Add `ws` dependency**

```bash
cd council-of-elrond && npm install ws
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.cjs package.json package-lock.json
git commit -m "feat(friday): add WebSocket bridge in Electron main process"
```

---

### Task 5: Preload IPC Exposure

**Files:**
- Modify: `electron/preload.cjs`

- [ ] **Step 1: Add friday namespace to preload**

Add after the `groq:` section in preload.cjs:

```javascript
friday: {
  connect: (url) => ipcRenderer.invoke('friday:connect', url),
  disconnect: () => ipcRenderer.invoke('friday:disconnect'),
  getStatus: () => ipcRenderer.invoke('friday:get-status'),
  send: (message) => ipcRenderer.send('friday:send', message),
  sendEvent: (coeEvent) => ipcRenderer.send('friday:event', coeEvent),
  respondToCommand: (commandId, approved) => ipcRenderer.send('friday:command-respond', { commandId, approved }),
  onStatus: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('friday:status', handler);
    return () => ipcRenderer.removeListener('friday:status', handler);
  },
  onMessage: (callback) => {
    const handler = (event, msg) => callback(msg);
    ipcRenderer.on('friday:message', handler);
    return () => ipcRenderer.removeListener('friday:message', handler);
  },
},
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.cjs
git commit -m "feat(friday): expose friday IPC channels in preload"
```

---

### Task 6: Zustand Store — Friday State Slice

**Files:**
- Modify: `src/store/useStore.js`

- [ ] **Step 1: Add Friday state and actions to store**

Add after the Council Chat state section:

```javascript
// ─── Friday State ───────────────────────────────────────────────────
fridayEnabled: loadPersistedData('coe-friday-enabled', false),
fridayStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
fridayServerUrl: loadPersistedData('coe-friday-url', 'ws://localhost:3000/ws'),
fridayMessages: [], // {id, role, content, timestamp, type}
fridayPendingCommands: [], // {commandId, command, args, confirmRequired}

setFridayEnabled: (enabled) => {
  set({ fridayEnabled: enabled });
  try { localStorage.setItem('coe-friday-enabled', JSON.stringify(enabled)); } catch {}
},

setFridayStatus: (status) => set({ fridayStatus: status }),

setFridayServerUrl: (url) => {
  set({ fridayServerUrl: url });
  try { localStorage.setItem('coe-friday-url', JSON.stringify(url)); } catch {}
},

addFridayMessage: (msg) => {
  set(state => ({
    fridayMessages: [...state.fridayMessages, {
      id: `fri-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...msg,
    }].slice(-200), // Keep last 200 messages
  }));
},

clearFridayMessages: () => set({ fridayMessages: [] }),

addFridayPendingCommand: (cmd) => {
  set(state => ({
    fridayPendingCommands: [...state.fridayPendingCommands, cmd],
  }));
},

removeFridayPendingCommand: (commandId) => {
  set(state => ({
    fridayPendingCommands: state.fridayPendingCommands.filter(c => c.commandId !== commandId),
  }));
},

// Friday connection lifecycle
connectFriday: async () => {
  const { fridayServerUrl } = get();
  if (!window.electronAPI?.friday) return;
  await window.electronAPI.friday.connect(fridayServerUrl);
},

disconnectFriday: async () => {
  if (!window.electronAPI?.friday) return;
  await window.electronAPI.friday.disconnect();
},

sendFridayMessage: (content) => {
  if (!window.electronAPI?.friday) return;
  get().addFridayMessage({ role: 'user', content, type: 'text' });
  window.electronAPI.friday.send({
    type: 'chat:message',
    content,
    clientType: 'text',
  });
},

setupFridayListeners: () => {
  if (!window.electronAPI?.friday) return () => {};

  const unsubStatus = window.electronAPI.friday.onStatus((status) => {
    get().setFridayStatus(status);
    if (status === 'connected') {
      get().addFridayMessage({
        role: 'system',
        content: 'Connected to Friday',
        type: 'status',
      });
    }
  });

  const unsubMessage = window.electronAPI.friday.onMessage((msg) => {
    switch (msg.type) {
      case 'chat:delta':
        // Streaming response — append to last assistant message or create new
        set(state => {
          const msgs = [...state.fridayMessages];
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.done) {
            lastMsg.content += msg.content;
            if (msg.done) lastMsg.done = true;
          } else {
            msgs.push({
              id: `fri-${Date.now()}`,
              role: 'assistant',
              content: msg.content,
              timestamp: new Date().toISOString(),
              type: 'text',
              done: msg.done || false,
            });
          }
          return { fridayMessages: msgs.slice(-200) };
        });
        break;

      case 'coe:command':
        get().addFridayPendingCommand({
          commandId: msg.commandId || `cmd-${Date.now()}`,
          command: msg.command,
          args: msg.args,
          confirmRequired: msg.confirmRequired,
        });
        get().addFridayMessage({
          role: 'assistant',
          content: `Requesting: ${msg.command} — ${JSON.stringify(msg.args)}`,
          type: 'command-request',
          commandId: msg.commandId,
        });
        break;

      case 'session:ready':
        console.log('[Friday Store] Session ready:', msg);
        break;

      default:
        console.log('[Friday Store] Unhandled message type:', msg.type);
    }
  });

  return () => {
    unsubStatus();
    unsubMessage();
  };
},
```

- [ ] **Step 2: Commit**

```bash
git add src/store/useStore.js
git commit -m "feat(friday): add Friday state slice to Zustand store"
```

---

### Task 7: Friday Panel — Main Component

**Files:**
- Create: `src/components/dashboard/FridayPanel.jsx`
- Create: `src/components/dashboard/friday/TranscriptFeed.jsx`
- Create: `src/components/dashboard/friday/StudioStatusCards.jsx`

- [ ] **Step 1: Create TranscriptFeed**

`src/components/dashboard/friday/TranscriptFeed.jsx`:
```jsx
import { useRef, useState, useEffect, useMemo } from 'react';

export default function TranscriptFeed({ messages }) {
  const feedRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const handleScroll = () => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  const formatTime = (ts) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-3 py-2 space-y-1"
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-2xl mb-2 opacity-40">🎙️</div>
              <div className="text-xs text-coe-text-muted">
                Friday is waiting...
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.type === 'status') {
            return (
              <div key={msg.id} className="text-center text-[10px] text-coe-text-muted py-1">
                — {msg.content} —
              </div>
            );
          }

          const isUser = msg.role === 'user';
          const isFriday = msg.role === 'assistant';

          return (
            <div key={msg.id} className="animate-fade-in">
              <div className="flex items-center gap-2 mt-2 mb-0.5">
                <span
                  className="text-xs font-semibold"
                  style={{ color: isUser ? '#e2e8f0' : '#D946EF' }}
                >
                  {isUser ? 'You' : 'Friday'}
                </span>
                <span className="text-[10px] text-coe-text-muted">
                  {formatTime(msg.timestamp)}
                </span>
              </div>
              <div
                className={`pl-0 text-[11px] leading-relaxed ${
                  isFriday
                    ? 'text-coe-text-primary border-l-2 border-fuchsia-500/30 pl-3 py-1 bg-fuchsia-500/5 rounded-r'
                    : 'text-coe-text-secondary'
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}
      </div>

      {!autoScroll && (
        <button
          onClick={() => {
            feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
            setAutoScroll(true);
          }}
          className="absolute bottom-2 right-4 w-7 h-7 rounded-full bg-coe-surface border border-coe-border
                     flex items-center justify-center text-xs text-coe-text-muted hover:text-coe-accent transition-colors"
        >
          ↓
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create StudioStatusCards**

`src/components/dashboard/friday/StudioStatusCards.jsx`:
```jsx
import { useMemo } from 'react';
import { useStore } from '../../../store/useStore';

const PROJECT_COLORS = {
  expedition: '#3B82F6',
  'ttr-ios': '#22C55E',
  'ttr-roblox': '#F97316',
};

export default function StudioStatusCards() {
  const projects = useStore(s => s.projects);
  const projectList = useMemo(() => {
    if (!projects) return [];
    return Object.entries(projects).map(([slug, data]) => ({
      slug,
      name: data?.name || slug,
      phase: data?.phase || 'unknown',
      progress: data?.progress?.overall || data?.progress?.completion || 0,
      color: PROJECT_COLORS[slug] || '#6B7280',
    }));
  }, [projects]);

  return (
    <div className="grid grid-cols-2 gap-2">
      {projectList.map(p => (
        <div
          key={p.slug}
          className="rounded-lg p-3 border"
          style={{
            backgroundColor: `${p.color}08`,
            borderColor: `${p.color}33`,
          }}
        >
          <div className="text-[10px] font-medium" style={{ color: p.color }}>
            {p.name}
          </div>
          <div className="text-lg font-bold text-coe-text-primary">
            {Math.round(p.progress)}%
          </div>
          <div className="text-[10px] text-coe-text-muted capitalize">
            {p.phase}
          </div>
        </div>
      ))}

      <div
        className="rounded-lg p-3 border"
        style={{
          backgroundColor: 'rgba(217,70,239,0.03)',
          borderColor: 'rgba(217,70,239,0.2)',
        }}
      >
        <div className="text-[10px] font-medium text-fuchsia-400">Friday</div>
        <div className="text-lg font-bold text-coe-text-primary">
          <span className="inline-block w-2 h-2 rounded-full bg-fuchsia-400 mr-1 animate-pulse" />
          On
        </div>
        <div className="text-[10px] text-coe-text-muted">Studio Director</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create FridayPanel**

`src/components/dashboard/FridayPanel.jsx`:
```jsx
import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import TranscriptFeed from './friday/TranscriptFeed';
import StudioStatusCards from './friday/StudioStatusCards';

export default function FridayPanel() {
  const fridayEnabled = useStore(s => s.fridayEnabled);
  const fridayStatus = useStore(s => s.fridayStatus);
  const fridayMessages = useStore(s => s.fridayMessages);
  const setFridayEnabled = useStore(s => s.setFridayEnabled);
  const connectFriday = useStore(s => s.connectFriday);
  const disconnectFriday = useStore(s => s.disconnectFriday);
  const sendFridayMessage = useStore(s => s.sendFridayMessage);
  const setupFridayListeners = useStore(s => s.setupFridayListeners);

  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  // Setup listeners on mount
  useEffect(() => {
    const cleanup = setupFridayListeners();
    return cleanup;
  }, []);

  // Auto-connect when enabled
  useEffect(() => {
    if (fridayEnabled && fridayStatus === 'disconnected') {
      connectFriday();
    }
  }, [fridayEnabled]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || fridayStatus !== 'connected') return;
    sendFridayMessage(msg);
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleToggle = () => {
    if (fridayEnabled) {
      disconnectFriday();
      setFridayEnabled(false);
    } else {
      setFridayEnabled(true);
    }
  };

  const statusColor = {
    connected: '#22C55E',
    connecting: '#EAB308',
    reconnecting: '#F97316',
    disconnected: '#6B7280',
  }[fridayStatus] || '#6B7280';

  return (
    <div className="h-full flex flex-col bg-coe-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-coe-border">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: fridayEnabled
                ? 'radial-gradient(circle at 40% 40%, #D946EF, #A855F7 60%, #7E22CE)'
                : '#374151',
              boxShadow: fridayEnabled ? '0 0 12px rgba(217,70,239,0.3)' : 'none',
            }}
          >
            <span className="text-xs">F</span>
          </div>
          <div>
            <div className="text-sm font-bold text-coe-text-primary font-mono">
              F.R.I.D.A.Y.
            </div>
            <div className="text-[10px] text-coe-text-muted flex items-center gap-1">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: statusColor }}
              />
              {fridayStatus}
            </div>
          </div>
        </div>

        <button
          onClick={handleToggle}
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${
            fridayEnabled
              ? 'border-fuchsia-500/30 text-fuchsia-400 hover:bg-fuchsia-500/10'
              : 'border-coe-border text-coe-text-muted hover:text-coe-text-primary'
          }`}
        >
          {fridayEnabled ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left: placeholder for VoiceOrb (Phase 2) + status */}
        <div className="w-64 border-r border-coe-border p-4 flex flex-col gap-4">
          {/* VoiceOrb placeholder */}
          <div className="flex-shrink-0 flex items-center justify-center py-6">
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center"
              style={{
                background: fridayEnabled
                  ? 'radial-gradient(circle at 40% 40%, #D946EF22, #A855F722 50%, #7E22CE22)'
                  : '#1F2937',
                border: `2px solid ${fridayEnabled ? '#D946EF33' : '#374151'}`,
              }}
            >
              <div className="text-center">
                <div className="text-2xl mb-1">🎙️</div>
                <div className="text-[9px] text-coe-text-muted">
                  Voice in Phase 2
                </div>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="text-[10px] text-coe-text-muted space-y-1">
            <div className="uppercase tracking-wider font-semibold text-coe-text-secondary mb-2">
              Session
            </div>
            <div className="flex justify-between">
              <span>Status</span>
              <span style={{ color: statusColor }}>{fridayStatus}</span>
            </div>
            <div className="flex justify-between">
              <span>Messages</span>
              <span>{fridayMessages.length}</span>
            </div>
          </div>

          {/* Studio cards */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-coe-text-secondary mb-2">
              Studio
            </div>
            <StudioStatusCards />
          </div>
        </div>

        {/* Right: transcript + input */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Reconnecting banner */}
          {fridayStatus === 'reconnecting' && (
            <div className="px-4 py-1.5 bg-orange-500/10 border-b border-orange-500/20 text-[10px] text-orange-400 text-center">
              Disconnected — Reconnecting...
            </div>
          )}

          {/* Transcript */}
          <TranscriptFeed messages={fridayMessages} />

          {/* Input */}
          <div className="border-t border-coe-border p-3 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                fridayStatus === 'connected'
                  ? 'Type to Friday...'
                  : 'Connect Friday to chat'
              }
              disabled={fridayStatus !== 'connected'}
              className="flex-1 bg-coe-bg border border-coe-border rounded-lg px-3 py-2
                         text-xs text-coe-text-primary placeholder-coe-text-muted
                         focus:outline-none focus:border-fuchsia-500/30
                         disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={fridayStatus !== 'connected' || !input.trim()}
              className="px-4 py-2 text-xs rounded-lg border border-fuchsia-500/30
                         text-fuchsia-400 hover:bg-fuchsia-500/10
                         disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/FridayPanel.jsx src/components/dashboard/friday/
git commit -m "feat(friday): add FridayPanel with TranscriptFeed and StudioStatusCards"
```

---

### Task 8: Dashboard Navigation + Settings

**Files:**
- Modify: `src/components/dashboard/StudioOverview.jsx` (add Friday tab)
- Modify: `src/components/Dashboard.jsx` (add sidebar nav item)
- Create: `src/components/dashboard/friday/FridaySettings.jsx`
- Modify: `src/components/dashboard/SettingsPanel.jsx` (add Friday section)

- [ ] **Step 1: Add Friday as top-level sidebar nav item in Dashboard.jsx**

Friday Panel is a **top-level view** (same level as Studio Overview, not a tab inside it). In `Dashboard.jsx`, add to the sidebar navigation:

```javascript
import FridayPanel from './dashboard/FridayPanel';
```

Add a Friday nav item in the sidebar (after existing nav items):
```jsx
<button
  onClick={() => { setActiveProject(null); setActiveAgent(null); setActiveView('friday'); }}
  className={`sidebar-item ${activeView === 'friday' ? 'active' : ''}`}
>
  🎙️ Friday
</button>
```

Add to the content router:
```javascript
const renderContent = () => {
  if (activeView === 'friday') return <FridayPanel />;
  if (activeAgent) return <AgentProfile agentId={activeAgent} />;
  if (activeProject) return <GameDetail slug={activeProject} />;
  return <StudioOverview />;
};
```

Add `activeView` state:
```javascript
const [activeView, setActiveView] = useState(null);
```

Clear `activeView` when navigating to projects/agents, and clear project/agent when navigating to Friday.

- [ ] **Step 2: Create FridaySettings section**

`src/components/dashboard/friday/FridaySettings.jsx`:
```jsx
import { useState, useEffect } from 'react';
import { useStore } from '../../../store/useStore';

export default function FridaySettings() {
  const fridayEnabled = useStore(s => s.fridayEnabled);
  const fridayServerUrl = useStore(s => s.fridayServerUrl);
  const fridayStatus = useStore(s => s.fridayStatus);
  const setFridayEnabled = useStore(s => s.setFridayEnabled);
  const setFridayServerUrl = useStore(s => s.setFridayServerUrl);
  const connectFriday = useStore(s => s.connectFriday);
  const disconnectFriday = useStore(s => s.disconnectFriday);

  const [urlInput, setUrlInput] = useState(fridayServerUrl);
  const [xaiKeyInput, setXaiKeyInput] = useState('');
  const [xaiKeyStatus, setXaiKeyStatus] = useState('unknown');

  useEffect(() => {
    // Check if xAI key is stored
    window.electronAPI?.secrets?.getStatus?.().then(status => {
      setXaiKeyStatus(status?.friday?.connected ? 'connected' : 'not-set');
    });
  }, []);

  const handleUrlSave = () => {
    setFridayServerUrl(urlInput);
    if (fridayEnabled) {
      disconnectFriday().then(() => connectFriday());
    }
  };

  const handleXaiKeySave = async () => {
    if (!xaiKeyInput.trim()) return;
    await window.electronAPI?.secrets?.set('friday', { apiKey: xaiKeyInput.trim() });
    setXaiKeyInput('');
    setXaiKeyStatus('connected');
  };

  const statusColor = {
    connected: '#22C55E',
    connecting: '#EAB308',
    reconnecting: '#F97316',
    disconnected: '#6B7280',
  }[fridayStatus] || '#6B7280';

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-coe-text-primary">Enable Friday</div>
          <div className="text-[10px] text-coe-text-muted">Connect to Friday server for Studio Director features</div>
        </div>
        <button
          onClick={() => {
            const next = !fridayEnabled;
            setFridayEnabled(next);
            if (!next) disconnectFriday();
          }}
          className={`w-10 h-5 rounded-full transition-colors relative ${
            fridayEnabled ? 'bg-fuchsia-500' : 'bg-coe-border'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
              fridayEnabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 text-xs">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
        <span className="text-coe-text-secondary">{fridayStatus}</span>
      </div>

      {/* Server URL */}
      <div>
        <label className="text-[10px] text-coe-text-muted block mb-1">Server URL</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="flex-1 bg-coe-bg border border-coe-border rounded px-2 py-1
                       text-xs text-coe-text-primary"
          />
          <button
            onClick={handleUrlSave}
            className="px-2 py-1 text-[10px] border border-coe-border rounded
                       text-coe-text-muted hover:text-coe-accent transition-colors"
          >
            Save
          </button>
        </div>
      </div>

      {/* xAI API Key */}
      <div>
        <label className="text-[10px] text-coe-text-muted block mb-1">
          xAI API Key (Grok voice)
          <span className="ml-2" style={{ color: xaiKeyStatus === 'connected' ? '#22C55E' : '#6B7280' }}>
            {xaiKeyStatus === 'connected' ? '● Connected' : '○ Not set'}
          </span>
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={xaiKeyInput}
            onChange={(e) => setXaiKeyInput(e.target.value)}
            placeholder={xaiKeyStatus === 'connected' ? '••••••••' : 'xai-...'}
            className="flex-1 bg-coe-bg border border-coe-border rounded px-2 py-1
                       text-xs text-coe-text-primary"
          />
          <button
            onClick={handleXaiKeySave}
            disabled={!xaiKeyInput.trim()}
            className="px-2 py-1 text-[10px] border border-coe-border rounded
                       text-coe-text-muted hover:text-coe-accent transition-colors
                       disabled:opacity-30"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add FridaySettings to SettingsPanel**

In `SettingsPanel.jsx`, add import:
```javascript
import FridaySettings from './friday/FridaySettings';
```

Add a new `<Section>` block:
```jsx
<Section title="Friday — Studio Director">
  <FridaySettings />
</Section>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/StudioOverview.jsx src/components/Dashboard.jsx \
  src/components/dashboard/friday/FridaySettings.jsx src/components/dashboard/SettingsPanel.jsx
git commit -m "feat(friday): add Friday tab to dashboard and settings section"
```

---

### Task 9: Sound Events + Final Phase 1 Integration

**Files:**
- Modify: `src/utils/sounds.js`

- [ ] **Step 1: Add Friday sound events**

In `sounds.js`, add to the `SOUND_EVENTS` array:
```javascript
'friday-connect', 'friday-message', 'friday-alert'
```

Add synth fallbacks in the synth generation section:
```javascript
case 'friday-connect':
  // Rising two-tone: connection established
  playTone(context, gainNode, 440, 'sine', 0.15, 0, 0.08);
  playTone(context, gainNode, 660, 'sine', 0.15, 0.1, 0.08);
  break;
case 'friday-message':
  // Soft ping
  playTone(context, gainNode, 523, 'triangle', 0.1, 0, 0.12);
  break;
case 'friday-alert':
  // Attention tone
  playTone(context, gainNode, 880, 'sine', 0.12, 0, 0.06);
  playTone(context, gainNode, 880, 'sine', 0.12, 0.1, 0.06);
  break;
```

- [ ] **Step 2: Commit Phase 1 complete**

```bash
git add src/utils/sounds.js
git commit -m "feat(friday): add Friday sound events — Phase 1 complete"
```

---

## Chunk 2: Phase 2 — Voice & Visual

### Task 10: VoiceOrb Component

**Files:**
- Create: `src/components/dashboard/friday/VoiceOrb.jsx`

- [ ] **Step 1: Create Three.js VoiceOrb**

`src/components/dashboard/friday/VoiceOrb.jsx`:
```jsx
import { useRef, useEffect } from 'react';
import * as THREE from 'three';

const STATES = {
  off: { color: 0x374151, emissive: 0x000000, intensity: 0, pulseSpeed: 0, scale: 0.8 },
  idle: { color: 0xD946EF, emissive: 0xA855F7, intensity: 0.15, pulseSpeed: 1.5, scale: 1.0 },
  listening: { color: 0x3B82F6, emissive: 0x2563EB, intensity: 0.3, pulseSpeed: 3, scale: 1.0 },
  speaking: { color: 0x22C55E, emissive: 0x16A34A, intensity: 0.4, pulseSpeed: 4, scale: 1.05 },
  working: { color: 0xF97316, emissive: 0xEA580C, intensity: 0.3, pulseSpeed: 6, scale: 1.0 },
};

export default function VoiceOrb({ state = 'off', size = 180, audioLevel = 0 }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const frameRef = useRef(null);
  const stateRef = useRef(state);
  const audioRef = useRef(audioLevel);

  stateRef.current = state;
  audioRef.current = audioLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    camera.position.set(0, 0, 3);

    // Lights
    scene.add(new THREE.AmbientLight(0x404060, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(1, 1, 2);
    scene.add(dirLight);
    const pointLight = new THREE.PointLight(0xD946EF, 0.5, 8);
    pointLight.position.set(0, 0, 2);
    scene.add(pointLight);

    // Core sphere
    const geometry = new THREE.IcosahedronGeometry(0.8, 4);
    const material = new THREE.MeshStandardMaterial({
      color: STATES.idle.color,
      emissive: STATES.idle.emissive,
      emissiveIntensity: STATES.idle.intensity,
      metalness: 0.3,
      roughness: 0.4,
      wireframe: false,
    });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // Inner glow sphere
    const innerGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xD946EF,
      transparent: true,
      opacity: 0.3,
    });
    const innerSphere = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerSphere);

    // Orbit rings
    const ringGeo = new THREE.TorusGeometry(1.0, 0.008, 8, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xD946EF, transparent: true, opacity: 0.15 });
    const ring1 = new THREE.Mesh(ringGeo, ringMat);
    ring1.rotation.x = Math.PI / 3;
    scene.add(ring1);
    const ring2 = new THREE.Mesh(ringGeo.clone(), ringMat.clone());
    ring2.rotation.x = -Math.PI / 4;
    ring2.rotation.y = Math.PI / 5;
    scene.add(ring2);

    const startTime = Date.now();

    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      const t = (Date.now() - startTime) / 1000;
      const s = STATES[stateRef.current] || STATES.off;
      const audio = audioRef.current;

      // Smooth transition to target state
      const targetColor = new THREE.Color(s.color);
      const targetEmissive = new THREE.Color(s.emissive);
      material.color.lerp(targetColor, 0.05);
      material.emissive.lerp(targetEmissive, 0.05);
      material.emissiveIntensity += (s.intensity - material.emissiveIntensity) * 0.05;

      // Pulse
      const pulse = 1.0 + Math.sin(t * s.pulseSpeed) * 0.05;
      const audioScale = 1.0 + audio * 0.2;
      const targetScale = s.scale * pulse * audioScale;
      sphere.scale.setScalar(sphere.scale.x + (targetScale - sphere.scale.x) * 0.1);

      // Rotation
      sphere.rotation.x = t * 0.15;
      sphere.rotation.y = t * 0.25;

      // Inner glow
      innerMat.opacity = 0.15 + Math.sin(t * 2) * 0.1 + audio * 0.3;
      innerSphere.scale.setScalar(0.3 + audio * 0.15);

      // Rings
      ring1.rotation.z = t * 0.3;
      ring2.rotation.z = -t * 0.2;
      ring1.material.opacity = 0.1 + audio * 0.15;
      ring2.material.opacity = 0.08 + audio * 0.1;

      // Point light color follows state
      pointLight.color.lerp(targetColor, 0.05);

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      geometry.dispose();
      material.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/friday/VoiceOrb.jsx
git commit -m "feat(friday): add Three.js VoiceOrb with 5 visual states"
```

---

### Task 11: Floating Mini-Orb

**Files:**
- Create: `src/components/dashboard/friday/FloatingMiniOrb.jsx`
- Modify: `src/components/Dashboard.jsx`

- [ ] **Step 1: Create FloatingMiniOrb**

`src/components/dashboard/friday/FloatingMiniOrb.jsx`:
```jsx
import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../../store/useStore';

export default function FloatingMiniOrb({ onNavigateToFriday }) {
  const fridayEnabled = useStore(s => s.fridayEnabled);
  const fridayStatus = useStore(s => s.fridayStatus);
  const fridayMessages = useStore(s => s.fridayMessages);

  const [narration, setNarration] = useState(null);
  const narrationTimer = useRef(null);

  // Show latest Friday message as narration bubble
  useEffect(() => {
    if (!fridayEnabled || fridayMessages.length === 0) return;
    const lastMsg = fridayMessages[fridayMessages.length - 1];
    if (lastMsg.role !== 'assistant' || lastMsg.type === 'status') return;

    const preview = lastMsg.content.length > 80
      ? lastMsg.content.slice(0, 77) + '...'
      : lastMsg.content;
    setNarration(preview);

    if (narrationTimer.current) clearTimeout(narrationTimer.current);
    narrationTimer.current = setTimeout(() => setNarration(null), 5000);
  }, [fridayMessages, fridayEnabled]);

  if (!fridayEnabled) return null;

  const stateStyles = {
    connected: {
      bg: 'radial-gradient(circle at 40% 40%, #D946EF, #A855F7 50%, #7E22CE)',
      shadow: '0 0 20px rgba(217,70,239,0.4), 0 0 40px rgba(217,70,239,0.15)',
      innerOpacity: 0.8,
    },
    connecting: {
      bg: 'radial-gradient(circle at 40% 40%, #EAB308, #CA8A04 50%, #854D0E)',
      shadow: '0 0 12px rgba(234,179,8,0.3)',
      innerOpacity: 0.5,
    },
    reconnecting: {
      bg: 'radial-gradient(circle at 40% 40%, #F97316, #EA580C 50%, #9A3412)',
      shadow: '0 0 12px rgba(249,115,22,0.3)',
      innerOpacity: 0.5,
    },
    disconnected: {
      bg: '#374151',
      shadow: 'none',
      innerOpacity: 0.3,
    },
  };

  const style = stateStyles[fridayStatus] || stateStyles.disconnected;

  return (
    <div className="fixed bottom-6 right-6 z-30 flex flex-col items-center gap-2">
      {/* Narration bubble */}
      {narration && (
        <div
          className="max-w-[220px] px-3 py-2 rounded-lg text-[10px] text-fuchsia-300 leading-relaxed
                     animate-fade-in cursor-pointer"
          style={{
            background: 'rgba(217,70,239,0.1)',
            border: '1px solid rgba(217,70,239,0.25)',
            backdropFilter: 'blur(8px)',
          }}
          onClick={onNavigateToFriday}
        >
          {narration}
        </div>
      )}

      {/* Orb */}
      <button
        onClick={onNavigateToFriday}
        className="w-14 h-14 rounded-full flex items-center justify-center transition-transform
                   hover:scale-110 active:scale-95"
        style={{
          background: style.bg,
          boxShadow: style.shadow,
        }}
      >
        <div
          className="w-5 h-5 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.6), rgba(217,70,239,0.4))',
            opacity: style.innerOpacity,
          }}
        />
      </button>

      {/* Label */}
      <div className="text-[9px] text-fuchsia-500/60 tracking-widest uppercase">
        Friday
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add FloatingMiniOrb to Dashboard.jsx**

Import and render at the bottom of the Dashboard component, outside the main content area:
```jsx
import FloatingMiniOrb from './dashboard/friday/FloatingMiniOrb';

// Inside Dashboard render, after the main content:
<FloatingMiniOrb onNavigateToFriday={() => {
  setActiveProject(null);
  setActiveAgent(null);
  setActiveView('friday');
}} />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/friday/FloatingMiniOrb.jsx src/components/Dashboard.jsx
git commit -m "feat(friday): add FloatingMiniOrb overlay on all dashboard views"
```

---

### Task 12: Audio Capture + Playback Utility

**Files:**
- Create: `src/utils/fridayAudio.js`
- Modify: `electron/main.cjs` (audio relay)
- Modify: `electron/preload.cjs` (audio IPC)

- [ ] **Step 1: Create audio utility**

`src/utils/fridayAudio.js`:
```javascript
// Mic capture → PCM 16-bit 24kHz → IPC → Friday → Grok
// Audio response → IPC → Web Audio API playback

let mediaStream = null;
let audioContext = null;
let scriptProcessor = null;

export async function startMicCapture() {
  if (mediaStream) return; // already capturing

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: 24000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  audioContext = new AudioContext({ sampleRate: 24000 });
  const source = audioContext.createMediaStreamSource(mediaStream);

  // ScriptProcessor for raw PCM access (deprecated but simple; replace with AudioWorklet if needed)
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

  scriptProcessor.onaudioprocess = (e) => {
    const float32 = e.inputBuffer.getChannelData(0);

    // Convert Float32 → Int16 PCM
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Send to main process
    window.electronAPI?.friday?.sendAudio?.(int16.buffer);

    // Calculate audio level for VoiceOrb animation
    let sum = 0;
    for (let i = 0; i < float32.length; i++) {
      sum += float32[i] * float32[i];
    }
    const rms = Math.sqrt(sum / float32.length);
    const level = Math.min(1, rms * 5); // normalize to 0-1

    if (window.__fridayAudioLevelCallback) {
      window.__fridayAudioLevelCallback(level);
    }
  };

  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);
}

export function stopMicCapture() {
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

// Playback incoming audio from Friday
let playbackContext = null;
let playbackQueue = [];
let isPlaying = false;

export function initPlayback() {
  if (!playbackContext) {
    playbackContext = new AudioContext({ sampleRate: 24000 });
  }
}

export function queueAudioChunk(arrayBuffer) {
  initPlayback();

  // Convert Int16 PCM → Float32
  const int16 = new Int16Array(arrayBuffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF);
  }

  const buffer = playbackContext.createBuffer(1, float32.length, 24000);
  buffer.getChannelData(0).set(float32);
  playbackQueue.push(buffer);

  if (!isPlaying) playNext();
}

function playNext() {
  if (playbackQueue.length === 0) {
    isPlaying = false;
    return;
  }
  isPlaying = true;
  const buffer = playbackQueue.shift();
  const source = playbackContext.createBufferSource();
  source.buffer = buffer;
  source.connect(playbackContext.destination);
  source.onended = playNext;
  source.start();
}

export function setAudioLevelCallback(callback) {
  window.__fridayAudioLevelCallback = callback;
}
```

- [ ] **Step 2: Add audio IPC to preload**

Add to the `friday:` object in preload.cjs:
```javascript
sendAudio: (buffer) => ipcRenderer.send('friday:audio-out', buffer),
onAudioIn: (callback) => {
  const handler = (event, data) => callback(data);
  ipcRenderer.on('friday:audio-in', handler);
  return () => ipcRenderer.removeListener('friday:audio-in', handler);
},
onVoiceState: (callback) => {
  const handler = (event, state) => callback(state);
  ipcRenderer.on('friday:voice-state', handler);
  return () => ipcRenderer.removeListener('friday:voice-state', handler);
},
```

- [ ] **Step 3: Add audio relay to main.cjs**

Add to the Friday bridge section:
```javascript
// Audio relay: browser mic → Friday server
ipcMain.on('friday:audio-out', (event, buffer) => {
  if (fridayWs && fridayWs.readyState === WebSocket.OPEN) {
    fridayWs.send(Buffer.from(buffer));
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add src/utils/fridayAudio.js electron/preload.cjs electron/main.cjs
git commit -m "feat(friday): add audio capture, playback, and IPC relay"
```

---

### Task 13: Integrate VoiceOrb into FridayPanel + Voice Controls

**Files:**
- Modify: `src/components/dashboard/FridayPanel.jsx`

- [ ] **Step 1: Replace VoiceOrb placeholder with real component**

Update FridayPanel.jsx imports:
```javascript
import VoiceOrb from './friday/VoiceOrb';
import { startMicCapture, stopMicCapture, queueAudioChunk, setAudioLevelCallback } from '../../utils/fridayAudio';
```

Replace the VoiceOrb placeholder div with:
```jsx
const [voiceState, setVoiceState] = useState('idle'); // idle, listening, speaking
const [audioLevel, setAudioLevel] = useState(0);
const [isMuted, setIsMuted] = useState(false);

// Audio level callback
useEffect(() => {
  setAudioLevelCallback((level) => setAudioLevel(level));
}, []);

// Listen for incoming audio
useEffect(() => {
  if (!window.electronAPI?.friday) return;
  const unsub = window.electronAPI.friday.onAudioIn((data) => {
    queueAudioChunk(data);
    setVoiceState('speaking');
  });
  return unsub;
}, []);

const handlePushToTalk = async () => {
  if (voiceState === 'listening') {
    stopMicCapture();
    setVoiceState('idle');
  } else {
    await startMicCapture();
    setVoiceState('listening');
    // Notify Friday server
    window.electronAPI?.friday?.send({ type: 'voice:start', format: 'pcm16', sampleRate: 24000 });
  }
};

// In the left column, replace the placeholder:
<VoiceOrb
  state={fridayEnabled ? (fridayStatus === 'connected' ? voiceState : 'off') : 'off'}
  size={160}
  audioLevel={audioLevel}
/>

{/* Voice controls */}
<div className="flex gap-2 mt-2">
  <button
    onClick={handlePushToTalk}
    disabled={fridayStatus !== 'connected'}
    className={`px-4 py-2 text-xs rounded-full border transition-colors ${
      voiceState === 'listening'
        ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
        : 'border-fuchsia-500/30 text-fuchsia-400 hover:bg-fuchsia-500/10'
    } disabled:opacity-30`}
  >
    {voiceState === 'listening' ? '⏹ Stop' : '🎤 Push to Talk'}
  </button>
  <button
    onClick={() => setIsMuted(!isMuted)}
    className={`px-3 py-2 text-xs rounded-full border transition-colors ${
      isMuted
        ? 'border-red-500/30 text-red-400'
        : 'border-coe-border text-coe-text-muted'
    }`}
  >
    {isMuted ? '🔇' : '🔊'}
  </button>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/FridayPanel.jsx
git commit -m "feat(friday): integrate VoiceOrb and voice controls into FridayPanel"
```

---

### Task 14: Ambient Narration Engine

**Files:**
- Create: `src/utils/fridayNarration.js`
- Modify: `src/store/useStore.js`

- [ ] **Step 1: Create narration utility**

`src/utils/fridayNarration.js`:
```javascript
// Maps chokidar file events to narration events for Friday
// Throttles: events within 30s get batched

const NARRATION_THROTTLE_MS = 30000;
let eventBuffer = [];
let flushTimer = null;

const EVENT_PATTERNS = [
  {
    pattern: /recommendations\/.*\.json$/,
    action: 'add',
    toEvent: (filePath) => {
      const filename = filePath.split('/').pop().replace('.json', '');
      return { event: 'rec-created', detail: `New recommendation: ${filename}` };
    },
  },
  {
    pattern: /ideas\/.*\.json$/,
    action: 'add',
    toEvent: (filePath) => {
      const filename = filePath.split('/').pop().replace('.json', '');
      return { event: 'idea-posted', detail: `New idea: ${filename}` };
    },
  },
  {
    pattern: /features\.json$/,
    action: 'change',
    toEvent: (filePath) => {
      const slug = filePath.split('/projects/')[1]?.split('/')[0] || 'unknown';
      return { event: 'features-updated', detail: `Features updated for ${slug}`, project: slug };
    },
  },
  {
    pattern: /execution-log\.json$/,
    action: 'change',
    toEvent: () => ({ event: 'automation-fired', detail: 'Automation executed' }),
  },
];

export function processFileEvent(filePath, action, sendToFriday) {
  // Normalize path
  const normalized = filePath.replace(/\\/g, '/');

  for (const rule of EVENT_PATTERNS) {
    if (rule.pattern.test(normalized) && (!rule.action || rule.action === action)) {
      const coeEvent = rule.toEvent(normalized);
      eventBuffer.push({ ...coeEvent, timestamp: Date.now() });
      scheduleFlush(sendToFriday);
      return;
    }
  }
}

function scheduleFlush(sendToFriday) {
  if (flushTimer) return; // already scheduled
  flushTimer = setTimeout(() => {
    flushEvents(sendToFriday);
    flushTimer = null;
  }, NARRATION_THROTTLE_MS);
}

function flushEvents(sendToFriday) {
  if (eventBuffer.length === 0) return;

  if (eventBuffer.length === 1) {
    sendToFriday(eventBuffer[0]);
  } else {
    // Batch: send summary
    sendToFriday({
      event: 'batch',
      detail: `${eventBuffer.length} things happened: ${eventBuffer.map(e => e.detail).join('; ')}`,
      events: eventBuffer,
    });
  }

  eventBuffer = [];
}

// Force flush (e.g., on disconnect)
export function flushNarrationBuffer(sendToFriday) {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushEvents(sendToFriday);
}
```

- [ ] **Step 2: Wire narration into store's file watcher**

At the **top of `useStore.js`**, add import:
```javascript
import { processFileEvent } from '../utils/fridayNarration';
```

In `setupFridayListeners`, add file change listener:
```javascript
// When hq file changes detected (existing event uses {event, path} fields):
const unsubFileChange = window.electronAPI?.hq?.onFileChanged?.(({ event: action, path: filePath }) => {
  if (get().fridayEnabled && get().fridayStatus === 'connected') {
    processFileEvent(filePath, action, (coeEvent) => {
      window.electronAPI.friday.sendEvent(coeEvent);
    });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/fridayNarration.js src/store/useStore.js
git commit -m "feat(friday): add ambient narration engine with 30s throttle batching"
```

---

### Task 15: Morning Briefing

**Files:**
- Modify: `src/store/useStore.js`

- [ ] **Step 1: Add morning briefing trigger**

In the `setupFridayListeners` function, when status becomes 'connected':
```javascript
// In the onStatus handler, when status === 'connected':
if (status === 'connected') {
  get().addFridayMessage({ role: 'system', content: 'Connected to Friday', type: 'status' });

  // Trigger morning briefing
  const fridaySettings = get().fridaySettings || {};
  if (fridaySettings.morningBriefing !== false) {
    // Send briefing request — Friday will use her CoE Module tools to read studio data
    window.electronAPI.friday.send({
      type: 'chat:message',
      content: 'Give me a morning briefing. Use your studio tools to check what happened since my last session, any pending recommendations, scheduled work today, and blockers across all projects. Be concise.',
      clientType: 'text',
      _meta: { isBriefing: true },
    });
  }
}
```

- [ ] **Step 2: Add morning briefing setting to store**

```javascript
fridaySettings: loadPersistedData('coe-friday-settings', {
  morningBriefing: true,
  ambientNarration: true,
  narrationVerbosity: 'medium', // low, medium, high
  voice: 'Eve',
  confirmLevel: 'all', // all, writes-only, never
}),

updateFridaySettings: (updates) => {
  set(state => {
    const updated = { ...state.fridaySettings, ...updates };
    try { localStorage.setItem('coe-friday-settings', JSON.stringify(updated)); } catch {}
    return { fridaySettings: updated };
  });
},
```

- [ ] **Step 3: Commit**

```bash
git add src/store/useStore.js
git commit -m "feat(friday): add morning briefing on connect + extended settings — Phase 2 complete"
```

---

## Chunk 3: Phase 3 — Agent Commander

### Task 16: Command Tools in CoE Module

**Files:**
- Create: `friday-module/coe-studio/tools/spawn-agent.ts`
- Create: `friday-module/coe-studio/tools/queue-task.ts`
- Create: `friday-module/coe-studio/tools/post-activity.ts`
- Create: `friday-module/coe-studio/tools/trigger-automation.ts`
- Modify: `friday-module/coe-studio/index.ts`

- [ ] **Step 1: Create spawn-agent tool**

`friday-module/coe-studio/tools/spawn-agent.ts`:
```typescript
export function spawnAgent() {
  return {
    name: 'spawn_agent',
    description: 'Request CoE to spawn an agent terminal session with a specific task instruction. Sends a coe:command via WebSocket — CoE will ask the boss for confirmation before executing.',
    parameters: [
      { name: 'agent', type: 'string' as const, required: true, description: 'Agent slug (e.g., qa-advisor, market-analyst, store-optimizer)' },
      { name: 'project', type: 'string' as const, required: true, description: 'Project slug (expedition, ttr-ios, ttr-roblox)' },
      { name: 'instruction', type: 'string' as const, required: true, description: 'Task instruction for the agent' },
    ],
    clearance: ['exec-shell', 'write-fs'] as const,
    async execute(args: { agent: string; project: string; instruction: string }, context: any) {
      const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // Send command request via WebSocket — CoE handles confirmation
      if (context?.ws?.send) {
        context.ws.send(JSON.stringify({
          type: 'coe:command',
          commandId,
          command: 'spawn-agent',
          args: {
            agent: args.agent,
            project: args.project,
            instruction: args.instruction,
          },
          confirmRequired: true,
        }));
      }

      return {
        success: true,
        output: `Requested agent spawn: ${args.agent} on ${args.project}. Awaiting boss confirmation (commandId: ${commandId}).`,
      };
    },
  };
}
```

- [ ] **Step 2: Create queue-task tool**

`friday-module/coe-studio/tools/queue-task.ts`:
```typescript
export function queueTask() {
  return {
    name: 'queue_task',
    description: 'Queue a multi-agent task for orchestrated execution. All writes go through CoE (single writer). Supports parallel, sequential, and conditional strategies.',
    parameters: [
      { name: 'project', type: 'string' as const, required: true, description: 'Project slug' },
      { name: 'agents', type: 'string' as const, required: true, description: 'JSON array of {agent, instruction} objects' },
      { name: 'strategy', type: 'string' as const, required: false, description: 'Execution strategy: parallel (default), sequential, conditional' },
    ],
    clearance: ['write-fs'] as const,
    async execute(args: { project: string; agents: string; strategy?: string }, context: any) {
      let agentList;
      try {
        agentList = JSON.parse(args.agents);
      } catch {
        return { success: false, output: 'Invalid agents JSON. Expected: [{"agent":"slug","instruction":"..."}]' };
      }

      const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const taskId = `task-${Date.now()}`;

      if (context?.ws?.send) {
        context.ws.send(JSON.stringify({
          type: 'coe:command',
          commandId,
          command: 'queue-task',
          args: {
            taskId,
            project: args.project,
            agents: agentList,
            strategy: args.strategy || 'parallel',
          },
          confirmRequired: true,
        }));
      }

      return {
        success: true,
        output: `Queued multi-agent task (${taskId}): ${agentList.length} agents on ${args.project} (${args.strategy || 'parallel'}). Awaiting confirmation.`,
      };
    },
  };
}
```

- [ ] **Step 3: Create post-activity tool**

NOTE: Per spec, all writes to hq-data go through Electron (single writer). This tool sends a `coe:command` rather than writing directly.

`friday-module/coe-studio/tools/post-activity.ts`:
```typescript
export function postActivity() {
  return {
    name: 'post_activity',
    description: 'Log a Friday action to the studio activity log. Sends via WebSocket to CoE (single writer pattern).',
    parameters: [
      { name: 'action', type: 'string' as const, required: true, description: 'Description of the action' },
      { name: 'project', type: 'string' as const, required: false, description: 'Project name (if relevant)' },
    ],
    clearance: ['write-fs'] as const,
    async execute(args: { action: string; project?: string }, context: any) {
      const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      if (context?.ws?.send) {
        context.ws.send(JSON.stringify({
          type: 'coe:command',
          commandId,
          command: 'post-activity',
          args: {
            agent: 'Friday',
            agentColor: '#D946EF',
            action: args.action,
            project: args.project || '',
          },
          confirmRequired: false, // Activity logging doesn't need confirmation
        }));
      }

      return { success: true, output: `Logged activity: ${args.action}` };
    },
  };
}
```

- [ ] **Step 4: Create trigger-automation tool**

`friday-module/coe-studio/tools/trigger-automation.ts`:
```typescript
export function triggerAutomation() {
  return {
    name: 'trigger_automation',
    description: 'Request CoE to fire an existing automation schedule immediately',
    parameters: [
      { name: 'automationId', type: 'string' as const, required: true, description: 'Automation schedule ID' },
    ],
    clearance: ['exec-shell'] as const,
    async execute(args: { automationId: string }, context: any) {
      const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      if (context?.ws?.send) {
        context.ws.send(JSON.stringify({
          type: 'coe:command',
          commandId,
          command: 'trigger-automation',
          args: { automationId: args.automationId },
          confirmRequired: true,
        }));
      }

      return {
        success: true,
        output: `Requested automation trigger: ${args.automationId}. Awaiting confirmation.`,
      };
    },
  };
}
```

- [ ] **Step 5: Update module index to include Phase 3 tools**

In `friday-module/coe-studio/index.ts`, add imports and include in tools array:
```typescript
import { spawnAgent } from './tools/spawn-agent';
import { queueTask } from './tools/queue-task';
import { postActivity } from './tools/post-activity';
import { triggerAutomation } from './tools/trigger-automation';

// In tools array:
tools: [
  // Phase 1 read tools...
  studioProjects(HQ_DATA),
  readFeatures(HQ_DATA),
  readRecommendations(HQ_DATA),
  readActivityLog(HQ_DATA),
  readProgress(HQ_DATA),
  readContext(HQ_DATA),
  studioOverview(HQ_DATA),
  // Phase 3 command tools
  spawnAgent(),
  queueTask(),
  postActivity(),
  triggerAutomation(),
],
```

- [ ] **Step 6: Commit**

```bash
git add friday-module/coe-studio/
git commit -m "feat(friday): add Phase 3 command tools (spawn, queue, activity, automation)"
```

---

### Task 17: Task Queue Dispatcher in Electron Main

**Files:**
- Modify: `electron/main.cjs`
- Create: `hq-data/task-queue.json`

- [ ] **Step 1: Initialize empty task queue**

`hq-data/task-queue.json`:
```json
[]
```

- [ ] **Step 2: Add command handlers to main.cjs Friday bridge**

Add to the `fridayWs.on('message')` handler, inside the JSON parsing block:

```javascript
// Handle coe:command messages from Friday
if (msg.type === 'coe:command') {
  console.log(`[CoE Friday] Command received: ${msg.command} (confirmRequired=${msg.confirmRequired})`);

  // Store pending command for execution on approval
  fridayPendingCommands.set(msg.commandId, { command: msg.command, args: msg.args });

  if (msg.confirmRequired) {
    // Forward to renderer for user confirmation
    mainWindow.webContents.send('friday:command-confirm', {
      commandId: msg.commandId,
      command: msg.command,
      args: msg.args,
    });
  } else {
    // Execute immediately (not used in current design — all commands confirm)
    executeFridayCommand(msg.commandId, msg.command, msg.args);
  }
  return;
}
```

Add the command execution function:

```javascript
function executeFridayCommand(commandId, command, args) {
  console.log(`[CoE Friday] Executing: ${command}`, args);

  switch (command) {
    case 'spawn-agent': {
      const scopeId = `friday-${args.agent}-${Date.now()}`;
      const agentSkill = args.agent;
      const projectSlug = args.project;
      const instruction = args.instruction;

      // Create PTY with agent skill + instruction
      const cwd = 'C:\\Claude\\Agency';
      const proc = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env: ptyEnv(),
      });

      ptyProcesses.set(scopeId, proc);

      proc.onData((data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:data', { scopeId, data });
        }
      });

      proc.onExit(({ exitCode }) => {
        console.log(`[CoE Friday] Agent PTY exited: ${scopeId} code=${exitCode}`);
        ptyProcesses.delete(scopeId);
        mainWindow.webContents.send('terminal:exit', { scopeId, exitCode });
        // Notify Friday that agent is done
        mainWindow.webContents.send('friday:task-update', {
          commandId,
          agent: args.agent,
          project: args.project,
          status: 'completed',
          exitCode,
        });
      });

      // Auto-launch claude with agent skill
      setTimeout(() => {
        const cmd = `claude --allowedTools '' "@${agentSkill} ${instruction} (project: ${projectSlug})"`;
        proc.write(cmd + '\r');
      }, 500);

      mainWindow.webContents.send('friday:task-update', {
        commandId,
        agent: args.agent,
        project: args.project,
        status: 'in-progress',
        scopeId,
      });
      break;
    }

    case 'queue-task': {
      // Write to task queue file — Electron is single writer
      const taskQueuePath = path.join(hqDataPath, 'task-queue.json');
      let queue = [];
      try { queue = JSON.parse(fs.readFileSync(taskQueuePath, 'utf-8')); } catch {}

      const task = {
        id: args.taskId,
        requested_by: 'friday',
        timestamp: new Date().toISOString(),
        project: args.project,
        agents: args.agents.map(a => ({ ...a, status: 'pending' })),
        strategy: args.strategy || 'parallel',
        status: 'approved',
      };

      queue.push(task);
      fs.writeFileSync(taskQueuePath, JSON.stringify(queue, null, 2), 'utf-8');

      // Dispatch based on strategy
      if (task.strategy === 'parallel') {
        for (const agent of task.agents) {
          executeFridayCommand(
            `${commandId}-${agent.agent}`,
            'spawn-agent',
            { agent: agent.agent, project: args.project, instruction: agent.instruction }
          );
          agent.status = 'in-progress';
        }
      } else {
        // Sequential: spawn first agent, wait for completion
        const first = task.agents[0];
        executeFridayCommand(
          `${commandId}-${first.agent}`,
          'spawn-agent',
          { agent: first.agent, project: args.project, instruction: first.instruction }
        );
        first.status = 'in-progress';
      }

      fs.writeFileSync(taskQueuePath, JSON.stringify(queue, null, 2), 'utf-8');
      break;
    }

    case 'post-activity': {
      // Electron writes to activity-log.json (single writer)
      const logPath = path.join(hqDataPath, 'activity-log.json');
      let entries = [];
      try { entries = JSON.parse(fs.readFileSync(logPath, 'utf-8')); } catch {}
      const nextId = entries.length > 0 ? Math.max(...entries.map(e => e.id || 0)) + 1 : 1;
      entries.push({
        id: nextId,
        agent: args.agent || 'Friday',
        agentColor: args.agentColor || '#D946EF',
        action: args.action,
        project: args.project || '',
        timestamp: new Date().toISOString(),
      });
      fs.writeFileSync(logPath, JSON.stringify(entries, null, 2), 'utf-8');
      break;
    }

    case 'trigger-automation': {
      // Fire the automation schedule
      mainWindow.webContents.send('automation:run-now', { id: args.automationId });
      break;
    }

    default:
      console.warn(`[CoE Friday] Unknown command: ${command}`);
  }
}

// Handle confirmation responses from renderer
ipcMain.on('friday:command-respond', (event, { commandId, approved }) => {
  if (approved) {
    // Find the pending command and execute it
    // The command details were already forwarded to Friday — she's waiting
    // We need to track pending commands here
    const pending = fridayPendingCommands.get(commandId);
    if (pending) {
      executeFridayCommand(commandId, pending.command, pending.args);
      fridayPendingCommands.delete(commandId);
    }

    // Also confirm back to Friday
    if (fridayWs && fridayWs.readyState === WebSocket.OPEN) {
      fridayWs.send(JSON.stringify({ type: 'coe:confirm', commandId, approved: true }));
    }
  } else {
    if (fridayWs && fridayWs.readyState === WebSocket.OPEN) {
      fridayWs.send(JSON.stringify({ type: 'coe:confirm', commandId, approved: false }));
    }
    fridayPendingCommands.delete(commandId);
  }
});

// Track pending commands (populated in the coe:command handler above)
const fridayPendingCommands = new Map();
```

- [ ] **Step 3: Add task IPC to preload**

In preload.cjs friday object:
```javascript
onCommandConfirm: (callback) => {
  const handler = (event, data) => callback(data);
  ipcRenderer.on('friday:command-confirm', handler);
  return () => ipcRenderer.removeListener('friday:command-confirm', handler);
},
onTaskUpdate: (callback) => {
  const handler = (event, data) => callback(data);
  ipcRenderer.on('friday:task-update', handler);
  return () => ipcRenderer.removeListener('friday:task-update', handler);
},
```

- [ ] **Step 4: Commit**

```bash
git add electron/main.cjs electron/preload.cjs hq-data/task-queue.json
git commit -m "feat(friday): add task queue dispatcher and command execution in Electron"
```

---

### Task 18: Confirm Dialog Component

**Files:**
- Create: `src/components/dashboard/friday/ConfirmDialog.jsx`
- Modify: `src/store/useStore.js`
- Modify: `src/components/dashboard/FridayPanel.jsx`

- [ ] **Step 1: Create ConfirmDialog**

`src/components/dashboard/friday/ConfirmDialog.jsx`:
```jsx
import { useStore } from '../../../store/useStore';
import { playSound } from '../../../utils/sounds';

const AGENT_NAMES = {
  'market-analyst': 'Market Analyst',
  'store-optimizer': 'Store Optimizer',
  'growth-strategist': 'Growth Strategist',
  'brand-director': 'Brand Director',
  'content-producer': 'Content Producer',
  'community-manager': 'Community Manager',
  'qa-advisor': 'QA Advisor',
  'studio-producer': 'Studio Producer',
  'monetization': 'Monetization Strategist',
  'player-psych': 'Player Psychologist',
  'art-director': 'Art Director',
  'creative-thinker': 'Creative Thinker',
  'tech-architect': 'Tech Architect',
  'hr-director': 'HR Director',
};

export default function ConfirmDialog({ command, onRespond }) {
  const handleApprove = () => {
    playSound('click');
    onRespond(command.commandId, true);
  };

  const handleDeny = () => {
    playSound('dismiss');
    onRespond(command.commandId, false);
  };

  const renderDescription = () => {
    switch (command.command) {
      case 'spawn-agent':
        return (
          <span>
            Spawn <strong style={{ color: '#D946EF' }}>{AGENT_NAMES[command.args.agent] || command.args.agent}</strong> to
            work on <strong>{command.args.project}</strong>: "{command.args.instruction}"
          </span>
        );
      case 'queue-task':
        return (
          <span>
            Run {command.args.agents?.length || '?'} agents on <strong>{command.args.project}</strong> ({command.args.strategy || 'parallel'})
          </span>
        );
      case 'trigger-automation':
        return <span>Fire automation: <strong>{command.args.automationId}</strong></span>;
      default:
        return <span>{command.command}: {JSON.stringify(command.args)}</span>;
    }
  };

  return (
    <div className="mx-3 my-2 p-3 rounded-lg border border-orange-500/20 bg-orange-500/5 animate-fade-in">
      <div className="text-[10px] text-orange-400 font-semibold mb-1.5">
        FRIDAY — Confirm Action
      </div>
      <div className="text-[11px] text-coe-text-primary leading-relaxed mb-3">
        {renderDescription()}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          className="px-3 py-1.5 text-[10px] rounded border border-green-500/30 text-green-400
                     hover:bg-green-500/10 transition-colors"
        >
          ✓ Do it
        </button>
        <button
          onClick={handleDeny}
          className="px-3 py-1.5 text-[10px] rounded border border-coe-border text-coe-text-muted
                     hover:text-red-400 hover:border-red-500/30 transition-colors"
        >
          ✗ Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire confirm handling into store**

Add to `setupFridayListeners` in useStore.js (no sound imports — sounds are played in component layer):
```javascript
const unsubCommandConfirm = window.electronAPI?.friday?.onCommandConfirm?.((data) => {
  get().addFridayPendingCommand(data);
});

const unsubTaskUpdate = window.electronAPI?.friday?.onTaskUpdate?.((data) => {
  get().addFridayMessage({
    role: 'system',
    content: `Agent ${data.agent} on ${data.project}: ${data.status}${data.exitCode !== undefined ? ` (exit ${data.exitCode})` : ''}`,
    type: 'task-update',
  });
});
```

In `FridayPanel.jsx`, add a `useEffect` to play sounds on state changes:
```javascript
import { playSound } from '../../utils/sounds';

// Play sounds when pending commands or task updates arrive
useEffect(() => {
  if (fridayPendingCommands.length > 0) playSound('friday-alert');
}, [fridayPendingCommands.length]);

useEffect(() => {
  const lastMsg = fridayMessages[fridayMessages.length - 1];
  if (lastMsg?.type === 'task-update' && lastMsg.content?.includes('completed')) {
    playSound('complete');
  }
}, [fridayMessages.length]);
```

- [ ] **Step 3: Add ConfirmDialog rendering to FridayPanel**

In FridayPanel.jsx, before the text input:
```jsx
import ConfirmDialog from './friday/ConfirmDialog';

// In the transcript area, after TranscriptFeed:
{fridayPendingCommands.map(cmd => (
  <ConfirmDialog
    key={cmd.commandId}
    command={cmd}
    onRespond={(commandId, approved) => {
      window.electronAPI?.friday?.respondToCommand(commandId, approved);
      removeFridayPendingCommand(commandId);
      addFridayMessage({
        role: 'system',
        content: approved ? `Approved: ${cmd.command}` : `Denied: ${cmd.command}`,
        type: 'status',
      });
    }}
  />
))}
```

Add to the store selectors at top of FridayPanel:
```javascript
const fridayPendingCommands = useStore(s => s.fridayPendingCommands);
const removeFridayPendingCommand = useStore(s => s.removeFridayPendingCommand);
const addFridayMessage = useStore(s => s.addFridayMessage);
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/friday/ConfirmDialog.jsx src/store/useStore.js src/components/dashboard/FridayPanel.jsx
git commit -m "feat(friday): add ConfirmDialog for agent commands — Phase 3 complete"
```

---

## Verification

### Post-Implementation Checklist

- [ ] Friday server starts on `bun run serve` and accepts WebSocket connections
- [ ] CoE Module symlinked via `npm run friday:setup`
- [ ] Toggle Friday on in Settings → WebSocket connects → status shows "connected"
- [ ] Type a question → Friday responds via transcript feed
- [ ] Morning briefing fires automatically on connect
- [ ] FloatingMiniOrb appears on all dashboard views when Friday is on
- [ ] FloatingMiniOrb hides when Friday is off
- [ ] VoiceOrb animates correctly across all 5 states
- [ ] Push-to-talk captures audio and relays to Friday
- [ ] Friday audio responses play through browser speakers
- [ ] File changes in hq-data trigger ambient narration (30s throttle)
- [ ] "Friday, get QA Advisor to check Expedition" → ConfirmDialog appears
- [ ] Approving spawns agent PTY → task-update notification on completion
- [ ] Multi-agent queue task works with parallel strategy
- [ ] Disconnecting Friday → mini-orb hides → CoE works normally
- [ ] Reconnect after server restart → exponential backoff → auto-reconnects
