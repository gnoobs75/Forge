/**
 * Classify git changes to determine what automation should trigger.
 * Uses commit message keyword matching + diff size heuristics + file path analysis.
 *
 * @param {Object} params
 * @param {string} params.commits - Git log output (commit messages)
 * @param {string} params.numstat - Git diff --numstat output (added/removed per file)
 * @returns {Object} Classification result
 */
export function classifyGitChange({ commits, numstat }) {
  const commitLines = (commits || '').split('\n').filter(Boolean);
  const statLines = (numstat || '').split('\n').filter(Boolean);

  // Parse numstat: "added\tremoved\tfilename"
  let totalAdded = 0;
  let totalRemoved = 0;
  const changedFiles = [];

  for (const line of statLines) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const added = parseInt(parts[0]) || 0;
      const removed = parseInt(parts[1]) || 0;
      const file = parts[2];
      totalAdded += added;
      totalRemoved += removed;
      changedFiles.push({ file, added, removed });
    }
  }

  const allMessages = commitLines.map(l => l.toLowerCase()).join(' ');
  const allFiles = changedFiles.map(f => f.file.toLowerCase());

  // Detect new files (files with many additions, zero or near-zero removals)
  const newLargeFiles = changedFiles.filter(f => f.added > 20 && f.removed < 3);

  // Package/dependency changes
  const hasDependencyChange = allFiles.some(f =>
    f.includes('package.json') || f.includes('cargo.toml') || f.includes('requirements.txt') ||
    f.includes('pubspec.yaml') || f.includes('build.gradle') || f.includes('.csproj')
  );

  // Config-only changes
  const isConfigOnly = allFiles.every(f =>
    f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml') ||
    f.endsWith('.toml') || f.endsWith('.ini') || f.endsWith('.env') ||
    f.endsWith('.config.js') || f.endsWith('.config.ts')
  );

  // Docs-only changes
  const isDocsOnly = allFiles.every(f =>
    f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.rst') ||
    f.includes('docs/') || f.includes('doc/')
  );

  // Bug fix keywords
  const isBugFix = /\b(fix|bug|patch|hotfix|resolve|issue|crash|error)\b/.test(allMessages) &&
    !(/\b(feat|feature|add|new|implement|create)\b/.test(allMessages));

  // Feature keywords
  const isFeature = /\b(feat|feature|add|new|implement|create|introduce)\b/.test(allMessages);

  // Refactor keywords
  const isRefactor = /\b(refactor|restructure|reorganize|cleanup|clean up|simplify|extract)\b/.test(allMessages);

  // Performance keywords
  const isPerformance = /\b(perf|performance|optimize|optimization|speed|fast|cache|lazy|bundle)\b/.test(allMessages);

  // New tech indicators
  const isNewTech = hasDependencyChange && (
    /\b(add|install|integrate|migrate|upgrade|switch)\b/.test(allMessages) ||
    newLargeFiles.length > 0
  );

  // Determine type
  let type = 'minor-refactor';
  let significance = 'low';
  let knowledgeWorthy = false;

  if (isDocsOnly) {
    type = 'docs';
    significance = 'low';
  } else if (isConfigOnly && !hasDependencyChange) {
    type = 'config-change';
    significance = 'low';
  } else if (isBugFix && totalAdded + totalRemoved < 100) {
    type = 'bug-fix';
    significance = 'low';
  } else if (isNewTech) {
    type = 'new-tech';
    significance = 'high';
    knowledgeWorthy = true;
  } else if (isFeature || newLargeFiles.length >= 2) {
    type = 'new-feature';
    significance = 'high';
    knowledgeWorthy = true;
  } else if (isPerformance) {
    type = 'performance';
    significance = 'medium';
  } else if (isRefactor && (totalAdded + totalRemoved > 200)) {
    type = 'major-refactor';
    significance = 'medium';
    knowledgeWorthy = true;
  } else if (isRefactor) {
    type = 'minor-refactor';
    significance = 'low';
  } else if (totalAdded + totalRemoved > 300) {
    // Large change that doesn't match other patterns — treat as feature
    type = 'new-feature';
    significance = 'high';
    knowledgeWorthy = true;
  }

  return {
    type,
    significance,
    knowledgeWorthy,
    stats: {
      totalAdded,
      totalRemoved,
      filesChanged: changedFiles.length,
      newLargeFiles: newLargeFiles.length,
      commitCount: commitLines.length,
    },
    summary: `${type} (${significance}) — ${changedFiles.length} files, +${totalAdded}/-${totalRemoved}`,
  };
}
