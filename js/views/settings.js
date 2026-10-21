// Instellingen: doelen, trainingsdagen, NEVO-import en back-up.

import * as store from '../store.js';
import * as db from '../db.js';
import * as nevo from '../nevo.js';
import { html, toast, confirmDialog, selectOnFocus, openSheet, closeSheet } from '../ui.js';
import { icons } from '../icons.js';
import { esc, fmt0, fmtG, parseNum, numToInput, kcalFromMacros, today, MICROS } from '../util.js';

const DAYS = [
  { d: 1, l: 'ma' }, { d: 2, l: 'di' }, { d: 3, l: 'wo' }, { d: 4, l: 'do' },
  { d: 5, l: 'vr' }, { d: 6, l: 'za' }, { d: 0, l: 'zo' },
];

export const APP_VERSION = '1.1.0';

export async function renderSettings(root, app) {
  const s = await store.getSettings();
  const meta = await nevo.getMeta();
  root.innerHTML = '';
  root.append(html(`<header class="view-head"><h1>Instellingen</h1></header>`));

  // --- Doelen ---
  const goalsCard = html(`<form class="card">
    <h2 class="card-title">Dagdoelen</h2>
    <p class="hint">Vul je eigen doelen in. De app rekent niets voor je uit.</p>
    ${goalBlock('training', 'Trainingsdag', s.goals.training)}
    ${goalBlock('rust', 'Rustdag', s.goals.rust)}
    <button class="btn primary block" type="submit">Doelen opslaan</button>
  </form>`);
  const updateChecks = () => {
    for (const type of ['training', 'rust']) {
      const v = (k) => parseNum(goalsCard.querySelector(`[name="${type}-${k}"]`).value) || 0;
      const calc = kcalFromMacros({ prot: v('prot'), carb: v('carb'), fat: v('fat') });
      const el = goalsCard.querySelector(`[data-check="${type}"]`);
      el.textContent = calc > 0 ? `Je macro’s samen: ${fmt0(calc)} kcal${v('kcal') ? ` (doel ${fmt0(v('kcal'))} kcal)` : ''}` : '';
    }
  };
  goalsCard.addEventListener('input', updateChecks);
  updateChecks();
  selectOnFocus(goalsCard);
  goalsCard.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (const type of ['training', 'rust']) {
      for (const k of ['kcal', 'prot', 'carb', 'fat']) {
        s.goals[type][k] = parseNum(goalsCard.querySelector(`[name="${type}-${k}"]`).value);
      }
    }
    await store.saveSettings(s);
    document.activeElement?.blur();
    toast('Doelen opgeslagen');
  });
  root.append(goalsCard);

  // --- Trainingsdagen ---
  const daysCard = html(`<div class="card">
    <h2 class="card-title">Vaste trainingsdagen</h2>
    <p class="hint">Op deze dagen staat het dagoverzicht standaard op “Trainingsdag”. Per dag kun je het altijd nog omzetten.</p>
    <div class="weekdays">${DAYS.map(
      (x) => `<button class="chip" data-d="${x.d}" aria-pressed="${s.trainingDays.includes(x.d)}">${x.l}</button>`,
    ).join('')}</div>
  </div>`);
  daysCard.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const d = Number(b.dataset.d);
    s.trainingDays = s.trainingDays.includes(d) ? s.trainingDays.filter((x) => x !== d) : [...s.trainingDays, d];
    b.setAttribute('aria-pressed', String(s.trainingDays.includes(d)));
    await store.saveSettings(s);
  });
  root.append(daysCard);

  // --- Supplementen ---
  const suppCard = html(`<div class="card">
    <h2 class="card-title">Supplementen</h2>
    <p class="hint">Deze vink je elke dag af op het scherm Vandaag. Vul bij een vitaminepil de waarden van het etiket in, dan tellen ze mee bij je vitamines en mineralen.</p>
    ${s.supplements.length ? `<div class="list">${s.supplements.map(suppRow).join('')}</div>` : ''}
    <button class="btn ghost block" data-a="add-supp">${icons.plus(18)} Supplement toevoegen</button>
  </div>`);
  suppCard.addEventListener('click', (e) => {
    const row = e.target.closest('[data-supp]');
    if (row) openSupplement(s, s.supplements.find((x) => x.id === row.dataset.supp), app);
    if (e.target.closest('[data-a="add-supp"]')) openSupplement(s, null, app);
  });
  root.append(suppCard);

  // --- Doelen vitamines en mineralen ---
  const microCard = html(`<div class="card">
    <h2 class="card-title">Vitamines en mineralen</h2>
    <p class="hint">Je ziet ze via “Vitamines en mineralen” op het scherm Vandaag. Standaard vergeleken met de aanbevolen hoeveelheden voor volwassen mannen (Gezondheidsraad/Voedingscentrum).</p>
    <button class="btn ghost block" data-a="micro-goals">Doelen aanpassen</button>
  </div>`);
  microCard.querySelector('[data-a="micro-goals"]').onclick = () => openMicroGoals(s);
  root.append(microCard);

  // --- NEVO ---
  const nevoOld = meta && (meta.schema || 1) < nevo.SCHEMA;
  const nevoCard = html(`<div class="card">
    <h2 class="card-title">NEVO-tabel (algemene producten)</h2>
    ${nevoOld ? '<p class="notice">Nieuw: vitamines en mineralen. Kies het NEVO-bestand hieronder nog één keer opnieuw, dan worden ze ingelezen (ook voor wat je al gelogd hebt).</p>' : ''}
    ${
      meta
        ? `<p>${fmt0(meta.count)} producten geïmporteerd${meta.version ? ` (versie ${esc(meta.version)})` : ''} op ${new Date(meta.importedAt).toLocaleDateString('nl-NL')}.</p>`
        : `<p class="hint">Nog niet geïmporteerd. Download het bestand op <a href="https://nevo-online.rivm.nl/" target="_blank" rel="noopener">nevo-online.rivm.nl</a> (knop rechtsboven, akkoord gaan met de voorwaarden) en kies het hieronder. Een zip-bestand mag ook.</p>`
    }
    <label class="btn ${meta && !nevoOld ? 'ghost' : 'primary'} block file-btn">
      ${meta ? 'Opnieuw importeren' : 'NEVO-bestand kiezen'}
      <input type="file" class="file-input" accept=".csv,.zip,.txt,text/csv,application/zip">
    </label>
    ${meta ? `<button class="btn danger-ghost block" data-a="remove">NEVO-gegevens verwijderen</button>` : ''}
    <p class="status" data-status></p>
  </div>`);
  nevoCard.querySelector('input[type="file"]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const status = nevoCard.querySelector('[data-status]');
    status.textContent = 'Bezig met importeren…';
    try {
      const m = await nevo.importFile(file);
      toast(`${fmt0(m.count)} NEVO-producten geïmporteerd`);
      app.render();
    } catch (err) {
      status.textContent = err.message;
      status.classList.add('error-text');
    }
  });
  nevoCard.querySelector('[data-a="remove"]')?.addEventListener('click', async () => {
    if (!(await confirmDialog('NEVO-gegevens verwijderen? Je eigen producten en dagboek blijven bewaard.'))) return;
    await nevo.removeAll();
    app.render();
  });
  root.append(nevoCard);

  // --- Back-up ---
  const backupCard = html(`<div class="card">
    <h2 class="card-title">Back-up</h2>
    <p class="hint">Al je gegevens staan alleen op deze telefoon. Maak regelmatig een back-up en bewaar die bijvoorbeeld in iCloud Drive.</p>
    <button class="btn primary block" data-a="export">Back-up maken</button>
    <label class="btn ghost block file-btn">Back-up terugzetten
      <input type="file" class="file-input" accept=".json,application/json">
    </label>
  </div>`);
  backupCard.querySelector('[data-a="export"]').onclick = exportBackup;
  backupCard.querySelector('input[type="file"]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== 'macro-tracker' || !data.data) throw new Error('Dit is geen back-up van deze app.');
      const d = data.data;
      const summary = `${d.log?.length || 0} dagboekregels, ${d.products?.length || 0} producten, ${d.meals?.length || 0} maaltijden en ${d.weights?.length || 0} metingen`;
      if (!(await confirmDialog(`Back-up van ${new Date(data.exportedAt).toLocaleString('nl-NL')} terugzetten?\n\nDit vervangt al je huidige gegevens door ${summary}.`))) return;
      await db.replaceAll(d);
      store.invalidateCaches();
      toast('Back-up teruggezet');
      app.render();
    } catch (err) {
      toast(err.message || 'Back-up kon niet gelezen worden.', { error: true });
    }
  });
  root.append(backupCard);

  // --- Over ---
  root.append(
    html(`<div class="card about">
      <h2 class="card-title">Over deze app</h2>
      <p>Versie ${APP_VERSION}. Gratis, zonder advertenties en zonder account.</p>
      <p class="hint">Productgegevens via barcode: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (ODbL), aangevuld door vrijwilligers; waarden kunnen ontbreken of afwijken.</p>
      <p class="hint">Algemene producten: NEVO-online versie ${esc(meta?.version || '2025/9.0')}, RIVM, Bilthoven.</p>
      <p class="hint">Barcode-scanner: zxing-cpp via barcode-detector (MIT).</p>
    </div>`),
  );
}

function suppRow(x) {
  const parts = MICROS.filter((m) => x.micros?.[m.id] > 0).map((m) => `${m.label} ${fmtG(x.micros[m.id])} ${m.unit}`);
  const sub = parts.length
    ? parts.slice(0, 3).join(' · ') + (parts.length > 3 ? ` · +${parts.length - 3}` : '')
    : 'Telt niet mee bij vitamines en mineralen';
  return `<button class="row" data-supp="${esc(x.id)}">
    <span class="row-main"><span class="row-title">${esc(x.name)}</span><span class="row-sub">${esc(sub)}</span></span>
    <span class="row-chev">${icons.right(16)}</span></button>`;
}

// Supplement toevoegen of bewerken. Waarden per dosis (zoals op het etiket).
function openSupplement(settings, supp, app) {
  const draft = supp ? structuredClone(supp) : { id: null, name: '', micros: {} };
  if (!draft.micros) draft.micros = {};
  const microFields = MICROS.filter((m) => m.id !== 'salt');
  openSheet(
    {
      title: supp ? 'Supplement' : 'Nieuw supplement',
      render(body) {
        body.append(
          html(`<div class="form">
            <label class="field"><span class="field-label">Naam</span>
              <input data-k="name" value="${esc(draft.name)}" placeholder="Bijv. Multivitamine" autocapitalize="sentences"></label>
            <h3 class="list-title">Per dosis (optioneel)</h3>
            <p class="hint">Neem over wat op het etiket staat en laat de rest leeg. Bij creatine kun je alles leeg laten.</p>
            <div class="nutrient-grid">
              ${microFields.map(
                (m) => `<label class="nrow"><span>${m.label}</span>
                  <input data-m="${m.id}" inputmode="decimal" value="${esc(numToInput(draft.micros[m.id]))}" placeholder="–">
                  <span class="u">${m.unit}</span></label>`,
              ).join('')}
            </div>
            <button class="btn primary block big" data-a="save">Opslaan</button>
            ${supp ? `<button class="btn danger-ghost block" data-a="delete">${icons.trash(18)} Verwijderen</button>` : ''}
          </div>`),
        );
        selectOnFocus(body);
        body.querySelector('[data-k="name"]').addEventListener('input', (e) => (draft.name = e.target.value));
        body.querySelectorAll('[data-m]').forEach((i) =>
          i.addEventListener('input', () => {
            const v = parseNum(i.value);
            if (v > 0) draft.micros[i.dataset.m] = v;
            else delete draft.micros[i.dataset.m];
          }),
        );
        body.querySelector('[data-a="save"]').onclick = async () => {
          const name = draft.name.trim();
          if (!name) return toast('Geef het supplement een naam.', { error: true });
          const item = { ...draft, name, id: draft.id || `s_${Date.now().toString(36)}` };
          settings.supplements = supp
            ? settings.supplements.map((x) => (x.id === supp.id ? item : x))
            : [...settings.supplements, item];
          await store.saveSettings(settings);
          toast('Supplement opgeslagen');
          closeSheet();
        };
        body.querySelector('[data-a="delete"]')?.addEventListener('click', async () => {
          if (!(await confirmDialog(`“${supp.name}” verwijderen? Op eerdere dagen telt hij dan ook niet meer mee.`))) return;
          settings.supplements = settings.supplements.filter((x) => x.id !== supp.id);
          await store.saveSettings(settings);
          toast('Supplement verwijderd');
          closeSheet();
        });
      },
    },
    { onClose: () => app.render() },
  );
}

function openMicroGoals(settings) {
  const draft = { ...settings.microGoals };
  const page = {
    title: 'Doelen vitamines en mineralen',
    render(body) {
      body.append(
        html(`<div class="form">
          <p class="hint">Per dag. Bij zout is het een bovengrens. Laat een veld leeg als je alleen de hoeveelheid wilt zien.</p>
          <div class="nutrient-grid">
            ${MICROS.map(
              (m) => `<label class="nrow"><span>${m.label}${m.max ? ' (max)' : ''}</span>
                <input data-m="${m.id}" inputmode="decimal" value="${esc(numToInput(draft[m.id]))}" placeholder="–">
                <span class="u">${m.unit}</span></label>`,
            ).join('')}
          </div>
          <button class="btn primary block big" data-a="save">Opslaan</button>
          <button class="btn ghost block" data-a="reset">Standaardwaarden terugzetten</button>
        </div>`),
      );
      selectOnFocus(body);
      body.querySelectorAll('[data-m]').forEach((i) =>
        i.addEventListener('input', () => (draft[i.dataset.m] = parseNum(i.value))),
      );
      body.querySelector('[data-a="save"]').onclick = async () => {
        settings.microGoals = draft;
        await store.saveSettings(settings);
        toast('Doelen opgeslagen');
        closeSheet();
      };
      body.querySelector('[data-a="reset"]').onclick = () => {
        Object.assign(draft, store.defaultMicroGoals());
        body.innerHTML = '';
        page.render(body);
      };
    },
  };
  openSheet(page);
}

function goalBlock(type, title, g) {
  const field = (k, label, unit) => `<label class="nrow"><span>${label}</span>
    <input name="${type}-${k}" inputmode="decimal" value="${esc(numToInput(g[k]))}" placeholder="–"><span class="u">${unit}</span></label>`;
  return `<div class="goal-block">
    <h3 class="list-title">${title}</h3>
    <div class="nutrient-grid">
      ${field('kcal', 'Energie', 'kcal')}
      ${field('prot', 'Eiwit', 'g')}
      ${field('carb', 'Koolhydraten', 'g')}
      ${field('fat', 'Vet', 'g')}
    </div>
    <p class="hint" data-check="${type}"></p>
  </div>`;
}

async function exportBackup() {
  const payload = {
    app: 'macro-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: await db.exportAll(),
  };
  const name = `macro-tracker-backup-${today()}.json`;
  const file = new File([JSON.stringify(payload)], name, { type: 'application/json' });
  // Op de iPhone: deelmenu (Bewaar in Bestanden, AirDrop, mail...). Anders: gewone download.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Back-up macro-tracker' });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Back-up gedownload');
}
