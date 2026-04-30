/**
 * journalIo — fetch helpers for per-project journal data.
 *
 * Reads `hq-data/projects/<slug>/{history,todo}.json` via the existing
 * `hq:read-file` IPC channel exposed on `window.electronAPI.hq.readFile(path)`.
 *
 * Returned envelope from electron:
 *   { ok: true,  data: '<json string>' }   on success
 *   { ok: false, error: '<message>' }       on miss / read failure
 *
 * Components should always call these helpers — they handle the
 * "Electron not wired" jsdom case gracefully so vitest can mount the
 * panels without spewing unhandled rejections.
 *
 * Mirrors the lazy-resolve pattern in
 * `progression-graph/util/ipcClient.js` so HMR-late Electron loads work.
 */

const NOT_WIRED_ERR =
    'Electron IPC pending — restart Electron after wiring up hq:read-file.';

function getHqApi() {
    if (typeof window === 'undefined') return null;
    return (
        (window.electronAPI && window.electronAPI.hq) ||
        (window.electron && window.electron.hq) ||
        null
    );
}

function emptyHistory(slug) {
    return { project: slug, schemaVersion: 1, entries: [] };
}

function emptyTodo(slug) {
    return { project: slug, schemaVersion: 1, items: [] };
}

async function readJson(relPath) {
    const hq = getHqApi();
    if (!hq || typeof hq.readFile !== 'function') {
        return { ok: false, error: NOT_WIRED_ERR, data: null };
    }
    try {
        const env = await hq.readFile(relPath);
        if (!env || env.ok === false) {
            return { ok: false, error: (env && env.error) || 'read failed', data: null };
        }
        const parsed = JSON.parse(env.data);
        return { ok: true, data: parsed };
    } catch (err) {
        return { ok: false, error: err && err.message ? err.message : String(err), data: null };
    }
}

export async function loadHistory(slug) {
    if (!slug) return { ok: true, data: emptyHistory('unknown'), wired: false };
    const env = await readJson(`projects/${slug}/history.json`);
    if (!env.ok) return { ok: false, error: env.error, data: emptyHistory(slug) };
    // Defensive: ensure shape.
    const data = env.data || emptyHistory(slug);
    if (!Array.isArray(data.entries)) data.entries = [];
    return { ok: true, data };
}

export async function loadTodo(slug) {
    if (!slug) return { ok: true, data: emptyTodo('unknown'), wired: false };
    const env = await readJson(`projects/${slug}/todo.json`);
    if (!env.ok) return { ok: false, error: env.error, data: emptyTodo(slug) };
    const data = env.data || emptyTodo(slug);
    if (!Array.isArray(data.items)) data.items = [];
    return { ok: true, data };
}

export const __test__ = { NOT_WIRED_ERR, getHqApi };
