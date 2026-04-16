// Social Campaign Engine — automated content generation + Discord posting
// Content Producer as host, interviews other agents for perspective
// Three campaigns: Dev Activity, Feature Spotlight, Weekly Recap
// Three rotating styles: Blog Post, Social Thread, Interview Q&A

import { AGENT_PERSONALITIES } from './agentPersonalities';

// ─── Post Style Rotation ───

const POST_STYLES = ['blog', 'thread', 'interview'];

function getPostStyle(rotationIndex) {
  return POST_STYLES[rotationIndex % POST_STYLES.length];
}

// ─── Category → Agent Mapping (for Feature Spotlight interviews) ───

const CATEGORY_AGENT_MAP = {
  'Rendering': 'art-director',
  'Combat': 'tech-architect',
  'Fleet': 'tech-architect',
  'Industry': 'monetization',
  'Economy': 'monetization',
  'Factions': 'creative-thinker',
  'Campaign': 'creative-thinker',
  'Progression': 'player-psych',
  'Navigation & UI': 'art-director',
  'Audio': 'art-director',
  'Platform': 'tech-architect',
  'World': 'creative-thinker',
  'Onboarding': 'player-psych',
  'Gameplay': 'player-psych',
  'AI': 'tech-architect',
  'Multiplayer': 'community-manager',
  'Social': 'community-manager',
  'Racing': 'creative-thinker',
  'Customization': 'player-psych',
};

// ─── Style Prompts ───

function buildStyleInstruction(style) {
  switch (style) {
    case 'blog':
      return `Write a Studio Blog Post (300-500 words). Structure: catchy hook opening, 2-3 substantive paragraphs with real detail and personality, then a sign-off from Content Producer. Write in first person as the studio. Make it read like a real indie dev blog — passionate, honest, slightly informal.`;
    case 'thread':
      return `Write a Social Thread (150-250 words). Structure: bold hook line, then 4-6 short punchy paragraphs with headers or emoji bullets. Casual, high-energy, reads like a Twitter thread adapted for Discord. Quick but informative.`;
    case 'interview':
      return `Write an Interview Post (300-400 words). Structure: brief intro from Content Producer, then 2-3 Q&A pairs where Content Producer asks the featured agent about their work. The agent answers in character with their personality. Format questions in bold. Make it feel like a real team interview.`;
    default:
      return 'Write a detailed post (300-400 words).';
  }
}

// ─── Data Gathering ───

async function gatherDevActivityData(slug) {
  const hq = window.electronAPI?.hq;
  const git = window.electronAPI?.git;
  if (!hq) return { activities: [], commits: [] };

  let activities = [];
  try {
    const result = await hq.readFile('activity-log.json');
    if (result.ok) {
      const all = JSON.parse(result.data);
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      activities = all.filter(a => {
        const ts = new Date(a.timestamp).getTime();
        return ts > oneDayAgo && (a.project === slug || a.project === 'All Projects' || !slug);
      }).slice(0, 10);
    }
  } catch {}

  // If no recent activity, broaden to 7 days
  if (activities.length < 2) {
    try {
      const result = await hq.readFile('activity-log.json');
      if (result.ok) {
        const all = JSON.parse(result.data);
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        activities = all.filter(a => {
          const ts = new Date(a.timestamp).getTime();
          return ts > weekAgo;
        }).slice(0, 10);
      }
    } catch {}
  }

  // Get git data
  let commits = [];
  try {
    const projResult = await hq.readFile(`projects/${slug}/project.json`);
    if (projResult.ok) {
      const proj = JSON.parse(projResult.data);
      if (proj.repo_path && git) {
        const gitData = await git.getData(proj.repo_path);
        if (gitData?.recentCommits) {
          commits = gitData.recentCommits.slice(0, 5);
        }
      }
    }
  } catch {}

  return { activities, commits };
}

async function gatherFeatureData(slug, coveredIds = []) {
  const hq = window.electronAPI?.hq;
  if (!hq) return { feature: null, totalFeatures: 0, completedCount: 0 };

  try {
    const result = await hq.readFile(`projects/${slug}/features.json`);
    if (!result.ok) return { feature: null, totalFeatures: 0, completedCount: 0 };

    const data = JSON.parse(result.data);
    const features = data.features || [];
    const completed = features.filter(f => f.status === 'complete');
    const coveredSet = new Set(coveredIds);

    // Pick a completed feature we haven't covered yet
    const uncovered = completed.filter(f => !coveredSet.has(f.id));
    const pool = uncovered.length > 0 ? uncovered : completed;

    // Prefer variety — pick from least-covered category
    const catCounts = {};
    for (const id of coveredIds) {
      const f = features.find(x => x.id === id);
      if (f) catCounts[f.category] = (catCounts[f.category] || 0) + 1;
    }
    pool.sort((a, b) => (catCounts[a.category] || 0) - (catCounts[b.category] || 0));

    const feature = pool[0] || null;

    return {
      feature,
      totalFeatures: features.length,
      completedCount: completed.length,
      gameName: data.features?.[0] ? undefined : undefined, // pull from project.json instead
    };
  } catch {
    return { feature: null, totalFeatures: 0, completedCount: 0 };
  }
}

async function gatherWeeklyData(slug) {
  const hq = window.electronAPI?.hq;
  if (!hq) return { activities: [], recsCount: 0, ideasCount: 0 };

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let activities = [];
  let recsCount = 0;
  let ideasCount = 0;

  try {
    const result = await hq.readFile('activity-log.json');
    if (result.ok) {
      const all = JSON.parse(result.data);
      activities = all.filter(a => new Date(a.timestamp).getTime() > weekAgo);
    }
  } catch {}

  // Count recent recommendations
  try {
    const dir = await hq.readDir(`projects/${slug}/recommendations`);
    if (dir.ok) {
      const weekAgoDate = new Date(weekAgo).toISOString().slice(0, 10);
      recsCount = (dir.files || []).filter(f => f >= weekAgoDate).length;
    }
  } catch {}

  // Count recent ideas
  try {
    const result = await hq.readFile(`projects/${slug}/ideas.json`);
    if (result.ok) {
      const ideas = JSON.parse(result.data);
      ideasCount = ideas.filter(i => new Date(i.createdAt).getTime() > weekAgo).length;
    }
  } catch {}

  // Most active agents
  const agentCounts = {};
  for (const a of activities) {
    agentCounts[a.agent] = (agentCounts[a.agent] || 0) + 1;
  }
  const topAgents = Object.entries(agentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  return { activities, recsCount, ideasCount, topAgents };
}

// ─── Prompt Builders ───

function buildDevActivityPrompt(style, data, projectName, featuredAgent) {
  const agentPersonality = AGENT_PERSONALITIES[featuredAgent];
  const agentName = agentPersonality?.name || 'a team member';

  const activitySummary = data.activities.map(a =>
    `- ${a.agent}: ${a.action} (${a.project})`
  ).join('\n');

  const commitSummary = data.commits.map(c =>
    `- ${c.message || c.subject || 'commit'}`
  ).join('\n');

  const styleInstruction = buildStyleInstruction(style);

  return {
    systemPrompt: `You are the Content Producer for an indie game studio called "the studio". You write engaging development updates for the studio's Discord community. You're enthusiastic, passionate about game dev, and great at making technical progress sound exciting to fans.

The game is called "${projectName}".
Your featured interview subject is ${agentName} — their personality: ${agentPersonality?.voice || 'knowledgeable team member'}.

${styleInstruction}

IMPORTANT: Write the actual post content only. No meta-commentary. No "Here's a post..." framing. Just the post itself, ready to paste into Discord.`,

    userMessage: `Write a dev activity post about what's been happening at the studio.

Recent activity:
${activitySummary || 'General development progress on multiple systems.'}

Recent commits:
${commitSummary || 'Various code improvements and bug fixes.'}

Feature ${agentName} and their perspective on the work. ${style === 'interview' ? `Write 2-3 Q&A pairs where you interview ${agentName}.` : `Weave in ${agentName}'s perspective naturally.`}`,
  };
}

function buildFeatureSpotlightPrompt(style, feature, projectName, featuredAgent, totalFeatures, completedCount) {
  const agentPersonality = AGENT_PERSONALITIES[featuredAgent];
  const agentName = agentPersonality?.name || 'a team member';

  const styleInstruction = buildStyleInstruction(style);

  return {
    systemPrompt: `You are the Content Producer for an indie game studio. You write engaging feature spotlight posts for the studio's Discord community. You're great at making game features sound exciting and giving fans insight into the development process.

The game is called "${projectName}". It has ${totalFeatures} features total, ${completedCount} complete.
Your featured interview subject is ${agentName} — their personality: ${agentPersonality?.voice || 'knowledgeable team member'}.

${styleInstruction}

IMPORTANT: Write the actual post content only. No meta-commentary. Just the post itself, ready to paste into Discord.`,

    userMessage: `Write a feature spotlight post about this game feature:

Feature: ${feature.name}
Category: ${feature.category}
Description: ${feature.description}
Status: ${feature.status}
Code files: ${(feature.codeFootprint || []).join(', ')}

Go deep into why this feature matters for players. What makes it special? What was challenging about building it? Feature ${agentName} and their perspective. ${style === 'interview' ? `Write 2-3 Q&A pairs where you interview ${agentName} about this feature.` : `Weave in ${agentName}'s thoughts naturally.`}`,
  };
}

function buildWeeklyRecapPrompt(style, data, projectName) {
  const activityHighlights = data.activities.slice(0, 8).map(a =>
    `- ${a.agent}: ${a.action}`
  ).join('\n');

  const topAgentSummary = (data.topAgents || []).map(a =>
    `${a.name} (${a.count} actions)`
  ).join(', ');

  return {
    systemPrompt: `You are the Content Producer for an indie game studio. You write weekly recap posts for the studio's Discord community. These are warm, celebratory summaries of what the team accomplished. Always written as a Studio Blog Post.

The game is called "${projectName}".

Write a Studio Blog Post (400-600 words). Structure: catchy opening about the week, section for key accomplishments, shout-outs to active team members, look-ahead to next week. Make it feel like a real indie dev weekly digest.

IMPORTANT: Write the actual post content only. No meta-commentary. Just the post itself.`,

    userMessage: `Write this week's recap.

Key activity this week:
${activityHighlights || 'The team made steady progress across multiple systems.'}

Stats: ${data.recsCount} new recommendations, ${data.ideasCount} ideas generated.
Most active team members: ${topAgentSummary || 'Everyone contributed this week.'}

Make it celebratory and forward-looking.`,
  };
}

// ─── Campaign Execution ───

/**
 * Fire a campaign — generate content and optionally post to Discord.
 * Returns { ok, content, featuredAgent, style, featureId? }
 */
export async function fireCampaign(campaignId, slug, projectName, options = {}) {
  const { autoPost = true, styleOverride = null, coveredFeatureIds = [] } = options;

  const groq = window.electronAPI?.groq;
  const discord = window.electronAPI?.discord;
  if (!groq) return { ok: false, error: 'Groq not available' };

  let prompt;
  let featuredAgent;
  let style;
  let featureId = null;

  // Determine style
  const rotation = options.styleRotation || 0;
  style = styleOverride || getPostStyle(rotation);

  switch (campaignId) {
    case 'dev-activity': {
      const data = await gatherDevActivityData(slug);

      // Pick featured agent — weight toward agents with recent activity
      const activeAgents = [...new Set(data.activities.map(a => {
        const found = Object.entries(AGENT_PERSONALITIES).find(([, v]) => v.name === a.agent);
        return found?.[0];
      }).filter(Boolean))];

      featuredAgent = activeAgents.length > 0
        ? activeAgents[Math.floor(Math.random() * activeAgents.length)]
        : pickRandomAgent(['content-producer']); // exclude the host

      prompt = buildDevActivityPrompt(style, data, projectName, featuredAgent);
      break;
    }

    case 'feature-spotlight': {
      const data = await gatherFeatureData(slug, coveredFeatureIds);

      if (!data.feature) {
        return { ok: false, error: 'No features available to spotlight' };
      }

      featureId = data.feature.id;

      // Pick agent based on feature category
      featuredAgent = CATEGORY_AGENT_MAP[data.feature.category] || pickRandomAgent(['content-producer']);

      prompt = buildFeatureSpotlightPrompt(
        style, data.feature, projectName, featuredAgent,
        data.totalFeatures, data.completedCount
      );
      break;
    }

    case 'weekly-recap': {
      const data = await gatherWeeklyData(slug);
      featuredAgent = 'studio-producer'; // natural fit for recaps
      style = 'blog'; // always blog for weekly recaps

      prompt = buildWeeklyRecapPrompt(style, data, projectName);
      break;
    }

    default:
      return { ok: false, error: `Unknown campaign: ${campaignId}` };
  }

  // Generate via Groq
  try {
    const result = await groq.generate({
      systemPrompt: prompt.systemPrompt,
      userMessage: prompt.userMessage,
      maxTokens: 800,
    });

    if (!result.ok) {
      return { ok: false, error: `Groq failed: ${result.error}` };
    }

    const content = result.content;

    // Post to Discord if auto-post enabled
    let discordPosted = false;
    let discordError = null;
    if (autoPost && discord) {
      try {
        const status = await discord.getStatus();
        if (status.connected) {
          await discord.postAgentMessage('content-producer', content);
          discordPosted = true;
        } else {
          discordError = 'Discord bot not connected';
        }
      } catch (err) {
        discordError = err.message || 'Discord post failed';
        console.warn('[SocialCampaign] Discord post failed:', err);
      }
    }

    return {
      ok: true,
      content,
      featuredAgent,
      featuredAgentName: AGENT_PERSONALITIES[featuredAgent]?.name || featuredAgent,
      style,
      featureId,
      campaignId,
      discordPosted,
      discordError,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function pickRandomAgent(exclude = []) {
  const agents = Object.keys(AGENT_PERSONALITIES).filter(id => !exclude.includes(id));
  return agents[Math.floor(Math.random() * agents.length)];
}

// ─── Default Campaign Configs ───

export function getDefaultCampaigns() {
  return [
    {
      id: 'dev-activity',
      name: 'Dev Activity',
      description: 'What the team has been working on',
      icon: '🎬',
      enabled: true,
      autoPost: true,
      cadence: 'daily',
      time: '10:00',
      dayOfWeek: null,
      styleRotation: 0,
      lastFiredAt: null,
      featuresCovered: [],
      history: [],
    },
    {
      id: 'feature-spotlight',
      name: 'Feature Spotlight',
      description: 'Deep dives into what makes the game tick',
      icon: '✦',
      enabled: true,
      autoPost: true,
      cadence: 'daily',
      time: '14:00',
      dayOfWeek: null,
      styleRotation: 0,
      lastFiredAt: null,
      featuresCovered: [],
      history: [],
    },
    {
      id: 'weekly-recap',
      name: 'Weekly Recap',
      description: 'This Week at the Studio',
      icon: '📊',
      enabled: true,
      autoPost: true,
      cadence: 'weekly',
      time: '09:00',
      dayOfWeek: 1, // Monday
      styleRotation: 0,
      lastFiredAt: null,
      featuresCovered: [],
      history: [],
    },
  ];
}

export { POST_STYLES, getPostStyle, CATEGORY_AGENT_MAP };
