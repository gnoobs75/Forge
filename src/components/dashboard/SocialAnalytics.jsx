import React, { useMemo } from 'react';
import { PLATFORMS, POST_CATEGORIES } from '../../utils/socialPlatforms';

export default function SocialAnalytics({ posts }) {
  const stats = useMemo(() => {
    const byPlatform = {};
    const byCategory = {};
    const byStatus = { draft: 0, scheduled: 0, posted: 0, skipped: 0 };
    let totalLikes = 0, totalShares = 0, totalViews = 0;
    let postsWithEngagement = 0;

    for (const post of posts) {
      byPlatform[post.platform] = (byPlatform[post.platform] || 0) + 1;
      byCategory[post.category] = (byCategory[post.category] || 0) + 1;
      byStatus[post.status] = (byStatus[post.status] || 0) + 1;

      if (post.engagement) {
        if (post.engagement.likes != null) { totalLikes += post.engagement.likes; postsWithEngagement++; }
        if (post.engagement.shares != null) totalShares += post.engagement.shares;
        if (post.engagement.views != null) totalViews += post.engagement.views;
      }
    }

    return { byPlatform, byCategory, byStatus, totalLikes, totalShares, totalViews, postsWithEngagement };
  }, [posts]);

  const weeklyData = useMemo(() => {
    const weeks = {};
    for (const post of posts) {
      if (post.status !== 'posted' && post.status !== 'scheduled') continue;
      const d = new Date(post.scheduledAt || post.postedAt);
      if (isNaN(d)) continue;
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      weeks[key] = (weeks[key] || 0) + 1;
    }
    return Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
  }, [posts]);

  const maxWeekCount = Math.max(1, ...weeklyData.map(w => w[1]));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total Posts" value={posts.length.toString()} color="#3B82F6" />
        <SummaryCard label="Posted" value={stats.byStatus.posted.toString()} color="#22C55E" />
        <SummaryCard label="Scheduled" value={stats.byStatus.scheduled.toString()} color="#F59E0B" />
        <SummaryCard label="Drafts" value={stats.byStatus.draft.toString()} color="#64748B" />
      </div>

      {/* Engagement (if any) */}
      {stats.postsWithEngagement > 0 && (
        <div className="card">
          <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
            Engagement Totals
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-pink-400">{stats.totalLikes.toLocaleString()}</div>
              <div className="text-[10px] text-forge-text-muted">Likes</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-green-400">{stats.totalShares.toLocaleString()}</div>
              <div className="text-[10px] text-forge-text-muted">Shares</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-blue-400">{stats.totalViews.toLocaleString()}</div>
              <div className="text-[10px] text-forge-text-muted">Views</div>
            </div>
          </div>
        </div>
      )}

      {/* Posts Per Week Bar Chart */}
      <div className="card">
        <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
          Posting Frequency
        </h3>
        {weeklyData.length === 0 ? (
          <p className="text-xs text-forge-text-muted text-center py-4">No posting data yet</p>
        ) : (
          <div className="flex items-end gap-2 h-32">
            {weeklyData.map(([week, count]) => (
              <div key={week} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-forge-text-muted">{count}</span>
                <div
                  className="w-full rounded-t transition-all duration-500"
                  style={{
                    height: `${(count / maxWeekCount) * 100}%`,
                    minHeight: 4,
                    backgroundColor: '#3B82F6',
                  }}
                />
                <span className="text-[8px] text-forge-text-muted/50 rotate-[-45deg] origin-top-left whitespace-nowrap">
                  {new Date(week).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Platform Distribution */}
      <div className="card">
        <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
          Platform Distribution
        </h3>
        <div className="space-y-2">
          {Object.entries(stats.byPlatform).map(([platformId, count]) => {
            const platform = PLATFORMS[platformId];
            const pct = posts.length > 0 ? (count / posts.length) * 100 : 0;
            return (
              <div key={platformId} className="flex items-center gap-3">
                <span className="text-sm w-4" style={{ color: platform?.color }}>{platform?.icon}</span>
                <span className="text-xs text-forge-text-secondary w-20">{platform?.name || platformId}</span>
                <div className="flex-1 h-2 rounded-full bg-forge-surface overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: platform?.color || '#64748B' }}
                  />
                </div>
                <span className="text-[10px] text-forge-text-muted w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="card">
        <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
          Content Type Distribution
        </h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byCategory).map(([catId, count]) => {
            const cat = POST_CATEGORIES.find(c => c.id === catId);
            return (
              <div
                key={catId}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                style={{ backgroundColor: `${cat?.color || '#64748B'}15`, color: cat?.color || '#64748B' }}
              >
                {cat?.label || catId}
                <span className="font-bold">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="card text-center">
      <div className="text-[10px] text-forge-text-muted uppercase tracking-wider">{label}</div>
      <div className="text-lg font-mono font-bold mt-1" style={{ color }}>{value}</div>
    </div>
  );
}
