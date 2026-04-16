import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import * as THREE from 'three';

// ─── Constants ───

const EXT_COLORS = {
  js: 0xF7DF1E, jsx: 0x61DAFB, ts: 0x3178C6, tsx: 0x61DAFB,
  css: 0x264DE4, html: 0xE34C26, json: 0x6B7280, md: 0x083FA1,
  lua: 0x000080, luau: 0x00A2FF, cs: 0x68217A, shader: 0xFF6B6B,
  glsl: 0xFF6B6B, py: 0x3776AB, rb: 0xCC342D, go: 0x00ADD8,
  rs: 0xDEA584, c: 0xA8B9CC, cpp: 0x00599C, h: 0xA8B9CC,
  java: 0xB07219, kt: 0xA97BFF, swift: 0xF05138, toml: 0x9C4221,
  yaml: 0xCB171E, yml: 0xCB171E, xml: 0xF16529, sql: 0xE38C00,
  sh: 0x89E051, bat: 0xC1F12E, ps1: 0x012456,
  dir: 0x3B82F6, default: 0x64748B,
};

const EDGE_COLORS = {
  imports: 0x3B82F6,
  calls: 0x22C55E,
  inherits: 0x8B5CF6,
  defined_in: 0x1E293B,
  sibling: 0x334155,
};

// ─── Force-Directed Layout (Verlet) ───

function forceLayout(nodes, edges, iterations = 250) {
  const N = nodes.length;
  if (N === 0) return new Map();

  const positions = new Map();
  const velocities = new Map();
  const spread = Math.max(Math.sqrt(N) * 12, 40);

  for (const node of nodes) {
    positions.set(node.id, {
      x: (Math.random() - 0.5) * spread,
      y: (Math.random() - 0.5) * spread * 0.6,
      z: (Math.random() - 0.5) * spread,
    });
    velocities.set(node.id, { x: 0, y: 0, z: 0 });
  }

  // Dir nodes get separate Y layer
  for (const node of nodes) {
    if (node.isDir) {
      const p = positions.get(node.id);
      p.y = -spread * 0.25 + Math.random() * 4;
    }
  }

  const REPULSION = N > 200 ? 800 : 1200;
  const SPRING_K = 0.015;
  const SPRING_REST = N > 200 ? 12 : 16;
  const GRAVITY = 0.01;
  const DAMPING = 0.9;

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations;
    const nodeIds = Array.from(positions.keys());

    // Coulomb repulsion — O(n^2) for small graphs, skip distant pairs for large
    for (let i = 0; i < nodeIds.length; i++) {
      const pA = positions.get(nodeIds[i]);
      const vA = velocities.get(nodeIds[i]);
      for (let j = i + 1; j < nodeIds.length; j++) {
        const pB = positions.get(nodeIds[j]);
        const vB = velocities.get(nodeIds[j]);
        const dx = pA.x - pB.x, dy = pA.y - pB.y, dz = pA.z - pB.z;
        const d2 = dx * dx + dy * dy + dz * dz + 1;
        if (d2 > 10000 && N > 100) continue; // Skip very distant pairs in large graphs
        const f = (REPULSION * temp) / d2;
        const dist = Math.sqrt(d2);
        const fx = (dx / dist) * f, fy = (dy / dist) * f, fz = (dz / dist) * f;
        vA.x += fx; vA.y += fy; vA.z += fz;
        vB.x -= fx; vB.y -= fy; vB.z -= fz;
      }
      vA.x -= pA.x * GRAVITY;
      vA.y -= pA.y * GRAVITY;
      vA.z -= pA.z * GRAVITY;
    }

    // Hooke springs
    for (const e of edges) {
      const pA = positions.get(e.source), pB = positions.get(e.target);
      if (!pA || !pB) continue;
      const vA = velocities.get(e.source), vB = velocities.get(e.target);
      const dx = pB.x - pA.x, dy = pB.y - pA.y, dz = pB.z - pA.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
      const f = SPRING_K * (dist - SPRING_REST);
      const fx = (dx / dist) * f, fy = (dy / dist) * f, fz = (dz / dist) * f;
      vA.x += fx; vA.y += fy; vA.z += fz;
      vB.x -= fx; vB.y -= fy; vB.z -= fz;
    }

    for (const id of nodeIds) {
      const p = positions.get(id), v = velocities.get(id);
      v.x *= DAMPING; v.y *= DAMPING; v.z *= DAMPING;
      p.x += v.x; p.y += v.y; p.z += v.z;
    }
  }

  return positions;
}

// ─── Build Graph from Repo Scan ───

function buildGraphFromScan(scanResult) {
  const { files, blameData, repoName } = scanResult;
  const nodes = [];
  const edges = [];
  const dirMap = new Map(); // dir → [file nodes]

  const CODE_EXT = new Set(['js','jsx','ts','tsx','css','html','json','md','lua','luau','cs','py','rb','go','rs','c','cpp','h','hpp','java','kt','swift','sh','bat','ps1','toml','yaml','yml','xml','sql','glsl','shader','vue','svelte','astro','php','pl','r','m','mm','scala','clj','hs','ex','exs','erl','dart','zig','nim','v','mjs','cjs']);

  for (const f of files) {
    if (!CODE_EXT.has(f.ext) && f.ext !== '') continue;
    if (f.loc < 1) continue;

    const dir = f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/')) : '.';
    const name = f.path.split('/').pop();
    const lastModified = blameData?.[f.path] || null;

    nodes.push({
      id: `f:${f.path}`,
      type: 'module',
      name,
      file: f.path,
      loc: f.loc,
      ext: f.ext,
      dir,
      lastModified,
    });

    if (!dirMap.has(dir)) dirMap.set(dir, []);
    dirMap.get(dir).push(`f:${f.path}`);
  }

  // Directory nodes — only create for dirs with >1 file
  for (const [dir, fileIds] of dirMap) {
    const dirName = dir === '.' ? repoName : dir.split('/').pop();
    nodes.push({
      id: `d:${dir}`,
      type: 'class',
      name: dirName,
      file: dir,
      loc: 0,
      ext: 'dir',
      isDir: true,
      childCount: fileIds.length,
    });

    // Containment edges
    for (const fid of fileIds) {
      edges.push({ source: fid, target: `d:${dir}`, type: 'defined_in' });
    }
  }

  // Parent dir → child dir edges
  const dirNames = Array.from(dirMap.keys());
  for (const dir of dirNames) {
    const parent = dir.includes('/') ? dir.substring(0, dir.lastIndexOf('/')) : null;
    if (parent && dirMap.has(parent)) {
      edges.push({ source: `d:${dir}`, target: `d:${parent}`, type: 'defined_in' });
    }
  }

  // Heuristic import edges: entry files → siblings, shared-name refs across dirs
  const nameIndex = new Map(); // baseName → [nodeId]
  for (const n of nodes) {
    if (n.isDir) continue;
    const base = n.name.replace(/\.[^.]+$/, '').toLowerCase();
    if (!nameIndex.has(base)) nameIndex.set(base, []);
    nameIndex.get(base).push(n.id);
  }

  for (const [dir, fileIds] of dirMap) {
    for (const fid of fileIds) {
      const n = nodes.find(x => x.id === fid);
      if (!n) continue;
      const base = n.name.replace(/\.[^.]+$/, '').toLowerCase();

      // Index/main files import their siblings
      if (['index', 'main', 'app', 'init', 'mod', 'lib', 'utils', 'helpers'].includes(base)) {
        for (const sibId of fileIds) {
          if (sibId !== fid) edges.push({ source: fid, target: sibId, type: 'imports' });
        }
      }
    }
  }

  // Cross-directory imports: same base name likely references
  for (const [base, ids] of nameIndex) {
    if (ids.length > 1 && ids.length < 5) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          edges.push({ source: ids[i], target: ids[j], type: 'imports' });
        }
      }
    }
  }

  // LOC-based complexity
  const fileLocs = nodes.filter(n => !n.isDir).map(n => n.loc);
  const maxLoc = Math.max(...fileLocs, 1);
  for (const n of nodes) {
    if (!n.isDir) n.complexity = Math.max(1, Math.round((n.loc / maxLoc) * 25));
  }

  return {
    meta: {
      project: repoName,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      indexedAt: new Date().toISOString(),
      source: 'repo-scan',
    },
    nodes,
    edges,
    analysis: {
      deadCode: [],
      complexityHotspots: nodes.filter(n => n.complexity > 12).map(n => ({ id: n.id, complexity: n.complexity })).sort((a, b) => b.complexity - a.complexity).slice(0, 20),
      avgComplexity: fileLocs.length ? Math.round(fileLocs.reduce((a, b) => a + b, 0) / fileLocs.length / maxLoc * 25 * 10) / 10 : 0,
      maxComplexity: 25,
    },
  };
}

// ─── Three.js Scene ───

function buildScene(container, graphData, positions, layers, showComplexity, showDeadCode) {
  const W = container.clientWidth, H = container.clientHeight;
  const { nodes, edges, analysis } = graphData;
  const maxLoc = Math.max(...nodes.map(n => n.loc || 1), 1);
  const deadSet = new Set(analysis?.deadCode || []);
  const maxCx = analysis?.maxComplexity || 25;

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060612);
  scene.fog = new THREE.FogExp2(0x060612, 0.003);

  // Camera
  const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 2000);

  // Lights — dramatic
  scene.add(new THREE.AmbientLight(0x1a1a3e, 0.8));
  const keyLight = new THREE.PointLight(0xe94560, 2.5, 300);
  keyLight.position.set(40, 60, 40);
  scene.add(keyLight);
  const fillLight = new THREE.PointLight(0x3B82F6, 2, 300);
  fillLight.position.set(-40, 30, -40);
  scene.add(fillLight);
  const rimLight = new THREE.PointLight(0x22C55E, 1.2, 200);
  rimLight.position.set(0, -20, 50);
  scene.add(rimLight);

  // Subtle grid floor
  const gridHelper = new THREE.GridHelper(200, 40, 0x111133, 0x0a0a22);
  gridHelper.position.y = -30;
  scene.add(gridHelper);

  // ─── Nodes ───
  const nodeMeshes = [];
  const nodeMap = new Map();
  const glowSprites = [];

  for (const node of nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;

    const locRatio = (node.loc || 1) / maxLoc;
    const baseSize = node.isDir ? 1.2 + (node.childCount || 1) * 0.1 : 0.5 + locRatio * 2.0;
    const size = Math.min(baseSize, 3.5);

    let color = EXT_COLORS[node.ext] || EXT_COLORS.default;
    if (showComplexity && node.complexity) {
      const t = Math.min(node.complexity / maxCx, 1);
      const c = new THREE.Color();
      c.setHSL((1 - t) * 0.33, 0.9, 0.45 + t * 0.15);
      color = c.getHex();
    }

    const isDead = deadSet.has(node.id);

    // Geometry
    let geo;
    if (node.isDir) {
      geo = new THREE.IcosahedronGeometry(size * 0.5, 1);
    } else if (node.type === 'class') {
      geo = new THREE.BoxGeometry(size * 0.55, size * 0.55, size * 0.55);
    } else if (node.type === 'function') {
      geo = new THREE.SphereGeometry(size * 0.35, 16, 16);
    } else {
      geo = new THREE.OctahedronGeometry(size * 0.4);
    }

    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: isDead && showDeadCode ? 0.05 : 0.6,
      metalness: 0.3,
      roughness: 0.4,
      transparent: isDead && showDeadCode,
      opacity: isDead && showDeadCode ? 0.15 : 1,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.userData = { node, basePos: { ...pos }, baseSize: size };
    scene.add(mesh);
    nodeMeshes.push(mesh);
    nodeMap.set(node.id, mesh);

    // Glow sprite (additive blending)
    const glowSize = size * (node.isDir ? 5 : 3.5);
    const spriteMat = new THREE.SpriteMaterial({
      color,
      transparent: true,
      opacity: isDead ? 0.02 : (node.isDir ? 0.08 : 0.12),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(glowSize, glowSize, 1);
    sprite.position.copy(mesh.position);
    sprite.userData = { parentMesh: mesh };
    scene.add(sprite);
    glowSprites.push(sprite);
  }

  // ─── Edges ───
  const edgeLines = [];
  const flowParticles = [];

  for (const edge of edges) {
    const layerType = edge.type;
    if (layerType !== 'defined_in' && !layers[layerType]) continue;
    if (layerType === 'defined_in' && !layers.defined_in) continue;

    const meshA = nodeMap.get(edge.source);
    const meshB = nodeMap.get(edge.target);
    if (!meshA || !meshB) continue;

    const color = EDGE_COLORS[layerType] || 0x334155;
    const isContain = layerType === 'defined_in';
    const opacity = isContain ? 0.06 : 0.25;

    // Curved edge via quadratic bezier
    const start = meshA.position.clone();
    const end = meshB.position.clone();
    const mid = start.clone().add(end).multiplyScalar(0.5);
    mid.y += (isContain ? 2 : 5) + Math.random() * 3;

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const points = curve.getPoints(isContain ? 10 : 20);
    const geo = new THREE.BufferGeometry().setFromPoints(points);

    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity, linewidth: 1,
    });

    const line = new THREE.Line(geo, mat);
    line.userData = { edge, curve };
    scene.add(line);
    edgeLines.push(line);

    // Flow particles on non-containment edges
    if (!isContain && Math.random() < 0.6) {
      const particleGeo = new THREE.SphereGeometry(0.12, 6, 6);
      const particleMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.7,
      });
      const particle = new THREE.Mesh(particleGeo, particleMat);
      particle.userData = { curve, speed: 0.2 + Math.random() * 0.3, t: Math.random() };
      scene.add(particle);
      flowParticles.push(particle);
    }
  }

  // ─── Atmospheric particles ───
  const dustCount = 1500;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 200;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 120;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 200;
    const c = new THREE.Color().setHSL(0.6 + Math.random() * 0.2, 0.5, 0.3 + Math.random() * 0.2);
    dustColors[i * 3] = c.r; dustColors[i * 3 + 1] = c.g; dustColors[i * 3 + 2] = c.b;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.15, transparent: true, opacity: 0.4, vertexColors: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(dust);

  return { scene, camera, renderer, nodeMeshes, nodeMap, edgeLines, glowSprites, flowParticles, dust };
}

// ─── Main Component ───

export default function CodeViz() {
  const projects = useStore(s => s.projects);
  const [selectedProject, setSelectedProject] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState(null); // 'scan' | 'cgc' | 'sample'
  const [luaWarning, setLuaWarning] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [layers, setLayers] = useState({ imports: true, calls: true, inherits: true, defined_in: true });
  const [showComplexity, setShowComplexity] = useState(false);

  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const animRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const rotRef = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastM = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);

  // Auto-select first project
  useEffect(() => {
    if (!selectedProject && projects.length > 0) setSelectedProject(projects[0].slug);
  }, [projects, selectedProject]);

  // Load graph when project changes
  useEffect(() => {
    if (!selectedProject) return;
    loadGraph();
  }, [selectedProject]);

  async function loadGraph() {
    const project = projects.find(p => p.slug === selectedProject);
    if (!project) return;

    setLoading(true);
    setLuaWarning(project.slug === 'ttr-roblox' || project.name?.includes('Roblox'));

    // 1. Try CGC cached graph
    try {
      const codeviz = window.electronAPI?.codeviz;
      if (codeviz) {
        const cached = await codeviz.loadCachedGraph(selectedProject);
        if (cached?.ok && cached.data?.nodes?.length > 0) {
          setGraphData(cached.data);
          setDataSource('cgc');
          setLoading(false);
          return;
        }
      }
    } catch {}

    // 2. Scan repo directly (cross-platform, no bash)
    try {
      const codeviz = window.electronAPI?.codeviz;
      if (codeviz && project.repoPath) {
        const scan = await codeviz.scanRepo(project.repoPath);
        if (scan?.ok && scan.files?.length > 0) {
          const graph = buildGraphFromScan(scan);
          if (graph.nodes.length > 0) {
            setGraphData(graph);
            setDataSource('scan');
            setLoading(false);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[CodeViz] scan failed:', err);
    }

    // 3. Sample data fallback
    setGraphData(generateSampleGraph(project.name));
    setDataSource('sample');
    setLoading(false);
  }

  // Stats
  const stats = useMemo(() => {
    if (!graphData) return null;
    const n = graphData.nodes || [];
    const files = n.filter(x => !x.isDir);
    const dirs = n.filter(x => x.isDir);
    const totalLoc = files.reduce((s, f) => s + (f.loc || 0), 0);
    return {
      total: n.length,
      files: files.length,
      dirs: dirs.length,
      edges: (graphData.edges || []).length,
      totalLoc,
      avgLoc: files.length ? Math.round(totalLoc / files.length) : 0,
      topExt: getTopExtensions(files),
    };
  }, [graphData]);

  // ─── Three.js lifecycle ───
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !graphData) return;

    // Cleanup
    if (sceneRef.current) {
      sceneRef.current.renderer.dispose();
      el.querySelector('canvas')?.remove();
    }
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const { nodes, edges } = graphData;
    if (!nodes?.length) return;

    const positions = forceLayout(nodes, edges, nodes.length > 300 ? 150 : 250);

    const ctx = buildScene(el, graphData, positions, layers, showComplexity, false);
    sceneRef.current = ctx;

    // Fit camera to graph bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [, p] of positions) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const graphSize = Math.max(maxX - minX, maxZ - minZ, 30);
    const baseDist = graphSize * 0.9;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let t = 0;

    function animate() {
      animRef.current = requestAnimationFrame(animate);
      t += 0.004;

      // Camera orbit
      const dist = baseDist * zoomRef.current;
      const angle = t * 0.06 + rotRef.current.y * 0.008;
      ctx.camera.position.x = Math.cos(angle) * dist;
      ctx.camera.position.z = Math.sin(angle) * dist;
      ctx.camera.position.y = (dist * 0.45) + Math.sin(t * 0.25) * 3 + rotRef.current.x * 0.04;
      ctx.camera.lookAt(0, 0, 0);

      // Node breathing + rotation
      for (const m of ctx.nodeMeshes) {
        const bp = m.userData.basePos;
        const phase = bp.x * 0.3 + bp.z * 0.3;
        m.position.y = bp.y + Math.sin(t * 1.5 + phase) * 0.4;
        m.rotation.y += m.userData.node.isDir ? 0.002 : 0.008;
        m.rotation.x = Math.sin(t + phase) * 0.1;
      }

      // Glow sprites follow parents
      for (const s of ctx.glowSprites) {
        s.position.copy(s.userData.parentMesh.position);
        s.material.opacity = s.material.opacity * 0.99 + (0.1 + Math.sin(t * 2 + s.position.x) * 0.04) * 0.01;
      }

      // Flow particles along edges
      for (const p of ctx.flowParticles) {
        p.userData.t += p.userData.speed * 0.008;
        if (p.userData.t > 1) p.userData.t -= 1;
        const pt = p.userData.curve.getPoint(p.userData.t);
        p.position.copy(pt);
        p.material.opacity = 0.5 + Math.sin(p.userData.t * Math.PI) * 0.4;
      }

      ctx.dust.rotation.y += 0.00015;
      ctx.dust.rotation.x = Math.sin(t * 0.1) * 0.003;

      // Raycasting for hover
      pointer.x = (mouseRef.current.x / el.clientWidth) * 2 - 1;
      pointer.y = -(mouseRef.current.y / el.clientHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, ctx.camera);
      const hits = raycaster.intersectObjects(ctx.nodeMeshes);

      for (const m of ctx.nodeMeshes) {
        if (!m.userData._selected) {
          m.material.emissiveIntensity = 0.6;
          m.scale.setScalar(1);
        }
      }

      if (hits.length > 0) {
        const hit = hits[0].object;
        hit.material.emissiveIntensity = 1.5;
        hit.scale.setScalar(1.6);
        setHoveredNode(hit.userData.node);
      } else {
        setHoveredNode(null);
      }

      ctx.renderer.render(ctx.scene, ctx.camera);
    }
    animate();

    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      ctx.camera.aspect = w / h;
      ctx.camera.updateProjectionMatrix();
      ctx.renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      ctx.renderer.dispose();
      el.querySelector('canvas')?.remove();
    };
  }, [graphData, layers, showComplexity]);

  // Mouse
  const onMouseMove = useCallback((e) => {
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return;
    mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (dragging.current) {
      rotRef.current.x += e.clientY - lastM.current.y;
      rotRef.current.y += e.clientX - lastM.current.x;
      lastM.current = { x: e.clientX, y: e.clientY };
    }
  }, []);
  const onMouseDown = useCallback((e) => { dragging.current = true; lastM.current = { x: e.clientX, y: e.clientY }; }, []);
  const onMouseUp = useCallback(() => { dragging.current = false; }, []);
  const onWheel = useCallback((e) => {
    e.preventDefault();
    zoomRef.current = Math.max(0.3, Math.min(3, zoomRef.current + e.deltaY * 0.001));
  }, []);
  const onClick = useCallback(() => {
    if (hoveredNode) setSelectedNode(prev => prev?.id === hoveredNode.id ? null : hoveredNode);
    else setSelectedNode(null);
  }, [hoveredNode]);

  const toggleLayer = (k) => setLayers(prev => ({ ...prev, [k]: !prev[k] }));

  // Relations for detail panel
  const relations = useMemo(() => {
    if (!selectedNode || !graphData) return { imports: [], importedBy: [], siblings: [] };
    const e = graphData.edges || [];
    const importTargets = e.filter(x => x.source === selectedNode.id && x.type === 'imports')
      .map(x => graphData.nodes.find(n => n.id === x.target)).filter(Boolean);
    const importedBy = e.filter(x => x.target === selectedNode.id && x.type === 'imports')
      .map(x => graphData.nodes.find(n => n.id === x.source)).filter(Boolean);
    const siblings = graphData.nodes.filter(n => n.dir === selectedNode.dir && n.id !== selectedNode.id && !n.isDir);
    return { imports: importTargets, importedBy, siblings };
  }, [selectedNode, graphData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 rounded-xl border border-forge-border bg-forge-surface">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-forge-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-forge-text-muted">Scanning codebase...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedProject || ''}
          onChange={(e) => { setSelectedProject(e.target.value); setSelectedNode(null); }}
          className="input-field !w-auto !py-1.5 text-xs"
        >
          {projects.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>

        <button
          onClick={loadGraph}
          className="px-3 py-1.5 text-[10px] font-medium rounded-lg bg-forge-accent/10 text-forge-accent border border-forge-accent/20 hover:bg-forge-accent/20 transition-colors"
        >
          Rescan
        </button>

        <div className="flex items-center gap-1 ml-auto">
          {[
            { key: 'imports', color: '#3B82F6', label: 'Imports' },
            { key: 'calls', color: '#22C55E', label: 'Calls' },
            { key: 'inherits', color: '#8B5CF6', label: 'Inherits' },
            { key: 'defined_in', color: '#475569', label: 'Structure' },
          ].map(({ key, color, label }) => (
            <button
              key={key}
              onClick={() => toggleLayer(key)}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${layers[key] ? 'text-white' : 'text-forge-text-muted opacity-30 hover:opacity-60'}`}
              style={{ backgroundColor: layers[key] ? `${color}30` : 'transparent', borderBottom: layers[key] ? `2px solid ${color}` : '2px solid transparent' }}
            >
              {label}
            </button>
          ))}
          <span className="w-px h-4 bg-forge-border mx-1" />
          <button
            onClick={() => setShowComplexity(!showComplexity)}
            className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${showComplexity ? 'bg-yellow-400/20 text-yellow-400' : 'text-forge-text-muted opacity-40 hover:opacity-70'}`}
          >
            Heatmap
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-3 text-[11px] text-forge-text-muted font-mono">
          <span className="text-forge-text-primary font-medium">{stats.files} files</span>
          <span className="opacity-30">|</span>
          <span>{stats.dirs} dirs</span>
          <span className="opacity-30">|</span>
          <span>{stats.totalLoc.toLocaleString()} LOC</span>
          <span className="opacity-30">|</span>
          <span>{stats.edges} edges</span>
          <span className="opacity-30">|</span>
          <span className="text-forge-text-muted/60">{stats.topExt}</span>
          {dataSource === 'sample' && (
            <span className="ml-auto px-2 py-0.5 rounded text-[9px] font-medium bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
              SAMPLE DATA
            </span>
          )}
          {dataSource === 'scan' && (
            <span className="ml-auto px-2 py-0.5 rounded text-[9px] font-medium bg-blue-400/10 text-blue-400 border border-blue-400/20">
              Live Scan
            </span>
          )}
          {dataSource === 'cgc' && (
            <span className="ml-auto px-2 py-0.5 rounded text-[9px] font-medium bg-green-400/10 text-green-400 border border-green-400/20">
              CGC AST
            </span>
          )}
          {luaWarning && (
            <span className="px-2 py-0.5 rounded text-[9px] font-medium bg-orange-400/10 text-orange-400 border border-orange-400/20">
              Lua/Luau
            </span>
          )}
        </div>
      )}

      {/* 3D Viewport + Detail Panel */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <div
            ref={containerRef}
            className="w-full rounded-xl overflow-hidden border border-forge-border/50 cursor-grab active:cursor-grabbing"
            style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}
            onMouseMove={onMouseMove}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
            onClick={onClick}
          />

          {/* Hover tooltip */}
          {hoveredNode && !selectedNode && (
            <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg p-3 shadow-2xl pointer-events-none animate-fade-in max-w-xs">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `#${(EXT_COLORS[hoveredNode.ext] || EXT_COLORS.default).toString(16).padStart(6, '0')}` }} />
                <span className="text-xs font-mono font-bold text-white">{hoveredNode.name}</span>
                {hoveredNode.isDir && <span className="text-[8px] text-blue-400 bg-blue-400/10 px-1 rounded">DIR</span>}
              </div>
              <div className="text-[10px] text-white/50 font-mono">{hoveredNode.file}</div>
              {!hoveredNode.isDir && (
                <div className="flex items-center gap-3 mt-1 text-[10px]">
                  <span className="text-cyan-400 font-mono font-bold">{(hoveredNode.loc || 0).toLocaleString()} LOC</span>
                  <span className="text-white/30">{hoveredNode.ext}</span>
                </div>
              )}
              {hoveredNode.isDir && <div className="text-[10px] text-blue-400 mt-0.5">{hoveredNode.childCount} files</div>}
            </div>
          )}

          <div className="absolute bottom-3 left-3 text-[9px] text-white/20 pointer-events-none font-mono">
            Drag orbit {'\u00B7'} Scroll zoom {'\u00B7'} Click inspect
          </div>
        </div>

        {/* Detail Panel */}
        {selectedNode && (
          <div className="w-72 rounded-xl border border-forge-border/50 bg-forge-surface/80 backdrop-blur-md p-4 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: `#${(EXT_COLORS[selectedNode.ext] || EXT_COLORS.default).toString(16).padStart(6, '0')}` }} />
                <span className="text-sm font-mono font-bold text-forge-text-primary truncate">{selectedNode.name}</span>
              </div>
              <button onClick={() => setSelectedNode(null)} className="text-xs text-forge-text-muted hover:text-forge-text-primary">{'\u2715'}</button>
            </div>

            <div className="space-y-2 text-[11px]">
              <div className="text-forge-text-muted font-mono text-[10px] break-all">{selectedNode.file}</div>
              {!selectedNode.isDir && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400 font-mono font-bold">{(selectedNode.loc || 0).toLocaleString()} LOC</span>
                  {selectedNode.complexity && (
                    <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                      selectedNode.complexity > 18 ? 'bg-red-400/10 text-red-400' :
                      selectedNode.complexity > 10 ? 'bg-yellow-400/10 text-yellow-400' :
                      'bg-green-400/10 text-green-400'
                    }`}>
                      cx:{selectedNode.complexity}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-white/5 text-forge-text-muted">.{selectedNode.ext}</span>
                </div>
              )}
              {selectedNode.isDir && (
                <div className="px-2 py-1 rounded bg-blue-400/10 text-blue-400 text-[10px] font-medium">
                  Directory — {selectedNode.childCount} files
                </div>
              )}
              {selectedNode.lastModified && (
                <div className="text-[10px] text-forge-text-muted">
                  Last modified: {new Date(selectedNode.lastModified).toLocaleDateString()}
                </div>
              )}
            </div>

            {relations.imports.length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-blue-400 mb-1">Imports ({relations.imports.length})</div>
                {relations.imports.slice(0, 10).map(n => (
                  <button key={n.id} onClick={() => setSelectedNode(n)}
                    className="block w-full text-left px-2 py-1 text-[10px] font-mono text-blue-300 hover:bg-blue-400/10 rounded transition-colors truncate">
                    {n.name}
                  </button>
                ))}
              </div>
            )}

            {relations.importedBy.length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-green-400 mb-1">Imported by ({relations.importedBy.length})</div>
                {relations.importedBy.slice(0, 10).map(n => (
                  <button key={n.id} onClick={() => setSelectedNode(n)}
                    className="block w-full text-left px-2 py-1 text-[10px] font-mono text-green-300 hover:bg-green-400/10 rounded transition-colors truncate">
                    {n.name}
                  </button>
                ))}
              </div>
            )}

            {relations.siblings.length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-forge-text-secondary mb-1">Same directory ({relations.siblings.length})</div>
                {relations.siblings.slice(0, 8).map(n => (
                  <button key={n.id} onClick={() => setSelectedNode(n)}
                    className="block w-full text-left px-2 py-1 text-[10px] font-mono text-forge-text-muted hover:bg-white/5 rounded transition-colors truncate">
                    {n.name} <span className="text-forge-text-muted/40">{n.loc} loc</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ───

function getTopExtensions(files) {
  const counts = {};
  for (const f of files) {
    counts[f.ext] = (counts[f.ext] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([ext, c]) => `.${ext}(${c})`).join(' ');
}

function generateSampleGraph(projectName) {
  const nodes = [
    { id: 'f:src/game/Game.js', type: 'module', name: 'Game.js', file: 'src/game/Game.js', loc: 1200, ext: 'js', dir: 'src/game' },
    { id: 'f:src/game/Fleet.js', type: 'module', name: 'Fleet.js', file: 'src/game/Fleet.js', loc: 800, ext: 'js', dir: 'src/game' },
    { id: 'f:src/game/Ship.js', type: 'module', name: 'Ship.js', file: 'src/game/Ship.js', loc: 650, ext: 'js', dir: 'src/game' },
    { id: 'f:src/game/Combat.js', type: 'module', name: 'Combat.js', file: 'src/game/Combat.js', loc: 900, ext: 'js', dir: 'src/game' },
    { id: 'f:src/game/Sector.js', type: 'module', name: 'Sector.js', file: 'src/game/Sector.js', loc: 700, ext: 'js', dir: 'src/game' },
    { id: 'f:src/game/Crafting.js', type: 'module', name: 'Crafting.js', file: 'src/game/Crafting.js', loc: 500, ext: 'js', dir: 'src/game' },
    { id: 'f:src/ui/HUD.js', type: 'module', name: 'HUD.js', file: 'src/ui/HUD.js', loc: 400, ext: 'js', dir: 'src/ui' },
    { id: 'f:src/ui/StarMap.js', type: 'module', name: 'StarMap.js', file: 'src/ui/StarMap.js', loc: 550, ext: 'js', dir: 'src/ui' },
    { id: 'f:src/ui/Inventory.js', type: 'module', name: 'Inventory.js', file: 'src/ui/Inventory.js', loc: 350, ext: 'js', dir: 'src/ui' },
    { id: 'f:src/render/SceneManager.js', type: 'module', name: 'SceneManager.js', file: 'src/render/SceneManager.js', loc: 600, ext: 'js', dir: 'src/render' },
    { id: 'f:src/render/Particles.js', type: 'module', name: 'Particles.js', file: 'src/render/Particles.js', loc: 300, ext: 'js', dir: 'src/render' },
    { id: 'f:src/render/Shaders.glsl', type: 'module', name: 'Shaders.glsl', file: 'src/render/Shaders.glsl', loc: 200, ext: 'glsl', dir: 'src/render' },
    { id: 'f:src/audio/AudioManager.js', type: 'module', name: 'AudioManager.js', file: 'src/audio/AudioManager.js', loc: 350, ext: 'js', dir: 'src/audio' },
    { id: 'f:src/net/Multiplayer.js', type: 'module', name: 'Multiplayer.js', file: 'src/net/Multiplayer.js', loc: 800, ext: 'js', dir: 'src/net' },
    { id: 'f:src/net/Protocol.js', type: 'module', name: 'Protocol.js', file: 'src/net/Protocol.js', loc: 450, ext: 'js', dir: 'src/net' },
    { id: 'f:src/utils/math.js', type: 'module', name: 'math.js', file: 'src/utils/math.js', loc: 180, ext: 'js', dir: 'src/utils' },
    { id: 'f:src/utils/pool.js', type: 'module', name: 'pool.js', file: 'src/utils/pool.js', loc: 120, ext: 'js', dir: 'src/utils' },
    { id: 'f:package.json', type: 'module', name: 'package.json', file: 'package.json', loc: 45, ext: 'json', dir: '.' },
    { id: 'd:src/game', type: 'class', name: 'game', file: 'src/game', loc: 0, ext: 'dir', isDir: true, childCount: 6 },
    { id: 'd:src/ui', type: 'class', name: 'ui', file: 'src/ui', loc: 0, ext: 'dir', isDir: true, childCount: 3 },
    { id: 'd:src/render', type: 'class', name: 'render', file: 'src/render', loc: 0, ext: 'dir', isDir: true, childCount: 3 },
    { id: 'd:src/audio', type: 'class', name: 'audio', file: 'src/audio', loc: 0, ext: 'dir', isDir: true, childCount: 1 },
    { id: 'd:src/net', type: 'class', name: 'net', file: 'src/net', loc: 0, ext: 'dir', isDir: true, childCount: 2 },
    { id: 'd:src/utils', type: 'class', name: 'utils', file: 'src/utils', loc: 0, ext: 'dir', isDir: true, childCount: 2 },
  ];
  const edges = [
    { source: 'f:src/game/Game.js', target: 'f:src/game/Fleet.js', type: 'imports' },
    { source: 'f:src/game/Game.js', target: 'f:src/game/Combat.js', type: 'imports' },
    { source: 'f:src/game/Game.js', target: 'f:src/game/Sector.js', type: 'imports' },
    { source: 'f:src/game/Game.js', target: 'f:src/ui/HUD.js', type: 'imports' },
    { source: 'f:src/game/Game.js', target: 'f:src/render/SceneManager.js', type: 'imports' },
    { source: 'f:src/game/Game.js', target: 'f:src/audio/AudioManager.js', type: 'imports' },
    { source: 'f:src/game/Fleet.js', target: 'f:src/game/Ship.js', type: 'imports' },
    { source: 'f:src/game/Combat.js', target: 'f:src/game/Ship.js', type: 'imports' },
    { source: 'f:src/game/Crafting.js', target: 'f:src/ui/Inventory.js', type: 'imports' },
    { source: 'f:src/ui/HUD.js', target: 'f:src/ui/StarMap.js', type: 'imports' },
    { source: 'f:src/render/SceneManager.js', target: 'f:src/render/Particles.js', type: 'imports' },
    { source: 'f:src/render/SceneManager.js', target: 'f:src/render/Shaders.glsl', type: 'imports' },
    { source: 'f:src/net/Multiplayer.js', target: 'f:src/net/Protocol.js', type: 'imports' },
    { source: 'f:src/game/Game.js', target: 'f:src/net/Multiplayer.js', type: 'imports' },
    { source: 'f:src/game/Combat.js', target: 'f:src/utils/math.js', type: 'imports' },
    { source: 'f:src/render/Particles.js', target: 'f:src/utils/pool.js', type: 'imports' },
    ...['Game.js','Fleet.js','Ship.js','Combat.js','Sector.js','Crafting.js'].map(n => ({ source: `f:src/game/${n}`, target: 'd:src/game', type: 'defined_in' })),
    ...['HUD.js','StarMap.js','Inventory.js'].map(n => ({ source: `f:src/ui/${n}`, target: 'd:src/ui', type: 'defined_in' })),
    ...['SceneManager.js','Particles.js','Shaders.glsl'].map(n => ({ source: `f:src/render/${n}`, target: 'd:src/render', type: 'defined_in' })),
    { source: 'f:src/audio/AudioManager.js', target: 'd:src/audio', type: 'defined_in' },
    ...['Multiplayer.js','Protocol.js'].map(n => ({ source: `f:src/net/${n}`, target: 'd:src/net', type: 'defined_in' })),
    ...['math.js','pool.js'].map(n => ({ source: `f:src/utils/${n}`, target: 'd:src/utils', type: 'defined_in' })),
  ];

  const maxLoc = Math.max(...nodes.filter(n => !n.isDir).map(n => n.loc), 1);
  for (const n of nodes) { if (!n.isDir) n.complexity = Math.round((n.loc / maxLoc) * 25); }

  return {
    meta: { project: projectName, nodeCount: nodes.length, edgeCount: edges.length, indexedAt: new Date().toISOString(), source: 'sample' },
    nodes, edges,
    analysis: { deadCode: [], complexityHotspots: [], avgComplexity: 10, maxComplexity: 25 },
  };
}
