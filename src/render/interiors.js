// ============================================================
// interiors.js — what stands inside a built room.
//
// Furniture is declared in data/furniture.js in NORMALIZED room
// space, so a piece stays where it belongs whatever the room's
// size or rotation. This module only turns those numbers into
// boxes.
// ============================================================

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { FURNITURE } from '../data/furniture.js';
import { roundedBox } from './shapes.js';
import { hasModel, instantiate } from './models.js';
import { PIECE_MODELS } from '../data/models.js';

const cache = new Map();
function materialFor(key) {
  if (!cache.has(key)) {
    const color = PALETTE[key] ?? PALETTE.wood;
    cache.set(key, key === 'water'
      ? new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.78 })
      : new THREE.MeshLambertMaterial({ color }));
  }
  return cache.get(key);
}

/**
 * Furnish a room group.
 * @param {THREE.Group} group the room, centred on its own origin
 * @param {string} roomId
 * @param {{w:number,d:number}} size world size after rotation
 * @returns {number} pieces added
 */
export function buildInterior(group, roomId, size) {
  const pieces = FURNITURE[roomId];
  if (!pieces?.length) return 0;

  for (const piece of pieces) {
    const w = piece.w * size.w;
    const d = piece.d * size.d;
    const h = piece.h;
    const baseY = piece.y !== undefined ? piece.y : 0.06;

    // A real model if one is mapped and loaded; otherwise the box.
    const modelId = PIECE_MODELS[piece.id];
    if (modelId && hasModel(modelId)) {
      const obj = instantiate(modelId);
      obj.position.set(piece.x * size.w, baseY, piece.z * size.d);
      obj.name = piece.id;
      group.add(obj);
      continue;
    }

    // Rounded rather than boxy — the same reason the figures are.
    const r = Math.min(0.05, Math.min(w, h, d) * 0.28);
    const mesh = new THREE.Mesh(roundedBox(w, h, d, r, 1), materialFor(piece.material));
    mesh.position.set(piece.x * size.w, baseY + h / 2, piece.z * size.d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = piece.id;
    group.add(mesh);
  }
  return pieces.length;
}
