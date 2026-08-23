// ============================================================
// bubble.js — the thought bubble above a visitor's head.
//
// Icons are drawn with canvas paths rather than emoji: emoji
// render inconsistently across Android web views, and a need the
// player can't read is a need they can't serve.
//
// One texture per need, built once and shared by every sprite.
// ============================================================

import * as THREE from 'three';
import { PALETTE } from './palette.js';

const SIZE = 128;
const textures = new Map();

const INK = '#221C14';
const CARD = '#F5EFE2';

/** Simple, high-contrast glyphs — readable at thumbnail scale. */
const ICONS = {
  food(c) {                       // a bowl with steam
    c.beginPath();
    c.arc(64, 74, 26, 0, Math.PI);
    c.fill();
    c.fillRect(34, 70, 60, 6);
    c.lineWidth = 5;
    c.lineCap = 'round';
    for (const x of [52, 64, 76]) {
      c.beginPath();
      c.moveTo(x, 50);
      c.quadraticCurveTo(x + 7, 42, x, 34);
      c.stroke();
    }
  },
  clothing(c) {                   // a shirt
    c.beginPath();
    c.moveTo(44, 40); c.lineTo(56, 34); c.lineTo(72, 34); c.lineTo(84, 40);
    c.lineTo(92, 54); c.lineTo(80, 60); c.lineTo(80, 92);
    c.lineTo(48, 92); c.lineTo(48, 60); c.lineTo(36, 54);
    c.closePath(); c.fill();
  },
  baptism(c) {                    // a water drop
    c.beginPath();
    c.moveTo(64, 30);
    c.bezierCurveTo(90, 60, 88, 92, 64, 92);
    c.bezierCurveTo(40, 92, 38, 60, 64, 30);
    c.closePath(); c.fill();
  },
  counseling(c) {                 // a heart
    c.beginPath();
    c.moveTo(64, 92);
    c.bezierCurveTo(24, 66, 34, 34, 64, 50);
    c.bezierCurveTo(94, 34, 104, 66, 64, 92);
    c.closePath(); c.fill();
  },
  word(c) {                       // an open book
    c.beginPath();
    c.moveTo(64, 44); c.lineTo(34, 36); c.lineTo(34, 84); c.lineTo(64, 92);
    c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(64, 44); c.lineTo(94, 36); c.lineTo(94, 84); c.lineTo(64, 92);
    c.closePath(); c.fill();
    c.strokeStyle = CARD; c.lineWidth = 3;
    c.beginPath(); c.moveTo(64, 46); c.lineTo(64, 90); c.stroke();
  },
};

function drawBubble(needId, tone) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const c = canvas.getContext('2d');

  // Card
  c.fillStyle = CARD;
  roundRect(c, 8, 8, 112, 96, 22);
  c.fill();

  // Tail
  c.beginPath();
  c.moveTo(54, 100); c.lineTo(64, 124); c.lineTo(76, 100);
  c.closePath(); c.fill();

  // Border in the tone colour: gold when serveable, muted when not.
  c.strokeStyle = tone;
  c.lineWidth = 6;
  roundRect(c, 8, 8, 112, 96, 22);
  c.stroke();

  c.fillStyle = INK;
  c.strokeStyle = INK;
  c.save();
  c.translate(0, -6);
  ICONS[needId]?.(c);
  c.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function textureFor(needId, serveable) {
  const key = `${needId}:${serveable ? 'ok' : 'no'}`;
  if (!textures.has(key)) {
    const tone = serveable ? '#B87A00' : '#9A8E7C';
    textures.set(key, drawBubble(needId, tone));
  }
  return textures.get(key);
}

/** A bubble sprite that follows one visitor. */
export function createBubble(needId, serveable = true) {
  const material = new THREE.SpriteMaterial({
    map: textureFor(needId, serveable),
    transparent: true,
    depthTest: false,      // always legible, even behind a pew
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.62, 0.62, 1);
  sprite.renderOrder = 10;
  sprite.userData.needId = needId;
  sprite.userData.serveable = serveable;
  return sprite;
}

export function setBubbleState(sprite, serveable) {
  if (sprite.userData.serveable === serveable) return;
  sprite.userData.serveable = serveable;
  sprite.material.map = textureFor(sprite.userData.needId, serveable);
  sprite.material.needsUpdate = true;
}

/** Floating "+12" that rises and fades when a need is met. */
export function createPayoutPopup(text, color = PALETTE.gold) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const c = canvas.getContext('2d');
  c.font = 'bold 62px Archivo, system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = 8;
  c.strokeStyle = 'rgba(34,28,20,.85)';
  c.strokeText(text, 128, 48);
  c.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  c.fillText(text, 128, 48);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthTest: false,
  }));
  sprite.scale.set(1.3, 0.5, 1);
  sprite.renderOrder = 12;
  sprite.userData.life = 0;
  return sprite;
}

/** Advance a popup. Returns false when it should be removed. */
export function stepPopup(sprite, dt) {
  sprite.userData.life += dt;
  const t = sprite.userData.life;
  sprite.position.y += dt * 0.9;
  sprite.material.opacity = Math.max(0, 1 - t / 1.2);
  return t < 1.2;
}
