import React, { useState, useEffect, useRef } from 'react';

export default function StatsCounter({ config, template, isPreview }) {
  const counters = config.counters || [
    { label: 'Players', value: 10000 },
    { label: 'Levels', value: 50 },
    { label: 'Hours of Content', value: 100 },
    { label: 'Achievements', value: 200 },
  ];

  const scale = isPreview ? 0.7 : 1;
  const accentColor = template === 'underground-neon' ? '#10B981' : template === 'roblox-playful' ? '#3B82F6' : '#0ea5e9';

  return (
    <div
      className="flex items-center justify-around"
      style={{
        padding: `${48 * scale}px ${32 * scale}px`,
        backgroundColor: '#111827',
        borderTop: `1px solid ${accentColor}20`,
        borderBottom: `1px solid ${accentColor}20`,
      }}
    >
      {counters.map((counter, i) => (
        <AnimatedCounter
          key={i}
          value={counter.value}
          label={counter.label}
          color={accentColor}
          scale={scale}
          isPreview={isPreview}
        />
      ))}
    </div>
  );
}

function AnimatedCounter({ value, label, color, scale, isPreview }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (isPreview) {
      setDisplay(value);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          animateCount();
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, isPreview]);

  function animateCount() {
    const duration = 1500;
    const start = performance.now();

    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  const formatted = display >= 1000
    ? `${(display / 1000).toFixed(display >= 10000 ? 0 : 1)}k`
    : display.toLocaleString();

  return (
    <div ref={ref} className="text-center">
      <div
        className="font-bold font-mono"
        style={{ fontSize: `${36 * scale}px`, color }}
      >
        {formatted}
      </div>
      <div style={{ fontSize: `${12 * scale}px`, color: '#9ca3af', marginTop: 4 * scale }}>
        {label}
      </div>
    </div>
  );
}
