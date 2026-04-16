import React from 'react';

export default function FeatureGrid({ config, template, isPreview }) {
  const items = config.items || [
    { icon: '\u2726', title: 'Feature One', description: 'Description of your first key feature' },
    { icon: '\u269B', title: 'Feature Two', description: 'Description of your second key feature' },
    { icon: '\u26A1', title: 'Feature Three', description: 'Description of your third key feature' },
  ];

  const layout = config.layout || 'grid-3';
  const cols = layout === 'grid-2' ? 2 : layout === 'grid-4' ? 4 : 3;
  const scale = isPreview ? 0.7 : 1;

  const accentColor = template === 'underground-neon' ? '#10B981' : template === 'roblox-playful' ? '#3B82F6' : '#0ea5e9';

  return (
    <div style={{ padding: `${40 * scale}px ${32 * scale}px`, backgroundColor: '#111827' }}>
      {config.title && (
        <h2
          className="text-center font-bold mb-8"
          style={{ fontSize: `${24 * scale}px`, color: '#e2e8f0' }}
        >
          {config.title}
        </h2>
      )}
      <div
        className="mx-auto gap-4"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          maxWidth: 900 * scale,
        }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-xl p-5 text-center transition-transform hover:scale-105"
            style={{
              backgroundColor: '#1f2937',
              border: `1px solid ${accentColor}20`,
            }}
          >
            <div style={{ fontSize: `${32 * scale}px`, marginBottom: 12 * scale }}>
              {item.icon || '\u2726'}
            </div>
            <h3
              className="font-semibold"
              style={{ fontSize: `${16 * scale}px`, color: accentColor }}
            >
              {item.title}
            </h3>
            <p
              className="mt-2"
              style={{ fontSize: `${12 * scale}px`, color: '#9ca3af' }}
            >
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
