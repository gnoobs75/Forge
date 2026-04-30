// Studio Steward — PRD maintainer.
//
// Rebuilds the dynamic sections of a PRD doc from the project's current
// features.json + history.json + todo.json. Stable sections (Vision /
// Pillars / Out of Scope) are NEVER touched here — those go through the
// Phase 5+ confidence-threshold gate, which isn't wired in v1 (deterministic
// maintenance only touches dynamic sections).
//
// All three dynamic sections are recomputed from scratch on every call —
// idempotent, no-diff-needed. studioWrite's per-path debounce + chokidar
// awaitWriteFinish handle the case where multiple history.json events
// arrive in quick succession.

import { setSectionBody, buildSkeleton } from './parser.js';

const RECENT_SHIPPED_LIMIT = 10;
const PRD_QUESTION_CATEGORY_REGEX = /-question$/;

/**
 * Rebuild a PRD doc's dynamic sections from project state.
 *
 * @param {object} args
 * @param {object|null} args.prd                Parsed PRD doc (parse() output) or null to seed a skeleton
 * @param {string}      args.projectName        Display name for the title (used only when seeding)
 * @param {object|null} args.features           Parsed features.json or null
 * @param {object|null} args.history            Parsed history.json or null
 * @param {object|null} args.todo               Parsed todo.json or null
 * @returns {{ doc: object, changed: { implementationStatus, recentlyShipped, openQuestions } }}
 */
export function rebuildDynamicSections({ prd, projectName, features, history, todo }) {
  let doc = prd ?? buildSkeleton(projectName ? `${projectName} — PRD` : null);

  const newImplStatus = renderImplementationStatus(features);
  const newRecentlyShipped = renderRecentlyShipped(history);
  const newOpenQuestions = renderOpenQuestions(todo);

  const oldImpl = sectionBody(doc, 'Implementation Status');
  const oldShipped = sectionBody(doc, 'Recently Shipped');
  const oldQ = sectionBody(doc, 'Open Questions');

  const changed = {
    implementationStatus: oldImpl !== newImplStatus,
    recentlyShipped:      oldShipped !== newRecentlyShipped,
    openQuestions:        oldQ !== newOpenQuestions,
  };

  doc = setSectionBody(doc, 'Implementation Status', newImplStatus);
  doc = setSectionBody(doc, 'Recently Shipped', newRecentlyShipped);
  doc = setSectionBody(doc, 'Open Questions', newOpenQuestions);

  return { doc, changed };
}

function sectionBody(doc, heading) {
  return doc.sections.find(s => s.heading === heading)?.body ?? null;
}

// ──────────────────────────────────────────────────────────────────────────
// Section renderers — pure functions over project state

export function renderImplementationStatus(features) {
  const list = Array.isArray(features?.features) ? features.features : null;
  if (!list || list.length === 0) {
    return '_No features registered yet — run a Tech Architect scan to populate features.json._';
  }
  const rows = list.map(f => {
    const id = mdEscape(f?.id || '');
    const name = mdEscape(f?.name || '(unnamed)');
    const status = mdEscape(f?.status || 'unknown');
    const cat = mdEscape(f?.category || '');
    return `| \`${id}\` | ${name} | ${statusBadge(status)} | ${cat} |`;
  });
  return [
    '| ID | Feature | Status | Category |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
}

export function renderRecentlyShipped(history) {
  const entries = Array.isArray(history?.entries) ? history.entries : null;
  if (!entries || entries.length === 0) {
    return '_No shipped items yet — recommendations resolve here as they land._';
  }
  // Most recent first; cap at RECENT_SHIPPED_LIMIT
  const sorted = [...entries].reverse().slice(0, RECENT_SHIPPED_LIMIT);
  const items = sorted.map(e => {
    const date = mdEscape(e?.date || '');
    const id = e?.id ? `\`${mdEscape(e.id)}\`` : '';
    const title = mdEscape(e?.title || '(no title)');
    const summary = e?.summary ? ` — ${mdEscape(e.summary)}` : '';
    const agent = e?.agent ? ` _(${mdEscape(e.agent)})_` : '';
    return `- **${date}** ${id} ${title}${summary}${agent}`;
  });
  return items.join('\n');
}

export function renderOpenQuestions(todo) {
  const items = Array.isArray(todo?.items) ? todo.items : null;
  if (!items || items.length === 0) {
    return '_No open questions tagged for the PRD._';
  }
  const questions = items.filter(t => typeof t?.category === 'string' && PRD_QUESTION_CATEGORY_REGEX.test(t.category));
  if (questions.length === 0) {
    return '_No open questions tagged for the PRD (looking for `category: "*-question"`)._';
  }
  const lines = questions.map(q => {
    const priority = q?.priority ? `\`${mdEscape(q.priority)}\`` : '';
    const cat = mdEscape(q.category);
    const title = mdEscape(q?.title || '(no title)');
    const summary = q?.summary ? ` — ${mdEscape(q.summary)}` : '';
    const blockedBy = q?.blockedBy ? ` _(blocked by: ${mdEscape(q.blockedBy)})_` : '';
    return `- ${priority} **${cat}**: ${title}${summary}${blockedBy}`;
  });
  return lines.join('\n');
}

function mdEscape(s) {
  // Light escape — pipes break tables, backslashes/asterisks distort emphasis.
  // Keep it minimal so common content (markdown summaries) reads naturally.
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function statusBadge(status) {
  const s = String(status).toLowerCase();
  if (s === 'complete' || s === 'verified' || s === 'shipped') return '✅ ' + status;
  if (s === 'in-progress' || s === 'in_progress') return '🟡 ' + status;
  if (s === 'planned' || s === 'todo' || s === 'todo-list') return '⏳ ' + status;
  if (s === 'blocked' || s === 'failed') return '❌ ' + status;
  return status;
}
