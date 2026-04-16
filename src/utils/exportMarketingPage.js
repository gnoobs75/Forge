/**
 * Export a marketing page configuration to a self-contained HTML file.
 * Uses inline CSS and a lightweight canvas particle snippet (no Three.js dependency).
 */

const TEMPLATE_STYLES = {
  'space-epic': {
    bg: '#0a0e27',
    accent: '#0ea5e9',
    secondary: '#f97316',
    gradient: 'linear-gradient(135deg, #0a0e27 0%, #1a1a3e 50%, #0a0e27 100%)',
    font: '"Courier New", monospace',
  },
  'underground-neon': {
    bg: '#0f1a0f',
    accent: '#10B981',
    secondary: '#EC4899',
    gradient: 'linear-gradient(135deg, #0f1a0f 0%, #1a0f1a 50%, #0f1a0f 100%)',
    font: '"Arial Black", sans-serif',
  },
  'roblox-playful': {
    bg: '#1a2744',
    accent: '#3B82F6',
    secondary: '#22C55E',
    gradient: 'linear-gradient(135deg, #1a2744 0%, #2a3758 50%, #1a2744 100%)',
    font: '"Segoe UI", sans-serif',
  },
};

export default function exportMarketingPage(pageConfig) {
  const { sections = [], template = 'space-epic', name = 'Landing Page' } = pageConfig;
  const style = TEMPLATE_STYLES[template] || TEMPLATE_STYLES['space-epic'];

  const sectionsHTML = sections.map(section => renderSection(section, style)).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(name)}</title>
<meta property="og:title" content="${escapeHtml(name)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${style.bg};color:#e2e8f0;font-family:${style.font};overflow-x:hidden}
a{color:${style.accent};text-decoration:none}
.hero{position:relative;min-height:80vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:60px 20px;background:${style.gradient}}
.hero h1{font-size:clamp(2rem,5vw,3.5rem);font-weight:800;text-shadow:0 0 40px ${style.accent}40}
.hero p{font-size:clamp(1rem,2vw,1.25rem);color:#a0aec0;max-width:600px;margin:16px auto 0}
.btn{display:inline-block;padding:14px 40px;font-size:1rem;font-weight:700;color:#fff;background:${style.accent};border-radius:8px;border:none;cursor:pointer;box-shadow:0 0 20px ${style.accent}40;transition:transform 0.2s}
.btn:hover{transform:scale(1.05)}
.features{padding:60px 20px;background:#111827}
.features h2{text-align:center;font-size:1.5rem;margin-bottom:40px}
.feature-grid{display:grid;gap:20px;max-width:900px;margin:0 auto}
.feature-card{background:#1f2937;border:1px solid ${style.accent}20;border-radius:12px;padding:24px;text-align:center;transition:transform 0.2s}
.feature-card:hover{transform:scale(1.03)}
.feature-card .icon{font-size:2rem;margin-bottom:12px}
.feature-card h3{color:${style.accent};font-size:1rem;margin-bottom:8px}
.feature-card p{color:#9ca3af;font-size:0.875rem}
.gallery{padding:60px 20px;background:#0f172a;text-align:center}
.gallery h2{font-size:1.5rem;margin-bottom:24px}
.gallery img{max-width:100%;max-height:400px;border-radius:12px;object-fit:cover}
.stats{display:flex;justify-content:space-around;padding:48px 20px;background:#111827;border-top:1px solid ${style.accent}20;border-bottom:1px solid ${style.accent}20}
.stat{text-align:center}
.stat .num{font-size:2.25rem;font-weight:700;color:${style.accent};font-family:monospace}
.stat .label{font-size:0.75rem;color:#9ca3af;margin-top:4px}
.cta{text-align:center;padding:80px 20px;background:linear-gradient(180deg,#111827 0%,${style.accent}15 100%)}
.cta h2{font-size:1.75rem;margin-bottom:24px}
#particles{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none}
</style>
</head>
<body>
${sectionsHTML}
</body>
</html>`;

  return html;
}

function renderSection(section, style) {
  switch (section.type) {
    case 'hero':
      return `<section class="hero">
  <canvas id="particles"></canvas>
  <div style="position:relative;z-index:1">
    <h1>${escapeHtml(section.headline || 'Your Game')}</h1>
    ${section.subheadline ? `<p>${escapeHtml(section.subheadline)}</p>` : ''}
    ${section.ctaText ? `<div style="margin-top:32px"><a class="btn" href="${escapeHtml(section.ctaUrl || '#')}">${escapeHtml(section.ctaText)}</a></div>` : ''}
  </div>
  <script>
  (function(){var c=document.getElementById('particles');if(!c)return;var ctx=c.getContext('2d');
  c.width=c.parentElement.clientWidth;c.height=c.parentElement.clientHeight;
  var ps=[];for(var i=0;i<80;i++)ps.push({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*2+0.5,dx:(Math.random()-0.5)*0.3,dy:(Math.random()-0.5)*0.3,a:Math.random()*0.5+0.2});
  function draw(){ctx.clearRect(0,0,c.width,c.height);ps.forEach(function(p){ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,'+p.a+')';ctx.fill();p.x+=p.dx;p.y+=p.dy;if(p.x<0||p.x>c.width)p.dx*=-1;if(p.y<0||p.y>c.height)p.dy*=-1});requestAnimationFrame(draw)}
  draw();window.addEventListener('resize',function(){c.width=c.parentElement.clientWidth;c.height=c.parentElement.clientHeight})})();
  </script>
</section>`;

    case 'features': {
      const cols = (section.layout || 'grid-3').replace('grid-', '');
      const items = (section.items || []).map(item =>
        `<div class="feature-card">
          <div class="icon">${escapeHtml(item.icon || '\u2726')}</div>
          <h3>${escapeHtml(item.title || '')}</h3>
          <p>${escapeHtml(item.description || '')}</p>
        </div>`
      ).join('\n');
      return `<section class="features">
  ${section.title ? `<h2>${escapeHtml(section.title)}</h2>` : ''}
  <div class="feature-grid" style="grid-template-columns:repeat(${cols},1fr)">
    ${items || '<div class="feature-card"><div class="icon">\u2726</div><h3>Feature</h3><p>Add features in the builder</p></div>'}
  </div>
</section>`;
    }

    case 'screenshots': {
      const imgs = (section.images || []).map(src =>
        `<img src="${escapeHtml(src)}" alt="Screenshot" loading="lazy">`
      ).join('\n');
      return `<section class="gallery">
  ${section.title ? `<h2>${escapeHtml(section.title)}</h2>` : ''}
  ${imgs || '<div style="padding:60px;color:#64748b;border:2px dashed #334155;border-radius:12px">Screenshots will appear here</div>'}
</section>`;
    }

    case 'stats': {
      const counters = (section.counters || []).map(c =>
        `<div class="stat"><div class="num">${c.value?.toLocaleString() || '0'}</div><div class="label">${escapeHtml(c.label || '')}</div></div>`
      ).join('\n');
      return `<section class="stats">${counters}</section>`;
    }

    case 'cta':
      return `<section class="cta">
  <h2>${escapeHtml(section.headline || 'Ready to Play?')}</h2>
  ${section.subheadline ? `<p style="color:#9ca3af;margin-bottom:24px">${escapeHtml(section.subheadline)}</p>` : ''}
  <a class="btn" href="${escapeHtml(section.ctaUrl || '#')}">${escapeHtml(section.ctaText || 'Get it Now')}</a>
</section>`;

    default:
      return '';
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
