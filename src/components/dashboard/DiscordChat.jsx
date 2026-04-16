import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import DiscordFeed from './discord/DiscordFeed';
import DiscordHeader from './discord/DiscordHeader';
import DiscordInput from './discord/DiscordInput';

export default function DiscordChat() {
  const discordStatus = useStore(s => s.discordStatus);
  const setDiscordStatus = useStore(s => s.setDiscordStatus);
  const discordMessages = useStore(s => s.discordMessages);
  const setDiscordMessages = useStore(s => s.setDiscordMessages);
  const addDiscordMessage = useStore(s => s.addDiscordMessage);
  const [loading, setLoading] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  // Check Discord status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  // Listen for real-time messages
  useEffect(() => {
    const discord = window.electronAPI?.discord;
    if (!discord) return;

    const cleanup = discord.onMessageReceived((msg) => {
      addDiscordMessage(msg);
    });

    return cleanup;
  }, []);

  // Load messages when connected
  useEffect(() => {
    if (discordStatus.connected) {
      loadMessages();
    }
  }, [discordStatus.connected]);

  // Event watchers now live in DiscordEventWatcher (always mounted)

  async function checkStatus() {
    const discord = window.electronAPI?.discord;
    if (!discord) return;
    try {
      const status = await discord.getStatus();
      setDiscordStatus(status);
    } catch {}
  }

  async function loadMessages() {
    const discord = window.electronAPI?.discord;
    if (!discord) return;
    setLoading(true);
    try {
      const result = await discord.getMessages(50);
      if (result.ok) {
        setDiscordMessages(result.messages);
      }
    } catch (err) {
      console.warn('[DiscordChat] Load messages failed:', err);
    } finally {
      setLoading(false);
    }
  }

  // ─── Not connected: show setup prompt ───
  if (!discordStatus.connected && !showSetup) {
    return (
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#1E1F22', backgroundColor: '#313338', height: '600px' }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-4 max-w-md px-6">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: '#5865F220' }}>
              <span className="text-3xl" style={{ color: '#5865F2' }}>{'\u229E'}</span>
            </div>
            <h3 className="text-lg font-medium text-[#F2F3F5]">Connect to Discord</h3>
            <p className="text-sm text-[#B5BAC1] leading-relaxed">
              Agent messages will be posted to a Discord channel via webhooks. Set up a bot to enable two-way chat.
            </p>
            <div className="space-y-2 text-left text-xs text-[#949BA4] bg-[#2B2D31] rounded-lg p-4 border border-[#1E1F22]">
              <p className="font-medium text-[#B5BAC1]">Quick Setup:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Create a Discord Application at discord.com/developers</li>
                <li>Create a Bot, enable MESSAGE_CONTENT intent</li>
                <li>Generate bot token</li>
                <li>Invite bot to your server (Send Messages, Manage Webhooks, Read History)</li>
                <li>Enter bot token, guild ID, and channel ID below</li>
              </ol>
            </div>
            <button
              onClick={() => setShowSetup(true)}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: '#5865F2' }}
            >
              Configure Discord Bot
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden flex flex-col" style={{ borderColor: '#1E1F22', backgroundColor: '#313338', height: '600px' }}>
      <DiscordHeader onOpenSettings={() => setShowSetup(true)} />
      <DiscordFeed messages={discordMessages} loading={loading} />
      <DiscordInput connected={discordStatus.connected} channelName={discordStatus.channel?.name} />

      {/* Settings overlay */}
      {showSetup && (
        <DiscordSetupOverlay
          onClose={() => setShowSetup(false)}
          onConnected={() => { checkStatus(); setShowSetup(false); }}
        />
      )}
    </div>
  );
}

// ─── Setup/Settings Overlay ───

function DiscordSetupOverlay({ onClose, onConnected }) {
  const [token, setToken] = useState('');
  const [guildId, setGuildId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [status, setStatus] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState(null);

  // Check initial status and load saved credentials
  useEffect(() => {
    checkCurrent();
    loadSavedCredentials();
  }, []);

  async function checkCurrent() {
    try {
      const s = await window.electronAPI?.discord?.getStatus();
      setStatus(s);
    } catch {}
  }

  async function loadSavedCredentials() {
    try {
      const creds = await window.electronAPI?.secrets?.get('discord-bot');
      if (creds) {
        if (creds.token) setToken(creds.token);
        if (creds.guildId) setGuildId(creds.guildId);
        if (creds.channelId) setChannelId(creds.channelId);
      }
    } catch {}
  }

  async function handleConnect() {
    if (!token || !guildId || !channelId) return;
    setConnecting(true);
    setStatus(null);

    try {
      // Save credentials
      await window.electronAPI?.secrets?.set('discord-bot', { token, guildId, channelId });

      const result = await window.electronAPI?.discord?.connect(token, guildId, channelId);
      if (result?.ok) {
        setStatus({ connected: true, ...result });
        onConnected();
      } else {
        setStatus({ connected: false, error: result?.error || 'Connection failed' });
      }
    } catch (err) {
      setStatus({ connected: false, error: err.message });
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await window.electronAPI?.discord?.disconnect();
      setStatus({ connected: false });
    } catch {}
  }

  async function handleSetupWebhooks() {
    setWebhookStatus('setting-up');
    try {
      const result = await window.electronAPI?.discord?.setupWebhooks();
      if (result?.ok) {
        setWebhookStatus(`Webhook ready for ${result.agentCount} agents`);
      } else {
        setWebhookStatus(`Error: ${result?.error}`);
      }
    } catch (err) {
      setWebhookStatus(`Error: ${err.message}`);
    }
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-xl shadow-2xl border overflow-y-auto max-h-[90%]"
           style={{ backgroundColor: '#2B2D31', borderColor: '#1E1F22' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#1E1F22' }}>
          <div className="flex items-center gap-2">
            <span style={{ color: '#5865F2' }} className="text-lg">{'\u229E'}</span>
            <h3 className="text-sm font-medium text-[#F2F3F5]">Discord Bot Setup</h3>
          </div>
          <button onClick={onClose} className="text-[#B5BAC1] hover:text-[#F2F3F5] transition-colors">&times;</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Status */}
          {status?.connected && (
            <div className="p-3 rounded-lg border" style={{ backgroundColor: '#23A55A10', borderColor: '#23A55A30' }}>
              <div className="flex items-center gap-2 text-sm" style={{ color: '#23A55A' }}>
                <span className="w-2 h-2 rounded-full bg-current" />
                Connected as {status.botUser?.tag || 'Unknown'}
              </div>
              <div className="text-xs text-[#949BA4] mt-1">
                {status.guild?.name} / #{status.channel?.name}
              </div>
            </div>
          )}

          {status?.error && (
            <div className="p-3 rounded-lg border text-xs" style={{ backgroundColor: '#F2383810', borderColor: '#F2383830', color: '#F23838' }}>
              {status.error}
            </div>
          )}

          {/* Credentials form */}
          {!status?.connected && (
            <>
              <div>
                <label className="text-xs text-[#B5BAC1] block mb-1">Bot Token</label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="MTIzNDU2Nzg5..."
                  className="w-full px-3 py-2 rounded-lg text-sm text-[#DBDEE1] focus:outline-none"
                  style={{ backgroundColor: '#1E1F22', border: '1px solid #3F4147' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#B5BAC1] block mb-1">Guild (Server) ID</label>
                  <input
                    type="text"
                    value={guildId}
                    onChange={(e) => setGuildId(e.target.value)}
                    placeholder="1234567890..."
                    className="w-full px-3 py-2 rounded-lg text-sm text-[#DBDEE1] focus:outline-none"
                    style={{ backgroundColor: '#1E1F22', border: '1px solid #3F4147' }}
                  />
                </div>
                <div>
                  <label className="text-xs text-[#B5BAC1] block mb-1">Channel ID</label>
                  <input
                    type="text"
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    placeholder="1234567890..."
                    className="w-full px-3 py-2 rounded-lg text-sm text-[#DBDEE1] focus:outline-none"
                    style={{ backgroundColor: '#1E1F22', border: '1px solid #3F4147' }}
                  />
                </div>
              </div>
              <button
                onClick={handleConnect}
                disabled={!token || !guildId || !channelId || connecting}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
                style={{ backgroundColor: '#5865F2' }}
              >
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
            </>
          )}

          {/* Connected actions */}
          {status?.connected && (
            <div className="space-y-3">
              <button
                onClick={handleSetupWebhooks}
                className="w-full py-2 rounded-lg text-xs font-medium transition-colors"
                style={{ backgroundColor: '#5865F220', color: '#5865F2', border: '1px solid #5865F230' }}
              >
                Setup Agent Webhooks
              </button>
              {webhookStatus && (
                <div className="text-xs text-[#949BA4] text-center">{webhookStatus}</div>
              )}
              <button
                onClick={handleDisconnect}
                className="w-full py-2 rounded-lg text-xs font-medium transition-colors"
                style={{ backgroundColor: '#F2383810', color: '#F23838', border: '1px solid #F2383830' }}
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
