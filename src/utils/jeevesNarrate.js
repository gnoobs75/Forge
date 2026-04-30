// jeevesNarrate — pure narration helper for Studio Steward actions.
//
// Given a `recentActions` row from the steward:status payload, return a
// human-readable narrative the dashboard can render in JeevesNotes,
// ActivityFeed, and StudioTimeline. Per-rule humanizers handle the four
// built-in rules; an "unknown rule" fallback preserves usefulness for
// future rules without blocking on UI changes.
//
// Outcome modifiers ("Skipped: …", "Failed: …") are applied last so the
// rule-specific phrasing comes through when the run was successful.

function recIdFromOutput(output) {
  if (typeof output !== 'string' || !output) return null;
  // rec-resolved-update-history rule emits: "journaled <recId> for <slug> → <sha>"
  const histMatch = /^journaled\s+(\S+)\s+for\s+/.exec(output);
  if (histMatch) return histMatch[1];
  return null;
}

function recIdFromPath(filePath) {
  if (typeof filePath !== 'string' || !filePath) return null;
  const base = filePath.split('/').pop() || '';
  return base.endsWith('.json') ? base.slice(0, -5) : base || null;
}

function extractRecId(action) {
  return recIdFromOutput(action?.output)
      ?? recIdFromPath(action?.payload?.path);
}

function narrateRecResolvedUpdateHistory(action) {
  const recId = extractRecId(action);
  const subject = recId ?? 'the recommendation';
  return {
    headline: `Logged ${subject} to history.json`,
    why: recId
      ? `Triggered when ${recId} flipped to resolved. Appended one entry.`
      : 'Triggered when a recommendation flipped to resolved. Appended one entry.',
  };
}

function narrateRecResolvedUpdateFeatures(action) {
  const recId = extractRecId(action);
  const features = Array.isArray(action?.payload?.features_affected)
    ? action.payload.features_affected
    : [];
  let headline;
  if (features.length === 1) {
    headline = `Flipped feature ${features[0]} to complete in features.json`;
  } else if (features.length > 1) {
    headline = `Flipped ${features.length} features to complete in features.json`;
  } else {
    headline = 'Flipped features to complete in features.json';
  }
  return {
    headline,
    why: recId
      ? `Triggered when ${recId} flipped to resolved with features_affected.`
      : 'Triggered when a recommendation flipped to resolved with features_affected.',
  };
}

function narratePrdMaintain(action) {
  const project = action?.project ?? 'the project';
  return {
    headline: `Refreshed ${project} PRD`,
    why: `Triggered when ${project}'s history/features/todo changed. Recomputed dynamic sections.`,
  };
}

function narrateManualTest() {
  return {
    headline: 'Acknowledged a debug ping',
    why: 'Triggered manually via the Steward control panel.',
  };
}

function narrateUnknown(action) {
  const ruleId = action?.rule_id ?? 'unknown rule';
  const output = typeof action?.output === 'string' ? action.output.trim() : '';
  const source = action?.source ?? 'unknown';
  const kind = action?.kind ?? 'unknown';
  const project = action?.project ?? 'unknown';
  return {
    headline: output ? output : `Ran ${ruleId}`,
    why: `Triggered by ${source}:${kind} on ${project}.`,
  };
}

const RULE_NARRATORS = {
  'rec-resolved-update-history': narrateRecResolvedUpdateHistory,
  'rec-resolved-update-features': narrateRecResolvedUpdateFeatures,
  'prd-maintain-on-history-change': narratePrdMaintain,
  'manual-test': narrateManualTest,
};

function applyOutcomeModifier({ headline, why }, action) {
  const outcome = action?.outcome;
  if (outcome === 'skipped') {
    return { headline: `Skipped: ${headline}`, why };
  }
  if (outcome === 'error') {
    const errLine = typeof action?.error === 'string'
      ? action.error.split('\n')[0].trim()
      : '';
    return {
      headline: errLine ? `Failed: ${errLine}` : `Failed: ${headline}`,
      why,
    };
  }
  return { headline, why };
}

export function jeevesNarrate(action) {
  const ruleId = action?.rule_id ?? null;
  const narrator = ruleId && RULE_NARRATORS[ruleId] ? RULE_NARRATORS[ruleId] : narrateUnknown;
  const base = narrator(action ?? {});
  const { headline, why } = applyOutcomeModifier(base, action);
  return {
    headline,
    why,
    when: action?.completed_at ?? null,
    where: action?.project ?? null,
    ruleId,
    outcome: action?.outcome ?? 'unknown',
  };
}
