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
