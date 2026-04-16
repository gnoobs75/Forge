// Discord Bot Manager — discord.js client lifecycle, webhooks, messaging
// Runs in Electron main process (Node.js)

const { Client, GatewayIntentBits, WebhookClient } = require('discord.js');

let client = null;
let channel = null;
let webhook = null;
let messageCallback = null;

// Agent metadata for webhook overrides
const AGENT_META = {
  'market-analyst':    { name: 'Market Analyst',          color: '#3B82F6', initial: 'M' },
  'store-optimizer':   { name: 'Store Optimizer',         color: '#22C55E', initial: 'S' },
  'growth-strategist': { name: 'Growth Strategist',       color: '#F97316', initial: 'G' },
  'brand-director':    { name: 'Brand Director',          color: '#8B5CF6', initial: 'B' },
  'content-producer':  { name: 'Content Producer',        color: '#EC4899', initial: 'C' },
  'community-manager': { name: 'Community Manager',       color: '#06B6D4', initial: 'CM' },
  'qa-advisor':        { name: 'QA Advisor',              color: '#EF4444', initial: 'Q' },
  'studio-producer':   { name: 'Studio Producer',         color: '#EAB308', initial: 'SP' },
  'monetization':      { name: 'Monetization Strategist', color: '#10B981', initial: 'Mo' },
  'player-psych':      { name: 'Player Psychologist',     color: '#7C3AED', initial: 'P' },
  'art-director':      { name: 'Art Director',            color: '#F59E0B', initial: 'A' },
  'creative-thinker':  { name: 'Creative Thinker',        color: '#FF6B6B', initial: 'CT' },
  'tech-architect':    { name: 'Tech Architect',          color: '#0EA5E9', initial: 'T' },
};

// Generate a simple avatar URL using UI Avatars service
function getAvatarUrl(agentId) {
  const meta = AGENT_META[agentId];
  if (!meta) return null;
  const bg = meta.color.replace('#', '');
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(meta.initial)}&background=${bg}&color=fff&size=128&bold=true`;
}

/**
 * Connect the discord.js client to the gateway.
 */
async function connect(token, guildId, channelId) {
  if (client) {
    await disconnect();
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Discord connection timed out (30s)'));
      client.destroy();
      client = null;
    }, 30000);

    client.once('ready', async () => {
      clearTimeout(timeout);
      console.log(`[Discord] Logged in as ${client.user.tag}`);

      try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          throw new Error(`Guild ${guildId} not found. Is the bot invited?`);
        }

        channel = guild.channels.cache.get(channelId);
        if (!channel) {
          throw new Error(`Channel ${channelId} not found in guild ${guild.name}`);
        }

        // Listen for new messages
        client.on('messageCreate', (msg) => {
          if (msg.channelId !== channelId) return;
          const normalized = normalizeMessage(msg);
          if (messageCallback) {
            messageCallback(normalized);
          }
        });

        // Auto-setup webhook so agent posting works immediately
        try {
          await setupWebhooks();
          console.log('[Discord] Webhook auto-configured on connect');
        } catch (whErr) {
          console.warn('[Discord] Webhook auto-setup failed (can retry manually):', whErr.message);
        }

        resolve({
          ok: true,
          botUser: { id: client.user.id, tag: client.user.tag, avatar: client.user.displayAvatarURL() },
          guild: { id: guild.id, name: guild.name },
          channel: { id: channel.id, name: channel.name },
          webhookReady: !!webhook,
        });
      } catch (err) {
        reject(err);
      }
    });

    client.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    client.login(token).catch((err) => {
      clearTimeout(timeout);
      if (err.code === 'DisallowedIntents' || (err.message && err.message.includes('disallowed intents'))) {
        reject(new Error(
          'MESSAGE_CONTENT privileged intent is not enabled.\n\n' +
          'To fix this:\n' +
          '1. Go to https://discord.com/developers/applications\n' +
          '2. Select your bot application\n' +
          '3. Go to Bot → Privileged Gateway Intents\n' +
          '4. Enable "MESSAGE CONTENT INTENT"\n' +
          '5. Click Save Changes\n' +
          '6. Try connecting again'
        ));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Disconnect and clean up.
 */
function disconnect() {
  if (webhook) {
    webhook = null;
  }
  if (client) {
    client.removeAllListeners();
    client.destroy();
    client = null;
  }
  channel = null;
  console.log('[Discord] Disconnected');
}

/**
 * Get current connection status.
 */
function getStatus() {
  if (!client || !client.isReady()) {
    return { connected: false, guild: null, channel: null, botUser: null };
  }
  const guild = channel?.guild;
  return {
    connected: true,
    webhookReady: !!webhook,
    guild: guild ? { id: guild.id, name: guild.name } : null,
    channel: channel ? { id: channel.id, name: channel.name } : null,
    botUser: { id: client.user.id, tag: client.user.tag },
  };
}

/**
 * Fetch last N messages from the channel via REST.
 */
async function getMessages(limit = 50) {
  if (!channel) throw new Error('Not connected to a channel');
  const msgs = await channel.messages.fetch({ limit });
  return Array.from(msgs.values())
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(normalizeMessage);
}

/**
 * Boss sends a message via the bot account.
 */
async function sendMessage(content) {
  if (!channel) throw new Error('Not connected to a channel');
  const msg = await channel.send(content);
  return normalizeMessage(msg);
}

/**
 * Post a message as an agent via webhook with name/avatar override.
 */
async function postAgentMessage(agentId, content) {
  if (!webhook) throw new Error('Webhook not set up. Run setupWebhooks() first.');
  const meta = AGENT_META[agentId] || { name: agentId, color: '#666' };
  const avatarURL = getAvatarUrl(agentId);

  await webhook.send({
    content,
    username: meta.name,
    avatarURL,
  });
}

/**
 * Create or find a webhook on the channel for agent messages.
 * Uses a single webhook with per-message username/avatar overrides.
 */
async function setupWebhooks() {
  if (!channel) throw new Error('Not connected to a channel');

  try {
    // Check for existing Forge webhook — requires Manage Webhooks permission
    const webhooks = await channel.fetchWebhooks();
    let existing = webhooks.find(w => w.name === 'Forge');

    if (!existing) {
      existing = await channel.createWebhook({
        name: 'Forge',
        reason: 'Forge agent messaging',
      });
      console.log('[Discord] Created webhook:', existing.id);
    } else {
      console.log('[Discord] Found existing webhook:', existing.id);
    }

    webhook = new WebhookClient({ id: existing.id, token: existing.token });

    return {
      ok: true,
      webhookId: existing.id,
      agentCount: Object.keys(AGENT_META).length,
    };
  } catch (err) {
    if (err.code === 50013 || (err.message && err.message.includes('Missing Permissions'))) {
      throw new Error(
        'Bot lacks Manage Webhooks permission.\n\n' +
        'Fix: Go to Discord Server Settings → Roles → your bot role → enable "Manage Webhooks"\n' +
        'Or: Re-invite the bot with the Manage Webhooks permission checked.'
      );
    }
    throw err;
  }
}

/**
 * Register a callback for incoming messages (real-time via gateway).
 */
function onMessage(callback) {
  messageCallback = callback;
}

/**
 * Normalize a discord.js Message to a plain object for IPC.
 */
function normalizeMessage(msg) {
  return {
    id: msg.id,
    content: msg.content,
    author: {
      id: msg.author.id,
      username: msg.author.username,
      displayName: msg.author.displayName || msg.author.username,
      avatar: msg.author.displayAvatarURL({ size: 64 }),
      bot: msg.author.bot,
    },
    timestamp: msg.createdAt.toISOString(),
    editedTimestamp: msg.editedAt ? msg.editedAt.toISOString() : null,
    webhookId: msg.webhookId || null,
    embeds: msg.embeds.map(e => ({
      title: e.title,
      description: e.description,
      url: e.url,
      color: e.color,
      image: e.image?.url || null,
      thumbnail: e.thumbnail?.url || null,
    })),
    attachments: Array.from(msg.attachments.values()).map(a => ({
      name: a.name,
      url: a.url,
      contentType: a.contentType,
      size: a.size,
    })),
  };
}

module.exports = {
  connect,
  disconnect,
  getStatus,
  getMessages,
  sendMessage,
  postAgentMessage,
  setupWebhooks,
  onMessage,
  AGENT_META,
};
