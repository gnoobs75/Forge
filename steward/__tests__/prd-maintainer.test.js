/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import {
  rebuildDynamicSections,
  renderImplementationStatus,
  renderRecentlyShipped,
  renderOpenQuestions,
} from '../prd/maintainer.js';
import { parse, buildSkeleton } from '../prd/parser.js';

describe('prd maintainer — renderImplementationStatus', () => {
  it('returns a placeholder when no features', () => {
    expect(renderImplementationStatus(null)).toMatch(/No features registered/);
    expect(renderImplementationStatus({ features: [] })).toMatch(/No features registered/);
  });

  it('renders a table of features with status badges', () => {
    const out = renderImplementationStatus({
      features: [
        { id: 'feat-001', name: 'Renderer', status: 'complete', category: 'Rendering' },
        { id: 'feat-002', name: 'Combat', status: 'in-progress', category: 'Gameplay' },
      ],
    });
    expect(out).toMatch(/\| ID \| Feature \| Status \| Category \|/);
    expect(out).toMatch(/\|---\|---\|---\|---\|/);
    expect(out).toMatch(/\| `feat-001` \| Renderer \| ✅ complete \| Rendering \|/);
    expect(out).toMatch(/\| `feat-002` \| Combat \| 🟡 in-progress \| Gameplay \|/);
  });

  it('escapes pipes in feature names so the table doesn\'t break', () => {
    const out = renderImplementationStatus({
      features: [{ id: 'x', name: 'A | B', status: 'complete' }],
    });
    expect(out).toContain('A \\| B');
    expect(out).not.toMatch(/\| A \| B \|/);
  });
});

describe('prd maintainer — renderRecentlyShipped', () => {
  it('returns a placeholder when no entries', () => {
    expect(renderRecentlyShipped(null)).toMatch(/No shipped items/);
    expect(renderRecentlyShipped({ entries: [] })).toMatch(/No shipped items/);
  });

  it('renders entries newest-first capped at 10', () => {
    const entries = [];
    for (let i = 0; i < 15; i++) {
      entries.push({
        date: '2026-04-' + String(i + 1).padStart(2, '0'),
        id: 'EVT-' + i,
        agent: 'Tech Architect',
        title: 'Item ' + i,
        summary: 'Summary ' + i,
      });
    }
    const out = renderRecentlyShipped({ entries });
    const lines = out.split('\n');
    expect(lines).toHaveLength(10);
    // Most recent first → EVT-14
    expect(lines[0]).toContain('EVT-14');
    expect(lines[0]).toContain('Tech Architect');
    expect(lines[9]).toContain('EVT-5');
  });

  it('handles entries with missing optional fields', () => {
    const out = renderRecentlyShipped({
      entries: [{ date: '2026-04-01', id: 'X', title: 'No summary or agent' }],
    });
    expect(out).toContain('No summary or agent');
    expect(out).toContain('`X`');
  });
});

describe('prd maintainer — renderOpenQuestions', () => {
  it('returns a placeholder when no items', () => {
    expect(renderOpenQuestions(null)).toMatch(/No open questions/);
    expect(renderOpenQuestions({ items: [] })).toMatch(/No open questions/);
  });

  it('filters for category ending in "-question"', () => {
    const todo = {
      items: [
        { id: 'todo-1', priority: 'high', category: 'tools', title: 'Not a question' },
        { id: 'todo-2', priority: 'medium', category: 'prd-question', title: 'Should the boss be one-shot or pattern?' },
        { id: 'todo-3', priority: 'low', category: 'architecture-question', title: 'Use eventbus or direct call?' },
        { id: 'todo-4', priority: 'high', category: 'review', title: 'Designer review' },
      ],
    };
    const out = renderOpenQuestions(todo);
    expect(out).toContain('Should the boss');
    expect(out).toContain('eventbus or direct');
    expect(out).not.toContain('Not a question');
    expect(out).not.toContain('Designer review');
  });

  it('shows blockedBy when present', () => {
    const out = renderOpenQuestions({
      items: [{ id: 'q1', priority: 'low', category: 'prd-question', title: 'Q', blockedBy: 'designer-review' }],
    });
    expect(out).toContain('blocked by: designer-review');
  });
});

describe('prd maintainer — rebuildDynamicSections', () => {
  it('seeds a skeleton when no PRD exists, then populates dynamic sections', () => {
    const { doc, changed } = rebuildDynamicSections({
      prd: null,
      projectName: 'Arena',
      features: { features: [{ id: 'f1', name: 'X', status: 'complete' }] },
      history: { entries: [{ date: '2026-04-01', id: 'h1', title: 'Did a thing' }] },
      todo: { items: [{ category: 'prd-question', priority: 'high', title: 'Q' }] },
    });
    expect(doc.title).toBe('Arena — PRD');
    expect(doc.sections.find(s => s.heading === 'Vision').kind).toBe('stable');
    expect(doc.sections.find(s => s.heading === 'Implementation Status').body).toContain('`f1`');
    expect(doc.sections.find(s => s.heading === 'Recently Shipped').body).toContain('Did a thing');
    expect(doc.sections.find(s => s.heading === 'Open Questions').body).toContain('Q');
    // changed: skeleton has placeholder text in dynamic sections, so all 3 differ
    expect(changed.implementationStatus).toBe(true);
    expect(changed.recentlyShipped).toBe(true);
    expect(changed.openQuestions).toBe(true);
  });

  it('idempotent: a second call with same inputs reports no changes', () => {
    const inputs = {
      projectName: 'Arena',
      features: { features: [{ id: 'f1', name: 'X', status: 'complete' }] },
      history: { entries: [{ date: '2026-04-01', id: 'h1', title: 'Did a thing' }] },
      todo: { items: [] },
    };
    const first = rebuildDynamicSections({ prd: null, ...inputs });
    const second = rebuildDynamicSections({ prd: first.doc, ...inputs });
    expect(second.changed.implementationStatus).toBe(false);
    expect(second.changed.recentlyShipped).toBe(false);
    expect(second.changed.openQuestions).toBe(false);
  });

  it('preserves stable sections (Vision/Pillars/Out of Scope) across rebuilds', () => {
    const seeded = buildSkeleton('Arena — PRD');
    seeded.sections = seeded.sections.map(s =>
      s.heading === 'Vision' ? { ...s, body: 'CUSTOM_VISION_TEXT' } : s
    );
    const { doc } = rebuildDynamicSections({
      prd: seeded,
      projectName: 'Arena',
      features: { features: [{ id: 'f1', name: 'X', status: 'complete' }] },
      history: null,
      todo: null,
    });
    expect(doc.sections.find(s => s.heading === 'Vision').body).toBe('CUSTOM_VISION_TEXT');
  });

  it('reports changed:false for unchanged dynamic sections (delta tracking)', () => {
    const seeded = buildSkeleton('Test');
    // First seed populates dynamics from input
    const { doc: doc1 } = rebuildDynamicSections({
      prd: seeded,
      projectName: 'Test',
      features: { features: [{ id: 'f1', name: 'A', status: 'complete' }] },
      history: { entries: [] },
      todo: { items: [] },
    });
    // Second pass with only Recently Shipped changing
    const { changed } = rebuildDynamicSections({
      prd: doc1,
      projectName: 'Test',
      features: { features: [{ id: 'f1', name: 'A', status: 'complete' }] },  // unchanged
      history: { entries: [{ date: '2026-04-01', id: 'h1', title: 'New' }] },  // changed
      todo: { items: [] },                                                       // unchanged
    });
    expect(changed.implementationStatus).toBe(false);
    expect(changed.recentlyShipped).toBe(true);
    expect(changed.openQuestions).toBe(false);
  });
});
