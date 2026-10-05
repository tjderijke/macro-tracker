// Dagoverzicht: gegeten vs. doel, per maaltijdmoment.

import * as store from '../store.js';
import { openAddFood, openEntryEditor, openSaveAsMeal } from '../food.js';
import { html, segmented, toast } from '../ui.js';
import { icons } from '../icons.js';
import {
  esc, fmt0, fmtG, MOMENTS, MACROS, sumN, macroLine, fmtDayTitle, fmtDateShort, addDays, today,
} from '../util.js';

export async function renderToday(root, app) {
  const date = app.date;
  const [entries, { type, goal }] = await Promise.all([store.logForDate(date), store.goalsFor(date)]);
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
      <button class="btn primary block" data-goals>Stel je doelen in</button>`;
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
      </div>
      ${meter(total.kcal, goal.kcal)}
      <div class="macros">
        ${MACROS.map((m) => macroRow(m.label, total[m.id], goal[m.id])).join('')}
      </div>
      <div class="sub fiber">Vezels ${fmtG(total.fiber)} g</div>`;
  }
  root.append(summary);

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

function meter(value, goal) {
  const pct = goal > 0 ? Math.min(value / goal, 1) * 100 : 0;
  const over = goal > 0 && value > goal;
  return `<div class="meter${over ? ' over' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${Math.round(goal)}" aria-valuenow="${Math.round(value)}">
    <span style="width:${pct.toFixed(1)}%"></span>
  </div>`;
}

function macroRow(label, value, goal) {
  if (!(goal > 0)) {
    return `<div class="macro"><div class="macro-top"><span class="name">${label}</span>
      <span class="val">${fmtG(value)} g</span></div><div class="meter empty"><span style="width:0"></span></div></div>`;
  }
  const left = goal - value;
  return `<div class="macro">
    <div class="macro-top">
      <span class="name">${label}</span>
      <span class="val"><strong>${fmtG(value)}</strong> / ${fmtG(goal)} g</span>
    </div>
    ${meter(value, goal)}
    <div class="macro-left${left < 0 ? ' over' : ''}">${left >= 0 ? `${fmtG(left)} g over` : `${fmtG(-left)} g te veel`}</div>
  </div>`;
}
