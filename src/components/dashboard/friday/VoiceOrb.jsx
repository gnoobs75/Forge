import { useRef, useEffect } from 'react';
import * as THREE from 'three';

const STATES = {
  off: { color: 0x374151, emissive: 0x000000, intensity: 0, pulseSpeed: 0, scale: 0.8 },
  idle: { color: 0xD946EF, emissive: 0xA855F7, intensity: 0.15, pulseSpeed: 1.5, scale: 1.0 },
  listening: { color: 0x3B82F6, emissive: 0x2563EB, intensity: 0.3, pulseSpeed: 3, scale: 1.0 },
  speaking: { color: 0x22C55E, emissive: 0x16A34A, intensity: 0.4, pulseSpeed: 4, scale: 1.05 },
  working: { color: 0xF97316, emissive: 0xEA580C, intensity: 0.3, pulseSpeed: 6, scale: 1.0 },
};

// Convert CSS hex color string to THREE.js integer
function hexToInt(hex) {
  if (!hex || typeof hex !== 'string') return 0xD946EF;
  return parseInt(hex.replace('#', ''), 16);
}

// Darken a hex color by a factor (0-1)
function darkenHex(hex, factor = 0.5) {
  const c = new THREE.Color(hexToInt(hex));
  c.multiplyScalar(factor);
  return c.getHex();
}

export default function VoiceOrb({ state = 'off', size = 180, audioLevel = 0, theme, wakeFlash = false }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const frameRef = useRef(null);
  const stateRef = useRef(state);
  const audioRef = useRef(audioLevel);
  const themeRef = useRef(theme);

  const wakeFlashRef = useRef(wakeFlash);
  stateRef.current = state;
  audioRef.current = audioLevel;
  themeRef.current = theme;
  wakeFlashRef.current = wakeFlash;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    camera.position.set(0, 0, 3);

    // Lights
    scene.add(new THREE.AmbientLight(0x404060, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(1, 1, 2);
    scene.add(dirLight);
    const pointLight = new THREE.PointLight(0xD946EF, 0.5, 8);
    pointLight.position.set(0, 0, 2);
    scene.add(pointLight);

    // Subtle white rim light — gives a soft highlight on dark orbs
    const rimLight = new THREE.PointLight(0xFFFFFF, 0.25, 6);
    rimLight.position.set(-1.5, 1.2, 1.5);
    scene.add(rimLight);

    // Detect dark persona for initial material setup
    const initTheme = themeRef.current;
    const initDark = initTheme?.secondary === '#000000';
    const initColor = initDark ? 0x111111 : STATES.idle.color;
    const initEmissive = initDark ? parseInt((initTheme.primary || '#D946EF').replace('#',''), 16) : STATES.idle.emissive;

    // Core sphere
    const geometry = new THREE.IcosahedronGeometry(0.8, 4);
    const material = new THREE.MeshStandardMaterial({
      color: initColor,
      emissive: initEmissive,
      emissiveIntensity: initDark ? 0.3 : STATES.idle.intensity,
      metalness: initDark ? 0.7 : 0.3,
      roughness: initDark ? 0.2 : 0.4,
      wireframe: false,
    });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // Inner glow sphere
    const innerGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({
      color: initDark ? initEmissive : 0xD946EF,
      transparent: true,
      opacity: 0.3,
    });
    const innerSphere = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerSphere);

    // Outer glow shell — transparent additive layer for dramatic bloom
    const glowGeo = new THREE.IcosahedronGeometry(0.95, 3);
    const glowMat = new THREE.MeshBasicMaterial({
      color: initDark ? initEmissive : 0xD946EF,
      transparent: true,
      opacity: 0.04,
      side: THREE.BackSide,
    });
    const glowShell = new THREE.Mesh(glowGeo, glowMat);
    scene.add(glowShell);

    // Particle swirl — small dots orbiting the sphere
    const particleCount = 60;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleAngles = new Float32Array(particleCount * 3); // theta, phi, radius
    for (let i = 0; i < particleCount; i++) {
      particleAngles[i * 3] = Math.random() * Math.PI * 2;     // theta
      particleAngles[i * 3 + 1] = Math.random() * Math.PI * 2; // phi
      particleAngles[i * 3 + 2] = 0.9 + Math.random() * 0.4;  // radius
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: initDark ? initEmissive : 0xD946EF,
      size: 0.02,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Orbit rings
    const ringGeo = new THREE.TorusGeometry(1.0, 0.008, 8, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: initDark ? initEmissive : 0xD946EF, transparent: true, opacity: 0.15 });
    const ring1 = new THREE.Mesh(ringGeo, ringMat);
    ring1.rotation.x = Math.PI / 3;
    scene.add(ring1);
    const ring2 = new THREE.Mesh(ringGeo.clone(), ringMat.clone());
    ring2.rotation.x = -Math.PI / 4;
    ring2.rotation.y = Math.PI / 5;
    scene.add(ring2);

    const startTime = Date.now();

    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      const t = (Date.now() - startTime) / 1000;
      const currentState = stateRef.current;
      const s = STATES[currentState] || STATES.off;
      const audio = audioRef.current;
      const currentTheme = themeRef.current;

      // Build target colors: use persona theme for idle state, override for active states
      // Dark personas (secondary=#000): orb surface stays black ALWAYS, emissive stays red ALWAYS
      // Only the surrounding effects (particles, rings, glow shell, point light) change color per state
      const isDarkPersona = currentTheme?.secondary === '#000000';
      // State color for effects only (not the sphere itself)
      const stateEffectColor = (currentState === 'idle' || currentState === 'off')
        ? hexToInt(currentTheme?.primary || '#D946EF')
        : s.emissive;
      let targetColorHex, targetEmissiveHex, targetIntensity;
      if (isDarkPersona) {
        // Sphere: always black surface, always red emissive (never blue/green)
        targetColorHex = 0x111111;
        targetEmissiveHex = hexToInt(currentTheme.primary); // always red
        targetIntensity = 0.15 + Math.sin(t * 1.5) * 0.08; // subtle red pulse on sphere
      } else if (currentState === 'idle' && currentTheme) {
        targetColorHex = hexToInt(currentTheme.primary);
        targetEmissiveHex = darkenHex(currentTheme.primary, 0.7);
        targetIntensity = s.intensity;
      } else if (currentState === 'off' && currentTheme) {
        targetColorHex = s.color;
        targetEmissiveHex = s.emissive;
        targetIntensity = s.intensity;
      } else {
        targetColorHex = s.color;
        targetEmissiveHex = s.emissive;
        targetIntensity = s.intensity;
      }

      // Smooth transition to target state — dark personas lerp faster for snappy black orb
      const lerpRate = isDarkPersona ? 0.15 : 0.05;
      const targetColor = new THREE.Color(targetColorHex);
      const targetEmissive = new THREE.Color(targetEmissiveHex);
      material.color.lerp(targetColor, lerpRate);
      material.emissive.lerp(targetEmissive, lerpRate);
      material.emissiveIntensity += (targetIntensity - material.emissiveIntensity) * lerpRate;

      // Pulse — deeper, more organic for dark personas
      const pulseSpeed = isDarkPersona ? Math.max(s.pulseSpeed, 1.2) : s.pulseSpeed;
      const pulseDepth = isDarkPersona ? 0.08 : 0.05;
      const pulse = 1.0 + Math.sin(t * pulseSpeed) * pulseDepth + Math.sin(t * pulseSpeed * 0.7) * pulseDepth * 0.4;
      const audioScale = 1.0 + audio * 0.2;
      const targetScale = s.scale * pulse * audioScale;
      sphere.scale.setScalar(sphere.scale.x + (targetScale - sphere.scale.x) * 0.1);

      // Rotation
      sphere.rotation.x = t * 0.15;
      sphere.rotation.y = t * 0.25;

      // Metalness/roughness for dark personas — sleek and reflective
      if (isDarkPersona) {
        material.metalness += (0.7 - material.metalness) * 0.05;
        material.roughness += (0.2 - material.roughness) * 0.05;
      }

      // Glow color — for dark personas, effects follow state color (blue/green/red); sphere stays red
      const glowColorTarget = isDarkPersona
        ? new THREE.Color(stateEffectColor)
        : new THREE.Color(hexToInt(currentTheme?.primary || '#D946EF'));

      // Inner glow
      innerMat.color.lerp(glowColorTarget, lerpRate);
      const innerPulse = isDarkPersona
        ? 0.2 + Math.sin(t * 1.8) * 0.15 + Math.sin(t * 3.1) * 0.05 + audio * 0.4
        : 0.15 + Math.sin(t * 2) * 0.1 + audio * 0.3;
      innerMat.opacity = innerPulse;
      innerSphere.scale.setScalar(isDarkPersona ? 0.35 + audio * 0.2 + Math.sin(t * 2.5) * 0.03 : 0.3 + audio * 0.15);

      // Outer glow shell — breathes with the orb
      glowMat.color.lerp(glowColorTarget, lerpRate);
      glowMat.opacity = isDarkPersona
        ? 0.03 + Math.sin(t * 1.5) * 0.025 + audio * 0.06
        : 0.04;
      glowShell.scale.setScalar(1.0 + Math.sin(t * 1.2) * 0.03 + audio * 0.08);

      // Particle swirl — orbit around sphere
      const positions = particles.geometry.attributes.position.array;
      const speed = isDarkPersona ? 0.4 + audio * 0.8 : 0.3;
      for (let i = 0; i < particleCount; i++) {
        const theta = particleAngles[i * 3] + t * speed * (0.5 + i * 0.01);
        const phi = particleAngles[i * 3 + 1] + t * speed * 0.3;
        const r = particleAngles[i * 3 + 2] + Math.sin(t * 2 + i) * 0.05 + audio * 0.15;
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi);
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      particles.geometry.attributes.position.needsUpdate = true;
      particleMat.color.lerp(glowColorTarget, lerpRate);
      particleMat.opacity = isDarkPersona ? 0.5 + Math.sin(t * 2) * 0.2 + audio * 0.3 : 0.4;

      // Rings — glow-colored
      ring1.material.color.lerp(glowColorTarget, lerpRate);
      ring2.material.color.lerp(glowColorTarget, lerpRate);
      ring1.rotation.z = t * 0.3;
      ring2.rotation.z = -t * 0.2;
      ring1.material.opacity = isDarkPersona ? 0.12 + audio * 0.2 + Math.sin(t * 1.7) * 0.04 : 0.1 + audio * 0.15;
      ring2.material.opacity = isDarkPersona ? 0.08 + audio * 0.15 + Math.sin(t * 2.3) * 0.03 : 0.08 + audio * 0.1;

      // Point light — follows glow color
      pointLight.color.lerp(glowColorTarget, lerpRate);
      const baseLightIntensity = isDarkPersona ? 0.6 + audio * 0.4 : 0.5;
      // Wake word flash — bright white burst on both orbs
      const flashAmount = wakeFlashRef.current ? 1.0 : 0.0;
      pointLight.intensity += ((baseLightIntensity + flashAmount * 2.0) - pointLight.intensity) * 0.15;
      if (wakeFlashRef.current) {
        pointLight.color.lerp(new THREE.Color(0xFFFFFF), 0.3);
        material.emissiveIntensity += (1.0 - material.emissiveIntensity) * 0.2;
        glowMat.opacity = Math.min(glowMat.opacity + 0.05, 0.3);
        particleMat.opacity = Math.min(particleMat.opacity + 0.05, 1.0);
      }

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      geometry.dispose();
      material.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  );
}
