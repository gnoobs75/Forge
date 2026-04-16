// Maps agent IDs to their skill .md file names on disk
// Handles special cases where ID !== filename

const SKILL_FILE_OVERRIDES = {};

export function getSkillFileName(agentId) {
  return SKILL_FILE_OVERRIDES[agentId] || `${agentId}.md`;
}

export function getSkillFilePath(agentId) {
  return `Forge/agents/${getSkillFileName(agentId)}`;
}
