import React, { useState, useCallback, useMemo } from 'react';
import SettingControl, { SettingsCard, Toast } from './SettingControl';
import { useStore } from '../../../../store/useStore';

const DEFAULTS = {
  maxOutputTokens: 12288,
  maxToolIterations: 10,
  inferenceTimeout: 120,
  historyTokenBudget: 128000,
  minCompactionMessages: 4,
};

const BRAIN_DEFAULTS = {
  mode: 'auto',
  shortQueryThreshold: 20,
  claudeKeywords: 'analyze, compare, explain why, review, design, plan, evaluate, summarize, assess, recommend, critique, break down, deep dive, what do you think, walk me through',
  voiceClaudeEnabled: true,
  showBrainBadge: true,
};

const CLAUDE_DEFAULTS = {
  claudePath: 'claude',
  claudeTimeout: 60,
  maxOutputChars: 32000,
};

const DISPATCH_DEFAULTS = {
  maxConcurrent: 3,
  dispatchTimeout: 120,
};

export default function BrainTab() {
  const activePersona = useStore(s => s.activePersona);
  const theme = useMemo(() => activePersona.theme || {
    primary: '#D946EF', secondary: '#7E22CE', accent: '#F0ABFC',
  }, [activePersona.theme]);

  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('forge-friday-cortex');
      return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS };
    } catch { return { ...DEFAULTS }; }
  });
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState(null);

  // Brain Routing state
  const [brainConfig, setBrainConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('forge-friday-brain');
      return saved ? { ...BRAIN_DEFAULTS, ...JSON.parse(saved) } : { ...BRAIN_DEFAULTS };
    } catch { return { ...BRAIN_DEFAULTS }; }
  });
  const [brainDirty, setBrainDirty] = useState(false);

  const updateBrain = useCallback((key, value) => {
    setBrainConfig(prev => ({ ...prev, [key]: value }));
    setBrainDirty(true);
  }, []);

  const handleBrainSave = useCallback(() => {
    localStorage.setItem('forge-friday-brain', JSON.stringify(brainConfig));
    window.electronAPI?.friday?.send({
      type: 'config:update', id: crypto.randomUUID(),
      section: 'brain', config: brainConfig,
    });
    setBrainDirty(false);
    setToast('Brain routing settings saved');
  }, [brainConfig]);

  const handleBrainReset = useCallback(() => {
    setBrainConfig({ ...BRAIN_DEFAULTS });
    setBrainDirty(true);
  }, []);

  // Claude Brain state
  const [claudeConfig, setClaudeConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('forge-friday-claude');
      return saved ? { ...CLAUDE_DEFAULTS, ...JSON.parse(saved) } : { ...CLAUDE_DEFAULTS };
    } catch { return { ...CLAUDE_DEFAULTS }; }
  });
  const [claudeDirty, setClaudeDirty] = useState(false);

  const updateClaude = useCallback((key, value) => {
    setClaudeConfig(prev => ({ ...prev, [key]: value }));
    setClaudeDirty(true);
  }, []);

  const handleClaudeSave = useCallback(() => {
    localStorage.setItem('forge-friday-claude', JSON.stringify(claudeConfig));
    window.electronAPI?.friday?.send({
      type: 'config:update', id: crypto.randomUUID(),
      section: 'claude-brain', config: claudeConfig,
    });
    setClaudeDirty(false);
    setToast('Claude Brain settings saved');
  }, [claudeConfig]);

  const handleClaudeReset = useCallback(() => {
    setClaudeConfig({ ...CLAUDE_DEFAULTS });
    setClaudeDirty(true);
  }, []);

  // Dispatch state
  const [dispatchConfig, setDispatchConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('forge-friday-dispatch');
      return saved ? { ...DISPATCH_DEFAULTS, ...JSON.parse(saved) } : { ...DISPATCH_DEFAULTS };
    } catch { return { ...DISPATCH_DEFAULTS }; }
  });
  const [dispatchDirty, setDispatchDirty] = useState(false);

  const updateDispatch = useCallback((key, value) => {
    setDispatchConfig(prev => ({ ...prev, [key]: value }));
    setDispatchDirty(true);
  }, []);

  const handleDispatchSave = useCallback(() => {
    localStorage.setItem('forge-friday-dispatch', JSON.stringify(dispatchConfig));
    window.electronAPI?.friday?.send({
      type: 'config:update', id: crypto.randomUUID(),
      section: 'dispatch', config: dispatchConfig,
    });
    setDispatchDirty(false);
    setToast('Dispatch settings saved');
  }, [dispatchConfig]);

  const handleDispatchReset = useCallback(() => {
    setDispatchConfig({ ...DISPATCH_DEFAULTS });
    setDispatchDirty(true);
  }, []);

  const update = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    localStorage.setItem('forge-friday-cortex', JSON.stringify(config));
    window.electronAPI?.friday?.send({
      type: 'config:update',
      id: crypto.randomUUID(),
      section: 'cortex',
      config,
    });
    setDirty(false);
    setToast('Cortex settings saved');
  }, [config]);

  const handleReset = useCallback(() => {
    setConfig({ ...DEFAULTS });
    setDirty(true);
  }, []);

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* How It Works */}
      <div className="rounded-xl border p-4"
        style={{ borderColor: `${theme.primary}26`, backgroundColor: `${theme.primary}0D` }}>
        <h4 className="text-[13px] font-mono font-semibold uppercase tracking-wider mb-2"
          style={{ color: theme.primary }}>
          How Friday's Brain Works
        </h4>
        <p className="text-[13px] text-forge-text-secondary leading-relaxed">
          The <strong style={{ color: theme.accent }}>Cortex</strong> is Friday's thinking engine.
          When you talk to her, your message goes through a pipeline: your words get wrapped with her
          identity (Genesis), her knowledge (SMARTS), live system data (Sensorium), and studio context
          (your projects). This enriched prompt goes to the AI model, which thinks and responds.
        </p>
        <p className="text-[13px] text-forge-text-secondary leading-relaxed mt-2">
          She has <strong style={{ color: theme.accent }}>two brains</strong>: <strong className="text-amber-400">Grok</strong> for
          fast responses and voice (native speech via WebSocket), and <strong className="text-purple-400">Claude</strong> for
          deep reasoning (CLI subprocess). The <strong style={{ color: theme.accent }}>BrainRouter</strong> automatically
          decides which brain handles each message based on keywords, message length, and mode.
          Both share the same knowledge, tools, and personality.
        </p>
      </div>

      <SettingsCard
        title="Response Generation"
        icon="&#x1F9E0;"
        description="Controls how Friday generates responses — length, depth, and time limits."
        onSave={handleSave}
        onReset={handleReset}
        dirty={dirty}
      >
        <SettingControl
          label="Max Output Tokens"
          value={config.maxOutputTokens}
          onChange={(v) => update('maxOutputTokens', v)}
          type="number"
          min={256} max={32768} step={256}
          suffix="tokens"
          help="maxTokens parameter passed to the AI model for response generation."
          barneyHelp="How many words Friday can use in a single response. A token is roughly 3/4 of a word. At 12,288 tokens, she can write about 9,000 words — more than enough for detailed analysis. Crank it up if her responses feel cut off, lower it if she's too verbose."
        />
        <SettingControl
          label="Max Tool Iterations"
          value={config.maxToolIterations}
          onChange={(v) => update('maxToolIterations', v)}
          type="number"
          min={1} max={50} step={1}
          help="Maximum agentic tool-calling loops per message (stepCountIs limit)."
          barneyHelp="When Friday needs to DO things (read files, run commands, check git), each action is one 'iteration.' Think of it like letting her make 10 phone calls before she has to stop and report back. Higher = she can chain more complex multi-step work. Lower = she answers faster but can't dig as deep."
        />
        <SettingControl
          label="Inference Timeout"
          value={config.inferenceTimeout}
          onChange={(v) => update('inferenceTimeout', v)}
          type="number"
          min={10} max={600} step={5}
          suffix="sec"
          help="AbortController timeout for AI inference calls. Default 120s (2 minutes)."
          barneyHelp="How long to wait if Friday's brain freezes mid-thought before pulling the plug. If she's doing complex reasoning with lots of tool calls, she might need the full 2 minutes. If she regularly times out, something's probably stuck — don't just raise this blindly."
        />
      </SettingsCard>

      <SettingsCard
        title="Conversation Memory"
        icon="&#x1F4AC;"
        description="Controls how much of the current conversation Friday remembers."
        onSave={handleSave}
        onReset={handleReset}
        dirty={dirty}
      >
        <SettingControl
          label="History Token Budget"
          value={config.historyTokenBudget}
          onChange={(v) => update('historyTokenBudget', v)}
          type="number"
          min={8000} max={256000} step={1000}
          suffix="tokens"
          help="Maximum tokens for conversation history. Auto-compacts when exceeded, keeping 30% of most recent messages."
          barneyHelp="The size of Friday's short-term memory for your current conversation. At 128k tokens, she can remember roughly 50-100 back-and-forth exchanges before she starts 'forgetting' older messages. When the budget fills up, she automatically summarizes and trims old messages to make room — always keeping at least 4 messages."
        />
        <SettingControl
          label="Min Messages Before Compaction"
          value={config.minCompactionMessages}
          onChange={(v) => update('minCompactionMessages', v)}
          type="number"
          min={2} max={20} step={1}
          help="History compaction won't run if conversation has fewer than this many messages."
          barneyHelp="The absolute minimum number of messages Friday will never throw away, even when her memory is full. Think of it as a safety net — she'll always remember at least the last 4 things you talked about, no matter what."
        />
      </SettingsCard>

      {/* Brain Routing */}
      <SettingsCard
        title="Brain Routing"
        icon="&#x1F500;"
        description="Controls which brain (Grok or Claude) handles each message."
        onSave={handleBrainSave}
        onReset={handleBrainReset}
        dirty={brainDirty}
      >
        <div className="mb-3">
          <label className="text-[13px] font-mono text-forge-text-secondary mb-1.5 block">Brain Mode</label>
          <div className="flex gap-1">
            {['auto', 'grok', 'claude'].map(mode => (
              <button key={mode} onClick={() => updateBrain('mode', mode)}
                className={`px-3 py-1 text-[13px] font-mono rounded-md border transition-colors ${
                  brainConfig.mode !== mode
                    ? 'border-forge-border text-forge-text-muted hover:border-forge-text-secondary'
                    : ''
                }`}
                style={brainConfig.mode === mode ? {
                  borderColor: theme.primary,
                  backgroundColor: `${theme.primary}33`,
                  color: theme.accent,
                } : {}}
              >{mode.charAt(0).toUpperCase() + mode.slice(1)}</button>
            ))}
          </div>
          <p className="text-[13px] text-forge-text-muted mt-1">Auto = smart routing based on keywords and message length. Grok/Claude = force all messages to one brain.</p>
        </div>
        <SettingControl label="Short Query Threshold" value={brainConfig.shortQueryThreshold}
          onChange={(v) => updateBrain('shortQueryThreshold', v)} type="number"
          min={5} max={100} step={5} suffix="words"
          help="Messages shorter than this go to Grok (fast path)."
          barneyHelp="If your message is shorter than this many words, Friday routes it to Grok for a quick answer instead of waking up Claude for heavy thinking."
        />
        <SettingControl label="Claude Keywords" value={brainConfig.claudeKeywords}
          onChange={(v) => updateBrain('claudeKeywords', v)} type="textarea" rows={3}
          help="Comma-separated trigger words. If a message contains any of these AND is 5+ words, route to Claude."
          barneyHelp="These are the magic words that tell Friday 'this needs deep thinking.' When you say 'analyze my monetization' or 'walk me through the code,' the keyword triggers Claude instead of Grok."
        />
        <SettingControl label="Voice Claude Enabled" value={brainConfig.voiceClaudeEnabled}
          onChange={(v) => updateBrain('voiceClaudeEnabled', v)} type="toggle"
          help="Allow Claude routing during Push-to-Talk voice mode."
          barneyHelp="When talking to Friday by voice, should she ever route to Claude? Claude takes longer but gives deeper answers. If disabled, all voice stays on Grok for speed."
        />
        <SettingControl label="Show Brain Badge" value={brainConfig.showBrainBadge}
          onChange={(v) => updateBrain('showBrainBadge', v)} type="toggle"
          help="Display which brain handled each message in the transcript."
          barneyHelp="Shows a small badge on each message — either 'Grok' or 'Claude' — so you can see which brain answered."
        />
      </SettingsCard>

      {/* Claude Brain */}
      <SettingsCard
        title="Claude Brain"
        icon="&#x1F9E0;"
        description="Configure the Claude Code CLI subprocess used for complex reasoning."
        onSave={handleClaudeSave}
        onReset={handleClaudeReset}
        dirty={claudeDirty}
      >
        <SettingControl label="Claude CLI Path" value={claudeConfig.claudePath}
          onChange={(v) => updateClaude('claudePath', v)} type="text"
          help="Path to the claude CLI executable."
          barneyHelp="Where to find the Claude Code CLI on your system. Usually just 'claude' if it's in your PATH."
        />
        <SettingControl label="Claude Timeout" value={claudeConfig.claudeTimeout}
          onChange={(v) => updateClaude('claudeTimeout', v)} type="number"
          min={10} max={300} step={5} suffix="sec"
          help="Maximum time for a Claude subprocess to respond before being killed."
          barneyHelp="How long Friday waits for Claude to finish thinking before giving up. Complex analysis might need 30-60 seconds."
        />
        <SettingControl label="Max Output Characters" value={claudeConfig.maxOutputChars}
          onChange={(v) => updateClaude('maxOutputChars', v)} type="number"
          min={1000} max={100000} step={1000} suffix="chars"
          help="Truncate Claude responses longer than this. Voice mode auto-caps at 2000."
          barneyHelp="The maximum length of Claude's response. In voice mode, capped at 2,000 chars so Grok doesn't read you a novel."
        />
      </SettingsCard>

      {/* Agent Dispatch */}
      <SettingsCard
        title="Agent Dispatch"
        icon="&#x1F916;"
        description="Controls how Friday dispatches Forge agents for background work."
        onSave={handleDispatchSave}
        onReset={handleDispatchReset}
        dirty={dispatchDirty}
      >
        <SettingControl label="Max Concurrent Dispatches" value={dispatchConfig.maxConcurrent}
          onChange={(v) => updateDispatch('maxConcurrent', v)} type="number"
          min={1} max={10} step={1}
          help="Maximum simultaneous agent dispatches."
          barneyHelp="How many agents Friday can run at once. Each is a separate Claude Code session. 3 is a good default."
        />
        <SettingControl label="Dispatch Timeout" value={dispatchConfig.dispatchTimeout}
          onChange={(v) => updateDispatch('dispatchTimeout', v)} type="number"
          min={30} max={600} step={10} suffix="sec"
          help="Maximum time for an agent dispatch to complete before being killed."
          barneyHelp="How long to wait for an agent to finish. Most tasks take 30-120 seconds."
        />
      </SettingsCard>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
