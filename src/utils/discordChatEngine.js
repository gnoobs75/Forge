// Discord Chat Engine — event-driven agent message posting via Discord webhooks
// Same pipeline as councilChatEngine but output goes to Discord instead of in-app store

import { AGENT_PERSONALITIES, AGENT_ALLIANCES, EVENT_POSTER_MAP } from './agentPersonalities';

// ─── Rate Limiting (same as council engine) ───
const DEBOUNCE_MS = 30000;
const WINDOW_5MIN_MAX = 8;
const HOUR_MAX = 30;

const lastEventByType = {};
const messageTimestamps = [];

function canSendMessage(eventType) {
  const now = Date.now();
  if (lastEventByType[eventType] && now - lastEventByType[eventType] < DEBOUNCE_MS) {
    return false;
  }
  const fiveMinAgo = now - 5 * 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;
  const recentFive = messageTimestamps.filter(t => t > fiveMinAgo);
  if (recentFive.length >= WINDOW_5MIN_MAX) return false;
  const recentHour = messageTimestamps.filter(t => t > oneHourAgo);
  if (recentHour.length >= HOUR_MAX) return false;
  return true;
}

function recordMessage(eventType) {
  const now = Date.now();
  lastEventByType[eventType] = now;
  messageTimestamps.push(now);
  const oneHourAgo = now - 60 * 60 * 1000;
  while (messageTimestamps.length > 0 && messageTimestamps[0] < oneHourAgo) {
    messageTimestamps.shift();
  }
}

// ─── Agent Selection (reused from council engine) ───

function selectPosterAgent(eventType, payload, agents) {
  const mappedAgentId = EVENT_POSTER_MAP[eventType];

  if (eventType === 'rec-created' && payload.agentId) {
    return agents.find(a => a.id === payload.agentId) || agents[0];
  }
  if (eventType === 'activity-logged' && payload.agentId) {
    return agents.find(a => a.id === payload.agentId) || agents[0];
  }
  if (mappedAgentId) {
    return agents.find(a => a.id === mappedAgentId) || agents[0];
  }
  return agents[Math.floor(Math.random() * agents.length)];
}

function selectReactorAgents(posterAgentId, agents, maxReactors = 2) {
  const personality = AGENT_PERSONALITIES[posterAgentId];
  const candidates = [];

  if (personality?.roastTarget) {
    const roastAgent = agents.find(a => a.id === personality.roastTarget);
    if (roastAgent) candidates.push(roastAgent);
  }

  const allies = AGENT_ALLIANCES[posterAgentId] || [];
  for (const allyId of allies) {
    if (candidates.length >= maxReactors) break;
    if (candidates.find(c => c.id === allyId)) continue;
    const ally = agents.find(a => a.id === allyId);
    if (ally) candidates.push(ally);
  }

  if (candidates.length < maxReactors) {
    const remaining = agents.filter(
      a => a.id !== posterAgentId && !candidates.find(c => c.id === a.id)
    );
    while (candidates.length < maxReactors && remaining.length > 0) {
      const idx = Math.floor(Math.random() * remaining.length);
      candidates.push(remaining.splice(idx, 1)[0]);
    }
  }

  return candidates.slice(0, maxReactors);
}

// ─── Prompt Building (reused from council engine) ───

function buildPosterPrompt(agentId, eventType, payload) {
  const personality = AGENT_PERSONALITIES[agentId];
  if (!personality) return null;

  const contextMap = {
    'rec-created': `You just wrote a recommendation about "${payload.recTitle || 'something'}" for the ${payload.projectName || 'project'}. Comment on it casually — maybe hint at which approach you think the boss will pick, or why it matters.`,
    'rec-resolved': `The boss just resolved a recommendation "${payload.recTitle || 'something'}". React naturally — was it a smart call?`,
    'rec-dismissed': `The boss just dismissed a recommendation "${payload.recTitle || 'something'}". React to that — surprised? Agree? A little salty?`,
    'impl-started': `Someone just started an implementation session for "${payload.recTitle || 'something'}". Comment on it — excited? Concerned about the approach?`,
    'impl-finished': `An implementation session just finished ${payload.exitCode === 0 ? 'successfully' : 'with errors'}. React accordingly.`,
    'activity-logged': `You just did some work on ${payload.projectName || 'a project'}. Make a casual comment about what you've been up to.`,
    'git-change': `Fresh commits detected in ${payload.projectName || 'a repo'}. ${payload.fileCount ? payload.fileCount + ' files changed.' : ''} Comment on it.`,
    'idea-posted': `You just dropped a daily idea on the ${payload.projectName || 'project'} idea board: "${payload.ideaText || ''}". Hype it up casually.`,
    'idea-pre-gen': `You're about to drop your daily idea for ${payload.projectName || 'a project'} on the idea board. Tease it without revealing it.`,
    'boss-idea': `The boss just dropped an idea on the ${payload.projectName || 'project'} board: "${payload.ideaText || ''}". React with curiosity or excitement.`,
    'idea-analyzed': `An idea for ${payload.projectName || 'a project'} just got analyzed. ${payload.score ? `It scored ${payload.score}/10.` : ''} Comment on the results.`,
    'idea-dismissed': `Your idea "${payload.ideaText || 'something'}" for ${payload.projectName || 'a project'} was dismissed by the boss. React.`,
    'idea-promoted': `Your idea "${payload.ideaText || 'something'}" just got promoted to a full recommendation! Celebrate.`,
  };

  return {
    systemPrompt: personality.systemPrompt,
    userMessage: contextMap[eventType] || 'Make a casual comment about the latest studio activity.',
  };
}

function buildReactorPrompt(reactorAgentId, posterAgentId, posterMessage) {
  const personality = AGENT_PERSONALITIES[reactorAgentId];
  if (!personality) return null;

  const posterName = AGENT_PERSONALITIES[posterAgentId]?.name || 'Someone';
  const isRoastTarget = personality.roastTarget === posterAgentId;

  let context = `${posterName} just said in the studio chat: "${posterMessage}"\n\nReact to what they said.`;
  if (isRoastTarget) {
    context += ' Feel free to push back or roast them a little — you two have a rivalry.';
  }

  return {
    systemPrompt: personality.systemPrompt,
    userMessage: context,
  };
}

// ─── Main Engine — Discord Output ───

export async function processDiscordEvent(eventType, payload, agents) {
  if (!canSendMessage(eventType)) return;

  const groq = window.electronAPI?.groq;
  const discord = window.electronAPI?.discord;
  if (!groq || !discord) return;

  // Check Discord connection
  const status = await discord.getStatus();
  if (!status.connected) return;

  // Select poster agent
  const posterAgent = selectPosterAgent(eventType, payload, agents);
  const posterPrompt = buildPosterPrompt(posterAgent.id, eventType, payload);
  if (!posterPrompt) return;

  try {
    // Generate poster message via Groq
    const posterResult = await groq.generate({
      systemPrompt: posterPrompt.systemPrompt,
      userMessage: posterPrompt.userMessage,
      maxTokens: 100,
    });

    if (!posterResult.ok) {
      console.warn('[DiscordEngine] Groq poster call failed:', posterResult.error);
      return;
    }

    // Post to Discord via webhook
    await discord.postAgentMessage(posterAgent.id, posterResult.content);
    recordMessage(eventType);

    // Select reactor agents with staggered delays
    const maxReactors = parseInt(localStorage.getItem('forge-max-reactors') || '2', 10);
    const reactors = selectReactorAgents(posterAgent.id, agents, maxReactors);

    for (let i = 0; i < reactors.length; i++) {
      if (!canSendMessage(`${eventType}-reaction`)) break;

      const delay = 2000 + Math.random() * 3000 + i * 2000;
      setTimeout(async () => {
        const reactor = reactors[i];
        const reactorPrompt = buildReactorPrompt(reactor.id, posterAgent.id, posterResult.content);
        if (!reactorPrompt) return;

        try {
          const reactorResult = await groq.generate({
            systemPrompt: reactorPrompt.systemPrompt,
            userMessage: reactorPrompt.userMessage,
            maxTokens: 80,
          });

          if (reactorResult.ok) {
            await discord.postAgentMessage(reactor.id, reactorResult.content);
            recordMessage(`${eventType}-reaction`);
          }
        } catch (err) {
          console.warn('[DiscordEngine] Reactor call failed:', err);
        }
      }, delay);
    }
  } catch (err) {
    console.warn('[DiscordEngine] Poster call failed:', err);
  }
}

export { selectPosterAgent, selectReactorAgents, buildPosterPrompt, canSendMessage };
