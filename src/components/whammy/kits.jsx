// Kit registry for the Whammy overlay system.
//
// A Kit is a self-contained "class" of characters that can animate across the
// Claude terminal. Each kit owns its own variants, SVGs, catchphrases, skit
// builder, and pacing knobs. The active kit is chosen by the user in the
// Whammy Studio tab and stored in Zustand (activeKitId, persisted).
//
// To add a new kit (Pac-Whammy, Street Fighter, etc.): copy the shape of
// tribes2Kit below, register it in the KITS map at the bottom.

import React from 'react';
import { tribes2Kit } from './tribes';

// ════════════════════════════════════════════════════════════════════════
// Shared SVG primitives (used by Whammies kit — kept here for reuse)
// ════════════════════════════════════════════════════════════════════════

function Body({ accent = '#C52638', shade = '#8a1a25' }) {
  return (
    <>
      <ellipse cx="36" cy="44" rx="24" ry="22" fill={accent} />
      <ellipse cx="36" cy="50" rx="14" ry="10" fill={shade} />
      <path d="M10 46 Q4 40 10 34" stroke={shade} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M62 46 Q68 40 62 34" stroke={shade} strokeWidth="6" fill="none" strokeLinecap="round" />
      <rect x="22" y="62" width="8" height="10" rx="2" fill={shade} />
      <rect x="42" y="62" width="8" height="10" rx="2" fill={shade} />
    </>
  );
}

function BaseEyes({ lashes = false }) {
  return (
    <>
      <circle cx="26" cy="38" r="7" fill="#fff" />
      <circle cx="46" cy="38" r="7" fill="#fff" />
      <circle cx="28" cy="39" r="3" fill="#000" />
      <circle cx="48" cy="39" r="3" fill="#000" />
      {lashes && (
        <>
          <path d="M20 34 L18 30" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M26 32 L26 28" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M32 34 L34 30" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M40 34 L38 30" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M46 32 L46 28" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M52 34 L54 30" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </>
  );
}

function Grin() {
  return (
    <>
      <path d="M22 52 Q36 64 50 52" stroke="#000" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <rect x="30" y="53" width="4" height="5" fill="#fff" />
      <rect x="38" y="53" width="4" height="5" fill="#fff" />
    </>
  );
}

function Lips() {
  return (
    <>
      <path d="M26 54 Q36 60 46 54 Q36 58 26 54 Z" fill="#ff4b88" />
      <path d="M26 54 Q36 50 46 54" stroke="#b8285a" strokeWidth="1" fill="none" />
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Whammies Kit — 12 costumed Press Your Luck goblins
// ════════════════════════════════════════════════════════════════════════

function Classic() {
  return (
    <>
      <path d="M20 22 L15 10 L26 18 Z" fill="#7a0f17" />
      <path d="M52 22 L57 10 L46 18 Z" fill="#7a0f17" />
      <Body />
      <BaseEyes />
      <Grin />
    </>
  );
}

function Pigtails() {
  return (
    <>
      <ellipse cx="36" cy="28" rx="22" ry="10" fill="#f5a8c8" />
      <ellipse cx="10" cy="38" rx="6" ry="12" fill="#f5a8c8" />
      <ellipse cx="62" cy="38" rx="6" ry="12" fill="#f5a8c8" />
      <circle cx="10" cy="30" r="3" fill="#ff4b88" />
      <circle cx="62" cy="30" r="3" fill="#ff4b88" />
      <Body accent="#e6406b" shade="#8a1a3a" />
      <path d="M18 24 Q36 18 54 24 Q50 30 36 30 Q22 30 18 24 Z" fill="#f5a8c8" />
      <BaseEyes lashes />
      <Lips />
      <path d="M28 14 Q36 6 44 14 Q40 20 36 16 Q32 20 28 14 Z" fill="#ff1a66" />
      <circle cx="36" cy="15" r="2.5" fill="#b8003d" />
    </>
  );
}

function LongHair() {
  return (
    <>
      <path d="M12 28 Q8 58 14 70 L20 70 Q18 48 22 28 Z" fill="#6b3410" />
      <path d="M60 28 Q64 58 58 70 L52 70 Q54 48 50 28 Z" fill="#6b3410" />
      <ellipse cx="36" cy="26" rx="22" ry="10" fill="#6b3410" />
      <Body accent="#d63a50" shade="#7a1825" />
      <path d="M16 26 Q36 20 56 26 Q52 32 36 30 Q20 32 16 26 Z" fill="#6b3410" />
      <BaseEyes lashes />
      <Lips />
    </>
  );
}

function Mohawk() {
  return (
    <>
      <path d="M30 22 L32 4 L34 22 Z" fill="#22c55e" />
      <path d="M34 22 L36 2 L38 22 Z" fill="#22c55e" />
      <path d="M38 22 L40 4 L42 22 Z" fill="#22c55e" />
      <Body />
      <BaseEyes />
      <path d="M20 30 L30 32" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M52 30 L42 32" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
      <Grin />
    </>
  );
}

function TopHat() {
  return (
    <>
      <rect x="22" y="6" width="28" height="18" fill="#111" />
      <rect x="18" y="22" width="36" height="4" fill="#111" />
      <rect x="22" y="10" width="28" height="2" fill="#c52638" />
      <Body />
      <BaseEyes />
      <circle cx="46" cy="38" r="9" stroke="#d4af37" strokeWidth="1.5" fill="none" />
      <path d="M46 47 L48 55" stroke="#d4af37" strokeWidth="1" />
      <Grin />
    </>
  );
}

function Cowboy() {
  return (
    <>
      <path d="M14 22 Q36 14 58 22 Q54 22 36 22 Q18 22 14 22 Z" fill="#8b5a2b" />
      <path d="M22 20 Q36 8 50 20 L50 22 L22 22 Z" fill="#8b5a2b" />
      <path d="M22 18 L50 18" stroke="#5a3a1a" strokeWidth="1.5" />
      <Body />
      <path d="M18 52 Q36 58 54 52 L54 60 Q36 64 18 60 Z" fill="#c52638" />
      <circle cx="26" cy="55" r="1" fill="#fff" />
      <circle cx="36" cy="56" r="1" fill="#fff" />
      <circle cx="46" cy="55" r="1" fill="#fff" />
      <BaseEyes />
      <Grin />
    </>
  );
}

function Propeller() {
  return (
    <>
      <ellipse cx="36" cy="20" rx="18" ry="8" fill="#3b82f6" />
      <path d="M18 22 Q36 18 54 22 L54 24 L18 24 Z" fill="#1e40af" />
      <rect x="35" y="4" width="2" height="8" fill="#1e40af" />
      <g className="whammy-propeller" style={{ transformOrigin: '36px 4px' }}>
        <ellipse cx="26" cy="4" rx="10" ry="2" fill="#eab308" />
        <ellipse cx="46" cy="4" rx="10" ry="2" fill="#eab308" />
      </g>
      <Body />
      <BaseEyes />
      <path d="M24 52 Q36 58 48 52" stroke="#000" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  );
}

function Pirate() {
  return (
    <>
      <path d="M14 22 Q36 14 58 22 L58 28 Q36 26 14 28 Z" fill="#111" />
      <circle cx="36" cy="22" r="2" fill="#fff" />
      <path d="M58 22 L68 32 L62 28 Z" fill="#111" />
      <Body />
      <BaseEyes />
      <rect x="18" y="34" width="16" height="10" rx="2" fill="#000" />
      <path d="M16 38 L58 34" stroke="#000" strokeWidth="1.5" />
      <path d="M22 52 Q36 60 50 54" stroke="#000" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <rect x="34" y="55" width="4" height="5" fill="#fff" />
    </>
  );
}

function Graduate() {
  return (
    <>
      <ellipse cx="62" cy="42" rx="5" ry="10" fill="#6b3410" />
      <ellipse cx="36" cy="24" rx="20" ry="8" fill="#6b3410" />
      <rect x="20" y="16" width="32" height="4" fill="#111" />
      <path d="M12 20 L60 20 L50 24 L22 24 Z" fill="#111" />
      <path d="M48 18 L56 30" stroke="#eab308" strokeWidth="2" />
      <circle cx="56" cy="30" r="3" fill="#eab308" />
      <Body accent="#1e40af" shade="#172554" />
      <BaseEyes lashes />
      <Lips />
    </>
  );
}

function Afro() {
  return (
    <>
      <circle cx="22" cy="22" r="10" fill="#2a1a0a" />
      <circle cx="36" cy="16" r="12" fill="#2a1a0a" />
      <circle cx="50" cy="22" r="10" fill="#2a1a0a" />
      <circle cx="28" cy="28" r="8" fill="#2a1a0a" />
      <circle cx="44" cy="28" r="8" fill="#2a1a0a" />
      <Body accent="#f97316" shade="#9a3412" />
      <BaseEyes />
      <rect x="18" y="34" width="16" height="8" rx="2" fill="#111" />
      <rect x="38" y="34" width="16" height="8" rx="2" fill="#111" />
      <rect x="34" y="37" width="4" height="1.5" fill="#111" />
      <path d="M24 52 Q36 58 48 52" stroke="#000" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  );
}

function Ballet() {
  return (
    <>
      <path d="M10 58 Q36 76 62 58 L58 70 Q36 82 14 70 Z" fill="#f9b4d0" opacity="0.9" />
      <circle cx="36" cy="14" r="8" fill="#eab308" />
      <ellipse cx="36" cy="26" rx="18" ry="7" fill="#eab308" />
      <Body accent="#ec4899" shade="#9d174d" />
      <path d="M14 56 Q36 68 58 56 L58 64 Q36 72 14 64 Z" fill="#f9b4d0" />
      <BaseEyes lashes />
      <Lips />
    </>
  );
}

function Ninja() {
  return (
    <>
      <path d="M10 26 Q36 10 62 26 L62 40 L10 40 Z" fill="#111" />
      <rect x="10" y="38" width="52" height="6" fill="#111" />
      <Body accent="#1f2937" shade="#000" />
      <rect x="18" y="34" width="36" height="6" fill="#1f2937" />
      <circle cx="28" cy="37" r="2.5" fill="#fff" />
      <circle cx="44" cy="37" r="2.5" fill="#fff" />
      <path d="M58 30 L70 36 L62 36 Z" fill="#c52638" />
    </>
  );
}

const WHAMMY_RENDERERS = {
  classic: Classic, pigtails: Pigtails, longhair: LongHair, mohawk: Mohawk,
  tophat: TopHat, cowboy: Cowboy, propeller: Propeller, pirate: Pirate,
  graduate: Graduate, afro: Afro, ballet: Ballet, ninja: Ninja,
};

const WHAMMIES = Object.keys(WHAMMY_RENDERERS);

export const whammiesKit = {
  id: 'whammies',
  name: 'Classic Whammies',
  description: 'Press Your Luck homage — 12 costumed goblins with chase and meet skits.',
  variants: WHAMMIES,
  labels: {
    classic: 'Classic', pigtails: 'Pigtails', longhair: 'Long Hair', mohawk: 'Mohawk',
    tophat: 'Top Hat', cowboy: 'Cowboy', propeller: 'Propeller', pirate: 'Pirate',
    graduate: 'Graduate', afro: 'Afro', ballet: 'Ballet', ninja: 'Ninja',
  },
  shouts: {
    classic: 'WHAMMY!', pigtails: 'WHEEEE!', longhair: 'OOPS!', mohawk: 'RAWR!',
    tophat: 'INDEED!', cowboy: 'YEEHAW!', propeller: 'ZOOM!', pirate: 'ARRR!',
    graduate: 'A+!', afro: 'GROOVY!', ballet: 'TWIRL!', ninja: '...',
  },
  skitChance: 0.28,
  spawnInterval: 9500,
  runDuration: 5500,
  laneRange: [78, 88],

  renderVariant(id) {
    const Cmp = WHAMMY_RENDERERS[id] || WHAMMY_RENDERERS.classic;
    return <Cmp />;
  },
  pickVariant() { return WHAMMIES[Math.floor(Math.random() * WHAMMIES.length)]; },

  buildSolo(idRef, lane) {
    return {
      whammies: [{
        id: ++idRef.current,
        lane,
        reverse: Math.random() < 0.5,
        variant: this.pickVariant(),
        duration: this.runDuration + Math.round((Math.random() - 0.5) * 600),
      }],
    };
  },

  buildSkit(idRef, lane) {
    const dur = this.runDuration + 400;
    const skitType = Math.random() < 0.5 ? 'meet' : 'chase';

    if (skitType === 'meet') {
      const a = this.pickVariant();
      let b = this.pickVariant();
      if (b === a) b = WHAMMIES[(WHAMMIES.indexOf(a) + 3) % WHAMMIES.length];
      return {
        whammies: [
          { id: ++idRef.current, lane, reverse: false, variant: a, duration: dur },
          { id: ++idRef.current, lane, reverse: true,  variant: b, duration: dur },
        ],
        bubbles: [{ id: ++idRef.current, lane: lane - 8, emoji: '💥', ttl: 1600 }],
      };
    }

    const reverse = Math.random() < 0.5;
    const runner = this.pickVariant();
    return {
      whammies: [
        { id: ++idRef.current, lane, reverse, variant: runner, duration: dur, label: 'HELP!' },
        { id: ++idRef.current, lane: lane - 1, reverse, variant: 'mohawk', duration: dur, delay: 450, label: 'GRRR!' },
      ],
    };
  },
};

// ════════════════════════════════════════════════════════════════════════
// Registry
// ════════════════════════════════════════════════════════════════════════

export const KITS = {
  whammies: whammiesKit,
  tribes2:  tribes2Kit,
};

export function getActiveKit(id) {
  return KITS[id] || KITS.whammies;
}

// Universal SVG wrapper — takes a kit object (or id), variant id, and
// optional extras (e.g., { carryingFlag: true } for the medium raider).
// Tribes renderers return their own <svg>; Whammies renderers return raw
// elements that we wrap here. We detect based on kit id.
export function WhammySvg({ kit, variant, size = 72, extras }) {
  const k = typeof kit === 'string' ? KITS[kit] : (kit || KITS.whammies);
  if (k.id === 'tribes2') {
    // Tribes components already return a full <svg> with their own viewBox.
    // Wrap in a fixed-size span so the caller can control footprint.
    return (
      <span style={{ display: 'inline-block', width: size, height: Math.round(size * 46 / 40) }}>
        {k.renderVariant(variant, extras)}
      </span>
    );
  }
  return (
    <svg
      width={size}
      height={Math.round(size * 80 / 72)}
      viewBox="0 0 72 80"
      xmlns="http://www.w3.org/2000/svg"
    >
      {k.renderVariant(variant, extras)}
    </svg>
  );
}
