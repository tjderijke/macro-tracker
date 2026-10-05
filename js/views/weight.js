// Gewicht: invoeren en het verloop door de tijd bekijken.

import * as store from '../store.js';
import { weightChart } from '../chart.js';
import { html, segmented, toast, confirmDialog, selectOnFocus } from '../ui.js';
import { icons } from '../icons.js';
import { esc, fmt1, fmtDateShort, parseNum, numToInput, today, addDays } from '../util.js';

const RANGES = [
  { id: '30', label: '1 mnd', days: 30 },
  { id: '90', label: '3 mnd', days: 90 },
  { id: '365', label: '1 jaar', days: 365 },
  { id: 'all', label: 'Alles', days: null },
];

export async function renderWeight(root, app) {
  const all = await store.weights();
  const rangeId = app.weightRange || '90';
  const range = RANGES.find((r) => r.id === rangeId);
  const from = range.days ? addDays(today(), -range.days) : '0000-00-00';
  const shown = all.filter((w) => w.date >= from);
  const last = all.at(-1);
  const todays = all.find((w) => w.date === today());

  root.innerHTML = '';
  root.append(html(`<header class="view-head"><h1>Gewicht</h1></header>`));

  // --- Invoer ---
  const form = html(`<form class="card weigh-in">
    <div class="two-col">
      <label class="field"><span class="field-label">Datum</span>
        <input type="date" name="date" value="${today()}" max="${today()}"></label>
      <label class="field"><span class="field-label">Gewicht (kg)</span>
        <input name="kg" inputmode="decimal" placeholder="${last ? esc(numToInput(last.kg)) : 'bijv. 80,5'}" value="${todays ? esc(numToInput(todays.kg)) : ''}"></label>
    </div>
    <button class="btn primary block" type="submit">Opslaan</button>
  </form>`);
  selectOnFocus(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kg = parseNum(form.kg.value);
    const date = form.date.value || today();
    if (!(kg > 20 && kg < 400)) return toast('Vul een geldig gewicht in kg in.', { error: true });
    await store.saveWeight(date, Math.round(kg * 10) / 10);
    form.kg.blur();
    toast('Gewicht opgeslagen');
    app.render();
  });
  form.date.addEventListener('change', () => {
    const w = all.find((x) => x.date === form.date.value);
    form.kg.value = w ? numToInput(w.kg) : '';
  });
  root.append(form);

  // --- Kerncijfers ---
  if (shown.length) {
    const first = shown[0];
    const end = shown.at(-1);
    const diff = end.kg - first.kg;
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
    root.append(
      html(`<div class="stats">
        <div class="stat"><span class="label">Huidig</span><span class="value">${fmt1(last.kg)} kg</span><span class="sub">${esc(fmtDateShort(last.date))}</span></div>
        <div class="stat"><span class="label">Verschil</span><span class="value">${sign}${fmt1(Math.abs(diff))} kg</span><span class="sub">sinds ${esc(fmtDateShort(first.date))}</span></div>
        <div class="stat"><span class="label">Laagst / hoogst</span><span class="value small">${fmt1(Math.min(...shown.map((w) => w.kg)))} / ${fmt1(Math.max(...shown.map((w) => w.kg)))}</span><span class="sub">in deze periode</span></div>
      </div>`),
    );
  }

  // --- Grafiek ---
  const chartCard = html(`<div class="card chart-card"><h2 class="card-title">Verloop</h2></div>`);
  const rangeSel = segmented(RANGES, rangeId, (id) => {
    app.weightRange = id;
    app.render();
  }, { small: true });
  chartCard.append(rangeSel);
  const chartHost = html('<div class="chart-host"></div>');
  chartCard.append(chartHost);
  root.append(chartCard);
  requestAnimationFrame(() => weightChart(chartHost, shown));

  // --- Lijst (ook de tabelweergave van de grafiek) ---
  if (all.length) {
    const rows = [...all].reverse().slice(0, 60);
    const list = html(`<div class="card">
      <h2 class="card-title">Metingen</h2>
      <table class="table">
        <thead><tr><th>Datum</th><th class="num">kg</th><th class="num">Verschil</th><th></th></tr></thead>
        <tbody>${rows
          .map((w) => {
            const idx = all.indexOf(w);
            const prev = idx > 0 ? all[idx - 1] : null;
            const d = prev ? w.kg - prev.kg : null;
            return `<tr>
              <td>${esc(fmtDateShort(w.date, true))}</td>
              <td class="num">${fmt1(w.kg)}</td>
              <td class="num muted">${d === null ? '' : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmt1(Math.abs(d))}`}</td>
              <td class="num"><button class="icon-btn small" data-del="${w.date}" aria-label="Meting verwijderen">${icons.trash(16)}</button></td>
            </tr>`;
          })
          .join('')}</tbody>
      </table>
    </div>`);
    list.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      if (!(await confirmDialog(`Meting van ${fmtDateShort(b.dataset.del, true)} verwijderen?`))) return;
      await store.deleteWeight(b.dataset.del);
      app.render();
    });
    root.append(list);
  }
}
