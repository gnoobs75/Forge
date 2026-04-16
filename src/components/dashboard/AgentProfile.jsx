import React, { useState, useMemo, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { AGENT_ICONS, AGENT_INVOKE, AGENT_DETAILS } from './AgentDetailPanel';
import AgentAvatar3D from './AgentAvatar3D';
import AgentProfileStats from './AgentProfileStats';
import AgentProfileBrain from './AgentProfileBrain';
import AgentProfileAutomation from './AgentProfileAutomation';
import AgentProfileTokens from './AgentProfileTokens';
import AgentProfileKnowledge from './AgentProfileKnowledge';

const EFFORT_COLORS = {
  low: 'text-green-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
};

const IMPACT_COLORS = {
  low: 'text-orange-400',
  medium: 'text-yellow-400',
  high: 'text-green-400',
};

export default function AgentProfile({ agentId }) {
  const agent = useStore((s) => s.agents.find((a) => a.id === agentId));
  const allRecommendations = useStore((s) => s.recommendations);
  const agentAvatars = useStore((s) => s.agentAvatars);
  const setAgentAvatar = useStore((s) => s.setAgentAvatar);
  const fileInputRef = useRef(null);
  const recsRef = useRef(null);

  const scrollToRecs = () => {
    recsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const recommendations = useMemo(
    () => allRecommendations.filter((r) =>
      r.agent?.toLowerCase().replace(/\s+/g, '-') === agentId ||
      r.agentId === agentId
    ),
    [allRecommendations, agentId]
  );

  if (!agent) return null;

  const details = AGENT_DETAILS[agentId] || {};
  const invoke = AGENT_INVOKE[agentId] || `@${agent.name}`;
  const icon = AGENT_ICONS[agentId] || '';
  const avatar = agentAvatars[agentId];

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAgentAvatar(agentId, ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* Header */}
      <div className="card relative overflow-hidden">
        {/* Color accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
          style={{ backgroundColor: agent.color }}
        />

        <div className="flex items-start gap-5 pl-4">
          {/* Profile picture */}
          <div
            className="relative w-[120px] h-[120px] rounded-xl flex-shrink-0 cursor-pointer group overflow-hidden"
            style={{ backgroundColor: `${agent.color}20` }}
            onClick={() => fileInputRef.current?.click()}
          >
            {avatar ? (
              <img
                src={avatar}
                alt={agent.name}
                className="w-full h-full object-cover rounded-xl"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <AgentAvatar3D agentId={agentId} color={agent.color} size={120} />
              </div>
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center rounded-xl z-10">
              <svg className="w-6 h-6 text-white/80 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              <span className="text-[10px] text-white/70 font-medium">Change Photo</span>
            </div>
          </div>

          {/* Name + role */}
          <div className="flex-1 py-2">
            <h1 className="text-xl font-mono font-bold text-forge-text-primary">
              {agent.name}
            </h1>
            <div className="text-sm text-forge-text-secondary mt-0.5">{agent.role}</div>

            {/* Invoke badge */}
            <div className="mt-3 flex items-center gap-2">
              <code
                className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium"
                style={{ backgroundColor: `${agent.color}15`, color: agent.color }}
              >
                {invoke}
              </code>
              <span className="text-[10px] text-forge-text-muted">
                Use in terminal to invoke
              </span>
            </div>

            {/* Status */}
            <div className="mt-3 flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: agent.color }}
              />
              <span className="text-[11px] text-forge-text-secondary">Ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Dashboard */}
      <AgentProfileStats agentId={agentId} agentColor={agent.color} onRecsClick={scrollToRecs} />

      {/* Personality */}
      {details.personality && (
        <div className="card">
          <SectionHeader title="Personality" />
          <blockquote
            className="border-l-[3px] pl-4 py-2 text-sm text-forge-text-secondary leading-relaxed italic"
            style={{ borderColor: agent.color }}
          >
            "{details.personality}"
          </blockquote>
        </div>
      )}

      {/* Expertise */}
      {details.expertise && (
        <div className="card">
          <SectionHeader title="Expertise" />
          <div className="flex flex-wrap gap-2">
            {details.expertise.map((skill, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={{
                  backgroundColor: `${agent.color}08`,
                  borderColor: `${agent.color}25`,
                  color: agent.color,
                }}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Core Capabilities */}
      {details.capabilities && details.capabilities.length > 0 && (
        <div className="card">
          <SectionHeader title="Core Capabilities" />
          <div className="space-y-3">
            {details.capabilities.map((cap, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div
                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: agent.color }}
                />
                <div>
                  <div className="text-xs font-semibold text-forge-text-primary">{cap.name}</div>
                  <div className="text-[11px] text-forge-text-secondary leading-relaxed mt-0.5">
                    {cap.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workflow */}
      {details.workflow && details.workflow.length > 0 && (
        <div className="card">
          <SectionHeader title="Workflow" />
          <div className="space-y-2">
            {details.workflow.map((step, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: `${agent.color}15`, color: agent.color }}
                >
                  {i + 1}
                </div>
                <div className="text-xs text-forge-text-secondary leading-relaxed pt-0.5">
                  {step}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Try Asking */}
      {details.examples && (
        <div className="card">
          <SectionHeader title="Try Asking" />
          <div className="space-y-2">
            {details.examples.map((example, i) => (
              <CopyablePrompt
                key={i}
                invoke={invoke}
                example={example}
                color={agent.color}
              />
            ))}
          </div>
        </div>
      )}

      {/* Guardrails */}
      {details.guardrails && details.guardrails.length > 0 && (
        <div className="card">
          <SectionHeader title="What They Don't Do" />
          <div className="space-y-2">
            {details.guardrails.map((rule, i) => (
              <div key={i} className="flex gap-2.5 items-start">
                <span className="text-red-400/60 text-xs mt-0.5 flex-shrink-0">&times;</span>
                <div className="text-xs text-forge-text-muted leading-relaxed">
                  {rule}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent Brain — skill file viewer/editor */}
      <AgentProfileBrain agentId={agentId} agentColor={agent.color} />

      {/* Automation Role */}
      <AgentProfileAutomation agentId={agentId} agentColor={agent.color} />

      {/* Token Usage */}
      <AgentProfileTokens agentId={agentId} agentColor={agent.color} />

      {/* Knowledge Base */}
      <AgentProfileKnowledge agentId={agentId} agentColor={agent.color} />

      {/* Recent Recommendations */}
      <div className="card" ref={recsRef}>
        <SectionHeader title={`Recent Recommendations (${recommendations.length})`} />
        {recommendations.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-2xl mb-2 opacity-30">{icon}</div>
            <p className="text-xs text-forge-text-muted">No recommendations yet</p>
            <p className="text-[10px] text-forge-text-muted mt-1">
              Try: <code className="text-forge-accent-blue">{invoke} {details.examples?.[0] || 'give me advice'}</code>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.slice(0, 10).map((rec, i) => (
              <ExpandableRecCard key={i} rec={rec} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3">
      {title}
    </h2>
  );
}

function CopyablePrompt({ invoke, example, color }) {
  const [copied, setCopied] = useState(false);
  const fullText = `${invoke} ${example}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div
      onClick={handleCopy}
      className="px-3 py-2.5 rounded-lg bg-forge-bg/70 border border-forge-border/50 text-xs font-mono
                 cursor-pointer hover:border-forge-accent/30 hover:bg-forge-bg transition-all group flex items-center justify-between"
    >
      <div>
        <span style={{ color }}>{invoke}</span>{' '}
        <span className="text-forge-text-secondary group-hover:text-forge-text-primary transition-colors">
          {example}
        </span>
      </div>
      <span className={`text-[10px] transition-all flex-shrink-0 ml-3 ${
        copied
          ? 'text-green-400 opacity-100'
          : 'text-forge-text-muted opacity-0 group-hover:opacity-100'
      }`}>
        {copied ? 'Copied!' : 'copy'}
      </span>
    </div>
  );
}

function ExpandableRecCard({ rec }) {
  const [expanded, setExpanded] = useState(false);
  const updateStatus = useStore((s) => s.updateRecommendationStatus);
  const isResolved = rec.status === 'resolved' || rec.status === 'dismissed';

  const handleAction = (e, status) => {
    e.stopPropagation();
    updateStatus(rec, status);
  };

  return (
    <div
      className={`p-3 rounded-lg border transition-all cursor-pointer ${
        isResolved
          ? 'bg-forge-surface/40 border-forge-border/50 opacity-75'
          : 'bg-forge-bg/50 border-forge-border hover:border-forge-accent-blue/30'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Agent tag + status */}
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: `${rec.agentColor}15`,
                color: rec.agentColor,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: rec.agentColor }}
              />
              {rec.agent}
            </span>
            {rec.boldness && (
              <span className={`text-[10px] font-medium ${
                rec.boldness === 'wild' ? 'text-red-400' :
                rec.boldness === 'spicy' ? 'text-orange-400' :
                'text-green-400'
              }`}>
                {rec.boldness === 'wild' ? 'WILD' : rec.boldness === 'spicy' ? 'SPICY' : 'SAFE'}
              </span>
            )}
            {isResolved && (
              <span className="text-[10px] text-forge-text-muted">
                {rec.status === 'resolved' ? 'Resolved' : 'Dismissed'}
              </span>
            )}
          </div>

          <div className={`text-sm font-medium leading-tight ${isResolved ? 'text-forge-text-muted line-through' : 'text-forge-text-primary'}`}>
            {rec.title}
          </div>
          <div className="text-xs text-forge-text-secondary mt-1 leading-relaxed">{rec.summary}</div>
        </div>

        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span className="text-forge-text-muted text-xs">{expanded ? '\u25B2' : '\u25BC'}</span>
          {rec.approaches && (
            <span className="text-[9px] text-forge-text-muted">{rec.approaches.length} options</span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-2">
          {rec.approaches && rec.approaches.map((approach) => (
            <div
              key={approach.id}
              className={`p-3 rounded-lg border transition-all ${
                rec.recommended === approach.id
                  ? 'border-forge-accent/40 bg-forge-accent/5'
                  : 'border-forge-border/50 bg-forge-surface/30'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {rec.recommended === approach.id && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-forge-accent/20 text-forge-accent uppercase tracking-wider">
                      Recommended
                    </span>
                  )}
                  <span className="text-xs font-semibold text-forge-text-primary">
                    {approach.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {approach.effort && (
                    <span className={`text-[10px] ${EFFORT_COLORS[approach.effort] || 'text-forge-text-muted'}`}>
                      Effort: {approach.effort}
                    </span>
                  )}
                  {approach.impact && (
                    <span className={`text-[10px] ${IMPACT_COLORS[approach.impact] || 'text-forge-text-muted'}`}>
                      Impact: {approach.impact}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-forge-text-secondary leading-relaxed">
                {approach.description}
              </p>
              {approach.trade_offs && (
                <p className="text-[11px] text-forge-text-muted mt-1.5 italic leading-relaxed">
                  Trade-offs: {approach.trade_offs}
                </p>
              )}
            </div>
          ))}

          {rec.reasoning && (
            <div className="mt-3 p-3 rounded-lg border-l-2 border-forge-accent/30 bg-forge-surface/20">
              <div className="text-[10px] font-medium text-forge-accent uppercase tracking-wider mb-1">
                Why this approach
              </div>
              <p className="text-xs text-forge-text-secondary leading-relaxed">{rec.reasoning}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-3 pt-3 border-t border-forge-border/30 flex items-center gap-2">
            {!isResolved ? (
              <>
                <button
                  onClick={(e) => handleAction(e, 'resolved')}
                  className="px-3 py-1.5 text-[10px] font-medium rounded-lg bg-green-400/10 text-green-400
                             border border-green-400/20 hover:bg-green-400/20 transition-colors"
                >
                  Resolve
                </button>
                <button
                  onClick={(e) => handleAction(e, 'dismissed')}
                  className="px-3 py-1.5 text-[10px] font-medium rounded-lg text-forge-text-muted
                             border border-forge-border hover:text-forge-text-secondary hover:border-forge-text-muted/30 transition-colors"
                >
                  Dismiss
                </button>
              </>
            ) : (
              <button
                onClick={(e) => handleAction(e, 'active')}
                className="px-3 py-1.5 text-[10px] font-medium rounded-lg text-forge-text-muted
                           border border-forge-border hover:text-forge-text-secondary transition-colors"
              >
                Reopen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
