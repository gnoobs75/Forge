import React, { useState, useMemo } from 'react';
import { PLATFORMS, POST_CATEGORIES, getCharRingColor, createEmptyPost } from '../../utils/socialPlatforms';

export default function SocialCreate({ slug, project, onAddPost }) {
  const [selectedPlatforms, setSelectedPlatforms] = useState(new Set(['twitter']));
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('devlog');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('12:00');

  const activePlatform = useMemo(() => {
    const first = [...selectedPlatforms][0] || 'twitter';
    return PLATFORMS[first];
  }, [selectedPlatforms]);

  const charCount = content.length;
  const charLimit = activePlatform.charLimit;
  const charPct = charLimit > 0 ? charCount / charLimit : 0;
  const ringColor = getCharRingColor(charCount, charLimit);
  const hashtagCount = (content.match(/#\w+/g) || []).length;

  const togglePlatform = (id) => {
    setSelectedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  };

  const handleSaveDraft = () => {
    for (const platformId of selectedPlatforms) {
      const post = createEmptyPost(platformId);
      post.content.text = content;
      post.metadata.charCount = charCount;
      post.metadata.hashtagCount = hashtagCount;
      post.category = category;
      post.status = 'draft';
      onAddPost(post);
    }
    setContent('');
  };

  const handleSchedule = () => {
    if (!scheduleDate) return;
    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
    for (const platformId of selectedPlatforms) {
      const post = createEmptyPost(platformId);
      post.content.text = content;
      post.metadata.charCount = charCount;
      post.metadata.hashtagCount = hashtagCount;
      post.category = category;
      post.status = 'scheduled';
      post.scheduledAt = scheduledAt;
      onAddPost(post);
    }
    setContent('');
    setScheduleDate('');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
  };

  return (
    <div className="grid grid-cols-5 gap-4">
      {/* Editor (3/5) */}
      <div className="col-span-3 space-y-4">
        {/* Platform Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {Object.values(PLATFORMS).map(p => (
            <button
              key={p.id}
              onClick={() => togglePlatform(p.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                selectedPlatforms.has(p.id)
                  ? 'border-opacity-50'
                  : 'border-forge-border opacity-40 hover:opacity-70'
              }`}
              style={selectedPlatforms.has(p.id) ? {
                borderColor: `${p.color}60`,
                backgroundColor: `${p.color}15`,
                color: p.color,
              } : undefined}
            >
              <span>{p.icon}</span>
              {p.name}
            </button>
          ))}
        </div>

        {/* Content Editor */}
        <div className="relative">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`Write your ${activePlatform.name} post...`}
            rows={6}
            className="w-full px-4 py-3 text-sm rounded-lg bg-forge-surface border border-forge-border text-forge-text-primary placeholder-forge-text-muted focus:outline-none focus:border-forge-accent/50 resize-none font-mono"
            maxLength={charLimit + 50}
          />
          {/* Character Ring */}
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <span className="text-[10px] text-forge-text-muted">
              {charCount}/{charLimit}
            </span>
            <svg width="24" height="24" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" fill="none" stroke="#3F465B" strokeWidth="2" />
              <circle
                cx="12" cy="12" r="9"
                fill="none" stroke={ringColor} strokeWidth="2" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 9}
                strokeDashoffset={2 * Math.PI * 9 * (1 - Math.min(charPct, 1))}
                transform="rotate(-90 12 12)"
              />
            </svg>
          </div>
        </div>

        {/* Category + Schedule */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text-secondary focus:outline-none"
          >
            {POST_CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>

          <input
            type="date"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text-secondary focus:outline-none"
          />
          <input
            type="time"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text-secondary focus:outline-none"
          />
        </div>

        {/* Hashtag suggestions */}
        {activePlatform.maxHashtags > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-forge-text-muted">Suggested:</span>
            {getHashtagSuggestions(project).map(tag => (
              <button
                key={tag}
                onClick={() => setContent(prev => prev + (prev.endsWith(' ') || !prev ? '' : ' ') + tag)}
                className="px-2 py-0.5 text-[10px] rounded bg-forge-accent-blue/10 text-forge-accent-blue hover:bg-forge-accent-blue/20 transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={copyToClipboard}
            disabled={!content}
            className="px-4 py-2 text-xs font-medium rounded-lg text-forge-text-muted border border-forge-border hover:text-forge-text-secondary transition-colors disabled:opacity-30"
          >
            Copy
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={!content}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-forge-surface text-forge-text-secondary border border-forge-border hover:bg-forge-surface-hover transition-colors disabled:opacity-30"
          >
            Save Draft
          </button>
          <button
            onClick={handleSchedule}
            disabled={!content || !scheduleDate}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-forge-accent/10 text-forge-accent border border-forge-accent/20 hover:bg-forge-accent/20 transition-colors disabled:opacity-30"
          >
            Schedule
          </button>
        </div>
      </div>

      {/* Platform Preview (2/5) */}
      <div className="col-span-2 space-y-3">
        <div className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider">
          Preview
        </div>
        {[...selectedPlatforms].map(pId => (
          <PlatformPreview key={pId} platform={PLATFORMS[pId]} content={content} project={project} />
        ))}
      </div>
    </div>
  );
}

function PlatformPreview({ platform, content, project }) {
  const displayText = content || `Your ${platform.name} post will appear here...`;

  if (platform.id === 'twitter') {
    return (
      <div className="rounded-xl border border-[#2F3336] bg-[#15202B] p-3">
        <div className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-full bg-forge-accent/30 flex items-center justify-center text-xs font-bold text-forge-accent">
            {project?.name?.[0] || 'G'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold text-white">{project?.name || 'The Forge'}</span>
              <span className="text-xs text-gray-500">@studio</span>
            </div>
            <p className="text-sm text-[#D9D9D9] mt-1 whitespace-pre-wrap break-words">{displayText}</p>
            <div className="flex items-center gap-6 mt-3 text-gray-500">
              <span className="text-xs">&#x1F4AC; 0</span>
              <span className="text-xs">&#x1F504; 0</span>
              <span className="text-xs">&#x2764; 0</span>
              <span className="text-xs">&#x1F4CA; 0</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (platform.id === 'discord') {
    return (
      <div className="rounded-lg bg-[#2B2D31] p-3 border-l-4" style={{ borderLeftColor: platform.color }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-forge-accent/30 flex items-center justify-center text-[10px] font-bold text-forge-accent">
            {project?.name?.[0] || 'G'}
          </div>
          <span className="text-sm font-semibold text-white">{project?.name || 'The Forge'}</span>
          <span className="text-[10px] text-gray-400">Today</span>
        </div>
        <p className="text-sm text-[#DBDEE1] whitespace-pre-wrap break-words">{displayText}</p>
      </div>
    );
  }

  if (platform.id === 'reddit') {
    return (
      <div className="rounded-lg bg-[#1A1A1B] border border-[#343536] p-3">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <span className="text-[#FF4500]">⊕</span>
          <span>r/gamedev</span>
          <span>&#x2022;</span>
          <span>u/studio</span>
        </div>
        <p className="text-sm text-[#D7DADC] whitespace-pre-wrap break-words">{displayText}</p>
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <span>&#x25B2; 0 &#x25BC;</span>
          <span>&#x1F4AC; 0 Comments</span>
          <span>&#x21AA; Share</span>
        </div>
      </div>
    );
  }

  if (platform.id === 'instagram') {
    return (
      <div className="rounded-lg bg-black border border-[#262626] overflow-hidden">
        <div className="flex items-center gap-2 p-2 border-b border-[#262626]">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
            <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-[8px] text-white font-bold">
              {project?.name?.[0] || 'G'}
            </div>
          </div>
          <span className="text-xs font-semibold text-white">{project?.name?.toLowerCase().replace(/\s/g, '') || 'studio'}</span>
        </div>
        <div className="aspect-square bg-forge-surface flex items-center justify-center text-forge-text-muted text-xs">
          Image Preview
        </div>
        <div className="p-2">
          <p className="text-xs text-white whitespace-pre-wrap break-words line-clamp-3">{displayText}</p>
        </div>
      </div>
    );
  }

  // Generic preview for steam, tiktok, etc.
  return (
    <div className="rounded-lg border border-forge-border p-3" style={{ backgroundColor: `${platform.color}10` }}>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: platform.color }}>{platform.icon}</span>
        <span className="text-xs font-semibold text-forge-text-primary">{platform.name}</span>
      </div>
      <p className="text-xs text-forge-text-secondary whitespace-pre-wrap break-words">{displayText}</p>
    </div>
  );
}

function getHashtagSuggestions(project) {
  const tags = ['#gamedev', '#indiedev'];
  if (project?.platforms?.includes('steam')) tags.push('#steam', '#pcgaming');
  if (project?.platforms?.includes('ios')) tags.push('#mobilegames', '#iosgames');
  if (project?.platforms?.includes('roblox')) tags.push('#roblox', '#robloxdev');
  tags.push('#gaming', '#screenshotsaturday');
  return tags.slice(0, 6);
}
