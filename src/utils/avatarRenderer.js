import * as THREE from 'three';

// Different geometry per agent "archetype"
export const GEOMETRY_MAP = {
  'market-analyst': 'icosahedron',
  'store-optimizer': 'dodecahedron',
  'growth-strategist': 'octahedron',
  'brand-director': 'torus',
  'content-producer': 'torusKnot',
  'community-manager': 'icosahedron',
  'qa-advisor': 'dodecahedron',
  'studio-producer': 'octahedron',
  'monetization': 'dodecahedron',
  'player-psych': 'icosahedron',
  'art-director': 'torusKnot',
  'creative-thinker': 'torus',
  'tech-architect': 'octahedron',
  'hr-director': 'torus',
};

export function createGeometry(type) {
  switch (type) {
    case 'icosahedron': return new THREE.IcosahedronGeometry(0.45, 0);
    case 'dodecahedron': return new THREE.DodecahedronGeometry(0.45, 0);
    case 'octahedron': return new THREE.OctahedronGeometry(0.5, 0);
    case 'torus': return new THREE.TorusGeometry(0.35, 0.15, 8, 16);
    case 'torusKnot': return new THREE.TorusKnotGeometry(0.3, 0.1, 32, 8);
    default: return new THREE.IcosahedronGeometry(0.45, 0);
  }
}

// Cache: key "${agentId}-${size}" → data URL
const avatarCache = new Map();

// Shared offscreen renderer (lazy-initialized)
let sharedRenderer = null;
let sharedScene = null;
let sharedCamera = null;

function ensureRenderer() {
  if (sharedRenderer) return;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;

  sharedRenderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  sharedRenderer.setSize(128, 128);
  sharedRenderer.setClearColor(0x000000, 0);

  sharedScene = new THREE.Scene();

  // Lighting — matches hero avatar for consistency
  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  sharedScene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(2, 3, 2);
  sharedScene.add(key);

  const fill = new THREE.PointLight(0x6666ff, 0.2, 10);
  fill.position.set(-1, 2, 3);
  sharedScene.add(fill);

  sharedCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  sharedCamera.position.set(0, 0, 2.2);
}

/**
 * Render a single agent avatar to a data URL.
 * @param {string} agentId - Agent identifier (e.g. 'market-analyst')
 * @param {string} agentColor - Hex color string (e.g. '#3B82F6')
 * @param {number} size - Output image size in px (rendered at this res)
 * @returns {string} PNG data URL
 */
export function renderAgentAvatar(agentId, agentColor, size = 64) {
  const cacheKey = `${agentId}-${size}`;
  if (avatarCache.has(cacheKey)) return avatarCache.get(cacheKey);

  ensureRenderer();

  // Resize offscreen canvas if needed
  if (sharedRenderer.domElement.width !== size || sharedRenderer.domElement.height !== size) {
    sharedRenderer.setSize(size, size);
  }

  const geoType = GEOMETRY_MAP[agentId] || 'icosahedron';
  const geometry = createGeometry(geoType);
  const color = new THREE.Color(agentColor);

  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.2,
    metalness: 0.5,
    roughness: 0.4,
  });

  // Rim light in agent's color for that dramatic edge glow
  const rimLight = new THREE.PointLight(new THREE.Color(agentColor), 0.5, 10);
  rimLight.position.set(-2, -1, -2);
  sharedScene.add(rimLight);

  const mesh = new THREE.Mesh(geometry, material);
  // Slight tilt for depth — not flat-on
  mesh.rotation.x = 0.4;
  mesh.rotation.y = 0.6;
  sharedScene.add(mesh);

  // Render
  sharedRenderer.setClearColor(0x000000, 0);
  sharedRenderer.render(sharedScene, sharedCamera);

  const dataUrl = sharedRenderer.domElement.toDataURL('image/png');

  // Cleanup this mesh (keep scene/lights for reuse)
  sharedScene.remove(mesh);
  sharedScene.remove(rimLight);
  geometry.dispose();
  material.dispose();
  rimLight.dispose();

  avatarCache.set(cacheKey, dataUrl);
  return dataUrl;
}

/**
 * Batch pre-render all agent avatars at a given size.
 * @param {Array<{id: string, color: string}>} agents
 * @param {number} size
 * @returns {Map<string, string>} agentId → data URL
 */
export function preRenderAllAvatars(agents, size = 64) {
  const results = new Map();
  for (const agent of agents) {
    results.set(agent.id, renderAgentAvatar(agent.id, agent.color, size));
  }
  return results;
}

/**
 * Clear the avatar cache (e.g. if agent colors change).
 */
export function clearAvatarCache() {
  avatarCache.clear();
}
