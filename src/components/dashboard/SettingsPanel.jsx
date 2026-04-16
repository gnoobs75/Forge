import React, { useState, useEffect } from 'react';
import {
  SOUND_EVENTS,
  getSoundConfig,
  setSoundMapping,
  getMasterVolume,
  setMasterVolume,
  previewSound,
} from '../../utils/sounds';
import SecretsPanel from './SecretsPanel';
import FridaySettings from './friday/FridaySettings';
import { useStore } from '../../store/useStore';
import { RECOMMENDED_BRAINS, BRAIN_PROVIDERS } from '../../utils/brainConfig';
import { playSound } from '../../utils/sounds';

const SOUND_DESCRIPTIONS = {
  spawn: 'New session / agent spawned',
  complete: 'Task completed successfully',
  failed: 'Task or build failed',
  resolve: 'Recommendation resolved',
  dismiss: 'Recommendation dismissed',
  click: 'Button click / UI interaction',
  copy: 'Text copied to clipboard',
  tab: 'Tab switch',
  alert: 'Attention needed',
  welcome: 'App startup',
  brave: 'Achievement / great work',
  shotfood: 'Humorous warning',
  ow: 'Minor error',
  death: 'Critical failure',
  lifeforce: 'Resource running low',
  reminder: 'Scheduled reminder',
  'chat-message': 'Team Chat message (ICQ uh-oh)',
  'idea-new': 'New idea on Idea Board',
  'idea-analyzed': 'Idea analysis complete',
};

const DENSITY_KEY = 'forge-dashboard-density';
const ANIMATION_KEY = 'forge-animation-speed';
const TERMINAL_FONT_KEY = 'forge-terminal-font-size';

function loadSetting(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? v : fallback;
  } catch { return fallback; }
}

export default function SettingsPanel({ onClose }) {
  const [soundConfig, setSoundConfig] = useState(getSoundConfig);
  const [volume, setVolume] = useState(getMasterVolume);
  const [density, setDensity] = useState(() => loadSetting(DENSITY_KEY, 'comfortable'));
  const [animSpeed, setAnimSpeed] = useState(() => loadSetting(ANIMATION_KEY, 'normal'));
  const [termFontSize, setTermFontSize] = useState(() => loadSetting(TERMINAL_FONT_KEY, '13'));
  const [showSecrets, setShowSecrets] = useState(false);

  const handleVolumeChange = (val) => {
    const v = parseFloat(val);
    setVolume(v);
    setMasterVolume(v);
  };

  const handleFileSelect = (event, soundEvent) => {
    const file = event.target.files?.[0];
    if (!file) return;
    // Use the relative path within assets/sounds/ for portability
    const filePath = `/assets/sounds/${file.name}`;
    setSoundMapping(soundEvent, filePath);
    setSoundConfig({ ...getSoundConfig() });
  };

  const handleReset = (soundEvent) => {
    setSoundMapping(soundEvent, null);
    setSoundConfig({ ...getSoundConfig() });
  };

  const handleDensity = (val) => {
    setDensity(val);
    localStorage.setItem(DENSITY_KEY, val);
  };

  const handleAnimSpeed = (val) => {
    setAnimSpeed(val);
    localStorage.setItem(ANIMATION_KEY, val);
  };

  const handleTermFontSize = (val) => {
    setTermFontSize(val);
    localStorage.setItem(TERMINAL_FONT_KEY, val);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Slide-out panel */}
      <div className="fixed right-0 top-0 bottom-0 w-[480px] bg-forge-surface border-l border-forge-border z-50 shadow-2xl animate-slide-left overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-forge-surface border-b border-forge-border px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-forge-bg border border-forge-border">
                {'\u2699'}
              </div>
              <div>
                <h2 className="font-mono font-bold text-forge-text-primary">Settings</h2>
                <div className="text-xs text-forge-text-secondary">Dashboard preferences & sound mapping</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-forge-text-muted hover:text-forge-text-secondary transition-colors text-lg"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* ─── Master Volume ─── */}
          <Section title="Master Volume">
            <div className="flex items-center gap-4">
              <span className="text-xs text-forge-text-muted w-8">{Math.round(volume * 100)}%</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => handleVolumeChange(e.target.value)}
                className="flex-1 h-1.5 bg-forge-bg rounded-full appearance-none cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                           [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-forge-accent
                           [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md"
              />
              <button
                onClick={() => handleVolumeChange(volume > 0 ? 0 : 1)}
                className="text-xs text-forge-text-muted hover:text-forge-text-secondary transition-colors"
              >
                {volume > 0 ? '\u{1F50A}' : '\u{1F507}'}
              </button>
            </div>
          </Section>

          {/* ─── Sound Mapping ─── */}
          <Section title="Sound Mapping">
            <p className="text-[11px] text-forge-text-muted mb-3 leading-relaxed">
              Map sound events to custom MP3/OGG files. Drop audio files in{' '}
              <code className="text-forge-accent-blue">public/assets/sounds/</code> then select them below.
            </p>
            <div className="space-y-1.5">
              {SOUND_EVENTS.map((event) => (
                <SoundRow
                  key={event}
                  event={event}
                  description={SOUND_DESCRIPTIONS[event] || event}
                  customFile={soundConfig[event] || null}
                  onFileSelect={(e) => handleFileSelect(e, event)}
                  onReset={() => handleReset(event)}
                  onPreview={() => previewSound(event)}
                />
              ))}
            </div>
          </Section>

          {/* ─── Display Settings ─── */}
          <Section title="Display">
            <div className="space-y-4">
              {/* Density */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-forge-text-primary">Dashboard Density</div>
                  <div className="text-[10px] text-forge-text-muted">Compact shows more data per screen</div>
                </div>
                <div className="flex items-center gap-1 bg-forge-bg rounded-lg p-0.5 border border-forge-border">
                  {['compact', 'comfortable'].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleDensity(opt)}
                      className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                        density === opt
                          ? 'bg-forge-accent/20 text-forge-accent'
                          : 'text-forge-text-muted hover:text-forge-text-secondary'
                      }`}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Animation Speed */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-forge-text-primary">Animation Speed</div>
                  <div className="text-[10px] text-forge-text-muted">Reduce motion for less distraction</div>
                </div>
                <div className="flex items-center gap-1 bg-forge-bg rounded-lg p-0.5 border border-forge-border">
                  {['normal', 'reduced'].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleAnimSpeed(opt)}
                      className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                        animSpeed === opt
                          ? 'bg-forge-accent/20 text-forge-accent'
                          : 'text-forge-text-muted hover:text-forge-text-secondary'
                      }`}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Terminal Font Size */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-forge-text-primary">Terminal Font Size</div>
                  <div className="text-[10px] text-forge-text-muted">Adjust terminal text size (px)</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTermFontSize(String(Math.max(10, parseInt(termFontSize) - 1)))}
                    className="w-6 h-6 rounded bg-forge-bg border border-forge-border text-xs text-forge-text-muted
                               hover:text-forge-text-secondary hover:border-forge-accent/30 transition-colors flex items-center justify-center"
                  >
                    -
                  </button>
                  <span className="text-xs font-mono text-forge-text-primary w-6 text-center">{termFontSize}</span>
                  <button
                    onClick={() => handleTermFontSize(String(Math.min(24, parseInt(termFontSize) + 1)))}
                    className="w-6 h-6 rounded bg-forge-bg border border-forge-border text-xs text-forge-text-muted
                               hover:text-forge-text-secondary hover:border-forge-accent/30 transition-colors flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </Section>

          {/* ─── Discord Chat ─── */}
          <Section title="Discord Chat">
            <div className="space-y-4">
              <DiscordStatusWidget />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-forge-text-primary">Auto-Chat</div>
                  <div className="text-[10px] text-forge-text-muted">Agents post to Discord automatically when events occur</div>
                </div>
                <DiscordChatToggle />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-forge-text-primary">Max Reactors</div>
                  <div className="text-[10px] text-forge-text-muted">How many agents react to each event (1-3)</div>
                </div>
                <MaxReactorsControl />
              </div>
              <GroqStatus />
            </div>
          </Section>

          {/* ─── Agent Brains ─── */}
          <Section title="Agent Brains">
            <div className="space-y-3">
              <p className="text-[11px] text-forge-text-muted leading-relaxed">
                Each agent can use a different Claude model for CLI sessions. Opus for heavy reasoning, Sonnet for balanced tasks, Haiku for quick checks.
              </p>
              <ApplyRecommendedBrains />
            </div>
          </Section>

          {/* ─── Theme (placeholder) ─── */}
          <Section title="Theme">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-forge-text-primary">Color Theme</div>
                <div className="text-[10px] text-forge-text-muted">Coming soon</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#0a1628] border-2 border-forge-accent ring-2 ring-forge-accent/30" title="Dark (current)" />
                <div className="w-5 h-5 rounded-full bg-[#18181C] border border-forge-border opacity-40 cursor-not-allowed" title="Midnight (coming soon)" />
                <div className="w-5 h-5 rounded-full bg-[#1e293b] border border-forge-border opacity-40 cursor-not-allowed" title="Slate (coming soon)" />
              </div>
            </div>
          </Section>

          {/* ─── API Keys ─── */}
          <Section title="API Keys & Secrets">
            <div className="space-y-2">
              <p className="text-[11px] text-forge-text-muted">
                Manage encrypted API keys for social posting, email reports, and integrations.
              </p>
              <button
                onClick={() => setShowSecrets(true)}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-forge-accent/10 text-forge-accent border border-forge-accent/20 hover:bg-forge-accent/20 transition-colors flex items-center gap-2"
              >
                <span>&#x1F512;</span> Manage API Keys
              </button>
            </div>
          </Section>

          {showSecrets && <SecretsPanel onClose={() => setShowSecrets(false)} />}

          {/* ─── Friday Studio Director ─── */}
          <Section title="Friday — Studio Director">
            <FridaySettings />
          </Section>

          {/* ─── About ─── */}
          <Section title="About">
            <div className="text-[11px] text-forge-text-muted space-y-1">
              <div><span className="text-forge-text-secondary">The Forge</span> v1.0.0</div>
              <div>13 AI agents • File-based data • Claude Max</div>
              <div>Sounds: 1985 Gauntlet arcade (basementarcade.com)</div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

function SoundRow({ event, description, customFile, onFileSelect, onReset, onPreview }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-forge-bg/50 transition-colors group">
      {/* Event name + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <code className="text-[11px] font-mono text-forge-accent-blue">{event}</code>
          {customFile && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-400/10 text-green-400 font-medium">
              CUSTOM
            </span>
          )}
        </div>
        <div className="text-[10px] text-forge-text-muted truncate">{description}</div>
      </div>

      {/* Custom file name */}
      {customFile && (
        <span className="text-[9px] text-forge-text-muted truncate max-w-[80px]" title={customFile}>
          {customFile.split('/').pop()}
        </span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Preview */}
        <button
          onClick={onPreview}
          className="w-6 h-6 rounded flex items-center justify-center text-[11px]
                     text-forge-text-muted hover:text-forge-accent hover:bg-forge-accent/10 transition-colors"
          title="Preview sound"
        >
          {'\u25B6'}
        </button>

        {/* File picker */}
        <label className="w-6 h-6 rounded flex items-center justify-center text-[11px] cursor-pointer
                          text-forge-text-muted hover:text-forge-accent-blue hover:bg-forge-accent-blue/10 transition-colors"
               title="Select custom sound file">
          {'\u{1F4C1}'}
          <input
            type="file"
            accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav"
            onChange={onFileSelect}
            className="hidden"
          />
        </label>

        {/* Reset */}
        {customFile && (
          <button
            onClick={onReset}
            className="w-6 h-6 rounded flex items-center justify-center text-[11px]
                       text-forge-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Reset to default"
          >
            {'\u21BA'}
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-[10px] font-mono font-semibold text-forge-text-muted uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

function DiscordChatToggle() {
  const enabled = useStore(s => s.discordChatEnabled);
  const setEnabled = useStore(s => s.setDiscordChatEnabled);

  return (
    <div className="flex items-center gap-1 bg-forge-bg rounded-lg p-0.5 border border-forge-border">
      {['On', 'Off'].map((opt) => (
        <button
          key={opt}
          onClick={() => setEnabled(opt === 'On')}
          className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
            (opt === 'On' && enabled) || (opt === 'Off' && !enabled)
              ? 'bg-forge-accent/20 text-forge-accent'
              : 'text-forge-text-muted hover:text-forge-text-secondary'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function DiscordStatusWidget() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    async function check() {
      if (window.electronAPI?.discord) {
        try {
          const s = await window.electronAPI.discord.getStatus();
          setStatus(s);
        } catch {}
      }
    }
    check();
  }, []);

  return (
    <div className="p-2 rounded-lg bg-forge-bg/50 border border-forge-border/50 space-y-1">
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: status?.connected ? '#23A55A' : '#64748B' }}
        />
        <span className="text-[11px] text-forge-text-secondary">
          Discord {status?.connected ? 'Connected' : 'Not Connected'}
        </span>
        <span className="text-[10px] text-forge-text-muted ml-auto" style={{ color: '#5865F2' }}>
          {'\u229E'} discord.js
        </span>
      </div>
      {status?.connected && (
        <div className="text-[10px] text-forge-text-muted">
          #{status.channel?.name} in {status.guild?.name}
        </div>
      )}
    </div>
  );
}

function MaxReactorsControl() {
  const [val, setVal] = useState(() => {
    try { return parseInt(localStorage.getItem('forge-max-reactors') || '2', 10); } catch { return 2; }
  });

  const handleChange = (newVal) => {
    const clamped = Math.max(1, Math.min(3, newVal));
    setVal(clamped);
    localStorage.setItem('forge-max-reactors', String(clamped));
  };

  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map(n => (
        <button
          key={n}
          onClick={() => handleChange(n)}
          className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
            val === n
              ? 'bg-forge-accent/20 text-forge-accent border border-forge-accent/30'
              : 'bg-forge-bg text-forge-text-muted border border-forge-border hover:text-forge-text-secondary'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function ApplyRecommendedBrains() {
  const applyRecommendedBrains = useStore(s => s.applyRecommendedBrains);
  const agentBrains = useStore(s => s.agentBrains);
  const agents = useStore(s => s.agents);
  const [applied, setApplied] = useState(false);

  const handleApply = () => {
    applyRecommendedBrains();
    playSound('click');
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  };

  // Count current brain assignments by model
  const counts = { opus: 0, sonnet: 0, haiku: 0 };
  for (const agent of agents) {
    const brain = agentBrains[agent.id];
    const model = brain?.model || 'opus';
    if (counts[model] !== undefined) counts[model]++;
  }

  return (
    <div className="space-y-2">
      {/* Current summary */}
      <div className="flex items-center gap-3 text-[10px] text-forge-text-muted">
        {BRAIN_PROVIDERS.claude.models.map(m => (
          <span key={m.id} className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
            <span style={{ color: m.color }}>{counts[m.id]}</span>
            <span>{m.name.split(' ')[0]}</span>
          </span>
        ))}
      </div>

      <button
        onClick={handleApply}
        className={`px-4 py-2 text-xs font-medium rounded-lg border transition-all flex items-center gap-2 ${
          applied
            ? 'bg-green-400/10 text-green-400 border-green-400/20'
            : 'bg-forge-accent/10 text-forge-accent border-forge-accent/20 hover:bg-forge-accent/20'
        }`}
      >
        <span>{applied ? '\u2713' : '\u2726'}</span>
        {applied ? 'Applied!' : 'Apply All Recommended Brains'}
      </button>

      <div className="text-[10px] text-forge-text-muted/60 leading-relaxed">
        Sets 4 agents to Opus (heavy reasoning), 8 to Sonnet (balanced), 1 to Haiku (quick checks).
      </div>
    </div>
  );
}

function GroqStatus() {
  const [usage, setUsage] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    async function check() {
      if (window.electronAPI?.groq) {
        try {
          const u = await window.electronAPI.groq.getUsage();
          setUsage(u);
        } catch {}
      }
      if (window.electronAPI?.secrets) {
        try {
          const s = await window.electronAPI.secrets.getStatus();
          setStatus(s.groq);
        } catch {}
      }
    }
    check();
  }, []);

  const connected = status?.connected;
  const pct = usage ? Math.min((usage.requestsToday / usage.dailyLimit) * 100, 100) : 0;

  return (
    <div className="p-2 rounded-lg bg-forge-bg/50 border border-forge-border/50 space-y-2">
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: connected ? '#22C55E' : '#64748B' }}
        />
        <span className="text-[11px] text-forge-text-secondary">
          Groq {connected ? 'Connected' : 'Not Connected'}
        </span>
        <span className="text-[10px] text-forge-text-muted ml-auto" style={{ color: '#F55036' }}>
          {'\u26A1'} Llama 3.1 8B
        </span>
      </div>
      {usage && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] text-forge-text-muted">
            <span>{usage.requestsToday.toLocaleString()} / {usage.dailyLimit.toLocaleString()} requests</span>
            <span className="ml-auto">{pct.toFixed(1)}%</span>
          </div>
          <div className="h-1 bg-forge-bg rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: pct < 50 ? '#22C55E' : pct < 80 ? '#EAB308' : '#EF4444',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
