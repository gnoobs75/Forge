import React, { useRef, useEffect, useState, useMemo } from 'react';
import { renderAgentAvatar } from '../../../utils/avatarRenderer';

export default function ChatFeed({ messages, typingAgent, agents }) {
  const feedRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, autoScroll, typingAgent]);

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

  // Group messages by proximity — same agent within 2 min doesn't repeat header
  const shouldShowHeader = (msg, idx) => {
    if (idx === 0) return true;
    const prev = messages[idx - 1];
    if (prev.agentId !== msg.agentId) return true;
    const gap = new Date(msg.timestamp) - new Date(prev.timestamp);
    return gap > 2 * 60 * 1000;
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const typingAgentData = typingAgent ? agents?.find(a => a.id === typingAgent) : null;

  // Pre-render all agent avatars at 40px (2x for crisp 20px display)
  const renderedAvatars = useMemo(() => {
    if (!agents) return {};
    const map = {};
    for (const agent of agents) {
      map[agent.id] = renderAgentAvatar(agent.id, agent.color, 40);
    }
    return map;
  }, [agents]);

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
              <div className="text-2xl mb-2 opacity-40">&#x1F3F0;</div>
              <div className="text-xs text-forge-text-muted">The Council is quiet...</div>
              <div className="text-[10px] text-forge-text-muted mt-1">
                Agent chatter will appear here when events occur
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const showHeader = shouldShowHeader(msg, idx);

          return (
            <div
              key={msg.id}
              className="animate-fade-in"
              style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
            >
              {showHeader && (
                <div className="flex items-center gap-2 mt-3 mb-0.5">
                  <div
                    className="w-5 h-5 rounded-full flex-shrink-0 overflow-hidden"
                    style={{ backgroundColor: msg.agentColor }}
                  >
                    {renderedAvatars[msg.agentId] ? (
                      <img src={renderedAvatars[msg.agentId]} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-white">
                        {msg.agentName?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-semibold" style={{ color: msg.agentColor }}>
                    {msg.agentName}
                  </span>
                  <span className="text-[10px] text-forge-text-muted">
                    {formatTime(msg.timestamp)}
                  </span>
                  {msg.trigger?.project && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-forge-bg border border-forge-border text-forge-text-muted">
                      {msg.trigger.project}
                    </span>
                  )}
                </div>
              )}
              <div
                className="pl-7 text-[11px] text-forge-text-secondary leading-relaxed"
                style={{ borderLeft: showHeader ? `2px solid ${msg.agentColor}20` : 'none', marginLeft: showHeader ? 0 : undefined }}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingAgentData && (
          <div className="flex items-center gap-2 mt-3 animate-pulse">
            <div
              className="w-5 h-5 rounded-full flex-shrink-0 overflow-hidden"
              style={{ backgroundColor: typingAgentData.color }}
            >
              {renderedAvatars[typingAgentData.id] ? (
                <img src={renderedAvatars[typingAgentData.id]} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-white">
                  {typingAgentData.name?.charAt(0)}
                </div>
              )}
            </div>
            <span className="text-xs" style={{ color: typingAgentData.color }}>
              {typingAgentData.name}
            </span>
            <span className="text-[10px] text-forge-text-muted">is typing</span>
            <span className="text-forge-text-muted animate-bounce">...</span>
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-2 right-4 w-7 h-7 rounded-full bg-forge-surface border border-forge-border
                     shadow-lg flex items-center justify-center text-xs text-forge-text-muted
                     hover:text-forge-accent hover:border-forge-accent/30 transition-colors"
          title="Scroll to bottom"
        >
          &#x2193;
        </button>
      )}
    </div>
  );
}
