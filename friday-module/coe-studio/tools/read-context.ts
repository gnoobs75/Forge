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
