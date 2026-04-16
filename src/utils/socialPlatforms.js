/**
 * Social media platform specifications for the Social Hub.
 */

export const PLATFORMS = {
  twitter: {
    id: 'twitter',
    name: 'Twitter / X',
    charLimit: 280,
    mediaTypes: ['image', 'video', 'gif'],
    color: '#1DA1F2',
    icon: '𝕏',
    apiType: 'Twitter API v2',
    hashtagPrefix: '#',
    maxHashtags: 5,
    bestTimes: ['9:00 AM', '12:00 PM', '5:00 PM'],
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    charLimit: 2200,
    mediaTypes: ['video'],
    color: '#00F2EA',
    icon: '♪',
    apiType: 'TikTok API',
    hashtagPrefix: '#',
    maxHashtags: 10,
    bestTimes: ['7:00 PM', '9:00 PM'],
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    charLimit: 2200,
    mediaTypes: ['image', 'video', 'carousel'],
    color: '#E4405F',
    icon: '◎',
    apiType: 'Instagram Graph API',
    hashtagPrefix: '#',
    maxHashtags: 30,
    bestTimes: ['11:00 AM', '1:00 PM', '7:00 PM'],
  },
  reddit: {
    id: 'reddit',
    name: 'Reddit',
    charLimit: 40000,
    mediaTypes: ['text', 'image', 'video'],
    color: '#FF4500',
    icon: '⊕',
    apiType: 'Reddit API',
    hashtagPrefix: '',
    maxHashtags: 0,
    bestTimes: ['8:00 AM', '6:00 PM'],
  },
  steam: {
    id: 'steam',
    name: 'Steam',
    charLimit: 8000,
    mediaTypes: ['image', 'video'],
    color: '#171a21',
    icon: '⎔',
    apiType: 'Steamworks',
    hashtagPrefix: '',
    maxHashtags: 0,
    bestTimes: ['10:00 AM', '3:00 PM'],
  },
  discord: {
    id: 'discord',
    name: 'Discord',
    charLimit: 2000,
    mediaTypes: ['image', 'embed'],
    color: '#5865F2',
    icon: '⊞',
    apiType: 'Webhook URL',
    hashtagPrefix: '',
    maxHashtags: 0,
    bestTimes: ['4:00 PM', '8:00 PM'],
  },
};

export const POST_CATEGORIES = [
  { id: 'announcement', label: 'Announcement', color: '#3B82F6' },
  { id: 'devlog', label: 'Dev Log', color: '#8B5CF6' },
  { id: 'milestone', label: 'Milestone', color: '#22C55E' },
  { id: 'behind-scenes', label: 'Behind the Scenes', color: '#F59E0B' },
  { id: 'countdown', label: 'Countdown', color: '#EF4444' },
  { id: 'launch', label: 'Launch', color: '#EC4899' },
  { id: 'update', label: 'Update', color: '#06B6D4' },
  { id: 'community', label: 'Community', color: '#10B981' },
];

export const POST_STATUSES = {
  draft: { label: 'Draft', color: '#64748B' },
  scheduled: { label: 'Scheduled', color: '#F59E0B' },
  posted: { label: 'Posted', color: '#22C55E' },
  skipped: { label: 'Skipped', color: '#EF4444' },
};

export function getCharRingColor(count, limit) {
  const pct = count / limit;
  if (pct > 0.95) return '#EF4444';
  if (pct > 0.80) return '#F59E0B';
  return '#22C55E';
}

export function generatePostId() {
  return `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyPost(platform = 'twitter') {
  return {
    id: generatePostId(),
    platform,
    status: 'draft',
    scheduledAt: null,
    postedAt: null,
    content: { text: '', mediaUrls: [], altText: '' },
    metadata: { charCount: 0, charLimit: PLATFORMS[platform]?.charLimit || 280, hashtagCount: 0 },
    generatedBy: 'manual',
    category: 'devlog',
    campaign: null,
    engagement: { likes: null, shares: null, views: null },
  };
}
