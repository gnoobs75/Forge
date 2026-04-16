/**
 * Extract structured features from a parsed context.md.
 *
 * Looks at specific sections to infer feature status:
 *   - "What's Working Well" → complete
 *   - "Known Gaps" / "Critical Gaps" → blocked or planned
 *   - "Critical Path to Launch" → in-progress (strikethrough = complete)
 *   - Codebase Architecture table rows with Status column → parsed status
 *
 * Also reads progress.json categories to enrich with completion percentages.
 *
 * Returns: { categories: [...], summary: { total, complete, inProgress, blocked, planned } }
 */
import parseContextMarkdown from './parseContextMarkdown';

const STATUS_COLORS = {
  complete: '#22C55E',
  'in-progress': '#0EA5E9',
  blocked: '#EF4444',
  planned: '#64748B',
};

const PRIORITY_COLORS = {
  P0: '#EF4444',
  P1: '#F97316',
  P2: '#EAB308',
};

function inferCategory(sectionTitle) {
  const t = sectionTitle.toLowerCase();
  if (t.includes('gameplay') || t.includes('core loop') || t.includes('mechanic')) return 'Gameplay';
  if (t.includes('visual') || t.includes('art') || t.includes('ui') || t.includes('interface')) return 'Visual / UI';
  if (t.includes('audio') || t.includes('sound') || t.includes('music')) return 'Audio';
  if (t.includes('network') || t.includes('multiplayer') || t.includes('online')) return 'Multiplayer';
  if (t.includes('monetiz') || t.includes('store') || t.includes('iap')) return 'Monetization';
  if (t.includes('tech') || t.includes('architect') || t.includes('performance')) return 'Technical';
  if (t.includes('content') || t.includes('level') || t.includes('world')) return 'Content';
  if (t.includes('platform') || t.includes('build') || t.includes('deploy')) return 'Platform';
  return 'General';
}

function extractPriority(text) {
  const match = text.match(/\b(P0|P1|P2)\b/);
  return match ? match[1] : null;
}

function isStrikethrough(text) {
  return text.startsWith('~~') && text.endsWith('~~');
}

function cleanText(text) {
  return text
    .replace(/^~~|~~$/g, '')
    .replace(/\*\*/g, '')
    .replace(/^\s*[-•]\s*/, '')
    .trim();
}

export default function extractFeatures(raw, progressData) {
  if (!raw) return { categories: [], summary: { total: 0, complete: 0, inProgress: 0, blocked: 0, planned: 0 } };

  const parsed = parseContextMarkdown(raw);
  const features = [];
  let idCounter = 1;

  for (const section of parsed.sections) {
    const sTitle = section.title.toLowerCase();

    // "What's Working Well" → complete features
    if (sTitle.includes('working well') || sTitle.includes('strengths') || sTitle.includes('what works')) {
      for (const item of section.items) {
        if (item.type === 'list' || item.type === 'kv' || item.type === 'sub') {
          const text = item.value || item.key || '';
          features.push({
            id: `f-${idCounter++}`,
            name: cleanText(item.key || text.split(/[.—\-:]/)[0]).slice(0, 80),
            description: cleanText(text),
            status: 'complete',
            category: inferCategory(section.title),
            priority: null,
            source: section.title,
          });
        }
      }
      continue;
    }

    // "Known Gaps" / "Critical Gaps" → blocked or planned
    if (sTitle.includes('gap') || sTitle.includes('missing') || sTitle.includes('needs')) {
      for (const item of section.items) {
        if (item.type === 'list' || item.type === 'kv' || item.type === 'numbered') {
          const text = item.value || item.key || '';
          const priority = extractPriority(text);
          features.push({
            id: `f-${idCounter++}`,
            name: cleanText(item.key || text.split(/[.—\-:]/)[0]).slice(0, 80),
            description: cleanText(text),
            status: priority === 'P0' ? 'blocked' : 'planned',
            category: inferCategory(section.title),
            priority,
            source: section.title,
          });
        }
      }
      continue;
    }

    // "Critical Path to Launch" → in-progress (strikethrough = complete)
    if (sTitle.includes('critical path') || sTitle.includes('roadmap') || sTitle.includes('milestones')) {
      for (const item of section.items) {
        if (item.type === 'numbered' || item.type === 'list') {
          const text = item.value || '';
          const struck = isStrikethrough(text);
          const priority = extractPriority(text);
          features.push({
            id: `f-${idCounter++}`,
            name: cleanText(text.split(/[.—\-:]/)[0]).slice(0, 80),
            description: cleanText(text),
            status: struck ? 'complete' : 'in-progress',
            category: inferCategory(section.title),
            priority,
            source: section.title,
          });
        }
      }
      continue;
    }

    // Architecture / Systems sections — look for status indicators in text
    if (sTitle.includes('architecture') || sTitle.includes('systems') || sTitle.includes('codebase')) {
      for (const item of section.items) {
        const text = item.value || item.key || '';
        const lower = text.toLowerCase();
        let status = 'planned';
        if (lower.includes('complete') || lower.includes('done') || lower.includes('✓') || lower.includes('✅')) status = 'complete';
        else if (lower.includes('in progress') || lower.includes('wip') || lower.includes('partial')) status = 'in-progress';
        else if (lower.includes('todo') || lower.includes('not started')) status = 'planned';
        else if (lower.includes('blocked') || lower.includes('broken') || lower.includes('critical')) status = 'blocked';

        if (item.type === 'kv' || item.type === 'list') {
          features.push({
            id: `f-${idCounter++}`,
            name: cleanText(item.key || text.split(/[.—\-:]/)[0]).slice(0, 80),
            description: cleanText(text),
            status,
            category: 'Technical',
            priority: extractPriority(text),
            source: section.title,
          });
        }
      }
      continue;
    }
  }

  // Enrich from progress.json categories
  if (progressData && progressData.categories) {
    for (const [catName, catData] of Object.entries(progressData.categories)) {
      if (!catData.items) continue;
      for (const [itemName, itemValue] of Object.entries(catData.items)) {
        const pct = typeof itemValue === 'number' ? itemValue : (itemValue?.progress ?? 0);
        // Only add if not already tracked
        const exists = features.some(f =>
          f.name.toLowerCase().includes(itemName.toLowerCase()) ||
          itemName.toLowerCase().includes(f.name.toLowerCase())
        );
        if (!exists) {
          features.push({
            id: `f-${idCounter++}`,
            name: itemName,
            description: `${catName} — ${Math.round(pct)}% complete`,
            status: pct >= 100 ? 'complete' : pct > 0 ? 'in-progress' : 'planned',
            category: catName,
            priority: null,
            source: 'progress.json',
            progress: pct,
          });
        }
      }
    }
  }

  // Group by category
  const catMap = {};
  for (const f of features) {
    if (!catMap[f.category]) catMap[f.category] = [];
    catMap[f.category].push(f);
  }

  const categories = Object.entries(catMap).map(([name, items]) => ({
    name,
    items,
    complete: items.filter(i => i.status === 'complete').length,
    total: items.length,
  }));

  const summary = {
    total: features.length,
    complete: features.filter(f => f.status === 'complete').length,
    inProgress: features.filter(f => f.status === 'in-progress').length,
    blocked: features.filter(f => f.status === 'blocked').length,
    planned: features.filter(f => f.status === 'planned').length,
  };

  return { categories, features, summary };
}

export { STATUS_COLORS, PRIORITY_COLORS };
