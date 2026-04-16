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
