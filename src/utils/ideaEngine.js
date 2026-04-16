// Daily Idea Generation Engine
// Selects 3-4 context-aware agents per project, generates ideas via Groq

import { AGENT_PERSONALITIES } from './agentPersonalities';

const IDEA_ROSTER_KEY = 'forge-idea-roster';
const LAST_GEN_KEY = 'forge-last-idea-gen';

function loadRoster() {
  try {
    const stored = localStorage.getItem(IDEA_ROSTER_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
}

function saveRoster(roster) {
  try { localStorage.setItem(IDEA_ROSTER_KEY, JSON.stringify(roster)); } catch {}
}

// Select 3-4 agents based on recent activity
export function selectDailyAgents(projectSlug, agents, activityLog, recommendations) {
  const now = Date.now();
  const twoDaysAgo = now - 48 * 60 * 60 * 1000;
  const roster = loadRoster();
  const previousSet = roster[projectSlug] || [];

  // Score agents by recent activity on this project
  const scored = agents.map(agent => {
    let score = 0;

    // Recent activity entries
    const recentActivity = activityLog.filter(
      a => a.project === projectSlug &&
           agents.find(ag => ag.name === a.agent)?.id === agent.id &&
           new Date(a.timestamp).getTime() > twoDaysAgo
    );
    score += recentActivity.length * 2;

    // Recent recommendations
    const recentRecs = recommendations.filter(
      r => r.project === projectSlug &&
           agents.find(ag => ag.name === r.agent)?.id === agent.id &&
           new Date(r.timestamp).getTime() > twoDaysAgo
    );
    score += recentRecs.length * 3;

    // Penalty if was in previous set (avoid repeating)
    if (previousSet.includes(agent.id)) score -= 5;

    // Small random factor for variety
    score += Math.random() * 2;

    return { agent, score };
  });

  // Sort by score, take top 3-4
  scored.sort((a, b) => b.score - a.score);
  const count = 3 + (Math.random() > 0.5 ? 1 : 0); // 3 or 4
  const selected = scored.slice(0, count).map(s => s.agent);

  // Save to roster
  roster[projectSlug] = selected.map(a => a.id);
  saveRoster(roster);

  return selected;
}

// Check if daily generation already ran today
export function hasGeneratedToday() {
  try {
    const last = localStorage.getItem(LAST_GEN_KEY);
    if (!last) return false;
    const today = new Date().toISOString().slice(0, 10);
    return last === today;
  } catch { return false; }
}

export function markGeneratedToday() {
  const today = new Date().toISOString().slice(0, 10);
  try { localStorage.setItem(LAST_GEN_KEY, today); } catch {}
}

// Generate a single idea for an agent + project via Groq
export async function generateIdea(agent, project) {
  const groq = window.electronAPI?.groq;
  if (!groq) return null;

  const personality = AGENT_PERSONALITIES[agent.id];
  if (!personality) return null;

  const systemPrompt = personality.systemPrompt + '\n\nYou are dropping your daily idea on the studio idea board.';
  const userMessage = `Drop one creative, specific idea for the "${project.name}" project (${project.genre}, ${project.platforms?.join('/')}, currently in ${project.phase} phase). Just the idea in 1-2 sentences. Be specific about what to build or change. No preamble, no "what if" — state it directly.`;

  try {
    const result = await groq.generate({
      systemPrompt,
      userMessage,
      maxTokens: 100,
    });

    if (!result.ok) return null;

    return {
      id: `idea-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: result.content.replace(/^["']|["']$/g, '').trim(),
      source: 'agent',
      agentId: agent.id,
      agentName: agent.name,
      agentColor: agent.color,
      project: project.slug,
      status: 'active',
      createdAt: new Date().toISOString(),
      analysis: null,
      recommendation: null,
    };
  } catch (err) {
    console.warn(`[IdeaEngine] Failed to generate idea for ${agent.name}:`, err);
    return null;
  }
}

// Run the full daily generation cycle with staggered timing
export async function runDailyGeneration(projects, agents, activityLog, recommendations, addIdea, chatEngine) {
  if (hasGeneratedToday()) return;

  markGeneratedToday();

  for (const project of projects) {
    const selectedAgents = selectDailyAgents(project.slug, agents, activityLog, recommendations);

    // Pre-generation banter (if chatEngine is available)
    if (chatEngine) {
      const teaser = selectedAgents[0];
      if (teaser) {
        await chatEngine('idea-pre-gen', {
          agentId: teaser.id,
          agentName: teaser.name,
          projectSlug: project.slug,
          projectName: project.name,
        });
      }
    }

    // Stagger idea generation across ~20 minutes
    for (let i = 0; i < selectedAgents.length; i++) {
      const delay = i * (60000 + Math.random() * 120000); // 1-3 min between each

      setTimeout(async () => {
        const idea = await generateIdea(selectedAgents[i], project);
        if (idea) {
          addIdea(idea);

          // Post-generation chat banter
          if (chatEngine) {
            await chatEngine('idea-posted', {
              agentId: selectedAgents[i].id,
              agentName: selectedAgents[i].name,
              projectSlug: project.slug,
              projectName: project.name,
              ideaText: idea.text,
            });
          }
        }
      }, delay);
    }
  }
}
