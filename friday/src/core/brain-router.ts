export interface BrainRouterConfig {
  mode: "auto" | "grok" | "claude";
  shortQueryThreshold: number;
  claudeKeywords: string[];
  voiceClaudeEnabled: boolean;
}

export interface RouteContext {
  isVoice: boolean;
  forcedBrain?: "grok" | "claude";
  hasToolCalls?: boolean;
  previousBrain?: "grok" | "claude";
}

export interface BrainDecision {
  brain: "grok" | "claude";
  reason: string;
  strippedMessage: string;
}

export const BRAIN_ROUTER_DEFAULTS: BrainRouterConfig = {
  mode: "auto",
  shortQueryThreshold: 20,
  claudeKeywords: [
    "analyze", "compare", "explain why", "review", "design",
    "plan", "evaluate", "summarize", "assess", "recommend",
    "critique", "break down", "deep dive", "what do you think",
    "walk me through",
  ],
  voiceClaudeEnabled: true,
};

export class BrainRouter {
  private config: BrainRouterConfig;

  constructor(config: BrainRouterConfig) {
    this.config = { ...config };
  }

  route(message: string, context: RouteContext): BrainDecision {
    let stripped = message;

    // 1. Forced prefix — highest priority
    const prefixMatch = message.match(/^@(claude|grok)\s+/i);
    if (prefixMatch) {
      const brain = prefixMatch[1]!.toLowerCase() as "grok" | "claude";
      stripped = message.slice(prefixMatch[0].length);
      return { brain, reason: `Forced via @${brain} prefix`, strippedMessage: stripped };
    }

    // Also check context.forcedBrain (set by caller)
    if (context.forcedBrain) {
      return {
        brain: context.forcedBrain,
        reason: `Forced brain: ${context.forcedBrain}`,
        strippedMessage: stripped,
      };
    }

    // 2. Dashboard mode override
    if (this.config.mode !== "auto") {
      return {
        brain: this.config.mode,
        reason: `Dashboard mode: ${this.config.mode}`,
        strippedMessage: stripped,
      };
    }

    // 3. Voice mode + voiceClaudeEnabled=false
    if (context.isVoice && !this.config.voiceClaudeEnabled) {
      return { brain: "grok", reason: "Voice mode, Claude disabled", strippedMessage: stripped };
    }

    // 4. Keyword match (only if word count >= 5)
    const words = message.trim().split(/\s+/);
    const wordCount = words.length;
    if (wordCount >= 5) {
      const lower = message.toLowerCase();
      for (const keyword of this.config.claudeKeywords) {
        if (lower.includes(keyword)) {
          return {
            brain: "claude",
            reason: `Keyword match: "${keyword}"`,
            strippedMessage: stripped,
          };
        }
      }
    }

    // 5. Follow-up continuity — if no keyword matched, stay on same brain as last turn
    if (context.previousBrain) {
      return {
        brain: context.previousBrain,
        reason: `Follow-up continuity (previous: ${context.previousBrain})`,
        strippedMessage: stripped,
      };
    }

    // 6. Length check — short queries go to Grok
    if (wordCount < this.config.shortQueryThreshold) {
      return { brain: "grok", reason: "Short query", strippedMessage: stripped };
    }

    // 7. Default — Grok
    return { brain: "grok", reason: "Default (no keyword match)", strippedMessage: stripped };
  }

  updateConfig(partial: Partial<BrainRouterConfig>): void {
    Object.assign(this.config, partial);
  }

  getConfig(): Readonly<BrainRouterConfig> {
    return { ...this.config };
  }
}
