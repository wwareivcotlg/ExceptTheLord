// ============================================================
// visitors.js — the live loop. NO Three.js here.
//
// Headless on purpose: the whole visitor lifecycle can be
// stepped with fake time and asserted without a renderer.
// render/characters.js just reads positions off these objects.
//
// LIFECYCLE
//   walking_in → waiting → serving → leaving → done
//                       ↘ seated (the Word: waits indefinitely)
//                       ↘ queued (counseling: waits for the Elder)
//                       ↘ turned_away → leaving
// ============================================================

import { NEEDS, NEED_BY_ID } from '../data/needs.js';
import { TUNING } from '../data/tuning.js';
import { bucketRng, weightedPick, mulberry32, hash } from '../core/rng.js';
import { castCongregant } from '../core/casting.js';
import { serveNeed, canServe } from '../core/serve.js';
import { seatCapacity, vestibuleCapacity } from '../core/sanctuary.js';
import { resolveModifiers, effectiveVisitorRate, strangerShare } from '../core/modifiers.js';
import { doorAndApproach } from '../core/grid.js';

export const WALK_SPEED = 1.9;        // tiles per second
export const AUTO_SERVE_DELAY = 3.5;  // seconds before a need serves itself
export const SERVE_DURATION = 0.9;
export const MAX_LIVE_VISITORS = 40;

let nextId = 1;

export class VisitorSystem {
  constructor(state, pathCache, playerId = 'local') {
    this.state = state;
    this.paths = pathCache;
    this.playerId = playerId;
    this.visitors = [];
    this.spawnCarry = 0;
    this.elapsed = 0;
    this.events = [];       // drained by the renderer for popups
    this.tick = 0;
  }

  // ---------- Spawning ----------

  /** Visitors per second while the player is watching. */
  spawnRate(atMs) {
    const mods = resolveModifiers(this.state, atMs);
    return (
      (TUNING.BASE_VISITORS_PER_HOUR / 3600) *
      TUNING.LIVE_PRESENCE_MULTIPLIER *
      effectiveVisitorRate(mods)
    );
  }

  spawnOne(atMs) {
    if (this.visitors.length >= MAX_LIVE_VISITORS) return null;
    const rng = bucketRng(`${this.playerId}:live`, this.tick++);
    const need = weightedPick(rng, NEEDS);
    const entrance = this.state.grid.entrance;
    const mods = resolveModifiers(this.state, atMs);

    const v = {
      id: nextId++,
      needId: need.id,
      appearance: castCongregant(this.state, rng),
      isStranger: rng() < strangerShare(mods),
      phase: 'walking_in',
      tile: { ...entrance },
      pos: { x: entrance.x, y: entrance.y },   // grid space, fractional
      path: null,
      leg: 0,
      t: 0,
      wait: 0,
      bornAt: atMs,
    };

    const room = this.state.rooms.find((r) => r.id === need.room);
    if (!room) {
      v.phase = 'turned_away';
      v.reason = 'no_room';
      this.#leave(v);
    } else {
      const path = this.paths.toRoom(this.state, need.room);
      if (!path) {
        v.phase = 'turned_away';
        v.reason = 'unreachable';
        this.#leave(v);
      } else {
        v.path = path;
        v.leg = 0;
      }
    }

    this.visitors.push(v);
    return v;
  }

  // ---------- Update ----------

  update(dt, atMs) {
    this.elapsed += dt;

    this.spawnCarry += this.spawnRate(atMs) * dt;
    while (this.spawnCarry >= 1) {
      this.spawnCarry -= 1;
      this.spawnOne(atMs);
    }

    for (const v of this.visitors) this.#step(v, dt, atMs);
    this.visitors = this.visitors.filter((v) => v.phase !== 'done');
    return this.visitors;
  }

  #step(v, dt, atMs) {
    switch (v.phase) {
      case 'walking_in':
      case 'leaving':
        if (this.#advance(v, dt)) {
          if (v.phase === 'leaving') v.phase = 'done';
          else this.#arrive(v, atMs);
        }
        break;

      case 'waiting':
        v.wait += dt;
        if (v.wait >= AUTO_SERVE_DELAY) this.serve(v.id, atMs, { tapped: false });
        break;

      case 'serving':
        v.t += dt;
        if (v.t >= SERVE_DURATION) this.#leave(v);
        break;

      // seated and queued wait indefinitely — by design.
      default:
        break;
    }
  }

  /** Walk along the current path. Returns true on arrival. */
  #advance(v, dt) {
    if (!v.path || v.path.length < 2) return true;
    let remaining = WALK_SPEED * dt;
    while (remaining > 0) {
      const from = v.path[v.leg];
      const to = v.path[v.leg + 1];
      if (!to) return true;
      const segLen = Math.abs(to.x - from.x) + Math.abs(to.y - from.y) || 1;
      const step = Math.min(remaining, segLen - v.t);
      v.t += step;
      remaining -= step;
      const f = Math.min(1, v.t / segLen);
      v.pos.x = from.x + (to.x - from.x) * f;
      v.pos.y = from.y + (to.y - from.y) * f;
      if (v.t >= segLen) {
        v.leg += 1;
        v.t = 0;
        if (v.leg >= v.path.length - 1) {
          v.pos.x = v.path[v.path.length - 1].x;
          v.pos.y = v.path[v.path.length - 1].y;
          return true;
        }
      }
    }
    return false;
  }

  /** Reached the room door. Decide what happens next. */
  #arrive(v, atMs) {
    const need = NEED_BY_ID[v.needId];
    const s = this.state;

    if (need.kind === 'seat') {
      if (s.sanctuary.seated < seatCapacity(s)) {
        s.sanctuary.seated += 1;
        v.phase = 'seated';
        this.events.push({ type: 'seated', id: v.id });
      } else if ((s.sanctuary.vestibule || 0) < vestibuleCapacity(s, atMs)) {
        s.sanctuary.vestibule = (s.sanctuary.vestibule || 0) + 1;
        v.phase = 'vestibule';
        this.events.push({ type: 'vestibule', id: v.id });
      } else {
        v.phase = 'turned_away';
        v.reason = 'full';
        this.#leave(v);
      }
      return;
    }

    if (need.kind === 'queue') {
      const cap = TUNING.COUNSEL_QUEUE_CAP + resolveModifiers(s, atMs).queue_capacity;
      if (s.queue.length < cap) {
        s.queue.push({ needId: need.id, arrivedAt: atMs, visitorId: v.id });
        v.phase = 'queued';
        this.events.push({ type: 'queued', id: v.id });
      } else {
        v.phase = 'turned_away';
        v.reason = 'queue_full';
        this.#leave(v);
      }
      return;
    }

    // Material need: wait a beat so the player has a chance to tap.
    v.phase = 'waiting';
    v.wait = 0;
  }

  /** Serve a visitor now. Tapping routes here. */
  serve(id, atMs, { tapped = false } = {}) {
    const v = this.visitors.find((x) => x.id === id);
    if (!v || v.phase !== 'waiting') return { ok: false, reason: 'not_waiting' };

    const result = serveNeed(this.state, v.needId, atMs, { tapped });
    if (!result.ok) {
      v.phase = 'turned_away';
      v.reason = result.reason;
      this.events.push({ type: 'turned_away', id: v.id, reason: result.reason });
      this.#leave(v);
      return result;
    }

    v.phase = 'serving';
    v.t = 0;
    v.payout = result;
    this.events.push({ type: 'served', id: v.id, ...result, at: { ...v.pos } });
    return result;
  }

  /** Everyone leaves the way they came. */
  #leave(v) {
    const entrance = this.state.grid.entrance;
    const back = v.path ? [...v.path].reverse() : [{ ...v.tile }, { ...entrance }];
    v.path = back.length >= 2 ? back : [{ x: v.pos.x, y: v.pos.y }, { ...entrance }];
    v.leg = 0;
    v.t = 0;
    v.phase = 'leaving';
  }

  /** Whether a tap on this visitor would do anything. */
  isTappable(v) {
    return v.phase === 'waiting' && canServe(this.state, v.needId).ok;
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Called when the layout changes — walkers need fresh routes. */
  repath() {
    for (const v of this.visitors) {
      if (v.phase !== 'walking_in') continue;
      const need = NEED_BY_ID[v.needId];
      const path = this.paths.toRoom(this.state, need.room);
      if (path) { v.path = path; v.leg = 0; v.t = 0; }
    }
  }
}
