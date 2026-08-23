// ============================================================
// scene.js — renderer, lights, resize, loop.
// Three.js r128.
// ============================================================

import * as THREE from 'three';
import { PALETTE, LIGHTING, QUALITY } from './palette.js';

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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyTop);
  scene.fog = new THREE.Fog(PALETTE.skyBottom, 40, 90);

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
