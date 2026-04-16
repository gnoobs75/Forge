/**
 * Parses a predictable context.md format into structured sections.
 *
 * Expected format:
 *   # Title
 *   ## Section Name
 *   - **Key:** Value
 *   - Plain list item
 *   1. Numbered item
 *   - Indented sub-items (lines starting with spaces + -)
 *
 * Returns: { title, sections: [{ title, items: [{ type, key?, value }] }] }
 */
export default function parseContextMarkdown(raw) {
  if (!raw || typeof raw !== 'string') {
    return { title: '', sections: [] };
  }

  const lines = raw.split('\n');
  let title = '';
  const sections = [];
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Top-level title: # Title
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      title = line.slice(2).trim().replace(/ — .+$/, '');
      continue;
    }

    // Section heading: ## Section Name
    if (line.startsWith('## ')) {
      currentSection = { title: line.slice(3).trim(), items: [] };
      sections.push(currentSection);
      continue;
    }

    if (!currentSection) continue;

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Key-value: - **Key:** Value
    const kvMatch = trimmed.match(/^-\s+\*\*(.+?):\*\*\s*(.+)$/);
    if (kvMatch) {
      currentSection.items.push({
        type: 'kv',
        key: kvMatch[1],
        value: kvMatch[2],
      });
      continue;
    }

    // Bold label without colon (e.g. - **Visual Aesthetic:** )
    const kvMatch2 = trimmed.match(/^-\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (kvMatch2) {
      currentSection.items.push({
        type: 'kv',
        key: kvMatch2[1].replace(/:$/, ''),
        value: kvMatch2[2],
      });
      continue;
    }

    // Numbered item: 1. Text
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      currentSection.items.push({
        type: 'numbered',
        number: parseInt(numMatch[1], 10),
        value: numMatch[2],
      });
      continue;
    }

    // Indented sub-item:   - Text (2+ leading spaces before -)
    if (line.match(/^\s{2,}-\s+/)) {
      currentSection.items.push({
        type: 'sub',
        value: trimmed.replace(/^-\s+/, ''),
      });
      continue;
    }

    // Plain list item: - Text
    const listMatch = trimmed.match(/^-\s+(.+)$/);
    if (listMatch) {
      currentSection.items.push({
        type: 'list',
        value: listMatch[1],
      });
      continue;
    }

    // Plain text line (not a list item)
    currentSection.items.push({
      type: 'text',
      value: trimmed,
    });
  }

  return { title, sections };
}

/**
 * Extract tech-related terms from a parsed context's "Tech Stack" section.
 * Returns array of { name, detail? } objects.
 */
export function extractTechPills(sections) {
  const techSection = sections.find(
    (s) => s.title.toLowerCase().includes('tech stack') || s.title.toLowerCase().includes('tech')
  );
  if (!techSection) return [];

  return techSection.items
    .filter((item) => item.type === 'kv')
    .map((item) => {
      const value = item.value;
      // Extract the primary tech name (first word/phrase before parenthetical)
      const nameMatch = value.match(/^([^(]+)/);
      const name = nameMatch ? nameMatch[1].trim() : value;
      const detailMatch = value.match(/\(([^)]+)\)/);
      return {
        name,
        detail: detailMatch ? detailMatch[1] : null,
        label: item.key,
      };
    });
}

/**
 * Extract competitor names from the "Competitor Reference" section.
 */
export function extractCompetitors(sections) {
  const compSection = sections.find(
    (s) =>
      s.title.toLowerCase().includes('competitor') ||
      s.title.toLowerCase().includes('competition')
  );
  if (!compSection) return [];

  return compSection.items
    .filter((item) => item.type === 'list')
    .map((item) => {
      // Format: "Name (differentiator)" or "Name — differentiator"
      const dashMatch = item.value.match(/^(.+?)\s*[(\u2014–-]\s*(.+?)[)]?$/);
      if (dashMatch) {
        return { name: dashMatch[1].trim(), differentiator: dashMatch[2].trim().replace(/\)$/, '') };
      }
      return { name: item.value, differentiator: null };
    });
}
