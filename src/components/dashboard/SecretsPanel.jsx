import React, { useState, useEffect } from 'react';

const PLATFORM_CONFIG = {
  twitter: {
    name: 'Twitter / X',
    icon: '\uD835\uDD4F',
    color: '#1DA1F2',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
      { key: 'apiSecret', label: 'API Secret', type: 'password' },
      { key: 'bearerToken', label: 'Bearer Token', type: 'password' },
    ],
  },
  discord: {
    name: 'Discord (Webhook)',
    icon: '\u229E',
    color: '#5865F2',
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', type: 'url' },
    ],
  },
  'discord-bot': {
    name: 'Discord Bot (Team Chat)',
    icon: '\u229E',
    color: '#5865F2',
    fields: [
      { key: 'token', label: 'Bot Token', type: 'password' },
      { key: 'guildId', label: 'Guild (Server) ID', type: 'text' },
      { key: 'channelId', label: 'Channel ID', type: 'text' },
    ],
  },
  reddit: {
    name: 'Reddit',
    icon: '\u2295',
    color: '#FF4500',
    fields: [
      { key: 'clientId', label: 'Client ID', type: 'password' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password' },
      { key: 'refreshToken', label: 'Refresh Token', type: 'password' },
    ],
  },
  instagram: {
    name: 'Instagram',
    icon: '\u25CE',
    color: '#E4405F',
    fields: [
      { key: 'accessToken', label: 'Access Token', type: 'password' },
    ],
  },
  resend: {
    name: 'Resend (Email)',
    icon: '\u2709',
    color: '#8B5CF6',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
    ],
  },
  groq: {
    name: 'Groq (Team Chat)',
    icon: '\u26A1',
    color: '#F55036',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
    ],
  },
};

export default function SecretsPanel({ onClose }) {
  const [status, setStatus] = useState({});
  const [editingPlatform, setEditingPlatform] = useState(null);
  const [formData, setFormData] = useState({});
  const [message, setMessage] = useState(null);
  const [testing, setTesting] = useState(null);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    if (!window.electronAPI?.secrets) {
      // Browser fallback
      setStatus({
        twitter: { connected: false },
        discord: { connected: false },
        reddit: { connected: false },
        instagram: { connected: false },
        resend: { connected: false },
      });
      return;
    }
    try {
      const s = await window.electronAPI.secrets.getStatus();
      setStatus(s);
    } catch (err) {
      console.error('[SecretsPanel] Failed to load status:', err);
    }
  }

  async function handleConnect(platformId) {
    if (!window.electronAPI?.secrets) {
      setMessage({ type: 'warn', text: 'Secrets management requires the Electron app' });
      return;
    }
    try {
      await window.electronAPI.secrets.set(platformId, formData);
      setMessage({ type: 'success', text: `${PLATFORM_CONFIG[platformId].name} connected successfully` });
      setEditingPlatform(null);
      setFormData({});
      loadStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  async function handleDisconnect(platformId) {
    if (!window.electronAPI?.secrets) return;
    try {
      await window.electronAPI.secrets.remove(platformId);
      setMessage({ type: 'success', text: `${PLATFORM_CONFIG[platformId].name} disconnected` });
      loadStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  function startEditing(platformId) {
    setEditingPlatform(platformId);
    setFormData({});
    setMessage(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-forge-surface rounded-xl border border-forge-border shadow-2xl max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-forge-border">
          <div className="flex items-center gap-2">
            <span className="text-lg">&#x1F512;</span>
            <h2 className="text-sm font-mono font-bold text-forge-text-primary">API Keys & Secrets</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg border border-forge-border text-forge-text-muted hover:text-forge-text-primary hover:border-forge-text-muted transition-colors flex items-center justify-center text-xs"
          >
            &#x2715;
          </button>
        </div>

        {/* Security Notice */}
        <div className="mx-4 mt-4 p-3 rounded-lg bg-green-400/5 border border-green-400/20">
          <div className="flex items-start gap-2">
            <span className="text-green-400 text-sm">&#x1F6E1;</span>
            <div>
              <p className="text-xs text-green-400 font-medium">Encrypted & Local Only</p>
              <p className="text-[10px] text-forge-text-muted mt-0.5">
                Credentials are encrypted with your OS keychain and stored locally. Never shared with AI agents, never in git.
              </p>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mx-4 mt-3 p-2 rounded-lg text-xs ${
            message.type === 'success' ? 'bg-green-400/10 text-green-400 border border-green-400/20' :
            message.type === 'error' ? 'bg-red-400/10 text-red-400 border border-red-400/20' :
            'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20'
          }`}>
            {message.text}
          </div>
        )}

        {/* Platform Cards */}
        <div className="p-4 space-y-3">
          {Object.entries(PLATFORM_CONFIG).map(([id, config]) => {
            const platStatus = status[id];
            const connected = platStatus?.connected;
            const isEditing = editingPlatform === id;

            return (
              <div key={id} className="rounded-lg border border-forge-border bg-forge-bg/50 overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg" style={{ color: config.color }}>{config.icon}</span>
                    <div>
                      <span className="text-sm font-medium text-forge-text-primary">{config.name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: connected ? '#22C55E' : '#64748B' }}
                        />
                        <span className="text-[10px] text-forge-text-muted">
                          {connected ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {connected ? (
                      <button
                        onClick={() => handleDisconnect(id)}
                        className="px-3 py-1.5 text-[10px] font-medium text-red-400 border border-red-400/20 rounded-lg hover:bg-red-400/10 transition-colors"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => startEditing(id)}
                        className="px-3 py-1.5 text-[10px] font-medium rounded-lg border transition-colors"
                        style={{
                          color: config.color,
                          borderColor: `${config.color}30`,
                          backgroundColor: isEditing ? `${config.color}10` : 'transparent',
                        }}
                      >
                        {isEditing ? 'Cancel' : 'Connect'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Credential Form */}
                {isEditing && (
                  <div className="px-3 pb-3 space-y-2 border-t border-forge-border/50 pt-3">
                    {config.fields.map(field => (
                      <div key={field.key}>
                        <label className="text-[10px] text-forge-text-muted block mb-1">{field.label}</label>
                        <input
                          type={field.type}
                          value={formData[field.key] || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="w-full px-3 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text-primary focus:outline-none focus:border-forge-accent/50"
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                          autoComplete="off"
                        />
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleConnect(id)}
                        disabled={config.fields.some(f => !formData[f.key])}
                        className="px-4 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-30"
                        style={{
                          backgroundColor: `${config.color}20`,
                          color: config.color,
                          border: `1px solid ${config.color}30`,
                        }}
                      >
                        Save & Connect
                      </button>
                      <button
                        onClick={() => { setEditingPlatform(null); setFormData({}); }}
                        className="px-4 py-1.5 text-xs text-forge-text-muted hover:text-forge-text-secondary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
