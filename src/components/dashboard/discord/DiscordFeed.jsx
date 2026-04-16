import React, { useRef, useEffect, useState, useMemo } from 'react';

// Agent color lookup for left border accent
const AGENT_COLORS = {
  'Market Analyst': '#3B82F6',
  'Store Optimizer': '#22C55E',
  'Growth Strategist': '#F97316',
  'Brand Director': '#8B5CF6',
  'Content Producer': '#EC4899',
  'Community Manager': '#06B6D4',
  'QA Advisor': '#EF4444',
  'Studio Producer': '#EAB308',
  'Monetization Strategist': '#10B981',
  'Player Psychologist': '#7C3AED',
  'Art Director': '#F59E0B',
  'Creative Thinker': '#FF6B6B',
  'Tech Architect': '#0EA5E9',
};

function getAgentColor(displayName) {
  return AGENT_COLORS[displayName] || null;
}

function formatTime(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return `Today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Group consecutive messages from the same author within 7 minutes
function groupMessages(messages) {
  const groups = [];
  for (const msg of messages) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup) {
      const lastMsg = lastGroup.messages[lastGroup.messages.length - 1];
      const timeDiff = new Date(msg.timestamp) - new Date(lastMsg.timestamp);
      if (lastMsg.author.id === msg.author.id && timeDiff < 7 * 60 * 1000) {
        lastGroup.messages.push(msg);
        continue;
      }
    }
    groups.push({
      author: msg.author,
      timestamp: msg.timestamp,
      messages: [msg],
    });
  }
  return groups;
}

export default function DiscordFeed({ messages, loading }) {
  const feedRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const groups = useMemo(() => groupMessages(messages), [messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages.length, autoScroll]);

  const handleScroll = () => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 60;
    setAutoScroll(nearBottom);
    setShowScrollBtn(!nearBottom);
  };

  const scrollToBottom = () => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
      setAutoScroll(true);
      setShowScrollBtn(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: '#313338' }}>
        <div className="text-center space-y-2">
          <div className="w-6 h-6 border-2 border-[#5865F2] border-t-transparent rounded-full animate-spin mx-auto" />
          <span className="text-xs text-[#B5BAC1]">Loading messages...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-2 space-y-0"
        style={{ backgroundColor: '#313338' }}
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <span className="text-2xl">&#x1F44B;</span>
              <p className="text-sm text-[#B5BAC1]">Welcome to #council-chat</p>
              <p className="text-xs text-[#949BA4]">Agent messages will appear here</p>
            </div>
          </div>
        )}

        {groups.map((group, gi) => {
          const agentColor = getAgentColor(group.author.displayName);
          return (
            <div
              key={`${group.author.id}-${group.timestamp}-${gi}`}
              className="py-0.5 pl-0 pr-2 hover:bg-[#2E3035] rounded-sm group/msg"
              style={{ borderLeft: agentColor ? `3px solid ${agentColor}20` : 'none' }}
            >
              {/* First message in group: show avatar + name + timestamp */}
              <div className="flex items-start gap-3 pt-1">
                <img
                  src={group.author.avatar}
                  alt=""
                  className="w-10 h-10 rounded-full flex-shrink-0 mt-0.5"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-sm font-medium hover:underline cursor-pointer"
                      style={{ color: agentColor || '#F2F3F5' }}
                    >
                      {group.author.displayName}
                    </span>
                    {group.author.bot && (
                      <span className="px-1 py-0 text-[10px] font-medium rounded bg-[#5865F2] text-white leading-4">
                        BOT
                      </span>
                    )}
                    <span className="text-[11px] text-[#949BA4]">
                      {formatTime(group.timestamp)}
                    </span>
                  </div>
                  {/* Render all messages in this group */}
                  {group.messages.map((msg, mi) => (
                    <div key={msg.id} className={mi > 0 ? 'mt-0.5' : ''}>
                      <p className="text-sm text-[#DBDEE1] leading-relaxed break-words whitespace-pre-wrap">
                        {msg.content}
                      </p>
                      {/* Embeds */}
                      {msg.embeds?.map((embed, ei) => (
                        <div
                          key={ei}
                          className="mt-1 p-2 rounded border-l-4 max-w-md"
                          style={{
                            backgroundColor: '#2B2D31',
                            borderColor: embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : '#4F545C',
                          }}
                        >
                          {embed.title && (
                            <div className="text-sm font-medium text-[#00AFF4]">{embed.title}</div>
                          )}
                          {embed.description && (
                            <div className="text-xs text-[#DBDEE1] mt-0.5">{embed.description}</div>
                          )}
                          {embed.image && (
                            <img src={embed.image} alt="" className="mt-1 rounded max-h-48" />
                          )}
                        </div>
                      ))}
                      {/* Attachments */}
                      {msg.attachments?.map((att, ai) => (
                        <div key={ai} className="mt-1">
                          {att.contentType?.startsWith('image/') ? (
                            <img src={att.url} alt={att.name} className="rounded max-h-64" />
                          ) : (
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#00AFF4] hover:underline"
                            >
                              {att.name} ({(att.size / 1024).toFixed(1)}KB)
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-medium
                     bg-[#5865F2] text-white shadow-lg hover:bg-[#4752C4] transition-colors"
        >
          Scroll to Bottom
        </button>
      )}
    </div>
  );
}
