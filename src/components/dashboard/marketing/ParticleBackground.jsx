import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

export default function ParticleBackground({ template, width, height }) {
  const containerRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = width || container.clientWidth;
    const h = height || container.clientHeight || 300;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    camera.position.z = 50;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Create particles based on template
    const count = template === 'roblox-playful' ? 100 : 300;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const palette = getTemplatePalette(template);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 100;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;

      const color = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: template === 'roblox-playful' ? 2 : 0.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    function animate() {
      rafRef.current = requestAnimationFrame(animate);

      points.rotation.y += 0.0005;
      points.rotation.x += 0.0002;

      // Template-specific motion
      if (template === 'underground-neon') {
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < count; i++) {
          positions[i * 3 + 1] -= 0.02; // drip down
          if (positions[i * 3 + 1] < -50) positions[i * 3 + 1] = 50;
        }
        geometry.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [template, width, height]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

function getTemplatePalette(template) {
  switch (template) {
    case 'space-epic':
      return ['#0ea5e9', '#f97316', '#ffffff', '#6366f1'];
    case 'underground-neon':
      return ['#10B981', '#EC4899', '#EAB308', '#22d3ee'];
    case 'roblox-playful':
      return ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444'];
    default:
      return ['#0ea5e9', '#ffffff', '#94a3b8'];
  }
}
