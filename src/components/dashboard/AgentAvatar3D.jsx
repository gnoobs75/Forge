import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GEOMETRY_MAP, createGeometry } from '../../utils/avatarRenderer';

/**
 * Live Three.js hero avatar — animated rotation, breathing, emissive glow.
 * Used in AgentProfile for the large interactive avatar.
 */
export default function AgentAvatar3D({ agentId, color, size = 120 }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const meshRef = useRef(null);
  const materialRef = useRef(null);
  const frameRef = useRef(null);
  const rimLightRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);

  // Keep ref in sync for animation loop access
  hoveredRef.current = hovered;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio, 2);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(size, size);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();

    // Lights
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(2, 3, 2);
    scene.add(keyLight);

    const agentColor = new THREE.Color(color);

    const rimLight = new THREE.PointLight(agentColor, 0.5, 10);
    rimLight.position.set(-2, -1, -2);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    const fillLight = new THREE.PointLight(0x6666ff, 0.2, 10);
    fillLight.position.set(-1, 2, 3);
    scene.add(fillLight);

    // Camera
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    camera.position.set(0, 0, 2.2);

    // Mesh
    const geoType = GEOMETRY_MAP[agentId] || 'icosahedron';
    const geometry = createGeometry(geoType);
    const material = new THREE.MeshStandardMaterial({
      color: agentColor,
      emissive: agentColor,
      emissiveIntensity: 0.2,
      metalness: 0.5,
      roughness: 0.4,
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;

    const startTime = Date.now();

    // Animation loop
    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      const t = (Date.now() - startTime) / 1000;

      // Rotation
      mesh.rotation.x = t * 0.3;
      mesh.rotation.y = t * 0.5;

      // Breathing float
      mesh.position.y = Math.sin(t * 1.5) * 0.06;

      // Hover: scale up, increase emissive
      const isHovered = hoveredRef.current;
      const targetScale = isHovered ? 1.05 : 1.0;
      const targetEmissive = isHovered ? 0.4 : 0.2;

      // Smooth lerp
      const currentScale = mesh.scale.x;
      const newScale = currentScale + (targetScale - currentScale) * 0.1;
      mesh.scale.setScalar(newScale);

      material.emissiveIntensity +=
        (targetEmissive - material.emissiveIntensity) * 0.1;

      // Subtle emissive pulse
      material.emissiveIntensity +=
        Math.sin(t * 2) * 0.02;

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [agentId, color, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="block"
      style={{ width: size, height: size }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    />
  );
}
