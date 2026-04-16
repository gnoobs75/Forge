export interface DispatchRecord {
  id: string;
  agent: string;
  agentSlug: string;
  project: string;
  prompt: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  status: "running" | "completed" | "failed" | "timeout" | "cancelled";
  output?: string;
  error?: string;
}

export interface MeterRecord {
  id: string;
  timestamp: string;
  provider: "claude" | "grok" | "groq";
  model: string;
  source: "agent-dispatch" | "friday-inference" | "council-chat" | "idea-generation" | "idea-analysis" | "implementation" | "automation";
  agent: string | null;
  agentSlug: string | null;
  project: string | null;
  linkType: "idea" | "recommendation" | "automation" | null;
  linkId: string | null;
  tokens: {
    input: number;
    output: number;
    total: number;
    estimated: boolean;
  };
  durationMs: number;
  status: "completed" | "failed" | "timeout";
}

export interface ProviderTotals {
  input: number;
  output: number;
  total: number;
  sessions: number;
}

export interface MeterSummary {
  today: {
    date: string;
    claude: ProviderTotals;
    grok: ProviderTotals;
    groq: ProviderTotals;
  };
  thisWeek: {
    claude: ProviderTotals;
    grok: ProviderTotals;
    groq: ProviderTotals;
  };
  byAgent: Record<string, { claude: number; grok: number; sessions: number }>;
  byProject: Record<string, { claude: number; grok: number; sessions: number }>;
  byFeature: Array<{
    linkId: string;
    linkType: string;
    title: string;
    project: string;
    totalTokens: number;
    stages: Record<string, number>;
  }>;
  automation: { claude: number; grok: number; sessions: number };
}

export interface BudgetConfig {
  daily: {
    claude: { tokenLimit: number; warnAt: number };
    grok: { tokenLimit: number; warnAt: number };
  };
  weekly: {
    claude: { tokenLimit: number; warnAt: number };
    grok: { tokenLimit: number; warnAt: number };
  };
  perSession: {
    claude: { tokenLimit: number };
  };
}

export interface AgentInfo {
  slug: string;
  name: string;
  color: string;
  skillFile: string;
}

export interface ProjectInfo {
  slug: string;
  name: string;
}

export const AGENT_REGISTRY: AgentInfo[] = [
  { slug: "market-analyst", name: "Market Analyst", color: "#3B82F6", skillFile: "market-analyst.md" },
  { slug: "store-optimizer", name: "Store Optimizer", color: "#22C55E", skillFile: "store-optimizer.md" },
  { slug: "growth-strategist", name: "Growth Strategist", color: "#F97316", skillFile: "growth-strategist.md" },
  { slug: "brand-director", name: "Brand Director", color: "#8B5CF6", skillFile: "brand-director.md" },
  { slug: "content-producer", name: "Content Producer", color: "#EC4899", skillFile: "content-producer.md" },
  { slug: "community-manager", name: "Community Manager", color: "#06B6D4", skillFile: "community-manager.md" },
  { slug: "qa-advisor", name: "QA Advisor", color: "#EF4444", skillFile: "qa-advisor.md" },
  { slug: "studio-producer", name: "Studio Producer", color: "#EAB308", skillFile: "studio-producer.md" },
  { slug: "monetization", name: "Monetization Strategist", color: "#10B981", skillFile: "monetization-strategist.md" },
  { slug: "player-psych", name: "Player Psychologist", color: "#7C3AED", skillFile: "player-psychologist.md" },
  { slug: "art-director", name: "Art Director", color: "#F59E0B", skillFile: "art-director.md" },
  { slug: "creative-thinker", name: "Creative Thinker", color: "#FF6B6B", skillFile: "creative-thinker.md" },
  { slug: "tech-architect", name: "Tech Architect", color: "#0EA5E9", skillFile: "tech-architect.md" },
  { slug: "hr-director", name: "HR Director", color: "#D4A574", skillFile: "hr-director.md" },
];

export const PROJECT_REGISTRY: ProjectInfo[] = [
  { slug: "expedition", name: "Expedition" },
  { slug: "ttr-ios", name: "TTR iOS" },
  { slug: "ttr-roblox", name: "TTR Roblox" },
];

export function findAgent(slug: string): AgentInfo | undefined {
  return AGENT_REGISTRY.find((a) => a.slug === slug);
}

export function findProject(slug: string): ProjectInfo | undefined {
  return PROJECT_REGISTRY.find((p) => p.slug === slug);
}

export function listAgentSlugs(): string[] {
  return AGENT_REGISTRY.map((a) => a.slug);
}

export function listProjectSlugs(): string[] {
  return PROJECT_REGISTRY.map((p) => p.slug);
}
