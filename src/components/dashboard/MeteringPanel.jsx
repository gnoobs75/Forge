import React, { useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

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
  'HR Director': '#D4A574',
};

const PROJECT_COLORS = {
  'expedition': '#3B82F6',
  'ttr-ios': '#22C55E',
  'ttr-roblox': '#F97316',
};

const PROJECT_LABELS = {
  'expedition': 'Expedition',
  'ttr-ios': 'TTR iOS',
  'ttr-roblox': 'TTR Roblox',
};

const PIPELINE_STAGES = ['idea', 'analysis', 'recommendation', 'implementation', 'qa'];
const STAGE_LABELS = { idea: 'Idea', analysis: 'Analysis', recommendation: 'Rec', implementation: 'Impl', qa: 'QA' };

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function budgetPct(tokens, limit) {
  if (!limit || limit <= 0) return 0;
  return Math.min(Math.round((tokens / limit) * 100), 100);
}

function budgetColor(pct) {
  if (pct > 80) return '#EF4444';
  if (pct > 50) return '#EAB308';
  return '#22C55E';
}

export default function MeteringPanel() {
  const meteringData = useStore((s) => s.meteringData);
  const meteringLoading = useStore((s) => s.meteringLoading);
  const loadMeteringData = useStore((s) => s.loadMeteringData);

  // Auto-refresh every 30s
  useEffect(() => {
    loadMeteringData();
    const interval = setInterval(loadMeteringData, 30_000);
    return () => clearInterval(interval);
  }, [loadMeteringData]);

  // Derive sorted agent bars
  const agentBars = useMemo(() => {
    if (!meteringData?.byAgent) return [];
    return Object.entries(meteringData.byAgent)
      .map(([name, tokens]) => ({ name, tokens, color: AGENT_COLORS[name] || '#666' }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [meteringData]);

  // Derive sorted project bars
  const projectBars = useMemo(() => {
    if (!meteringData?.byProject) return [];
    return Object.entries(meteringData.byProject)
      .filter(([k]) => k !== 'unknown')
      .map(([slug, tokens]) => ({ slug, label: PROJECT_LABELS[slug] || slug, tokens, color: PROJECT_COLORS[slug] || '#666' }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [meteringData]);

  // Derive feature lifecycle list
  const featureList = useMemo(() => {
    if (!meteringData?.byFeature) return [];
    return Object.entries(meteringData.byFeature)
      .map(([name, data]) => ({ name, total: data.total, stages: data.stages }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }, [meteringData]);

  // Derive trend data
  const trendData = useMemo(() => {
    if (!meteringData?.trend) return [];
    return meteringData.trend.map(d => ({
      ...d,
      label: d.date.slice(5), // MM-DD
      isToday: d.date === meteringData.today,
    }));
  }, [meteringData]);

  if (meteringLoading && !meteringData) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-forge-text-muted animate-pulse">Loading metering data...</span>
      </div>
    );
  }

  const claude = meteringData?.providers?.claude || { tokens: 0, sessions: 0 };
  const grok = meteringData?.providers?.grok || { tokens: 0, sessions: 0 };
  const groq = meteringData?.providers?.groq || { tokens: 0, sessions: 0 };
  const budgets = meteringData?.budgets || {};
  // Budget structure: budgets.daily.claude.tokenLimit (not budgets.claude.dailyTokenLimit)
  const claudeDailyLimit = budgets.daily?.claude?.tokenLimit || 0;
  const grokDailyLimit = budgets.daily?.grok?.tokenLimit || 0;
  const claudePct = budgetPct(claude.tokens, claudeDailyLimit);
  const grokPct = budgetPct(grok.tokens, grokDailyLimit);

  return (
    <div className="space-y-6">
      {/* Section 1: Provider Cards */}
      <div>
        <h3 className="text-xs font-mono font-semibold text-forge-accent uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
          Provider Usage — Today
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ProviderCard
            name="Claude"
            color="#D946EF"
            tokens={claude.tokens}
            sessions={claude.sessions}
            pct={claudePct}
            limit={claudeDailyLimit}
            showBudget={true}
          />
          <ProviderCard
            name="Grok"
            color="#F5A623"
            tokens={grok.tokens}
            sessions={grok.sessions}
            pct={grokPct}
            limit={grokDailyLimit}
            showBudget={true}
          />
          <ProviderCard
            name="Groq"
            color="#64748B"
            tokens={groq.tokens}
            sessions={groq.sessions}
            pct={0}
            limit={0}
            showBudget={false}
            infoOnly={true}
          />
        </div>
      </div>

      {/* Section 2: Agent + Project Breakdowns */}
      <div>
        <h3 className="text-xs font-mono font-semibold text-forge-accent uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
          Cost Breakdown
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cost by Agent */}
          <div className="card">
            <h4 className="text-[11px] font-mono text-forge-text-secondary uppercase tracking-wider mb-3">
              Cost by Agent
            </h4>
            {agentBars.length > 0 ? (
              <div className="space-y-2">
                {agentBars.map(a => {
                  const maxTokens = agentBars[0]?.tokens || 1;
                  const widthPct = Math.max((a.tokens / maxTokens) * 100, 2);
                  return (
                    <div key={a.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                      <span className="text-xs text-forge-text-primary w-28 truncate flex-shrink-0">{a.name}</span>
                      <div className="flex-1 h-4 rounded bg-forge-border/20 overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{ width: `${widthPct}%`, backgroundColor: a.color + 'CC' }}
                        />
                      </div>
                      <span className="text-xs font-mono text-forge-text-muted w-14 text-right flex-shrink-0">
                        {formatTokens(a.tokens)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState message="No agent usage today" />
            )}
          </div>

          {/* Cost by Project */}
          <div className="card">
            <h4 className="text-[11px] font-mono text-forge-text-secondary uppercase tracking-wider mb-3">
              Cost by Project
            </h4>
            {projectBars.length > 0 ? (
              <div className="space-y-2">
                {projectBars.map(p => {
                  const maxTokens = projectBars[0]?.tokens || 1;
                  const widthPct = Math.max((p.tokens / maxTokens) * 100, 2);
                  return (
                    <div key={p.slug} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-xs text-forge-text-primary w-28 truncate flex-shrink-0">{p.label}</span>
                      <div className="flex-1 h-4 rounded bg-forge-border/20 overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{ width: `${widthPct}%`, backgroundColor: p.color + 'CC' }}
                        />
                      </div>
                      <span className="text-xs font-mono text-forge-text-muted w-14 text-right flex-shrink-0">
                        {formatTokens(p.tokens)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState message="No project usage today" />
            )}
          </div>
        </div>
      </div>

      {/* Section 3: Feature Lifecycle */}
      <div>
        <h3 className="text-xs font-mono font-semibold text-forge-accent uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
          Feature Lifecycle Cost
        </h3>
        <div className="card">
          {featureList.length > 0 ? (
            <div className="space-y-3">
              {featureList.map(f => (
                <div key={f.name} className="p-3 rounded-lg bg-forge-bg/50 border border-forge-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-forge-text-primary">{f.name}</span>
                    <span className="text-xs font-mono text-forge-text-muted">{formatTokens(f.total)} tokens</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {PIPELINE_STAGES.map((stage, i) => {
                      const stageTokens = f.stages[stage] || 0;
                      const hasData = stageTokens > 0;
                      return (
                        <React.Fragment key={stage}>
                          {i > 0 && (
                            <div className="w-4 h-px bg-forge-border flex-shrink-0" />
                          )}
                          <div
                            className={`flex-1 px-2 py-1.5 rounded text-center text-[10px] font-mono transition-colors ${
                              hasData
                                ? 'bg-forge-accent/10 border border-forge-accent/30 text-forge-accent'
                                : 'border border-dashed border-forge-border/40 text-forge-text-muted/40'
                            }`}
                          >
                            <div className="font-medium">{STAGE_LABELS[stage]}</div>
                            {hasData && (
                              <div className="mt-0.5 text-[9px] text-forge-text-muted">{formatTokens(stageTokens)}</div>
                            )}
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No feature-level metering data yet" />
          )}
        </div>
      </div>

      {/* Section 4: 7-Day Trend */}
      <div>
        <h3 className="text-xs font-mono font-semibold text-forge-accent uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
          7-Day Trend
        </h3>
        <div className="card">
          {trendData.some(d => d.claude > 0 || d.grok > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={trendData} barSize={28}>
                <XAxis
                  dataKey="label"
                  tick={({ x, y, payload, index }) => {
                    const isToday = trendData[index]?.isToday;
                    return (
                      <text
                        x={x}
                        y={y + 12}
                        textAnchor="middle"
                        fontSize={11}
                        fontFamily="monospace"
                        fill={isToday ? '#F5A623' : '#64748b'}
                        fontWeight={isToday ? 700 : 400}
                      >
                        {payload.value}
                      </text>
                    );
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatTokens}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1e1e24',
                    border: '1px solid #3F465B',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelFormatter={(v, payload) => {
                    const item = payload?.[0]?.payload;
                    return item?.isToday ? `${v} (Today)` : v;
                  }}
                  formatter={(value) => [formatTokens(value), undefined]}
                />
                <Bar dataKey="claude" stackId="a" fill="#D946EF" name="Claude" radius={[0, 0, 0, 0]} />
                <Bar dataKey="grok" stackId="a" fill="#F5A623" name="Grok" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No usage data for the past 7 days" />
          )}
          <div className="flex items-center gap-4 justify-center mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#D946EF' }} />
              <span className="text-[11px] text-forge-text-muted">Claude</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#F5A623' }} />
              <span className="text-[11px] text-forge-text-muted">Grok</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ name, color, tokens, sessions, pct, limit, showBudget, infoOnly }) {
  const pctColor = budgetColor(pct);
  return (
    <div className="card !p-4 relative overflow-hidden">
      {/* Color accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: color }} />

      <div className="flex items-center justify-between mb-3 mt-1">
        <span className="text-sm font-semibold font-mono" style={{ color }}>
          {name}
        </span>
        {infoOnly && (
          <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider rounded bg-forge-surface-hover text-forge-text-muted">
            INFO ONLY
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-[10px] text-forge-text-muted uppercase tracking-wider">Tokens Today</div>
          <div className="text-xl font-bold font-mono text-forge-text-primary mt-0.5">
            {formatTokens(tokens)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-forge-text-muted uppercase tracking-wider">Sessions</div>
          <div className="text-xl font-bold font-mono text-forge-text-primary mt-0.5">
            {sessions}
          </div>
        </div>
      </div>

      {showBudget && limit > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-forge-text-muted uppercase tracking-wider">Budget</span>
            <span className="text-[10px] font-mono" style={{ color: pctColor }}>
              {pct}% of {formatTokens(limit)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-forge-border/20 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: pctColor }}
            />
          </div>
        </div>
      ) : showBudget ? (
        <div className="text-[10px] text-forge-text-muted/50 italic">No budget configured</div>
      ) : null}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-forge-text-muted">{message}</p>
      <p className="text-xs text-forge-text-muted/60 mt-1">Data will appear as agents run</p>
    </div>
  );
}
