import React from 'react';

const TEMPLATE_STYLES = {
  'space-epic': {
    bg: 'linear-gradient(135deg, #0a0e27 0%, #1a1a3e 50%, #0a0e27 100%)',
    accent: '#0ea5e9',
    secondary: '#f97316',
    fontFamily: '"Courier New", monospace',
  },
  'underground-neon': {
    bg: 'linear-gradient(135deg, #0f1a0f 0%, #1a0f1a 50%, #0f1a0f 100%)',
    accent: '#10B981',
    secondary: '#EC4899',
    fontFamily: '"Arial Black", sans-serif',
  },
  'roblox-playful': {
    bg: 'linear-gradient(135deg, #1a2744 0%, #2a3758 50%, #1a2744 100%)',
    accent: '#3B82F6',
    secondary: '#22C55E',
    fontFamily: '"Comic Sans MS", "Segoe UI", sans-serif',
  },
};

export default function HeroSection({ config, template, isPreview }) {
  const style = TEMPLATE_STYLES[template] || TEMPLATE_STYLES['space-epic'];
  const scale = isPreview ? 0.6 : 1;

  return (
    <div
      className="relative overflow-hidden flex flex-col items-center justify-center text-center"
      style={{
        background: style.bg,
        minHeight: isPreview ? 200 : 400,
        padding: `${60 * scale}px ${40 * scale}px`,
      }}
    >
      {/* Decorative elements */}
      <div className="absolute inset-0 opacity-10">
        {template === 'space-epic' && (
          <>
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  width: Math.random() * 3 + 1,
                  height: Math.random() * 3 + 1,
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  opacity: Math.random() * 0.8 + 0.2,
                }}
              />
            ))}
          </>
        )}
        {template === 'underground-neon' && (
          <div className="absolute inset-0" style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 20px, ${style.accent}08 20px, ${style.accent}08 21px), repeating-linear-gradient(90deg, transparent, transparent 20px, ${style.accent}08 20px, ${style.accent}08 21px)`,
          }} />
        )}
      </div>

      <div className="relative z-10">
        <h1
          className="font-bold leading-tight"
          style={{
            fontSize: `${36 * scale}px`,
            fontFamily: style.fontFamily,
            color: '#ffffff',
            textShadow: `0 0 40px ${style.accent}40`,
          }}
        >
          {config.headline || 'Your Game Title'}
        </h1>
        {config.subheadline && (
          <p
            className="mt-3 max-w-lg mx-auto"
            style={{
              fontSize: `${16 * scale}px`,
              color: '#a0aec0',
              fontFamily: style.fontFamily,
            }}
          >
            {config.subheadline}
          </p>
        )}
        {config.ctaText && (
          <button
            className="mt-6 rounded-lg font-bold transition-transform hover:scale-105"
            style={{
              padding: `${12 * scale}px ${32 * scale}px`,
              fontSize: `${14 * scale}px`,
              backgroundColor: style.accent,
              color: '#ffffff',
              boxShadow: `0 0 20px ${style.accent}40`,
            }}
          >
            {config.ctaText}
          </button>
        )}
      </div>
    </div>
  );
}
