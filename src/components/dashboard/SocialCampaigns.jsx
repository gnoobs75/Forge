import React, { useState, useEffect, useCallback } from 'react';
import { fireCampaign, getDefaultCampaigns, POST_STYLES } from '../../utils/socialCampaignEngine';
import { AGENT_PERSONALITIES } from '../../utils/agentPersonalities';

const STYLE_LABELS = { blog: 'Blog Post', thread: 'Social Thread', interview: 'Interview Q&A' };

export default function SocialCampaigns({ slug, project, campaigns, onUpdateCampaigns }) {
  const [firing, setFiring] = useState(null); // campaignId being fired
  const [lastResult, setLastResult] = useState(null);
  const [expandedHistory, setExpandedHistory] = useState(null);
  const [toast, setToast] = useState(null);

  const projectName = project?.name || slug;

  // Initialize default campaigns if empty
  useEffect(() => {
    if (!campaigns || campaigns.length === 0) {
      onUpdateCampaigns(getDefaultCampaigns());
    }
  }, []);

  // Listen for scheduled campaign-due events from Electron timer
  useEffect(() => {
    const social = window.electronAPI?.social;
    if (!social?.onCampaignDue) return;

    const cleanup = social.onCampaignDue(({ project: projSlug, campaignId }) => {
      if (projSlug !== slug) return;
      console.log(`[SocialCampaigns] Timer fired for ${campaignId}`);
      handleFireNow(campaignId);
    });

    return cleanup;
  }, [campaigns, slug]);

  const showToast = useCallback((msg, duration = 4000) => {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  }, []);

  async function handleFireNow(campaignId) {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;

    setFiring(campaignId);
    setLastResult(null);

    const featuredAgentId = Object.keys(AGENT_PERSONALITIES).filter(id => id !== 'content-producer');
    const randomAgent = featuredAgentId[Math.floor(Math.random() * featuredAgentId.length)];
    const agentName = AGENT_PERSONALITIES[randomAgent]?.name || 'a team member';

    showToast(`Content Producer is writing about ${projectName} with ${agentName}...`, 8000);

    const result = await fireCampaign(campaignId, slug, projectName, {
      autoPost: campaign.autoPost,
      styleRotation: campaign.styleRotation,
      coveredFeatureIds: campaign.featuresCovered || [],
    });

    setFiring(null);

    if (result.ok) {
      // Update campaign state
      const updatedCampaigns = campaigns.map(c => {
        if (c.id !== campaignId) return c;
        const history = [
          {
            content: result.content.slice(0, 200) + (result.content.length > 200 ? '...' : ''),
            fullContent: result.content,
            featuredAgent: result.featuredAgentName,
            style: result.style,
            timestamp: result.timestamp,
            posted: result.discordPosted || false,
          },
          ...(c.history || []),
        ].slice(0, 20);

        return {
          ...c,
          lastFiredAt: result.timestamp,
          styleRotation: (c.styleRotation || 0) + 1,
          featuresCovered: result.featureId
            ? [...(c.featuresCovered || []), result.featureId]
            : c.featuresCovered,
          history,
        };
      });

      onUpdateCampaigns(updatedCampaigns);
      setLastResult(result);
      if (result.discordError) {
        showToast(`Content generated but Discord failed: ${result.discordError}`, 6000);
      } else {
        showToast(
          result.discordPosted
            ? `Posted to Discord as Content Producer (${STYLE_LABELS[result.style]} with ${result.featuredAgentName})`
            : `Draft generated (${STYLE_LABELS[result.style]} with ${result.featuredAgentName})`
        );
      }
    } else {
      showToast(`Failed: ${result.error}`);
    }
  }

  function toggleEnabled(campaignId) {
    const updated = campaigns.map(c =>
      c.id === campaignId ? { ...c, enabled: !c.enabled } : c
    );
    onUpdateCampaigns(updated);
  }

  function toggleAutoPost(campaignId) {
    const updated = campaigns.map(c =>
      c.id === campaignId ? { ...c, autoPost: !c.autoPost } : c
    );
    onUpdateCampaigns(updated);
  }

  function updateTime(campaignId, time) {
    const updated = campaigns.map(c =>
      c.id === campaignId ? { ...c, time } : c
    );
    onUpdateCampaigns(updated);
  }

  // Feature coverage stats
  function getFeatureCoverage(campaign) {
    if (campaign.id !== 'feature-spotlight') return null;
    const covered = (campaign.featuresCovered || []).length;
    return covered;
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl bg-[#1e1e2e] border border-forge-accent/30 text-xs text-forge-text-primary shadow-xl shadow-forge-accent/5 animate-fade-in max-w-md">
          {toast}
        </div>
      )}

      {/* Campaign Cards */}
      <div className="grid gap-4">
        {(campaigns || []).map(campaign => {
          const isFiring = firing === campaign.id;
          const featureCoverage = getFeatureCoverage(campaign);
          const lastPost = campaign.history?.[0];
          const nextStyle = STYLE_LABELS[POST_STYLES[(campaign.styleRotation || 0) % POST_STYLES.length]];

          return (
            <div
              key={campaign.id}
              className={`card relative overflow-hidden transition-all ${
                campaign.enabled ? '' : 'opacity-50'
              }`}
            >
              {/* Accent stripe */}
              <div
                className="absolute top-0 left-0 w-1 h-full"
                style={{
                  backgroundColor: campaign.id === 'dev-activity' ? '#F97316'
                    : campaign.id === 'feature-spotlight' ? '#0ea5e9'
                    : '#8B5CF6'
                }}
              />

              <div className="pl-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{campaign.icon}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-forge-text-primary uppercase tracking-wide">
                        {campaign.name}
                      </h3>
                      <p className="text-[10px] text-forge-text-muted">{campaign.description}</p>
                    </div>
                  </div>

                  {/* Enable toggle */}
                  <button
                    onClick={() => toggleEnabled(campaign.id)}
                    className={`px-3 py-1 text-[10px] font-bold rounded-full transition-colors ${
                      campaign.enabled
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}
                  >
                    {campaign.enabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Config Row */}
                <div className="flex items-center gap-4 mb-3 text-[10px] text-forge-text-muted">
                  <div className="flex items-center gap-1.5">
                    <span className="text-forge-text-muted">Cadence:</span>
                    <span className="text-forge-text-secondary font-medium capitalize">{campaign.cadence}</span>
                    {campaign.cadence === 'weekly' && (
                      <span className="text-forge-text-secondary">(Mon)</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span>Time:</span>
                    <input
                      type="time"
                      value={campaign.time || '10:00'}
                      onChange={(e) => updateTime(campaign.id, e.target.value)}
                      className="px-1.5 py-0.5 text-[10px] rounded bg-forge-surface border border-forge-border text-forge-text-secondary focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span>Next style:</span>
                    <span className="text-forge-text-secondary font-medium">{nextStyle}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span>Auto-post:</span>
                    <button
                      onClick={() => toggleAutoPost(campaign.id)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                        campaign.autoPost
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {campaign.autoPost ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {featureCoverage !== null && (
                    <div className="flex items-center gap-1.5">
                      <span>Covered:</span>
                      <span className="text-forge-accent font-bold">{featureCoverage}</span>
                      <span>features</span>
                    </div>
                  )}
                </div>

                {/* Last Post Preview */}
                {lastPost && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-forge-surface/50 border border-forge-border/50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-forge-text-muted">Last posted:</span>
                      <span className="text-[10px] text-forge-text-secondary">
                        {timeAgo(lastPost.timestamp)}
                      </span>
                      <span className="text-[10px] text-forge-text-muted">•</span>
                      <span className="text-[10px] text-forge-text-secondary">
                        {STYLE_LABELS[lastPost.style]} with {lastPost.featuredAgent}
                      </span>
                    </div>
                    <p className="text-[11px] text-forge-text-muted line-clamp-2 italic">
                      "{lastPost.content}"
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleFireNow(campaign.id)}
                    disabled={isFiring || !campaign.enabled}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-all disabled:opacity-40"
                    style={{
                      backgroundColor: isFiring ? '#ffffff10' : '#F9731620',
                      color: isFiring ? '#999' : '#F97316',
                      border: `1px solid ${isFiring ? '#ffffff10' : '#F9731630'}`,
                    }}
                  >
                    {isFiring ? (
                      <>
                        <span className="animate-spin">⟳</span>
                        Generating...
                      </>
                    ) : (
                      <>⚡ Fire Now</>
                    )}
                  </button>

                  <button
                    onClick={() => setExpandedHistory(expandedHistory === campaign.id ? null : campaign.id)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-forge-surface/50 text-forge-text-muted hover:text-forge-text-secondary border border-forge-border/50 transition-colors"
                  >
                    📋 History {campaign.history?.length > 0 && `(${campaign.history.length})`}
                  </button>
                </div>

                {/* Expanded History */}
                {expandedHistory === campaign.id && (
                  <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
                    {(campaign.history || []).length === 0 ? (
                      <p className="text-[10px] text-forge-text-muted py-2">No posts yet. Click "Fire Now" to generate the first one.</p>
                    ) : (
                      campaign.history.map((entry, i) => (
                        <HistoryEntry key={i} entry={entry} />
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Last Generated Post (full preview) */}
      {lastResult && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider">
              Last Generated Post
            </h4>
            <div className="flex items-center gap-2 text-[10px] text-forge-text-muted">
              <span className="px-2 py-0.5 rounded bg-forge-surface border border-forge-border">
                {STYLE_LABELS[lastResult.style]}
              </span>
              <span>with {lastResult.featuredAgentName}</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#313338] border border-[#3f4147] max-h-96 overflow-y-auto">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: '#EC4899' }}>
                C
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-white">Content Producer</span>
                  <span className="text-[10px] text-[#949BA4]">Today</span>
                </div>
                <div className="text-[13px] text-[#dbdee1] whitespace-pre-wrap leading-relaxed">
                  {lastResult.content}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-3 py-2 rounded-lg bg-forge-surface/30 border border-forge-border/30">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-forge-text-secondary">{timeAgo(entry.timestamp)}</span>
          <span className="text-[10px] text-forge-text-muted">•</span>
          <span className="text-[10px] text-forge-text-muted">{STYLE_LABELS[entry.style]}</span>
          <span className="text-[10px] text-forge-text-muted">•</span>
          <span className="text-[10px] text-forge-text-secondary">{entry.featuredAgent}</span>
          {entry.posted && (
            <span className="text-[10px] text-emerald-400">✓ Posted</span>
          )}
        </div>
        <span className="text-[10px] text-forge-text-muted">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div className="mt-2 p-3 rounded-lg bg-[#313338] text-[11px] text-[#dbdee1] whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
          {entry.fullContent || entry.content}
        </div>
      )}
    </div>
  );
}

function timeAgo(timestamp) {
  if (!timestamp) return 'Never';
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
