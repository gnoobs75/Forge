/**
 * todoAppend — append a new item to a project's todo.json from the
 * "+ Add todo" modal in <TodoPanel>.
 *
 * The user supplies title/summary/priority/category/estimatedMinutes/
 * blockedBy via a small form. We auto-mint the `id` from the highest
 * existing `todo-NNN` slot + 1 and stamp `added` with today's date
 * unless the caller passes explicit values.
 *
 * Idempotency is the user's problem here (free-form inputs); we simply
 * append every call. The TodoPanel form itself disables the submit
 * button while a write is in-flight.
 */

function getHq() {
    if (typeof window === 'undefined') return null;
    return (window.electronAPI && window.electronAPI.hq) || null;
}

export function nextTodoId(items) {
    const numbers = (items || [])
        .map((i) => /^todo-(\d+)$/i.exec((i && i.id) || ''))
        .filter(Boolean)
        .map((m) => parseInt(m[1], 10))
        .filter((n) => Number.isFinite(n));
    const next = numbers.length ? Math.max(...numbers) + 1 : 1;
    return `todo-${String(next).padStart(3, '0')}`;
}

export function buildTodoItem(input, existingItems, opts = {}) {
    const now = opts.now || new Date();
    const id = ((input && input.id) || '').trim() || nextTodoId(existingItems);
    const estimatedMinutesRaw = input && input.estimatedMinutes;
    const estimatedMinutes =
        estimatedMinutesRaw === '' || estimatedMinutesRaw == null
            ? null
            : Number.isFinite(Number(estimatedMinutesRaw))
                ? Number(estimatedMinutesRaw)
                : null;
    return {
        id,
        added: (input && input.added) || now.toISOString().slice(0, 10),
        priority: (input && input.priority) || 'medium',
        category: ((input && input.category) || '').trim() || 'general',
        title: ((input && input.title) || '').trim(),
        summary: ((input && input.summary) || '').trim(),
        blockedBy: (input && input.blockedBy) || null,
        estimatedMinutes,
    };
}

/**
 * Append a new todo item to `projects/<slug>/todo.json`. Creates the file
 * (with empty seed) if it doesn't exist. Returns:
 *   { ok: true, item }
 *   { ok: false, reason: 'hq-not-wired' | 'no-slug' | 'title-required'
 *               | 'malformed-json' | 'write-failed', error? }
 */
export async function appendTodoItem(slug, input, opts = {}) {
    const hq = opts.hq || getHq();
    if (!hq || typeof hq.readFile !== 'function' || typeof hq.writeFile !== 'function') {
        return { ok: false, reason: 'hq-not-wired' };
    }
    if (!slug) return { ok: false, reason: 'no-slug' };
    if (!input || !String(input.title || '').trim()) {
        return { ok: false, reason: 'title-required' };
    }

    const path = `projects/${slug}/todo.json`;

    let env;
    try {
        env = await hq.readFile(path);
    } catch (e) {
        return { ok: false, reason: 'read-error', error: e && e.message };
    }

    let doc;
    if (!env || env.ok === false) {
        // First-time bootstrap: create a fresh document.
        doc = {
            project: slug,
            schemaVersion: 1,
            note: 'Pending tasks separate from active recommendations.',
            items: [],
        };
    } else {
        try {
            doc = JSON.parse(env.data);
        } catch {
            return { ok: false, reason: 'malformed-json' };
        }
        if (!doc || typeof doc !== 'object') {
            return { ok: false, reason: 'malformed-json' };
        }
    }
    if (!Array.isArray(doc.items)) doc.items = [];

    const newItem = buildTodoItem(input, doc.items, opts);
    doc.items = [...doc.items, newItem];
    doc.lastUpdated = (opts.now || new Date()).toISOString();

    try {
        const res = await hq.writeFile(path, JSON.stringify(doc, null, 2) + '\n');
        if (res && res.ok === false) {
            return { ok: false, reason: 'write-failed', error: res.error };
        }
        return { ok: true, item: newItem };
    } catch (e) {
        return { ok: false, reason: 'write-failed', error: e && e.message };
    }
}
