/**
 * historyAppend — auto-append an entry to a project's history.json when a
 * recommendation is resolved.
 *
 * Wired from `useStore.updateRecommendationStatus` AFTER the rec file is
 * written with `status: 'resolved'`. Best-effort: silent on missing
 * history.json, malformed JSON, or unwired IPC. Surfaces write failures to
 * the caller so they can toast a warning.
 *
 * Dupe-suppression: if an entry with the same id already exists, skip the
 * append. Re-resolving a previously-resolved rec is therefore idempotent.
 */

function getHq() {
    if (typeof window === 'undefined') return null;
    return (window.electronAPI && window.electronAPI.hq) || null;
}

/**
 * Pull a stable id for the journal entry. Prefer the rec filename stem
 * (e.g. `EXP-243-foo.json` → `EXP-243-foo`) since CoE recs don't carry an
 * intrinsic id field — timestamp+title is the disk-level key.
 */
export function pickEntryId(rec, fileName) {
    if (fileName) return String(fileName).replace(/\.json$/i, '');
    if (rec && rec.id) return String(rec.id);
    if (rec && rec.timestamp) return String(rec.timestamp);
    return `unknown-${Date.now()}`;
}

/**
 * Take the first sentence of a longer summary, hard-capped at `max` chars.
 * Falls back to the whole string trimmed if no sentence boundary is found.
 */
export function pickEntrySummary(text, max = 240) {
    if (!text) return '';
    const trimmed = String(text).trim();
    const firstSentence = trimmed.split(/(?<=[a-z]\.)\s+/)[0] || trimmed;
    return firstSentence.slice(0, max);
}

export function buildHistoryEntry(rec, fileName, opts = {}) {
    const now = opts.now || new Date();
    return {
        date: now.toISOString().slice(0, 10),
        id: pickEntryId(rec, fileName),
        agent: (rec && rec.agent) || '',
        title: (rec && rec.title) || '',
        summary: pickEntrySummary((rec && (rec.summary || rec.title)) || ''),
        ref: fileName ? `recommendations/${fileName}` : '',
    };
}

/**
 * Append a journal entry to `projects/<slug>/history.json`. Returns:
 *   { ok: true, entry }
 *   { ok: false, reason: 'hq-not-wired' | 'no-slug' | 'history-missing'
 *               | 'malformed-json' | 'duplicate' | 'write-failed', error? }
 *
 * Callers should treat `ok:false` with reason in
 * { hq-not-wired, no-slug, history-missing, duplicate } as benign skips
 * (no toast). `write-failed` / `malformed-json` are worth a warning.
 */
export async function appendHistoryEntryForRec(slug, rec, fileName, opts = {}) {
    const hq = opts.hq || getHq();
    if (!hq || typeof hq.readFile !== 'function' || typeof hq.writeFile !== 'function') {
        return { ok: false, reason: 'hq-not-wired' };
    }
    if (!slug) return { ok: false, reason: 'no-slug' };

    const path = `projects/${slug}/history.json`;
    let env;
    try {
        env = await hq.readFile(path);
    } catch (e) {
        return { ok: false, reason: 'read-error', error: e && e.message };
    }
    if (!env || env.ok === false) {
        return { ok: false, reason: 'history-missing' };
    }

    let journal;
    try {
        journal = JSON.parse(env.data);
    } catch {
        return { ok: false, reason: 'malformed-json' };
    }
    if (!journal || typeof journal !== 'object') {
        return { ok: false, reason: 'malformed-json' };
    }
    if (!Array.isArray(journal.entries)) journal.entries = [];

    const newEntry = buildHistoryEntry(rec, fileName, opts);

    const exists = journal.entries.some((e) => e && e.id === newEntry.id);
    if (exists) return { ok: false, reason: 'duplicate', id: newEntry.id };

    journal.entries = [newEntry, ...journal.entries];
    journal.lastUpdated = (opts.now || new Date()).toISOString();

    try {
        const writeRes = await hq.writeFile(path, JSON.stringify(journal, null, 2) + '\n');
        if (writeRes && writeRes.ok === false) {
            return { ok: false, reason: 'write-failed', error: writeRes.error };
        }
        return { ok: true, entry: newEntry };
    } catch (e) {
        return { ok: false, reason: 'write-failed', error: e && e.message };
    }
}
