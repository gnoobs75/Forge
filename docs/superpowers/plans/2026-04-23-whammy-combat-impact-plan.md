# Whammy Combat Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Tribes 2 kit's single-tier, straight-line raiders with three distinct armor tiers (Light/Medium/Heavy) that move on physics-based ski arcs, fire their signature weapons, and leave heal-on-idle damage effects on the terminal.

**Architecture:** All changes live under `src/components/whammy/` plus one CSS section in `src/index.css`. A new `ImpactOverlay` is rendered as a sibling of `WhammyOverlay` and persists damage decals + glyph-particle transforms while `claudeBusy[scopeId]` is true; on busy→false it runs a heal pass and clears. The xterm buffer is never touched — all visuals are DOM/SVG/CSS over the xterm canvas. CSS `offset-path` + `offset-rotate: auto` drives the ski-arc physics for free.

**Tech Stack:** React 18, Zustand, Tailwind, plain CSS (xterm.js underneath, untouched). No new dependencies.

**Verification model:** Forge has no unit-test framework. Each task is verified by reloading the Electron app and exercising the change in the **Whammy Studio → Playground** (Studio Overview tab → "Whammies" panel, set active kit to **Tribes 2: Raiders**, then click **Solo / Skit / Full Parade**). Tasks also verify no console errors in DevTools.

**Commit discipline:** Commit at the end of each task inside `C:/Claude/Samurai/Forge` (Forge is its own git repo).

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src/components/whammy/physics.js` | **new** | Pure helpers: ski-arc and mortar-lob SVG path strings, plus tier configuration constants. |
| `src/components/whammy/tribes.jsx` | **new** | All Tribes 2 assets in one focused file: tier-specific warrior SVGs (Light/Medium/Heavy × Blue/Red), projectile SVG, kit export. Splits out of the monolithic `kits.jsx` so each file has one responsibility. |
| `src/components/whammy/ImpactOverlay.jsx` | **new** | Renders damage decals + glyph-particle transforms on top of the terminal. Subscribes to `claudeBusy[scopeId]`; triggers heal pass when it flips false. |
| `src/components/whammy/kits.jsx` | modify | Keep `whammiesKit` here; import `tribes2Kit` from `tribes.jsx` and re-register in `KITS`. Also keep `WhammySvg` and shared primitives. |
| `src/components/WhammyOverlay.jsx` | modify | Integrate with new kit payload shape (`warriors[]`, `projectiles[]`), forward impacts to `ImpactOverlay`. Remove legacy disc rendering — now lives inside `tribes.jsx` as a projectile. |
| `src/components/Terminal.jsx` | modify (1 line) | Mount `<ImpactOverlay>` as a sibling of `<WhammyOverlay>` inside the terminal wrapper. |
| `src/index.css` | modify | Add new `@keyframes` and classes: `whammy-ski-arc-*`, `whammy-mortar-lob`, `whammy-vaporize`, `whammy-melt-drip`, `whammy-mortar-blast`, `whammy-heal`, `whammy-flame-burst`, plus tier-specific `.whammy-tier-light/medium/heavy`. Also fill the gap where referenced-but-unstyled classes (`whammy-skiing`, `whammy-jetpack-flame`, `whammy-flag-trail`) currently have no CSS. |

---

## Task 1: Physics & tier configuration module

**Files:**
- Create: `src/components/whammy/physics.js`

- [ ] **Step 1: Create the physics module**

```javascript
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
```

- [ ] **Step 2: Verify syntax**

Run: `node --check C:/Claude/Samurai/Forge/src/components/whammy/physics.js`
Expected: no output (exit 0). If it errors, fix the syntax.

- [ ] **Step 3: Commit**

```bash
git -C C:/Claude/Samurai/Forge add src/components/whammy/physics.js
git -C C:/Claude/Samurai/Forge commit -m "feat(whammy): add tribes physics helpers and tier config"
```

---

## Task 2: New tribes CSS (ski arcs, flames, projectile animations)

**Files:**
- Modify: `src/index.css` (append to the `@layer components` Whammy section around line 232, before `.whammy-studio-stage`)

- [ ] **Step 1: Add tribes-specific CSS**

Append inside the existing `@layer components` block (right after the `@keyframes whammy-bubble-pop` rule at line 232, before the `/* ─── Whammy Studio (tab) ─── */` divider):

```css
  /* ─── Tribes 2: Raiders — ski arcs, projectiles, impact effects ─── */

  /* Base container for a tribes warrior. Size driven by CSS var. */
  .whammy-tribes {
    position: absolute;
    width: var(--raider-size, 34px);
    height: calc(var(--raider-size, 34px) * 1.15);
    left: 0;
    top: 0;
    filter: drop-shadow(0 3px 5px rgba(0,0,0,0.6));
    offset-rotate: auto 0deg;
    will-change: offset-distance, transform;
  }

  /* Three arc-path variants. The path is set per-element via inline style;
     these classes just drive the animation. */
  .whammy-tribes-ski {
    animation-name: whammy-ski-arc;
    animation-timing-function: cubic-bezier(.45, .05, .55, .95);
    animation-fill-mode: forwards;
  }
  @keyframes whammy-ski-arc {
    0%   { offset-distance: 0%; }
    100% { offset-distance: 100%; }
  }

  /* Jetpack flame group — pulses with motion. Applied to .whammy-jetpack-flame. */
  .whammy-jetpack-flame {
    transform-box: fill-box;
    transform-origin: center top;
    animation: whammy-flame-burst 1400ms ease-in-out infinite;
  }
  @keyframes whammy-flame-burst {
    0%, 100% { transform: scaleY(0.65) scaleX(0.9); opacity: 0.75; }
    25%, 75% { transform: scaleY(1.4)  scaleX(1.1); opacity: 1.0; }
    50%      { transform: scaleY(0.8)  scaleX(0.95); opacity: 0.85; }
  }

  /* Enemy-flag trail (carrier only) — gentle wave. */
  .whammy-flag-trail {
    transform-box: fill-box;
    transform-origin: left center;
    animation: whammy-flag-wave 900ms ease-in-out infinite alternate;
  }
  @keyframes whammy-flag-wave {
    0%   { transform: skewX(-6deg) scaleX(0.95); }
    100% { transform: skewX(6deg)  scaleX(1.05); }
  }

  /* Legacy "skiing" class referenced by existing code — kept as no-op pass-through
     so old spawns from the Playground still work while the kit is being rewritten. */
  .whammy-skiing { /* intentionally empty */ }

  /* ─── Projectiles ─── */

  /* Spinfusor disc — linear flight with spin. */
  .whammy-disc {
    position: absolute;
    left: 0; top: 0;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #ffffff 0%, #bae6fd 35%, #38bdf8 65%, #0ea5e9 100%);
    box-shadow: 0 0 6px #38bdf8, 0 0 12px rgba(56, 189, 248, 0.5);
    offset-rotate: 0deg;
    animation-name: whammy-ski-arc;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
    will-change: offset-distance;
  }
  .whammy-disc::before {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: radial-gradient(circle, transparent 30%, rgba(56,189,248,0.6) 70%);
    animation: whammy-disc-spin 200ms linear infinite;
  }
  @keyframes whammy-disc-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* Green plasma mortar ball — parabolic lob with glow. */
  .whammy-mortar-ball {
    position: absolute;
    left: 0; top: 0;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 40%, #ffffff 0%, #bbf7d0 20%, #22c55e 55%, #14532d 100%);
    box-shadow: 0 0 10px #22c55e, 0 0 20px rgba(34, 197, 94, 0.6), 0 0 30px rgba(34, 197, 94, 0.3);
    offset-rotate: 0deg;
    animation-name: whammy-mortar-lob;
    animation-timing-function: cubic-bezier(.35, 0, .65, 1);
    animation-fill-mode: forwards;
    will-change: offset-distance;
  }
  @keyframes whammy-mortar-lob {
    0%   { offset-distance: 0%; }
    100% { offset-distance: 100%; }
  }
  .whammy-mortar-ball-trail {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(34, 197, 94, 0.35) 20%, transparent 70%);
    filter: blur(3px);
    animation: whammy-mortar-trail-pulse 120ms ease-in-out infinite alternate;
  }
  @keyframes whammy-mortar-trail-pulse {
    from { opacity: 0.6; transform: scale(0.9); }
    to   { opacity: 1.0; transform: scale(1.2); }
  }

  /* ─── Impact overlays ─── */

  .whammy-impact {
    position: absolute;
    pointer-events: none;
    transition: opacity 600ms ease-out;
  }
  .whammy-impact.healing {
    opacity: 0;
  }

  /* Light: chaingun bullet holes (small, clustered) */
  .whammy-hole {
    position: absolute;
    width: 10px; height: 10px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 40%, #000 35%, #1a1a1f 55%, transparent 72%);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 4px rgba(0,0,0,0.9);
  }
  .whammy-hole::after {
    content: '';
    position: absolute; inset: -5px;
    background:
      linear-gradient(0deg, transparent 48%, rgba(0,0,0,0.4) 49%, rgba(0,0,0,0.4) 51%, transparent 52%),
      linear-gradient(90deg, transparent 48%, rgba(0,0,0,0.4) 49%, rgba(0,0,0,0.4) 51%, transparent 52%);
    mask: radial-gradient(circle, black 4px, transparent 10px);
    -webkit-mask: radial-gradient(circle, black 4px, transparent 10px);
  }

  /* Medium: fusion-blue burst core */
  .whammy-fusion-core {
    position: absolute;
    width: 44px; height: 32px;
    border-radius: 50%;
    background: radial-gradient(ellipse at center,
      #ffffff 4%, #bae6fd 15%, #38bdf8 30%,
      rgba(14, 165, 233, 0.6) 50%, transparent 80%);
    mix-blend-mode: screen;
    filter: blur(0.4px);
    animation: whammy-fusion-pulse 400ms ease-out forwards;
  }
  @keyframes whammy-fusion-pulse {
    0%   { transform: scale(0.2); opacity: 0; }
    30%  { transform: scale(1.1); opacity: 1; }
    100% { transform: scale(1.0); opacity: 0.8; }
  }
  .whammy-fusion-ring {
    position: absolute;
    width: 56px; height: 42px;
    border-radius: 50%;
    border: 1px solid rgba(56, 189, 248, 0.7);
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.5), inset 0 0 8px rgba(186, 230, 253, 0.25);
    animation: whammy-fusion-ring-expand 500ms ease-out forwards;
  }
  @keyframes whammy-fusion-ring-expand {
    0%   { transform: scale(0.3); opacity: 0; }
    40%  { transform: scale(1.0); opacity: 1; }
    100% { transform: scale(1.3); opacity: 0; }
  }

  /* Medium: per-character vaporize (above impact center) */
  .whammy-char-vapor {
    position: absolute;
    font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
    font-size: 13px;
    color: #bae6fd;
    text-shadow: 0 0 4px #38bdf8, 0 0 10px #0ea5e9;
    animation: whammy-vaporize 900ms ease-out forwards;
    white-space: pre;
  }
  @keyframes whammy-vaporize {
    0%   { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
    40%  { opacity: 0.7; transform: translateY(-6px) scale(1.1); filter: blur(0.5px); }
    100% { opacity: 0; transform: translateY(-24px) scale(0.6); filter: blur(2px); }
  }

  .whammy-vapor-mist {
    position: absolute;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(186,230,253,0.5) 0%, rgba(56,189,248,0.25) 40%, transparent 75%);
    filter: blur(3px);
    animation: whammy-mist-rise 1800ms ease-out forwards;
  }
  @keyframes whammy-mist-rise {
    0%   { opacity: 0; transform: translateY(0) scale(0.6); }
    20%  { opacity: 0.8; }
    100% { opacity: 0; transform: translateY(-40px) scale(1.6); }
  }

  /* Medium: per-character melt (below impact center) */
  .whammy-char-melt {
    position: absolute;
    font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
    font-size: 13px;
    color: #38bdf8;
    text-shadow: 0 0 6px #0ea5e9;
    transform-origin: top center;
    animation: whammy-melt-drip 1200ms ease-in forwards;
    white-space: pre;
  }
  @keyframes whammy-melt-drip {
    0%   { transform: scaleY(1); color: #e2e8f0; }
    25%  { transform: scaleY(1.6); color: #38bdf8; }
    60%  { transform: scaleY(2.8) translateY(4px); color: #0ea5e9; }
    100% { transform: scaleY(3.8) translateY(12px); color: #0c4a6e; opacity: 0.5; }
  }

  /* Heavy: green mortar blast */
  .whammy-mortar-flash {
    position: absolute;
    width: 140px; height: 140px;
    border-radius: 50%;
    background: radial-gradient(circle,
      #ffffff 0%, #d9f99d 8%, #86efac 22%, rgba(34,197,94,0.9) 38%,
      rgba(16,94,48,0.7) 55%, rgba(0,0,0,0.9) 72%, transparent 88%);
    mix-blend-mode: screen;
    filter: blur(0.5px);
    animation: whammy-mortar-flash 600ms ease-out forwards;
    transform-origin: center;
  }
  @keyframes whammy-mortar-flash {
    0%   { transform: scale(0.2); opacity: 0; }
    20%  { transform: scale(1.2); opacity: 1; }
    100% { transform: scale(1.0); opacity: 0.4; }
  }
  .whammy-mortar-shockwave {
    position: absolute;
    width: 180px; height: 180px;
    border-radius: 50%;
    border: 2px solid rgba(134,239,172,0.6);
    box-shadow: 0 0 20px rgba(34,197,94,0.4), inset 0 0 20px rgba(34,197,94,0.3);
    animation: whammy-shockwave-expand 800ms ease-out forwards;
  }
  @keyframes whammy-shockwave-expand {
    0%   { transform: scale(0.1); opacity: 0; }
    30%  { transform: scale(0.8); opacity: 1; }
    100% { transform: scale(1.6); opacity: 0; }
  }
  .whammy-mortar-crater {
    position: absolute;
    width: 100px; height: 100px;
    border-radius: 50%;
    background: radial-gradient(circle,
      #000 25%, #0a1a0a 45%, rgba(20,83,45,0.7) 62%,
      rgba(34,197,94,0.2) 78%, transparent 92%);
    box-shadow: inset 0 0 20px rgba(34,197,94,0.5);
  }
  .whammy-mortar-smoke {
    position: absolute;
    width: 36px; height: 60px;
    border-radius: 50%;
    background: radial-gradient(ellipse, rgba(52,211,153,0.45) 0%,
      rgba(34,197,94,0.3) 35%, rgba(20,83,45,0.15) 60%, transparent 85%);
    filter: blur(4px);
    animation: whammy-smoke-rise 3200ms ease-out infinite;
  }
  @keyframes whammy-smoke-rise {
    0%   { opacity: 0; transform: translateY(20px) scale(0.5); }
    20%  { opacity: 0.7; }
    100% { opacity: 0; transform: translateY(-80px) scale(1.8); }
  }
  .whammy-mortar-particle {
    position: absolute;
    font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
    font-size: 13px;
    color: #e2e8f0;
    white-space: pre;
    text-shadow: 0 0 4px rgba(34,197,94,0.6);
    --blast-tx: 0px;
    --blast-ty: 0px;
    --blast-rot: 0deg;
    animation: whammy-mortar-blast 900ms cubic-bezier(.2,.6,.35,1) forwards;
  }
  @keyframes whammy-mortar-blast {
    0%   { transform: translate(0, 0) rotate(0deg); opacity: 1; }
    100% { transform: translate(var(--blast-tx), var(--blast-ty)) rotate(var(--blast-rot)); opacity: 0.85; }
  }
  .whammy-mortar-spark {
    position: absolute;
    width: 2px; height: 2px;
    border-radius: 50%;
    background: #bbf7d0;
    box-shadow: 0 0 6px #22c55e, 0 0 12px #22c55e;
    animation: whammy-spark-fade 700ms ease-out forwards;
  }
  @keyframes whammy-spark-fade {
    0%   { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(0.3); }
  }
```

- [ ] **Step 2: Reload the Forge dev server**

In the Electron window: `Ctrl+R`. Or if the dev server isn't running: `npm run dev` in `C:/Claude/Samurai/Forge`.

- [ ] **Step 3: Verify no CSS parse errors**

Open DevTools console. Expected: no "Error parsing CSS" messages. All existing Whammy visuals (Classic Whammies kit Playground) should still render correctly — the new CSS is additive.

- [ ] **Step 4: Commit**

```bash
git -C C:/Claude/Samurai/Forge add src/index.css
git -C C:/Claude/Samurai/Forge commit -m "feat(whammy): add tribes CSS animations for ski arcs, projectiles, impacts"
```

---

## Task 3: New tribes warrior SVGs (three tiers, two teams)

**Files:**
- Create: `src/components/whammy/tribes.jsx`

- [ ] **Step 1: Write the file with all six tier/team combinations**

```jsx
// src/components/whammy/tribes.jsx
//
// Tribes 2: Raiders kit. Three armor tiers × two teams = six warriors.
// Silhouettes are intentionally distinct at small sizes so each tier reads
// instantly. Weapons are visible and match the tier's damage style.

import React from 'react';
import { TIER_CONFIG, SKI_ARC_PATHS, pickTier, pickArcPath, mortarLobPath } from './physics';

// Team color palettes — used for all tiers.
const TEAMS = {
  blue: { armor: '#2563eb', armorDark: '#1e3a8a', visor: '#93c5fd', muzzle: '#38bdf8' },
  red:  { armor: '#dc2626', armorDark: '#7f1d1d', visor: '#fca5a5', muzzle: '#fca5a5' },
};

// ── Jetpack flame (shared) ──────────────────────────────────────────
function JetpackFlame({ cx1 = 13, cx2 = 27, cy = 42, scale = 1 }) {
  return (
    <g className="whammy-jetpack-flame">
      <ellipse cx={cx1} cy={cy} rx={3 * scale} ry={4 * scale} fill="#f97316" opacity="0.9" />
      <ellipse cx={cx1} cy={cy} rx={1.5 * scale} ry={2 * scale} fill="#fef08a" />
      <ellipse cx={cx2} cy={cy} rx={3 * scale} ry={4 * scale} fill="#f97316" opacity="0.9" />
      <ellipse cx={cx2} cy={cy} rx={1.5 * scale} ry={2 * scale} fill="#fef08a" />
    </g>
  );
}

// ── LIGHT: slim skirmisher with chaingun ───────────────────────────
function LightRaider({ team }) {
  const t = TEAMS[team];
  return (
    <svg viewBox="0 0 40 46" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <JetpackFlame cx1={14} cx2={26} cy={42} scale={0.8} />
      <ellipse cx="20" cy="28" rx="8" ry="6" fill={t.armor} />
      <rect x="15" y="26" width="10" height="6" rx="2" fill={t.armorDark} />
      <ellipse cx="20" cy="14" rx="5" ry="6" fill={t.armorDark} />
      <path d="M15 14 Q20 17 25 14 L25 16 Q20 18 15 16 Z" fill={t.visor} />
      <rect x="26" y="26" width="10" height="2.5" fill="#374151" />
      <rect x="26" y="28.5" width="10" height="2.5" fill="#1f2937" />
      <circle cx="37" cy="27" r="1.2" fill={t.muzzle} />
      <rect x="16" y="33" width="2.5" height="5" rx="1" fill={t.armorDark} />
      <rect x="21.5" y="33" width="2.5" height="5" rx="1" fill={t.armorDark} />
      <rect x="12" y="38" width="8" height="1.5" rx="0.5" fill="#94a3b8" />
      <rect x="20" y="38" width="8" height="1.5" rx="0.5" fill="#94a3b8" />
    </svg>
  );
}

// ── MEDIUM: balanced raider with spinfusor ─────────────────────────
function MediumRaider({ team, carryingFlag = false }) {
  const t = TEAMS[team];
  return (
    <svg viewBox="0 0 40 46" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <JetpackFlame cx1={12} cx2={28} cy={42} scale={1.0} />
      {carryingFlag && (
        <g className="whammy-flag-trail">
          <rect x="33" y="8" width="1" height="20" fill="#6b3410" />
          <path d="M34 10 L42 13 L42 20 L34 23 Z" fill={team === 'blue' ? '#dc2626' : '#2563eb'} />
        </g>
      )}
      <ellipse cx="20" cy="26" rx="10" ry="7" fill={t.armor} />
      <rect x="13" y="24" width="14" height="7" rx="2" fill={t.armorDark} />
      <rect x="16" y="28" width="8" height="1" fill={t.visor} />
      <ellipse cx="20" cy="13" rx="6" ry="5" fill={t.armorDark} />
      <path d="M14 13 Q20 16 26 13 L26 15 Q20 17 14 15 Z" fill={t.visor} />
      <rect x="26" y="25" width="9" height="3" rx="0.5" fill="#374151" />
      <circle cx="35" cy="26.5" r="2" fill={t.muzzle} />
      <rect x="15" y="32" width="3" height="5" rx="1" fill={t.armorDark} />
      <rect x="22" y="32" width="3" height="5" rx="1" fill={t.armorDark} />
      <rect x="11" y="37" width="9" height="2" rx="0.5" fill="#94a3b8" />
      <rect x="20" y="37" width="9" height="2" rx="0.5" fill="#94a3b8" />
    </svg>
  );
}

// ── HEAVY: bulky juggernaut with green mortar ──────────────────────
function HeavyRaider({ team }) {
  const t = TEAMS[team];
  return (
    <svg viewBox="0 0 44 46" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <JetpackFlame cx1={13} cx2={31} cy={42} scale={1.35} />
      <ellipse cx="22" cy="26" rx="14" ry="8" fill={t.armor} />
      <rect x="12" y="22" width="20" height="10" rx="2" fill={t.armorDark} />
      <rect x="14" y="24" width="16" height="1.5" fill={t.visor} />
      <rect x="14" y="29" width="16" height="1" fill={t.visor} opacity="0.5" />
      <ellipse cx="8" cy="22" rx="3.5" ry="2.5" fill="#0c1b3a" />
      <ellipse cx="36" cy="22" rx="3.5" ry="2.5" fill="#0c1b3a" />
      <ellipse cx="22" cy="14" rx="7.5" ry="5.5" fill={t.armorDark} />
      <rect x="19" y="9" width="6" height="2" rx="0.5" fill="#0c1b3a" />
      <path d="M14.5 14 Q22 17 29.5 14 L29.5 16.5 Q22 18.5 14.5 16.5 Z" fill={t.visor} />
      <rect x="28" y="24" width="12" height="4" rx="1" fill="#1f2937" />
      <rect x="28" y="24" width="12" height="1.2" fill="#374151" />
      <circle cx="40" cy="26" r="2.5" fill="#22c55e" filter="drop-shadow(0 0 3px #22c55e)" />
      <rect x="15" y="32" width="4" height="5" rx="1" fill={t.armorDark} />
      <rect x="25" y="32" width="4" height="5" rx="1" fill={t.armorDark} />
      <rect x="10" y="37" width="12" height="2.5" rx="0.5" fill="#64748b" />
      <rect x="22" y="37" width="12" height="2.5" rx="0.5" fill="#64748b" />
    </svg>
  );
}

// ── Variant renderer map ───────────────────────────────────────────
// Variant IDs: "{tier}-{team}"  →  "light-blue", "medium-red", etc.
const TRIBES_RENDERERS = {
  'light-blue':   ({ extras }) => <LightRaider team="blue" {...extras} />,
  'light-red':    ({ extras }) => <LightRaider team="red"  {...extras} />,
  'medium-blue':  ({ extras }) => <MediumRaider team="blue" {...extras} />,
  'medium-red':   ({ extras }) => <MediumRaider team="red"  {...extras} />,
  'heavy-blue':   ({ extras }) => <HeavyRaider team="blue" {...extras} />,
  'heavy-red':    ({ extras }) => <HeavyRaider team="red"  {...extras} />,
};

const VARIANTS = Object.keys(TRIBES_RENDERERS);

// ── Kit definition ─────────────────────────────────────────────────
export const tribes2Kit = {
  id: 'tribes2',
  name: 'Tribes 2: Raiders',
  description: 'Three armor tiers (Light/Medium/Heavy) battle across the terminal with signature weapons and impact effects.',
  variants: VARIANTS,
  labels: {
    'light-blue': 'Light — Diamond Sword',
    'light-red':  'Light — Blood Eagle',
    'medium-blue':'Medium — Diamond Sword',
    'medium-red': 'Medium — Blood Eagle',
    'heavy-blue': 'Heavy — Diamond Sword',
    'heavy-red':  'Heavy — Blood Eagle',
  },
  shouts: {
    'light-blue':  'GO!',
    'light-red':   'GOT YOU!',
    'medium-blue': 'BASE!',
    'medium-red':  'SHAZBOT!',
    'heavy-blue':  'INCOMING!',
    'heavy-red':   'FIRE IN THE HOLE!',
  },
  skitChance: 1.0,
  spawnInterval: 11000,
  runDuration: 7000,       // kept for compatibility, overridden per-tier
  laneRange: [62, 82],

  renderVariant(id, extras = {}) {
    const Cmp = TRIBES_RENDERERS[id] || TRIBES_RENDERERS['medium-blue'];
    return <Cmp extras={extras} />;
  },
  pickVariant() {
    return VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
  },

  // Solo spawn — a lone raider patrolling on an arc.
  buildSolo(idRef, lane) {
    const tier = pickTier();
    const team = Math.random() < 0.5 ? 'blue' : 'red';
    return {
      warriors: [{
        id: ++idRef.current,
        variant: `${tier}-${team}`,
        tier,
        team,
        lane,
        reverse: Math.random() < 0.5,
        duration: TIER_CONFIG[tier].duration,
        arcPath: pickArcPath(),
      }],
      projectiles: [],
    };
  },

  // Skit = full CTF battle with disc/mortar fire between the two teams.
  buildSkit(idRef, lane) {
    // 1 in 4 skits features a Heavy mortar cameo; otherwise medium-on-medium CTF.
    const heavyCameo = Math.random() < 0.25;
    const arcBlue = pickArcPath();
    const arcRed  = pickArcPath();

    const blueTier  = heavyCameo && Math.random() < 0.5 ? 'heavy' : 'medium';
    const redTier   = heavyCameo && blueTier !== 'heavy' ? 'heavy' : 'medium';
    const blueDur   = TIER_CONFIG[blueTier].duration;
    const redDur    = TIER_CONFIG[redTier].duration;

    const blueId = ++idRef.current;
    const redId  = ++idRef.current;

    const warriors = [
      {
        id: blueId, variant: `${blueTier}-blue`, tier: blueTier, team: 'blue',
        lane, reverse: false, duration: blueDur, arcPath: arcBlue,
        extras: blueTier === 'medium' ? { carryingFlag: true } : {},
        label: this.shouts[`${blueTier}-blue`],
      },
      {
        id: redId, variant: `${redTier}-red`, tier: redTier, team: 'red',
        lane: lane + 1.5, reverse: false, duration: redDur, arcPath: arcRed,
        delay: 700,
        label: this.shouts[`${redTier}-red`],
      },
    ];

    // Projectiles: each firing warrior lobs its weapon at the other.
    const projectiles = [];
    const makeHit = (shooter, weapon, atT, impactDx, impactDy) => {
      const id = ++idRef.current;
      projectiles.push({
        id,
        weapon,                 // 'chaingun' | 'spinfusor' | 'mortar'
        shooterId: shooter.id,
        team: shooter.team,
        fireAtT: atT,           // fraction of shooter's duration when disc spawns
        flightMs: weapon === 'mortar' ? 1400 : 900,
        impactDx,               // offset from shooter's current position at fire time
        impactDy,
      });
    };

    // Blue fires back R→L, Red fires forward L→R — two volleys each.
    const blueWeapon = blueTier === 'heavy' ? 'mortar' : 'spinfusor';
    const redWeapon  = redTier === 'heavy' ? 'mortar' : 'spinfusor';
    makeHit(warriors[1], redWeapon, 0.25, 180, -8);
    makeHit(warriors[0], blueWeapon, 0.40, -140, 6);
    makeHit(warriors[1], redWeapon, 0.55, 200, 4);
    makeHit(warriors[0], blueWeapon, 0.72, -160, -4);

    return { warriors, projectiles };
  },
};
```

- [ ] **Step 2: Register the kit in `kits.jsx`**

Open `src/components/whammy/kits.jsx`. Near the top of the file, add the import:

```jsx
import { tribes2Kit } from './tribes';
```

Delete the existing `tribes2Kit` definition (currently lines ~334-504, starting at the `// Tribes 2 Kit — CTF chase with disc gun battle` comment through its closing `};`). The SVG helpers (`RaiderBody`, `DiscLauncher`, `JetpackFlame`, `RaiderBlue`, `RaiderRed`) and the `TRIBES_RENDERERS` map defined inside that section must all be deleted — they've been replaced by the new module. Stop deleting before the `// Registry` divider.

The `KITS` map at the bottom stays the same — `tribes2: tribes2Kit` still resolves correctly because of the new import.

- [ ] **Step 3: Reload Forge & verify variant gallery**

Reload the Electron app (`Ctrl+R`). Navigate to Studio Overview → Whammies tab. Click **Tribes 2: Raiders** in the Active Kit picker.

Expected: The Cast panel now shows **6 variants** (Light/Medium/Heavy × Blue/Red) with distinct silhouettes. Tap each — the warrior should spawn in the Playground and run across. (Motion is still the legacy `whammy-run` at this point — that's fixed in Task 4.) Console: no errors.

- [ ] **Step 4: Commit**

```bash
git -C C:/Claude/Samurai/Forge add src/components/whammy/tribes.jsx src/components/whammy/kits.jsx
git -C C:/Claude/Samurai/Forge commit -m "feat(whammy): split tribes kit into its own module with three armor tiers"
```

---

## Task 4: Wire ski-arc motion into WhammyOverlay

**Files:**
- Modify: `src/components/WhammyOverlay.jsx`

The existing `Whammy` entity component uses a left→right CSS `left` animation. For tribes warriors we need `offset-path` motion instead. Extend the overlay to detect tribes payloads and render the new path-based animation.

- [ ] **Step 1: Replace WhammyOverlay.jsx with the updated orchestrator**

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { playSound } from '../utils/sounds';
import { getActiveKit, WhammySvg } from './whammy/kits';
import { TIER_CONFIG } from './whammy/physics';
import ImpactOverlay from './whammy/ImpactOverlay';

const SOUND_COOLDOWN_MS = 10000;
const lastSfxAt = { spawn: 0, complete: 0 };
function playSoundThrottled(kind) {
  const now = Date.now();
  if (now - (lastSfxAt[kind] || 0) < SOUND_COOLDOWN_MS) return;
  lastSfxAt[kind] = now;
  playSound(kind);
}

export { WhammySvg };
export { KITS, getActiveKit } from './whammy/kits';

// ── Classic (non-tribes) whammy: linear left→right ──────────────────
function ClassicWhammy({ id, lane, reverse, variant, duration, delay, label, kit, onDone }) {
  const shout = label ?? kit.shouts[variant] ?? '';
  const style = {
    top: `${lane}%`,
    animation: `whammy-run ${duration}ms cubic-bezier(.4,.2,.6,.8) ${delay || 0}ms forwards`,
    transform: reverse ? 'scaleX(-1)' : 'scaleX(1)',
    animationDirection: reverse ? 'reverse' : 'normal',
  };
  return (
    <div className="whammy" style={style} onAnimationEnd={onDone}>
      <div className="whammy-bounce">
        <WhammySvg kit={kit} variant={variant} />
        {shout && <div className="whammy-shout">{shout}</div>}
      </div>
    </div>
  );
}

// ── Tribes warrior: offset-path ski-arc with tier-sized silhouette ──
function TribesWarrior({ id, lane, reverse, variant, tier, duration, delay, arcPath, extras, label, kit, onDone }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.medium;
  const shout = label ?? kit.shouts[variant] ?? '';
  const style = {
    '--raider-size': `${cfg.size}px`,
    top: `${lane}%`,
    offsetPath: `path('${arcPath}')`,
    animationDuration: `${duration}ms`,
    animationDelay: `${delay || 0}ms`,
    animationDirection: reverse ? 'reverse' : 'normal',
  };
  return (
    <div
      className="whammy whammy-tribes whammy-tribes-ski"
      style={style}
      onAnimationEnd={onDone}
    >
      <WhammySvg kit={kit} variant={variant} extras={extras} size={cfg.size} />
      {shout && <div className="whammy-shout">{shout}</div>}
    </div>
  );
}

// ── Spinfusor disc / mortar ball projectile ─────────────────────────
// Renders an entity on an offset-path from `from` to `to`.
function Projectile({ id, weapon, fromX, fromY, toX, toY, duration, delay, onImpact }) {
  const isMortar = weapon === 'mortar';
  const path = isMortar
    ? `M ${fromX} ${fromY} Q ${(fromX + toX) / 2} ${Math.min(fromY, toY) - 80} ${toX} ${toY}`
    : `M ${fromX} ${fromY} L ${toX} ${toY}`;
  const className = isMortar ? 'whammy-mortar-ball' : 'whammy-disc';
  const style = {
    offsetPath: `path('${path}')`,
    animationDuration: `${duration}ms`,
    animationDelay: `${delay || 0}ms`,
  };
  return (
    <div className={className} style={style} onAnimationEnd={() => onImpact({ x: toX, y: toY, weapon })}>
      {isMortar && <div className="whammy-mortar-ball-trail" />}
    </div>
  );
}

// ── Overlay ─────────────────────────────────────────────────────────
export default function WhammyOverlay({ scopeId }) {
  const busy = useStore(s => (scopeId ? !!s.claudeBusy[scopeId] : false));
  const activeKitId = useStore(s => s.activeKitId || 'whammies');
  const kit = getActiveKit(activeKitId);

  const [entities, setEntities] = useState([]);        // warriors + discs
  const [impacts, setImpacts] = useState([]);          // pending + active impacts
  const [bubbles, setBubbles] = useState([]);
  const idRef = useRef(0);
  const prevBusy = useRef(false);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!busy) return;
    playSoundThrottled('spawn');

    const spawn = () => {
      const [laneMin, laneMax] = kit.laneRange;
      const lane = laneMin + Math.random() * (laneMax - laneMin);
      const payload = Math.random() < kit.skitChance
        ? kit.buildSkit(idRef, lane)
        : kit.buildSolo(idRef, lane);

      // Classic whammies payload: { whammies, bubbles }
      // Tribes payload: { warriors, projectiles }
      if (payload.whammies?.length) {
        setEntities(es => [...es, ...payload.whammies.map(w => ({ ...w, kind: 'classic' }))]);
      }
      if (payload.warriors?.length) {
        setEntities(es => [...es, ...payload.warriors.map(w => ({ ...w, kind: 'tribes' }))]);
      }
      if (payload.projectiles?.length) {
        schedulePayloadProjectiles(payload.projectiles, payload.warriors || []);
      }
      if (payload.bubbles?.length) {
        setBubbles(bs => [...bs, ...payload.bubbles]);
        payload.bubbles.forEach(b => {
          setTimeout(() => setBubbles(bs => bs.filter(x => x.id !== b.id)), b.ttl || 1600);
        });
      }
    };

    // Projectiles fire at fractional times within their shooter's duration.
    // We don't know exact shooter pixel position without DOM sampling, so we
    // approximate: shooter starts at x ≈ 10% of container width, moves roughly
    // along the arc. For fire time t, we estimate their position by sampling
    // the arc path offset. Impact = estimated position + impactDx/Dy.
    const schedulePayloadProjectiles = (projectiles, warriors) => {
      const container = overlayRef.current;
      if (!container) return;
      const W = container.clientWidth;
      const H = container.clientHeight;

      projectiles.forEach(p => {
        const shooter = warriors.find(w => w.id === p.shooterId);
        if (!shooter) return;
        // Shooter's estimated position at fire time
        const shooterX = (shooter.reverse ? 1 - p.fireAtT : p.fireAtT) * W;
        const laneY    = (shooter.lane / 100) * H;
        const fromX = shooterX;
        const fromY = laneY + (shooter.kind === 'tribes' ? -4 : 0);
        const toX = fromX + p.impactDx;
        const toY = laneY + p.impactDy;

        const fireDelay = (shooter.delay || 0) + (shooter.duration * p.fireAtT);
        setTimeout(() => {
          const projId = ++idRef.current;
          setEntities(es => [...es, {
            kind: 'projectile',
            id: projId,
            weapon: p.weapon,
            fromX, fromY, toX, toY,
            duration: p.flightMs,
            team: p.team,
          }]);
        }, fireDelay);
      });
    };

    spawn();
    const iv = setInterval(spawn, kit.spawnInterval);
    return () => clearInterval(iv);
  }, [busy, kit]);

  useEffect(() => {
    if (prevBusy.current && !busy) playSoundThrottled('complete');
    prevBusy.current = busy;
  }, [busy]);

  const removeEntity = (id) => setEntities(es => es.filter(e => e.id !== id));
  const addImpact = (impact) => {
    const impId = ++idRef.current;
    setImpacts(prev => [...prev, { ...impact, id: impId, createdAt: Date.now() }]);
  };
  const removeImpact = (id) => setImpacts(prev => prev.filter(i => i.id !== id));

  if (!busy && entities.length === 0 && impacts.length === 0 && bubbles.length === 0) return null;

  return (
    <>
      <div ref={overlayRef} className="whammy-overlay" aria-hidden="true">
        {entities.map(e => {
          if (e.kind === 'classic') {
            return (
              <ClassicWhammy key={e.id} {...e} kit={kit} onDone={() => removeEntity(e.id)} />
            );
          }
          if (e.kind === 'tribes') {
            return (
              <TribesWarrior key={e.id} {...e} kit={kit} onDone={() => removeEntity(e.id)} />
            );
          }
          if (e.kind === 'projectile') {
            return (
              <Projectile
                key={e.id}
                {...e}
                delay={0}
                onImpact={(info) => {
                  removeEntity(e.id);
                  addImpact(info);
                }}
              />
            );
          }
          return null;
        })}
        {bubbles.map(b => (
          <div key={b.id} className="whammy-bubble" style={{ top: `${b.lane}%` }}>
            {b.emoji}
          </div>
        ))}
      </div>
      <ImpactOverlay impacts={impacts} busy={busy} onImpactDone={removeImpact} />
    </>
  );
}
```

- [ ] **Step 2: Reload Forge & verify motion**

Reload. Switch to Tribes 2: Raiders kit. Click **Skit** in the Playground.

Expected:
- Two warriors appear following curvy arcs (not straight lines).
- Each tilts to match the arc tangent (leaning forward on descents).
- Jetpack flames pulse continuously.
- Heavy variant, when it spawns (~25% of skits), is clearly larger with shoulder pads and a green-tipped mortar.
- Discs and/or a mortar ball fire at fractional times during the chase; on reaching their target, they disappear (impact effect added in Task 6).
- Console: no errors. `offset-path` warnings in older Chromium are OK but Electron 20+ supports it.

- [ ] **Step 3: Verify Classic kit still works**

Switch active kit back to **Classic Whammies**. Click Solo/Skit/Full Parade. Expected: runs exactly as before.

- [ ] **Step 4: Commit**

```bash
git -C C:/Claude/Samurai/Forge add src/components/WhammyOverlay.jsx
git -C C:/Claude/Samurai/Forge commit -m "feat(whammy): drive tribes warriors with offset-path ski arcs and projectile layer"
```

---

## Task 5: ImpactOverlay scaffold (decals only)

**Files:**
- Create: `src/components/whammy/ImpactOverlay.jsx`

This task renders persistent decals (bullet holes / fusion burst / mortar crater) at impact points. Character transforms and heal behavior come in Tasks 6–8.

- [ ] **Step 1: Write the component**

```jsx
// src/components/whammy/ImpactOverlay.jsx
//
// Persistent damage layer that sits above the xterm canvas. Impacts arrive
// from WhammyOverlay (projectile landings) and stay on-screen while
// `claudeBusy[scope]` is true. When it flips false, the overlay runs a heal
// pass (fade out) and removes DOM nodes.

import React, { useEffect, useRef } from 'react';

const HEAL_DURATION_MS = 650;

export default function ImpactOverlay({ impacts, busy, onImpactDone }) {
  // When busy flips false, schedule removal of every active impact after the heal.
  const prevBusy = useRef(busy);
  useEffect(() => {
    if (prevBusy.current && !busy) {
      impacts.forEach(i => {
        setTimeout(() => onImpactDone(i.id), HEAL_DURATION_MS);
      });
    }
    prevBusy.current = busy;
  }, [busy, impacts, onImpactDone]);

  if (impacts.length === 0) return null;

  return (
    <div className="whammy-overlay" aria-hidden="true" style={{ zIndex: 41 }}>
      {impacts.map(i => (
        <Impact key={i.id} impact={i} healing={!busy} />
      ))}
    </div>
  );
}

function Impact({ impact, healing }) {
  const { weapon, x, y } = impact;
  const cls = `whammy-impact ${healing ? 'healing' : ''}`;

  if (weapon === 'chaingun') {
    // 4 small holes clustered around (x, y).
    const holes = Array.from({ length: 4 }).map((_, i) => {
      const dx = (Math.random() - 0.5) * 36;
      const dy = (Math.random() - 0.5) * 18;
      const scale = 0.75 + Math.random() * 0.4;
      return (
        <div
          key={i}
          className="whammy-hole"
          style={{
            left: `${x + dx}px`,
            top:  `${y + dy}px`,
            transform: `scale(${scale}) rotate(${Math.random() * 90}deg)`,
          }}
        />
      );
    });
    return <div className={cls}>{holes}</div>;
  }

  if (weapon === 'spinfusor') {
    return (
      <div className={cls}>
        <div className="whammy-fusion-ring" style={{ left: `${x - 28}px`, top: `${y - 21}px` }} />
        <div className="whammy-fusion-core" style={{ left: `${x - 22}px`, top: `${y - 16}px` }} />
      </div>
    );
  }

  if (weapon === 'mortar') {
    return (
      <div className={cls}>
        <div className="whammy-mortar-shockwave" style={{ left: `${x - 90}px`, top: `${y - 90}px` }} />
        <div className="whammy-mortar-flash"     style={{ left: `${x - 70}px`, top: `${y - 70}px` }} />
        <div className="whammy-mortar-crater"    style={{ left: `${x - 50}px`, top: `${y - 50}px` }} />
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Reload & verify decals appear**

Reload. Switch to Tribes 2. Click **Skit** several times.

Expected:
- When a projectile (disc or mortar ball) reaches its target, a decal appears at the impact point and persists.
- Spinfusor hits: blue ring + core.
- Mortar hits (when Heavy spawns): large green flash, shockwave ring, and black/green crater.
- Decals accumulate on screen as more hits land.
- Console: no errors.

(Heal is wired but only triggers off `busy`. Since Playground skits end and `busy` stays false from the real Claude detector, decals currently stay forever — this is fine at this task; real behavior verified in Task 8.)

- [ ] **Step 3: Commit**

```bash
git -C C:/Claude/Samurai/Forge add src/components/whammy/ImpactOverlay.jsx
git -C C:/Claude/Samurai/Forge commit -m "feat(whammy): add ImpactOverlay with decals for chaingun/spinfusor/mortar"
```

---

## Task 6: Medium spinfusor — character vaporize + melt transforms

**Files:**
- Modify: `src/components/whammy/ImpactOverlay.jsx`

Extend the `spinfusor` branch to spawn a cluster of glyph spans: characters above the impact center vaporize, characters below melt.

- [ ] **Step 1: Update the `spinfusor` Impact branch**

Replace the existing `if (weapon === 'spinfusor')` block in `ImpactOverlay.jsx` with:

```jsx
  if (weapon === 'spinfusor') {
    return (
      <div className={cls}>
        <div className="whammy-fusion-ring" style={{ left: `${x - 28}px`, top: `${y - 21}px` }} />
        <div className="whammy-fusion-core" style={{ left: `${x - 22}px`, top: `${y - 16}px` }} />
        {renderSpinfusorChars(x, y)}
        {renderSpinfusorSparks(x, y)}
      </div>
    );
  }
```

Add these helpers at the bottom of the file (after the `Impact` component):

```jsx
// Glyph alphabet for synthetic "terminal text" particles.
const GLYPH_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789/-_.,{}[]=:>';
function randGlyph() { return GLYPH_ALPHABET[Math.floor(Math.random() * GLYPH_ALPHABET.length)]; }

function renderSpinfusorChars(x, y) {
  // 4 chars above (vaporize upward), 4 below (melt downward). Horizontally
  // clustered within ~60px. Font matches terminal: JetBrains Mono 13px, ~7.8px wide.
  const CHAR_W = 7.8;
  const above = Array.from({ length: 4 }).map((_, i) => {
    const dx = (i - 1.5) * CHAR_W + (Math.random() - 0.5) * 4;
    return (
      <span
        key={`v${i}`}
        className="whammy-char-vapor"
        style={{ left: `${x + dx}px`, top: `${y - 8}px`, animationDelay: `${i * 60}ms` }}
      >
        {randGlyph()}
      </span>
    );
  });
  const below = Array.from({ length: 4 }).map((_, i) => {
    const dx = (i - 1.5) * CHAR_W + (Math.random() - 0.5) * 4;
    return (
      <span
        key={`m${i}`}
        className="whammy-char-melt"
        style={{ left: `${x + dx}px`, top: `${y + 4}px`, animationDelay: `${i * 80}ms` }}
      >
        {randGlyph()}
      </span>
    );
  });
  const mists = Array.from({ length: 3 }).map((_, i) => {
    const dx = (Math.random() - 0.5) * 40;
    return (
      <div
        key={`mist${i}`}
        className="whammy-vapor-mist"
        style={{ left: `${x + dx - 11}px`, top: `${y - 12}px`, animationDelay: `${300 + i * 150}ms` }}
      />
    );
  });
  return [...above, ...below, ...mists];
}

function renderSpinfusorSparks(x, y) {
  return Array.from({ length: 4 }).map((_, i) => {
    const dx = (Math.random() - 0.5) * 50;
    const dy = (Math.random() - 0.5) * 30;
    return (
      <div
        key={`sp${i}`}
        className="whammy-mortar-spark"
        style={{ left: `${x + dx}px`, top: `${y + dy}px` }}
      />
    );
  });
}
```

- [ ] **Step 2: Reload & verify**

Reload. Switch to Tribes 2. Click **Skit** until a Medium-vs-Medium fight plays (most common).

Expected:
- On each spinfusor hit: fusion ring + core flash, plus a row of 4 glyphs above the impact that rise as cyan mist, and 4 glyphs below that stretch and drip blue.
- Sparks scatter around the hit.
- After the ~1800ms mist-rise ends, the decal (ring + core) remains visible. Glyph animations complete but the `whammy-impact` wrapper still contains the ring/core until heal runs.

- [ ] **Step 3: Commit**

```bash
git -C C:/Claude/Samurai/Forge add src/components/whammy/ImpactOverlay.jsx
git -C C:/Claude/Samurai/Forge commit -m "feat(whammy): spinfusor impact vaporizes above and melts below"
```

---

## Task 7: Heavy mortar — blast particles + smoke column

**Files:**
- Modify: `src/components/whammy/ImpactOverlay.jsx`

Extend the `mortar` branch to scatter glyph particles outward with random trajectories, and add a rising green smoke column that loops until heal.

- [ ] **Step 1: Update the `mortar` Impact branch**

Replace the `if (weapon === 'mortar')` block with:

```jsx
  if (weapon === 'mortar') {
    return (
      <div className={cls}>
        <div className="whammy-mortar-shockwave" style={{ left: `${x - 90}px`, top: `${y - 90}px` }} />
        <div className="whammy-mortar-flash"     style={{ left: `${x - 70}px`, top: `${y - 70}px` }} />
        <div className="whammy-mortar-crater"    style={{ left: `${x - 50}px`, top: `${y - 50}px` }} />
        {renderMortarSmoke(x, y)}
        {renderMortarParticles(x, y)}
        {renderMortarSparks(x, y)}
      </div>
    );
  }
```

Add helpers at the bottom of the file:

```jsx
function renderMortarSmoke(x, y) {
  // Three smoke plumes with staggered delays — continuous column effect.
  return [0, 600, 1200].map((delay, i) => (
    <div
      key={`sm${i}`}
      className="whammy-mortar-smoke"
      style={{
        left: `${x - 18 + (Math.random() - 0.5) * 20}px`,
        top: `${y - 30}px`,
        animationDelay: `${delay}ms`,
      }}
    />
  ));
}

function renderMortarParticles(x, y) {
  // 10 glyph particles blasted outward on random trajectories.
  return Array.from({ length: 10 }).map((_, i) => {
    const angle = (i / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const dist = 60 + Math.random() * 50;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist - 20; // slight upward bias
    const rot = (Math.random() - 0.5) * 240;
    const colors = ['', 'dim', 'y', 'g'];
    const extra = colors[Math.floor(Math.random() * colors.length)];
    const style = {
      left: `${x}px`,
      top: `${y}px`,
      '--blast-tx': `${tx}px`,
      '--blast-ty': `${ty}px`,
      '--blast-rot': `${rot}deg`,
    };
    return (
      <span
        key={`p${i}`}
        className={`whammy-mortar-particle ${extra ? `whammy-mortar-particle-${extra}` : ''}`}
        style={style}
      >
        {randGlyph()}
      </span>
    );
  });
}

function renderMortarSparks(x, y) {
  return Array.from({ length: 6 }).map((_, i) => {
    const dx = (Math.random() - 0.5) * 110;
    const dy = (Math.random() - 0.5) * 110;
    return (
      <div
        key={`ms${i}`}
        className="whammy-mortar-spark"
        style={{ left: `${x + dx}px`, top: `${y + dy}px`, animationDelay: `${i * 40}ms` }}
      />
    );
  });
}
```

- [ ] **Step 2: Add mortar-particle color classes to CSS**

Open `src/index.css`. Inside the `@layer components` block, just after the existing `.whammy-mortar-particle` rule (added in Task 2), append:

```css
  .whammy-mortar-particle-dim { color: #64748b; }
  .whammy-mortar-particle-y   { color: #eab308; }
  .whammy-mortar-particle-g   { color: #22c55e; text-shadow: 0 0 6px #22c55e; }
```

- [ ] **Step 3: Reload & verify a Heavy hit**

Reload. Switch to Tribes 2. Click **Skit** repeatedly until a Heavy cameo fires (~1 in 4 skits). Watching the scene:

- Heavy raider lobs a green plasma ball on a parabolic arc (not a straight disc).
- On impact: bright green flash + expanding shockwave ring, then a dark-green smoking crater settles in.
- 10 glyph characters burst outward from ground zero with random rotations and colors.
- Green smoke puffs rise from the crater and keep looping.
- Console: no errors.

- [ ] **Step 4: Commit**

```bash
git -C C:/Claude/Samurai/Forge add src/components/whammy/ImpactOverlay.jsx src/index.css
git -C C:/Claude/Samurai/Forge commit -m "feat(whammy): heavy mortar blasts glyph particles and rising smoke column"
```

---

## Task 8: Heal pass — impacts fade when Claude finishes

**Files:**
- Modify: `src/components/whammy/ImpactOverlay.jsx`

The heal is already wired (CSS transition on `.whammy-impact.healing { opacity: 0 }` plus the `setTimeout(onImpactDone, HEAL_DURATION_MS)` in the `useEffect`). This task verifies and tunes it.

- [ ] **Step 1: Verify heal triggers in the real terminal flow**

Heal requires real busy→false transitions driven by `claudeBusyDetector`. Test path:

1. Reload Forge.
2. Switch active kit to **Tribes 2: Raiders** (picker in Whammy Studio tab).
3. Open the Terminal panel for any project with a repo path set.
4. Run `claude -p "count slowly from 1 to 20"` or any short Claude command that triggers busy for several seconds.
5. While busy, warriors spawn and fire, decals accumulate on the terminal canvas.
6. When Claude finishes, decals fade out over ~650ms and vanish.

Expected: All impacts heal cleanly. Any currently-animating glyph particles are mid-flight when heal kicks in — they either complete or get cut off by the fade; either is acceptable.

- [ ] **Step 2: Verify heal cancel on new busy**

If you start a new Claude command while the terminal still shows fading decals, the new busy→true should stop the heal (old decals stay, new impacts start landing). Test:

1. Run a long-ish Claude command (15+ seconds).
2. When Claude finishes, watch decals start to fade.
3. Within ~300ms of them starting to fade, run another Claude command.
4. Expected: fading decals snap back to full opacity (no, they won't — `opacity: 0` transition reverses naturally when `healing` class is removed). New impacts land alongside the recovering old ones.

If the snap-back isn't smooth, tune `transition: opacity 600ms ease-out` in `.whammy-impact` to `transition: opacity 650ms ease-out`. Otherwise leave as-is.

- [ ] **Step 3: Commit (if tuning changes were made)**

```bash
git -C C:/Claude/Samurai/Forge add src/components/whammy/ImpactOverlay.jsx src/index.css
git -C C:/Claude/Samurai/Forge commit -m "feat(whammy): verify heal pass timing against busy transitions"
```

If no changes were made, skip this commit step.

---

## Task 9: Mount ImpactOverlay in Terminal & final polish

**Files:**
- Modify: `src/components/Terminal.jsx` — verify ImpactOverlay is reachable via WhammyOverlay (already done in Task 4 since WhammyOverlay now renders ImpactOverlay internally; no direct Terminal edit needed).
- Modify: `src/components/whammy/tribes.jsx` — spawn-frequency tuning.

- [ ] **Step 1: Verify Terminal wiring**

Open `src/components/Terminal.jsx`. Confirm line ~827 still reads:

```jsx
<WhammyOverlay key={activeTabId || scope?.id || 'none'} scopeId={activeTabId || scope?.id} />
```

No change needed — `ImpactOverlay` is now rendered inside `WhammyOverlay`, so Terminal.jsx is untouched.

- [ ] **Step 2: Tune spawn cadence**

Open `src/components/whammy/tribes.jsx`. If during real-Claude usage the Heavy feels too rare or too common, adjust in `buildSkit`:

```jsx
const heavyCameo = Math.random() < 0.25;   // 0.25 = ~1 in 4 skits has a Heavy
```

Dial up to `0.35` for more Heavy moments, down to `0.18` if it feels overused. Default `0.25` is recommended.

- [ ] **Step 3: Adjust laneRange if warriors overlap the prompt**

Current `laneRange: [62, 82]` means warriors appear in the lower 20% of the terminal. If they feel too close to the active prompt line (bottom), raise to `[55, 75]`. If they feel like they're hovering in empty space, lower to `[68, 86]`. Tune to taste.

- [ ] **Step 4: Full smoke test**

1. Reload Forge.
2. Switch active kit to Tribes 2.
3. Open Whammy Studio → click **Solo** 6 times. Verify Light/Medium/Heavy all appear over time with their distinct silhouettes, motion arcs, and flame sizes.
4. Click **Skit** 8 times. Verify at least one Heavy cameo with mortar ball + full blast effect.
5. Open Terminal panel. Run `claude -p "analyze the nearest README and summarize"`. While busy, watch full combat play out. When Claude finishes, watch all impacts heal away.
6. Switch kit back to Classic Whammies. Verify nothing regressed.
7. Open DevTools Performance. Record 10 seconds during a busy Claude session with multiple Heavy hits. Verify frame rate stays above 45fps.

- [ ] **Step 5: Final commit**

```bash
git -C C:/Claude/Samurai/Forge add -u
git -C C:/Claude/Samurai/Forge commit -m "feat(whammy): tune tribes2 spawn cadence and lane range after smoke test"
```

(Skip if no tuning changes were made.)

---

---

## Task 10: Laser Sniper Event

Rare special event fired independently of the normal skit timer: a Blood Eagle sniper head peeks over the top edge of the terminal, paints a red laser dot, then drops a pulse beam that cuts a character and leaves a smoking hole.

**Files:**
- Create: `src/components/whammy/sniper.jsx`
- Modify: `src/components/WhammyOverlay.jsx` (mount SniperEvent + handle its impact)
- Modify: `src/components/whammy/ImpactOverlay.jsx` (add `weapon === 'sniper'` branch)
- Modify: `src/index.css` (append sniper animations)

**Timing spec:**
- First fire: 45–75s random delay after `busy` goes true
- Cooldown: minimum 20s between fires
- Cycle: peek+paint (1400ms) → beam fire (200ms) → impact → retract (400ms)
- Total on-screen time: ~2000ms per event

- [ ] **Step 1: Append sniper CSS**

Open `src/index.css`. Inside the `@layer components` block, after the mortar-particle color classes (added in Task 7), append:

```css
  /* ─── Sniper event ─── */

  .whammy-sniper-peek {
    position: absolute;
    width: 40px;
    height: 50px;
    top: 0;
    filter: drop-shadow(0 4px 6px rgba(0,0,0,0.7));
    animation: whammy-sniper-peek 2200ms ease-out forwards;
    pointer-events: none;
  }
  @keyframes whammy-sniper-peek {
    0%   { transform: translateY(-60px); opacity: 0; }
    12%  { transform: translateY(0);     opacity: 1; }
    80%  { transform: translateY(0);     opacity: 1; }
    100% { transform: translateY(-60px); opacity: 0; }
  }

  .whammy-laser-dot {
    position: absolute;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #fca5a5;
    box-shadow: 0 0 6px #ef4444, 0 0 12px rgba(239, 68, 68, 0.7);
    transform: translate(-50%, -50%);
    animation: whammy-laser-dot 2200ms ease-in-out forwards;
    pointer-events: none;
  }
  @keyframes whammy-laser-dot {
    0%, 10% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
    15%     { opacity: 1; transform: translate(-50%, -50%) scale(1.4); }
    25%     { opacity: 1; transform: translate(-50%, -50%) scale(0.9); }
    55%     { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
    63%     { opacity: 0; transform: translate(-50%, -50%) scale(1.6); }
    100%    { opacity: 0; }
  }

  .whammy-pulse-beam {
    position: absolute;
    width: 3px;
    background: linear-gradient(180deg,
      rgba(255,255,255,0) 0%,
      rgba(252,165,165,0.4) 10%,
      #fef08a 30%,
      #ffffff 50%,
      #fef08a 70%,
      rgba(252,165,165,0.8) 90%,
      rgba(252,165,165,0) 100%);
    box-shadow: 0 0 8px #ef4444, 0 0 16px rgba(239, 68, 68, 0.6), 0 0 24px rgba(248, 113, 113, 0.4);
    border-radius: 2px;
    filter: blur(0.3px);
    transform: translateX(-50%) scaleY(0);
    transform-origin: top;
    animation: whammy-pulse-beam 700ms ease-out forwards;
    animation-delay: 1400ms;
    pointer-events: none;
  }
  @keyframes whammy-pulse-beam {
    0%   { transform: translateX(-50%) scaleY(0); opacity: 0; }
    15%  { transform: translateX(-50%) scaleY(1); opacity: 1; }
    70%  { transform: translateX(-50%) scaleY(1); opacity: 1; }
    100% { transform: translateX(-50%) scaleY(1); opacity: 0; }
  }

  /* ─── Sniper impact ─── */

  .whammy-sniper-flash {
    position: absolute;
    width: 26px; height: 26px;
    border-radius: 50%;
    background: radial-gradient(circle,
      #ffffff 0%, #fecaca 25%, #f87171 50%,
      rgba(220, 38, 38, 0.5) 70%, transparent 90%);
    mix-blend-mode: screen;
    filter: blur(0.4px);
    transform: translate(-50%, -50%);
    animation: whammy-sniper-flash 400ms ease-out forwards;
  }
  @keyframes whammy-sniper-flash {
    0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
    30%  { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(1.0); opacity: 0; }
  }
  .whammy-sniper-hole {
    position: absolute;
    width: 12px; height: 12px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 40%,
      #000 35%, #1a1a1f 55%, transparent 72%);
    box-shadow: 0 0 4px #ef4444 inset, 0 0 0 1px rgba(252, 165, 165, 0.6);
    transform: translate(-50%, -50%);
  }
  .whammy-sniper-smoke {
    position: absolute;
    width: 14px; height: 24px;
    border-radius: 50%;
    background: radial-gradient(ellipse,
      rgba(252, 165, 165, 0.4) 0%, rgba(203, 213, 225, 0.3) 40%, transparent 75%);
    filter: blur(2px);
    transform: translate(-50%, -100%);
    animation: whammy-sniper-smoke 2400ms ease-out infinite;
  }
  @keyframes whammy-sniper-smoke {
    0%   { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
    20%  { opacity: 0.7; }
    100% { transform: translate(-50%, -200%) scale(1.4); opacity: 0; }
  }
  .whammy-bisect-char {
    position: absolute;
    font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
    font-size: 13px;
    pointer-events: none;
    transform: translate(-50%, -50%);
    line-height: 0.5;
  }
  .whammy-bisect-char .top,
  .whammy-bisect-char .bot {
    display: block;
    color: #fca5a5;
    text-shadow: 0 0 4px #ef4444;
  }
  .whammy-bisect-char .top { animation: whammy-bisect-top 700ms ease-out forwards; }
  .whammy-bisect-char .bot { animation: whammy-bisect-bot 700ms ease-out forwards; }
  @keyframes whammy-bisect-top {
    0%   { transform: translateY(0) rotate(0deg); }
    100% { transform: translateY(-5px) rotate(-12deg); }
  }
  @keyframes whammy-bisect-bot {
    0%   { transform: translateY(0) rotate(0deg); }
    100% { transform: translateY(5px) rotate(10deg); }
  }
```

- [ ] **Step 2: Create sniper.jsx**

```jsx
// src/components/whammy/sniper.jsx
//
// Rare special event: a Blood Eagle sniper head peeks over the top edge,
// paints a target with a red laser dot, then fires a pulse beam that
// produces a sniper-type impact. Runs on an independent timer — does not
// replace or coordinate with skit spawns.

import React, { useEffect, useRef, useState } from 'react';

const MIN_INTERVAL_MS = 45000;
const MAX_INTERVAL_MS = 75000;
const MIN_COOLDOWN_MS = 20000;

// Timing beats must match the CSS keyframes in whammy-sniper-peek and
// whammy-pulse-beam. If you change them here, update the CSS too.
const IMPACT_AT_MS = 1600;   // beam lands
const CYCLE_MS     = 2200;   // event fully clears

export default function SniperEvent({ busy, containerRef, onImpact, idRef }) {
  const [active, setActive] = useState(null);
  const lastFireAt = useRef(0);

  useEffect(() => {
    if (!busy) {
      setActive(null);
      return;
    }
    let cancelled = false;
    let scheduledId = null;

    const scheduleNext = () => {
      const delay = MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
      scheduledId = setTimeout(() => {
        if (cancelled) return;
        if (Date.now() - lastFireAt.current < MIN_COOLDOWN_MS) {
          scheduleNext();
          return;
        }
        fire();
      }, delay);
    };

    const fire = () => {
      const container = containerRef.current;
      if (!container) { scheduleNext(); return; }
      const W = container.clientWidth;
      const H = container.clientHeight;
      if (W <= 0 || H <= 0) { scheduleNext(); return; }

      const side = Math.random() < 0.5 ? 'left' : 'right';
      const sniperX = side === 'left' ? W * 0.2 : W * 0.7;
      const targetY = H * (0.3 + Math.random() * 0.4);
      const targetX = side === 'left'
        ? W * (0.55 + Math.random() * 0.3)
        : W * (0.15 + Math.random() * 0.3);
      const eventId = ++idRef.current;

      setActive({ id: eventId, side, sniperX, targetX, targetY });

      setTimeout(() => {
        if (cancelled) return;
        onImpact({ weapon: 'sniper', x: targetX, y: targetY });
        lastFireAt.current = Date.now();
      }, IMPACT_AT_MS);

      setTimeout(() => {
        if (cancelled) return;
        setActive(null);
        scheduleNext();
      }, CYCLE_MS);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (scheduledId) clearTimeout(scheduledId);
      setActive(null);
    };
  }, [busy, containerRef, onImpact, idRef]);

  if (!active) return null;

  const { side, sniperX, targetX, targetY } = active;
  const peekTransform = side === 'left' ? 'none' : 'scaleX(-1)';

  return (
    <div className="whammy-sniper-event" aria-hidden="true">
      <div
        className="whammy-sniper-peek"
        style={{ left: `${sniperX}px`, transform: peekTransform }}
      >
        <svg viewBox="0 0 40 50" width="40" height="50" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="20" cy="32" rx="10" ry="8" fill="#7f1d1d" />
          <path d="M10 32 Q20 37 30 32 L30 35 Q20 39 10 35 Z" fill="#fca5a5" />
          <rect x="28" y="34" width="22" height="2.5" fill="#1f2937" transform="rotate(14 28 35)" />
          <rect x="28" y="36.5" width="22" height="1.5" fill="#374151" transform="rotate(14 28 35)" />
          <circle cx="29" cy="32" r="2" fill="#dc2626" opacity="0.7" />
          <circle cx="29" cy="32" r="0.8" fill="#fef08a" />
          <ellipse cx="15" cy="42" rx="6" ry="3" fill="#450a0a" />
        </svg>
      </div>

      <div
        className="whammy-laser-dot"
        style={{ left: `${targetX}px`, top: `${targetY}px` }}
      />

      <div
        className="whammy-pulse-beam"
        style={{ left: `${targetX}px`, top: '0', height: `${targetY}px` }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Wire SniperEvent into WhammyOverlay**

Open `src/components/WhammyOverlay.jsx`. Add import at the top alongside `ImpactOverlay`:

```jsx
import SniperEvent from './whammy/sniper';
```

In the overlay's return JSX, add `<SniperEvent>` as a sibling inside the outer fragment, just before `<ImpactOverlay>`:

```jsx
      <SniperEvent
        busy={busy}
        containerRef={overlayRef}
        onImpact={addImpact}
        idRef={idRef}
      />
      <ImpactOverlay impacts={impacts} busy={busy} onImpactDone={removeImpact} />
```

- [ ] **Step 4: Add sniper branch to ImpactOverlay**

Open `src/components/whammy/ImpactOverlay.jsx`. Add after the `mortar` branch in the `Impact` component:

```jsx
  if (weapon === 'sniper') {
    return (
      <div className={cls}>
        <div className="whammy-sniper-flash" style={{ left: `${x}px`, top: `${y}px` }} />
        <div className="whammy-sniper-hole"  style={{ left: `${x}px`, top: `${y}px` }} />
        <div className="whammy-sniper-smoke" style={{ left: `${x}px`, top: `${y}px` }} />
        {renderBisectedChars(x, y)}
      </div>
    );
  }
```

Add the helper at the bottom of the file (next to the other `render*` helpers):

```jsx
function renderBisectedChars(x, y) {
  const CHAR_W = 7.8;
  return Array.from({ length: 3 }).map((_, i) => {
    const g = randGlyph();
    const dx = (i - 1) * CHAR_W;
    return (
      <div
        key={`bi${i}`}
        className="whammy-bisect-char"
        style={{ left: `${x + dx}px`, top: `${y}px` }}
      >
        <span className="top">{g}</span>
        <span className="bot">{g}</span>
      </div>
    );
  });
}
```

- [ ] **Step 5: Reload & verify**

Reload. Switch to Tribes 2. Open Terminal panel and run a long Claude command (45+ seconds of busy).

Expected:
- After 45–75s of continuous busy time, a sniper head appears over the top edge (left or right).
- Red laser dot pulses on a random point in the middle of the terminal for ~1400ms.
- Pulse beam snaps down from top to target in ~200ms; muzzle area brightens briefly.
- Impact: bright flash, persistent dark hole with red glow, 3 glyph characters split in half near the impact, smoke wisps looping upward.
- Sniper head retracts after ~2s total.
- When Claude finishes busy: sniper hole + smoke fade out with the rest of the impacts.
- Minimum 20s gap before next possible sniper event.

To test without waiting 45s: temporarily change `MIN_INTERVAL_MS` to 3000 and `MAX_INTERVAL_MS` to 5000 at the top of `sniper.jsx`. Revert before commit.

- [ ] **Step 6: Commit**

```bash
git -C C:/Claude/Samurai/Forge add src/index.css src/components/whammy/sniper.jsx src/components/WhammyOverlay.jsx src/components/whammy/ImpactOverlay.jsx
git -C C:/Claude/Samurai/Forge commit -m "feat(whammy): add rare Laser Sniper event with pulse beam and bisected chars"
```

---

## Rollback

If any part of the new system misbehaves in production, a clean rollback is: revert the commits from Task 2 onward. Task 1 (`physics.js` alone) is a no-op. The Classic Whammies kit is untouched throughout, so reverting keeps that intact.

## Out-of-scope notes

- **Fine-tuning the jetpack-flame scale to actual tangent velocity** would require JS sampling of the SVG path every frame. The synced `whammy-flame-burst` animation approximates it well enough; skip unless the motion feels wrong.
- **Warrior-on-warrior collision** is not implemented. Warriors pass each other freely; combat is implied by firing.
- **Touch devices** are not supported for the Playground firing interactions. Forge is Electron desktop only.

---

## Implementation status (as of 2026-04-23 trueing-up pass)

Landed in commits:
- `130f621` — `physics.js` with `TIER_CONFIG`, `SKI_ARC_PATHS`, `mortarLobPath()`.
- `5be2873` — Tribes CSS keyframes (ski arcs, projectiles, impact decals).
- `752b1ec` — `tribes.jsx` module (Light/Medium/Heavy × Blue/Red warriors, projectiles, kit export); `kits.jsx` re-registers via import.

Built but not in original spec:
- `src/components/dashboard/WhammyStudio.jsx` — kit picker, variant gallery, playground stage with idle/run/dance/spin modes, Solo/Skit/Full Parade preview. Surfaced as a "Whammies" tab on `StudioOverview.jsx`.
- `src/utils/claudeBusyDetector.js` — PTY stream parser driving `claudeBusy` per scope.

Still **not** built (in the plan but not in code):
- **Laser Sniper rare event** (Step 6 of this plan, `src/components/whammy/sniper.jsx`) — file does not exist.
- **Glyph-particle transforms** (Spinfusor vaporize/melt + mortar detach character effects). CSS keyframes (`whammy-vaporize`, `whammy-melt-drip`, `whammy-mortar-particle`) shipped in `5be2873` but `ImpactOverlay.jsx` does not spawn glyph DOM nodes — only decals. Tracked as drift in the design-doc post-implementation notes.

See `docs/superpowers/specs/2026-04-23-whammy-combat-impact-design.md` "Post-implementation truing-up notes" for full reconciliation.
