// Micronutriënten: vitamines en mineralen per dag, of als gemiddelde van de afgelopen 7 dagen.

import * as store from './store.js';
import * as nevo from './nevo.js';
import { openSheet, html, segmented } from './ui.js';
import { esc, fmt0, fmtG, MICROS, scaleN, sumN, addN, addDays, fmtDayTitle } from './util.js';

const GROUPS = [
  { id: 'vit', label: 'Vitamines' },
  { id: 'min', label: 'Mineralen' },
  { id: 'overig', label: 'Overig' },
];

// Totaal over de dagen `from` t/m `to`: eten (uit de bewaarde kopie in het dagboek) plus de
// afgevinkte supplementen. Bij meerdere dagen tellen alleen dagen waarop je iets hebt gelogd.
export async function microTotals(from, to) {
  const [entries, days, settings] = await Promise.all([
    store.logBetween(from, to),
    store.daysBetween(from, to),
    store.getSettings(),
  ]);
  const single = from === to;
  const logged = new Set(entries.map((e) => e.date));
  let total = sumN(entries.map((e) => scaleN(e.base || {}, e.amount || 0)));
  const food = { kcal: total.kcal, mk: total.mk || 0 };
  for (const d of days) {
    if (!single && !logged.has(d.date)) continue;
    for (const s of settings.supplements) if (d.checks?.[s.id]) total = addN(total, s.micros || {});
  }
  return { total, food, dayCount: single ? 1 : logged.size };
}

export function openMicros(date) {
  const state = { mode: 'dag', token: 0 };
  const page = {
    title: 'Vitamines en mineralen',
    render(body) {
      draw(body);
    },
  };

  const draw = async (body) => {
    const token = ++state.token;
    const from = state.mode === 'dag' ? date : addDays(date, -6);
    const [{ total, food, dayCount }, settings, meta] = await Promise.all([
      microTotals(from, date),
      store.getSettings(),
      nevo.getMeta(),
    ]);
    if (token !== state.token) return;
    const avg = state.mode === 'dag' || dayCount < 1 ? total : scaleN(total, 1 / dayCount);
    const goals = settings.microGoals;
    body.innerHTML = '';

    const dayLabel = fmtDayTitle(date);
    body.append(
      segmented(
        [
          { id: 'dag', label: dayLabel.length > 12 ? 'Deze dag' : dayLabel },
          { id: 'week', label: 'Gemiddelde 7 dagen' },
        ],
        state.mode,
        (id) => {
          state.mode = id;
          draw(body);
        },
      ),
    );

    // Hoe volledig zijn de gegevens?
    const pct = food.kcal > 0 ? Math.round((food.mk / food.kcal) * 100) : null;
    const notes = [];
    if (!meta) {
      notes.push('Importeer de NEVO-tabel via Instellingen: daar komen bijna alle vitamines en mineralen vandaan.');
    } else if ((meta.schema || 1) < nevo.SCHEMA) {
      notes.push('Importeer het NEVO-bestand nog één keer opnieuw (Instellingen). Dan krijgen je producten ook vitamines en mineralen.');
    }
    if (state.mode === 'week') {
      notes.push(dayCount
        ? `Gemiddelde over ${dayCount} ${dayCount === 1 ? 'dag' : 'dagen'} waarop je iets hebt gelogd.`
        : 'In de afgelopen 7 dagen is nog niets gelogd.');
    }
    body.append(
      html(`<div class="card">
        ${pct !== null
          ? `<div class="coverage"><span class="big">${pct}%</span><span>van je kcal heeft gegevens over vitamines en mineralen</span></div>
             <p class="hint">Gescande producten (Open Food Facts) hebben die meestal niet, omdat ze zelden op het etiket staan. Je echte inname ligt dus waarschijnlijk hoger dan hieronder staat.</p>`
          : '<p class="hint">Nog niets gegeten op deze dag.</p>'}
        ${notes.map((n) => `<p class="hint">${esc(n)}</p>`).join('')}
      </div>`),
    );

    for (const g of GROUPS) {
      const rows = MICROS.filter((m) => m.group === g.id)
        .map((m) => microRow(m, avg[m.id] || 0, goals[m.id]))
        .join('');
      body.append(html(`<div class="card"><h2 class="card-title">${g.label}</h2>${rows}</div>`));
    }
    body.append(
      html(`<p class="hint">Inclusief je afgevinkte supplementen. Doelen: aanbevolen hoeveelheden voor volwassen mannen (Gezondheidsraad/Voedingscentrum); aan te passen in Instellingen.</p>`),
    );
  };

  openSheet(page);
}

function microRow(m, value, goal) {
  const val = `${fmtG(value)}${goal > 0 ? ` / ${fmtG(goal)}` : ''} ${m.unit}`;
  if (!(goal > 0)) {
    return `<div class="micro"><div class="micro-top"><span class="name">${m.label}</span><span class="val">${val}</span></div></div>`;
  }
  const ratio = value / goal;
  const over = m.max && ratio > 1;
  const note = m.max ? (over ? 'boven de grens' : 'max') : `${fmt0(ratio * 100)}%`;
  return `<div class="micro">
    <div class="micro-top"><span class="name">${m.label}</span><span class="val">${val}</span></div>
    <div class="micro-bar">
      <div class="meter${over ? ' over' : ''}${!m.max && ratio >= 1 ? ' full' : ''}" role="progressbar" aria-label="${esc(m.label)}"
        aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.round(value * 10) / 10}">
        <span style="width:${(Math.min(ratio, 1) * 100).toFixed(1)}%"></span>
      </div>
      <span class="pct${over ? ' over' : ''}">${note}</span>
    </div>
  </div>`;
}
