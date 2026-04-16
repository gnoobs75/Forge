/**
 * Build a prompt for automation-spawned agent tasks.
 * Unlike buildImplementPrompt (which targets a specific recommendation),
 * this builds a generic task prompt for scheduled/chained/triggered agent work.
 */

// Resolved at runtime by the Electron preload (window.forgePaths).
// Fallback to the legacy Samurai layout if running outside Electron (tests, SSR).
function paths() {
  const fp = (typeof window !== 'undefined' && window.forgePaths) || null;
  return {
    hqData: fp?.hqData || '',
    agentsDir: fp?.agentsDir || '',
  };
}

export function buildAgentTaskPrompt({ agentName, agentId, action, projectSlug, projectName, repoPath, context }) {
  const P = paths();
  const HQ = P.hqData;
  const AGENTS = P.agentsDir;

  const lines = [
    `# Automation Task: ${action}`,
    ``,
    `Agent: ${agentName}`,
    `Project: ${projectName} (${projectSlug})`,
  ];

  if (repoPath) {
    lines.push(`Repository: ${repoPath}`);
  }

  lines.push(``, `## Task`, action);

  if (context) {
    lines.push(``, `## Additional Context`, context);
  }

  lines.push(
    ``,
    `## Instructions`,
    `1. Read your agent skill file at: ${AGENTS}\\${agentId}.md — follow its full workflow`,
    `2. Read the feature registry (source of truth): ${HQ}\\projects\\${projectSlug}\\features.json`,
    `3. Read the project config: ${HQ}\\projects\\${projectSlug}\\project.json`,
    `4. Read the project context: ${HQ}\\projects\\${projectSlug}\\context.md`,
    `5. Explore the actual game codebase before giving advice — the code is the truth.`,
    `6. Write structured JSON recommendations to ${HQ}\\projects\\${projectSlug}\\recommendations/`,
    `   Use the EXACT format from CLAUDE.md: must include agent, agentColor, project, timestamp, type, title, summary, approaches (array), recommended, reasoning, status.`,
    `7. After writing a recommendation, append to ${HQ}\\activity-log.json`,
    `8. **AFTER completing your work**, update these project data files:`,
    `   - Update features.json — mark affected features, add new ones discovered, update statuses`,
    `   - Update context.md — revise sections that changed, update launch readiness, reflect current reality`,
  );

  // Agent-specific instructions
  if (agentId === 'qa-advisor') {
    lines.push(
      ``,
      `## QA-Specific Instructions`,
      `- Update ${HQ}\\projects\\${projectSlug}\\progress.json with your assessment`,
      `- Recalculate the overall score as a weighted average of category scores`,
      `- Update blockers and recentChanges arrays`,
      `- Update features.json — mark features as verified/tested, update status of features that failed QA`,
      `- Update context.md with current launch readiness status and any new findings`,
    );
  }

  if (agentId === 'market-analyst') {
    lines.push(
      ``,
      `## Market Analyst-Specific Instructions`,
      `- Read and update knowledge base files at ${HQ}\\knowledge/`,
      `- Update last_updated timestamps in the knowledge files you modify`,
      `- Focus on competitive landscape, pricing, audience size, and genre trends`,
    );
  }

  if (agentId === 'store-optimizer') {
    lines.push(
      ``,
      `## Store Optimizer-Specific Instructions`,
      `- Read existing store drafts from ${HQ}\\projects\\${projectSlug}\\store-drafts/`,
      `- Read the market knowledge base at ${HQ}\\knowledge/ for keyword/tag intelligence`,
      `- Write updated store drafts back to the store-drafts directory`,
    );
  }

  if (agentId === 'growth-strategist' || agentId === 'community-manager' || agentId === 'content-producer') {
    lines.push(
      ``,
      `## ${agentName}-Specific Instructions`,
      `- Read the market knowledge base at ${HQ}\\knowledge/`,
    );
  }

  if (agentId === 'monetization') {
    lines.push(
      ``,
      `## Monetization Strategist-Specific Instructions`,
      `- Read the market knowledge base at ${HQ}\\knowledge/ — especially pricing data and competitor monetization`,
      `- Focus on revenue models appropriate to the platform (F2P/Premium/Battle Pass)`,
    );
  }

  if (agentId === 'player-psych') {
    lines.push(
      ``,
      `## Player Psychologist-Specific Instructions`,
      `- Read the market knowledge base at ${HQ}\\knowledge/ — especially retention benchmarks`,
      `- Focus on session design, progression depth, and engagement hooks`,
    );
  }

  if (agentId === 'art-director') {
    lines.push(
      ``,
      `## Art Director-Specific Instructions`,
      `- Read existing benchmarks from ${HQ}\\projects\\${projectSlug}\\benchmarks/ if they exist`,
      `- Each game has a distinct art style — read context.md to understand the visual language before evaluating`,
    );
  }

  if (agentId === 'tech-architect') {
    lines.push(
      ``,
      `## Tech Architect-Specific Instructions`,
      `- Deep-dive the actual codebase — measure, don't guess (LOC, draw calls, coupling, circular deps)`,
      `- Update features.json with accurate technical status after codebase exploration`,
      `- Use the EXACT recommendation format — do NOT write free-form assessment JSON`,
    );
  }

  if (agentId === 'creative-thinker') {
    lines.push(
      ``,
      `## Creative Thinker-Specific Instructions`,
      `- Read the market knowledge base — especially OTHER genres and platforms for cross-pollination ideas`,
      `- Bold ideas welcome — they can always be refined. Don't self-censor.`,
    );
  }

  if (agentId === 'brand-director') {
    lines.push(
      ``,
      `## Brand Director-Specific Instructions`,
      `- Read ALL project features.json and context.md files — you need the full studio picture`,
      `- Focus on visual consistency, studio identity, and cross-game brand coherence`,
    );
  }

  if (agentId === 'hr-director') {
    lines.push(
      ``,
      `## HR Director-Specific Instructions`,
      `- Read agent brain assignments from ${HQ}\\agent-brains.json`,
      `- Read recent recommendations from ALL projects to assess agent output quality`,
      `- Read the activity log at ${HQ}\\activity-log.json`,
      `- Read ALL project features.json and project.json files to understand studio needs`,
    );
  }

  if (agentId === 'studio-producer') {
    lines.push(
      ``,
      `## Studio Producer-Specific Instructions`,
      `- Review ALL active projects — read every project's features.json, project.json, and progress.json`,
      `- Prioritize across projects, not just within one`,
      `- Read ${HQ}\\activity-log.json for recent agent activity`,
      `- Read ${HQ}\\automation\\execution-log.json for automation history`,
    );

    // Detect if this is a report task
    const actionLower = action.toLowerCase();
    if (actionLower.includes('daily') && actionLower.includes('report')) {
      lines.push(
        ``,
        `## Daily Report Instructions`,
        `- Summarize all agent activity in the last 24 hours`,
        `- Note any code changes detected across game repos`,
        `- List resolved recommendations and their impact`,
        `- Highlight any blockers or issues that need attention`,
        `- Write the report as a recommendation with type "daily-report"`,
        `- Include chartData for visualization (activity by agent, progress overview)`,
      );
    }
    if (actionLower.includes('weekly') && (actionLower.includes('report') || actionLower.includes('plan'))) {
      lines.push(
        ``,
        `## Weekly Report Instructions`,
        `- High-level summary of the week's progress across all projects`,
        `- Compare current progress percentages to last week if available`,
        `- Highlight the most impactful recommendations resolved`,
        `- Note any significant code changes or new features shipped`,
        `- Recommend focus areas for next week`,
        `- Write the report as a recommendation with type "weekly-plan"`,
        `- Include chartData for visualization (weekly progress trend, agent activity breakdown)`,
      );
    }
  }

  return lines.join('\n');
}
