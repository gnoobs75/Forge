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
    name: 'forge-agent-roster',
    domain: 'studio',
    tags: ['agents', 'council', 'roster'],
    content: `The Forge has 14 specialist agents:
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
    name: 'forge-studio-workflows',
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
          name: `forge-project-${slug}`,
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
          source: 'forge-studio-module',
        });
      } catch (err) {
        console.warn(`[forge-studio] Failed to seed: ${seed.name}`, err);
      }
    }
    console.log(`[forge-studio] Seeded ${seeds.length} knowledge entries to SMARTS`);
  } else {
    console.warn('[forge-studio] SMARTS context not available — skipping knowledge seeding');
  }
}
