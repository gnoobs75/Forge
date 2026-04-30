// Pure helper — map an absolute filesystem path to a project slug by
// finding the longest-matching `repoPath` prefix among the given projects.
// Returns null when the inputs are invalid or no project matches.

function normalize(p) {
  if (typeof p !== 'string' || p.length === 0) return ''
  let out = p.replace(/\\/g, '/').toLowerCase()
  out = out.replace(/\/+/g, '/')
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1)
  return out
}

export function projectSlugFromCwd(cwd, projects) {
  const normCwd = normalize(cwd)
  if (!normCwd) return null
  if (!Array.isArray(projects) || projects.length === 0) return null

  let bestSlug = null
  let bestLen = -1

  for (const project of projects) {
    if (!project || typeof project.slug !== 'string') continue
    const normRepo = normalize(project.repoPath)
    if (!normRepo) continue
    const isMatch =
      normCwd === normRepo ||
      normCwd.startsWith(normRepo + '/')
    if (!isMatch) continue
    if (normRepo.length > bestLen) {
      bestLen = normRepo.length
      bestSlug = project.slug
    }
  }

  return bestSlug
}

export default projectSlugFromCwd
