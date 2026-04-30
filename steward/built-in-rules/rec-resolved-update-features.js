// Built-in rule: rec-resolved-update-features
//
// Companion to rec-resolved-update-history. When a recommendation resolves
// AND it carries a `features_affected: ['feat-id', ...]` array (or the
// older `feature_ids` field), flip those features in features.json from
// whatever status they had to 'complete'.
//
// Rules-evaluation note: this rule fires on the SAME chokidar event that
// triggers rec-resolved-update-history. Both tasks land in the queue and
// the worker pool runs them independently — they edit different files
// (history.json vs features.json), so studioWrite's per-path debounce
// + per-intent commit grouping keep them as two separate, parallel
// `steward:` commits with their own intent UUIDs.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { studioWrite, commitIntent } from '../studio-write.js';

const REC_PATH_REGEX = /^projects\/([^/]+)\/recommendations\/[^/]+\.json$/;
const COMPLETE_STATUS = 'complete';

export const recResolvedUpdateFeatures = {
  id: 'rec-resolved-update-features',
  priority: 'high',
  description: 'When a resolved rec lists features_affected[], flip those features in features.json to complete.',

  trigger: {
    source: 'hq',
    kind: 'file-changed',
    match: (event) => {
      const p = event?.payload?.path;
      if (typeof p !== 'string') return false;
      if (event.payload.event === 'unlink') return false;
      return REC_PATH_REGEX.test(p);
    },
  },

  handler: async ({ event, dataDir, intentUUID }) => {
    const relPath = event.payload.path;
    const m = REC_PATH_REGEX.exec(relPath);
    if (!m) return { outcome: 'skipped', output: 'path did not match recs pattern' };
    const slug = m[1];

    const recAbsPath = path.join(dataDir, relPath);
    if (!fs.existsSync(recAbsPath)) {
      return { outcome: 'skipped', output: `rec file not found: ${recAbsPath}` };
    }

    let rec;
    try {
      rec = JSON.parse(fs.readFileSync(recAbsPath, 'utf-8'));
    } catch (err) {
      return { outcome: 'error', error: `failed to parse rec JSON: ${err.message}` };
    }

    if (rec.status !== 'resolved') {
      return { outcome: 'skipped', output: `rec status is "${rec.status}", not resolved` };
    }

    const affectedIds = Array.isArray(rec.features_affected) ? rec.features_affected
      : Array.isArray(rec.feature_ids) ? rec.feature_ids
      : null;
    if (!affectedIds || affectedIds.length === 0) {
      return { outcome: 'skipped', output: 'rec has no features_affected[] / feature_ids[]' };
    }

    const featuresPath = path.join(dataDir, 'projects', slug, 'features.json');
    if (!fs.existsSync(featuresPath)) {
      return { outcome: 'skipped', output: `features.json not found at ${featuresPath}` };
    }

    let featuresDoc;
    try {
      featuresDoc = JSON.parse(fs.readFileSync(featuresPath, 'utf-8'));
    } catch (err) {
      return { outcome: 'error', error: `failed to parse features.json: ${err.message}` };
    }

    if (!Array.isArray(featuresDoc.features)) {
      return { outcome: 'skipped', output: 'features.json has no features[] array' };
    }

    // Walk features, flip status for any matching id. Track which ones we
    // actually changed (vs already-complete or unknown ids) so the commit
    // message + idempotency check are accurate.
    const flipped = [];
    const alreadyComplete = [];
    const unknown = new Set(affectedIds);
    for (const feat of featuresDoc.features) {
      if (!feat || typeof feat.id !== 'string') continue;
      if (!affectedIds.includes(feat.id)) continue;
      unknown.delete(feat.id);
      if (feat.status === COMPLETE_STATUS) {
        alreadyComplete.push(feat.id);
        continue;
      }
      feat.status = COMPLETE_STATUS;
      flipped.push(feat.id);
    }

    if (flipped.length === 0) {
      const reason = alreadyComplete.length > 0 && unknown.size === 0
        ? `all ${alreadyComplete.length} affected features already complete`
        : unknown.size > 0
          ? `no known features matched (unknown ids: ${[...unknown].join(', ')})`
          : 'no flips required';
      return { outcome: 'skipped', output: reason };
    }

    // Bookkeeping fields the dashboard scanner appreciates
    featuresDoc.lastUpdated = new Date().toISOString();

    // Resolve git repo (Agency root, typically)
    let repoPath;
    try {
      repoPath = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: path.dirname(featuresPath),
        encoding: 'utf-8',
      }).trim();
    } catch (err) {
      return { outcome: 'error', error: `git rev-parse failed for ${featuresPath}: ${err.message}` };
    }

    await studioWrite({
      path: featuresPath,
      content: featuresDoc,
      intentUUID,
      format: 'json',
      repoPath,
      debounceMs: 100,
    });

    const recId = rec.id || path.basename(relPath, '.json');
    const flippedSummary = flipped.length === 1
      ? flipped[0]
      : `${flipped.length} features (${flipped.slice(0, 3).join(', ')}${flipped.length > 3 ? '…' : ''})`;
    const commitResult = await commitIntent(
      intentUUID,
      `flip features.json — ${flippedSummary} → complete (${recId})`
    );
    if (!commitResult.committed) {
      return { outcome: 'error', error: `commitIntent returned ${commitResult.reason}` };
    }
    if (commitResult.results[0]?.error) {
      return { outcome: 'error', error: `git commit failed: ${commitResult.results[0].error}` };
    }
    const sha = commitResult.results[0]?.sha;

    return {
      outcome: 'success',
      output: `flipped ${flipped.length} feature(s) for ${slug} → ${sha?.slice(0, 8)}: ${flipped.join(', ')}`,
    };
  },
};
