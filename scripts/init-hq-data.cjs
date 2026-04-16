// Bootstrap a fresh hq-data/ skeleton so Forge runs on a clean clone.
//
// Idempotent: if PATHS.hq('projects') already resolves to a real directory
// (Forge/hq-data OR a sibling legacy Samurai/hq-data), this script exits
// without touching anything.
//
// Run manually: node scripts/init-hq-data.cjs
// Auto-invoked by electron/main.cjs at startup.

const fs = require('node:fs');
const path = require('node:path');
const PATHS = require('../config/paths.cjs');

function writeIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

function initHqData() {
  const projectsDir = PATHS.hq('projects');

  if (fs.existsSync(projectsDir)) {
    return { created: false, hqData: PATHS.hqData };
  }

  const created = [];
  const json = (obj) => JSON.stringify(obj, null, 2) + '\n';

  // Root-level data files the app reads on startup
  const rootFiles = {
    'activity-log.json': json([]),
    'agent-brains.json': json({}),
    'ports.json': json({ registrations: [] }),
    'task-queue.json': json([]),
    'studio.json': json({ name: 'My Studio', projects: [] }),
  };

  // Automation subsystem
  const automationFiles = {
    'automation/schedules.json': json([]),
    'automation/chains.json': json([]),
    'automation/triggers.json': json([]),
    'automation/execution-log.json': json([]),
    'automation/defaults.json': json({}),
    'automation/email-config.json': json({ enabled: false, apiKey: '', recipient: '' }),
    'automation/git-state.json': json({}),
  };

  // Knowledge base stubs
  const knowledgeFiles = {
    'knowledge/index.json': json({}),
    'knowledge/refresh-log.json': json({}),
  };

  // Metering
  const meteringFiles = {
    'metering/budgets.json': json({}),
  };

  // _template project — reference shape for "New Project" flow
  const templateProject = {
    slug: '_template',
    name: 'Project Template',
    description: 'Copy this folder to start a new project',
    client: '',
    techStack: [],
    phase: 'discovery',
    repoPath: '',
    progress: 0,
    deadline: null,
    teamSize: 1,
    environments: { dev: '', staging: '', prod: '' },
  };
  const templateFeatures = { features: [] };
  const templateContext = [
    '# Project Template',
    '',
    'Replace this file with a narrative description of your project: ',
    'architecture overview, tech stack rationale, and current status.',
    '',
    'Agents read this alongside `features.json` to understand context.',
    ''
  ].join('\n');

  const projectFiles = {
    'projects/_template/project.json': json(templateProject),
    'projects/_template/features.json': json(templateFeatures),
    'projects/_template/context.md': templateContext,
    'projects/_template/recommendations/.gitkeep': '',
    'projects/_template/ideas/.gitkeep': '',
  };

  const allFiles = {
    ...rootFiles,
    ...automationFiles,
    ...knowledgeFiles,
    ...meteringFiles,
    ...projectFiles,
  };

  for (const [relPath, content] of Object.entries(allFiles)) {
    const abs = PATHS.hq(relPath);
    if (writeIfMissing(abs, content)) created.push(relPath);
  }

  return { created: true, hqData: PATHS.hqData, files: created };
}

if (require.main === module) {
  const result = initHqData();
  if (result.created) {
    console.log(`[init-hq-data] Created ${result.files.length} files in ${result.hqData}`);
  } else {
    console.log(`[init-hq-data] hq-data already present at ${result.hqData} — no changes`);
  }
}

module.exports = { initHqData };
