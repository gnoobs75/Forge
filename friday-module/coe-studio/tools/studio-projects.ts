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
