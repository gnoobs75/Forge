// src/components/whammy/physics.js
//
// Pure helpers for the Tribes 2 kit. No React, no DOM — just data.
// The ski arcs are SVG path strings consumed by CSS `offset-path`.
// Each path runs left → right across a 1000×200 viewBox; we keep Y
// amplitudes near the center so the warrior stays on the intended lane.

export const TIER_CONFIG = {
  light: {
    size: 28,         // px tall
    spawnWeight: 5,   // relative frequency
    duration: 5500,   // ms across screen (faster than medium)
    flameSize: 0.8,
    weapon: 'chaingun',
  },
  medium: {
    size: 34,
    spawnWeight: 3,
    duration: 7000,
    flameSize: 1.0,
    weapon: 'spinfusor',
  },
  heavy: {
    size: 38,
    spawnWeight: 1,   // rare — appears ~1 of every 9 spawns
    duration: 8500,   // slower
    flameSize: 1.35,
    weapon: 'mortar',
  },
};

// Three ski-arc variants, each a Q-curve path spanning 1000px wide.
// Amplitude is small (Y swings ±30 from center at 100) so warriors
// stay within their `laneRange` band on screen.
export const SKI_ARC_PATHS = {
  low:    'M 0 120 Q 250 60 500 110 Q 750 160 1000 90',
  mid:    'M 0 100 Q 200 150 400 90 Q 600 40 800 110 Q 900 140 1000 80',
  high:   'M 0 80  Q 180 140 360 70 Q 540 20 720 100 Q 880 150 1000 60',
};

// Parabolic lob for the Heavy's mortar projectile.
// Start low-left, arc high, land low-right.
export function mortarLobPath(startX, startY, endX, endY, peakOffset = -80) {
  const midX = (startX + endX) / 2;
  const peakY = Math.min(startY, endY) + peakOffset;
  return `M ${startX} ${startY} Q ${midX} ${peakY} ${endX} ${endY}`;
}

export function pickTier() {
  // Weighted random based on TIER_CONFIG[].spawnWeight
  const tiers = Object.keys(TIER_CONFIG);
  const total = tiers.reduce((s, t) => s + TIER_CONFIG[t].spawnWeight, 0);
  let roll = Math.random() * total;
  for (const t of tiers) {
    roll -= TIER_CONFIG[t].spawnWeight;
    if (roll <= 0) return t;
  }
  return 'medium';
}

export function pickArcPath() {
  const keys = Object.keys(SKI_ARC_PATHS);
  return SKI_ARC_PATHS[keys[Math.floor(Math.random() * keys.length)]];
}
