import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useStore } from '../../../store/useStore';

export default function TranscriptFeed({ messages }) {
  const activePersona = useStore(s => s.activePersona);
  const feedRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const theme = useMemo(() => activePersona.theme || {
    primary: '#D946EF', secondary: '#7E22CE', accent: '#F0ABFC',
  }, [activePersona.theme]);

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const handleScroll = () => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 60;
    setAutoScroll(atBottom);
    setShowScrollBtn(!atBottom);
  };

  const scrollToBottom = () => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
      setAutoScroll(true);
      setShowScrollBtn(false);
    }
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Group messages by proximity — same role within 2 min doesn't repeat header
  const shouldShowHeader = (msg, idx) => {
    if (idx === 0) return true;
    const prev = messages[idx - 1];
    if (prev.role !== msg.role) return true;
    const gap = new Date(msg.timestamp) - new Date(prev.timestamp);
    return gap > 2 * 60 * 1000;
  };

  const roleLabel = (role) => {
    if (role === 'user') return 'You';
    if (role === 'assistant') return activePersona.shortName;
    return 'System';
  };

  const roleColor = (role) => {
    if (role === 'assistant') return theme.primary;
    if (role === 'user') return '#94A3B8';
    return '#64748B';
  };

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-3 py-2 space-y-0.5 scrollbar-thin"
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-2xl mb-2 opacity-40">&#x1F916;</div>
              <div className="text-xs text-forge-text-muted">{activePersona.shortName} is waiting...</div>
              <div className="text-[10px] text-forge-text-muted mt-1">
                Connect to start your studio session
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const showHeader = shouldShowHeader(msg, idx);

          // System/status messages — centered, themed for agent dispatches
          if (msg.type === 'status' || msg.role === 'system') {
            const isAgentMsg = msg.content && /agent\s/i.test(msg.content);
            const isCompleted = msg.taskStatus === 'completed';
            const isInProgress = msg.taskStatus === 'in-progress';
            const isToolBlocked = msg.taskStatus === 'tool-blocked';
            return (
              <div
                key={msg.id}
                className="flex justify-center py-1.5 animate-fade-in"
              >
                <span className="text-[11px] px-3 py-1 rounded-full inline-flex items-center gap-2"
                  style={isToolBlocked
                    ? { color: '#EAB308', backgroundColor: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }
                    : isAgentMsg
                    ? { color: theme.primary, backgroundColor: `${theme.primary}15`, border: `1px solid ${theme.primary}30` }
                    : { color: 'var(--forge-text-muted)', backgroundColor: 'rgba(var(--forge-bg-rgb, 12,12,24), 0.5)' }
                  }>
                  {isInProgress && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: theme.primary }} />}
                  {isCompleted && <span style={{ color: '#22C55E' }}>&#10003;</span>}
                  {msg.content}
                  {isCompleted && msg.scopeId && (
                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('forge:open-terminal', { detail: { tabId: msg.scopeId } }));
                      }}
                      className="text-[10px] underline opacity-70 hover:opacity-100 transition-opacity"
                      style={{ color: theme.primary }}
                    >
                      View
                    </button>
                  )}
                </span>
              </div>
            );
          }

          const isFriday = msg.role === 'assistant';

          return (
            <div
              key={msg.id}
              className="animate-fade-in"
              style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
            >
              {showHeader && (
                <div className="flex items-center gap-2 mt-3 mb-0.5">
                  <div
                    className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold"
                    style={{
                      backgroundColor: isFriday && theme.secondary === '#000000' ? '#111' : roleColor(msg.role),
                      color: isFriday && theme.secondary === '#000000' ? theme.primary : '#FFFFFF',
                      boxShadow: isFriday && theme.secondary === '#000000' ? `0 0 6px ${theme.primary}50` : 'none',
                    }}
                  >
                    {isFriday ? (activePersona.symbol || 'F') : 'U'}
                  </div>
                  <span className="text-xs font-semibold" style={{ color: roleColor(msg.role) }}>
                    {roleLabel(msg.role)}
                  </span>
                  <span className="text-[10px] text-forge-text-muted">
                    {formatTime(msg.timestamp)}
                  </span>
                  {msg.type === 'command-request' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded border"
                      style={{
                        backgroundColor: `${theme.primary}1A`,
                        borderColor: `${theme.primary}33`,
                        color: theme.primary,
                      }}>
                      command
                    </span>
                  )}
                </div>
              )}
              <div
                className={`pl-7 text-[13px] leading-relaxed whitespace-pre-wrap ${
                  isFriday ? 'text-forge-text-primary' : 'text-forge-text-secondary'
                }`}
                style={{
                  borderLeft: isFriday && showHeader ? `2px solid ${theme.primary}40` : 'none',
                  backgroundColor: isFriday && showHeader ? `${theme.primary}08` : 'transparent',
                  borderRadius: isFriday && showHeader ? '0 4px 4px 0' : undefined,
                  padding: isFriday && showHeader ? '4px 8px 4px 20px' : undefined,
                  marginLeft: isFriday && showHeader ? 0 : undefined,
                }}
              >
                {msg.content}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-2 right-4 w-7 h-7 rounded-full bg-forge-surface border border-forge-border
                     shadow-lg flex items-center justify-center text-xs text-forge-text-muted
                     transition-colors"
          style={{ '--hover-color': theme.primary }}
          onMouseEnter={e => { e.target.style.color = theme.primary; e.target.style.borderColor = `${theme.primary}4D`; }}
          onMouseLeave={e => { e.target.style.color = ''; e.target.style.borderColor = ''; }}
          title="Scroll to bottom"
        >
          &#x2193;
        </button>
      )}
    </div>
  );
}
