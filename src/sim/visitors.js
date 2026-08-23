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
import { seatCapacity, vestibuleCapacity, seatPerson, unseatPerson,
         refillStep } from '../core/sanctuary.js';
import { resolveModifiers, effectiveVisitorRate, strangerShare } from '../core/modifiers.js';
import { doorAndApproach } from '../core/grid.js';
import { findPath } from './pathfinding.js';
import { ROOM_BY_ID } from '../data/rooms.js';
import { dueCharacters, makeArrival, markArrived, onServed } from '../core/characters.js';

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

  /**
   * Named characters come first when they are due. They are people,
   * not random draws, so they take priority over anonymous arrivals.
   */
  spawnDueCharacters(atMs) {
    const spawned = [];
    for (const id of dueCharacters(this.state, atMs)) {
      if (this.visitors.length >= MAX_LIVE_VISITORS) break;
      if (this.visitors.some((v) => v.characterId === id)) continue;   // already inside
      const arrival = makeArrival(this.state, id, atMs);
      markArrived(this.state, id, atMs);
      const v = this.#spawn(atMs, NEED_BY_ID[arrival.needId], arrival);
      if (v) spawned.push(v);
    }
    return spawned;
  }

  spawnOne(atMs) {
    if (this.visitors.length >= MAX_LIVE_VISITORS) return null;
    const rng = bucketRng(`${this.playerId}:live`, this.tick++);
    const need = weightedPick(rng, NEEDS);
    const mods = resolveModifiers(this.state, atMs);
    return this.#spawn(atMs, need, {
      appearance: castCongregant(this.state, rng),
      isStranger: rng() < strangerShare(mods),
    });
  }

  /** Shared arrival path for anonymous visitors and named characters. */
  #spawn(atMs, need, extra = {}) {
    if (!need) return null;
    const entrance = this.state.grid.entrance;

    const v = {
      id: nextId++,
      needId: need.id,
      appearance: extra.appearance,
      isStranger: extra.isStranger ?? true,
      characterId: extra.characterId ?? null,
      name: extra.name ?? null,
      display: extra.display ?? extra.name ?? null,
      title: extra.title ?? null,
      greeting: extra.greeting ?? null,
      askingBaptism: extra.askingBaptism ?? false,
      phase: 'walking_in',
      tile: { ...entrance },
      pos: { x: entrance.x, y: entrance.y },
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
    if (v.characterId && v.greeting) {
      this.events.push({ type: 'greeting', id: v.id,
                         name: v.display || v.name, text: v.greeting });
    }
    return v;
  }

  // ---------- Update ----------

  update(dt, atMs) {
    this.elapsed += dt;

    this.spawnDueCharacters(atMs);
    this.#refillPews(atMs);

    this.spawnCarry += this.spawnRate(atMs) * dt;
    while (this.spawnCarry >= 1) {
      this.spawnCarry -= 1;
      this.spawnOne(atMs);
    }

    for (const v of this.visitors) this.#step(v, dt, atMs);
    this.visitors = this.visitors.filter((v) => v.phase !== 'done');
    return this.visitors;
  }

  /**
   * The vestibule files in one at a time. A live visitor waiting
   * outside takes the seat if there is one waiting; otherwise the
   * count moves and a stand-in appears.
   */
  #refillPews(atMs) {
    if (!refillStep(this.state, atMs)) return;
    const waiting = this.visitors.find((v) => v.phase === 'vestibule');
    if (!waiting) return;
    // refillStep already adjusted the counts — just claim a seat.
    const taken = new Set(this.visitors.filter((x) => x.seatIndex !== undefined)
                                       .map((x) => x.seatIndex));
    let slot = 0;
    while (taken.has(slot)) slot++;
    waiting.seatIndex = slot;
    waiting.phase = 'seated';
    this.events.push({ type: 'seated', id: waiting.id, seatIndex: slot });
  }

  /**
   * Service is over. The congregation processes out and the pews
   * are left for whoever is waiting outside.
   *
   * @param {number} standIns people seated as counts rather than as
   *   visitor objects — they need figures spawned to walk out, or
   *   the changeover is invisible.
   */
  concludeService(atMs, { standIns = 0 } = {}) {
    const dismissed = [];
    for (const v of [...this.visitors]) {
      if (v.phase !== 'seated') continue;
      // The count was already cleared by finishService, so do NOT
      // let #leave decrement it a second time.
      delete v.seatIndex;
      v.category = null;
      this.#leave(v);
      dismissed.push(v.id);
    }

    const procession = Math.min(standIns, TUNING.MAX_PROCESSION);
    for (let i = 0; i < procession; i++) this.#spawnDeparting(atMs, i);

    return { dismissed: dismissed.length, procession };
  }

  /** A figure that appears at the sanctuary door and walks out. */
  #spawnDeparting(atMs, seed = 0) {
    if (this.visitors.length >= MAX_LIVE_VISITORS) return null;
    const room = this.state.rooms.find((r) => r.id === 'sanctuary');
    if (!room) return null;
    const { approach } = doorAndApproach(room.id, room.x, room.y, room.rot || 0);
    const path = this.paths.toRoom(this.state, 'sanctuary');
    if (!path) return null;

    const rng = bucketRng(`${this.playerId}:out`, this.tick++ + seed);
    const v = {
      id: nextId++,
      needId: 'word',
      appearance: castCongregant(this.state, rng),
      isStranger: false,
      characterId: null,
      phase: 'leaving',
      tile: { ...approach },
      pos: { x: approach.x, y: approach.y },
      path: [...path].reverse(),
      leg: 0,
      t: 0,
      wait: 0,
      bornAt: atMs,
      departing: true,
    };
    this.visitors.push(v);
    return v;
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
        // Claim the lowest free slot so the renderer can sit them
        // in a specific place rather than guessing from a count.
        const taken = new Set(this.visitors.filter((x) => x.seatIndex !== undefined)
                                           .map((x) => x.seatIndex));
        let slot = 0;
        while (taken.has(slot)) slot++;
        v.seatIndex = slot;
        v.category = seatPerson(s, v);
        v.phase = 'seated';
        this.events.push({ type: 'seated', id: v.id, seatIndex: slot });
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

    // Named characters bring something with them, and one of them
    // is on a journey.
    if (v.characterId) {
      const extra = onServed(this.state, v.characterId, atMs, { needId: v.needId });
      if (extra.conversion) {
        v.name = extra.conversion.name;
        v.display = extra.conversion.name;
        this.events.push({ type: 'conversion', id: v.id, at: { ...v.pos }, ...extra.conversion });
      }
      if (extra.gift) this.events.push({ type: 'gift', id: v.id, name: v.display || v.name, ...extra.gift });
      if (extra.farewell) this.events.push({ type: 'farewell', id: v.id, name: v.display || v.name, text: extra.farewell });
    }
    return result;
  }

  /**
   * Everyone leaves from WHERE THEY ARE.
   *
   * This used to reverse the path they arrived on, which is only
   * correct while the church stands still. After a room moves, that
   * remembered route starts at a door that is no longer there.
   */
  #leave(v) {
    if (v.seatIndex !== undefined) {
      unseatPerson(this.state, v.category);
      delete v.seatIndex;
    }
    v.path = this.#exitFrom(v.pos);
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

  /**
   * A room moved. Everyone mid-journey needs re-routing.
   *
   * This used to only fix visitors in 'walking_in'. Everyone else
   * kept stale state: someone WAITING stood where the door used to
   * be, someone LEAVING walked a route that no longer existed, and
   * #leave() rebuilt its exit by reversing a remembered path — so a
   * dismissed worshipper would jump back to the old door and walk
   * out from there.
   *
   * @returns {{rerouted, resent, stranded}}
   */
  repath() {
    const out = { rerouted: 0, resent: 0, stranded: 0 };

    for (const v of this.visitors) {
      const need = NEED_BY_ID[v.needId];

      switch (v.phase) {
        case 'walking_in': {
          const path = this.paths.toRoom(this.state, need.room);
          if (path) { v.path = path; v.leg = 0; v.t = 0; out.rerouted += 1; }
          else { v.reason = 'unreachable'; this.#leave(v); out.stranded += 1; }
          break;
        }

        case 'waiting': {
          // The door moved. Walk to where it is now rather than
          // being served from empty floor.
          const path = this.paths.toRoom(this.state, need.room);
          if (!path) { v.reason = 'unreachable'; this.#leave(v); out.stranded += 1; break; }
          const target = path[path.length - 1];
          if (target.x !== v.pos.x || target.y !== v.pos.y) {
            v.path = this.#routeFrom(v.pos, path);
            v.leg = 0; v.t = 0;
            v.phase = 'walking_in';
            v.wait = 0;
            out.resent += 1;
          }
          break;
        }

        case 'leaving': {
          // Head for the door from wherever they actually are.
          v.path = this.#exitFrom(v.pos);
          v.leg = 0; v.t = 0;
          out.rerouted += 1;
          break;
        }

        // Seated, queued and vestibule visitors are not walking, so
        // they simply re-place. Their EXIT route is built fresh in
        // #leave(), which no longer reverses a remembered path.
        default:
          break;
      }
    }
    return out;
  }

  /**
   * A route from an arbitrary position to the end of a known path.
   * Falls back to the entrance-to-room route if the walker is not
   * standing anywhere useful.
   */
  #routeFrom(pos, path) {
    const from = { x: Math.round(pos.x), y: Math.round(pos.y) };
    const goal = path[path.length - 1];
    const direct = findPath(this.state, this.paths.occupancy(this.state), from, goal);
    return direct && direct.length >= 2 ? direct : path;
  }

  /** A route from where someone stands to the front door. */
  #exitFrom(pos) {
    const from = { x: Math.round(pos.x), y: Math.round(pos.y) };
    const entrance = this.state.grid.entrance;
    const direct = findPath(this.state, this.paths.occupancy(this.state), from, entrance);
    return direct && direct.length >= 2 ? direct : [from, { ...entrance }];
  }
}
