/**
 * Gauntlet Arcade Sound System
 * Uses actual 1985 Gauntlet arcade game clips from basementarcade.com.
 * Falls back to Web Audio synth if clips fail to load.
 * Supports custom sound file mapping via Settings panel.
 */

// Preloaded audio buffers
const audioCache = new Map();
let audioCtx = null;
let masterVolume = 1.0;

// Load persisted config
function loadSoundConfig() {
  try {
    const stored = localStorage.getItem('forge-sound-config');
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
}

function loadMasterVolume() {
  try {
    const stored = localStorage.getItem('forge-master-volume');
    return stored ? parseFloat(stored) : 1.0;
  } catch { return 1.0; }
}

// Initialize master volume from persisted value
masterVolume = loadMasterVolume();

export function getSoundConfig() {
  return loadSoundConfig();
}

export function setSoundMapping(eventName, filePath) {
  const config = loadSoundConfig();
  if (filePath) {
    config[eventName] = filePath;
  } else {
    delete config[eventName];
  }
  localStorage.setItem('forge-sound-config', JSON.stringify(config));
  // Clear cache for this event so next play uses the new file
  audioCache.delete(eventName);
  audioCache.delete(`custom-${eventName}`);
}

export function setMasterVolume(vol) {
  masterVolume = Math.max(0, Math.min(1, vol));
  localStorage.setItem('forge-master-volume', String(masterVolume));
}

export function getMasterVolume() {
  return masterVolume;
}

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Sound → Gauntlet clip mapping
const GAUNTLET_CLIPS = {
  complete:  '/sounds/levelchange.mp3',   // "Completion of a level"
  resolve:   '/sounds/treasure.mp3',      // "Treasure 100 points"
  spawn:     '/sounds/dooropen.mp3',      // Open a door
  copy:      '/sounds/keypickup.mp3',     // Pick up a key
  failed:    '/sounds/die.mp3',           // Player dies
  dismiss:   '/sounds/exit.mp3',          // Exit
  alert:     '/sounds/needsfood.mp3',     // "Needs food badly!"
  click:     '/sounds/coin.mp3',          // Insert a coin
  tab:       '/sounds/coin.mp3',          // Insert a coin (reuse)
  welcome:   '/sounds/welcome.mp3',       // Welcome
  brave:     '/sounds/brave.mp3',         // "I've not seen such bravery!"
  shotfood:  '/sounds/someoneshot.mp3',   // "Someone shot the food!"
  ow:        '/sounds/ow.mp3',            // Ow!
  death:     '/sounds/death.mp3',         // Death music
  lifeforce: '/sounds/lifeforce.mp3',     // "Your life force is running out"
  reminder:     '/sounds/reminder.mp3',      // Reminder
  'chat-message': '/sounds/icq-uhoh.mp3',   // ICQ "uh oh" for team chat
  'idea-new':     '/sounds/idea-ping.mp3',   // New idea dropped on board
  'idea-analyzed':'/sounds/idea-chime.mp3',  // Idea analysis complete
  'friday-connect': '/sounds/friday-connect.mp3',  // Friday connection established
  'friday-message': '/sounds/friday-message.mp3',  // Friday message received
  'friday-alert':   '/sounds/friday-alert.mp3',    // Friday attention needed
};

// All available sound events (for settings panel)
export const SOUND_EVENTS = Object.keys(GAUNTLET_CLIPS);

// Volume per sound type (Gauntlet clips can be loud)
const VOLUMES = {
  complete:  0.35,
  resolve:   0.30,
  spawn:     0.25,
  copy:      0.20,
  failed:    0.30,
  dismiss:   0.20,
  alert:     0.35,
  click:     0.15,
  tab:       0.10,
  welcome:   0.35,
  brave:     0.35,
  shotfood:  0.30,
  ow:        0.25,
  death:     0.30,
  lifeforce: 0.30,
  reminder:        0.30,
  'chat-message':  0.25,
  'idea-new':      0.25,
  'idea-analyzed': 0.30,
  'friday-connect': 0.25,
  'friday-message': 0.20,
  'friday-alert':   0.30,
};

/**
 * Preload a clip into an AudioBuffer for instant playback.
 */
async function loadClip(type) {
  if (audioCache.has(type)) return audioCache.get(type);

  const url = GAUNTLET_CLIPS[type];
  if (!url) return null;

  try {
    const ctx = getAudioCtx();
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    audioCache.set(type, audioBuffer);
    return audioBuffer;
  } catch {
    return null;
  }
}

/**
 * Preload all clips on first user interaction for instant playback.
 */
let preloaded = false;
export function preloadSounds() {
  if (preloaded) return;
  preloaded = true;
  // Load the most-used clips first
  const priority = ['click', 'resolve', 'dismiss', 'spawn', 'copy', 'complete', 'failed', 'tab'];
  const rest = Object.keys(GAUNTLET_CLIPS).filter(k => !priority.includes(k));
  [...priority, ...rest].forEach(type => loadClip(type));
}

/**
 * Play a custom audio file via HTML5 Audio element.
 */
function playCustomFile(filePath, volume) {
  try {
    const audio = new Audio(filePath);
    audio.volume = volume * masterVolume;
    audio.play().catch(() => {});
  } catch {
    // Non-critical
  }
}

/**
 * Play a Gauntlet arcade sound. Checks for custom mapping first.
 * Falls back to synth if clip isn't loaded yet.
 */
export function playSound(type) {
  if (masterVolume <= 0) return;

  try {
    // Check custom mapping first
    const config = loadSoundConfig();
    if (config[type]) {
      playCustomFile(config[type], VOLUMES[type] || 0.25);
      return;
    }

    const ctx = getAudioCtx();

    // Try preloaded clip first
    const buffer = audioCache.get(type);
    if (buffer) {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = (VOLUMES[type] || 0.25) * masterVolume;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
      return;
    }

    // Clip not cached yet — play synth fallback AND async-load for next time
    loadClip(type);
    playSynthFallback(type);

  } catch {
    // Sounds are non-critical
  }
}

/**
 * Preview a sound (for settings panel). Plays the custom file if set, otherwise default.
 */
export function previewSound(type) {
  const config = loadSoundConfig();
  if (config[type]) {
    playCustomFile(config[type], VOLUMES[type] || 0.25);
  } else {
    playSound(type);
  }
}

// Trigger preload on first user click/keypress
if (typeof window !== 'undefined') {
  const triggerPreload = () => {
    preloadSounds();
    window.removeEventListener('click', triggerPreload);
    window.removeEventListener('keydown', triggerPreload);
  };
  window.addEventListener('click', triggerPreload, { once: true });
  window.addEventListener('keydown', triggerPreload, { once: true });
}

// ─── Synth fallback (plays while real clips load) ───

function makeOsc(ctx, type = 'square', volume = 0.06) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.value = volume * masterVolume;
  return { osc, gain };
}

function playSynthFallback(type) {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  if (type === 'complete') {
    const { osc, gain } = makeOsc(ctx, 'square', 0.06);
    [523, 659, 784, 1047].forEach((f, i) => osc.frequency.setValueAtTime(f, now + i * 0.06));
    gain.gain.linearRampToValueAtTime(0, now + 0.29);
    osc.start(now); osc.stop(now + 0.3);
  } else if (type === 'failed') {
    const { osc, gain } = makeOsc(ctx, 'sawtooth', 0.05);
    osc.frequency.setValueAtTime(392, now);
    osc.frequency.linearRampToValueAtTime(196, now + 0.25);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.start(now); osc.stop(now + 0.31);
  } else if (type === 'spawn') {
    const { osc, gain } = makeOsc(ctx, 'square', 0.05);
    osc.frequency.setValueAtTime(262, now);
    osc.frequency.setValueAtTime(330, now + 0.04);
    osc.frequency.setValueAtTime(392, now + 0.08);
    gain.gain.linearRampToValueAtTime(0, now + 0.14);
    osc.start(now); osc.stop(now + 0.15);
  } else if (type === 'resolve') {
    const { osc, gain } = makeOsc(ctx, 'square', 0.05);
    osc.frequency.setValueAtTime(784, now);
    osc.frequency.setValueAtTime(1047, now + 0.06);
    gain.gain.linearRampToValueAtTime(0, now + 0.14);
    osc.start(now); osc.stop(now + 0.15);
  } else if (type === 'dismiss' || type === 'exit') {
    const { osc, gain } = makeOsc(ctx, 'triangle', 0.04);
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(330, now + 0.08);
    gain.gain.linearRampToValueAtTime(0, now + 0.1);
    osc.start(now); osc.stop(now + 0.11);
  } else if (type === 'click' || type === 'tab') {
    const { osc, gain } = makeOsc(ctx, 'square', 0.03);
    osc.frequency.setValueAtTime(660, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.03);
    osc.start(now); osc.stop(now + 0.04);
  } else if (type === 'copy') {
    const { osc, gain } = makeOsc(ctx, 'square', 0.03);
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1100, now + 0.025);
    gain.gain.linearRampToValueAtTime(0, now + 0.06);
    osc.start(now); osc.stop(now + 0.07);
  } else if (type === 'chat-message') {
    // ICQ "uh oh" synth approximation — two-tone descending
    const { osc, gain } = makeOsc(ctx, 'sine', 0.06);
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.setValueAtTime(500, now + 0.12);
    gain.gain.linearRampToValueAtTime(0, now + 0.28);
    osc.start(now); osc.stop(now + 0.3);
  } else if (type === 'idea-new') {
    // Light ascending ping
    const { osc, gain } = makeOsc(ctx, 'triangle', 0.05);
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(660, now + 0.06);
    osc.frequency.setValueAtTime(880, now + 0.12);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);
    osc.start(now); osc.stop(now + 0.21);
  } else if (type === 'idea-analyzed') {
    // Satisfying completion chime — major chord arpeggio
    const { osc, gain } = makeOsc(ctx, 'sine', 0.05);
    [523, 659, 784, 1047, 784].forEach((f, i) => osc.frequency.setValueAtTime(f, now + i * 0.08));
    gain.gain.linearRampToValueAtTime(0, now + 0.44);
    osc.start(now); osc.stop(now + 0.45);
  } else if (type === 'friday-connect') {
    // Rising two-tone: connection established
    const { osc, gain } = makeOsc(ctx, 'sine', 0.06);
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(660, now + 0.1);
    gain.gain.linearRampToValueAtTime(0, now + 0.22);
    osc.start(now); osc.stop(now + 0.23);
  } else if (type === 'friday-message') {
    // Soft ping
    const { osc, gain } = makeOsc(ctx, 'triangle', 0.04);
    osc.frequency.setValueAtTime(523, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.12);
    osc.start(now); osc.stop(now + 0.13);
  } else if (type === 'friday-alert') {
    // Attention double-beep
    const { osc, gain } = makeOsc(ctx, 'sine', 0.06);
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.06 * masterVolume, now + 0.06);
    gain.gain.setValueAtTime(0, now + 0.07);
    gain.gain.setValueAtTime(0.06 * masterVolume, now + 0.1);
    osc.frequency.setValueAtTime(880, now + 0.1);
    gain.gain.linearRampToValueAtTime(0, now + 0.18);
    osc.start(now); osc.stop(now + 0.19);
  }
}
