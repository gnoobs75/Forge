import React, { useState } from 'react';

export default function ScreenshotGallery({ config, template, isPreview }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const images = config.images || [];
  const scale = isPreview ? 0.7 : 1;

  if (images.length === 0) {
    return (
      <div style={{ padding: `${40 * scale}px`, backgroundColor: '#0f172a', textAlign: 'center' }}>
        {config.title && (
          <h2 className="font-bold mb-6" style={{ fontSize: `${24 * scale}px`, color: '#e2e8f0' }}>
            {config.title || 'Screenshots'}
          </h2>
        )}
        <div
          className="mx-auto rounded-xl flex items-center justify-center"
          style={{
            width: '100%',
            maxWidth: 700 * scale,
            height: 300 * scale,
            backgroundColor: '#1e293b',
            border: '2px dashed #334155',
          }}
        >
          <div>
            <div style={{ fontSize: `${32 * scale}px`, opacity: 0.3, marginBottom: 8 }}>&#x1F4F7;</div>
            <p style={{ fontSize: `${12 * scale}px`, color: '#64748b' }}>Add screenshot paths to display</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: `${40 * scale}px`, backgroundColor: '#0f172a', textAlign: 'center' }}>
      {config.title && (
        <h2 className="font-bold mb-6" style={{ fontSize: `${24 * scale}px`, color: '#e2e8f0' }}>
          {config.title || 'Screenshots'}
        </h2>
      )}

      {/* Main image */}
      <div
        className="mx-auto rounded-xl overflow-hidden"
        style={{
          maxWidth: 700 * scale,
          height: 350 * scale,
          backgroundColor: '#1e293b',
        }}
      >
        <img
          src={images[activeIndex]}
          alt={`Screenshot ${activeIndex + 1}`}
          className="w-full h-full object-cover"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className="rounded-lg overflow-hidden transition-all"
              style={{
                width: 60 * scale,
                height: 40 * scale,
                border: `2px solid ${i === activeIndex ? '#0ea5e9' : '#334155'}`,
                opacity: i === activeIndex ? 1 : 0.5,
              }}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
