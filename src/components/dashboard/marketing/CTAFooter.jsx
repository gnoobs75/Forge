import React from 'react';

export default function CTAFooter({ config, template, isPreview }) {
  const scale = isPreview ? 0.7 : 1;
  const accentColor = template === 'underground-neon' ? '#10B981' : template === 'roblox-playful' ? '#3B82F6' : '#0ea5e9';

  return (
    <div
      className="text-center"
      style={{
        padding: `${60 * scale}px ${32 * scale}px`,
        background: `linear-gradient(180deg, #111827 0%, ${accentColor}15 100%)`,
      }}
    >
      <h2
        className="font-bold"
        style={{ fontSize: `${28 * scale}px`, color: '#e2e8f0' }}
      >
        {config.headline || 'Ready to Play?'}
      </h2>
      {config.subheadline && (
        <p style={{ fontSize: `${14 * scale}px`, color: '#9ca3af', marginTop: 12 * scale }}>
          {config.subheadline}
        </p>
      )}
      <button
        className="rounded-lg font-bold transition-transform hover:scale-105"
        style={{
          marginTop: 24 * scale,
          padding: `${14 * scale}px ${40 * scale}px`,
          fontSize: `${16 * scale}px`,
          backgroundColor: accentColor,
          color: '#ffffff',
          boxShadow: `0 0 30px ${accentColor}40`,
        }}
      >
        {config.ctaText || 'Get it Now'}
      </button>
    </div>
  );
}
