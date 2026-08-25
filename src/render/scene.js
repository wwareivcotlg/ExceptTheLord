// ============================================================
// scene.js — renderer, lights, resize, loop.
// Three.js r128.
// ============================================================

import * as THREE from 'three';
import { PALETTE, LIGHTING, QUALITY } from './palette.js';

/** A vertical sky gradient — a flat colour reads as an empty viewport. */
function skyGradient(top, bottom) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 128;
  const c = canvas.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, `#${top.toString(16).padStart(6, '0')}`);
  g.addColorStop(1, `#${bottom.toString(16).padStart(6, '0')}`);
  c.fillStyle = g;
  c.fillRect(0, 0, 2, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: QUALITY.antialias,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.maxPixelRatio));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = QUALITY.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Filmic tone mapping keeps the warm key from blowing out and
  // gives the whole scene a softer, less plastic falloff.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LIGHTING.exposure;

  const scene = new THREE.Scene();
  scene.background = skyGradient(PALETTE.skyTop, PALETTE.skyBottom);
  scene.fog = new THREE.Fog(PALETTE.skyBottom, 46, 110);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200);

  // --- Lights ---
  const hemi = new THREE.HemisphereLight(
    LIGHTING.hemiSky, LIGHTING.hemiGround, LIGHTING.hemiIntensity
  );
  scene.add(hemi);

  const key = new THREE.DirectionalLight(LIGHTING.keyColor, LIGHTING.keyIntensity);
  key.position.set(LIGHTING.keyPosition.x, LIGHTING.keyPosition.y, LIGHTING.keyPosition.z);
  key.castShadow = QUALITY.shadows;
  if (key.shadow) {
    const b = LIGHTING.shadowBounds;
    key.shadow.mapSize.set(LIGHTING.shadowMapSize, LIGHTING.shadowMapSize);
    key.shadow.camera.left = -b;
    key.shadow.camera.right = b;
    key.shadow.camera.top = b;
    key.shadow.camera.bottom = -b;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 60;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.02;
  }
  scene.add(key);
  scene.add(key.target);

  const fill = new THREE.DirectionalLight(LIGHTING.fillColor, LIGHTING.fillIntensity);
  fill.position.set(-12, 9, -10);
  scene.add(fill);

  // Rim light: a cool edge that lifts figures off the floor. Without
  // it, flat-shaded people sink into whatever they stand on.
  const rim = new THREE.DirectionalLight(LIGHTING.rimColor, LIGHTING.rimIntensity);
  rim.position.set(LIGHTING.rimPosition.x, LIGHTING.rimPosition.y, LIGHTING.rimPosition.z);
  scene.add(rim);

  // --- Resize ---
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // --- Loop ---
  const updaters = [];
  let running = false;
  let last = performance.now();

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    for (const fn of updaters) fn(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  return {
    THREE, renderer, scene, camera, key,
    onUpdate: (fn) => updaters.push(fn),
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    },
    stop() { running = false; },
    resize,
    dispose() {
      running = false;
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
  };
}
