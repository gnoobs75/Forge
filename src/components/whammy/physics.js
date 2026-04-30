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

// Maps each tribes runStyle to where the warrior is along the screen
// (as a percentage of container width) at fractional time t ∈ [0,1].
// Mirrors the CSS @keyframes so projectiles fire from the warrior's
// real on-screen position, not the linear t*W approximation.
export function computeShooterPctX(shooter, t) {
  const reverse = !!shooter.reverse;
  switch (shooter.runStyle) {
    case 'flag-carrier':
      // 0% -100px → 84% 84% → 92% 86% → 100% 86%
      if (t <= 0.84) return (84 / 0.84) * t;
      if (t <= 0.92) return 84 + (86 - 84) * ((t - 0.84) / 0.08);
      return 86;
    case 'chaser':
      // 0% -100px → 80% 76% → 95% 78% → 100% 78%
      if (t <= 0.80) return (76 / 0.80) * t;
      if (t <= 0.95) return 76 + (78 - 76) * ((t - 0.80) / 0.15);
      return 78;
    case 'returning':
      // 0% 78% → 8% 78% (held) → 100% -100px
      if (t <= 0.08) return 78;
      return 78 - (78 - (-12)) * ((t - 0.08) / 0.92);
    case 'sniper-stand':
      // 0% -100px → 8% 5% (jet in) → 100% 5% (held)
      if (t <= 0.08) return (5 / 0.08) * t;
      return 5;
    default:
      // Default whammy-run: -100px → calc(100%+100px), modeled as t*100.
      return reverse ? (1 - t) * 100 : t * 100;
  }
}
