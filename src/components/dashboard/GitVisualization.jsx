import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useStore } from '../../store/useStore';

// Parse git log output into structured data
function parseGitLog(raw) {
  if (!raw) return [];
  const lines = raw.trim().split('\n');
  const commits = [];
  for (const line of lines) {
    const parts = line.split('|||');
    if (parts.length >= 5) {
      commits.push({
        hash: parts[0],
        shortHash: parts[0].slice(0, 7),
        author: parts[1],
        date: parts[2],
        message: parts[3],
        refs: parts[4] ? parts[4].replace(/[()]/g, '').split(', ').filter(Boolean) : [],
      });
    }
  }
  return commits;
}

// Parse git diff stat
function parseDiffStat(raw) {
  if (!raw) return { files: 0, insertions: 0, deletions: 0, fileList: [] };
  const lines = raw.trim().split('\n');
  const fileList = [];
  let files = 0, insertions = 0, deletions = 0;

  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    if (match) {
      fileList.push({ insertions: parseInt(match[1]), deletions: parseInt(match[2]), name: match[3].trim() });
    }
    const summary = line.match(/(\d+) files? changed/);
    if (summary) files = parseInt(summary[1]);
    const ins = line.match(/(\d+) insertions?/);
    if (ins) insertions = parseInt(ins[1]);
    const del = line.match(/(\d+) deletions?/);
    if (del) deletions = parseInt(del[1]);
  }

  return { files, insertions, deletions, fileList };
}

// Parse branches
function parseBranches(raw) {
  if (!raw) return [];
  return raw.trim().split('\n').map(b => {
    const isCurrent = b.startsWith('*');
    const name = b.replace(/^\*?\s+/, '').trim();
    return { name, isCurrent };
  }).filter(b => b.name);
}

// Canvas commit graph renderer
function drawCommitGraph(ctx, commits, width, height, hoverIndex) {
  ctx.clearRect(0, 0, width, height);

  if (commits.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No commits loaded', width / 2, height / 2);
    return;
  }

  const padding = { top: 20, bottom: 20, left: 50, right: 30 };
  const graphW = width - padding.left - padding.right;
  const rowH = Math.min(50, (height - padding.top - padding.bottom) / commits.length);
  const nodeR = 6;

  // Draw connecting line
  ctx.strokeStyle = '#3F465B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < commits.length; i++) {
    const x = padding.left + 20;
    const y = padding.top + i * rowH + rowH / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Draw commits
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    const x = padding.left + 20;
    const y = padding.top + i * rowH + rowH / 2;
    const isHovered = i === hoverIndex;

    // Node glow on hover
    if (isHovered) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 20);
      glow.addColorStop(0, 'rgba(197, 38, 56, 0.3)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 20, y - 20, 40, 40);
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(x, y, isHovered ? nodeR + 2 : nodeR, 0, Math.PI * 2);
    const hasTag = c.refs.length > 0;
    ctx.fillStyle = hasTag ? '#C52638' : isHovered ? '#3B82F6' : '#06B6D4';
    ctx.fill();
    ctx.strokeStyle = '#18181C';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Hash
    ctx.fillStyle = isHovered ? '#e2e8f0' : '#64748b';
    ctx.font = `${isHovered ? 'bold ' : ''}11px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(c.shortHash, x + 18, y - 4);

    // Message
    const msgX = x + 75;
    const maxMsgW = graphW - 180;
    ctx.fillStyle = isHovered ? '#e2e8f0' : '#94a3b8';
    ctx.font = '12px system-ui, sans-serif';
    const msg = c.message.length > 60 ? c.message.slice(0, 57) + '...' : c.message;
    ctx.fillText(msg, msgX, y - 4);

    // Author + date
    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    ctx.fillText(`${c.author} \u2022 ${new Date(c.date).toLocaleDateString()}`, msgX, y + 10);

    // Branch/tag labels
    if (c.refs.length > 0) {
      let tagX = msgX + ctx.measureText(msg).width + 10;
      ctx.font = 'bold 9px monospace';
      for (const ref of c.refs.slice(0, 3)) {
        const isHead = ref.includes('HEAD');
        const isBranch = ref.includes('->') || !ref.startsWith('tag:');
        const label = ref.replace('HEAD -> ', '').replace('tag: ', '');
        const tw = ctx.measureText(label).width + 10;

        // Badge background
        ctx.fillStyle = isHead ? 'rgba(197, 38, 56, 0.2)' : isBranch ? 'rgba(59, 130, 246, 0.2)' : 'rgba(234, 179, 8, 0.2)';
        roundRect(ctx, tagX, y - 10, tw, 16, 4);
        ctx.fill();

        // Badge text
        ctx.fillStyle = isHead ? '#C52638' : isBranch ? '#3B82F6' : '#EAB308';
        ctx.fillText(label, tagX + 5, y + 1);
        tagX += tw + 4;
      }
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// File change heatmap renderer
function drawFileHeatmap(ctx, files, width, height) {
  ctx.clearRect(0, 0, width, height);

  if (files.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No recent file changes', width / 2, height / 2);
    return;
  }

  const padding = 10;
  const maxChanges = Math.max(...files.map(f => f.insertions + f.deletions), 1);
  const cellSize = Math.min(
    (width - padding * 2) / Math.ceil(Math.sqrt(files.length)),
    40
  );
  const cols = Math.floor((width - padding * 2) / cellSize);

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padding + col * cellSize;
    const y = padding + row * cellSize;
    const intensity = (f.insertions + f.deletions) / maxChanges;

    // Color based on ratio of insertions vs deletions
    const totalChanges = f.insertions + f.deletions;
    const addRatio = totalChanges > 0 ? f.insertions / totalChanges : 0.5;
    const r = Math.round(239 * (1 - addRatio) + 34 * addRatio);
    const g = Math.round(68 * (1 - addRatio) + 197 * addRatio);
    const b = Math.round(68 * (1 - addRatio) + 94 * addRatio);

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.3 + intensity * 0.7})`;
    roundRect(ctx, x + 1, y + 1, cellSize - 2, cellSize - 2, 3);
    ctx.fill();

    // File name (truncated)
    if (cellSize > 25) {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      const name = f.name.split('/').pop() || f.name;
      ctx.fillText(name.slice(0, 5), x + cellSize / 2, y + cellSize / 2 + 3);
    }
  }
}

export default function GitVisualization() {
  const projects = useStore((s) => s.projects);
  const [selectedProject, setSelectedProject] = useState(null);
  const [gitData, setGitData] = useState({ commits: [], branches: [], diffStat: null });
  const [loading, setLoading] = useState(false);
  const [hoverIndex, setHoverIndex] = useState(-1);
  const canvasRef = useRef(null);
  const heatmapRef = useRef(null);

  // Auto-select first project with a repo
  useEffect(() => {
    if (!selectedProject && projects.length > 0) {
      const p = projects.find(p => p.repoPath);
      if (p) setSelectedProject(p.slug);
    }
  }, [projects, selectedProject]);

  // Load git data
  const loadGitData = useCallback(async () => {
    const project = projects.find(p => p.slug === selectedProject);
    if (!project?.repoPath) return;

    if (!window.electronAPI?.git) {
      // Dev mode: use sample data
      setGitData({
        commits: [
          { hash: 'abc1234567', shortHash: 'abc1234', author: 'claude', date: new Date().toISOString(), message: 'Implement agent scoreboard with Recharts', refs: ['HEAD -> main'] },
          { hash: 'def2345678', shortHash: 'def2345', author: 'claude', date: new Date(Date.now() - 3600000).toISOString(), message: 'Add per-approach Plan/Auto implementation buttons', refs: [] },
          { hash: 'ghi3456789', shortHash: 'ghi3456', author: 'claude', date: new Date(Date.now() - 7200000).toISOString(), message: 'Fix terminal blank screen on HMR reload', refs: [] },
          { hash: 'jkl4567890', shortHash: 'jkl4567', author: 'you', date: new Date(Date.now() - 10800000).toISOString(), message: 'Add agent alias editing to profile panel', refs: ['tag: v0.2.0'] },
          { hash: 'mno5678901', shortHash: 'mno5678', author: 'claude', date: new Date(Date.now() - 14400000).toISOString(), message: 'Build implementation terminal tabs with auto-resolve', refs: [] },
          { hash: 'pqr6789012', shortHash: 'pqr6789', author: 'claude', date: new Date(Date.now() - 18000000).toISOString(), message: 'Add Gauntlet arcade sounds via Web Audio API', refs: [] },
          { hash: 'stu7890123', shortHash: 'stu7890', author: 'you', date: new Date(Date.now() - 21600000).toISOString(), message: 'Initial Forge scaffold', refs: ['tag: v0.1.0'] },
          { hash: 'vwx8901234', shortHash: 'vwx8901', author: 'claude', date: new Date(Date.now() - 25200000).toISOString(), message: 'Add file watcher with chokidar for live updates', refs: [] },
          { hash: 'yza9012345', shortHash: 'yza9012', author: 'claude', date: new Date(Date.now() - 28800000).toISOString(), message: 'Create 12 agent skill files with protocols', refs: [] },
          { hash: 'bcd0123456', shortHash: 'bcd0123', author: 'you', date: new Date(Date.now() - 32400000).toISOString(), message: 'Seed hq-data with 3 games and context briefs', refs: [] },
        ],
        branches: [
          { name: 'main', isCurrent: true },
          { name: 'feature/automation', isCurrent: false },
          { name: 'feature/git-viz', isCurrent: false },
        ],
        diffStat: {
          files: 12, insertions: 847, deletions: 123,
          fileList: [
            { name: 'src/store/useStore.js', insertions: 120, deletions: 15 },
            { name: 'src/components/Terminal.jsx', insertions: 85, deletions: 22 },
            { name: 'src/components/dashboard/GameDetail.jsx', insertions: 95, deletions: 30 },
            { name: 'electron/main.cjs', insertions: 45, deletions: 5 },
            { name: 'src/utils/sounds.js', insertions: 80, deletions: 0 },
            { name: 'src/components/TerminalTabBar.jsx', insertions: 77, deletions: 0 },
            { name: 'src/components/dashboard/TopRecommendations.jsx', insertions: 65, deletions: 18 },
            { name: 'src/components/dashboard/AgentDetailPanel.jsx', insertions: 90, deletions: 8 },
            { name: 'src/utils/buildImplementPrompt.js', insertions: 35, deletions: 3 },
            { name: 'electron/preload.cjs', insertions: 15, deletions: 2 },
            { name: 'src/utils/formatRelativeTime.js', insertions: 25, deletions: 0 },
            { name: 'src/components/dashboard/RecFileActions.jsx', insertions: 115, deletions: 20 },
          ],
        },
      });
      return;
    }

    setLoading(true);
    try {
      const result = await window.electronAPI.git.getData(project.repoPath);
      setGitData({
        commits: parseGitLog(result.log),
        branches: parseBranches(result.branches),
        diffStat: parseDiffStat(result.diffStat),
      });
    } catch (e) {
      console.warn('Git data load failed:', e);
    }
    setLoading(false);
  }, [selectedProject, projects]);

  useEffect(() => {
    loadGitData();
  }, [loadGitData]);

  // Draw commit graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    drawCommitGraph(ctx, gitData.commits, rect.width, rect.height, hoverIndex);
  }, [gitData.commits, hoverIndex]);

  // Draw file heatmap
  useEffect(() => {
    const canvas = heatmapRef.current;
    if (!canvas || !gitData.diffStat) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    drawFileHeatmap(ctx, gitData.diffStat.fileList, rect.width, rect.height);
  }, [gitData.diffStat]);

  // Handle mouse move on commit graph
  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rowH = Math.min(50, (rect.height - 40) / gitData.commits.length);
    const idx = Math.floor((y - 20) / rowH);
    setHoverIndex(idx >= 0 && idx < gitData.commits.length ? idx : -1);
  }, [gitData.commits.length]);

  const project = projects.find(p => p.slug === selectedProject);

  return (
    <div className="space-y-4">
      {/* Project selector */}
      <div className="flex items-center gap-3">
        <select
          value={selectedProject || ''}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="input-field !w-auto !py-1.5 text-xs"
        >
          {projects.map(p => (
            <option key={p.slug} value={p.slug}>{p.name}</option>
          ))}
        </select>

        {project?.repoPath && (
          <span className="text-xs text-forge-text-muted font-mono truncate">{project.repoPath}</span>
        )}

        <button
          onClick={loadGitData}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-forge-accent-blue/10 text-forge-accent-blue border border-forge-accent-blue/20 hover:bg-forge-accent-blue/20 transition-colors ml-auto"
        >
          {loading ? '\u21BB Refreshing...' : '\u21BB Refresh'}
        </button>
      </div>

      {/* Stats row */}
      {gitData.diffStat && (
        <div className="grid grid-cols-4 gap-3">
          <div className="card !p-3">
            <div className="text-[11px] text-forge-text-muted uppercase">Commits</div>
            <div className="text-xl font-bold font-mono text-forge-accent-blue">{gitData.commits.length}</div>
          </div>
          <div className="card !p-3">
            <div className="text-[11px] text-forge-text-muted uppercase">Branches</div>
            <div className="text-xl font-bold font-mono text-forge-accent">{gitData.branches.length}</div>
          </div>
          <div className="card !p-3">
            <div className="text-[11px] text-forge-text-muted uppercase">Insertions</div>
            <div className="text-xl font-bold font-mono text-green-400">+{gitData.diffStat.insertions}</div>
          </div>
          <div className="card !p-3">
            <div className="text-[11px] text-forge-text-muted uppercase">Deletions</div>
            <div className="text-xl font-bold font-mono text-red-400">-{gitData.diffStat.deletions}</div>
          </div>
        </div>
      )}

      {/* Branch tags */}
      {gitData.branches.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-forge-text-muted">Branches:</span>
          {gitData.branches.map(b => (
            <span
              key={b.name}
              className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                b.isCurrent
                  ? 'bg-forge-accent/20 text-forge-accent border border-forge-accent/30'
                  : 'bg-forge-surface text-forge-text-muted border border-forge-border'
              }`}
            >
              {b.isCurrent && '\u25CF '}{b.name}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Commit graph — 2/3 width */}
        <div className="lg:col-span-2 card">
          <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3 border-l-2 border-forge-accent-blue pl-3">
            Commit History
          </h3>
          <canvas
            ref={canvasRef}
            className="w-full cursor-crosshair"
            style={{ height: `${Math.max(300, gitData.commits.length * 50)}px` }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(-1)}
          />
        </div>

        {/* File heatmap — 1/3 width */}
        <div className="card">
          <h3 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3 border-l-2 border-green-400 pl-3">
            File Change Heatmap
          </h3>
          <canvas
            ref={heatmapRef}
            className="w-full"
            style={{ height: '200px' }}
          />
          {gitData.diffStat && (
            <div className="mt-3 space-y-1">
              {gitData.diffStat.fileList.slice(0, 8).map(f => (
                <div key={f.name} className="flex items-center gap-2 text-[11px]">
                  <span className="text-green-400 font-mono w-8 text-right">+{f.insertions}</span>
                  <span className="text-red-400 font-mono w-8 text-right">-{f.deletions}</span>
                  <span className="text-forge-text-secondary truncate">{f.name}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 mt-3 pt-2 border-t border-forge-border/30">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-green-400/60" />
              <span className="text-[10px] text-forge-text-muted">Added</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-red-400/60" />
              <span className="text-[10px] text-forge-text-muted">Removed</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-yellow-400/60" />
              <span className="text-[10px] text-forge-text-muted">Mixed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
