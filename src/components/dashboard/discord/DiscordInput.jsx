import React, { useState, useRef } from 'react';

export default function DiscordInput({ connected, channelName }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  const handleSend = async () => {
    if (!text.trim() || !connected || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);

    try {
      const result = await window.electronAPI?.discord?.sendMessage(content);
      if (!result?.ok) {
        console.warn('[DiscordInput] Send failed:', result?.error);
      }
    } catch (err) {
      console.warn('[DiscordInput] Send error:', err);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-4 pb-4 pt-1" style={{ backgroundColor: '#313338' }}>
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2.5"
        style={{
          backgroundColor: '#383A40',
          opacity: connected ? 1 : 0.5,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!connected || sending}
          placeholder={connected ? `Message #${channelName || 'council-chat'}` : 'Connect to Discord to send messages'}
          className="flex-1 bg-transparent text-sm text-[#DBDEE1] placeholder-[#6D6F78] focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || !connected || sending}
          className="w-7 h-7 rounded flex items-center justify-center transition-colors disabled:opacity-30"
          style={{ color: text.trim() ? '#5865F2' : '#6D6F78' }}
          title="Send message"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.5 1.5L14.5 8L1.5 14.5V9.5L10.5 8L1.5 6.5V1.5Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
