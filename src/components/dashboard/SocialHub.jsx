import React, { useState, useEffect } from 'react';
import SocialCreate from './SocialCreate';
import SocialCalendar from './SocialCalendar';
import SocialQueue from './SocialQueue';
import SocialAnalytics from './SocialAnalytics';
import SocialCampaigns from './SocialCampaigns';

const SUB_TABS = [
  { id: 'campaigns', label: 'Campaigns', icon: '⚡' },
  { id: 'create', label: 'Create', icon: '\u270E' },
  { id: 'calendar', label: 'Calendar', icon: '\uD83D\uDCC5' },
  { id: 'queue', label: 'Queue', icon: '\u2630' },
  { id: 'analytics', label: 'Analytics', icon: '\u2605' },
];

export default function SocialHub({ slug, project }) {
  const [activeTab, setActiveTab] = useState('campaigns');
  const [posts, setPosts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    loadSocialData();
  }, [slug]);

  async function loadSocialData() {
    if (!window.electronAPI) {
      // Browser fallback
      setPosts(getSamplePosts());
      return;
    }
    try {
      const result = await window.electronAPI.hq.readFile(`projects/${slug}/social-hub.json`);
      if (result.ok) {
        const data = JSON.parse(result.data);
        setPosts(data.posts || []);
        setCampaigns(data.campaigns || []);
      }
    } catch {}
  }

  async function saveSocialData(nextPosts, nextCampaigns) {
    const data = { posts: nextPosts || posts, campaigns: nextCampaigns || campaigns };
    if (window.electronAPI) {
      await window.electronAPI.hq.writeFile(
        `projects/${slug}/social-hub.json`,
        JSON.stringify(data, null, 2)
      );
    }
  }

  function addPost(post) {
    const next = [...posts, post];
    setPosts(next);
    saveSocialData(next);
  }

  function updatePost(id, updates) {
    const next = posts.map(p => p.id === id ? { ...p, ...updates } : p);
    setPosts(next);
    saveSocialData(next);
  }

  function deletePost(id) {
    const next = posts.filter(p => p.id !== id);
    setPosts(next);
    saveSocialData(next);
  }

  function handleUpdateCampaigns(nextCampaigns) {
    setCampaigns(nextCampaigns);
    saveSocialData(posts, nextCampaigns);
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-1 bg-forge-surface/50 rounded-lg p-1">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-forge-accent/20 text-forge-accent'
                : 'text-forge-text-muted hover:text-forge-text-secondary'
            }`}
          >
            <span className="text-sm">{tab.icon}</span>
            {tab.label}
            {tab.id === 'queue' && posts.filter(p => p.status === 'scheduled').length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-forge-accent/20 text-forge-accent font-bold">
                {posts.filter(p => p.status === 'scheduled').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div key={activeTab} className="animate-fade-in">
        {activeTab === 'campaigns' && (
          <SocialCampaigns
            slug={slug}
            project={project}
            campaigns={campaigns}
            onUpdateCampaigns={handleUpdateCampaigns}
          />
        )}
        {activeTab === 'create' && (
          <SocialCreate slug={slug} project={project} onAddPost={addPost} />
        )}
        {activeTab === 'calendar' && (
          <SocialCalendar posts={posts} onUpdatePost={updatePost} />
        )}
        {activeTab === 'queue' && (
          <SocialQueue posts={posts} onUpdatePost={updatePost} onDeletePost={deletePost} />
        )}
        {activeTab === 'analytics' && (
          <SocialAnalytics posts={posts} />
        )}
      </div>
    </div>
  );
}

function getSamplePosts() {
  const now = new Date();
  return [
    {
      id: 'sample-1',
      platform: 'twitter',
      status: 'scheduled',
      scheduledAt: new Date(now.getTime() + 86400000).toISOString(),
      postedAt: null,
      content: { text: 'Exciting development update! Our new feature is almost ready. Stay tuned! #gamedev #indiedev', mediaUrls: [], altText: '' },
      metadata: { charCount: 89, charLimit: 280, hashtagCount: 2 },
      generatedBy: 'manual',
      category: 'devlog',
      campaign: null,
      engagement: { likes: null, shares: null, views: null },
    },
    {
      id: 'sample-2',
      platform: 'discord',
      status: 'draft',
      scheduledAt: null,
      postedAt: null,
      content: { text: 'Hey everyone! Just pushed a major update to the game. Check out the new crafting system!', mediaUrls: [], altText: '' },
      metadata: { charCount: 87, charLimit: 2000, hashtagCount: 0 },
      generatedBy: 'manual',
      category: 'announcement',
      campaign: null,
      engagement: { likes: null, shares: null, views: null },
    },
  ];
}
