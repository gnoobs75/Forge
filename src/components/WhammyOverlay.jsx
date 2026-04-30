import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { playSound } from '../utils/sounds';
import { getActiveKit, WhammySvg } from './whammy/kits';
import { TIER_CONFIG, computeShooterPctX } from './whammy/physics';
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

// Map runStyle → CSS keyframe. Default warriors use the basic whammy-run
// sweep; choreographed warriors (flag-carrier, chaser, returning, sniper)
// use bespoke keyframes that hold position, die in place, etc.
const RUNSTYLE_KEYFRAME = {
  'flag-carrier': 'whammy-tribes-flag-run',
  'chaser':       'whammy-tribes-chase',
  'returning':    'whammy-tribes-flag-return',
  'sniper-stand': 'whammy-tribes-sniper',
};

// ── Tribes warrior: linear left→right sweep with a vertical ski-bob ──
// Outer element animates `left` so the lane% top positioning is preserved.
// Inner element applies the ski bob (translateY + rotate) on loop.
function TribesWarrior({ id, lane, reverse, variant, tier, duration, delay, extras, label, runStyle, kit, onDone }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.medium;
  const shout = label ?? kit.shouts[variant] ?? '';
  const animName = RUNSTYLE_KEYFRAME[runStyle] || 'whammy-run';
  // Custom keyframes bake direction into the keyframe itself, so we only
  // play animation in reverse for the default whammy-run sprint.
  const useDirReverse = !runStyle && reverse;
  const style = {
    top: `${lane}%`,
    animation: `${animName} ${duration}ms linear ${delay || 0}ms forwards`,
    animationDirection: useDirReverse ? 'reverse' : 'normal',
    transform: reverse ? 'scaleX(-1)' : 'scaleX(1)',
  };
  return (
    <div className="whammy whammy-tribes" style={style} onAnimationEnd={onDone}>
      <div className="whammy-tribes-ski">
        <WhammySvg kit={kit} variant={variant} extras={extras} size={cfg.size} />
        {shout && <div className="whammy-shout">{shout}</div>}
      </div>
    </div>
  );
}

// ── Mortar telegraph: green wireframe arc + locking reticle ─────────
// Old-school targeting overlay shown for `duration` ms before a mortar
// fires. Renders a parabolic preview of the round's flight path plus
// pulsing crosshair on the predicted impact point.
function MortarTelegraph({ fromX, fromY, toX, toY, peakPx = 200, duration = 1200 }) {
  const midX = (fromX + toX) / 2;
  const peakY = Math.min(fromY, toY) - peakPx;
  const arcPath = `M ${fromX} ${fromY} Q ${midX} ${peakY} ${toX} ${toY}`;
  const scanStyle = { animationDuration: `${duration}ms` };
  return (
    <svg className="whammy-telegraph">
      <path className="whammy-telegraph-arc" d={arcPath} style={scanStyle} />
      <circle className="whammy-telegraph-reticle" cx={toX} cy={toY} r="22" />
      <circle className="whammy-telegraph-reticle" cx={toX} cy={toY} r="14" />
      <circle className="whammy-telegraph-dot" cx={toX} cy={toY} r="2.5" />
      <line className="whammy-telegraph-tick" x1={toX - 28} y1={toY} x2={toX - 14} y2={toY} />
      <line className="whammy-telegraph-tick" x1={toX + 14} y1={toY} x2={toX + 28} y2={toY} />
      <line className="whammy-telegraph-tick" x1={toX} y1={toY - 28} x2={toX} y2={toY - 14} />
      <line className="whammy-telegraph-tick" x1={toX} y1={toY + 14} x2={toX} y2={toY + 28} />
      <text className="whammy-telegraph-text" x={toX + 30} y={toY - 18}>
        TARGET LOCKED
      </text>
    </svg>
  );
}

// ── Spinfusor disc / mortar ball projectile ─────────────────────────
// Fires from (fromX, fromY) to (toX, toY). Spinfusor = straight line,
// mortar = parabolic arc. Each class has its own keyframe so the arc
// shape differs per weapon while sharing the same travel duration.
function Projectile({ id, weapon, fromX, fromY, toX, toY, duration, peakPx, team, onImpact }) {
  const isMortar = weapon === 'mortar';
  const dx = toX - fromX;
  const dy = toY - fromY;
  const color = team === 'red' ? '#fca5a5' : '#93c5fd';
  const mortarColor = '#22c55e';
  const style = {
    left: `${fromX}px`,
    top: `${fromY}px`,
    '--proj-dx': `${dx}px`,
    '--proj-dy': `${dy}px`,
    '--proj-color': isMortar ? mortarColor : color,
    '--proj-duration': `${duration}ms`,
    '--proj-peak': peakPx ? `${peakPx}px` : '80px',
  };
  const cls = isMortar ? 'whammy-mortar-ball' : 'whammy-disc';
  return (
    <div className={cls} style={style} onAnimationEnd={() => onImpact({ x: toX, y: toY, weapon })}>
      {isMortar && <div className="whammy-mortar-ball-trail" />}
    </div>
  );
}

// ── Overlay ─────────────────────────────────────────────────────────
export default function WhammyOverlay({ scopeId }) {
  const busy = useStore(s => (scopeId ? !!s.claudeBusy[scopeId] : false));
  const activeKitId = useStore(s => s.activeKitId || 'whammies');
  const kit = getActiveKit(activeKitId);

  const [entities, setEntities] = useState([]);
  const [impacts, setImpacts] = useState([]);
  const [bubbles, setBubbles] = useState([]);
  const idRef = useRef(0);
  const prevBusy = useRef(false);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!busy) return;
    playSoundThrottled('spawn');

    // Weapon muzzle offsets from the warrior's bounding-box center.
    // .whammy-tribes is 56×64. The SVG inside (40×46 viewBox) places the
    // muzzle at ~90% width / 57% height; these values translate that to
    // container-pixel offsets so projectiles spawn out of the gun barrel.
    const MUZZLE_DX = { light: 14, medium: 15, heavy: 18 };
    const MUZZLE_DY = 3;   // ~3px below body center for all tiers
    const BODY_HALF_H = 32;

    const schedulePayloadProjectiles = (projectiles, warriors) => {
      const container = overlayRef.current;
      if (!container) return;
      const W = container.clientWidth;
      const H = container.clientHeight;

      projectiles.forEach(p => {
        const shooter = warriors.find(w => w.id === p.shooterId);
        if (!shooter) return;

        // Origin: shooter's gun muzzle at fire time.
        const shooterPctX = computeShooterPctX(shooter, p.fireAtT);
        const shooterX = (shooterPctX / 100) * W;
        const laneY = (shooter.lane / 100) * H;
        const bodyCenterY = laneY + BODY_HALF_H;
        const facing = shooter.reverse ? -1 : 1;
        const muzzleDx = MUZZLE_DX[shooter.tier] ?? MUZZLE_DX.medium;
        const fromX = shooterX + facing * muzzleDx;
        const fromY = bodyCenterY + MUZZLE_DY;

        // Target: either impactPct (percentage of container) for cross-screen
        // shots, or impactDx/Dy (pixel offset from shooter) for nearby fire.
        let toX, toY;
        if (p.impactPct) {
          toX = (p.impactPct.x / 100) * W;
          toY = (p.impactPct.y / 100) * H + BODY_HALF_H;
        } else {
          toX = shooterX + (p.impactDx || 0);
          toY = bodyCenterY + (p.impactDy || 0);
        }

        const fireDelay = (shooter.delay || 0) + (shooter.duration * p.fireAtT);

        // If a telegraph is requested, render it for leadMs prior to firing.
        if (p.telegraph?.leadMs) {
          const leadMs = p.telegraph.leadMs;
          const teleAt = Math.max(0, fireDelay - leadMs);
          setTimeout(() => {
            const teleId = ++idRef.current;
            setEntities(es => [...es, {
              kind: 'telegraph',
              id: teleId,
              fromX, fromY, toX, toY,
              peakPx: p.peakPx,
              duration: leadMs,
            }]);
            setTimeout(() => setEntities(es => es.filter(x => x.id !== teleId)), leadMs);
          }, teleAt);
        }

        setTimeout(() => {
          const projId = ++idRef.current;
          setEntities(es => [...es, {
            kind: 'projectile',
            id: projId,
            weapon: p.weapon,
            fromX, fromY, toX, toY,
            duration: p.flightMs,
            peakPx: p.peakPx,
            team: p.team,
          }]);
        }, fireDelay);
      });
    };

    const spawn = () => {
      const [laneMin, laneMax] = kit.laneRange;
      const lane = laneMin + Math.random() * (laneMax - laneMin);
      const payload = Math.random() < kit.skitChance
        ? kit.buildSkit(idRef, lane)
        : kit.buildSolo(idRef, lane);

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
          if (e.kind === 'telegraph') {
            return <MortarTelegraph key={e.id} {...e} />;
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
