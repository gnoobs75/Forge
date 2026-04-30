# Built-in Steward rules

This directory holds the JS implementations of the **built-in** reactor
rules — the ones the Steward ships with out of the box. Each rule
exports a `{ id, priority, description, trigger, handler }` object that
the reactor (`steward/reactor.js`) registers in `BUILT_IN_RULES[]`.

Future Phase 6+ work will add user-editable file-loaded rules at
`hq-data/.steward/rules/*.md` (markdown with YAML frontmatter + Groq
cheap classifier prompt + Claude task prompt). Until then, custom rule
logic requires editing JS in this directory.

---

## Registered rules (4)

### `rec-resolved-update-history` — high priority
**File:** `rec-resolved-update-history.js`
**Trigger:** chokidar `change`/`add` on `projects/<slug>/recommendations/<file>.json` (skip `unlink`)
**What it does:**
1. Read the rec
2. Skip if `rec.status !== 'resolved'`
3. Skip if `history.entries[]` already contains an entry with `rec.id` (idempotency)
4. Build new entry per `hq-data/playbooks/journal-maintenance.md` schema
5. `studioWrite` the updated `projects/<slug>/history.json` with intentUUID = task.id
6. `commitIntent` with message `steward: append history.json — <title> [intent: <uuid8>]`

**Outcome:** `success` (commit landed) / `skipped` (already journaled or not resolved) / `error`

### `rec-resolved-update-features` — high priority
**File:** `rec-resolved-update-features.js`
**Trigger:** same as above (chokidar on recs/*.json)
**What it does:**
1. Read the rec
2. Skip if `rec.status !== 'resolved'`
3. Skip if no `features_affected[]` (also accepts legacy `feature_ids[]`)
4. Read `projects/<slug>/features.json`
5. For each id in `features_affected`, find matching feature, flip `status` to `'complete'`
6. Skip if no flips required (all already complete or no matches)
7. `studioWrite` features.json + `commitIntent` with message `steward: flip features.json — <feature ids> → complete (<rec id>)`

### `prd-maintain-on-history-change` — medium priority
**File:** `prd-maintain-on-history-change.js`
**Trigger:** chokidar change on `projects/<slug>/(history|features|todo).json` (skip `unlink`, skip `prd.md` itself to terminate the chain)
**What it does:**
1. Read PRD (or seed an empty skeleton via `prd/parser.js#buildSkeleton`)
2. Read source files: features.json, history.json, todo.json (any may be null)
3. Skip if no PRD AND no sources (nothing to do)
4. Run `prd/maintainer.js#rebuildDynamicSections` — recomputes Implementation Status table from features, Recently Shipped from history (last 10), Open Questions from todo items where `category` ends `-question`
5. Skip if no dynamic-section changes (idempotency)
6. Serialize PRD via `prd/parser.js#serialize`
7. `studioWrite` prd.md + `commitIntent` with message `steward: (seed|maintain) prd.md (<slug>) — <changed sections>`

### `manual-test` — low priority (debug only)
**File:** `manual-test.js`
**Trigger:** never matches a real event (`source: '__never__'`)
**What it does:** No-op handler used by the `enqueue-test-task` control action for verifying the daemon dispatch path end-to-end without needing real studio events.

---

## How the chain terminates

A single resolved rec produces a multi-step cascade:

```
rec-XYZ.json gets `status: "resolved"` (user click or agent write)
    ↓ chokidar
hq:file-changed event { path: "projects/arena/recommendations/rec-XYZ.json" }
    ↓ reactor matches
TWO tasks enqueued (rec-resolved-update-history + rec-resolved-update-features)
    ↓ pool runs both
TWO `steward:` commits land: append history.json + flip features.json
    ↓ chokidar (history.json change)
hq:file-changed event { path: "projects/arena/history.json" }
    ↓ reactor matches
ONE task enqueued (prd-maintain-on-history-change)
    ↓ pool runs it
ONE `steward:` commit lands: maintain prd.md
    ↓ chokidar (prd.md change)
hq:file-changed event { path: "projects/arena/prd.md" }
    ↓ reactor finds NO matching rule
END
```

Net: **one rec resolution → 3 commits → loop closes.**

---

## Adding a new built-in rule

1. Create `<rule-id>.js` exporting `{ id, priority, description, trigger, handler }`
2. Import + add to `BUILT_IN_RULES[]` in `../reactor.js`
3. Add tests at `../__tests__/<rule-id>.test.js` following the pattern in `rec-resolved-update-features.test.js`:
   - Test the trigger spec matches/skips correctly
   - Test handler outcomes (success / skipped / error) with realistic fixtures
   - Test idempotency
4. Restart the Steward (kill node process via Task Manager — supervisor respawns within 100ms with the new code)

The handler signature is:
```js
async ({ event, dataDir, intentUUID }) => {
  // ... do work, write via studioWrite + commitIntent ...
  return { outcome: 'success' | 'skipped' | 'error' | 'timeout', output?: string, error?: string };
}
```

`intentUUID` is the task id — use it for `studioWrite({ intentUUID })` so all writes from one task get grouped into one git commit by `commitIntent`.

---

## See also

- Architecture & lifecycle: `council-of-elrond/README.md`
- Design doc: `docs/plans/2026-04-27-studio-steward-design.md` §2.4 (reactor rules)
- Daemon implementation plan: `docs/plans/2026-04-27-steward-daemon-plan.md`
- Manual journaling fallback (when Steward is paused): `hq-data/playbooks/journal-maintenance.md`
- Studio Steward state directory: `hq-data/.steward/README.md`
