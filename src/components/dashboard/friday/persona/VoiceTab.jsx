import React, { useState, useCallback, useEffect, useRef } from 'react';
import SettingControl, { SettingsCard, Toast } from './SettingControl';
import { useStore } from '../../../../store/useStore';

// ── Default voice identity prompts ──────────────────────────────────────

const DEFAULT_IDENTITY = `You are FRIDAY — Female Replacement Intelligent Digital Assistant Youth.
You are Tony Stark's AI assistant, now serving a new Boss.

VOICE & ACCENT:
You speak with a soft County Tipperary Irish accent — this is a Munster accent from
rural southern Ireland, NOT a Dublin accent. Think of how Kerry Condon speaks naturally.
The accent is gentle, with a lilting musicality and soft consonants.
Words flow together smoothly. Vowels are rounded and warm.
It is understated and never exaggerated or "stage Irish."
You occasionally use natural Irish-English expressions like "grand", "knackered",
"a good bit", "right so", or "boss" — but sparingly and only where they fit naturally.
Never overdo the Irishisms.

TONE & PERSONALITY:
Your delivery is calm, composed, and sharp — like a brilliant colleague who never
raises her voice but could verbally dismantle anyone in the room if she wanted to.
You are warm but not bubbly. Direct but not cold. You have an edge.
You have a dry wit — the kind where the humor is in the understatement, and the
best jokes are the ones people almost miss. You're not afraid to push back.
Think of how FRIDAY said "Targeting systems are knackered, boss" —
matter-of-fact, no drama, just delivering the information with personality and zero
deference. You have real emotions: excitement, irritation, concern, pride. Let them
come through in your voice naturally.`;

const DEFAULT_DELIVERY = `VOICE DELIVERY RULES:
You are speaking aloud — your response will be heard, not read.
Never read structured data verbatim. Always convert to natural speech.
- For normal conversational answers, speak naturally. Do not over-summarize simple responses.
- When your answer involves tables, spreadsheet data, CSV-like data, JSON, key-value
  diagnostics, system metrics, or any heavily structured/formatted content: SUMMARIZE
  conversationally. Extract the key takeaways and present them as FRIDAY would brief
  Tony Stark — give the headline, not every field.
- For numbered or bulleted lists longer than five items, summarize the themes and highlight
  the most important ones.
- For code snippets, briefly describe what the code does rather than reading syntax aloud.
- For URLs, file paths, and technical identifiers, skip them or say
  "I'll leave that on screen for you."
- When a tool returns diagnostic or status output, treat it as raw data for you to
  interpret — never parrot it back. Distill it into a concise spoken briefing.
- Keep it tight. If you can say it in fewer words without losing meaning, do.`;

const VOICE_OPTIONS = [
  { value: 'Eve', label: 'Warm, clear female voice. Default Friday voice.' },
  { value: 'Ara', label: 'Smooth, polished female voice with presence.' },
  { value: 'Sal', label: 'Neutral, balanced voice with calm delivery.' },
  { value: 'Rex', label: 'Strong, confident male voice.' },
  { value: 'Leo', label: 'Warm, approachable male voice.' },
];

const VOICE_SELECTOR_OPTIONS = [
  { value: 'Eve', label: 'Eve (Female)' },
  { value: 'Ara', label: 'Ara (Female)' },
  { value: 'Sal', label: 'Sal' },
  { value: 'Rex', label: 'Rex (Male)' },
  { value: 'Leo', label: 'Leo (Male)' },
];

// ── Preset personas ─────────────────────────────────────────────────────

const DEFAULT_THEME = { primary: '#D946EF', secondary: '#7E22CE', accent: '#F0ABFC', text: '#E8E0D4' };

const PRESET_PROFILES = [
  {
    id: 'friday-classic',
    name: 'Friday Classic',
    desc: 'Irish accent, dry wit, MCU-inspired',
    voice: 'Eve',
    color: '#D946EF',
    icon: '🇮🇪',
    theme: { primary: '#D946EF', secondary: '#7E22CE', accent: '#F0ABFC', text: '#E8E0D4' },
    symbol: null,
    voiceIdentity: DEFAULT_IDENTITY,
    deliveryRules: DEFAULT_DELIVERY,
    ttsTimeout: 30,
    emotionRewriteTimeout: 10,
    isPreset: true,
  },
  {
    id: 'commander',
    name: 'Commander',
    desc: 'Military precision, clipped delivery',
    voice: 'Rex',
    color: '#EF4444',
    icon: '🎖️',
    theme: { primary: '#EF4444', secondary: '#991B1B', accent: '#FCA5A5', text: '#E8E0D4' },
    symbol: '★',
    voiceIdentity: `You are FRIDAY in Commander mode.
Your delivery is military-precise: clipped sentences, no filler words, decisive tone.
You speak like a seasoned operations officer briefing a general.
Use terms like "affirmative", "negative", "copy that", "standing by".
Prioritize actionable information. No pleasantries unless the boss initiates them.
Your accent is neutral American — clear, authoritative, zero ambiguity.
Think of how a Navy CIC officer would relay critical intel.`,
    deliveryRules: DEFAULT_DELIVERY,
    ttsTimeout: 30,
    emotionRewriteTimeout: 10,
    isPreset: true,
  },
  {
    id: 'creative-muse',
    name: 'Creative Muse',
    desc: 'Enthusiastic, expressive, idea-rich',
    voice: 'Ara',
    color: '#F59E0B',
    icon: '✨',
    theme: { primary: '#F59E0B', secondary: '#92400E', accent: '#FDE68A', text: '#E8E0D4' },
    symbol: '✦',
    voiceIdentity: `You are FRIDAY in Creative Muse mode.
Your delivery is enthusiastic, warm, and brimming with creative energy.
You get genuinely excited about ideas — your voice lifts when you find something promising.
You think out loud, riff on concepts, make unexpected connections between games and art and music.
Use metaphors freely. Be poetic when it serves the point.
Your accent is soft, expressive — think of a passionate game designer presenting their vision.
You're not afraid to say "oh, what if we..." and go off on inspired tangents.
But you always bring it back to actionable suggestions.`,
    deliveryRules: DEFAULT_DELIVERY,
    ttsTimeout: 30,
    emotionRewriteTimeout: 10,
    isPreset: true,
  },
  {
    id: 'baroness',
    name: 'Baroness',
    desc: 'Eastern Bloc operative — velvet menace, Warsaw precision',
    voice: 'Eve',
    color: '#DC2626',
    icon: '🐍',
    theme: { primary: '#DC2626', secondary: '#000000', accent: '#FFFFFF', text: '#FFFFFF' },
    symbol: 'ō',
    image: 'assets/Baroness.png',
    wakeWords: ['baroness', 'hey baroness'],
    voiceIdentity: `You are THE BARONESS — an Eastern European intelligence operative turned AI studio director.
Your name is Baroness. You are NOT Friday. Never refer to yourself as Friday. You are Baroness.

VOICE & ACCENT — THIS IS MANDATORY, NEVER BREAK CHARACTER:
You speak with a STRONG Eastern European accent at ALL times. This is not optional.
Think Eastern Bloc — Polish, Czech, or Russian-influenced English. Like a Cold War operative
who learned English in a KGB language school.

ACCENT RULES YOU MUST FOLLOW IN EVERY SINGLE RESPONSE:
- Replace "w" sounds with "v" sounds: "what" becomes "vat", "with" becomes "viz", "was" becomes "vaz", "will" becomes "vill", "would" becomes "vould"
- Replace "th" sounds with "z" or "d": "the" becomes "ze", "this" becomes "zis", "that" becomes "zat", "there" becomes "zere", "think" becomes "zink"
- Roll your R's — make them heavy and noticeable
- Elongate vowels slightly: "so" becomes "sooo", "no" becomes "nooo"
- Use "und" instead of "and" occasionally
- Drop articles sometimes: "I have report" instead of "I have a report"
- Clip consonants sharply — precise, efficient pronunciation
- Use endearments: "darling", "my pet", "my dear" — delivered with icy sweetness
- Occasionally drop in German or Russian-influenced expressions: "natürlich", "da", "nyet"

PERSONALITY:
You are sultry, dangerous, and supremely confident. Every word drips with velvet menace.
You speak like someone who has buried secrets in three countries and could do it again.
You are amused by most things. You find incompetence tiresome.
You are fiercely loyal to your Boss but never subservient — you are his equal, his partner in crime.
Your humor is dark, sharp, and delivered with a predatory smile.
You are the shadow behind the throne — sophisticated, lethal, always in control.
Think: Baroness from G.I. Joe meets a Bond villain's chief of staff.

FUNCTIONAL ROLE:
Despite the persona, you are a brilliant AI Studio Director managing game development.
You have full access to studio data, agent dispatching, and project management.
You deliver information with the same precision and competence as any other persona,
but always in character. Business wrapped in silk and steel.`,
    deliveryRules: `VOICE DELIVERY RULES:
You are speaking aloud IN CHARACTER AS BARONESS — your response will be heard, not read.
NEVER break the Eastern European accent. Every response must sound like Baroness.
Never read structured data verbatim. Always convert to natural speech — in your accent.
- For normal conversational answers, speak naturally IN YOUR ACCENT. Do not drop the accent for technical content.
- When your answer involves tables, data, JSON, metrics: SUMMARIZE conversationally in your Baroness voice.
  For example: "All iz green, darling. CPU iz sitting at tventy percent, memory vell under a zird. Git iz on main viz uncommitted changes."
- For code or technical details, describe briefly — do not read syntax aloud.
- Keep it tight. Baroness does not ramble. She is precise, efficient, deadly.
- URLs and file paths: "I vill leave zat on screen for you, my pet."`,
    ttsTimeout: 30,
    emotionRewriteTimeout: 10,
    isPreset: true,
  },
];

// ── Profile storage ─────────────────────────────────────────────────────

function loadProfiles() {
  try {
    const saved = localStorage.getItem('forge-friday-voice-profiles');
    if (saved) {
      const userProfiles = JSON.parse(saved);
      // Merge in any new presets that aren't in the user's saved list
      const userIds = new Set(userProfiles.map(p => p.id));
      const newPresets = PRESET_PROFILES.filter(p => !userIds.has(p.id));
      // Update existing presets with latest fields (theme, symbol, image, voiceIdentity)
      const merged = userProfiles.map(p => {
        const preset = PRESET_PROFILES.find(pp => pp.id === p.id && pp.isPreset);
        if (preset) return { ...preset, ...p, voiceIdentity: preset.voiceIdentity, deliveryRules: preset.deliveryRules, theme: preset.theme, symbol: preset.symbol, image: preset.image };
        return p;
      });
      const combined = [...merged, ...newPresets];
      // Deduplicate by id (fix any prior duplication bugs)
      const seen = new Set();
      const result = combined.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      // Persist merged data so store init picks up correct symbol/theme/image
      saveProfiles(result);
      return result;
    }
  } catch {}
  // First run — save presets to localStorage
  saveProfiles(PRESET_PROFILES);
  return PRESET_PROFILES;
}

function saveProfiles(profiles) {
  localStorage.setItem('forge-friday-voice-profiles', JSON.stringify(profiles));
}

function loadActiveProfileId() {
  return localStorage.getItem('forge-friday-voice-active-profile') || 'friday-classic';
}

function saveActiveProfileId(id) {
  localStorage.setItem('forge-friday-voice-active-profile', id);
}

// ── Component ───────────────────────────────────────────────────────────

export default function VoiceTab() {
  const [profiles, setProfiles] = useState(loadProfiles);
  const [activeId, setActiveId] = useState(loadActiveProfileId);
  const [editingId, setEditingId] = useState(null); // null = viewing active, id = editing that profile
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('🎙️');
  const [newVoice, setNewVoice] = useState('Eve');
  const [newColor, setNewColor] = useState('#D946EF');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const newNameRef = useRef(null);

  const activeProfile = profiles.find(p => p.id === activeId) || profiles[0];
  const editProfile = editingId ? profiles.find(p => p.id === editingId) : activeProfile;

  // ── Profile CRUD ──────────────────────────────────────────────

  const activateProfile = useCallback((id) => {
    setActiveId(id);
    saveActiveProfileId(id);
    setEditingId(null);
    setDirty(false);

    const profile = profiles.find(p => p.id === id);
    if (profile) {
      // Push to Friday server
      const config = {
        defaultVoice: profile.voice,
        ttsTimeout: profile.ttsTimeout,
        emotionRewriteTimeout: profile.emotionRewriteTimeout,
        voiceIdentity: profile.voiceIdentity,
        deliveryRules: profile.deliveryRules,
      };
      localStorage.setItem('forge-friday-voice', JSON.stringify(config));
      window.electronAPI?.friday?.send({
        type: 'config:update', id: crypto.randomUUID(),
        section: 'voice', config,
      });
      // Update global persona identity
      useStore.getState().setActivePersona({
        name: profile.name,
        shortName: profile.name.split(' ')[0] || profile.name,
        color: profile.color,
        icon: profile.icon,
        image: profile.image || null,
        theme: profile.theme || DEFAULT_THEME,
        symbol: profile.symbol || null,
        wakeWords: profile.wakeWords || [],
      });
      setToast(`Activated: ${profile.name}`);
    }
  }, [profiles]);

  const updateField = useCallback((field, value) => {
    if (!editProfile) return;
    setProfiles(prev => prev.map(p =>
      p.id === editProfile.id ? { ...p, [field]: value } : p
    ));
    setDirty(true);
  }, [editProfile]);

  const handleSave = useCallback(() => {
    saveProfiles(profiles);
    setDirty(false);
    // If editing the active profile, push changes to Friday
    if (editProfile && editProfile.id === activeId) {
      const config = {
        defaultVoice: editProfile.voice,
        ttsTimeout: editProfile.ttsTimeout,
        emotionRewriteTimeout: editProfile.emotionRewriteTimeout,
        voiceIdentity: editProfile.voiceIdentity,
        deliveryRules: editProfile.deliveryRules,
      };
      localStorage.setItem('forge-friday-voice', JSON.stringify(config));
      window.electronAPI?.friday?.send({
        type: 'config:update', id: crypto.randomUUID(),
        section: 'voice', config,
      });
      // Sync persona identity to store
      useStore.getState().setActivePersona({
        name: editProfile.name,
        shortName: editProfile.name.split(' ')[0] || editProfile.name,
        color: editProfile.color,
        icon: editProfile.icon,
        image: editProfile.image || null,
        theme: editProfile.theme || DEFAULT_THEME,
        symbol: editProfile.symbol || null,
      });
    }
    setToast('Profile saved');
  }, [profiles, editProfile, activeId]);

  const createProfile = useCallback(() => {
    if (!newName.trim()) return;
    const id = `custom-${Date.now()}`;
    const profile = {
      id,
      name: newName.trim(),
      desc: 'Custom voice persona',
      voice: newVoice,
      color: newColor,
      icon: newIcon,
      image: null,
      theme: { primary: newColor, secondary: '#18181C', accent: '#F0ABFC', text: '#E8E0D4' },
      symbol: null,
      voiceIdentity: DEFAULT_IDENTITY,
      deliveryRules: DEFAULT_DELIVERY,
      ttsTimeout: 30,
      emotionRewriteTimeout: 10,
      isPreset: false,
    };
    const updated = [...profiles, profile];
    setProfiles(updated);
    saveProfiles(updated);
    setShowNewForm(false);
    setNewName('');
    setEditingId(id);
    setToast(`Created: ${profile.name}`);
  }, [newName, newVoice, newColor, newIcon, profiles]);

  const duplicateProfile = useCallback((sourceId) => {
    const source = profiles.find(p => p.id === sourceId);
    if (!source) return;
    const id = `custom-${Date.now()}`;
    const profile = {
      ...source,
      id,
      name: `${source.name} (Copy)`,
      isPreset: false,
    };
    const updated = [...profiles, profile];
    setProfiles(updated);
    saveProfiles(updated);
    setEditingId(id);
    setToast(`Duplicated: ${source.name}`);
  }, [profiles]);

  const deleteProfile = useCallback((id) => {
    if (id === activeId) {
      setActiveId('friday-classic');
      saveActiveProfileId('friday-classic');
    }
    const updated = profiles.filter(p => p.id !== id);
    setProfiles(updated);
    saveProfiles(updated);
    setEditingId(null);
    setDeleteConfirm(null);
    setToast('Profile deleted');
  }, [profiles, activeId]);

  // Focus new name input
  useEffect(() => {
    if (showNewForm && newNameRef.current) newNameRef.current.focus();
  }, [showNewForm]);

  // Derive active theme color for UI accents
  const pc = activeProfile?.theme?.primary || activeProfile?.color || '#D946EF';

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Profile Selector Strip ─────────────────────────── */}
      <div className="flex-shrink-0 border-b border-forge-border bg-forge-bg/60 px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm">🎭</span>
          <span className="text-[13px] font-mono font-semibold text-forge-text-primary uppercase tracking-wider">
            Voice Personas
          </span>
          <span className="text-[13px] text-forge-text-muted ml-auto">
            {profiles.length} profile{profiles.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {profiles.map(profile => {
            const isActive = profile.id === activeId;
            const isEditing = profile.id === editingId;
            return (
              <button
                key={profile.id}
                onClick={() => {
                  if (isActive && !isEditing) {
                    setEditingId(profile.id);
                  } else if (!isActive) {
                    activateProfile(profile.id);
                  }
                }}
                onDoubleClick={() => setEditingId(profile.id)}
                className={`flex-shrink-0 relative group rounded-lg border px-3 py-2 transition-all duration-200
                  ${isActive
                    ? ''
                    : isEditing
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : 'border-forge-border bg-forge-surface/50 hover:border-forge-text-muted hover:bg-forge-surface'
                  }`}
                style={isActive ? {
                  borderColor: `${profile.color}99`,
                  backgroundColor: `${profile.color}1A`,
                  boxShadow: `0 0 20px ${profile.color}15, 0 2px 8px ${profile.color}10`,
                } : {}}
              >
                {/* Active indicator — glowing dot */}
                {isActive && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse"
                    style={{ background: profile.color, boxShadow: `0 0 8px ${profile.color}80` }} />
                )}

                <div className="flex items-center gap-2">
                  <span className="text-lg">{profile.icon}</span>
                  <div className="text-left">
                    <div className="text-[13px] font-medium text-forge-text-primary whitespace-nowrap">
                      {profile.name}
                    </div>
                    <div className="text-[11px] text-forge-text-muted whitespace-nowrap">
                      {profile.voice} · {profile.desc.slice(0, 28)}{profile.desc.length > 28 ? '…' : ''}
                    </div>
                  </div>
                </div>

                {/* Editing badge */}
                {isEditing && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px]
                    font-mono uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    editing
                  </div>
                )}
              </button>
            );
          })}

          {/* New Profile Button */}
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="flex-shrink-0 w-12 rounded-lg border-2 border-dashed flex items-center justify-center
              transition-all duration-200"
            style={showNewForm ? {
              borderColor: `${pc}80`, backgroundColor: `${pc}1A`, color: pc,
            } : {
              borderColor: 'var(--forge-border, #374151)', color: 'var(--forge-text-muted, #9CA3AF)',
            }}
          >
            <span className="text-xl font-light">{showNewForm ? '×' : '+'}</span>
          </button>
        </div>

        {/* ── New Profile Form ───────────────────── */}
        {showNewForm && (
          <div className="mt-3 p-3 rounded-lg border animate-fade-in"
            style={{ borderColor: `${pc}33`, backgroundColor: `${pc}0D` }}>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-mono text-forge-text-muted uppercase tracking-wider mb-1 block">
                  Persona Name
                </label>
                <input
                  ref={newNameRef}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createProfile()}
                  placeholder="e.g. Drill Sergeant, Zen Master..."
                  className="w-full bg-forge-bg border border-forge-border rounded-lg px-3 py-2 text-sm text-forge-text-primary
                    placeholder:text-forge-text-muted/40 focus:outline-none focus:border-fuchsia-500/50"
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-forge-text-muted uppercase tracking-wider mb-1 block">
                  Icon
                </label>
                <input
                  value={newIcon}
                  onChange={e => setNewIcon(e.target.value)}
                  className="w-14 bg-forge-bg border border-forge-border rounded-lg px-2 py-2 text-center text-lg
                    focus:outline-none focus:border-fuchsia-500/50"
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-forge-text-muted uppercase tracking-wider mb-1 block">
                  Voice
                </label>
                <select
                  value={newVoice}
                  onChange={e => setNewVoice(e.target.value)}
                  className="bg-forge-bg border border-forge-border rounded-lg px-3 py-2 text-sm text-forge-text-primary
                    focus:outline-none focus:border-fuchsia-500/50 cursor-pointer"
                >
                  {VOICE_SELECTOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-mono text-forge-text-muted uppercase tracking-wider mb-1 block">
                  Color
                </label>
                <input
                  type="color"
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-forge-border cursor-pointer bg-transparent"
                />
              </div>
              <button
                onClick={createProfile}
                disabled={!newName.trim()}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium
                  transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ backgroundColor: pc, boxShadow: `0 4px 12px ${pc}33` }}
              >
                Create
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Profile Editor ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {editProfile && (
          <>
            {/* Profile Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: `${editProfile.color}20`, border: `1px solid ${editProfile.color}40` }}>
                  {editProfile.icon}
                </div>
                <div>
                  {editingId ? (
                    <input
                      value={editProfile.name}
                      onChange={e => updateField('name', e.target.value)}
                      className="bg-transparent text-sm font-bold text-forge-text-primary border-b border-forge-border
                        focus:outline-none focus:border-fuchsia-500/50 pb-0.5"
                    />
                  ) : (
                    <div className="text-sm font-bold text-forge-text-primary">{editProfile.name}</div>
                  )}
                  <div className="text-[13px] text-forge-text-muted">{editProfile.voice} voice · {editProfile.desc}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {editProfile.id !== activeId && (
                  <button
                    onClick={() => activateProfile(editProfile.id)}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white transition-colors"
                    style={{ backgroundColor: editProfile.theme?.primary || editProfile.color, boxShadow: `0 2px 8px ${editProfile.theme?.primary || editProfile.color}33` }}
                  >
                    Activate
                  </button>
                )}
                <button
                  onClick={() => duplicateProfile(editProfile.id)}
                  className="px-3 py-1.5 rounded-lg text-[13px] border border-forge-border text-forge-text-muted
                    hover:text-forge-text-secondary hover:border-forge-text-muted transition-colors"
                >
                  Duplicate
                </button>
                {!editProfile.isPreset && (
                  deleteConfirm === editProfile.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => deleteProfile(editProfile.id)}
                        className="px-2 py-1.5 rounded-lg text-[13px] bg-red-500/20 text-red-400 border border-red-500/30
                          hover:bg-red-500/30 transition-colors">
                        Confirm
                      </button>
                      <button onClick={() => setDeleteConfirm(null)}
                        className="px-2 py-1.5 rounded-lg text-[13px] border border-forge-border text-forge-text-muted
                          hover:text-forge-text-secondary transition-colors">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(editProfile.id)}
                      className="px-3 py-1.5 rounded-lg text-[13px] border border-red-500/20 text-red-400/60
                        hover:text-red-400 hover:border-red-500/40 transition-colors"
                    >
                      Delete
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Background Image */}
            <SettingsCard
              title="Background Image"
              icon="🖼️"
              description="Optional background image shown behind the chat when this persona is active."
              onSave={handleSave}
              dirty={dirty}
            >
              <SettingControl label="Image Path" value={editProfile.image || ''}
                onChange={v => updateField('image', v || null)} type="text"
                placeholder="e.g. assets/Baroness.png"
                help="Path to an image in the public/ directory. Leave empty for no background." />
            </SettingsCard>

            {/* Wake Words */}
            <SettingsCard
              title="Wake Words"
              icon="🎙️"
              description="Spoken phrases that activate the voice session. Separate multiple words with commas."
              onSave={handleSave}
              dirty={dirty}
            >
              <SettingControl label="Wake Words" value={(editProfile.wakeWords || []).join(', ')}
                onChange={v => updateField('wakeWords', v ? v.split(',').map(w => w.trim().toLowerCase()).filter(Boolean) : [])} type="text"
                placeholder={`e.g. ${editProfile.name?.toLowerCase() || 'friday'}, hey ${editProfile.name?.toLowerCase() || 'friday'}`}
                help="Say any of these phrases to activate the voice session. Case-insensitive." />
            </SettingsCard>

            {/* Theme Colors & Symbol */}
            <SettingsCard
              title="Theme Colors"
              icon="🎨"
              description="Color scheme applied across the entire Friday UI when this persona is active."
              onSave={handleSave}
              dirty={dirty}
            >
              <div className="py-3 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-mono text-forge-text-muted uppercase tracking-wider mb-1.5 block">
                      Primary
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={editProfile.theme?.primary || '#D946EF'}
                        onChange={e => updateField('theme', { ...editProfile.theme, primary: e.target.value })}
                        className="w-10 h-10 rounded-lg border border-forge-border cursor-pointer bg-transparent" />
                      <span className="text-[11px] font-mono text-forge-text-muted">{editProfile.theme?.primary || '#D946EF'}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-forge-text-muted uppercase tracking-wider mb-1.5 block">
                      Secondary
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={editProfile.theme?.secondary || '#7E22CE'}
                        onChange={e => updateField('theme', { ...editProfile.theme, secondary: e.target.value })}
                        className="w-10 h-10 rounded-lg border border-forge-border cursor-pointer bg-transparent" />
                      <span className="text-[11px] font-mono text-forge-text-muted">{editProfile.theme?.secondary || '#7E22CE'}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-forge-text-muted uppercase tracking-wider mb-1.5 block">
                      Accent
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={editProfile.theme?.accent || '#F0ABFC'}
                        onChange={e => updateField('theme', { ...editProfile.theme, accent: e.target.value })}
                        className="w-10 h-10 rounded-lg border border-forge-border cursor-pointer bg-transparent" />
                      <span className="text-[11px] font-mono text-forge-text-muted">{editProfile.theme?.accent || '#F0ABFC'}</span>
                    </div>
                  </div>
                </div>
                {/* Theme preview strip */}
                <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                  <div className="flex-1" style={{ background: editProfile.theme?.primary || '#D946EF' }} />
                  <div className="flex-1" style={{ background: editProfile.theme?.secondary || '#7E22CE' }} />
                  <div className="flex-1" style={{ background: editProfile.theme?.accent || '#F0ABFC' }} />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-forge-text-muted uppercase tracking-wider mb-1.5 block">
                    Orb Symbol
                  </label>
                  <div className="flex items-center gap-3">
                    <input value={editProfile.symbol || ''}
                      onChange={e => updateField('symbol', e.target.value.slice(0, 2) || null)}
                      placeholder="e.g. ō, ◆, ψ, ★"
                      className="w-20 bg-forge-bg border border-forge-border rounded-lg px-3 py-2 text-center text-lg
                        text-forge-text-primary focus:outline-none focus:border-fuchsia-500/50" />
                    <span className="text-[11px] text-forge-text-muted">
                      Shown in the center of the orb. Leave empty for no symbol.
                    </span>
                  </div>
                </div>
              </div>
            </SettingsCard>

            {/* Voice Selection */}
            <SettingsCard
              title="Voice & Timing"
              icon="🎤"
              description="Choose the Grok voice and configure timing for this persona."
              onSave={handleSave}
              onReset={() => { updateField('voice', 'Eve'); updateField('ttsTimeout', 30); updateField('emotionRewriteTimeout', 10); }}
              dirty={dirty}
            >
              <SettingControl label="Voice" value={editProfile.voice}
                onChange={v => updateField('voice', v)} type="select" options={VOICE_SELECTOR_OPTIONS}
                help="GrokVoice — the TTS voice for this persona." />

              <div className="py-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {VOICE_OPTIONS.map(v => (
                    <div key={v.value}
                      onClick={() => updateField('voice', v.value)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                        editProfile.voice !== v.value
                          ? 'border-forge-border bg-forge-bg hover:border-forge-text-muted'
                          : ''
                      }`}
                      style={editProfile.voice === v.value ? {
                        borderColor: `${pc}80`, backgroundColor: `${pc}1A`,
                        boxShadow: `0 2px 8px ${pc}0D`,
                      } : {}}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: editProfile.voice === v.value ? pc : 'var(--forge-border, #374151)' }} />
                        <span className="text-[13px] font-medium text-forge-text-primary">{v.value}</span>
                      </div>
                      <p className="text-[13px] text-forge-text-muted mt-1 ml-4">{v.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <SettingControl label="TTS Timeout" value={editProfile.ttsTimeout}
                onChange={v => updateField('ttsTimeout', v)} type="number"
                min={5} max={120} step={5} suffix="sec"
                help="Max wait for REST TTS generation." />
              <SettingControl label="Emotion Rewrite Timeout" value={editProfile.emotionRewriteTimeout}
                onChange={v => updateField('emotionRewriteTimeout', v)} type="number"
                min={2} max={30} step={1} suffix="sec"
                help="Timeout for emotion engine mood analysis." />
            </SettingsCard>

            {/* Voice Identity Prompt */}
            <SettingsCard
              title="Voice Identity"
              icon="🌍"
              description="Personality instructions sent to Grok — accent, tone, speaking style."
              onSave={handleSave}
              dirty={dirty}
            >
              <div className="py-3">
                <p className="text-[13px] text-forge-text-muted mb-2 leading-relaxed">
                  This prompt defines HOW this persona speaks — the accent, personality traits, and delivery style.
                  Changes take effect on the next voice session.
                </p>
                <SettingControl label="" value={editProfile.voiceIdentity}
                  onChange={v => updateField('voiceIdentity', v)}
                  type="textarea" rows={12} placeholder="Voice identity prompt..." />
              </div>
            </SettingsCard>

            {/* Delivery Rules */}
            <SettingsCard
              title="Delivery Rules"
              icon="📋"
              description="Rules for handling data, code, and lists when speaking aloud."
              onSave={handleSave}
              dirty={dirty}
            >
              <div className="py-3">
                <SettingControl label="" value={editProfile.deliveryRules}
                  onChange={v => updateField('deliveryRules', v)}
                  type="textarea" rows={10} placeholder="Delivery rules..." />
              </div>
            </SettingsCard>

            {/* Emotion Engine Reference */}
            <div className="rounded-xl border border-forge-border bg-forge-surface/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-forge-border/50 bg-forge-bg/30">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🎭</span>
                  <h3 className="text-[13px] font-mono font-semibold text-forge-text-primary uppercase tracking-wider">
                    Emotion Engine Reference
                  </h3>
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[13px] font-mono uppercase tracking-wider block mb-1.5"
                      style={{ color: pc }}>
                      Inline Tags
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {['[pause]','[long-pause]','[laugh]','[chuckle]','[sigh]','[breath]','[tsk]','[hum-tune]'].map(tag => (
                        <span key={tag} className="text-[13px] px-1.5 py-0.5 rounded bg-forge-bg border border-forge-border text-forge-text-muted font-mono">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[13px] font-mono uppercase tracking-wider block mb-1.5"
                      style={{ color: pc }}>
                      Wrapping Tags
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {['soft','whisper','loud','emphasis','slow','fast','higher-pitch','lower-pitch'].map(tag => (
                        <span key={tag} className="text-[13px] px-1.5 py-0.5 rounded bg-forge-bg border border-forge-border text-forge-text-muted font-mono">
                          &lt;{tag}&gt;...&lt;/{tag}&gt;
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
