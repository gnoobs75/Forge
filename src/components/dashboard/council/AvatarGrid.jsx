import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GEOMETRY_MAP, createGeometry } from '../../../utils/avatarRenderer';

const GRID_COLS = 7;
const TILE_SIZE = 44;
const TILE_GAP = 2;
const CANVAS_W = (TILE_SIZE + TILE_GAP) * GRID_COLS - TILE_GAP;
const CANVAS_H = (TILE_SIZE + TILE_GAP) * 2 - TILE_GAP;

export default function AvatarGrid({ agents, talkingAgentId, messages }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const meshesRef = useRef([]);
  const frameRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  // Track which agents posted recently for "talking" pulse
  const recentPosters = useMemo(() => {
    const now = Date.now();
    const recent = new Set();
    for (let i = messages.length - 1; i >= 0 && i >= messages.length - 5; i--) {
      const msg = messages[i];
      if (now - new Date(msg.timestamp).getTime() < 15000) {
        recent.add(msg.agentId);
      }
    }
    return recent;
  }, [messages]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(CANVAS_W, CANVAS_H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.setScissorTest(true);
    rendererRef.current = renderer;

    // Scene + camera (one shared scene, scissored per tile)
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    camera.position.set(0, 0, 2.2);
    cameraRef.current = camera;

    // Lights
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(2, 3, 2);
    scene.add(directional);
    const point = new THREE.PointLight(0x6666ff, 0.3, 10);
    point.position.set(-2, -1, 3);
    scene.add(point);

    // Create meshes for each agent
    const meshes = agents.map((agent, i) => {
      const geoType = GEOMETRY_MAP[agent.id] || 'icosahedron';
      const geometry = createGeometry(geoType);
      const color = new THREE.Color(agent.color);

      const material = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.15,
        metalness: 0.4,
        roughness: 0.5,
        wireframe: false,
      });

      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      return { mesh, agent, material, baseColor: color.clone() };
    });
    meshesRef.current = meshes;

    startTimeRef.current = Date.now();

    // Animation loop
    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      const t = (Date.now() - startTimeRef.current) / 1000;

      meshes.forEach((entry, i) => {
        const { mesh, agent, material, baseColor } = entry;
        const col = i % GRID_COLS;
        const row = Math.floor(i / GRID_COLS);

        // Viewport for this tile
        const x = col * (TILE_SIZE + TILE_GAP);
        const y = CANVAS_H - (row + 1) * (TILE_SIZE + TILE_GAP) + TILE_GAP;

        renderer.setViewport(x, y, TILE_SIZE, TILE_SIZE);
        renderer.setScissor(x, y, TILE_SIZE, TILE_SIZE);

        // Rotation
        mesh.rotation.x = t * 0.3 + i * 0.5;
        mesh.rotation.y = t * 0.5 + i * 0.3;

        // Breathing float (sin wave on Y)
        mesh.position.y = Math.sin(t * 1.5 + i * 0.7) * 0.08;

        // Talking state: pulse scale
        const isTalking = talkingAgentId === agent.id || recentPosters.has(agent.id);
        if (isTalking) {
          const pulse = 1.0 + Math.sin(t * 6) * 0.15;
          mesh.scale.setScalar(pulse);
          material.emissiveIntensity = 0.4 + Math.sin(t * 4) * 0.2;
        } else {
          mesh.scale.setScalar(1.0);
          material.emissiveIntensity = 0.15;
        }

        // Reset position for camera consistency
        mesh.position.x = 0;
        mesh.position.z = 0;

        renderer.render(scene, camera);
      });
    }

    animate();

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      meshes.forEach(({ mesh }) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
        scene.remove(mesh);
      });
      renderer.dispose();
    };
  }, [agents]); // only re-init if agents array changes

  // Update talking state without re-creating meshes
  useEffect(() => {
    // The animation loop reads talkingAgentId and recentPosters each frame
    // via closure, so no extra work needed here
  }, [talkingAgentId, recentPosters]);

  return (
    <div className="p-2">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="w-full"
        style={{ imageRendering: 'auto' }}
      />
      {/* Agent name labels */}
      <div
        className="grid gap-[2px] mt-1"
        style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` }}
      >
        {agents.map((agent) => {
          const isTalking = talkingAgentId === agent.id || recentPosters.has(agent.id);
          return (
            <div
              key={agent.id}
              className="text-center relative"
              title={`${agent.name} — ${agent.role}`}
            >
              <div className="flex items-center justify-center gap-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: isTalking ? agent.color : '#22C55E',
                    boxShadow: isTalking ? `0 0 6px ${agent.color}` : 'none',
                  }}
                />
                <span
                  className="text-[8px] font-medium truncate leading-tight"
                  style={{ color: isTalking ? agent.color : 'var(--forge-text-muted)' }}
                >
                  {agent.name.split(' ')[agent.name.split(' ').length - 1]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
