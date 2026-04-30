/**
 * Bug Feedback Loop — shared color/label constants.
 *
 * Source of truth: docs/plans/2026-04-29-bug-feedback-loop-design.md §9.3
 */

export const STATUS_COLORS = {
  open: '#3B82F6',      // blue
  triaged: '#EAB308',   // yellow
  fixing: '#F97316',    // orange
  closed: '#22C55E',    // green
  wontfix: '#6B7280',   // gray
};

export const SEVERITY_COLORS = {
  critical: '#EF4444',  // red
  high: '#F97316',      // orange
  medium: '#EAB308',    // yellow
  low: '#22C55E',       // green
};

export const STATUS_LABELS = {
  open: 'Open',
  triaged: 'Triaged',
  fixing: 'Fixing',
  closed: 'Closed',
  wontfix: "Won't Fix",
};

export const SEVERITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const CATEGORY_LABELS = {
  gameplay: 'Gameplay',
  ui: 'UI',
  art: 'Art',
  audio: 'Audio',
  performance: 'Performance',
  'save-load': 'Save/Load',
  controls: 'Controls',
  content: 'Content',
  crash: 'Crash',
  other: 'Other',
};

export const COUNCIL_OWNERS = [
  'Game QA Engineer',
  'Tech Architect',
  'Game Builder',
  'Game Designer Builder',
  'Art Director',
  'Audio Engineer',
  'Player Psychologist',
  'Studio Producer',
  'Friday (Night Shift)',
];

// Status flow used by the action bar — Open → Triaged → Fixing → Closed,
// with "Won't Fix" rendered as a separate red-tinted button.
export const STATUS_FLOW = ['open', 'triaged', 'fixing', 'closed'];

// All known severity values in priority order (highest first), used for
// dropdowns and sort comparisons in StudioBugBoard.
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
