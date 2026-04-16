function paths() {
  const fp = (typeof window !== 'undefined' && window.forgePaths) || null;
  return {
    hqData: fp?.hqData || 'C:\\Claude\\Samurai\\hq-data',
  };
}

export function buildImplementPrompt(rec, project, approachId) {
  const HQ = paths().hqData;
  const approach = rec.approaches?.find(a => a.id === (approachId ?? rec.recommended));
  const lines = [
    `# Implement: ${rec.title}`,
    ``,
    `Project: ${project.name} (${project.slug})`,
    `Agent: ${rec.agent}`,
    ``,
    `## Summary`,
    rec.summary,
  ];
  if (approach) {
    lines.push(``, `## Recommended Approach: ${approach.name}`, approach.description);
    if (approach.trade_offs) lines.push(``, `**Trade-offs:** ${approach.trade_offs}`);
    if (approach.effort) lines.push(`**Effort:** ${approach.effort} | **Impact:** ${approach.impact}`);
  }
  if (rec.reasoning) lines.push(``, `## Reasoning`, rec.reasoning);
  lines.push(``, `## Context`, `Read the project context at: ${HQ}\\projects\\${project.slug}\\context.md`);
  lines.push(`Explore the codebase before implementing. The code is the truth.`);
  return lines.join('\n');
}
