// Gewicht: invoeren en het verloop door de tijd bekijken, met een 7-daags gemiddelde
// (dat schommelt minder door vocht en eten dan losse metingen).

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

// Per meting: het gemiddelde van alle metingen in de 7 dagen tot en met die dag.
function rollingAverage(all) {
  return all.map((w, i) => {
    const from = addDays(w.date, -6);
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && all[j].date >= from; j--) {
      sum += all[j].kg;
      n++;
    }
    return { date: w.date, kg: sum / n };
  });
}

function averageBetween(all, from, to) {
  const list = all.filter((w) => w.date >= from && w.date <= to);
  if (!list.length) return null;
  return { kg: list.reduce((s, w) => s + w.kg, 0) / list.length, n: list.length };
}

const signed = (d) => `${d > 0.05 ? '+' : d < -0.05 ? '−' : '±'}${fmt1(Math.abs(d))}`;
// Toename groen, afname rood.
const trend = (d) => (d > 0.05 ? 'up' : d < -0.05 ? 'down' : '');

export async function renderWeight(root, app) {
  const all = await store.weights();
  const avgAll = rollingAverage(all);
  const rangeId = app.weightRange || '90';
  const range = RANGES.find((r) => r.id === rangeId);
  const from = range.days ? addDays(today(), -range.days) : '0000-00-00';
  const shown = all.filter((w) => w.date >= from);
  const shownAvg = avgAll.filter((w) => w.date >= from);
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

  // --- Kerncijfers: gemiddelde van de afgelopen 7 dagen ---
  if (last) {
    // Geen metingen deze week? Dan de laatste 7 dagen waarin je wel gewogen hebt.
    let end = today();
    let week = averageBetween(all, addDays(end, -6), end);
    if (!week) {
      end = last.date;
      week = averageBetween(all, addDays(end, -6), end);
    }
    const prev = averageBetween(all, addDays(end, -13), addDays(end, -7));
    const weekSub = `${week.n} ${week.n === 1 ? 'meting' : 'metingen'}${end !== today() ? ` t/m ${fmtDateShort(end)}` : ''}`;
    root.append(
      html(`<div class="stats two">
        <div class="stat main"><span class="label">Gemiddelde van de afgelopen 7 dagen</span><span class="value">${fmt1(week.kg)} kg</span><span class="sub">${esc(weekSub)}</span></div>
        <div class="stat"><span class="label">T.o.v. week ervoor</span><span class="value ${prev ? trend(week.kg - prev.kg) : ''}">${prev ? `${signed(week.kg - prev.kg)} kg` : '–'}</span><span class="sub">${prev ? `toen ${fmt1(prev.kg)} kg` : 'nog geen gegevens'}</span></div>
        <div class="stat"><span class="label">Laatste meting</span><span class="value">${fmt1(last.kg)} kg</span><span class="sub">${esc(fmtDateShort(last.date))}</span></div>
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
  if (shownAvg.length >= 2) {
    const d = shownAvg.at(-1).kg - shownAvg[0].kg;
    chartCard.append(
      html(`<p class="chart-note"><span class="key-line"></span> 7-daags gemiddelde <span class="key-dot"></span> meting
        <span class="chart-change ${trend(d)}">Gemiddelde ${signed(d)} kg sinds ${esc(fmtDateShort(shownAvg[0].date))}</span></p>`),
    );
  }
  root.append(chartCard);
  requestAnimationFrame(() => weightChart(chartHost, shown, shownAvg));

  // --- Lijst (ook de tabelweergave van de grafiek) ---
  if (all.length) {
    const rows = [...all].reverse().slice(0, 60);
    const list = html(`<div class="card">
      <h2 class="card-title">Metingen</h2>
      <table class="table">
        <thead><tr><th>Datum</th><th class="num">kg</th><th class="num">Gem. 7 d</th><th class="num">Verschil</th><th></th></tr></thead>
        <tbody>${rows
          .map((w) => {
            const idx = all.indexOf(w);
            const prev = idx > 0 ? all[idx - 1] : null;
            const d = prev ? w.kg - prev.kg : null;
            return `<tr>
              <td>${esc(fmtDateShort(w.date, true))}</td>
              <td class="num">${fmt1(w.kg)}</td>
              <td class="num">${fmt1(avgAll[idx].kg)}</td>
              <td class="num muted ${d === null ? '' : trend(d)}">${d === null ? '' : signed(d)}</td>
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
