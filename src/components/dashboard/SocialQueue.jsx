import React, { useState, useMemo } from 'react';
import { PLATFORMS, POST_STATUSES, POST_CATEGORIES } from '../../utils/socialPlatforms';

export default function SocialQueue({ posts, onUpdatePost, onDeletePost }) {
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const sortedPosts = useMemo(() => {
    return posts
      .filter(p => {
        if (filterPlatform !== 'all' && p.platform !== filterPlatform) return false;
        if (filterStatus !== 'all' && p.status !== filterStatus) return false;
        return true;
      })
      .sort((a, b) => {
        // Scheduled first by date, then drafts, then posted
        const statusOrder = { scheduled: 0, draft: 1, posted: 2, skipped: 3 };
        const oa = statusOrder[a.status] ?? 4;
        const ob = statusOrder[b.status] ?? 4;
        if (oa !== ob) return oa - ob;
        const da = a.scheduledAt || a.postedAt || '';
        const db = b.scheduledAt || b.postedAt || '';
        return da.localeCompare(db);
      });
  }, [posts, filterPlatform, filterStatus]);

  const handleMarkPosted = (post) => {
    onUpdatePost(post.id, { status: 'posted', postedAt: new Date().toISOString() });
  };

  const handleSkip = (post) => {
    onUpdatePost(post.id, { status: 'skipped' });
  };

  const handleCopy = (post) => {
    navigator.clipboard.writeText(post.content?.text || '');
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text-secondary focus:outline-none"
        >
          <option value="all">All Platforms</option>
          {Object.values(PLATFORMS).map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text-secondary focus:outline-none"
        >
          <option value="all">All Statuses</option>
          {Object.entries(POST_STATUSES).map(([id, s]) => (
            <option key={id} value={id}>{s.label}</option>
          ))}
        </select>
        <div className="flex-1" />
        <span className="text-[10px] text-forge-text-muted">{sortedPosts.length} posts</span>
      </div>

      {/* Queue List */}
      {sortedPosts.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-3xl mb-2 opacity-30">&#x1F4CB;</div>
          <p className="text-sm text-forge-text-muted">No posts in queue</p>
          <p className="text-xs text-forge-text-muted mt-1">Create posts in the Create tab to fill your queue</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedPosts.map(post => {
            const platform = PLATFORMS[post.platform];
            const status = POST_STATUSES[post.status];
            const category = POST_CATEGORIES.find(c => c.id === post.category);

            return (
              <div
                key={post.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-forge-bg/50 border border-forge-border hover:border-forge-accent-blue/20 transition-colors group"
              >
                {/* Platform color bar */}
                <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: platform?.color || '#64748B' }} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm" style={{ color: platform?.color }}>{platform?.icon}</span>
                    <span className="text-xs font-medium text-forge-text-primary">{platform?.name}</span>
                    <span
                      className="px-1.5 py-0.5 text-[10px] rounded font-medium"
                      style={{ backgroundColor: `${status?.color}20`, color: status?.color }}
                    >
                      {status?.label}
                    </span>
                    {category && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] rounded"
                        style={{ backgroundColor: `${category.color}15`, color: category.color }}
                      >
                        {category.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-forge-text-secondary line-clamp-2">{post.content?.text}</p>
                  {post.scheduledAt && (
                    <p className="text-[10px] text-forge-text-muted mt-1">
                      Scheduled: {new Date(post.scheduledAt).toLocaleString()}
                    </p>
                  )}
                  {post.postedAt && (
                    <p className="text-[10px] text-green-400/70 mt-1">
                      Posted: {new Date(post.postedAt).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => handleCopy(post)}
                    className="px-2 py-1 text-[10px] text-forge-text-muted hover:text-forge-text-secondary border border-forge-border rounded transition-colors"
                    title="Copy to clipboard"
                  >
                    Copy
                  </button>
                  {post.status !== 'posted' && (
                    <button
                      onClick={() => handleMarkPosted(post)}
                      className="px-2 py-1 text-[10px] text-green-400 hover:bg-green-400/10 border border-green-400/20 rounded transition-colors"
                      title="Mark as posted"
                    >
                      Posted
                    </button>
                  )}
                  {post.status === 'scheduled' && (
                    <button
                      onClick={() => handleSkip(post)}
                      className="px-2 py-1 text-[10px] text-orange-400 hover:bg-orange-400/10 border border-orange-400/20 rounded transition-colors"
                      title="Skip this post"
                    >
                      Skip
                    </button>
                  )}
                  <button
                    onClick={() => onDeletePost(post.id)}
                    className="px-2 py-1 text-[10px] text-red-400 hover:bg-red-400/10 border border-red-400/20 rounded transition-colors"
                    title="Delete"
                  >
                    &#x2715;
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
