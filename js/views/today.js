// Dagoverzicht: gegeten vs. doel, per maaltijdmoment.

import * as store from '../store.js';
import { openAddFood, openEntryEditor, openSaveAsMeal } from '../food.js';
import { openMicros } from '../micros.js';
import { weeklyStatus } from '../checks.js';
import { html, segmented, toast } from '../ui.js';
import { icons } from '../icons.js';
import {
  esc, fmt0, fmtG, MOMENTS, MACROS, sumN, macroLine, fmtDayTitle, fmtDateShort, fmtDayShort, addDays, today,
} from '../util.js';

export async function renderToday(root, app) {
  const date = app.date;
  const [entries, { type, goal }, settings, checks, weekly] = await Promise.all([
    store.logForDate(date),
    store.goalsFor(date),
    store.getSettings(),
    store.checksFor(date),
    weeklyStatus(date),
  ]);
  const total = sumN(entries.map((e) => e.n));
  const hasGoal = store.hasGoals(goal);

  root.innerHTML = '';

  // --- Datum-navigatie ---
  const nav = html(`<div class="day-nav">
    <button class="icon-btn" data-d="-1" aria-label="Vorige dag">${icons.left()}</button>
    <label class="day-title">
      <span class="t">${esc(fmtDayTitle(date))}</span>
      <span class="s">${esc(fmtDateShort(date, true))}</span>
      <input type="date" value="${date}" aria-label="Kies datum">
    </label>
    <button class="icon-btn" data-d="1" aria-label="Volgende dag">${icons.right()}</button>
  </div>`);
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (b) app.setDate(addDays(date, Number(b.dataset.d)));
  });
  nav.querySelector('input').addEventListener('change', (e) => e.target.value && app.setDate(e.target.value));
  root.append(nav);
  if (date !== today()) {
    const back = html(`<button class="link center">Terug naar vandaag</button>`);
    back.onclick = () => app.setDate(today());
    root.append(back);
  }

  // --- Trainings- of rustdag ---
  const typeSel = segmented(
    [
      { id: 'training', label: 'Trainingsdag' },
      { id: 'rust', label: 'Rustdag' },
    ],
    type,
    async (id) => {
      await store.setDayType(date, id);
      app.render();
    },
  );
  typeSel.classList.add('day-type');
  root.append(typeSel);

  // --- Samenvatting ---
  const summary = html('<div class="card summary"></div>');
  if (!hasGoal) {
    summary.innerHTML = `
      <div class="kcal-line"><span class="big">${fmt0(total.kcal)}</span> <span class="unit">kcal gegeten</span></div>
      <p class="macro-plain">${macroLine(total)}</p>
      <button class="btn primary block" data-goals>Stel je doelen in</button>
      <button class="link" data-micros>Vitamines en mineralen ${icons.right(14)}</button>`;
    summary.querySelector('[data-goals]').onclick = () => app.go('instellingen');
  } else {
    const left = goal.kcal - total.kcal;
    summary.innerHTML = `
      <div class="kcal-head">
        <div>
          <div class="kcal-line"><span class="big">${fmt0(Math.abs(left))}</span>
          <span class="unit">${left >= 0 ? 'kcal over' : 'kcal te veel'}</span></div>
          <div class="sub">${fmt0(total.kcal)} gegeten · doel ${fmt0(goal.kcal)} (${type === 'training' ? 'training' : 'rust'})</div>
        </div>
        <span class="pct-badge ${status(total.kcal, goal.kcal, KCAL_MARGIN)}">${pct(total.kcal, goal.kcal)}</span>
      </div>
      ${meter(total.kcal, goal.kcal, KCAL_MARGIN)}
      <div class="macros">
        ${MACROS.map((m) => macroRow(m.label, total[m.id], goal[m.id])).join('')}
      </div>
      <div class="summary-foot">
        <span class="sub fiber">Vezels ${fmtG(total.fiber)} g</span>
        <button class="link" data-micros>Vitamines en mineralen ${icons.right(14)}</button>
      </div>`;
  }
  summary.querySelector('[data-micros]').onclick = () => openMicros(date);
  root.append(summary);

  // --- Checklist: supplementen (per dag) en weekchecks (afgelopen 7 dagen) ---
  const supps = settings.supplements;
  const checklist = html(`<div class="card checklist">
    ${supps.length ? `<h3 class="cl-title">Supplementen</h3>
    <div class="supps">${supps.map((s) => suppButton(s, !!checks[s.id])).join('')}</div>` : ''}
    <h3 class="cl-title">Afgelopen 7 dagen</h3>
    ${weekly.map(weekRow).join('')}
  </div>`);
  checklist.addEventListener('click', async (e) => {
    const sb = e.target.closest('[data-supp]');
    if (sb) {
      const on = await store.toggleCheck(date, sb.dataset.supp);
      sb.replaceWith(html(suppButton(supps.find((s) => s.id === sb.dataset.supp), on)));
      return;
    }
    const wb = e.target.closest('[data-week]');
    if (wb) {
      const on = await store.toggleCheck(date, wb.dataset.week);
      const w = weekly.find((x) => x.id === wb.dataset.week);
      toast(on ? `${w.label} afgevinkt` : 'Afvinken ongedaan gemaakt');
      app.render();
    }
  });
  root.append(checklist);

  // --- Maaltijdmomenten ---
  const yesterday = addDays(date, -1);
  const prevEntries = await store.logForDate(yesterday);
  for (const m of MOMENTS) {
    const list = entries.filter((e) => e.moment === m.id);
    const sub = sumN(list.map((e) => e.n));
    const prev = prevEntries.filter((e) => e.moment === m.id);
    const productCount = list.filter((e) => e.kind === 'product').length;
    const card = html(`<div class="card moment">
      <div class="moment-head">
        <h3>${m.label}</h3>
        ${list.length ? `<span class="moment-kcal">${fmt0(sub.kcal)} kcal</span>` : ''}
      </div>
      ${list.length ? `<div class="moment-macros">${macroLine(sub)}</div>` : ''}
      ${list.length ? `<div class="entries">${list.map(entryRow).join('')}</div>` : ''}
      <div class="moment-actions">
        <button class="btn ghost small" data-a="add">${icons.plus(18)} Toevoegen</button>
        ${productCount >= 2 ? `<button class="btn ghost small" data-a="save">${icons.save(18)} Opslaan als maaltijd</button>` : ''}
        ${!list.length && prev.length ? `<button class="btn ghost small" data-a="copy">${icons.copy(18)} Zelfde als gisteren</button>` : ''}
      </div>
    </div>`);
    card.addEventListener('click', async (e) => {
      const entryBtn = e.target.closest('[data-entry]');
      if (entryBtn) return openEntryEditor(list.find((x) => x.id === entryBtn.dataset.entry));
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'add') openAddFood(date, m.id);
      if (a === 'save') openSaveAsMeal(list, '');
      if (a === 'copy') {
        for (const p of prev) {
          const { id, createdAt, n, ...rest } = p;
          await store.addLog({ ...rest, date });
        }
        toast(`${prev.length} ${prev.length === 1 ? 'item' : 'items'} gekopieerd van gisteren`);
        app.render();
      }
    });
    root.append(card);
  }
}

function suppButton(s, on) {
  return `<button class="supp" data-supp="${esc(s.id)}" aria-pressed="${on}">
    <span class="supp-box">${on ? icons.check(16) : ''}</span><span>${esc(s.name)}</span>
  </button>`;
}

function weekRow(w) {
  const sub = w.last
    ? `${w.last.name ? `${w.last.name} · ` : 'Afgevinkt · '}${fmtDayShort(w.last.date)}`
    : 'Nog niet gehad';
  return `<div class="wk-row${w.last ? ' ok' : ''}">
    <span class="wk-status">${w.last ? icons.check(18) : icons.circle(18)}</span>
    <span class="wk-main"><span class="wk-name">${esc(w.label)}</span><span class="wk-sub">${esc(sub)}</span></span>
    <button class="chip small" data-week="${esc(w.id)}" aria-pressed="${w.manual}">${w.manual ? 'Afgevinkt' : 'Afvinken'}</button>
  </div>`;
}

function entryRow(e) {
  const amount = e.label || (e.kind === 'quick' ? '' : `${fmtG(e.amount)} ${e.unit === 'portie' ? (e.amount === 1 ? 'portie' : 'porties') : e.unit}`);
  return `<button class="entry" data-entry="${esc(e.id)}">
    <span class="e-main">
      <span class="e-name">${esc(e.name)}</span>
      <span class="e-sub">${esc([amount, macroLine(e.n)].filter(Boolean).join(' · '))}</span>
    </span>
    <span class="e-kcal">${fmt0(e.n.kcal)}</span>
  </button>`;
}

// Marges rond het doel: binnen de marge is de balk groen, daarboven rood, daaronder blauw.
const KCAL_MARGIN = 0.03;
const MACRO_MARGIN = 0.1;

function status(value, goal, margin) {
  if (!(goal > 0)) return '';
  if (value > goal * (1 + margin)) return 'over';
  if (value >= goal * (1 - margin)) return 'ok';
  return '';
}

function pct(value, goal) {
  return `${fmt0(goal > 0 ? (value / goal) * 100 : 0)}%`;
}

function meter(value, goal, margin) {
  const width = goal > 0 ? Math.min(value / goal, 1) * 100 : 0;
  const st = status(value, goal, margin);
  return `<div class="meter${st ? ` ${st}` : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${Math.round(goal)}" aria-valuenow="${Math.round(value)}">
    <span style="width:${width.toFixed(1)}%"></span>
  </div>`;
}

function macroRow(label, value, goal) {
  if (!(goal > 0)) {
    return `<div class="macro"><div class="macro-top"><span class="name">${label}</span>
      <span class="val">${fmtG(value)} g</span></div><div class="meter empty"><span style="width:0"></span></div></div>`;
  }
  const left = goal - value;
  const st = status(value, goal, MACRO_MARGIN);
  return `<div class="macro">
    <div class="macro-top">
      <span class="name">${label}<span class="mpct ${st}">${pct(value, goal)}</span></span>
      <span class="val"><strong>${fmtG(value)}</strong> / ${fmtG(goal)} g</span>
    </div>
    ${meter(value, goal, MACRO_MARGIN)}
    <div class="macro-left${st === 'over' ? ' over' : ''}">${left >= 0 ? `${fmtG(left)} g over` : `${fmtG(-left)} g te veel`}</div>
  </div>`;
}
