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
  runDuration: 7000,
  laneRange: [62, 82],

  renderVariant(id, extras = {}) {
    const Cmp = TRIBES_RENDERERS[id] || TRIBES_RENDERERS['medium-blue'];
    return <Cmp extras={extras} />;
  },
  pickVariant() {
    return VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
  },

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

  buildSkit(idRef, lane) {
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

    const projectiles = [];
    const makeHit = (shooter, weapon, atT, impactDx, impactDy) => {
      const id = ++idRef.current;
      projectiles.push({
        id,
        weapon,
        shooterId: shooter.id,
        team: shooter.team,
        fireAtT: atT,
        flightMs: weapon === 'mortar' ? 1400 : 900,
        impactDx,
        impactDy,
      });
    };

    const blueWeapon = blueTier === 'heavy' ? 'mortar' : 'spinfusor';
    const redWeapon  = redTier === 'heavy' ? 'mortar' : 'spinfusor';
    makeHit(warriors[1], redWeapon, 0.25, 180, -8);
    makeHit(warriors[0], blueWeapon, 0.40, -140, 6);
    makeHit(warriors[1], redWeapon, 0.55, 200, 4);
    makeHit(warriors[0], blueWeapon, 0.72, -160, -4);

    return { warriors, projectiles };
  },
};
