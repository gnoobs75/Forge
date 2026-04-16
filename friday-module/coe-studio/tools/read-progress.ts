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
