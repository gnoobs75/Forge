/**
 * Compose a human-readable display title for a recommendation.
 * Prefixes the rec's Forge ID when present, otherwise returns the raw title.
 *
 * The stored `title` is never mutated; this helper composes the ID + title
 * at render time so the underlying JSON stays clean.
 *
 * @param {{ id?: string|null, title?: string|null }} rec
 * @returns {string}
 */
export function recDisplayTitle(rec) {
  if (!rec) return '';
  const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : null;
  const title = typeof rec.title === 'string' ? rec.title : '';
  return id ? `${id} ${title}` : title;
}
