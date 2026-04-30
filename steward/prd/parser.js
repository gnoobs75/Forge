// Studio Steward — PRD parser + serializer.
//
// PRD canonical structure (per docs/plans/2026-04-27-studio-steward-design.md §2.7):
//
//   <!-- steward-write: <uuid> -->
//   # {Project Name} — PRD
//
//   ## Vision               ← stable
//   ## Pillars              ← stable
//   ## Out of Scope         ← stable
//   ---
//   ## Implementation Status   ← dynamic (Steward-maintained from features.json)
//   ## Recently Shipped         ← dynamic (from history.json)
//   ## Open Questions           ← dynamic (from todo.json items tagged prd-question)
//
// Stable vs dynamic is determined by heading name. Anything not in either
// whitelist is preserved as-is and treated as stable (so users can add
// custom sections without losing them).

import { readOriginTag } from '../studio-write.js';

const STABLE_HEADINGS = new Set(['Vision', 'Pillars', 'Out of Scope']);
const DYNAMIC_HEADINGS = ['Implementation Status', 'Recently Shipped', 'Open Questions'];
const DYNAMIC_HEADING_SET = new Set(DYNAMIC_HEADINGS);
const SEPARATOR_LINE = '---';

/**
 * Parse a PRD markdown string into a structured doc.
 *
 * Returns:
 *   {
 *     originTag:    string|null,
 *     title:        string|null,
 *     sections: [
 *       { kind: 'stable'|'dynamic'|'separator'|'custom', heading?, body },
 *       ...
 *     ]
 *   }
 *
 * Round-trips: serialize(parse(md)) preserves semantic content (the order
 * of sections, the heading names, the body of each section). Whitespace
 * normalization is light — body is trimmed to single trailing newline.
 */
export function parse(md) {
  if (typeof md !== 'string') md = String(md ?? '');
  const originTag = readOriginTag(md, 'md');
  // Strip the origin-tag line if present
  const stripped = md.replace(/^<!-- steward-write: [0-9A-HJKMNP-TV-Z]{26} -->\n?/, '');

  const lines = stripped.split('\n');

  // Pull the title — first H1 line if present
  let title = null;
  let i = 0;
  // Skip leading blank lines
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && lines[i].startsWith('# ') && !lines[i].startsWith('## ')) {
    title = lines[i].slice(2).trim();
    i++;
  }

  // Walk the rest accumulating sections
  const sections = [];
  let currentHeading = null;
  let currentBody = [];

  function flushCurrent() {
    const bodyText = currentBody.join('\n').trim();
    if (currentHeading == null) {
      // Pre-section content — skip if it's only whitespace (e.g. blank line
      // between H1 title and first ## heading)
      if (bodyText === '') {
        currentBody = [];
        return;
      }
      sections.push({ kind: 'custom', heading: null, body: bodyText });
    } else {
      const headingName = currentHeading;
      const kind = STABLE_HEADINGS.has(headingName) ? 'stable'
        : DYNAMIC_HEADING_SET.has(headingName) ? 'dynamic'
        : 'custom';
      sections.push({ kind, heading: headingName, body: bodyText });
    }
    currentBody = [];
  }

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      flushCurrent();
      currentHeading = line.slice(3).trim();
    } else if (line.trim() === SEPARATOR_LINE) {
      flushCurrent();
      currentHeading = null;
      sections.push({ kind: 'separator' });
    } else {
      // Skip purely empty lines at the top of a body
      if (currentBody.length === 0 && line.trim() === '' && currentHeading != null) continue;
      currentBody.push(line);
    }
  }
  flushCurrent();

  return { originTag, title, sections };
}

/**
 * Serialize a parsed PRD back to markdown. Origin tag is OMITTED here —
 * studioWrite re-injects it. The caller is responsible for the title; if
 * absent, no H1 is emitted.
 */
export function serialize(doc) {
  if (!doc || !Array.isArray(doc.sections)) return '';
  const lines = [];
  if (doc.title) {
    lines.push(`# ${doc.title}`);
    lines.push('');
  }
  for (const section of doc.sections) {
    if (section.kind === 'separator') {
      lines.push(SEPARATOR_LINE);
      lines.push('');
      continue;
    }
    if (section.heading) {
      lines.push(`## ${section.heading}`);
      lines.push('');
    }
    if (section.body) {
      lines.push(section.body);
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/**
 * Build an empty skeleton PRD for first-seed.
 */
export function buildSkeleton(title) {
  return {
    originTag: null,
    title: title,
    sections: [
      { kind: 'stable', heading: 'Vision', body: '_TBD — describe the product vision in 2-3 sentences._' },
      { kind: 'stable', heading: 'Pillars', body: '_TBD — list 3-5 design pillars that gate scope decisions._' },
      { kind: 'stable', heading: 'Out of Scope', body: '_TBD — explicitly call out what this product is NOT._' },
      { kind: 'separator' },
      { kind: 'dynamic', heading: 'Implementation Status', body: '_(Steward maintains this from features.json)_' },
      { kind: 'dynamic', heading: 'Recently Shipped', body: '_(Steward maintains this from history.json)_' },
      { kind: 'dynamic', heading: 'Open Questions', body: '_(Steward maintains this from todo.json items tagged prd-question)_' },
    ],
  };
}

/**
 * Replace a single section's body in a parsed doc, returning a new doc.
 * Adds the section if missing (appended at end before any custom sections).
 */
export function setSectionBody(doc, heading, body) {
  const sections = doc.sections.slice();
  let found = false;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].heading === heading) {
      sections[i] = { ...sections[i], body };
      found = true;
    }
  }
  if (!found) {
    const kind = STABLE_HEADINGS.has(heading) ? 'stable'
      : DYNAMIC_HEADING_SET.has(heading) ? 'dynamic'
      : 'custom';
    sections.push({ kind, heading, body });
  }
  return { ...doc, sections };
}

export const KNOWN = {
  STABLE: [...STABLE_HEADINGS],
  DYNAMIC: [...DYNAMIC_HEADINGS],
};
