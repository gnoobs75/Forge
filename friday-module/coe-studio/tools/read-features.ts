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
