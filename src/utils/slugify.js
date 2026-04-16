/**
 * Convert a recommendation title + agent name into a filesystem-friendly slug.
 * e.g. "Crafting System: Elegant Economy" + "Player Psychologist" → "player-psych-crafting-system-elegant-economy"
 */

const AGENT_SLUGS = {
  'Market Analyst': 'market-analyst',
  'Store Optimizer': 'store-optimizer',
  'Growth Strategist': 'growth-strategist',
  'Brand Director': 'brand-director',
  'Content Producer': 'content-producer',
  'Community Manager': 'community-manager',
  'QA Advisor': 'qa-advisor',
  'Studio Producer': 'studio-producer',
  'Monetization Strategist': 'monetization',
  'Player Psychologist': 'player-psych',
  'Art Director': 'art-director',
  'Creative Thinker': 'creative-thinker',
};

export function agentSlug(agentName) {
  return AGENT_SLUGS[agentName] || agentName.toLowerCase().replace(/\s+/g, '-');
}

export function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // strip non-alphanumeric
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .replace(/^-|-$/g, '')          // trim leading/trailing hyphens
    .slice(0, 60);                  // cap length
}

/**
 * Build the recommended filename for a recommendation JSON.
 * Format: YYYY-MM-DD-agent-slug-title-slug.json
 */
export function recFilename(rec) {
  const date = rec.timestamp
    ? rec.timestamp.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const agent = agentSlug(rec.agent);
  const title = slugifyTitle(rec.title);
  return `${date}-${agent}-${title}.json`;
}

/**
 * Build the full relative path for a recommendation file within hq-data.
 */
export function recRelativePath(rec) {
  const filename = recFilename(rec);
  return `projects/${rec.project}/recommendations/${filename}`;
}
