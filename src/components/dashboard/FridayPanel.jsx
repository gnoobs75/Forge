import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import TranscriptFeed from './friday/TranscriptFeed';
import ConfirmDialog from './friday/ConfirmDialog';
import StudioStatusCards from './friday/StudioStatusCards';
import VoiceOrb from './friday/VoiceOrb';
import FridayLogPreview from './friday/FridayLogPreview';
import { startMicCapture, stopMicCapture, setAudioLevelCallback, setMicReadyCallback } from '../../utils/fridayAudio';
import { playSound } from '../../utils/sounds';
// Wake word hook removed — using simple pause/play toggle instead

export default function FridayPanel() {
  const activePersona = useStore((s) => s.activePersona);
  const fridayEnabled = useStore((s) => s.fridayEnabled);
  const fridayStatus = useStore((s) => s.fridayStatus);
  const fridayMessages = useStore((s) => s.fridayMessages);
  const setFridayEnabled = useStore((s) => s.setFridayEnabled);
  const connectFriday = useStore((s) => s.connectFriday);
  const disconnectFriday = useStore((s) => s.disconnectFriday);
  const sendFridayMessage = useStore((s) => s.sendFridayMessage);
  const fridayPendingCommands = useStore((s) => s.fridayPendingCommands);
  const removeFridayPendingCommand = useStore((s) => s.removeFridayPendingCommand);
  const addFridayMessage = useStore((s) => s.addFridayMessage);

  const [input, setInput] = useState('');
  const inputRef = useRef(null);
  const voiceState = useStore((s) => s.fridayVoiceState);
  const setVoiceState = useStore((s) => s.setFridayVoiceState);
  const isMuted = useStore((s) => s.fridayMuted);
  const setIsMuted = useStore((s) => s.setFridayMuted);
  const [pttActive, setPttActive] = useState(false); // PTT button pressed (UI state)
  const [voiceReady, setVoiceReady] = useState(false); // Mic gain stabilized
  const [selectedVoice, setSelectedVoice] = useState(() => {
    return localStorage.getItem('forge-friday-voice-active-profile') || 'friday-classic';
  });
  const voiceProfiles = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('forge-friday-voice-profiles') || '[]');
      if (saved.length) {
        // Deduplicate by id (keep first occurrence)
        const seen = new Set();
        return saved.filter(p => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        }).map(p => ({ id: p.id, name: p.name }));
      }
    } catch {}
    return [
      { id: 'friday-classic', name: 'Friday' },
      { id: 'commander', name: 'Commander' },
      { id: 'creative-muse', name: 'Creative Muse' },
      { id: 'baroness', name: 'Baroness' },
    ];
  }, []);
  const [audioLevel, setAudioLevel] = useState(0);
  const pttActiveRef = useRef(false); // Track PTT intent for voice state handler (ref for sync)
  const [showIntroVideo, setShowIntroVideo] = useState(false);
  const [agentDispatchVideo, setAgentDispatchVideo] = useState(false);
  const introVideoRef = useRef(null);
  const dispatchVideoRef = useRef(null);
  const introPlayedRef = useRef(false);
  const silenceTimerRef = useRef(null);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(() => {
    const stored = localStorage.getItem('forge-friday-wake-word');
    if (stored !== null) return stored === 'true';
    // Default: enabled if persona has wake words configured
    return !!(activePersona.wakeWords?.length);
  });
  const isConnected = fridayStatus === 'connected';
  const isReconnecting = fridayStatus === 'reconnecting';

  // Sync dropdown when persona changes externally (e.g. from VoiceTab)
  useEffect(() => {
    const id = localStorage.getItem('forge-friday-voice-active-profile') || 'friday-classic';
    setSelectedVoice(id);
  }, [activePersona.name]);

  // Play intro video once when Baroness persona page loads (has video asset)
  useEffect(() => {
    if (activePersona.image && !introPlayedRef.current) {
      introPlayedRef.current = true;
      setShowIntroVideo(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync listening state from FloatingMiniOrb toggle
  useEffect(() => {
    const handler = (e) => setWakeWordEnabled(e.detail.enabled);
    window.addEventListener('forge:listening-changed', handler);
    return () => window.removeEventListener('forge:listening-changed', handler);
  }, []);

  // Listen for agent dispatch events to play video popup
  useEffect(() => {
    const handleAgentDispatch = () => {
      if (activePersona.image) {
        setAgentDispatchVideo(true);
      }
    };
    window.addEventListener('forge:agent-dispatched', handleAgentDispatch);
    return () => window.removeEventListener('forge:agent-dispatched', handleAgentDispatch);
  }, [activePersona.image]);

  // Listening mode — controlled by pause/play button
  // When listening is enabled and connected, auto-open voice session
  useEffect(() => {
    if (wakeWordEnabled && isConnected && !pttActiveRef.current) {
      // Auto-start voice session
      (async () => {
        pttActiveRef.current = true;
        setPttActive(true);
        setVoiceState('listening');
        await startMicCapture();
        const sampleRate = window.__fridayAudioSampleRate || 48000;
        let ttsVoice = 'Eve';
        try {
          const profiles = JSON.parse(localStorage.getItem('forge-friday-voice-profiles') || '[]');
          const profile = profiles.find(p => p.id === selectedVoice);
          if (profile?.voice) ttsVoice = profile.voice;
        } catch {}
        console.log(`[Listening] Auto-opened voice session for ${activePersona.shortName}`);
        window.electronAPI?.friday?.send({ type: 'voice:start', id: crypto.randomUUID(), voice: ttsVoice, sampleRate });
      })();
    } else if (!wakeWordEnabled && pttActiveRef.current) {
      // Pause — close voice session
      pttActiveRef.current = false;
      setPttActive(false);
      setVoiceReady(false);
      stopMicCapture();
      window.electronAPI?.friday?.send({ type: 'voice:stop', id: crypto.randomUUID() });
      setVoiceState('idle');
      console.log('[Listening] Paused — voice session closed');
    }
  }, [wakeWordEnabled, isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive theme from persona
  const theme = useMemo(() => activePersona.theme || {
    primary: '#D946EF', secondary: '#7E22CE', accent: '#F0ABFC', text: '#E8E0D4',
  }, [activePersona.theme]);

  // Symbol color — use theme.primary (red for Baroness) for a good contrast on dark orb
  const symbolColor = theme.primary;

  // Auto-start Friday server on mount if enabled (e.g. persisted from previous session)
  useEffect(() => {
    if (fridayEnabled && window.electronAPI?.friday?.startServer) {
      console.log('[FridayPanel] Auto-starting Friday server (was enabled)');
      window.electronAPI.friday.startServer();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track voice pre-connect state (no longer auto pre-connect — Grok times out after 15min idle)
  const preconnectedRef = useRef(false);

  // Push active voice persona config to Friday on every connect
  useEffect(() => {
    if (fridayStatus === 'connected') {
      try {
        const saved = localStorage.getItem('forge-friday-voice');
        if (saved) {
          const config = JSON.parse(saved);
          if (config.voiceIdentity) {
            console.log(`[FridayPanel] Pushing voice persona config to Friday (${config.voiceIdentity.length} chars)`);
            window.electronAPI?.friday?.send({
              type: 'config:update', id: crypto.randomUUID(),
              section: 'voice', config,
            });
          }
        }
      } catch {}
    }
  }, [fridayStatus]);

  // Audio level + mic ready callbacks
  useEffect(() => {
    setAudioLevelCallback((level) => setAudioLevel(level));
    setMicReadyCallback(() => {
      console.log('[FridayPanel] Mic gain stabilized — voice ready');
      setVoiceReady(true);
    });
  }, []);

  // Audio playback + voice state now handled persistently in setupFridayListeners (store)
  // PTT override: don't let store voice-state go idle while PTT is active
  useEffect(() => {
    if (voiceState === 'idle' && pttActiveRef.current) {
      setVoiceState('listening');
    }
  }, [voiceState, setVoiceState]);

  // Play sounds on pending commands
  useEffect(() => {
    if (fridayPendingCommands.length > 0) playSound('friday-alert');
  }, [fridayPendingCommands.length]);

  // Play sounds on task completion
  useEffect(() => {
    const lastMsg = fridayMessages[fridayMessages.length - 1];
    if (lastMsg?.type === 'task-update' && lastMsg.content?.includes('completed')) {
      playSound('complete');
    }
  }, [fridayMessages.length]);

  const handlePushToTalk = async () => {
    if (pttActiveRef.current) {
      // Stop PTT
      pttActiveRef.current = false;
      setPttActive(false);
      setVoiceReady(false);
      stopMicCapture();
      window.electronAPI?.friday?.send({ type: 'voice:stop', id: crypto.randomUUID() });
      setVoiceState('idle');
    } else {
      // Start PTT — set state immediately for responsive UI
      pttActiveRef.current = true;
      setPttActive(true);
      setVoiceState('listening');
      await startMicCapture();
      const sampleRate = window.__fridayAudioSampleRate || 48000;
      // Look up TTS voice from active profile
      let ttsVoice = 'Eve';
      try {
        const profiles = JSON.parse(localStorage.getItem('forge-friday-voice-profiles') || '[]');
        const profile = profiles.find(p => p.id === selectedVoice);
        if (profile?.voice) ttsVoice = profile.voice;
      } catch {}
      console.log(`[FridayPanel] Push-to-talk: starting voice session (sampleRate=${sampleRate}, voice=${ttsVoice}, persona=${selectedVoice})`);
      window.electronAPI?.friday?.send({ type: 'voice:start', id: crypto.randomUUID(), voice: ttsVoice, sampleRate });
    }
  };

  const handleConnect = () => {
    if (fridayStatus === 'connected' || fridayStatus === 'connecting') {
      disconnectFriday();
      setFridayEnabled(false);
    } else {
      setFridayEnabled(true);
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || fridayStatus !== 'connected') return;
    sendFridayMessage(trimmed);
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // (isConnected/isReconnecting moved earlier for wake word hook)

  // Session stats
  const userMsgCount = fridayMessages.filter((m) => m.role === 'user').length;
  const fridayMsgCount = fridayMessages.filter((m) => m.role === 'assistant').length;
  const sessionStart = fridayMessages.length > 0 ? fridayMessages[0].timestamp : null;

  return (
    <div className="h-full flex flex-col" style={{
      '--persona-primary': theme.primary,
      '--persona-secondary': theme.secondary,
      '--persona-accent': theme.accent,
    }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-forge-border bg-forge-surface/50">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              {activePersona.name !== 'F.R.I.D.A.Y.' ? (
                <h2 className="text-sm font-bold text-forge-text-primary flex items-center gap-2">
                  <span className="font-mono line-through opacity-40 text-forge-text-muted">F.R.I.D.A.Y.</span>
                  <span style={{
                    fontFamily: '"Permanent Marker", "Marker Felt", cursive',
                    color: theme.primary,
                    fontSize: '1rem',
                    transform: 'rotate(-2deg)',
                    display: 'inline-block',
                    textShadow: `1px 1px 0 ${theme.primary}40`,
                    letterSpacing: '0.05em',
                  }}>{activePersona.name}</span>
                </h2>
              ) : (
                <h2 className="text-sm font-mono font-bold text-forge-text-primary">
                  {activePersona.name}
                </h2>
              )}
              <div
                className={`w-2 h-2 rounded-full ${isConnected ? 'animate-pulse' : ''}`}
                style={{
                  backgroundColor: isConnected
                    ? '#22C55E'
                    : isReconnecting
                    ? '#EAB308'
                    : '#6B7280',
                }}
              />
            </div>
            <p className="text-[10px] text-forge-text-muted">
              Studio Director &middot; Voice + Text Interface
            </p>
          </div>
        </div>
        <button
          onClick={handleConnect}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          style={isConnected ? {
            borderColor: 'rgba(239,68,68,0.3)', color: '#F87171',
          } : {
            borderColor: `${theme.primary}4D`, color: theme.primary,
          }}
          onMouseEnter={e => {
            if (!isConnected) e.target.style.backgroundColor = `${theme.primary}1A`;
          }}
          onMouseLeave={e => { e.target.style.backgroundColor = ''; }}
        >
          {isConnected ? 'Disconnect' : fridayStatus === 'connecting' ? 'Connecting...' : 'Connect'}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar */}
        <div className="w-64 border-r border-forge-border bg-forge-surface/30 p-3 flex flex-col gap-4 overflow-y-auto">
          {/* Voice Orb */}
          <div className="rounded-xl border border-forge-border bg-forge-bg p-4 flex flex-col items-center gap-2 relative">
            <VoiceOrb
              state={fridayEnabled ? (isConnected ? voiceState : 'off') : 'off'}
              size={160}
              audioLevel={audioLevel}
              theme={theme}
              wakeFlash={false}
            />
            {/* Symbol overlay on orb — color contrasts with orbColor */}
            {activePersona.symbol && (
              <div className="absolute pointer-events-none" style={{ top: '16px', left: '50%', width: '160px', height: '160px', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="select-none"
                  style={{ fontSize: '3rem', lineHeight: 1, fontWeight: 300, letterSpacing: '0.02em', color: `${symbolColor}DD`, textShadow: `0 0 18px ${symbolColor}90, 0 0 36px ${symbolColor}50, 0 0 54px ${symbolColor}25` }}>
                  {activePersona.symbol}
                </span>
              </div>
            )}

            {/* Voice status indicator */}
            {isConnected && !pttActive && voiceState === 'idle' && (
              <div className="flex items-center gap-2 text-[10px]" style={{ color: `${theme.primary}99` }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `${theme.primary}80` }} />
                Voice ready
              </div>
            )}
            {pttActive && !voiceReady && (
              <div className="flex items-center gap-2 text-[10px] text-yellow-400 animate-pulse">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                Warming up mic...
              </div>
            )}
            {pttActive && voiceReady && voiceState === 'listening' && (
              <div className="flex items-center gap-2 text-[10px] text-green-400">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Listening...
              </div>
            )}
            {pttActive && voiceReady && voiceState === 'thinking' && (
              <div className="flex items-center gap-2 text-[10px] text-amber-400 animate-pulse">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                Thinking...
              </div>
            )}
            {voiceState === 'speaking' && (
              <div className="flex items-center gap-2 text-[10px]" style={{ color: theme.primary }}>
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: theme.primary }} />
                Speaking...
              </div>
            )}

            <div className="flex gap-2 mt-2 flex-wrap justify-center">
              {/* Voice activate / stop button */}
              <button
                onClick={handlePushToTalk}
                disabled={!isConnected}
                className="px-4 py-2 text-xs rounded-full border transition-colors disabled:opacity-30"
                style={pttActive
                  ? voiceReady
                    ? { borderColor: 'rgba(34,197,94,0.5)', color: '#4ADE80', backgroundColor: 'rgba(34,197,94,0.1)' }
                    : { borderColor: 'rgba(234,179,8,0.5)', color: '#FACC15', backgroundColor: 'rgba(234,179,8,0.1)' }
                  : { borderColor: `${theme.primary}4D`, color: theme.primary }
                }
              >
                {pttActive
                  ? voiceState === 'speaking' ? `${activePersona.shortName} Speaking...`
                  : voiceState === 'thinking' ? 'Thinking...'
                  : voiceReady ? 'Listening — Stop'
                  : 'Warming up...'
                  : 'Open Mic'}
              </button>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`px-3 py-2 text-xs rounded-full border transition-colors ${
                  isMuted
                    ? 'border-red-500/30 text-red-400'
                    : 'border-forge-border text-forge-text-muted'
                }`}
              >
                {isMuted ? 'Muted' : 'Sound'}
              </button>
            </div>
            {/* Voice activation toggle */}
            <div className="flex items-center justify-center gap-2 mt-1.5">
              <button
                onClick={() => {
                  const next = !wakeWordEnabled;
                  setWakeWordEnabled(next);
                  localStorage.setItem('forge-friday-wake-word', String(next));
                  window.dispatchEvent(new CustomEvent('forge:listening-changed', { detail: { enabled: next } }));
                }}
                disabled={!isConnected}
                className="flex items-center gap-1.5 px-3 py-1 text-[10px] rounded-full border transition-colors disabled:opacity-30"
                style={wakeWordEnabled && isConnected
                  ? { borderColor: `${theme.primary}60`, color: theme.primary, backgroundColor: `${theme.primary}15` }
                  : { borderColor: 'rgba(100,116,139,0.3)', color: '#94A3B8' }
                }
              >
                <div className={`w-1.5 h-1.5 rounded-full ${wakeWordEnabled && pttActive ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: wakeWordEnabled && pttActive ? '#22C55E' : '#64748B' }} />
                {wakeWordEnabled ? 'Listening' : 'Paused'}
              </button>
            </div>

            {/* Voice/Persona selector */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-forge-text-muted">Voice:</span>
              <select
                value={selectedVoice}
                onChange={(e) => {
                  const profileId = e.target.value;
                  setSelectedVoice(profileId);
                  // Activate the persona
                  try {
                    const profiles = JSON.parse(localStorage.getItem('forge-friday-voice-profiles') || '[]');
                    const profile = profiles.find(p => p.id === profileId);
                    if (profile) {
                      localStorage.setItem('forge-friday-voice-active-profile', profileId);
                      const config = {
                        defaultVoice: profile.voice,
                        ttsTimeout: profile.ttsTimeout,
                        emotionRewriteTimeout: profile.emotionRewriteTimeout,
                        voiceIdentity: profile.voiceIdentity,
                        deliveryRules: profile.deliveryRules,
                      };
                      localStorage.setItem('forge-friday-voice', JSON.stringify(config));
                      window.electronAPI?.friday?.send({
                        type: 'config:update', id: crypto.randomUUID(),
                        section: 'voice', config,
                      });
                      useStore.getState().setActivePersona({
                        name: profile.name,
                        shortName: profile.name.split(' ')[0] || profile.name,
                        color: profile.color,
                        icon: profile.icon,
                        image: profile.image || null,
                        theme: profile.theme || { primary: '#D946EF', secondary: '#7E22CE', accent: '#F0ABFC', text: '#E8E0D4' },
                        symbol: profile.symbol || null,
                      });
                    }
                  } catch {}
                }}
                disabled={pttActive}
                className="bg-forge-bg border border-forge-border rounded px-2 py-1 text-[11px] text-forge-text-primary
                           focus:outline-none disabled:opacity-40 cursor-pointer"
                style={{ '--tw-ring-color': `${theme.primary}80` }}
              >
                {voiceProfiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Session stats */}
          <div className="rounded-lg border border-forge-border bg-forge-bg p-3">
            <h3 className="text-[10px] font-semibold text-forge-text-muted uppercase tracking-wider mb-2">
              Session
            </h3>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-forge-text-muted">Status</span>
                <span
                  className="capitalize font-medium"
                  style={{ color: isConnected ? '#22C55E' : '#6B7280' }}
                >
                  {fridayStatus}
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-forge-text-muted">Messages</span>
                <span className="text-forge-text-secondary">{fridayMessages.length}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-forge-text-muted">You / Friday</span>
                <span className="text-forge-text-secondary">
                  {userMsgCount} / {fridayMsgCount}
                </span>
              </div>
              {sessionStart && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-forge-text-muted">Started</span>
                  <span className="text-forge-text-secondary">
                    {new Date(sessionStart).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Studio Status Cards */}
          <div>
            <h3 className="text-[10px] font-semibold text-forge-text-muted uppercase tracking-wider mb-2">
              Studio
            </h3>
            <StudioStatusCards fridayStatus={fridayStatus} />
          </div>
        </div>

        {/* Right column — transcript + input */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Intro video — fills right pane, plays once then reveals chat */}
          {showIntroVideo && activePersona.image && (
            <div className="absolute inset-0 z-10 bg-black">
              <video
                ref={introVideoRef}
                src="/assets/Baroness.mp4"
                autoPlay
                muted={false}
                onEnded={() => setShowIntroVideo(false)}
                onClick={() => setShowIntroVideo(false)}
                className="w-full h-full object-cover cursor-pointer"
                style={{ outline: 'none', border: 'none', objectPosition: 'top center' }}
              />
            </div>
          )}

          {/* Persona background image — right pane only, zoomed to upper body */}
          {activePersona.image && !showIntroVideo && (
            <div
              className="absolute inset-0 pointer-events-none z-0"
              style={{
                backgroundImage: `url(${activePersona.image.startsWith('/') || activePersona.image.startsWith('http') ? activePersona.image : '/' + activePersona.image})`,
                backgroundSize: 'cover',
                backgroundPosition: 'top center',
                backgroundRepeat: 'no-repeat',
                opacity: 0.18,
                filter: 'grayscale(15%)',
              }}
            />
          )}
          {/* Reconnecting banner */}
          {isReconnecting && (
            <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              <span className="text-[11px] text-yellow-400">
                Reconnecting to {activePersona.shortName}...
              </span>
            </div>
          )}

          {/* Transcript feed */}
          <TranscriptFeed messages={fridayMessages} />

          {/* Pending command confirmations */}
          {fridayPendingCommands.map(cmd => (
            <ConfirmDialog
              key={cmd.commandId}
              command={cmd}
              onRespond={(commandId, approved) => {
                window.electronAPI?.friday?.respondToCommand(commandId, approved);
                removeFridayPendingCommand(commandId);
                addFridayMessage({
                  role: 'system',
                  content: approved ? `Approved: ${cmd.command}` : `Denied: ${cmd.command}`,
                  type: 'status',
                });
              }}
            />
          ))}

          {/* Friday server log preview */}
          {fridayEnabled && (
            <FridayLogPreview onOpenTerminal={() => {
              window.dispatchEvent(new CustomEvent('forge:open-terminal', { detail: { tabId: 'friday-server' } }));
            }} />
          )}

          {/* Input area */}
          <div className="border-t border-forge-border bg-forge-surface/30 p-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!isConnected}
                placeholder={
                  isConnected
                    ? `Talk to ${activePersona.shortName}...`
                    : 'Connect to start chatting'
                }
                className="flex-1 bg-forge-bg border border-forge-border rounded-lg px-3 py-2 text-xs text-forge-text-primary
                           placeholder:text-forge-text-muted focus:outline-none
                           disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ '--tw-ring-color': `${theme.primary}80` }}
              />
              <button
                onClick={handleSend}
                disabled={!isConnected || !input.trim()}
                className="px-4 py-2 rounded-lg text-xs font-medium transition-colors
                           disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isConnected && input.trim() ? theme.primary : undefined,
                  color: isConnected && input.trim() ? 'white' : undefined,
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Intro video and agent dispatch video are rendered inside the right pane */}

      {/* Agent dispatch video popup — plays once and disappears */}
      {agentDispatchVideo && (
        <div
          className="fixed z-50 flex items-center justify-center pointer-events-none"
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <video
            ref={dispatchVideoRef}
            src="/assets/Baroness.mp4"
            autoPlay
            muted={false}
            onEnded={() => setAgentDispatchVideo(false)}
            className="pointer-events-auto"
            style={{ width: '400px', maxHeight: '50vh', outline: 'none', border: 'none', borderRadius: '8px', boxShadow: '0 0 40px rgba(220,38,38,0.4)' }}
          />
        </div>
      )}
    </div>
  );
}
