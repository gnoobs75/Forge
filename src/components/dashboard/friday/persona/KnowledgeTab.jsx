import React, { useState, useCallback, useEffect } from 'react';
import SettingControl, { SettingsCard, Toast } from './SettingControl';

const DEFAULTS = {
  maxPerMessage: 5,
  minConfidence: 0.5,
  tokenBudget: 24000,
  sessionAgeExpiry: 5,
  maxInjectionChars: 4000,
};

export default function KnowledgeTab() {
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('forge-friday-smarts');
      return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS };
    } catch { return { ...DEFAULTS }; }
  });
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState(null);
  const [smartsEntries, setSmartsEntries] = useState([]);
  const [smartsFilter, setSmartsFilter] = useState('');

  // Request SMARTS entries from Friday server
  useEffect(() => {
    const requestSmarts = () => {
      window.electronAPI?.friday?.send({
        type: 'query:smarts',
        id: crypto.randomUUID(),
      });
    };
    requestSmarts();

    // Listen for smarts data response
    const unsub = window.electronAPI?.friday?.onMessage?.((msg) => {
      if (msg.type === 'smarts:list') {
        setSmartsEntries(msg.entries || []);
      }
    });
    return unsub;
  }, []);

  const update = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    localStorage.setItem('forge-friday-smarts', JSON.stringify(config));
    window.electronAPI?.friday?.send({
      type: 'config:update',
      id: crypto.randomUUID(),
      section: 'smarts',
      config,
    });
    setDirty(false);
    setToast('SMARTS settings saved');
  }, [config]);

  const handleReset = useCallback(() => {
    setConfig({ ...DEFAULTS });
    setDirty(true);
  }, []);

  const filteredEntries = smartsEntries.filter((e) => {
    if (!smartsFilter) return true;
    const q = smartsFilter.toLowerCase();
    return (
      e.name?.toLowerCase().includes(q) ||
      e.domain?.toLowerCase().includes(q) ||
      e.content?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* How It Works */}
      <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/5 p-4">
        <h4 className="text-[13px] font-mono font-semibold text-cyan-400 uppercase tracking-wider mb-2">
          How Friday's Knowledge Works
        </h4>
        <p className="text-[13px] text-forge-text-secondary leading-relaxed">
          <strong className="text-cyan-300">SMARTS</strong> is Friday's long-term knowledge base — things she's learned
          that don't live in code or docs. Each piece of knowledge is a Markdown file with metadata (domain, confidence,
          tags). Every time you talk to her, she searches her SMARTS for relevant knowledge and injects it into her brain
          alongside your message.
        </p>
        <p className="text-[13px] text-forge-text-secondary leading-relaxed mt-2">
          Knowledge comes from two sources: <strong className="text-cyan-300">Manual</strong> entries (you or a dev wrote them,
          they never expire) and <strong className="text-cyan-300">Auto</strong> entries (the Curator extracted them from
          conversations, they expire after a set number of restarts). The search uses FTS5 (Full-Text Search) to find
          the most relevant entries and injects them into her prompt.
        </p>
      </div>

      <SettingsCard
        title="Knowledge Injection"
        icon="&#x1F4A1;"
        description="How much knowledge Friday pulls from her brain per message."
        onSave={handleSave}
        onReset={handleReset}
        dirty={dirty}
      >
        <SettingControl
          label="Max Entries Per Message"
          value={config.maxPerMessage}
          onChange={(v) => update('maxPerMessage', v)}
          type="number"
          min={1} max={20} step={1}
          help="Maximum SMARTS entries (pinned + FTS5-matched) injected per turn."
          barneyHelp="How many knowledge nuggets Friday pulls from her brain each time you talk to her. She searches for the most relevant ones using full-text search. More entries = more context but slower and costs more tokens. 5 is a sweet spot — enough to be informed without overloading."
        />
        <SettingControl
          label="Minimum Confidence"
          value={config.minConfidence}
          onChange={(v) => update('minConfidence', v)}
          type="range"
          min={0} max={1} step={0.05}
          help="Entries below this confidence score are excluded from injection. Scale: 0.0 (trust everything) to 1.0 (trust nothing)."
          barneyHelp="Friday's quality filter for knowledge. Each piece of knowledge has a confidence score (0 to 1). Below this threshold, she won't use it — even if it matches your query. Set low (0.3) if you want her to consider shaky knowledge, set high (0.8) if you only want rock-solid facts."
        />
        <SettingControl
          label="Token Budget"
          value={config.tokenBudget}
          onChange={(v) => update('tokenBudget', v)}
          type="number"
          min={1000} max={64000} step={1000}
          suffix="tokens"
          help="Total token budget allocated for SMARTS knowledge injection per message."
          barneyHelp="How much brain space Friday dedicates to recalled knowledge per message. This is separate from conversation history — it's the 'textbook' she consults. At 24k tokens, she can inject roughly 18,000 words of knowledge. That's a lot of context."
        />
      </SettingsCard>

      <SettingsCard
        title="Knowledge Lifecycle"
        icon="&#x23F3;"
        description="How long knowledge persists and hard limits on injection size."
        onSave={handleSave}
        onReset={handleReset}
        dirty={dirty}
      >
        <SettingControl
          label="Session Age Expiry"
          value={config.sessionAgeExpiry}
          onChange={(v) => update('sessionAgeExpiry', v)}
          type="number"
          min={1} max={50} step={1}
          suffix="sessions"
          help="Auto-learned knowledge (source: 'auto') expires after this many boot cycles. Manual entries never expire."
          barneyHelp="How many times Friday can restart before auto-learned knowledge gets pruned. Every time Friday boots up, a session counter increments. Knowledge the Curator auto-extracted from conversations will be deleted after this many boots — the idea being if it was important, it'll come up again. Manual knowledge (stuff you explicitly taught her) is permanent."
        />
        <SettingControl
          label="Max Injection Characters"
          value={config.maxInjectionChars}
          onChange={(v) => update('maxInjectionChars', v)}
          type="number"
          min={500} max={16000} step={500}
          suffix="chars"
          help="Hard character cap on the total Knowledge section injected into system prompt (MAX_SMARTS_CHARS in Cortex)."
          barneyHelp="Even if Friday finds tons of relevant knowledge, this is the absolute hard cap on how many characters of it actually make it into her prompt. Think of it as the size of her 'cheat sheet' — she picks the best entries until this limit is hit. At 4,000 chars, that's roughly 2-3 substantial knowledge entries."
        />
      </SettingsCard>

      {/* SMARTS Browser */}
      <div className="rounded-xl border border-forge-border bg-forge-surface/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-forge-border/50 bg-forge-bg/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">&#x1F4DA;</span>
              <h3 className="text-[13px] font-mono font-semibold text-forge-text-primary uppercase tracking-wider">
                SMARTS Browser
              </h3>
              <span className="text-[13px] text-forge-text-muted">
                {smartsEntries.length} entries
              </span>
            </div>
            <input
              type="text"
              placeholder="Filter by name, domain..."
              value={smartsFilter}
              onChange={(e) => setSmartsFilter(e.target.value)}
              className="bg-forge-bg border border-forge-border rounded-lg px-2.5 py-1 text-[13px] text-forge-text-primary
                         placeholder:text-forge-text-muted focus:outline-none focus:border-fuchsia-500/50 w-48"
            />
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {filteredEntries.length === 0 ? (
            <div className="p-6 text-center text-forge-text-muted text-[13px]">
              {smartsEntries.length === 0
                ? 'No SMARTS entries loaded. Connect to Friday to browse her knowledge base.'
                : 'No entries match your filter.'
              }
            </div>
          ) : (
            <div className="divide-y divide-forge-border/30">
              {filteredEntries.map((entry, i) => (
                <SmartEntry key={entry.name || i} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function SmartEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);

  const confidenceColor = entry.confidence >= 0.7
    ? 'text-green-400' : entry.confidence >= 0.4
    ? 'text-yellow-400' : 'text-red-400';

  return (
    <div
      className="px-4 py-2.5 hover:bg-forge-bg/30 cursor-pointer transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[13px] font-mono px-1.5 py-0.5 rounded border ${
            entry.source === 'manual'
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
              : 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400'
          }`}>
            {entry.source || 'auto'}
          </span>
          <span className="text-[13px] font-medium text-forge-text-primary truncate">
            {entry.name}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {entry.domain && (
            <span className="text-[13px] text-forge-text-muted bg-forge-bg px-2 py-0.5 rounded">
              {entry.domain}
            </span>
          )}
          <span className={`text-[13px] font-mono ${confidenceColor}`}>
            {(entry.confidence * 100).toFixed(0)}%
          </span>
          {entry.sessionId != null && (
            <span className="text-[13px] text-forge-text-muted">
              s{entry.sessionId}
            </span>
          )}
          <span className="text-[13px] text-forge-text-muted">{expanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 pl-8 animate-fade-in">
          {entry.tags?.length > 0 && (
            <div className="flex gap-1 mb-1.5 flex-wrap">
              {entry.tags.map((tag) => (
                <span key={tag} className="text-[13px] px-1.5 py-0.5 rounded bg-forge-bg border border-forge-border text-forge-text-muted">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <pre className="text-[13px] text-forge-text-secondary whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto">
            {entry.content?.slice(0, 1000) || 'No content'}
            {entry.content?.length > 1000 ? '...' : ''}
          </pre>
        </div>
      )}
    </div>
  );
}
