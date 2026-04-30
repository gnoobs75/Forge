// src/components/whammy/ImpactOverlay.jsx
//
// Persistent damage layer that sits above the xterm canvas. Impacts arrive
// from WhammyOverlay (projectile landings) and stay on-screen while
// `claudeBusy[scope]` is true. When it flips false, the overlay runs a heal
// pass (fade out) and removes DOM nodes.

import React, { useEffect, useRef } from 'react';

const HEAL_DURATION_MS = 650;

export default function ImpactOverlay({ impacts, busy, onImpactDone }) {
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
