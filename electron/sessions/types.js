/**
 * @typedef {'active'|'dormant'} TabStatus
 *
 * @typedef {Object} TabRecord
 * @property {string} id                       Forge-generated UUID; stable across resumes.
 * @property {string|null} sessionId           Claude session UUID; null until .jsonl appears.
 * @property {string} cwd                      Absolute cwd of the CLI.
 * @property {number|null} pid                 PTY pid; null when dormant.
 * @property {TabStatus} status
 * @property {string} label                    Derived from last user message; <=60 chars.
 * @property {number} createdAt                Date.now() at spawn.
 * @property {number} lastActivityAt           Date.now() of most recent jsonl mtime or spawn.
 * @property {string|null} scopeId             Forge's existing PTY scopeId (ties into ptyProcesses map). Null if untied.
 * @property {number} restoreFailureCount      Consecutive restore failures since last success. Used for quarantine. 0 normally.
 * @property {string|null} [agentSlug]         Forge agent slug at spawn time (e.g. "solutions-architect"). Null for generic PTYs.
 * @property {string|null} [projectSlug]       Forge project slug at spawn time. Null for studio / non-project.
 * @property {string|null} [recommendationId]  Forge rec ID at spawn time (e.g. "HOM-042"). Null for non-rec CLIs.
 */
module.exports = {};
