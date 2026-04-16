import React from 'react';
import { useStore } from '../../../store/useStore';

export default function DiscordHeader({ onOpenSettings }) {
  const discordStatus = useStore(s => s.discordStatus);
  const discordChatEnabled = useStore(s => s.discordChatEnabled);
  const setDiscordChatEnabled = useStore(s => s.setDiscordChatEnabled);

  const { connected, guild, channel } = discordStatus;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: '#1E1F22', backgroundColor: '#2B2D31' }}>
      {/* Channel icon + name */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-[#949BA4] text-lg font-light">#</span>
        <span className="text-sm font-medium text-[#F2F3F5] truncate">
          {connected ? (channel?.name || 'council-chat') : 'Not Connected'}
        </span>
        {connected && (
          <span className="text-[10px] text-[#949BA4] truncate hidden sm:inline">
            in {guild?.name || 'Unknown Server'}
          </span>
        )}
      </div>

      {/* Status + controls */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Connection dot */}
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: connected ? '#23A55A' : '#80848E' }}
          />
          <span className="text-[10px]" style={{ color: connected ? '#23A55A' : '#80848E' }}>
            {connected ? 'Connected' : 'Offline'}
          </span>
        </div>

        {/* Auto-chat toggle */}
        <button
          onClick={() => setDiscordChatEnabled(!discordChatEnabled)}
          className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
          style={{
            backgroundColor: discordChatEnabled ? '#23A55A20' : '#80848E20',
            color: discordChatEnabled ? '#23A55A' : '#80848E',
          }}
          title="Toggle auto-chat (agents post automatically on events)"
        >
          Auto {discordChatEnabled ? 'ON' : 'OFF'}
        </button>

        {/* Settings gear */}
        <button
          onClick={onOpenSettings}
          className="w-6 h-6 rounded flex items-center justify-center text-[#B5BAC1] hover:text-[#DBDEE1] transition-colors"
          title="Discord Settings"
        >
          {'\u2699'}
        </button>
      </div>
    </div>
  );
}
