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
