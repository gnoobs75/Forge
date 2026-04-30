import React, { useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { WhammySvg, KITS, getActiveKit } from '../WhammyOverlay';
import { computeShooterPctX, TIER_CONFIG } from '../whammy/physics';
import { playSound } from '../../utils/sounds';

// Little Whammy Studio — gallery + playground + extension help.
// Lives in the Studio Overview tab bar. Doesn't depend on Claude busy state.
// Reads the active kit from Zustand and switches between kits via picker.

const ANIM_MODES = [
  { id: 'idle',   label: 'Idle (bounce)',   desc: 'Stand in place, bouncing' },
  { id: 'run',    label: 'Run Across',       desc: 'Classic overlay run cycle' },
  { id: 'dance',  label: 'Dance',            desc: 'Wiggle + rotate in place' },
  { id: 'spin',   label: 'Spin',             desc: 'Full rotation loop' },
];

export default function WhammyStudio() {
  const activeKitId = useStore(s => s.activeKitId || 'whammies');
  const setActiveKitId = useStore(s => s.setActiveKitId);
  const kit = getActiveKit(activeKitId);
  const variants = kit.variants;

  const [selected, setSelected] = useState(variants[0]);
  const [animMode, setAnimMode] = useState('idle');
  const [playground, setPlayground] = useState([]);
  const [projectiles, setProjectiles] = useState([]);
  const [telegraphs, setTelegraphs] = useState([]);
  const idRef = useRef(0);
  const stageRef = useRef(null);

  // Keep `selected` valid when the user switches kits.
  if (!variants.includes(selected)) {
    // setState during render is fine here because it's conditional and converges.
    setSelected(variants[0]);
  }

  const handleSelect = (v) => {
    setSelected(v);
    playSound('click');
  };

  const cycleAnim = () => {
    const idx = ANIM_MODES.findIndex(m => m.id === animMode);
    const next = ANIM_MODES[(idx + 1) % ANIM_MODES.length];
    setAnimMode(next.id);
    playSound('tab');
  };

  const switchKit = (id) => {
    setActiveKitId(id);
    playSound('tab');
    setPlayground([]);
  };

  const spawnInPlayground = (variant, opts = {}) => {
    const id = ++idRef.current;
    const [laneMin, laneMax] = kit.laneRange;
    const lane = opts.lane ?? (laneMin + Math.random() * (laneMax - laneMin));
    const reverse = opts.reverse ?? Math.random() < 0.5;
    const duration = opts.duration ?? kit.runDuration;
    const delay = opts.delay ?? 0;
    const label = opts.label;
    // Infer kind from active kit so tribes variants pick up the tribes render path.
    const kind = kit.id === 'tribes2' ? 'tribes' : 'classic';
    setPlayground(p => [...p, { id, variant, lane, reverse, duration, delay, label, kind }]);
    setTimeout(() => setPlayground(p => p.filter(w => w.id !== id)), duration + delay + 200);
  };

  // Muzzle offsets — mirror of WhammyOverlay so Studio projectiles spawn
  // from the raider's gun barrel rather than their bounding-box center.
  const MUZZLE_DX = { light: 14, medium: 15, heavy: 18 };
  const MUZZLE_DY = 3;
  const BODY_HALF_H = 32;

  const schedulePlaygroundProjectiles = (projs, warriors) => {
    const stage = stageRef.current;
    if (!stage) return;
    const W = stage.clientWidth;
    const H = stage.clientHeight;

    projs.forEach(p => {
      const shooter = warriors.find(w => w.id === p.shooterId);
      if (!shooter) return;
      const shooterPctX = computeShooterPctX(shooter, p.fireAtT);
      const shooterX = (shooterPctX / 100) * W;
      const laneY = (shooter.lane / 100) * H;
      const bodyCenterY = laneY + BODY_HALF_H;
      const facing = shooter.reverse ? -1 : 1;
      const muzzleDx = MUZZLE_DX[shooter.tier] ?? MUZZLE_DX.medium;
      const fromX = shooterX + facing * muzzleDx;
      const fromY = bodyCenterY + MUZZLE_DY;
      let toX, toY;
      if (p.impactPct) {
        toX = (p.impactPct.x / 100) * W;
        toY = (p.impactPct.y / 100) * H + BODY_HALF_H;
      } else {
        toX = shooterX + (p.impactDx || 0);
        toY = bodyCenterY + (p.impactDy || 0);
      }
      const fireDelay = (shooter.delay || 0) + (shooter.duration * p.fireAtT);

      // Schedule telegraph if requested.
      if (p.telegraph?.leadMs) {
        const leadMs = p.telegraph.leadMs;
        const teleAt = Math.max(0, fireDelay - leadMs);
        setTimeout(() => {
          const teleId = ++idRef.current;
          setTelegraphs(ts => [...ts, {
            id: teleId, fromX, fromY, toX, toY,
            peakPx: p.peakPx, duration: leadMs,
          }]);
          setTimeout(() => setTelegraphs(ts => ts.filter(x => x.id !== teleId)), leadMs);
        }, teleAt);
      }

      setTimeout(() => {
        const projId = ++idRef.current;
        setProjectiles(ps => [...ps, {
          id: projId, weapon: p.weapon, team: p.team,
          fromX, fromY, toX, toY, duration: p.flightMs,
          peakPx: p.peakPx,
        }]);
        setTimeout(() => setProjectiles(ps => ps.filter(x => x.id !== projId)), p.flightMs + 250);
      }, fireDelay);
    });
  };

  // Normalise whatever shape a kit returns into playground entities.
  // Whammies kit returns { whammies[] }; tribes2 returns { warriors[], projectiles[] }.
  const absorbPayload = (payload) => {
    const entities = [
      ...(payload.whammies || []).map(w => ({ ...w, kind: 'classic' })),
      ...(payload.warriors || []).map(w => ({ ...w, kind: 'tribes' })),
    ];
    entities.forEach(e => {
      setPlayground(p => [...p, e]);
      const ttl = (e.duration || 3600) + (e.delay || 0) + 200;
      setTimeout(() => setPlayground(p => p.filter(x => x.id !== e.id)), ttl);
    });
    if (payload.projectiles?.length) {
      schedulePlaygroundProjectiles(payload.projectiles, payload.warriors || []);
    }
  };

  const playSkit = () => {
    playSound('spawn');
    const [laneMin, laneMax] = kit.laneRange;
    const lane = laneMin + Math.random() * (laneMax - laneMin);
    absorbPayload(kit.buildSkit(idRef, lane));
  };

  const playSolo = () => {
    playSound('spawn');
    const [laneMin, laneMax] = kit.laneRange;
    const lane = laneMin + Math.random() * (laneMax - laneMin);
    absorbPayload(kit.buildSolo(idRef, lane));
  };

  const playParade = () => {
    playSound('complete');
    variants.forEach((v, i) => {
      setTimeout(() => spawnInPlayground(v, { reverse: false, duration: 4200 }), i * 220);
    });
  };

  const clearPlayground = () => {
    setPlayground([]);
    setProjectiles([]);
    setTelegraphs([]);
  };

  const RUNSTYLE_KEYFRAME = {
    'flag-carrier': 'whammy-tribes-flag-run',
    'chaser':       'whammy-tribes-chase',
    'returning':    'whammy-tribes-flag-return',
    'sniper-stand': 'whammy-tribes-sniper',
  };

  return (
    <div className="space-y-4">
      {/* Kit picker */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-forge-text-primary">Active Kit</h3>
            <p className="text-xs text-forge-text-muted">{kit.description}</p>
          </div>
          <div className="flex items-center gap-2">
            {Object.values(KITS).map(k => (
              <button
                key={k.id}
                onClick={() => switchKit(k.id)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                  activeKitId === k.id
                    ? 'border-forge-accent bg-forge-accent/10 text-forge-accent'
                    : 'border-forge-border bg-forge-bg text-forge-text-secondary hover:border-forge-accent/50'
                }`}
              >
                {k.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Playground */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-forge-border">
          <div>
            <h3 className="text-sm font-bold text-forge-text-primary">Playground</h3>
            <p className="text-xs text-forge-text-muted">Run skits, parade the cast, see them in action.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs" onClick={playSolo}>Solo</button>
            <button className="btn-secondary text-xs" onClick={playSkit}>Skit</button>
            <button className="btn-secondary text-xs" onClick={playParade}>Full Parade</button>
            <button className="btn-secondary text-xs" onClick={clearPlayground}>Clear</button>
          </div>
        </div>
        <div ref={stageRef} className="whammy-studio-stage" aria-hidden="true">
          {telegraphs.map(t => {
            const midX = (t.fromX + t.toX) / 2;
            const peakY = Math.min(t.fromY, t.toY) - (t.peakPx ?? 200);
            const arcD = `M ${t.fromX} ${t.fromY} Q ${midX} ${peakY} ${t.toX} ${t.toY}`;
            return (
              <svg key={t.id} className="whammy-telegraph">
                <path className="whammy-telegraph-arc" d={arcD}
                      style={{ animationDuration: `${t.duration}ms` }} />
                <circle className="whammy-telegraph-reticle" cx={t.toX} cy={t.toY} r="22" />
                <circle className="whammy-telegraph-reticle" cx={t.toX} cy={t.toY} r="14" />
                <circle className="whammy-telegraph-dot" cx={t.toX} cy={t.toY} r="2.5" />
                <line className="whammy-telegraph-tick" x1={t.toX - 28} y1={t.toY} x2={t.toX - 14} y2={t.toY} />
                <line className="whammy-telegraph-tick" x1={t.toX + 14} y1={t.toY} x2={t.toX + 28} y2={t.toY} />
                <line className="whammy-telegraph-tick" x1={t.toX} y1={t.toY - 28} x2={t.toX} y2={t.toY - 14} />
                <line className="whammy-telegraph-tick" x1={t.toX} y1={t.toY + 14} x2={t.toX} y2={t.toY + 28} />
                <text className="whammy-telegraph-text" x={t.toX + 30} y={t.toY - 18}>TARGET LOCKED</text>
              </svg>
            );
          })}
          {projectiles.map(p => {
            const dx = p.toX - p.fromX;
            const dy = p.toY - p.fromY;
            const isMortar = p.weapon === 'mortar';
            const color = p.team === 'red' ? '#fca5a5' : '#93c5fd';
            const style = {
              left: `${p.fromX}px`,
              top: `${p.fromY}px`,
              '--proj-dx': `${dx}px`,
              '--proj-dy': `${dy}px`,
              '--proj-color': isMortar ? '#22c55e' : color,
              '--proj-duration': `${p.duration}ms`,
              '--proj-peak': p.peakPx ? `${p.peakPx}px` : '80px',
            };
            const cls = isMortar ? 'whammy-mortar-ball' : 'whammy-disc';
            return (
              <div key={p.id} className={cls} style={style}>
                {isMortar && <div className="whammy-mortar-ball-trail" />}
              </div>
            );
          })}
          {playground.map(w => {
            const shout = w.label ?? kit.shouts[w.variant] ?? '';
            if (w.kind === 'tribes') {
              const animName = RUNSTYLE_KEYFRAME[w.runStyle] || 'whammy-run';
              const useDirReverse = !w.runStyle && w.reverse;
              const cfg = TIER_CONFIG[w.tier] || TIER_CONFIG.medium;
              return (
                <div
                  key={w.id}
                  className="whammy whammy-tribes"
                  style={{
                    top: `${w.lane}%`,
                    animation: `${animName} ${w.duration}ms linear ${w.delay || 0}ms forwards`,
                    animationDirection: useDirReverse ? 'reverse' : 'normal',
                    transform: w.reverse ? 'scaleX(-1)' : 'scaleX(1)',
                  }}
                >
                  <div className="whammy-tribes-ski">
                    <WhammySvg kit={kit} variant={w.variant} extras={w.extras} size={cfg.size} />
                    {shout && <div className="whammy-shout">{shout}</div>}
                  </div>
                </div>
              );
            }
            return (
              <div
                key={w.id}
                className={`whammy ${w.skiing ? 'whammy-skiing' : ''}`}
                style={{
                  top: `${w.lane}%`,
                  animation: `whammy-run ${w.duration}ms cubic-bezier(.4,.2,.6,.8) ${w.delay || 0}ms forwards`,
                  animationDirection: w.reverse ? 'reverse' : 'normal',
                  transform: w.reverse ? 'scaleX(-1)' : 'scaleX(1)',
                }}
              >
                <div className="whammy-bounce">
                  <WhammySvg kit={kit} variant={w.variant} />
                  {shout && <div className="whammy-shout">{shout}</div>}
                </div>
              </div>
            );
          })}
          {playground.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-forge-text-muted text-sm italic">
              Click a button above, or tap a character below to send one running across.
            </div>
          )}
        </div>
      </div>

      {/* Focused whammy + animation cycler */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card flex flex-col items-center justify-center py-6">
          <div className={`whammy-focus whammy-focus-${animMode}`}>
            <WhammySvg kit={kit} variant={selected} size={140} />
          </div>
          <div className="mt-3 text-forge-text-primary font-bold text-sm">
            {kit.labels[selected]}
          </div>
          <div className="text-xs text-forge-text-muted">{kit.shouts[selected]}</div>
          <button
            className="btn-secondary text-xs mt-4"
            onClick={cycleAnim}
            title="Cycle animation mode"
          >
            Animation: {ANIM_MODES.find(m => m.id === animMode)?.label}
          </button>
        </div>

        {/* Cast roster */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-forge-text-primary">The Cast</h3>
            <span className="text-xs text-forge-text-muted">{variants.length} variants · tap to preview</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {variants.map(v => (
              <button
                key={v}
                onClick={() => { handleSelect(v); spawnInPlayground(v); }}
                onDoubleClick={() => spawnInPlayground(v, { reverse: true })}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${
                  selected === v
                    ? 'border-forge-accent bg-forge-accent/10'
                    : 'border-forge-border bg-forge-bg hover:border-forge-accent/50'
                }`}
                title={`Click to preview · Double-click to run right-to-left · ${kit.shouts[v]}`}
              >
                <WhammySvg kit={kit} variant={v} size={56} />
                <div className="text-[10px] text-forge-text-secondary mt-1 uppercase tracking-wider">
                  {kit.labels[v]}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Help / Extend */}
      <HelpExtend />
    </div>
  );
}

function HelpExtend() {
  return (
    <div className="card">
      <details>
        <summary className="cursor-pointer text-sm font-bold text-forge-text-primary select-none">
          How to extend the Whammy Studio
        </summary>
        <div className="mt-4 space-y-4 text-xs text-forge-text-secondary leading-relaxed">
          <section>
            <h4 className="text-forge-text-primary font-bold mb-1">Files at a glance</h4>
            <ul className="list-disc ml-5 space-y-0.5">
              <li><code>src/components/whammy/kits.jsx</code> — all kits (variants, SVGs, shouts, skit builders)</li>
              <li><code>src/components/WhammyOverlay.jsx</code> — thin orchestrator that spawns entities from the active kit</li>
              <li><code>src/components/dashboard/WhammyStudio.jsx</code> — this tab (picker + gallery + playground + docs)</li>
              <li><code>src/utils/claudeBusyDetector.js</code> — parses PTY stream to detect "Claude is computing"</li>
              <li><code>src/index.css</code> — <code>@keyframes whammy-*</code> and overlay CSS</li>
            </ul>
          </section>

          <section>
            <h4 className="text-forge-text-primary font-bold mb-1">Add a new kit</h4>
            <ol className="list-decimal ml-5 space-y-0.5">
              <li>Open <code>src/components/whammy/kits.jsx</code>.</li>
              <li>Copy the shape of <code>tribes2Kit</code>: define SVG renderers, then an object with <code>id</code>, <code>name</code>, <code>variants</code>, <code>labels</code>, <code>shouts</code>, <code>renderVariant()</code>, <code>pickVariant()</code>, <code>buildSolo()</code>, <code>buildSkit()</code>, plus pacing knobs (<code>skitChance</code>, <code>spawnInterval</code>, <code>runDuration</code>, <code>laneRange</code>).</li>
              <li>Register it in the <code>KITS</code> map at the bottom of the file.</li>
              <li>Reload Forge — the new kit shows up in the picker automatically.</li>
            </ol>
          </section>

          <section>
            <h4 className="text-forge-text-primary font-bold mb-1">Add a costume to an existing kit</h4>
            <p>Inside the kit's section of <code>kits.jsx</code>: write a new SVG component, add the id to the kit's <code>variants</code> array, add a label and shout, and register it in the kit's <code>_RENDERERS</code> map. The studio and overlay pick it up automatically.</p>
          </section>

          <section>
            <h4 className="text-forge-text-primary font-bold mb-1">Detection knobs</h4>
            <p>Busy detection watches two sentinels in the raw PTY stream: the string <code>esc to interrupt</code> and the Braille spinner glyphs. Idle timeout is 1500ms. Tune in <code>claudeBusyDetector.js</code>. If Anthropic changes the CLI output, add new sentinels to <code>SPINNER_CHARS</code> / <code>ESC_INTERRUPT</code>.</p>
          </section>
        </div>
      </details>
    </div>
  );
}
