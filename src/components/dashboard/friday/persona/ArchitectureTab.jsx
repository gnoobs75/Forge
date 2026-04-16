import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../../../../store/useStore';

/**
 * Architecture Overview — embeds the JARVIS-style Friday system schematic.
 * Sends persona takeover message to iframe when a non-Friday persona is active.
 */
export default function ArchitectureTab() {
  const [loadError, setLoadError] = useState(false);
  const iframeRef = useRef(null);
  const activePersona = useStore(s => s.activePersona);
  const theme = useMemo(() => activePersona.theme || {}, [activePersona.theme]);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    // Send persona takeover if not default Friday
    if (activePersona.name && activePersona.name !== 'F.R.I.D.A.Y.') {
      iframe.contentWindow.postMessage({
        type: 'persona-takeover',
        name: activePersona.name,
        color: theme.primary || activePersona.color,
        symbol: activePersona.symbol || null,
      }, '*');
    }
  }, [activePersona, theme]);

  if (loadError) return <FallbackArchitecture />;

  return (
    <iframe
      ref={iframeRef}
      src="docs/friday-architecture.html"
      title="Friday Architecture Schematic"
      className="w-full h-full border-0"
      style={{ background: '#06060C', display: 'block' }}
      onLoad={handleIframeLoad}
      onError={() => setLoadError(true)}
    />
  );
}

/**
 * Fallback: text-based architecture summary if iframe fails.
 */
function FallbackArchitecture() {
  const subsystems = [
    { name: 'Cortex', icon: '\u{1F9E0}', role: 'LLM Brain', desc: 'Dual-mode chat: TextWorker (AI SDK) for CLI, VoiceWorker (Grok WS) for browser. Enriches prompts with Genesis + SMARTS + Studio Context + Sensorium.' },
    { name: 'SignalBus', icon: '\u26A1', role: 'Event System', desc: '12 signal types + custom namespace. Error-isolated handlers. Connects all subsystems without tight coupling.' },
    { name: 'Memory', icon: '\u{1F4BE}', role: 'SQLite + FTS5', desc: 'KV store (scoped namespaces), conversation history (500 max), FTS5 semantic search, conversation indexing.' },
    { name: 'SMARTS', icon: '\u{1F4A1}', role: 'Knowledge Base', desc: 'Markdown files with YAML frontmatter. Session-based expiry. FTS5-indexed. Pinned + query-matched per turn.' },
    { name: 'Sensorium', icon: '\u{1F4E1}', role: 'Sensor Suite', desc: 'Dual-cadence polling (30s/5min). CPU, memory, disk, Docker, ports, git. Hysteresis alerts.' },
    { name: 'Genesis', icon: '\u{1F31F}', role: 'Identity', desc: 'Personality prompt from ~/.friday/GENESIS.md. Protected (chmod 600). Seed template for creation.' },
    { name: 'Vox', icon: '\u{1F5E3}', role: 'REST TTS', desc: 'Fire-and-forget via POST /v1/tts. 4 modes: off/on/whisper/flat. Emotional rewrite engine.' },
    { name: 'VoiceSession', icon: '\u{1F3A4}', role: 'Realtime WS', desc: 'Full-duplex audio via wss://api.x.ai/v1/realtime. Server VAD, barge-in, native agent.' },
    { name: 'BrainRouter', icon: '\u{1F500}', role: 'Dual-Brain', desc: 'Per-message routing: @prefix > mode > voice > keyword > continuity > length > default(Grok). Pure logic, no side effects.' },
    { name: 'ClaudeBrain', icon: '\u{1F9E0}', role: 'Deep Reasoning', desc: 'Claude Code CLI subprocess. 60s timeout, retry on empty, truncation safety. Falls back to Grok on error.' },
    { name: 'Studio Tools', icon: '\u{1F3AC}', role: 'HQ Integration', desc: '3 tools: query_studio (read HQ data), update_studio (write recs/activity), dispatch_agent (spawn visible terminal).' },
    { name: 'Arc Rhythm', icon: '\u{1F4AB}', role: 'Scheduler', desc: '60s cron ticker. Auto-pause after 5 failures. Fires prompts, tools, or protocols on schedule.' },
    { name: 'Directives', icon: '\u{1F4DC}', role: 'Autonomous Rules', desc: 'Signal-triggered automation. Dynamic subscriptions. Clearance-gated. No LLM involvement.' },
    { name: 'Deja Vu', icon: '\u{1F52E}', role: 'Recall', desc: 'FTS5 search across conversation summaries. Full transcript replay by session ID.' },
    { name: 'The Forge', icon: '\u{1F525}', role: 'Self-Improvement', desc: 'Friday-authored modules. Failed modules quarantined. Requires forge-modify clearance.' },
  ];

  return (
    <div className="p-4 overflow-y-auto h-full">
      <div className="text-center mb-6">
        <div className="text-forge-text-muted text-[13px] italic mb-2">
          Architecture schematic file not found. Showing summary view.
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {subsystems.map((s) => (
          <div key={s.name} className="rounded-lg border border-forge-border bg-forge-bg p-3 hover:border-fuchsia-500/30 transition-colors">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base">{s.icon}</span>
              <div>
                <div className="text-[13px] font-mono font-semibold text-forge-text-primary">{s.name}</div>
                <div className="text-[13px] text-forge-text-muted uppercase tracking-wider">{s.role}</div>
              </div>
            </div>
            <p className="text-[13px] text-forge-text-secondary leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
