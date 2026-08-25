// ============================================================
// main.js — boot and wiring.
//
// Order matters: clock, then save, then offline resolution, then
// render. The world must be correct before anything is drawn.
// ============================================================

import { newState, migrate } from './core/state.js';
import { serverNow, syncClock } from './core/time.js';
import { resolveOffline } from './core/offline.js';
import { loadLocal, writeLocal, getOrCreatePlayerId } from './core/save.js';
import { resolveModifiers } from './core/modifiers.js';
import { advanceProduction, advanceConstruction, constructionRemaining } from './core/production.js';
import { buildCatalog, startConstruction, cancelConstruction, moveRoom,
         moveCost, canAfford, canPickUp } from './core/build.js';
import { chairStatus, deployFoldingChairs } from './core/sanctuary.js';
import { holdPrayerMeeting, queueCapacity } from './core/prayer.js';
import { recommendSermon, sermonLibrary, unlockSermon, startService,
         canHoldService, serviceProgress, isServiceFinished, finishService,
         sermonPayout } from './core/service.js';
import { createScene } from './render/scene.js';
import { createCameraRig } from './render/camera.js';
import { buildChurch } from './render/church.js';
import { createCrowd } from './render/crowd.js';
import { createSites } from './render/sites.js';
import { createPastor } from './render/pastor.js';
import { preloadModels, loadReport } from './render/models.js';
import { createPlacementTool } from './render/placement.js';
import { installTapHandler } from './render/picking.js';
import { PathCache } from './sim/pathfinding.js';
import { ROOM_BY_ID } from './data/rooms.js';
import { VisitorSystem } from './sim/visitors.js';
import { BUILD_LABEL } from './data/controls.js';
import { ministryCatalog, foundMinistry } from './core/ministry.js';
import { applyProgress, levelProgress } from './core/progression.js';
import { advancePastor, ensurePastor } from './core/pastor.js';
import { todayEvent, grantRehearsalBuff, pendingRehearsal,
         needsOnboarding, setSchedule, selectableDays } from './core/rhythm.js';
import { buildAwayReport, shouldShowAway, pushAwayHistory, awayHistory } from './core/away.js';

const $ = (id) => document.getElementById(id);
const veil = $('veil'), canvas = $('stage'), status = $('status');

const money = (n) => Math.round(n).toLocaleString();
const duration = (ms) => {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.ceil(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.ceil((s % 3600) / 60)}m`;
};

async function boot() {
  const playerId = getOrCreatePlayerId();
  await syncClock(async () => Date.now());

  const saved = loadLocal();
  let state = saved ? migrate(saved.state) : newState(serverNow());

  let awayReport = null;
  if (saved) {
    const resolved = resolveOffline(state, serverNow(), playerId);
    state = resolved.state;
    if (shouldShowAway(resolved.summary)) {
      awayReport = buildAwayReport(resolved.summary, state, awayHistory(state));
      pushAwayHistory(state, awayReport);
    }
  }
  let counter = (saved?.counter || 0) + 1;
  writeLocal(state, counter);

  // Models are optional. If the folder is missing or a file fails,
  // every piece falls back to procedural geometry.
  const models = await preloadModels().catch(() => ({ loaded: 0, failed: 0, total: 0 }));
  if (models.failed) console.warn('[models]', loadReport());

  const sceneApi = createScene(canvas);
  const rig = createCameraRig(sceneApi, state, canvas);
  const church = buildChurch(sceneApi, state);
  const sites = createSites(sceneApi, state);
  ensurePastor(state, playerId);
  const paths = new PathCache().warm(state);
  const visitors = new VisitorSystem(state, paths, playerId);
  const pastor = createPastor(sceneApi, state, playerId);
  const crowd = createCrowd(sceneApi, state, visitors, playerId, (e) => {
    if (e.type === 'conversion') {
      status.textContent = `${e.line}  ${e.scripture}`;
      save();
    } else if (e.type === 'greeting' || e.type === 'farewell') {
      status.textContent = `${e.name}: "${e.text}"`;
    } else if (e.type === 'gift' && e.favor) {
      status.textContent = `${e.name} left ${e.favor} favor.`;
    }
  });

  // ---------- Layout changes ----------
  // Anything that moves a wall must invalidate paths and rebuild
  // meshes, or visitors keep walking to where a room used to be.
  function layoutChanged() {
    paths.invalidate();
    paths.warm(state);
    church.refresh(state);
    crowd.resetSeating();
    pastor.reset();
    visitors.repath();
  }

  // ---------- Placement ----------
  const placement = createPlacementTool(sceneApi, state, {
    onChange(session) {
      const bar = $('place'), why = $('why'), confirm = $('confirm');
      if (!session) {
        bar.classList.remove('on');
        $('confirm').textContent = 'Build';
        return;
      }
      bar.classList.add('on');
      const ok = session.valid;
      const verb = session.mode === 'move' ? 'Move' : 'Build';
      why.textContent = ok ? `Looks good. Tap ${verb}.` : session.reason;
      why.className = ok ? 'good' : 'bad';
      confirm.disabled = !ok;
    },
  });

  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (placement.active) { dragging = true; placement.moveTo(e.clientX, e.clientY); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) placement.moveTo(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });

  // ---------- Build menu ----------
  function renderCatalog() {
    const list = $('catalog');
    list.innerHTML = '';

    // Anything under construction can be called off for a full
    // refund. Nothing is gained by punishing a change of mind.
    for (const site of state.construction || []) {
      const def = ROOM_BY_ID[site.roomId];
      const left = duration(constructionRemaining(site, serverNow()));
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.innerHTML =
        `<span class="nm">${def?.name || site.roomId}</span>` +
        `<span class="price">Cancel</span>` +
        `<span class="meta">Building · ${left} left · full refund</span>`;
      btn.addEventListener('click', () => {
        const res = cancelConstruction(state, site.roomId);
        if (!res.ok) return;
        status.textContent = `${def?.name || site.roomId} called off. ${money(res.refunded.offering || 0)} returned.`;
        layoutChanged();
        renderCatalog();
        save();
      });
      list.appendChild(btn);
    }

    const entries = buildCatalog(state);
    if (!entries.length && !(state.construction || []).length) {
      list.innerHTML = '<p style="opacity:.6;font-size:.78rem">Everything available is already built.</p>';
      return;
    }
    for (const e of entries) {
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.disabled = !e.available;
      const parts = [`${e.footprint[0]}×${e.footprint[1]}`, duration(e.buildS * 1000)];
      if (e.produces) parts.push(`makes ${e.produces}`);
      btn.innerHTML =
        `<span class="nm">${e.name}</span>` +
        `<span class="price"><span class="coin">${money(e.cost.offering || 0)}</span>` +
        (e.cost.favor ? `<br>${e.cost.favor} favor` : '') + `</span>` +
        `<span class="meta">${e.available ? parts.join(' · ') : e.reason}</span>`;
      btn.addEventListener('click', () => {
        $('sheet').classList.remove('open');
        placement.begin(e.id, 'build');
      });
      list.appendChild(btn);
    }
  }

  $('openBuild').addEventListener('click', () => {
    renderCatalog();
    $('sheet').classList.add('open');
  });
  $('closeBuild').addEventListener('click', () => $('sheet').classList.remove('open'));
  $('rotate').addEventListener('click', () => placement.rotate());
  $('cancelPlace').addEventListener('click', () => placement.cancel());
  $('confirm').addEventListener('click', () => {
    const s = placement.session;
    if (!s) return;
    const res = s.mode === 'move'
      ? moveRoom(state, s.roomId, s.x, s.y, s.rot)
      : startConstruction(state, s.roomId, s.x, s.y, s.rot, serverNow());
    if (!res.ok) { $('why').textContent = res.reason; $('why').className = 'bad'; return; }
    placement.cancel();
    layoutChanged();
    save();
  });

  // ---------- Arrange: move what is already built ----------
  function renderArrange() {
    const list = $('arrangeList');
    const cost = moveCost();
    list.innerHTML = '';
    // Everything built can shift, sanctuary included — except
    // while a service is in progress.
    const movable = state.rooms;
    if (!movable.length) {
      list.innerHTML = '<p style="opacity:.6;font-size:.78rem">Nothing built yet to move.</p>';
      return;
    }
    for (const room of movable) {
      const def = ROOM_BY_ID[room.id];
      const affordable = canAfford(state, cost);
      const pickup = canPickUp(state, room.id);
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.disabled = !affordable || !pickup.ok;
      btn.innerHTML =
        `<span class="nm">${def?.name || room.id}</span>` +
        `<span class="price"><span class="coin">${money(cost.offering)}</span></span>` +
        `<span class="meta">${!pickup.ok ? pickup.reason
          : affordable ? 'Drag to a new spot, then tap Move'
          : 'Not enough offering'}</span>`;
      btn.addEventListener('click', () => {
        $('arrangeSheet').classList.remove('open');
        placement.begin(room.id, 'move');
        $('confirm').textContent = 'Move';
      });
      list.appendChild(btn);
    }
  }

  $('openArrange').addEventListener('click', () => {
    renderArrange();
    $('arrangeSheet').classList.add('open');
  });
  $('closeArrange').addEventListener('click', () => $('arrangeSheet').classList.remove('open'));

  // ---------- While You Were Away ----------
  function renderAway(report, { showLedger = false } = {}) {
    if (!report) return;
    $('away-absence').textContent = report.absence + (report.capped ? ' · at capacity' : '');
    $('away-headline').textContent = report.headline || '';
    $('away-headline').style.display = report.headline ? '' : 'none';

    $('away-tally').innerHTML = [
      report.souls ? `<div><b>${money(report.souls)}</b>souls served</div>` : '',
      report.offering ? `<div><b>${money(report.offering)}</b>offering</div>` : '',
      report.favor ? `<div><b>${money(report.favor)}</b>favor</div>` : '',
    ].join('');

    const section = (title, items, cls = '') =>
      items.length
        ? `<section><h3>${title}</h3><ul>${items.map((i) => `<li class="${cls}">${i}</li>`).join('')}</ul></section>`
        : '';

    const body = [];
    if (report.conversion) {
      body.push(`<section><h3>A new creature</h3><ul>` +
        `<li>${report.conversion.line}</li>` +
        `<li class="hint">${report.conversion.scripture}</li></ul></section>`);
    }
    if (report.visitors?.length) body.push(section('Who came by', report.visitors));
    if (report.rooms.length) body.push(section('Finished', report.rooms));
    body.push(section('Ministry', report.served.map((x) => x.text)));
    if (report.waiting.length) body.push(section('Waiting for you', report.waiting));
    if (report.supplies.length) body.push(section('Stores', [report.supplies.join(' · ')]));
    // Unmet needs read as needs, never as losses.
    body.push(section('Still seeking', report.seeking.map((x) =>
      x.suggestion ? `${x.text} <span class="hint">— ${x.suggestion}</span>` : x.text)));
    if (report.rehearsed) body.push(section('The choir', ['Rehearsed while you were out']));

    if (showLedger) {
      const past = awayHistory(state).slice(1);
      body.push(past.length
        ? `<section><h3>Earlier</h3><ul id="ledger">${past.map((h) =>
            `<li>${h.absence} — ${h.souls} souls, ${money(h.offering)} offering</li>`).join('')}</ul></section>`
        : '<section><h3>Earlier</h3><ul id="ledger"><li>Nothing earlier yet.</li></ul></section>');
    }

    $('away-body').innerHTML = body.join('');
    $('away').classList.add('on');
  }

  $('away-close').addEventListener('click', () => $('away').classList.remove('on'));
  $('away-log').addEventListener('click', () =>
    renderAway(awayHistory(state)[0], { showLedger: true }));
  $('reopenAway').addEventListener('click', () => {
    const latest = awayHistory(state)[0];
    if (latest) renderAway(latest, { showLedger: true });
    else status.textContent = 'Nothing has happened while you were away yet.';
  });

  // ---------- Onboarding: choose your week ----------
  async function askForDays() {
    if (!needsOnboarding(state)) return;
    const chosen = { bible_study: 3, choir_rehearsal: 5 };

    const paint = (host, key) => {
      host.innerHTML = '';
      for (const d of selectableDays(state)) {
        const b = document.createElement('button');
        b.className = 'day';
        b.type = 'button';
        b.textContent = d.name.slice(0, 3);
        b.setAttribute('aria-pressed', String(chosen[key] === d.day));
        b.addEventListener('click', () => {
          chosen[key] = d.day;
          paint($('pick-study'), 'bible_study');
          paint($('pick-choir'), 'choir_rehearsal');
          $('welcome-note').textContent =
            chosen.bible_study === chosen.choir_rehearsal
              ? 'Choose two different evenings.' : '';
        });
        host.appendChild(b);
      }
    };
    paint($('pick-study'), 'bible_study');
    paint($('pick-choir'), 'choir_rehearsal');
    $('welcome').classList.add('on');

    await new Promise((resolve) => {
      $('welcome-go').addEventListener('click', () => {
        const res = setSchedule(state, chosen, serverNow(), { first: true });
        if (!res.ok) {
          $('welcome-note').textContent =
            res.reason === 'same_day' ? 'Choose two different evenings.' : 'Pick a weekday.';
          return;
        }
        $('welcome').classList.remove('on');
        save();
        resolve();
      });
    });
  }

  // ---------- Ministries ----------
  function renderMinistries() {
    const list = $('ministries');
    const now = serverNow();
    list.innerHTML = '';
    for (const m of ministryCatalog(state, now)) {
      const btn = document.createElement('button');
      btn.className = 'card' + (m.founded ? ' founded' : '');
      btn.disabled = !m.available;
      const price = m.founded
        ? 'founded'
        : `<span class="coin">${money(m.cost.offering || 0)}</span>` +
          (m.cost.favor ? `<br>${m.cost.favor} favor` : '');
      const detail = m.founded ? m.effects.join(' · ')
        : m.available ? m.effects.join(' · ')
        : (m.needs ? `Needs ${m.needs.join(', ')}` : m.reason) +
          (m.unlocksAt ? ` (level ${m.unlocksAt})` : '');
      btn.innerHTML =
        `<span class="nm">${m.name}</span>` +
        `<span class="price">${price}</span>` +
        `<span class="eff">${detail}</span>`;
      btn.addEventListener('click', () => {
        const res = foundMinistry(state, m.id, serverNow());
        if (!res.ok) return;
        status.textContent = `${res.ministry.name} founded — ${res.effects.join(', ')}`;
        renderMinistries();
        save();
      });
      list.appendChild(btn);
    }
  }

  $('openMinistries').addEventListener('click', () => {
    renderMinistries();
    $('ministrySheet').classList.add('open');
  });
  $('closeMinistries').addEventListener('click', () => $('ministrySheet').classList.remove('open'));

  // ---------- The service ----------
  let chosenSermon = null;

  function renderSermons() {
    const list = $('sermons');
    const now = serverNow();
    const rec = recommendSermon(state, now);
    list.innerHTML = '';
    for (const s of sermonLibrary(state)) {
      const btn = document.createElement('button');
      btn.className = 'card sermon' + (s.id === rec?.sermonId ? ' pick' : '');
      const est = s.unlocked ? sermonPayout(state, s.id, now) : null;
      const mins = Math.round(s.durationS / 60);
      btn.disabled = !s.unlocked && !s.affordable;
      btn.innerHTML =
        `<span class="nm">${s.title}` +
        (s.id === rec?.sermonId ? '<span class="tag">suggested</span>' : '') + `</span>` +
        `<span class="price">${s.unlocked
          ? `<span class="coin">${money(est.offering)}</span><br>${mins} min`
          : `${s.unlock.favor} favor`}</span>` +
        `<span class="verse">${s.scripture}</span>`;
      btn.addEventListener('click', () => {
        if (!s.unlocked) {
          if (!unlockSermon(state, s.id).ok) return;
          renderSermons();
          return;
        }
        chosenSermon = s.id;
        $('sermonSheet').classList.remove('open');
        beginService();
      });
      list.appendChild(btn);
    }
  }

  function beginService() {
    const now = serverNow();
    const id = chosenSermon || recommendSermon(state, now)?.sermonId;
    if (!id) return;
    const res = startService(state, id, now);
    if (!res.ok) { status.textContent = res.reason; return; }
    chosenSermon = null;
    save();
  }

  $('svc-start').addEventListener('click', beginService);
  $('svc-pick').addEventListener('click', () => {
    renderSermons();
    $('sermonSheet').classList.add('open');
  });
  $('closeSermons').addEventListener('click', () => $('sermonSheet').classList.remove('open'));

  function updateService(now) {
    const panel = $('service');
    const running = serviceProgress(state, now);

    if (running) {
      panel.classList.add('on');
      $('svc-why').textContent = running.sermon.title;
      $('svc-verse').textContent = running.sermon.scripture;
      $('svc-start').textContent = `${Math.ceil(running.remainingMs / 1000)}s`;
      $('svc-start').disabled = true;
      $('svc-pick').style.display = 'none';
      if (isServiceFinished(state, now)) {
        // Count who was seated as a bare number rather than as a
        // visitor object — those need figures spawned to walk out,
        // or the changeover happens invisibly.
        const liveSeated = visitors.visitors.filter((v) => v.phase === 'seated').length;
        const standIns = Math.max(0, (state.sanctuary.seated || 0) - liveSeated);

        const out = finishService(state, now, { gradual: true });
        visitors.concludeService(now, { standIns });

        status.textContent =
          `${out.sermon.title} — ${out.congregation} souls, +${money(out.offering)} offering, +${out.favor} favor`;
        save();
      }
      return;
    }

    $('svc-start').disabled = false;
    $('svc-start').textContent = 'Begin service';
    $('svc-pick').style.display = '';

    const can = canHoldService(state, now);
    if (!can.ok) { panel.classList.remove('on'); return; }

    const rec = recommendSermon(state, now);
    if (!rec) { panel.classList.remove('on'); return; }
    panel.classList.add('on');
    $('svc-why').textContent = `${rec.reason} · ${rec.payout.congregation} seated`;
    $('svc-verse').textContent = rec.scripture;
  }

  // ---------- The prayer meeting ----------
  //
  // One Elder serves the whole queue at once. This is why the queue
  // cap is generous: a long queue should read as a reward waiting
  // to be collected, never as a chore.
  function updatePrayer(now) {
    const panel = $('prayer');
    const waiting = state.queue.length;
    const hasRoom = state.rooms.some((r) => r.id === 'prayer_room');

    if (!waiting || !hasRoom) { panel.classList.remove('on'); return; }
    panel.classList.add('on');

    const cap = queueCapacity(state, now);
    $('prayer-waiting').textContent =
      `${waiting} awaiting prayer${waiting >= cap ? ' · room is full' : ''}`;
    $('prayer-go').textContent = `Pray with ${waiting}`;
  }

  $('prayer-go').addEventListener('click', () => {
    const now = serverNow();
    const res = holdPrayerMeeting(state, now);
    if (!res.ok) return;
    $('prayer').classList.remove('on');
    visitors.concludePrayer(now);
    status.textContent =
      `One Elder, ${res.served} souls prayed for. +${money(res.offering)} offering, +${res.favor} favor.`;
    save();
  });

  // ---------- The deacons and the folding chairs ----------
  //
  // Only offered when it would actually help: people waiting in the
  // vestibule, or a full house. Otherwise the prompt is noise.
  function updateChairs(now) {
    const panel = $('chairs');
    const st = chairStatus(state, now);

    // Only show it when there is something to DO. Once the chairs
    // are out, or stored on cooldown, the prompt has no action left
    // and should get out of the way.
    const actionable = st.waiting > 0 &&
      (st.canDeploy || st.reason === 'cannot_afford');
    if (!actionable) { panel.classList.remove('on'); return; }
    panel.classList.add('on');

    $('chairs-waiting').textContent = st.waiting === 1
      ? '1 waiting in the vestibule'
      : `${st.waiting} waiting in the vestibule`;
    $('chairs-go').disabled = !st.canDeploy;
    $('chairs-go').textContent = st.canDeploy
      ? `Bring out ${st.count} chairs · ${money(st.cost)}`
      : `Need ${money(st.cost)} offering`;
  }

  $('chairs-go').addEventListener('click', () => {
    const res = deployFoldingChairs(state, serverNow());
    if (!res.ok) return;
    $('chairs').classList.remove('on');   // done — get out of the way
    status.textContent =
      `The deacons set out ${res.chairs} chairs. ${res.seated} came in from the vestibule.`;
    save();
  });

  // ---------- Tapping visitors ----------
  installTapHandler(canvas, () => (placement.active ? [] : crowd.candidates()), (hit) => {
    visitors.serve(hit.id, serverNow(), { tapped: true });
  });

  // ---------- Today ----------
  function updateToday(now) {
    const panel = $('today');
    const event = todayEvent(state, now);

    // Ordinary days show NOTHING. No neutral badge, no 1.0x.
    if (!event) { panel.classList.remove('on'); return; }

    const banked = pendingRehearsal(state);
    panel.classList.add('on');
    $('today-label').innerHTML = event.label +
      (banked && event.id !== 'choir_rehearsal'
        ? '<span id="rehearsal">rehearsed</span>' : '');
    $('today-verse').textContent = event.scripture;
  }

  // ---------- Loop ----------
  let sinceSave = 0;
  sceneApi.onUpdate((dt) => {
    const now = serverNow();
    const mods = resolveModifiers(state, now);

    advanceProduction(state, now, mods);
    if (advanceConstruction(state, now).length) layoutChanged();

    grantRehearsalBuff(state, now);
    updateToday(now);

    const progress = applyProgress(state);
    if (progress.rank) {
      status.textContent = `${progress.rank.name} — ${progress.rank.blurb}`;
      if (progress.grid) { rig.reset(); layoutChanged(); }
      save();
    } else if (progress.levels.length) {
      status.textContent = `Level ${state.level}`;
      save();
    }

    visitors.update(dt, now);
    crowd.update(dt);
    sites.update(now, rig);

    // The pastor follows the service: he rises when it begins and
    // does not sit back down until the room has cleared.
    const step = advancePastor(state, now, { serviceActive: !!state.sanctuary.service });
    if (step.line) status.textContent = step.line;
    pastor.update(dt, now);

    updateService(now);
    updateChairs(now);
    updatePrayer(now);

    $('p-off').textContent = money(state.currency.offering);
    $('p-fav').textContent = money(state.currency.favor);
    $('p-food').textContent = Math.floor(state.currency.supplies.food || 0);
    $('p-cloth').textContent = Math.floor(state.currency.supplies.clothing || 0);
    const lp = levelProgress(state);
    $('p-lvl').textContent = lp.level;
    $('bar').firstElementChild.style.width = `${Math.round(lp.fraction * 100)}%`;

    if (!state.sanctuary.service) {
      const building = state.construction?.[0];
      status.textContent = building
        ? `Building · ${duration(constructionRemaining(building, now))} left`
        : `${state.sanctuary.seated} in the pews · ${state.queue.length} awaiting prayer`;
    }

    sinceSave += dt;
    if (sinceSave > 5) { sinceSave = 0; save(); }
  });

  function save() {
    state.lastSavedAt = serverNow();
    writeLocal(state, ++counter);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);

  $('turn').addEventListener('click', () => rig.turn());
  $('recenter').addEventListener('click', () => rig.reset());
  $('build').textContent = BUILD_LABEL;

  sceneApi.start();
  veil.classList.add('gone');
  await askForDays();
  if (awayReport) { renderAway(awayReport); save(); }

  window.__church = { state, sceneApi, rig, church, paths, visitors, crowd, placement, sites };
}

boot().catch((err) => {
  console.error(err);
  status.textContent = 'The church could not be opened. Reload to try again.';
  veil.classList.add('gone');
});
