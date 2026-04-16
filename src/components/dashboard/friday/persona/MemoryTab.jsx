import React, { useState, useCallback, useEffect } from 'react';
import SettingControl, { SettingsCard, Toast } from './SettingControl';

const DEFAULTS = {
  maxConversations: 500,
  searchResultsLimit: 5,
  maxRecalledMessages: 50,
  maxMessageLength: 500,
  maxOutputLength: 8000,
  summarizerMinMessages: 4,
  summarizerMaxChars: 16000,
  curatorMinMessages: 4,
  curatorConfidenceCap: 0.7,
  curatorTimeout: 30,
};

export default function MemoryTab() {
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('forge-friday-memory');
      return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS };
    } catch { return { ...DEFAULTS }; }
  });
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [expandedConvo, setExpandedConvo] = useState(null);

  // Request conversation history from Friday server
  useEffect(() => {
    window.electronAPI?.friday?.send({
      type: 'query:conversations',
      id: crypto.randomUUID(),
      limit: 30,
    });

    const unsub = window.electronAPI?.friday?.onMessage?.((msg) => {
      if (msg.type === 'conversations:list') {
        setConversations(msg.conversations || []);
      }
    });
    return unsub;
  }, []);

  const update = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    localStorage.setItem('forge-friday-memory', JSON.stringify(config));
    window.electronAPI?.friday?.send({
      type: 'config:update',
      id: crypto.randomUUID(),
      section: 'memory',
      config,
    });
    setDirty(false);
    setToast('Memory & Recall settings saved');
  }, [config]);

  const handleReset = useCallback(() => {
    setConfig({ ...DEFAULTS });
    setDirty(true);
  }, []);

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* How It Works */}
      <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">
        <h4 className="text-[13px] font-mono font-semibold text-blue-400 uppercase tracking-wider mb-2">
          How Friday's Memory Works
        </h4>
        <p className="text-[13px] text-forge-text-secondary leading-relaxed">
          Friday has three layers of memory, each serving a different purpose:
        </p>
        <div className="mt-2 space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-[13px] text-blue-400 font-mono mt-0.5 flex-shrink-0">1.</span>
            <p className="text-[13px] text-forge-text-secondary leading-relaxed">
              <strong className="text-blue-300">Short-term (History Manager)</strong> — The current conversation.
              Like your working memory — it holds everything you've said so far, but has a token budget. When it fills up,
              old messages get summarized and trimmed. Configured in the Brain tab.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[13px] text-blue-400 font-mono mt-0.5 flex-shrink-0">2.</span>
            <p className="text-[13px] text-forge-text-secondary leading-relaxed">
              <strong className="text-blue-300">Long-term (SQLite + Deja Vu)</strong> — Past conversations.
              When a session ends, it gets saved with a summary. Friday can search these later using Deja Vu
              ("I remember we talked about..."). She keeps up to {config.maxConversations} conversations.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[13px] text-blue-400 font-mono mt-0.5 flex-shrink-0">3.</span>
            <p className="text-[13px] text-forge-text-secondary leading-relaxed">
              <strong className="text-blue-300">Distilled (SMARTS + Curator)</strong> — Extracted wisdom.
              The Curator watches conversations and extracts durable insights — things that would be lost if not saved.
              These become SMARTS entries (configured in the Knowledge tab).
            </p>
          </div>
        </div>
      </div>

      {/* Deja Vu (Recall) */}
      <SettingsCard
        title="Deja Vu — Conversation Recall"
        icon="&#x1F52E;"
        description="Settings for searching and replaying past conversations."
        onSave={handleSave}
        onReset={handleReset}
        dirty={dirty}
      >
        <SettingControl
          label="Max Conversations Stored"
          value={config.maxConversations}
          onChange={(v) => update('maxConversations', v)}
          type="number"
          min={50} max={5000} step={50}
          help="MAX_CONVERSATIONS — oldest conversations pruned first when limit is reached."
          barneyHelp="Total conversation history Friday keeps in her database. When this fills up, the oldest conversations get deleted to make room. At 500, you'd need hundreds of sessions before anything gets lost. Raise it if you're a power user, lower it to save disk space."
        />
        <SettingControl
          label="Default Search Results"
          value={config.searchResultsLimit}
          onChange={(v) => update('searchResultsLimit', v)}
          type="number"
          min={1} max={20} step={1}
          help="Default limit for Deja Vu search queries. User can override up to 20."
          barneyHelp="When Friday searches her past conversations ('recall search'), how many results does she show by default? More results = broader context but more text to read. She can go up to 20 if she needs more."
        />
        <SettingControl
          label="Max Recalled Messages"
          value={config.maxRecalledMessages}
          onChange={(v) => update('maxRecalledMessages', v)}
          type="number"
          min={10} max={200} step={10}
          help="MAX_RECALL_MESSAGES — when replaying a conversation, show this many messages."
          barneyHelp="When Friday replays a past conversation for you, how many messages does she show? The full transcript might be hundreds of messages — this caps it at a readable size. She shows the first N messages and truncates the rest."
        />
        <SettingControl
          label="Max Message Length"
          value={config.maxMessageLength}
          onChange={(v) => update('maxMessageLength', v)}
          type="number"
          min={100} max={2000} step={100}
          suffix="chars"
          help="MAX_MESSAGE_LENGTH — individual messages truncated beyond this in recall output."
          barneyHelp="When showing recalled messages, each individual message gets truncated to this length. Prevents one giant code block from eating all the output space. The full message is still in the database — this just limits the display."
        />
      </SettingsCard>

      {/* Summarizer */}
      <SettingsCard
        title="Summarizer"
        icon="&#x1F4DD;"
        description="Generates summaries of conversations for Deja Vu search."
        onSave={handleSave}
        onReset={handleReset}
        dirty={dirty}
      >
        <SettingControl
          label="Min Messages for Summary"
          value={config.summarizerMinMessages}
          onChange={(v) => update('summarizerMinMessages', v)}
          type="number"
          min={2} max={20} step={1}
          help="MIN_MESSAGES_FOR_SUMMARY — skip summarization for short conversations."
          barneyHelp="Don't bother summarizing conversations shorter than this. If you only exchanged 2-3 messages, a summary would be longer than the conversation itself. At 4, any meaningful exchange gets a summary."
        />
        <SettingControl
          label="Max Input Characters"
          value={config.summarizerMaxChars}
          onChange={(v) => update('summarizerMaxChars', v)}
          type="number"
          min={2000} max={64000} step={1000}
          suffix="chars"
          help="MAX_SUMMARIZER_CHARS — how much conversation text the summarizer model receives."
          barneyHelp="How much of a conversation the summarizer actually reads before writing its summary. Long conversations get truncated to this limit. At 16,000 chars, that's roughly the last 20-30 exchanges — enough to capture the key themes and decisions."
        />
      </SettingsCard>

      {/* Curator */}
      <SettingsCard
        title="Curator — Knowledge Extraction"
        icon="&#x1F9D0;"
        description="Autonomous extraction of durable insights from conversations."
        onSave={handleSave}
        onReset={handleReset}
        dirty={dirty}
      >
        <SettingControl
          label="Min Messages for Extraction"
          value={config.curatorMinMessages}
          onChange={(v) => update('curatorMinMessages', v)}
          type="number"
          min={2} max={20} step={1}
          help="MIN_MESSAGES_FOR_EXTRACTION — conversations shorter than this are skipped."
          barneyHelp="The Curator only tries to extract knowledge from conversations with at least this many messages. Quick 'hello/goodbye' exchanges have nothing worth saving. At 4 messages, you've had at least a meaningful back-and-forth."
        />
        <SettingControl
          label="Confidence Cap"
          value={config.curatorConfidenceCap}
          onChange={(v) => update('curatorConfidenceCap', v)}
          type="range"
          min={0.1} max={1.0} step={0.05}
          help="Maximum confidence score the Curator assigns to auto-extracted knowledge."
          barneyHelp="The highest confidence score the Curator can give to knowledge it extracts. Capped at 0.7 by default because auto-extracted knowledge isn't 100% reliable — it might misinterpret context or extract something slightly wrong. Manual knowledge (stuff you explicitly teach her) can have 1.0 confidence."
        />
        <SettingControl
          label="Extraction Timeout"
          value={config.curatorTimeout}
          onChange={(v) => update('curatorTimeout', v)}
          type="number"
          min={5} max={120} step={5}
          suffix="sec"
          help="Timeout for the Curator's LLM extraction call."
          barneyHelp="How long the Curator has to analyze a conversation and extract knowledge. This uses the fast model (cheaper, quicker), so 30 seconds is generous. If it times out, the knowledge just doesn't get extracted — no harm done."
        />
      </SettingsCard>

      {/* Conversation Timeline */}
      <div className="rounded-xl border border-forge-border bg-forge-surface/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-forge-border/50 bg-forge-bg/30">
          <div className="flex items-center gap-2">
            <span className="text-sm">&#x1F4C5;</span>
            <h3 className="text-[13px] font-mono font-semibold text-forge-text-primary uppercase tracking-wider">
              Deja Vu Timeline
            </h3>
            <span className="text-[13px] text-forge-text-muted">
              {conversations.length} sessions
            </span>
          </div>
        </div>

        <div className="max-h-[350px] overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-forge-text-muted text-[13px]">
              No conversation history available. Connect to Friday to browse past sessions.
            </div>
          ) : (
            <div className="divide-y divide-forge-border/30">
              {conversations.map((convo) => (
                <div
                  key={convo.id}
                  className="px-4 py-2.5 hover:bg-forge-bg/30 cursor-pointer transition-colors"
                  onClick={() => setExpandedConvo(expandedConvo === convo.id ? null : convo.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] text-forge-text-muted font-mono flex-shrink-0">
                        {new Date(convo.started_at).toLocaleDateString()} {new Date(convo.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[13px] text-forge-text-primary truncate">
                        {convo.summary?.slice(0, 80) || 'No summary'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[13px] text-forge-text-muted">
                        {convo.messageCount || '?'} msgs
                      </span>
                      {convo.model && (
                        <span className="text-[13px] text-forge-text-muted bg-forge-bg px-1.5 py-0.5 rounded">
                          {convo.model}
                        </span>
                      )}
                    </div>
                  </div>

                  {expandedConvo === convo.id && convo.summary && (
                    <div className="mt-2 pl-4 animate-fade-in">
                      <p className="text-[13px] text-forge-text-secondary leading-relaxed">
                        {convo.summary}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
