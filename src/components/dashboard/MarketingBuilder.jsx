import React, { useState, useEffect, lazy, Suspense } from 'react';
import HeroSection from './marketing/HeroSection';
import FeatureGrid from './marketing/FeatureGrid';
import ScreenshotGallery from './marketing/ScreenshotGallery';
import StatsCounter from './marketing/StatsCounter';
import CTAFooter from './marketing/CTAFooter';

const TEMPLATES = [
  { id: 'space-epic', label: 'Space Epic', game: 'Expedition', colors: '#0a0e27 + #0ea5e9' },
  { id: 'underground-neon', label: 'Underground Neon', game: 'TTR iOS', colors: '#10B981 + #EC4899' },
  { id: 'roblox-playful', label: 'Roblox Playful', game: 'TTR Roblox', colors: '#3B82F6 + #22C55E' },
];

const SECTION_TYPES = [
  { type: 'hero', label: 'Hero', icon: '\u2605' },
  { type: 'features', label: 'Features', icon: '\u25A6' },
  { type: 'screenshots', label: 'Screenshots', icon: '\uD83D\uDCF7' },
  { type: 'stats', label: 'Stats', icon: '\u2116' },
  { type: 'cta', label: 'CTA', icon: '\u261B' },
];

const DEFAULT_SECTIONS = [
  { type: 'hero', headline: '', subheadline: '', ctaText: 'Play Now', ctaUrl: '' },
  { type: 'features', title: 'Key Features', layout: 'grid-3', items: [] },
  { type: 'screenshots', title: 'Screenshots', images: [] },
  { type: 'stats', counters: [] },
  { type: 'cta', headline: 'Ready to Play?', ctaText: 'Get it Now', ctaUrl: '' },
];

const DEVICE_SIZES = {
  desktop: { width: '100%', label: 'Desktop' },
  tablet: { width: '768px', label: 'Tablet' },
  mobile: { width: '375px', label: 'Mobile' },
};

// Category → emoji icon mapping for auto-populate
const CATEGORY_ICONS = {
  'Rendering': '🎨', 'Combat': '⚔️', 'Fleet': '🚀', 'Industry': '⚙️',
  'Economy': '💰', 'Factions': '🛡️', 'Campaign': '📜', 'Progression': '⭐',
  'Navigation & UI': '🗺️', 'Audio': '🔊', 'Platform': '💻', 'World': '🌍',
  'Onboarding': '📚', 'Gameplay': '🎮', 'AI': '🧠', 'Multiplayer': '👥',
  'Social': '💬', 'Physics': '🌊', 'Racing': '🏎️', 'Customization': '🎭',
  'Input': '🕹️', 'Vehicles': '🏁', 'Animation': '✨', 'UI': '📱',
};

function pickCategoryIcon(category) {
  if (!category) return '✦';
  return CATEGORY_ICONS[category] || '✦';
}

// Pick the best marketing features: prefer complete, group by category, limit per category
function selectMarketingFeatures(features, maxTotal = 12) {
  const complete = features.filter(f => f.status === 'complete');
  const inProgress = features.filter(f => f.status === 'in-progress');
  const pool = [...complete, ...inProgress];

  // Group by category, take top 2 per category to ensure variety
  const byCategory = {};
  for (const f of pool) {
    const cat = f.category || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(f);
  }

  const selected = [];
  const categories = Object.keys(byCategory).sort((a, b) => byCategory[b].length - byCategory[a].length);

  // Round-robin: 1 per category first, then 2nd pass
  for (let pass = 0; pass < 2 && selected.length < maxTotal; pass++) {
    for (const cat of categories) {
      if (selected.length >= maxTotal) break;
      if (byCategory[cat][pass]) {
        selected.push(byCategory[cat][pass]);
      }
    }
  }

  return selected;
}

export default function MarketingBuilder({ slug, project }) {
  const [template, setTemplate] = useState('space-epic');
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [deviceSize, setDeviceSize] = useState('desktop');
  const [pages, setPages] = useState([]);
  const [activePage, setActivePage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [populating, setPopulating] = useState(false);

  useEffect(() => {
    loadPages();
    // Auto-select template based on project
    if (project?.slug === 'expedition') setTemplate('space-epic');
    else if (project?.slug === 'ttr') setTemplate('underground-neon');
    else if (project?.slug === 'ttr-roblox') setTemplate('roblox-playful');
  }, [slug]);

  // ─── Auto-populate from features.json + project.json ───
  async function autoPopulateFromFeatures() {
    if (!window.electronAPI) return;
    setPopulating(true);
    try {
      // Load features
      const featResult = await window.electronAPI.hq.readFile(`projects/${slug}/features.json`);
      let features = [];
      if (featResult.ok) {
        const data = JSON.parse(featResult.data);
        features = data.features || [];
      }

      // Load project info
      const projResult = await window.electronAPI.hq.readFile(`projects/${slug}/project.json`);
      let proj = project || {};
      if (projResult.ok) {
        proj = { ...proj, ...JSON.parse(projResult.data) };
      }

      if (features.length === 0) {
        setPopulating(false);
        return;
      }

      // Select best features for marketing
      const marketingFeatures = selectMarketingFeatures(features, 12);

      // Build sections
      const completedCount = features.filter(f => f.status === 'complete').length;
      const totalCount = features.length;
      const categoryCount = new Set(features.map(f => f.category).filter(Boolean)).size;

      // Platform-specific CTA
      const platforms = proj.platforms || [];
      let ctaText = 'Play Now';
      let ctaUrl = '';
      if (platforms.includes('steam')) { ctaText = 'Wishlist on Steam'; ctaUrl = 'https://store.steampowered.com/'; }
      else if (platforms.includes('ios')) { ctaText = 'Download on App Store'; ctaUrl = 'https://apps.apple.com/'; }
      else if (platforms.includes('roblox')) { ctaText = 'Play on Roblox'; ctaUrl = 'https://www.roblox.com/'; }

      // Genre tagline
      const tagline = proj.subgenre
        ? `${proj.genre} meets ${proj.subgenre}`
        : proj.genre || 'An epic gaming experience';

      const newSections = [
        {
          type: 'hero',
          headline: proj.name || 'Your Game',
          subheadline: proj.description || tagline,
          ctaText,
          ctaUrl,
        },
        {
          type: 'features',
          title: 'Key Features',
          layout: marketingFeatures.length <= 4 ? 'grid-2' : marketingFeatures.length <= 6 ? 'grid-3' : 'grid-3',
          items: marketingFeatures.map(f => ({
            icon: pickCategoryIcon(f.category),
            title: f.name,
            description: f.description,
          })),
        },
        {
          type: 'screenshots',
          title: 'Screenshots',
          images: [],
        },
        {
          type: 'stats',
          counters: [
            { label: 'Features Built', value: completedCount },
            { label: 'Game Systems', value: categoryCount },
            { label: 'Total Features', value: totalCount },
            ...(proj.progress ? [{ label: '% Complete', value: proj.progress }] : []),
          ],
        },
        {
          type: 'cta',
          headline: `Ready to experience ${proj.name || 'the game'}?`,
          subheadline: proj.price ? `$${proj.price} — Premium, no microtransactions` : 'Free to play',
          ctaText,
          ctaUrl,
        },
      ];

      setSections(newSections);
      setActiveSectionIndex(0);
    } catch (err) {
      console.error('[MarketingBuilder] Auto-populate failed:', err);
    }
    setPopulating(false);
  }

  async function loadPages() {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.hq.readFile(`projects/${slug}/marketing-pages.json`);
      if (result.ok) {
        const data = JSON.parse(result.data);
        setPages(data.pages || []);
        if (data.pages?.length > 0) {
          const page = data.pages[0];
          setActivePage(page.id);
          setSections(page.sections || DEFAULT_SECTIONS);
          setTemplate(page.template || 'space-epic');
        }
      }
    } catch {}
  }

  async function savePage() {
    setSaving(true);
    const pageId = activePage || `landing-${Date.now()}`;
    const page = {
      id: pageId,
      name: sections[0]?.headline || 'Landing Page',
      template,
      status: 'draft',
      sections,
    };

    const existingIndex = pages.findIndex(p => p.id === pageId);
    const nextPages = existingIndex >= 0
      ? pages.map((p, i) => i === existingIndex ? page : p)
      : [...pages, page];

    setPages(nextPages);
    setActivePage(pageId);

    if (window.electronAPI) {
      await window.electronAPI.hq.writeFile(
        `projects/${slug}/marketing-pages.json`,
        JSON.stringify({ pages: nextPages }, null, 2)
      );
    }
    setSaving(false);
  }

  function updateSection(index, updates) {
    setSections(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
  }

  function addSection(type) {
    const defaults = {
      hero: { type: 'hero', headline: '', subheadline: '', ctaText: '', ctaUrl: '' },
      features: { type: 'features', title: 'Features', layout: 'grid-3', items: [] },
      screenshots: { type: 'screenshots', title: 'Gallery', images: [] },
      stats: { type: 'stats', counters: [] },
      cta: { type: 'cta', headline: '', ctaText: '', ctaUrl: '' },
    };
    setSections(prev => [...prev, defaults[type] || defaults.hero]);
  }

  function removeSection(index) {
    setSections(prev => prev.filter((_, i) => i !== index));
    if (activeSectionIndex >= sections.length - 1) {
      setActiveSectionIndex(Math.max(0, sections.length - 2));
    }
  }

  function moveSection(index, direction) {
    setSections(prev => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setActiveSectionIndex(index + direction);
  }

  const activeSection = sections[activeSectionIndex];

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text-secondary focus:outline-none"
          >
            {TEMPLATES.map(t => (
              <option key={t.id} value={t.id}>{t.label} ({t.game})</option>
            ))}
          </select>

          {/* Device toggles */}
          <div className="flex items-center rounded-lg border border-forge-border overflow-hidden">
            {Object.entries(DEVICE_SIZES).map(([key, val]) => (
              <button
                key={key}
                onClick={() => setDeviceSize(key)}
                className={`px-2.5 py-1.5 text-[10px] transition-colors ${
                  deviceSize === key
                    ? 'bg-forge-accent/20 text-forge-accent'
                    : 'text-forge-text-muted hover:text-forge-text-secondary'
                }`}
              >
                {val.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={autoPopulateFromFeatures}
            disabled={populating}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {populating ? 'Loading Features...' : '⚡ Auto-populate from Features'}
          </button>
          <button
            onClick={savePage}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-forge-accent/10 text-forge-accent border border-forge-accent/20 hover:bg-forge-accent/20 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Page'}
          </button>
        </div>
      </div>

      {/* Split Pane */}
      <div className="grid grid-cols-10 gap-4">
        {/* Editor (3/10) */}
        <div className="col-span-3 space-y-3">
          {/* Section List */}
          <div className="card p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider">Sections</span>
            </div>
            <div className="space-y-1">
              {sections.map((section, i) => {
                const sectionType = SECTION_TYPES.find(s => s.type === section.type);
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                      activeSectionIndex === i
                        ? 'bg-forge-accent/10 border border-forge-accent/30'
                        : 'hover:bg-forge-surface-hover border border-transparent'
                    }`}
                    onClick={() => setActiveSectionIndex(i)}
                  >
                    <span className="text-sm">{sectionType?.icon || '\u25CF'}</span>
                    <span className="text-xs text-forge-text-primary flex-1">{sectionType?.label || section.type}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveSection(i, -1); }}
                        className="text-[10px] text-forge-text-muted hover:text-forge-text-primary px-1"
                        disabled={i === 0}
                      >
                        &#x25B2;
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveSection(i, 1); }}
                        className="text-[10px] text-forge-text-muted hover:text-forge-text-primary px-1"
                        disabled={i === sections.length - 1}
                      >
                        &#x25BC;
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeSection(i); }}
                        className="text-[10px] text-red-400 hover:text-red-300 px-1"
                      >
                        &#x2715;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {SECTION_TYPES.map(st => (
                <button
                  key={st.type}
                  onClick={() => addSection(st.type)}
                  className="px-2 py-1 text-[10px] rounded bg-forge-surface border border-forge-border text-forge-text-muted hover:text-forge-accent hover:border-forge-accent/30 transition-colors"
                >
                  + {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Section Editor */}
          {activeSection && (
            <div className="card">
              <h4 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3">
                Edit: {SECTION_TYPES.find(s => s.type === activeSection.type)?.label}
              </h4>
              <SectionEditor
                section={activeSection}
                onUpdate={(updates) => updateSection(activeSectionIndex, updates)}
              />
            </div>
          )}
        </div>

        {/* Preview (7/10) */}
        <div className="col-span-7">
          <div
            className="rounded-xl overflow-hidden border border-forge-border mx-auto transition-all duration-300"
            style={{
              maxWidth: DEVICE_SIZES[deviceSize].width,
              backgroundColor: '#0a0e27',
            }}
          >
            {sections.map((section, i) => (
              <div
                key={i}
                className={`relative transition-all cursor-pointer ${
                  activeSectionIndex === i ? 'ring-2 ring-forge-accent ring-inset' : ''
                }`}
                onClick={() => setActiveSectionIndex(i)}
              >
                <RenderSection section={section} template={template} isPreview />
              </div>
            ))}
            {sections.length === 0 && (
              <div className="py-20 text-center text-forge-text-muted text-xs">
                Add sections to start building your landing page
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionEditor({ section, onUpdate }) {
  switch (section.type) {
    case 'hero':
      return (
        <div className="space-y-2">
          <EditorField label="Headline" value={section.headline} onChange={(v) => onUpdate({ headline: v })} />
          <EditorField label="Subheadline" value={section.subheadline} onChange={(v) => onUpdate({ subheadline: v })} />
          <EditorField label="CTA Text" value={section.ctaText} onChange={(v) => onUpdate({ ctaText: v })} />
          <EditorField label="CTA URL" value={section.ctaUrl} onChange={(v) => onUpdate({ ctaUrl: v })} />
        </div>
      );
    case 'features':
      return (
        <div className="space-y-2">
          <EditorField label="Title" value={section.title} onChange={(v) => onUpdate({ title: v })} />
          <div>
            <label className="text-[10px] text-forge-text-muted block mb-1">Layout</label>
            <select
              value={section.layout || 'grid-3'}
              onChange={(e) => onUpdate({ layout: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text-secondary focus:outline-none"
            >
              <option value="grid-2">2 Columns</option>
              <option value="grid-3">3 Columns</option>
              <option value="grid-4">4 Columns</option>
            </select>
          </div>
          <FeatureItemsEditor items={section.items || []} onUpdate={(items) => onUpdate({ items })} />
        </div>
      );
    case 'screenshots':
      return (
        <div className="space-y-2">
          <EditorField label="Title" value={section.title} onChange={(v) => onUpdate({ title: v })} />
          <div>
            <label className="text-[10px] text-forge-text-muted block mb-1">Image URLs (one per line)</label>
            <textarea
              value={(section.images || []).join('\n')}
              onChange={(e) => onUpdate({ images: e.target.value.split('\n').filter(Boolean) })}
              rows={3}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text-secondary focus:outline-none resize-none font-mono"
              placeholder="/path/to/screenshot.png"
            />
          </div>
        </div>
      );
    case 'stats':
      return (
        <div className="space-y-2">
          <CounterEditor counters={section.counters || []} onUpdate={(counters) => onUpdate({ counters })} />
        </div>
      );
    case 'cta':
      return (
        <div className="space-y-2">
          <EditorField label="Headline" value={section.headline} onChange={(v) => onUpdate({ headline: v })} />
          <EditorField label="Subheadline" value={section.subheadline} onChange={(v) => onUpdate({ subheadline: v })} />
          <EditorField label="CTA Text" value={section.ctaText} onChange={(v) => onUpdate({ ctaText: v })} />
          <EditorField label="CTA URL" value={section.ctaUrl} onChange={(v) => onUpdate({ ctaUrl: v })} />
        </div>
      );
    default:
      return <p className="text-xs text-forge-text-muted">Unknown section type</p>;
  }
}

function EditorField({ label, value, onChange, multiline }) {
  return (
    <div>
      <label className="text-[10px] text-forge-text-muted block mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text-primary focus:outline-none resize-none"
        />
      ) : (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text-primary focus:outline-none"
        />
      )}
    </div>
  );
}

function FeatureItemsEditor({ items, onUpdate }) {
  const addItem = () => {
    onUpdate([...items, { icon: '\u2726', title: 'New Feature', description: 'Description' }]);
  };

  const updateItem = (index, updates) => {
    onUpdate(items.map((item, i) => i === index ? { ...item, ...updates } : item));
  };

  const removeItem = (index) => {
    onUpdate(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] text-forge-text-muted">Feature Items</label>
      {items.map((item, i) => (
        <div key={i} className="flex gap-1">
          <input
            value={item.icon || ''}
            onChange={(e) => updateItem(i, { icon: e.target.value })}
            className="w-8 px-1 py-1 text-xs rounded bg-forge-surface border border-forge-border text-center focus:outline-none"
          />
          <input
            value={item.title || ''}
            onChange={(e) => updateItem(i, { title: e.target.value })}
            className="flex-1 px-2 py-1 text-xs rounded bg-forge-surface border border-forge-border text-forge-text-primary focus:outline-none"
            placeholder="Title"
          />
          <button onClick={() => removeItem(i)} className="text-[10px] text-red-400 px-1">&#x2715;</button>
        </div>
      ))}
      <button onClick={addItem} className="text-[10px] text-forge-accent hover:underline">+ Add Feature</button>
    </div>
  );
}

function CounterEditor({ counters, onUpdate }) {
  const addCounter = () => {
    onUpdate([...counters, { label: 'Counter', value: 100 }]);
  };

  const updateCounter = (index, updates) => {
    onUpdate(counters.map((c, i) => i === index ? { ...c, ...updates } : c));
  };

  const removeCounter = (index) => {
    onUpdate(counters.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] text-forge-text-muted">Counters</label>
      {counters.map((counter, i) => (
        <div key={i} className="flex gap-1">
          <input
            value={counter.label || ''}
            onChange={(e) => updateCounter(i, { label: e.target.value })}
            className="flex-1 px-2 py-1 text-xs rounded bg-forge-surface border border-forge-border text-forge-text-primary focus:outline-none"
            placeholder="Label"
          />
          <input
            type="number"
            value={counter.value || 0}
            onChange={(e) => updateCounter(i, { value: parseInt(e.target.value) || 0 })}
            className="w-20 px-2 py-1 text-xs rounded bg-forge-surface border border-forge-border text-forge-text-primary focus:outline-none"
          />
          <button onClick={() => removeCounter(i)} className="text-[10px] text-red-400 px-1">&#x2715;</button>
        </div>
      ))}
      <button onClick={addCounter} className="text-[10px] text-forge-accent hover:underline">+ Add Counter</button>
    </div>
  );
}

function RenderSection({ section, template, isPreview }) {
  switch (section.type) {
    case 'hero': return <HeroSection config={section} template={template} isPreview={isPreview} />;
    case 'features': return <FeatureGrid config={section} template={template} isPreview={isPreview} />;
    case 'screenshots': return <ScreenshotGallery config={section} template={template} isPreview={isPreview} />;
    case 'stats': return <StatsCounter config={section} template={template} isPreview={isPreview} />;
    case 'cta': return <CTAFooter config={section} template={template} isPreview={isPreview} />;
    default: return null;
  }
}
