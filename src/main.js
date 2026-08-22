// ============================================================
// main.js — boot.
//
// Order matters: clock, then save, then offline resolution, then
// render. The world must be correct before anything is drawn.
// ============================================================

import { newState, migrate } from './core/state.js';
import { serverNow, syncClock } from './core/time.js';
import { resolveOffline } from './core/offline.js';
import { loadLocal, writeLocal, getOrCreatePlayerId } from './core/save.js';
import { createScene } from './render/scene.js';
import { createCameraRig } from './render/camera.js';
import { buildChurch } from './render/church.js';
import { createCrowd } from './render/crowd.js';
import { installTapHandler } from './render/picking.js';
import { PathCache } from './sim/pathfinding.js';
import { BUILD } from './data/controls.js';
import { VisitorSystem } from './sim/visitors.js';

const veil = document.getElementById('veil');
const canvas = document.getElementById('stage');
const status = document.getElementById('status');

async function boot() {
  const playerId = getOrCreatePlayerId();
  await syncClock(async () => Date.now());

  const saved = loadLocal();
  let state = saved ? migrate(saved.state) : newState(serverNow());

  let away = null;
  if (saved) {
    const resolved = resolveOffline(state, serverNow(), playerId);
    state = resolved.state;
    away = resolved.summary;
  }
  let counter = (saved?.counter || 0) + 1;
  writeLocal(state, counter);

  const sceneApi = createScene(canvas);
  const rig = createCameraRig(sceneApi, state, canvas);
  const church = buildChurch(sceneApi, state);
  const paths = new PathCache().warm(state);
  const visitors = new VisitorSystem(state, paths, playerId);
  const crowd = createCrowd(sceneApi, state, visitors);

  installTapHandler(canvas, crowd.candidates, (hit) => {
    visitors.serve(hit.id, serverNow(), { tapped: true });
  });

  let sinceSave = 0;
  sceneApi.onUpdate((dt) => {
    visitors.update(dt, serverNow());
    crowd.update(dt);

    sinceSave += dt;
    if (sinceSave > 5) {
      sinceSave = 0;
      state.lastSavedAt = serverNow();
      writeLocal(state, ++counter);
    }
    status.textContent =
      `${state.currency.offering} offering · ${state.currency.favor} favor · ` +
      `${state.sanctuary.seated}/${state.rooms.find(r => r.id === 'sanctuary')?.seats ?? 0} in the pews · ` +
      `${visitors.visitors.length} inside`;
  });

  const flush = () => { state.lastSavedAt = serverNow(); writeLocal(state, ++counter); };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);

  document.getElementById('turn')?.addEventListener('click', () => rig.turn());
  document.getElementById('recenter')?.addEventListener('click', () => rig.reset());

  const stamp = document.getElementById('build');
  if (stamp) stamp.textContent = BUILD;

  sceneApi.start();
  veil.classList.add('gone');

  if (away?.offering) {
    status.textContent = `While you were away: +${away.offering} offering, ${state.sanctuary.seated} waiting in the pews`;
  }

  window.__church = { state, sceneApi, rig, church, paths, visitors, crowd };
}

boot().catch((err) => {
  console.error(err);
  status.textContent = 'The church could not be opened. Reload to try again.';
  veil.classList.add('gone');
});
