const { readFile } = require('node:fs/promises');

const MAX_LABEL = 60;

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const t = content
      .filter(b => b && b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text)
      .join(' ');
    return t || null;
  }
  return null;
}

async function scanTopic(jsonlPath) {
  let raw;
  try { raw = await readFile(jsonlPath, 'utf8'); }
  catch { return ''; }

  const lines = raw.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let rec;
    try { rec = JSON.parse(lines[i]); } catch { continue; }
    // Claude Code jsonl records have varied shapes. Accept role==='user' OR type==='user'
    // to be robust. Skip any assistant/tool/system entries.
    const role = rec?.role || rec?.type || rec?.message?.role;
    if (role !== 'user') continue;
    const content = rec?.content ?? rec?.message?.content;
    const text = extractText(content);
    if (!text) continue;
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    return clean.length > MAX_LABEL ? clean.slice(0, MAX_LABEL - 1) + '\u2026' : clean;
  }
  return '';
}

module.exports = { scanTopic };
