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
import { buildCatalog, startConstruction, cancelConstruction } from './core/build.js';
import { recommendSermon, sermonLibrary, unlockSermon, startService,
         canHoldService, serviceProgress, isServiceFinished, finishService,
         sermonPayout } from './core/service.js';
import { createScene } from './render/scene.js';
import { createCameraRig } from './render/camera.js';
import { buildChurch } from './render/church.js';
import { createCrowd } from './render/crowd.js';
import { createSites } from './render/sites.js';
import { createPlacementTool } from './render/placement.js';
import { installTapHandler } from './render/picking.js';
import { PathCache } from './sim/pathfinding.js';
import { VisitorSystem } from './sim/visitors.js';
import { BUILD } from './data/controls.js';
import { ministryCatalog, foundMinistry } from './core/ministry.js';
import { applyProgress, levelProgress } from './core/progression.js';
import { todayEvent, nextSpecialDay, grantRehearsalBuff, pendingRehearsal,
         needsOnboarding, setSchedule, selectableDays, getSchedule } from './core/rhythm.js';
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

  const sceneApi = createScene(canvas);
  const rig = createCameraRig(sceneApi, state, canvas);
  const church = buildChurch(sceneApi, state);
  const sites = createSites(sceneApi, state);
  const paths = new PathCache().warm(state);
  const visitors = new VisitorSystem(state, paths, playerId);
  const crowd = createCrowd(sceneApi, state, visitors);

  // ---------- Layout changes ----------
  // Anything that moves a wall must invalidate paths and rebuild
  // meshes, or visitors keep walking to where a room used to be.
  function layoutChanged() {
    paths.invalidate();
    paths.warm(state);
    church.refresh(state);
    visitors.repath();
  }

  // ---------- Placement ----------
  const placement = createPlacementTool(sceneApi, state, {
    onChange(session) {
      const bar = $('place'), why = $('why'), confirm = $('confirm');
      if (!session) { bar.classList.remove('on'); return; }
      bar.classList.add('on');
      const ok = session.valid;
      why.textContent = ok ? 'Looks good. Tap Build.' : session.reason;
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
    const entries = buildCatalog(state);
    if (!entries.length) {
      list.innerHTML = '<p style="opacity:.6;font-size:.78rem">Everything available is already built.</p>';
      return;
    }
    list.innerHTML = '';
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
    const res = startConstruction(state, s.roomId, s.x, s.y, s.rot, serverNow());
    if (!res.ok) { $('why').textContent = res.reason; $('why').className = 'bad'; return; }
    placement.cancel();
    layoutChanged();
    save();
  });

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
        const out = finishService(state, now);
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
    updateService(now);

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
  $('build').textContent = BUILD;

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
