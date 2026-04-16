/**
 * Report Generator — creates HTML email reports with inline SVG charts.
 * Used by the automation system for daily/weekly Studio Producer reports.
 */
const fs = require('fs');
const path = require('path');
const PATHS = require('../config/paths.cjs');

const HQ_ROOT = PATHS.hqData;

/**
 * Generate a daily activity report HTML
 */
function generateDailyReport() {
  const now = new Date();
  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Load activity log
  let activities = [];
  try {
    const raw = fs.readFileSync(path.join(HQ_ROOT, 'activity-log.json'), 'utf-8');
    activities = JSON.parse(raw).filter(a => new Date(a.timestamp) >= yesterday);
  } catch {}

  // Load automation execution log
  let executions = [];
  try {
    const raw = fs.readFileSync(path.join(HQ_ROOT, 'automation', 'execution-log.json'), 'utf-8');
    executions = JSON.parse(raw).filter(e => new Date(e.timestamp) >= yesterday);
  } catch {}

  // Load projects + progress
  const projects = loadProjects();

  // Count activities by agent
  const agentCounts = {};
  for (const a of activities) {
    agentCounts[a.agent] = (agentCounts[a.agent] || 0) + 1;
  }

  // Count by project
  const projectCounts = {};
  for (const a of activities) {
    const pName = a.project || 'Studio';
    projectCounts[pName] = (projectCounts[pName] || 0) + 1;
  }

  const agentBarChart = generateBarChartSVG(agentCounts, 'Agent Activity', 400, 180);
  const projectPieChart = generatePieChartSVG(projectCounts, 'By Project', 200, 200);

  // Progress bars for each project
  const progressBars = projects.map(p => {
    const color = p.progress >= 80 ? '#22C55E' : p.progress >= 50 ? '#EAB308' : '#EF4444';
    return `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="color: #e2e8f0; font-size: 14px; font-weight: 600;">${p.name}</span>
          <span style="color: ${color}; font-family: monospace; font-weight: bold;">${p.progress}%</span>
        </div>
        <div style="background: #2a3a5c; border-radius: 4px; height: 8px; overflow: hidden;">
          <div style="background: ${color}; width: ${p.progress}%; height: 100%; border-radius: 4px;"></div>
        </div>
      </div>`;
  }).join('');

  // Recent activities list
  const activityList = activities.slice(0, 15).map(a => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #2a3a5c; color: ${a.agentColor || '#ccc'}; font-size: 13px; font-weight: 600;">${a.agent}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #2a3a5c; color: #94a3b8; font-size: 13px;">${a.action}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #2a3a5c; color: #64748b; font-size: 12px; white-space: nowrap;">${a.project || ''}</td>
    </tr>`).join('');

  return {
    subject: `Daily Studio Report — ${dateStr}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background: #0f0f23; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 640px; margin: 0 auto; padding: 24px;">
    <!-- Header -->
    <div style="text-align: center; padding: 24px 0; border-bottom: 2px solid #e94560;">
      <h1 style="color: #e94560; font-size: 24px; margin: 0;">Forge</h1>
      <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">Daily Studio Report — ${dateStr}</p>
    </div>

    <!-- Summary Stats -->
    <div style="display: flex; gap: 12px; margin: 24px 0;">
      ${statBox('Activities', activities.length, '#3B82F6')}
      ${statBox('Automations', executions.length, '#F97316')}
      ${statBox('Agents Active', Object.keys(agentCounts).length, '#22C55E')}
    </div>

    <!-- Project Progress -->
    <div style="background: #1a1a2e; border: 1px solid #2a3a5c; border-radius: 12px; padding: 20px; margin: 16px 0;">
      <h2 style="color: #e2e8f0; font-size: 16px; margin: 0 0 16px; font-family: monospace;">PROJECT PROGRESS</h2>
      ${progressBars}
    </div>

    <!-- Charts Row -->
    <div style="display: flex; gap: 16px; margin: 16px 0;">
      <div style="flex: 1; background: #1a1a2e; border: 1px solid #2a3a5c; border-radius: 12px; padding: 16px; text-align: center;">
        ${agentBarChart}
      </div>
      <div style="flex-shrink: 0; background: #1a1a2e; border: 1px solid #2a3a5c; border-radius: 12px; padding: 16px; text-align: center;">
        ${projectPieChart}
      </div>
    </div>

    <!-- Activity Feed -->
    ${activities.length > 0 ? `
    <div style="background: #1a1a2e; border: 1px solid #2a3a5c; border-radius: 12px; padding: 20px; margin: 16px 0;">
      <h2 style="color: #e2e8f0; font-size: 16px; margin: 0 0 12px; font-family: monospace;">RECENT ACTIVITY</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #2a3a5c;">Agent</th>
            <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #2a3a5c;">Action</th>
            <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #2a3a5c;">Project</th>
          </tr>
        </thead>
        <tbody>${activityList}</tbody>
      </table>
    </div>` : '<div style="background: #1a1a2e; border: 1px solid #2a3a5c; border-radius: 12px; padding: 32px; margin: 16px 0; text-align: center;"><p style="color: #64748b; margin: 0;">No agent activity in the last 24 hours</p></div>'}

    <!-- Footer -->
    <div style="text-align: center; padding: 24px 0; color: #475569; font-size: 12px;">
      Generated by Forge — BrownTown Studios
    </div>
  </div>
</body>
</html>`,
  };
}

/**
 * Generate a weekly high-level report HTML
 */
function generateWeeklyReport() {
  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const dateRange = `${weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  // Load all data
  let activities = [];
  try {
    const raw = fs.readFileSync(path.join(HQ_ROOT, 'activity-log.json'), 'utf-8');
    activities = JSON.parse(raw).filter(a => new Date(a.timestamp) >= weekAgo);
  } catch {}

  let executions = [];
  try {
    const raw = fs.readFileSync(path.join(HQ_ROOT, 'automation', 'execution-log.json'), 'utf-8');
    executions = JSON.parse(raw).filter(e => new Date(e.timestamp) >= weekAgo);
  } catch {}

  const projects = loadProjects();

  // Daily activity trend (last 7 days)
  const dailyCounts = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = d.toLocaleDateString('en-US', { weekday: 'short' });
    dailyCounts[key] = 0;
  }
  for (const a of activities) {
    const d = new Date(a.timestamp);
    const key = d.toLocaleDateString('en-US', { weekday: 'short' });
    if (key in dailyCounts) dailyCounts[key]++;
  }

  // Agent stats
  const agentStats = {};
  for (const a of activities) {
    if (!agentStats[a.agent]) agentStats[a.agent] = { count: 0, color: a.agentColor || '#666' };
    agentStats[a.agent].count++;
  }

  // Resolved recs this week
  let resolvedRecs = [];
  for (const p of projects) {
    try {
      const recsDir = path.join(HQ_ROOT, 'projects', p.slug, 'recommendations');
      if (fs.existsSync(recsDir)) {
        const files = fs.readdirSync(recsDir);
        for (const f of files) {
          if (!f.endsWith('.json')) continue;
          try {
            const rec = JSON.parse(fs.readFileSync(path.join(recsDir, f), 'utf-8'));
            if (rec.resolvedAt && new Date(rec.resolvedAt) >= weekAgo) {
              resolvedRecs.push({ ...rec, projectName: p.name });
            }
          } catch {}
        }
      }
    } catch {}
  }

  const trendChart = generateLineChartSVG(dailyCounts, 'Daily Activity Trend', 560, 160);
  const agentRadar = generateBarChartSVG(
    Object.fromEntries(Object.entries(agentStats).map(([k, v]) => [k.split(' ')[0], v.count])),
    'Agent Contributions', 560, 180
  );

  const projectCards = projects.map(p => {
    const color = p.progress >= 80 ? '#22C55E' : p.progress >= 50 ? '#EAB308' : '#EF4444';
    const blockerCount = p.blockers?.length || 0;
    return `
      <div style="background: #1e1e3a; border: 1px solid #2a3a5c; border-radius: 12px; padding: 16px; flex: 1; min-width: 180px;">
        <h3 style="color: #e2e8f0; font-size: 14px; margin: 0 0 8px;">${p.name}</h3>
        <div style="font-family: monospace; font-size: 28px; font-weight: bold; color: ${color}; margin: 8px 0;">${p.progress}%</div>
        <div style="background: #2a3a5c; border-radius: 4px; height: 6px; overflow: hidden; margin: 8px 0;">
          <div style="background: ${color}; width: ${p.progress}%; height: 100%; border-radius: 4px;"></div>
        </div>
        <div style="color: #64748b; font-size: 12px;">${p.phase} phase</div>
        ${blockerCount > 0 ? `<div style="color: #EF4444; font-size: 12px; margin-top: 4px;">${blockerCount} blocker${blockerCount > 1 ? 's' : ''}</div>` : ''}
      </div>`;
  }).join('');

  const resolvedList = resolvedRecs.slice(0, 10).map(r => `
    <tr>
      <td style="padding: 6px 12px; border-bottom: 1px solid #2a3a5c; color: ${r.agentColor || '#ccc'}; font-size: 13px;">${r.agent}</td>
      <td style="padding: 6px 12px; border-bottom: 1px solid #2a3a5c; color: #e2e8f0; font-size: 13px;">${r.title}</td>
      <td style="padding: 6px 12px; border-bottom: 1px solid #2a3a5c; color: #64748b; font-size: 12px;">${r.projectName}</td>
      <td style="padding: 6px 12px; border-bottom: 1px solid #2a3a5c; color: ${r.resolvedBy === 'auto-implement' ? '#22C55E' : '#94a3b8'}; font-size: 12px;">${r.resolvedBy === 'auto-implement' ? 'Auto' : 'Manual'}</td>
    </tr>`).join('');

  return {
    subject: `Weekly Studio Report — ${dateRange}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background: #0f0f23; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 640px; margin: 0 auto; padding: 24px;">
    <!-- Header -->
    <div style="text-align: center; padding: 24px 0; border-bottom: 2px solid #e94560;">
      <h1 style="color: #e94560; font-size: 24px; margin: 0;">Forge</h1>
      <p style="color: #94a3b8; font-size: 15px; margin: 8px 0 0; font-weight: 600;">Weekly Studio Report</p>
      <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">${dateRange}</p>
    </div>

    <!-- Weekly Summary Stats -->
    <div style="display: flex; gap: 12px; margin: 24px 0;">
      ${statBox('Total Activities', activities.length, '#3B82F6')}
      ${statBox('Recs Resolved', resolvedRecs.length, '#22C55E')}
      ${statBox('Automations', executions.length, '#F97316')}
      ${statBox('Active Agents', Object.keys(agentStats).length, '#8B5CF6')}
    </div>

    <!-- Project Cards -->
    <div style="display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap;">
      ${projectCards}
    </div>

    <!-- Activity Trend -->
    <div style="background: #1a1a2e; border: 1px solid #2a3a5c; border-radius: 12px; padding: 20px; margin: 16px 0; text-align: center;">
      ${trendChart}
    </div>

    <!-- Agent Contributions -->
    <div style="background: #1a1a2e; border: 1px solid #2a3a5c; border-radius: 12px; padding: 20px; margin: 16px 0; text-align: center;">
      ${agentRadar}
    </div>

    <!-- Resolved Recommendations -->
    ${resolvedRecs.length > 0 ? `
    <div style="background: #1a1a2e; border: 1px solid #2a3a5c; border-radius: 12px; padding: 20px; margin: 16px 0;">
      <h2 style="color: #22C55E; font-size: 16px; margin: 0 0 12px; font-family: monospace;">RESOLVED THIS WEEK (${resolvedRecs.length})</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="padding: 6px 12px; text-align: left; color: #64748b; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #2a3a5c;">Agent</th>
            <th style="padding: 6px 12px; text-align: left; color: #64748b; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #2a3a5c;">Recommendation</th>
            <th style="padding: 6px 12px; text-align: left; color: #64748b; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #2a3a5c;">Project</th>
            <th style="padding: 6px 12px; text-align: left; color: #64748b; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #2a3a5c;">How</th>
          </tr>
        </thead>
        <tbody>${resolvedList}</tbody>
      </table>
    </div>` : ''}

    <!-- Footer -->
    <div style="text-align: center; padding: 24px 0; color: #475569; font-size: 12px;">
      Generated by Forge — BrownTown Studios
    </div>
  </div>
</body>
</html>`,
  };
}

// ─── Helpers ───

function loadProjects() {
  const projects = [];
  const projectsDir = path.join(HQ_ROOT, 'projects');
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const projPath = path.join(projectsDir, entry.name, 'project.json');
        const proj = JSON.parse(fs.readFileSync(projPath, 'utf-8'));
        // Load progress
        try {
          const progPath = path.join(projectsDir, entry.name, 'progress.json');
          const prog = JSON.parse(fs.readFileSync(progPath, 'utf-8'));
          if (prog.overall != null) proj.progress = prog.overall;
          proj.blockers = prog.blockers || [];
          proj.phase = proj.phase || 'production';
        } catch {}
        projects.push(proj);
      } catch {}
    }
  } catch {}
  return projects;
}

function statBox(label, value, color) {
  return `
    <div style="flex: 1; background: #1a1a2e; border: 1px solid #2a3a5c; border-radius: 12px; padding: 16px; text-align: center;">
      <div style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">${label}</div>
      <div style="color: ${color}; font-size: 28px; font-family: monospace; font-weight: bold; margin-top: 4px;">${value}</div>
    </div>`;
}

function generateBarChartSVG(data, title, width, height) {
  const entries = Object.entries(data);
  if (entries.length === 0) return `<p style="color: #64748b; font-size: 13px;">${title}: No data</p>`;

  const maxVal = Math.max(...entries.map(([, v]) => v), 1);
  const barWidth = Math.min(40, (width - 60) / entries.length - 8);
  const chartHeight = height - 50;
  const colors = ['#3B82F6', '#22C55E', '#F97316', '#8B5CF6', '#EC4899', '#06B6D4', '#EAB308', '#EF4444', '#10B981', '#F59E0B', '#FF6B6B', '#0EA5E9', '#7C3AED'];

  let bars = '';
  entries.forEach(([label, value], i) => {
    const barH = (value / maxVal) * (chartHeight - 20);
    const x = 40 + i * (barWidth + 8);
    const y = chartHeight - barH;
    const color = colors[i % colors.length];
    bars += `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="3" fill="${color}" opacity="0.85"/>
      <text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle" fill="${color}" font-size="11" font-family="monospace" font-weight="bold">${value}</text>
      <text x="${x + barWidth / 2}" y="${chartHeight + 14}" text-anchor="middle" fill="#64748b" font-size="10" font-family="sans-serif">${label.slice(0, 8)}</text>`;
  });

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${width / 2}" y="16" text-anchor="middle" fill="#94a3b8" font-size="13" font-family="monospace" font-weight="bold">${title}</text>
      <line x1="35" y1="24" x2="35" y2="${chartHeight}" stroke="#2a3a5c" stroke-width="1"/>
      <line x1="35" y1="${chartHeight}" x2="${width - 10}" y2="${chartHeight}" stroke="#2a3a5c" stroke-width="1"/>
      ${bars}
    </svg>`;
}

function generatePieChartSVG(data, title, width, height) {
  const entries = Object.entries(data);
  if (entries.length === 0) return `<p style="color: #64748b; font-size: 13px;">${title}: No data</p>`;

  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const cx = width / 2, cy = height / 2 + 10, r = Math.min(width, height) / 2 - 30;
  const colors = ['#3B82F6', '#22C55E', '#F97316', '#8B5CF6', '#EC4899', '#06B6D4'];

  let slices = '';
  let startAngle = -Math.PI / 2;

  entries.forEach(([label, value], i) => {
    const angle = (value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const color = colors[i % colors.length];

    slices += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}" opacity="0.85"/>`;
    startAngle = endAngle;
  });

  // Legend
  let legend = '';
  entries.forEach(([label, value], i) => {
    const pct = Math.round((value / total) * 100);
    legend += `<text x="${width / 2}" y="${height - 4 - (entries.length - 1 - i) * 14}" text-anchor="middle" fill="${colors[i % colors.length]}" font-size="10" font-family="sans-serif">${label} (${pct}%)</text>`;
  });

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${width / 2}" y="14" text-anchor="middle" fill="#94a3b8" font-size="12" font-family="monospace" font-weight="bold">${title}</text>
      ${slices}
    </svg>`;
}

function generateLineChartSVG(data, title, width, height) {
  const entries = Object.entries(data);
  if (entries.length === 0) return '';

  const maxVal = Math.max(...entries.map(([, v]) => v), 1);
  const chartW = width - 60;
  const chartH = height - 50;
  const stepX = chartW / (entries.length - 1 || 1);

  let points = '';
  let areaPoints = '';
  let labels = '';
  let dots = '';

  entries.forEach(([label, value], i) => {
    const x = 40 + i * stepX;
    const y = 30 + chartH - (value / maxVal) * chartH;
    points += `${x},${y} `;
    areaPoints += `${x},${y} `;
    labels += `<text x="${x}" y="${height - 8}" text-anchor="middle" fill="#64748b" font-size="11" font-family="sans-serif">${label}</text>`;
    dots += `<circle cx="${x}" cy="${y}" r="4" fill="#3B82F6"/>`;
    dots += `<text x="${x}" y="${y - 8}" text-anchor="middle" fill="#3B82F6" font-size="10" font-family="monospace" font-weight="bold">${value}</text>`;
  });

  // Area fill
  const firstX = 40;
  const lastX = 40 + (entries.length - 1) * stepX;
  const bottomY = 30 + chartH;
  const area = `M${firstX},${bottomY} L${areaPoints.trim()} L${lastX},${bottomY} Z`;

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${width / 2}" y="18" text-anchor="middle" fill="#94a3b8" font-size="13" font-family="monospace" font-weight="bold">${title}</text>
      <line x1="35" y1="28" x2="35" y2="${30 + chartH}" stroke="#2a3a5c" stroke-width="1"/>
      <line x1="35" y1="${30 + chartH}" x2="${width - 10}" y2="${30 + chartH}" stroke="#2a3a5c" stroke-width="1"/>
      <path d="${area}" fill="#3B82F6" opacity="0.1"/>
      <polyline points="${points.trim()}" fill="none" stroke="#3B82F6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${labels}
    </svg>`;
}

module.exports = { generateDailyReport, generateWeeklyReport };
