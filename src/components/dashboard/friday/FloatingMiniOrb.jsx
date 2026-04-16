import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../../../store/useStore';

export default function FloatingMiniOrb({ onNavigateToFriday }) {
  const activePersona = useStore(s => s.activePersona);
  const fridayEnabled = useStore(s => s.fridayEnabled);
  const fridayStatus = useStore(s => s.fridayStatus);
  const fridayMessages = useStore(s => s.fridayMessages);
  const voiceState = useStore(s => s.fridayVoiceState);

  const [narration, setNarration] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [wakeFlash, setWakeFlash] = useState(false);
  const [listeningPaused, setListeningPaused] = useState(() => {
    return localStorage.getItem('forge-friday-wake-word') === 'false';
  });
  const narrationTimer = useRef(null);

  // Listen for wake word flash events from FridayPanel
  useEffect(() => {
    const handler = () => {
      setWakeFlash(true);
      setTimeout(() => setWakeFlash(false), 1500);
    };
    window.addEventListener('forge:wake-word-detected', handler);
    return () => window.removeEventListener('forge:wake-word-detected', handler);
  }, []);

  // Sync listening state with FridayPanel
  useEffect(() => {
    const handler = (e) => setListeningPaused(!e.detail.enabled);
    window.addEventListener('forge:listening-changed', handler);
    return () => window.removeEventListener('forge:listening-changed', handler);
  }, []);

  // Derive theme colors
  const theme = useMemo(() => activePersona.theme || {
    primary: '#D946EF', secondary: '#7E22CE', accent: '#F0ABFC',
  }, [activePersona.theme]);
  const symbol = activePersona.symbol;

  // Track audio level for orb reactivity
  useEffect(() => {
    const cb = (level) => setAudioLevel(level);
    window.__fridayMiniOrbLevelCallback = cb;
    // Also tap into the main audio level callback
    const origCb = window.__fridayAudioLevelCallback;
    window.__fridayAudioLevelCallback = (level) => {
      if (origCb) origCb(level);
      cb(level);
    };
    return () => {
      window.__fridayMiniOrbLevelCallback = null;
      // Restore original
      if (origCb) window.__fridayAudioLevelCallback = origCb;
    };
  }, []);

  // Show latest Friday message as narration bubble
  useEffect(() => {
    if (!fridayEnabled || fridayMessages.length === 0) return;
    const lastMsg = fridayMessages[fridayMessages.length - 1];
    if (lastMsg.role !== 'assistant' || lastMsg.type === 'status') return;

    const preview = lastMsg.content.length > 80
      ? lastMsg.content.slice(0, 77) + '...'
      : lastMsg.content;
    setNarration(preview);

    if (narrationTimer.current) clearTimeout(narrationTimer.current);
    narrationTimer.current = setTimeout(() => setNarration(null), 5000);
  }, [fridayMessages, fridayEnabled]);

  if (!fridayEnabled) return null;

  // Voice-aware state resolution
  const isVoiceActive = voiceState === 'listening' || voiceState === 'thinking' || voiceState === 'speaking';

  const getOrbStyle = () => {
    const isDark = theme.secondary === '#000000';
    const darkBg = `radial-gradient(circle at 40% 40%, #333, #111 50%, #000)`;

    if (isVoiceActive) {
      switch (voiceState) {
        case 'listening': {
          const scale = 1 + audioLevel * 0.3;
          return {
            bg: isDark ? darkBg : 'radial-gradient(circle at 40% 40%, #22C55E, #16A34A 50%, #166534)',
            shadow: isDark
              ? `0 0 ${20 + audioLevel * 30}px rgba(34,197,94,${0.3 + audioLevel * 0.3}), 0 0 ${40 + audioLevel * 20}px rgba(34,197,94,0.1)`
              : `0 0 ${20 + audioLevel * 30}px rgba(34,197,94,${0.4 + audioLevel * 0.3}), 0 0 ${40 + audioLevel * 20}px rgba(34,197,94,0.15)`,
            innerOpacity: 0.8 + audioLevel * 0.2,
            transform: `scale(${scale})`,
            label: 'Listening',
            labelColor: 'text-green-400',
            animate: '',
          };
        }
        case 'thinking':
          return {
            bg: isDark ? darkBg : 'radial-gradient(circle at 40% 40%, #EAB308, #CA8A04 50%, #854D0E)',
            shadow: isDark
              ? '0 0 20px rgba(234,179,8,0.3), 0 0 40px rgba(234,179,8,0.1)'
              : '0 0 20px rgba(234,179,8,0.5), 0 0 40px rgba(234,179,8,0.2)',
            innerOpacity: 0.7,
            transform: 'scale(1)',
            label: 'Thinking',
            labelColor: 'text-amber-400',
            animate: 'animate-pulse',
          };
        case 'speaking':
          return {
            bg: isDark ? darkBg : `radial-gradient(circle at 40% 40%, ${theme.primary}, ${theme.accent} 50%, ${theme.secondary})`,
            shadow: `0 0 24px ${theme.primary}99, 0 0 48px ${theme.primary}40`,
            innerOpacity: 0.9,
            transform: 'scale(1.05)',
            label: 'Speaking',
            labelColor: '',
            labelStyle: { color: theme.primary },
            animate: 'animate-pulse',
          };
      }
    }

    // Connection-only states
    const stateMap = {
      connected: {
        bg: isDark ? darkBg : `radial-gradient(circle at 40% 40%, ${theme.primary}, ${theme.accent} 50%, ${theme.secondary})`,
        shadow: `0 0 20px ${theme.primary}66, 0 0 40px ${theme.primary}26`,
        innerOpacity: 0.8,
        transform: 'scale(1)',
        label: activePersona.shortName,
        labelColor: '',
        labelStyle: { color: `${theme.primary}99` },
        animate: '',
      },
      connecting: {
        bg: isDark ? darkBg : 'radial-gradient(circle at 40% 40%, #EAB308, #CA8A04 50%, #854D0E)',
        shadow: isDark ? `0 0 12px rgba(234,179,8,0.4)` : '0 0 12px rgba(234,179,8,0.3)',
        innerOpacity: 0.5,
        transform: 'scale(1)',
        label: 'Connecting',
        labelColor: isDark ? '' : 'text-yellow-500/60',
        labelStyle: isDark ? { color: '#EAB308' } : undefined,
        animate: 'animate-pulse',
      },
      disconnected: {
        bg: isDark ? darkBg : '#374151',
        shadow: isDark ? `0 0 8px ${theme.primary}30` : 'none',
        innerOpacity: 0.3,
        transform: 'scale(1)',
        label: 'Offline',
        labelColor: isDark ? '' : 'text-gray-500/60',
        labelStyle: isDark ? { color: '#6B7280' } : undefined,
        animate: '',
      },
    };

    return stateMap[fridayStatus] || stateMap.disconnected;
  };

  const orb = getOrbStyle();

  return (
    <div className="fixed bottom-6 right-6 z-30 flex flex-col items-center gap-2">
      {/* Narration bubble */}
      {narration && (
        <div
          className="max-w-[220px] px-3 py-2 rounded-lg text-[11px] leading-relaxed
                     animate-fade-in cursor-pointer"
          style={{
            color: theme.accent,
            background: `${theme.primary}1A`,
            border: `1px solid ${theme.primary}40`,
            backdropFilter: 'blur(8px)',
          }}
          onClick={onNavigateToFriday}
        >
          {narration}
        </div>
      )}

      {/* Orb */}
      <button
        onClick={onNavigateToFriday}
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150
                   hover:scale-110 active:scale-95 ${orb.animate}`}
        style={{
          background: orb.bg,
          boxShadow: wakeFlash ? `0 0 30px #fff, 0 0 60px ${theme.primary}99, ${orb.shadow}` : orb.shadow,
          transform: orb.transform,
        }}
      >
        {symbol ? (
          <span className="font-bold select-none" style={{ fontSize: '1.5rem', lineHeight: 1, color: theme.secondary === '#000000' ? theme.primary : (theme.accent || '#fff'), textShadow: `0 0 10px ${theme.primary}, 0 0 20px ${theme.primary}60` }}>
            {symbol}
          </span>
        ) : (
          <div
            className="w-5 h-5 rounded-full transition-opacity duration-150"
            style={{
              background: `radial-gradient(circle, rgba(255,255,255,0.6), ${theme.primary}66)`,
              opacity: orb.innerOpacity,
            }}
          />
        )}
      </button>

      {/* Mic pause/play toggle — always visible when connected */}
      {fridayStatus === 'connected' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const next = listeningPaused;
            setListeningPaused(!next);
            localStorage.setItem('forge-friday-wake-word', String(next));
            window.dispatchEvent(new CustomEvent('forge:listening-changed', { detail: { enabled: next } }));
          }}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
          style={{
            background: listeningPaused ? 'rgba(100,116,139,0.2)' : `${theme.primary}25`,
            border: `1px solid ${listeningPaused ? 'rgba(100,116,139,0.3)' : theme.primary + '50'}`,
          }}
          title={listeningPaused ? 'Resume listening' : 'Pause listening'}
        >
          {listeningPaused ? (
            /* Play icon */
            <svg width="10" height="12" viewBox="0 0 10 12" fill={theme.primary} opacity="0.6">
              <polygon points="0,0 10,6 0,12" />
            </svg>
          ) : (
            /* Pause icon */
            <svg width="10" height="12" viewBox="0 0 10 12" fill={theme.primary}>
              <rect x="0" y="0" width="3" height="12" />
              <rect x="7" y="0" width="3" height="12" />
            </svg>
          )}
        </button>
      )}

      {/* Label */}
      <div className={`text-[10px] tracking-widest uppercase ${orb.labelColor || ''}`}
        style={orb.labelStyle || {}}>
        {orb.label}
      </div>
    </div>
  );
}
