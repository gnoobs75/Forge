// Per-agent brain (model) selection constants and helpers

export const BRAIN_PROVIDERS = {
  claude: {
    name: 'Claude (Anthropic)',
    icon: '\u2726',       // ✦
    color: '#D97706',
    active: true,
    models: [
      { id: 'opus', name: 'Opus 4.6', desc: 'Most capable. Complex reasoning, architecture.', tier: 'premium', color: '#D97706' },
      { id: 'sonnet', name: 'Sonnet 4.6', desc: 'Balanced. Great for most tasks.', tier: 'standard', color: '#3B82F6' },
      { id: 'haiku', name: 'Haiku 4.5', desc: 'Fastest. Quick checks, simple tasks.', tier: 'economy', color: '#22C55E' },
    ],
  },
  ollama: {
    name: 'Ollama (Local)',
    icon: '\uD83E\uDD99', // 🦙
    color: '#666',
    active: false,
    models: [],
  },
  openai: {
    name: 'OpenAI',
    icon: '\u25C6',       // ◆
    color: '#666',
    active: false,
    models: [],
  },
};

export const RECOMMENDED_BRAINS = {
  'solutions-architect': { model: 'opus',   reason: 'Complex system design, architecture' },
  'security-auditor':    { model: 'opus',   reason: 'Deep security analysis, compliance' },
  'code-reviewer':       { model: 'opus',   reason: 'Thorough code review, quality assessment' },
  'data-engineer':       { model: 'opus',   reason: 'Complex schema design, query optimization' },
  'backend-engineer':    { model: 'sonnet', reason: 'API implementation, business logic' },
  'frontend-engineer':   { model: 'sonnet', reason: 'UI/UX implementation, components' },
  'product-owner':       { model: 'sonnet', reason: 'Requirements, user stories, planning' },
  'project-manager':     { model: 'sonnet', reason: 'Timeline, dependencies, reporting' },
  'api-designer':        { model: 'sonnet', reason: 'API design, OpenAPI specs' },
  'ux-researcher':       { model: 'sonnet', reason: 'User flows, wireframes, accessibility' },
  'technical-writer':    { model: 'sonnet', reason: 'Documentation, runbooks, ADRs' },
  'performance-engineer':{ model: 'sonnet', reason: 'Profiling, caching, optimization' },
  'qa-lead':             { model: 'haiku',  reason: 'Quick test checks, quality gates, fast' },
  'devops-engineer':     { model: 'haiku',  reason: 'CI/CD checks, deployment, fast' },
};

const DEFAULT_BRAIN = { provider: 'claude', model: 'opus' };

/** Get the brain config for an agent, falling back to Opus default */
export function getAgentBrain(agentId, agentBrains = {}) {
  return agentBrains[agentId] || DEFAULT_BRAIN;
}

/** Get the --model CLI flag value. Returns empty string for opus (the default). */
export function getModelFlag(brain) {
  if (!brain || brain.provider !== 'claude') return '';
  if (brain.model === 'opus') return '';  // opus is default, no flag needed
  return brain.model || '';
}

/** Get display info for a brain config */
export function getModelDisplay(brain) {
  const b = brain || DEFAULT_BRAIN;
  const provider = BRAIN_PROVIDERS[b.provider] || BRAIN_PROVIDERS.claude;
  const model = provider.models.find(m => m.id === b.model) || provider.models[0];
  if (!model) return { name: 'Opus 4.6', color: '#D97706', tier: 'premium' };
  return { name: model.name, color: model.color, tier: model.tier };
}
