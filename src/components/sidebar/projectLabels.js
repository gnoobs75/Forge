// Short labels and accent colors for project group rows in the Session Sidebar.
// Forge-managed projects only — see CLAUDE.md for the canonical project list.

export const PROJECT_LABELS = {
  studio: 'HQ',
  'safetyfirst-credentialing': 'SAFE',
  'council-of-elrond': 'COE',
  homestead: 'HOME',
  'forge-mobile': 'MOB',
};

// Color stripe per project. Distinct hues so collapsed projects are
// instantly identifiable by their left-edge stripe.
export const PROJECT_COLORS = {
  studio: '#C52638',                  // Forge accent red
  'safetyfirst-credentialing': '#10B981', // green — healthcare
  'council-of-elrond': '#A855F7',     // purple — council
  homestead: '#F59E0B',               // amber — homestead
  'forge-mobile': '#3B82F6',          // blue — mobile
};

export function getProjectLabel(slug) {
  if (!slug) return '?';
  return PROJECT_LABELS[slug] || slug.slice(0, 3).toUpperCase();
}

export function getProjectColor(slug) {
  if (!slug) return '#475569';
  return PROJECT_COLORS[slug] || '#64748B';
}
