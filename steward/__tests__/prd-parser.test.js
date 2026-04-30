/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { parse, serialize, buildSkeleton, setSectionBody, KNOWN } from '../prd/parser.js';

describe('prd parser — parse', () => {
  it('extracts the steward origin tag and the title', () => {
    const md = [
      '<!-- steward-write: AAAAAAAAAAAAAAAAAAAAAAAAAA -->',
      '# Arena — PRD',
      '',
      '## Vision',
      'Tactical card battle on a grid.',
    ].join('\n');
    const doc = parse(md);
    expect(doc.originTag).toBe('AAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(doc.title).toBe('Arena — PRD');
    expect(doc.sections[0]).toEqual({
      kind: 'stable',
      heading: 'Vision',
      body: 'Tactical card battle on a grid.',
    });
  });

  it('classifies sections as stable / dynamic / custom by heading', () => {
    const md = [
      '# T',
      '## Vision', 'v',
      '## Pillars', 'p',
      '## Out of Scope', 'o',
      '---',
      '## Implementation Status', 's',
      '## Recently Shipped', 'r',
      '## Open Questions', 'q',
      '## Custom Notes', 'cn',
    ].join('\n');
    const { sections } = parse(md);
    expect(sections.map(s => s.kind)).toEqual([
      'stable', 'stable', 'stable', 'separator', 'dynamic', 'dynamic', 'dynamic', 'custom',
    ]);
  });

  it('preserves multi-line body content within sections', () => {
    const md = [
      '## Vision',
      'Line one.',
      'Line two.',
      '',
      'Line four after blank.',
    ].join('\n');
    const { sections } = parse(md);
    expect(sections[0].body).toBe('Line one.\nLine two.\n\nLine four after blank.');
  });

  it('handles missing title gracefully', () => {
    const { title, sections } = parse('## Vision\nbody');
    expect(title).toBeNull();
    expect(sections).toHaveLength(1);
  });

  it('handles empty input', () => {
    const doc = parse('');
    expect(doc.originTag).toBeNull();
    expect(doc.title).toBeNull();
    expect(doc.sections).toEqual([]);
  });

  it('captures pre-section content as anonymous custom section', () => {
    const md = [
      '# T',
      'A paragraph before any heading.',
      '',
      '## Vision',
      'v',
    ].join('\n');
    const { sections } = parse(md);
    expect(sections[0].kind).toBe('custom');
    expect(sections[0].heading).toBeNull();
    expect(sections[0].body).toBe('A paragraph before any heading.');
    expect(sections[1].heading).toBe('Vision');
  });
});

describe('prd parser — serialize', () => {
  it('round-trips a typical PRD (parse → serialize preserves semantic content)', () => {
    const original = [
      '# Arena — PRD',
      '',
      '## Vision',
      '',
      'Tactical card battle on a grid.',
      '',
      '## Pillars',
      '',
      '- Pillar 1',
      '- Pillar 2',
      '',
      '---',
      '',
      '## Implementation Status',
      '',
      '_(Steward maintains this from features.json)_',
      '',
    ].join('\n');
    const round = serialize(parse(original));
    // Re-parse to compare structurally (whitespace-tolerant)
    expect(parse(round).sections).toEqual(parse(original).sections);
    expect(parse(round).title).toBe('Arena — PRD');
  });

  it('omits the title heading when absent', () => {
    const out = serialize({ title: null, sections: [{ kind: 'stable', heading: 'Vision', body: 'v' }] });
    expect(out.startsWith('## Vision')).toBe(true);
  });

  it('serializes separator as ---', () => {
    const out = serialize({
      title: null,
      sections: [
        { kind: 'stable', heading: 'A', body: 'a' },
        { kind: 'separator' },
        { kind: 'dynamic', heading: 'B', body: 'b' },
      ],
    });
    expect(out).toContain('\n---\n');
  });

  it('collapses runs of blank lines to at most one', () => {
    const out = serialize({ title: 'T', sections: [{ kind: 'stable', heading: 'X', body: 'a\n\n\n\nb' }] });
    expect(out).not.toMatch(/\n{4,}/);
  });
});

describe('prd parser — skeleton + setSectionBody', () => {
  it('buildSkeleton produces all stable + dynamic sections with placeholder text', () => {
    const skel = buildSkeleton('Test PRD');
    expect(skel.title).toBe('Test PRD');
    const headings = skel.sections.filter(s => s.heading).map(s => s.heading);
    expect(headings).toEqual([
      'Vision', 'Pillars', 'Out of Scope',
      'Implementation Status', 'Recently Shipped', 'Open Questions',
    ]);
    // Separator between stable and dynamic
    const kinds = skel.sections.map(s => s.kind);
    expect(kinds).toContain('separator');
  });

  it('setSectionBody replaces body when section exists', () => {
    const skel = buildSkeleton('T');
    const updated = setSectionBody(skel, 'Vision', 'New vision');
    expect(updated.sections.find(s => s.heading === 'Vision').body).toBe('New vision');
    // Other sections unchanged
    expect(updated.sections.find(s => s.heading === 'Pillars').body).toContain('TBD');
  });

  it('setSectionBody appends when section is missing', () => {
    const doc = { title: 'T', sections: [] };
    const updated = setSectionBody(doc, 'Recently Shipped', '- new entry');
    expect(updated.sections).toHaveLength(1);
    expect(updated.sections[0].kind).toBe('dynamic');
  });

  it('exports KNOWN heading lists for use by the maintainer', () => {
    expect(KNOWN.STABLE).toContain('Vision');
    expect(KNOWN.DYNAMIC).toContain('Implementation Status');
  });
});
