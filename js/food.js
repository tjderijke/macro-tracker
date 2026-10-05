// Alles rond eten toevoegen: zoeken, scannen, hoeveelheid kiezen, producten en maaltijden bewerken.

import * as store from './store.js';
import * as nevo from './nevo.js';
import * as off from './off.js';
import { startScanner } from './scanner.js';
import {
  openSheet, pushPage, popPage, popTo, replacePage, closeSheet, toast, confirmDialog, html, segmented, selectOnFocus,
} from './ui.js';
import {
  esc, fmt0, fmtG, parseNum, numToInput, MOMENTS, NUTRIENTS, scaleN, macroLine, kcalFromMacros, debounce,
} from './util.js';
import { icons } from './icons.js';

const SOURCE_LABEL = { eigen: 'Eigen', off: 'Open Food Facts', nevo: 'NEVO' };

let changed = () => {};
export function setChangeHandler(fn) {
  changed = fn;
}

const momentLabel = (id) => MOMENTS.find((m) => m.id === id)?.label || '';
const unitOf = (p) => (p.unit === 'ml' ? 'ml' : 'g');

function per100Line(p) {
  const n = p.per100 || {};
  return `${fmt0(n.kcal)} kcal · ${macroLine(n)}`;
}

function rowHtml(key, title, sub, badge = '') {
  return `<button class="row" data-key="${esc(key)}">
    <span class="row-main"><span class="row-title">${esc(title)}</span><span class="row-sub">${esc(sub)}</span></span>
    ${badge ? `<span class="badge">${esc(badge)}</span>` : ''}
    <span class="row-chev">${icons.right(16)}</span>
  </button>`;
}

function momentPicker(selected, onChange) {
  return segmented(
    MOMENTS.map((m) => ({ id: m.id, label: m.label })),
    selected,
    onChange,
    { small: true },
  );
}

function nutritionPreview(n, { title = 'Totaal' } = {}) {
  return `<div class="preview">
    <div class="preview-kcal"><span class="big">${fmt0(n.kcal)}</span> <span class="unit">kcal</span><span class="preview-title">${esc(title)}</span></div>
    <div class="preview-macros">
      <div><span class="v">${fmtG(n.prot)} g</span><span class="l">Eiwit</span></div>
      <div><span class="v">${fmtG(n.carb)} g</span><span class="l">Koolhydraten</span></div>
      <div><span class="v">${fmtG(n.fat)} g</span><span class="l">Vet</span></div>
    </div>
  </div>`;
}

// =====================================================================
// Ingang: eten toevoegen aan een dag/moment
// =====================================================================

export function openAddFood(date, moment) {
  const ctx = { mode: 'log', date, moment, added: 0 };
  openSheet(searchPage(ctx), { onClose: () => changed() });
}

export async function openEntryEditor(entry) {
  const ctx = { mode: 'log', date: entry.date, moment: entry.moment };
  let page;
  if (entry.kind === 'meal') {
    const meal = (await store.getMeal(entry.refId)) || { id: null, name: entry.name, items: [] };
    page = mealAmountPage(meal, ctx, entry);
  } else if (entry.kind === 'quick') {
    page = quickAddPage(ctx, entry);
  } else {
    const product = (await store.getProduct(entry.refId)) || {
      id: null,
      name: entry.name,
      brand: entry.brand || '',
      unit: entry.unit === 'ml' ? 'ml' : 'g',
      per100: scaleN(entry.base, 100),
      servings: [],
      source: 'eigen',
    };
    page = productAmountPage(product, ctx, entry);
  }
  openSheet(page, { onClose: () => changed() });
}

export function openProductEditor(product = null) {
  openSheet(
    productEditorPage(product || {}, {
      allowDelete: true,
      onSaved: () => closeSheet(),
      onDeleted: () => closeSheet(),
    }),
    { onClose: () => changed() },
  );
}

export async function openMealEditor(meal = null) {
  const draft = await refreshMealItems(meal ? structuredClone(meal) : null);
  openSheet(
    mealEditorPage(draft, { onSaved: () => closeSheet(), onDeleted: () => closeSheet() }),
    { onClose: () => changed() },
  );
}

// Maakt van de producten in een maaltijdmoment een nieuwe, opgeslagen maaltijd.
export function openSaveAsMeal(entries, suggestedName) {
  const items = entries
    .filter((e) => e.kind === 'product')
    .map((e) => ({
      productId: e.refId || null,
      name: e.name,
      brand: e.brand || '',
      grams: e.amount,
      per100: scaleN(e.base, 100),
    }));
  const draft = { id: null, name: suggestedName || '', portions: 1, totalGrams: null, items };
  openSheet(mealEditorPage(draft, { onSaved: () => closeSheet() }), { onClose: () => changed() });
}

// Werkt de ingrediënten bij met de actuele productwaarden (als het product nog bestaat).
async function refreshMealItems(meal) {
  if (!meal) return null;
  for (const it of meal.items || []) {
    if (!it.productId) continue;
    const p = await store.getProduct(it.productId);
    if (p) {
      it.name = p.name;
      it.brand = p.brand || '';
      it.per100 = { ...p.per100 };
    }
  }
  return meal;
}

// =====================================================================
// Zoekpagina
// =====================================================================

function searchPage(ctx) {
  const pick = ctx.mode === 'pick';
  const state = { query: '', tab: 'recent', off: null, offLoading: false, offError: '', token: 0, seenAdded: 0 };
  const handlers = new Map();

  const page = {
    get title() {
      return pick ? 'Ingrediënt kiezen' : `Toevoegen · ${momentLabel(ctx.moment)}`;
    },
    render(body) {
      // Net iets toegevoegd? Begin dan met een lege zoekbalk voor het volgende product.
      if ((ctx.added || 0) !== state.seenAdded) {
        state.seenAdded = ctx.added || 0;
        state.query = '';
        state.off = null;
        state.offError = '';
      }
      body.append(
        html(`<div class="search-bar">
          <span class="search-icon">${icons.search(18)}</span>
          <input type="search" placeholder="Zoek product${pick ? '' : ' of maaltijd'}" enterkeyhint="search"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        </div>`),
      );
      const actions = html(`<div class="quick-actions">
        <button class="qa" data-a="scan">${icons.scan()}<span>Scan barcode</span></button>
        <button class="qa" data-a="new">${icons.plus()}<span>Nieuw product</span></button>
        ${pick ? '' : `<button class="qa" data-a="quick">${icons.bolt()}<span>Snel invoeren</span></button>`}
      </div>`);
      body.append(actions);
      if (!pick && ctx.added > 0) {
        const bar = html(`<div class="added-bar">
          <span>${ctx.added} ${ctx.added === 1 ? 'item' : 'items'} toegevoegd</span>
          <button class="btn small primary">Klaar</button>
        </div>`);
        bar.querySelector('button').onclick = () => closeSheet();
        body.append(bar);
      }
      const tabsHost = html('<div class="tabs-host"></div>');
      body.append(tabsHost);
      const results = html('<div class="results"></div>');
      body.append(results);

      const input = body.querySelector('input');
      input.value = state.query;

      actions.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'scan') pushPage(scanPage(ctx));
        if (a === 'new') pushPage(newProductPage(ctx, { name: state.query }));
        if (a === 'quick') pushPage(quickAddPage(ctx));
      });

      results.addEventListener('click', (e) => {
        const row = e.target.closest('[data-key]');
        if (row && handlers.has(row.dataset.key)) handlers.get(row.dataset.key)();
      });

      const tabs = segmented(
        [
          { id: 'recent', label: 'Recent' },
          ...(pick ? [] : [{ id: 'meals', label: 'Maaltijden' }]),
          { id: 'products', label: 'Mijn producten' },
        ],
        state.tab,
        (id) => {
          state.tab = id;
          update();
        },
      );
      tabsHost.append(tabs);

      const update = async () => {
        const token = ++state.token;
        handlers.clear();
        tabsHost.hidden = !!state.query.trim();
        const out = state.query.trim() ? await queryResults() : await tabResults();
        if (token !== state.token) return;
        results.innerHTML = out;
        results.querySelector('[data-off]')?.addEventListener('click', searchOff);
      };

      const addProductRow = (key, p) => {
        handlers.set(key, () => chooseProduct(p, ctx));
        const sub = [p.brand, `per 100 ${unitOf(p)}: ${per100Line(p)}`].filter(Boolean).join(' · ');
        return rowHtml(key, p.name, sub, p.source === 'eigen' ? 'Eigen' : p.source === 'nevo' ? 'NEVO' : '');
      };
      const addMealRow = (key, m) => {
        handlers.set(key, async () => pushPage(mealAmountPage(await refreshMealItems(structuredClone(m)), ctx)));
        const t = store.mealTotals(m);
        return rowHtml(key, m.name, `per portie: ${fmt0(t.perPortion.kcal)} kcal · ${macroLine(t.perPortion)}`, 'Maaltijd');
      };

      const tabResults = async () => {
        if (state.tab === 'recent') {
          const items = (await store.recentItems()).filter((r) => !pick || r.type === 'product');
          if (!items.length) {
            return `<p class="empty">Nog niets gegeten met deze app. Zoek een product, scan een barcode of maak een nieuw product aan.</p>`;
          }
          return `<div class="list">${items
            .map((r, i) => (r.type === 'meal' ? addMealRow(`r${i}`, r.item) : addProductRow(`r${i}`, r.item)))
            .join('')}</div>`;
        }
        if (state.tab === 'meals') {
          const meals = (await store.allMeals()).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
          if (!meals.length) {
            return `<p class="empty">Nog geen maaltijden. Maak er een in de Bibliotheek, of sla een maaltijdmoment op via “Opslaan als maaltijd”.</p>`;
          }
          return `<div class="list">${meals.map((m, i) => addMealRow(`m${i}`, m)).join('')}</div>`;
        }
        const products = (await store.allProducts()).sort(
          (a, b) => (a.source === 'eigen' ? 0 : 1) - (b.source === 'eigen' ? 0 : 1) || a.name.localeCompare(b.name, 'nl'),
        );
        if (!products.length) return `<p class="empty">Nog geen producten opgeslagen.</p>`;
        return `<div class="list">${products.map((p, i) => addProductRow(`p${i}`, p)).join('')}</div>`;
      };

      const queryResults = async () => {
        const q = state.query.trim();
        const local = await store.searchLocal(q);
        const localNevo = new Set(local.products.map((p) => p.nevoCode).filter(Boolean));
        const nevoMeta = await nevo.getMeta();
        const nevoItems = nevoMeta ? (await nevo.search(q)).filter((n) => !localNevo.has(n.code)) : [];
        let out = '';
        const mine = [
          ...(pick ? [] : local.meals.slice(0, 15).map((m, i) => addMealRow(`lm${i}`, m))),
          ...local.products.slice(0, 30).map((p, i) => addProductRow(`lp${i}`, p)),
        ];
        if (mine.length) out += `<h3 class="list-title">Mijn producten${pick ? '' : ' en maaltijden'}</h3><div class="list">${mine.join('')}</div>`;
        if (nevoItems.length) {
          out += `<h3 class="list-title">Algemene producten (NEVO)</h3><div class="list">${nevoItems
            .map((n, i) => addProductRow(`n${i}`, nevo.toProduct(n)))
            .join('')}</div>`;
        }
        if (!nevoMeta) {
          out += `<p class="hint">Tip: importeer de NEVO-tabel via Instellingen, dan vind je hier ook algemene producten zoals kipfilet, rijst en havermout.</p>`;
        }
        out += `<h3 class="list-title">Open Food Facts</h3>`;
        if (state.offLoading) out += `<p class="empty">Zoeken in Open Food Facts…</p>`;
        else if (state.offError) out += `<p class="empty error-text">${esc(state.offError)}</p>`;
        else if (state.off && state.off.query === q) {
          out += state.off.items.length
            ? `<div class="list">${state.off.items.map((p, i) => addProductRow(`o${i}`, p)).join('')}</div>`
            : `<p class="empty">Niets gevonden in Open Food Facts.</p>`;
        }
        if (!state.offLoading && !(state.off && state.off.query === q)) {
          out += `<button class="btn ghost block" data-off>${icons.search(18)} Zoek “${esc(q)}” online</button>`;
        }
        return out;
      };

      const searchOff = async () => {
        const q = state.query.trim();
        state.offLoading = true;
        state.offError = '';
        update();
        try {
          state.off = { query: q, items: await off.search(q) };
        } catch {
          state.offError = 'Zoeken lukt nu niet. Controleer je internetverbinding of probeer het over een minuut opnieuw.';
        }
        state.offLoading = false;
        if (state.query.trim() === q) update();
      };

      input.addEventListener(
        'input',
        debounce(() => {
          state.query = input.value;
          update();
        }, 150),
      );
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
      update();
    },
  };
  ctx.searchPage = page;
  return page;
}

// Product gekozen uit een lijst: eerst kijken of het compleet is.
async function chooseProduct(p, ctx) {
  let product = p;
  if (!product.id && product.barcode) product = (await store.findByBarcode(product.barcode)) || product;
  if (!off.isComplete(product)) {
    toast('Niet alle voedingswaarden zijn bekend. Vul ze eerst aan.');
    pushPage(newProductPage(ctx, product));
    return;
  }
  pushPage(productAmountPage(product, ctx));
}

// Nieuw (of aan te vullen) product, waarna je meteen de hoeveelheid kiest.
function newProductPage(ctx, product) {
  return productEditorPage(product, {
    onSaved: (p) => replacePage(productAmountPage(p, ctx)),
  });
}

// Terug naar de zoekpagina na toevoegen (zodat je snel meer kunt toevoegen).
function afterAdd(ctx, what) {
  ctx.added = (ctx.added || 0) + 1;
  toast(`${what} toegevoegd aan ${momentLabel(ctx.moment).toLowerCase()}`);
  if (ctx.searchPage) popTo(ctx.searchPage);
  else closeSheet();
}

// =====================================================================
// Hoeveelheid kiezen: product
// =====================================================================

function productAmountPage(initial, ctx, entry = null) {
  let product = initial;
  const pick = ctx.mode === 'pick';
  const servings = () => product.servings || [];
  const state = {
    unit: !entry && !pick && servings().length ? 's0' : 'g',
    amount: entry ? entry.amount : !pick && servings().length ? 1 : 100,
    moment: entry?.moment || ctx.moment,
  };

  const grams = () => {
    const a = parseNum(state.amount) || 0;
    if (state.unit === 'g') return a;
    const s = servings()[Number(state.unit.slice(1))];
    return s ? a * s.grams : a;
  };
  const label = () => {
    const a = parseNum(state.amount) || 0;
    if (state.unit === 'g') return `${fmtG(a)} ${unitOf(product)}`;
    const s = servings()[Number(state.unit.slice(1))];
    return `${a === 1 ? s.label : `${fmtG(a)} × ${s.label}`} (${fmtG(a * s.grams)} ${unitOf(product)})`;
  };

  const page = {
    title: entry ? 'Bewerken' : 'Hoeveelheid',
    render(body) {
      const u = unitOf(product);
      body.append(
        html(`<div class="card product-head">
          <div class="ph-title">${esc(product.name)}</div>
          <div class="ph-sub">${product.brand ? `${esc(product.brand)} · ` : ''}<span class="badge">${esc(SOURCE_LABEL[product.source] || 'Eigen')}</span></div>
          <div class="ph-per100">Per 100 ${u}: ${esc(per100Line(product))}</div>
          ${product.id || product.source !== 'eigen' ? `<button class="link" data-a="edit">Product bewerken</button>` : ''}
        </div>`),
      );

      const unitChips = [{ id: 'g', label: u === 'ml' ? 'milliliter' : 'gram' }, ...servings().map((s, i) => ({ id: `s${i}`, label: `${s.label} (${fmtG(s.grams)} ${u})` }))];
      body.append(
        html(`<div class="field">
          <span class="field-label">Hoeveelheid</span>
          <div class="amount-row">
            <input class="amount-input" inputmode="decimal" value="${esc(numToInput(parseNum(state.amount)))}" aria-label="Hoeveelheid">
            <span class="amount-unit">${state.unit === 'g' ? u : '×'}</span>
          </div>
          <div class="chips">${unitChips
            .map((c) => `<button class="chip" data-unit="${c.id}" aria-pressed="${c.id === state.unit}">${esc(c.label)}</button>`)
            .join('')}</div>
        </div>`),
      );

      if (!pick) {
        const mp = html('<div class="field"><span class="field-label">Moment</span></div>');
        mp.append(momentPicker(state.moment, (id) => (state.moment = id)));
        body.append(mp);
      }

      const preview = html('<div class="card"></div>');
      body.append(preview);
      const base = () => store.productBase(product);
      const updatePreview = () => (preview.innerHTML = nutritionPreview(scaleN(base(), grams()), { title: label() }));
      updatePreview();

      const btn = html(`<button class="btn primary block big">${entry ? 'Opslaan' : pick ? 'Toevoegen aan maaltijd' : 'Toevoegen'}</button>`);
      body.append(btn);
      if (entry) {
        const del = html(`<button class="btn danger-ghost block">${icons.trash(18)} Verwijderen uit dagboek</button>`);
        del.onclick = async () => {
          await store.deleteLog(entry.id);
          toast('Verwijderd');
          closeSheet();
        };
        body.append(del);
      }

      const input = body.querySelector('.amount-input');
      selectOnFocus(body);
      input.addEventListener('input', () => {
        state.amount = input.value;
        updatePreview();
      });
      body.querySelector('.chips').addEventListener('click', (e) => {
        const c = e.target.closest('[data-unit]');
        if (!c) return;
        const g = grams();
        state.unit = c.dataset.unit;
        state.amount = state.unit === 'g' ? Math.round(g * 10) / 10 : 1;
        page.render((body.innerHTML = '', body));
      });
      body.querySelector('[data-a="edit"]')?.addEventListener('click', () => {
        pushPage(
          productEditorPage(product, {
            onSaved: (p) => {
              product = p;
              popPage();
            },
          }),
        );
      });

      btn.onclick = async () => {
        const g = grams();
        if (!(g > 0)) return toast('Vul een hoeveelheid in.', { error: true });
        if (pick) {
          const local = await store.ensureLocalProduct(product);
          return ctx.onPick(local, g);
        }
        if (entry) {
          entry.amount = g;
          entry.label = state.unit === 'g' ? '' : label();
          entry.moment = state.moment;
          entry.base = base();
          await store.updateLog(entry);
          toast('Opgeslagen');
          return closeSheet();
        }
        const local = await store.ensureLocalProduct(product);
        product = local;
        ctx.moment = state.moment;
        await store.addLog({
          date: ctx.date,
          moment: state.moment,
          kind: 'product',
          refId: local.id,
          name: local.name,
          brand: local.brand || '',
          amount: g,
          unit: unitOf(local),
          label: state.unit === 'g' ? '' : label(),
          base: base(),
        });
        afterAdd(ctx, local.name);
      };
    },
  };
  return page;
}

// =====================================================================
// Hoeveelheid kiezen: maaltijd
// =====================================================================

function mealAmountPage(initial, ctx, entry = null) {
  let meal = initial;
  const state = {
    unit: entry?.unit === 'g' ? 'g' : 'portie',
    amount: entry ? entry.amount : 1,
    moment: entry?.moment || ctx.moment,
  };

  const page = {
    title: entry ? 'Bewerken' : 'Maaltijd',
    render(body) {
      const t = store.mealTotals(meal);
      const canGram = !!t.perGram;
      if (state.unit === 'g' && !canGram && !entry) state.unit = 'portie';
      const base = () => (entry && entry.unit === state.unit ? entry.base : state.unit === 'g' ? t.perGram : t.perPortion);

      body.append(
        html(`<div class="card product-head">
          <div class="ph-title">${esc(meal.name)}</div>
          <div class="ph-sub"><span class="badge">Maaltijd</span> ${fmt0(t.portions)} ${t.portions === 1 ? 'portie' : 'porties'}${t.totalGrams ? ` · ${fmt0(t.totalGrams)} g totaal` : ''}</div>
          ${meal.items?.length ? `<ul class="ingredients">${meal.items.map((it) => `<li><span>${esc(it.name)}</span><span>${fmtG(it.grams)} g</span></li>`).join('')}</ul>` : ''}
          ${meal.id ? `<button class="link" data-a="edit">Maaltijd bewerken</button>` : ''}
        </div>`),
      );

      const chips = [{ id: 'portie', label: 'porties' }, ...(canGram || state.unit === 'g' ? [{ id: 'g', label: 'gram' }] : [])];
      body.append(
        html(`<div class="field">
          <span class="field-label">Hoeveelheid</span>
          <div class="amount-row">
            <input class="amount-input" inputmode="decimal" value="${esc(numToInput(parseNum(state.amount)))}" aria-label="Hoeveelheid">
            <span class="amount-unit">${state.unit === 'g' ? 'g' : state.amount == 1 ? 'portie' : 'porties'}</span>
          </div>
          ${chips.length > 1 ? `<div class="chips">${chips.map((c) => `<button class="chip" data-unit="${c.id}" aria-pressed="${c.id === state.unit}">${c.label}</button>`).join('')}</div>` : ''}
          ${!canGram ? `<p class="hint">Wil je in grammen loggen? Vul bij de maaltijd het totale gewicht na bereiden in.</p>` : ''}
        </div>`),
      );

      const mp = html('<div class="field"><span class="field-label">Moment</span></div>');
      mp.append(momentPicker(state.moment, (id) => (state.moment = id)));
      body.append(mp);

      const preview = html('<div class="card"></div>');
      body.append(preview);
      const amount = () => parseNum(state.amount) || 0;
      const lbl = () => (state.unit === 'g' ? `${fmtG(amount())} g` : `${fmtG(amount())} ${amount() === 1 ? 'portie' : 'porties'}`);
      const updatePreview = () => {
        preview.innerHTML = nutritionPreview(scaleN(base() || {}, amount()), { title: lbl() });
        body.querySelector('.amount-unit').textContent = state.unit === 'g' ? 'g' : amount() === 1 ? 'portie' : 'porties';
      };
      updatePreview();

      const btn = html(`<button class="btn primary block big">${entry ? 'Opslaan' : 'Toevoegen'}</button>`);
      body.append(btn);
      if (entry) {
        const del = html(`<button class="btn danger-ghost block">${icons.trash(18)} Verwijderen uit dagboek</button>`);
        del.onclick = async () => {
          await store.deleteLog(entry.id);
          toast('Verwijderd');
          closeSheet();
        };
        body.append(del);
      }

      const input = body.querySelector('.amount-input');
      selectOnFocus(body);
      input.addEventListener('input', () => {
        state.amount = input.value;
        updatePreview();
      });
      body.querySelector('.chips')?.addEventListener('click', (e) => {
        const c = e.target.closest('[data-unit]');
        if (!c || c.dataset.unit === state.unit) return;
        const kcalNow = scaleN(base() || {}, amount()).kcal;
        state.unit = c.dataset.unit;
        // Behoud ongeveer dezelfde hoeveelheid bij het wisselen.
        const b = base();
        state.amount = b?.kcal ? Math.round((kcalNow / b.kcal) * (state.unit === 'g' ? 1 : 100)) / (state.unit === 'g' ? 1 : 100) : 1;
        page.render((body.innerHTML = '', body));
      });
      body.querySelector('[data-a="edit"]')?.addEventListener('click', () => {
        pushPage(
          mealEditorPage(structuredClone(meal), {
            onSaved: (m) => {
              meal = m;
              popPage();
            },
            onDeleted: () => (ctx.searchPage ? popTo(ctx.searchPage) : closeSheet()),
          }),
        );
      });

      btn.onclick = async () => {
        const a = amount();
        if (!(a > 0)) return toast('Vul een hoeveelheid in.', { error: true });
        if (entry) {
          entry.base = base();
          entry.amount = a;
          entry.unit = state.unit;
          entry.label = lbl();
          entry.moment = state.moment;
          await store.updateLog(entry);
          toast('Opgeslagen');
          return closeSheet();
        }
        ctx.moment = state.moment;
        await store.addLog({
          date: ctx.date,
          moment: state.moment,
          kind: 'meal',
          refId: meal.id,
          name: meal.name,
          amount: a,
          unit: state.unit,
          label: lbl(),
          base: base(),
        });
        afterAdd(ctx, meal.name);
      };
    },
  };
  return page;
}

// =====================================================================
// Snel invoeren (alleen kcal en macro's)
// =====================================================================

function quickAddPage(ctx, entry = null) {
  const draft = {
    name: entry?.name || '',
    kcal: entry?.base.kcal ?? null,
    prot: entry?.base.prot ?? null,
    carb: entry?.base.carb ?? null,
    fat: entry?.base.fat ?? null,
    moment: entry?.moment || ctx.moment,
  };
  return {
    title: entry ? 'Bewerken' : 'Snel invoeren',
    render(body) {
      body.append(
        html(`<div class="form">
          <label class="field"><span class="field-label">Omschrijving</span>
            <input data-k="name" value="${esc(draft.name)}" placeholder="Bijv. broodje uit de kantine"></label>
          <div class="nutrient-grid">
            ${[['kcal', 'Energie', 'kcal'], ['prot', 'Eiwit', 'g'], ['carb', 'Koolhydraten', 'g'], ['fat', 'Vet', 'g']]
              .map(
                ([k, l, u]) => `<label class="nrow"><span>${l}</span>
                <input data-k="${k}" inputmode="decimal" value="${esc(numToInput(draft[k]))}" placeholder="0"><span class="u">${u}</span></label>`,
              )
              .join('')}
          </div>
          <p class="hint" data-hint></p>
        </div>`),
      );
      const mp = html('<div class="field"><span class="field-label">Moment</span></div>');
      mp.append(momentPicker(draft.moment, (id) => (draft.moment = id)));
      body.append(mp);
      const btn = html(`<button class="btn primary block big">${entry ? 'Opslaan' : 'Toevoegen'}</button>`);
      body.append(btn);
      if (entry) {
        const del = html(`<button class="btn danger-ghost block">${icons.trash(18)} Verwijderen uit dagboek</button>`);
        del.onclick = async () => {
          await store.deleteLog(entry.id);
          toast('Verwijderd');
          closeSheet();
        };
        body.append(del);
      }
      const hint = body.querySelector('[data-hint]');
      const updateHint = () => {
        const calc = kcalFromMacros({ prot: draft.prot, carb: draft.carb, fat: draft.fat });
        hint.textContent = draft.kcal === null && calc > 0 ? `Geen kcal ingevuld: ik reken met ${fmt0(calc)} kcal (uit de macro's).` : '';
      };
      body.querySelectorAll('[data-k]').forEach((i) =>
        i.addEventListener('input', () => {
          draft[i.dataset.k] = i.dataset.k === 'name' ? i.value : parseNum(i.value);
          updateHint();
        }),
      );
      selectOnFocus(body);
      updateHint();
      btn.onclick = async () => {
        const n = { kcal: draft.kcal, prot: draft.prot || 0, carb: draft.carb || 0, fat: draft.fat || 0, fiber: 0 };
        if (n.kcal === null) n.kcal = kcalFromMacros(n);
        if (!(n.kcal > 0)) return toast('Vul in elk geval kcal of macro’s in.', { error: true });
        const name = draft.name.trim() || 'Snel ingevoerd';
        if (entry) {
          Object.assign(entry, { name, base: n, amount: 1, moment: draft.moment });
          await store.updateLog(entry);
          toast('Opgeslagen');
          return closeSheet();
        }
        ctx.moment = draft.moment;
        await store.addLog({ date: ctx.date, moment: draft.moment, kind: 'quick', refId: null, name, amount: 1, unit: '', label: '', base: n });
        afterAdd(ctx, name);
      };
    },
  };
}

// =====================================================================
// Barcode scannen
// =====================================================================

function cameraError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError') {
    return 'Geen toegang tot de camera. Sta cameratoegang toe (iPhone: Instellingen > Safari > Camera) en probeer opnieuw.';
  }
  if (name === 'NotFoundError') return 'Geen camera gevonden op dit apparaat.';
  if (!window.isSecureContext) return 'De camera werkt alleen via een beveiligde (https) verbinding.';
  return err?.message || 'De camera kon niet gestart worden.';
}

function scanPage(ctx) {
  let gen = 0;
  let stop = null;
  let busy = false;
  const page = {
    title: 'Barcode scannen',
    onLeave() {
      gen++;
      stop?.();
      stop = null;
    },
    render(body) {
      const myGen = ++gen;
      body.append(
        html(`<div class="scanner">
          <video playsinline muted autoplay></video>
          <div class="scan-frame"><span></span></div>
          <div class="scan-status">Camera starten…</div>
        </div>`),
      );
      body.append(
        html(`<form class="manual-code">
          <input inputmode="numeric" pattern="[0-9]*" placeholder="Of typ de cijfers onder de barcode" aria-label="Barcode">
          <button class="btn" type="submit">Zoek</button>
        </form>`),
      );
      body.append(html(`<p class="hint">Houd de barcode horizontaal in het kader, op ongeveer 15 cm afstand. Productgegevens komen uit Open Food Facts; producten die je zelf hebt toegevoegd gaan voor.</p>`));
      const video = body.querySelector('video');
      const status = body.querySelector('.scan-status');

      const handle = async (code) => {
        if (busy) return;
        busy = true;
        status.textContent = `Gevonden: ${code}. Opzoeken…`;
        try {
          await handleBarcode(code, ctx);
        } finally {
          busy = false;
        }
      };

      body.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const code = body.querySelector('form input').value.replace(/\D/g, '');
        if (code.length < 6) return toast('Vul een geldige barcode in.', { error: true });
        stop?.();
        handle(code);
      });

      startScanner(video, handle, (err) => console.warn(err))
        .then((s) => {
          if (myGen !== gen) return s();
          stop = s;
          status.textContent = 'Richt de camera op de barcode';
        })
        .catch((err) => {
          if (myGen === gen) {
            status.textContent = cameraError(err);
            status.classList.add('error');
          }
        });
    },
  };
  return page;
}

async function handleBarcode(code, ctx) {
  const local = await store.findByBarcode(code);
  if (local && off.isComplete(local)) return replacePage(productAmountPage(local, ctx));
  if (local) return replacePage(newProductPage(ctx, local));
  let product = null;
  try {
    product = await off.lookupBarcode(code);
  } catch {
    toast('Geen verbinding met Open Food Facts. Je kunt het product zelf toevoegen.', { error: true });
    return replacePage(newProductPage(ctx, { barcode: code }));
  }
  if (!product) {
    toast('Product niet gevonden. Voeg het zelf toe, dan herkent de app het de volgende keer.');
    return replacePage(newProductPage(ctx, { barcode: code }));
  }
  if (!off.isComplete(product)) {
    toast('Niet alle voedingswaarden zijn bekend. Vul ze aan (zie het etiket).');
    return replacePage(newProductPage(ctx, product));
  }
  replacePage(productAmountPage(product, ctx));
}

// =====================================================================
// Product bewerken / nieuw product
// =====================================================================

function productEditorPage(product, { onSaved, onDeleted, allowDelete = false } = {}) {
  const draft = {
    name: '',
    brand: '',
    barcode: '',
    unit: 'g',
    servings: [],
    ...structuredClone(product),
  };
  draft.per100 = { ...(product.per100 || {}) };
  draft.servings = (draft.servings || []).map((s) => ({ ...s }));
  const isExisting = !!product.id;

  const page = {
    title: isExisting ? 'Product bewerken' : product.source && product.source !== 'eigen' ? 'Product aanvullen' : 'Nieuw product',
    render(body) {
      const u = draft.unit === 'ml' ? 'ml' : 'g';
      body.append(
        html(`<div class="form">
          ${product.source && product.source !== 'eigen' ? `<p class="hint">Bron: ${esc(SOURCE_LABEL[product.source])}. Als je opslaat, wordt dit jouw eigen versie en gaat die voortaan voor.</p>` : ''}
          <label class="field"><span class="field-label">Naam</span>
            <input data-k="name" value="${esc(draft.name)}" placeholder="Bijv. Magere kwark" autocapitalize="sentences"></label>
          <label class="field"><span class="field-label">Merk (optioneel)</span>
            <input data-k="brand" value="${esc(draft.brand || '')}" placeholder="Bijv. AH"></label>
          <label class="field"><span class="field-label">Barcode (optioneel)</span>
            <input data-k="barcode" inputmode="numeric" value="${esc(draft.barcode || '')}" placeholder="Cijfers onder de streepjescode"></label>
          <div class="field"><span class="field-label">Eenheid</span><div data-unit-host></div></div>
          <h3 class="list-title">Voedingswaarden per 100 ${u}</h3>
          <div class="nutrient-grid">
            ${NUTRIENTS.map(
              (n) => `<label class="nrow${n.sub ? ' sub' : ''}"><span>${n.label}${n.required ? '' : ''}</span>
                <input data-n="${n.id}" inputmode="decimal" value="${esc(numToInput(draft.per100[n.id]))}" placeholder="${n.required ? '0' : '–'}">
                <span class="u">${n.unit}</span></label>`,
            ).join('')}
          </div>
          <p class="hint" data-hint></p>
          <h3 class="list-title">Porties (optioneel)</h3>
          <p class="hint">Bijv. “1 plak” = 35 g of “1 schep” = 30 g. Dan kun je straks per portie loggen.</p>
          <div class="servings"></div>
          <button class="btn ghost block" data-a="add-serving">${icons.plus(18)} Portie toevoegen</button>
          <button class="btn primary block big" data-a="save">Opslaan</button>
          ${isExisting && allowDelete ? `<button class="btn danger-ghost block" data-a="delete">${icons.trash(18)} Product verwijderen</button>` : ''}
        </div>`),
      );

      body.querySelector('[data-unit-host]').append(
        segmented(
          [
            { id: 'g', label: 'gram (g)' },
            { id: 'ml', label: 'milliliter (ml)' },
          ],
          u,
          (id) => {
            draft.unit = id;
            body.innerHTML = '';
            page.render(body);
          },
          { small: true },
        ),
      );

      const servingsEl = body.querySelector('.servings');
      const renderServings = () => {
        servingsEl.innerHTML = draft.servings
          .map(
            (s, i) => `<div class="serving-row" data-i="${i}">
              <input data-s="label" value="${esc(s.label)}" placeholder="1 plak" aria-label="Naam portie">
              <input data-s="grams" inputmode="decimal" value="${esc(numToInput(s.grams))}" placeholder="0" aria-label="Gewicht portie">
              <span class="u">${u}</span>
              <button class="icon-btn" data-a="del-serving" aria-label="Portie verwijderen">${icons.close(18)}</button>
            </div>`,
          )
          .join('');
      };
      renderServings();
      servingsEl.addEventListener('input', (e) => {
        const row = e.target.closest('[data-i]');
        const s = draft.servings[Number(row.dataset.i)];
        if (e.target.dataset.s === 'label') s.label = e.target.value;
        else s.grams = parseNum(e.target.value);
      });
      servingsEl.addEventListener('click', (e) => {
        if (!e.target.closest('[data-a="del-serving"]')) return;
        draft.servings.splice(Number(e.target.closest('[data-i]').dataset.i), 1);
        renderServings();
      });
      body.querySelector('[data-a="add-serving"]').onclick = () => {
        draft.servings.push({ label: '', grams: null });
        renderServings();
        servingsEl.querySelector('.serving-row:last-child input')?.focus();
      };

      const hint = body.querySelector('[data-hint]');
      const updateHint = () => {
        const p = draft.per100;
        const calc = kcalFromMacros(p);
        if (calc > 0 && Number.isFinite(p.kcal) && Math.abs(calc - p.kcal) > Math.max(25, p.kcal * 0.15)) {
          hint.textContent = `Let op: uit de macro’s volgt ongeveer ${fmt0(calc)} kcal. Controleer de waarden op het etiket.`;
        } else if (!Number.isFinite(p.kcal) && calc > 0) {
          hint.textContent = `Geen kcal ingevuld: bij opslaan gebruik ik ${fmt0(calc)} kcal (uit de macro’s).`;
        } else hint.textContent = '';
      };
      body.querySelectorAll('[data-k]').forEach((i) => i.addEventListener('input', () => (draft[i.dataset.k] = i.value)));
      body.querySelectorAll('[data-n]').forEach((i) =>
        i.addEventListener('input', () => {
          draft.per100[i.dataset.n] = parseNum(i.value);
          updateHint();
        }),
      );
      selectOnFocus(body);
      updateHint();

      body.querySelector('[data-a="save"]').onclick = async () => {
        const name = (draft.name || '').trim();
        if (!name) return toast('Geef het product een naam.', { error: true });
        const p = draft.per100;
        for (const k of ['prot', 'carb', 'fat']) if (!Number.isFinite(p[k])) p[k] = null;
        const missing = ['prot', 'carb', 'fat'].filter((k) => p[k] === null);
        if (missing.length) return toast('Vul eiwit, koolhydraten en vet in (0 mag ook).', { error: true });
        if (!Number.isFinite(p.kcal)) p.kcal = Math.round(kcalFromMacros(p));
        const servings = draft.servings
          .filter((s) => s.grams > 0)
          .map((s) => ({ label: (s.label || '').trim() || '1 portie', grams: s.grams }));
        const barcode = (draft.barcode || '').replace(/\D/g, '') || null;
        // Zelfde barcode al als eigen product? Dan dat product bijwerken in plaats van een dubbel.
        let id = product.id || null;
        if (!id && barcode) {
          const existing = await store.findByBarcode(barcode);
          if (existing) id = existing.id;
        }
        const { image, quantity, ...rest } = draft;
        const saved = await store.saveProduct({
          ...rest,
          id,
          name,
          brand: (draft.brand || '').trim(),
          barcode,
          unit: draft.unit === 'ml' ? 'ml' : 'g',
          source: 'eigen',
          per100: { ...p },
          servings,
        });
        toast('Product opgeslagen');
        onSaved?.(saved);
      };

      body.querySelector('[data-a="delete"]')?.addEventListener('click', async () => {
        if (!(await confirmDialog(`“${product.name}” verwijderen? Je dagboek blijft gewoon kloppen.`))) return;
        await store.deleteProduct(product.id);
        toast('Product verwijderd');
        onDeleted?.();
      });
    },
  };
  return page;
}

// =====================================================================
// Maaltijd / recept bewerken
// =====================================================================

function mealEditorPage(meal, { onSaved, onDeleted } = {}) {
  const draft = meal || { id: null, name: '', portions: 1, totalGrams: null, items: [] };
  if (!draft.items) draft.items = [];
  if (!(draft.portions > 0)) draft.portions = 1;

  const page = {
    title: draft.id ? 'Maaltijd bewerken' : 'Nieuwe maaltijd',
    render(body) {
      body.append(
        html(`<div class="form">
          <label class="field"><span class="field-label">Naam</span>
            <input data-k="name" value="${esc(draft.name)}" placeholder="Bijv. Havermout ontbijt" autocapitalize="sentences"></label>
          <div class="two-col">
            <label class="field"><span class="field-label">Aantal porties</span>
              <input data-k="portions" inputmode="decimal" value="${esc(numToInput(draft.portions))}"></label>
            <label class="field"><span class="field-label">Gewicht na bereiden</span>
              <input data-k="totalGrams" inputmode="decimal" value="${esc(numToInput(draft.totalGrams))}" placeholder="optioneel, in g"></label>
          </div>
          <p class="hint">Een recept voor meerdere keren? Vul het aantal porties in. Weeg je liever af wat je opschept, vul dan het totale gewicht van de pan in.</p>
          <h3 class="list-title">Ingrediënten</h3>
          <div class="meal-items"></div>
          <button class="btn ghost block" data-a="add">${icons.plus(18)} Ingrediënt toevoegen</button>
          <div class="card meal-totals"></div>
          <button class="btn primary block big" data-a="save">Maaltijd opslaan</button>
          ${draft.id ? `<button class="btn danger-ghost block" data-a="delete">${icons.trash(18)} Maaltijd verwijderen</button>` : ''}
        </div>`),
      );

      const itemsEl = body.querySelector('.meal-items');
      const totalsEl = body.querySelector('.meal-totals');
      const renderItems = () => {
        itemsEl.innerHTML = draft.items.length
          ? draft.items
              .map(
                (it, i) => `<div class="meal-item" data-i="${i}">
                  <div class="mi-main"><div class="row-title">${esc(it.name)}</div>
                  <div class="row-sub" data-kcal>${fmt0(scaleN(store.productBase({ per100: it.per100 }), it.grams || 0).kcal)} kcal</div></div>
                  <input inputmode="decimal" value="${esc(numToInput(it.grams))}" aria-label="Gram">
                  <span class="u">g</span>
                  <button class="icon-btn" data-a="del" aria-label="Verwijderen">${icons.close(18)}</button>
                </div>`,
              )
              .join('')
          : '<p class="empty">Nog geen ingrediënten.</p>';
        selectOnFocus(itemsEl);
      };
      const renderTotals = () => {
        const t = store.mealTotals(draft);
        totalsEl.innerHTML = `
          ${nutritionPreview(t.perPortion, { title: 'per portie' })}
          <p class="hint">Totaal: ${fmt0(t.total.kcal)} kcal · ${macroLine(t.total)}${t.portions !== 1 ? ` · ${fmt0(t.portions)} porties` : ''}</p>`;
      };
      renderItems();
      renderTotals();

      itemsEl.addEventListener('input', (e) => {
        const row = e.target.closest('[data-i]');
        const it = draft.items[Number(row.dataset.i)];
        it.grams = parseNum(e.target.value) || 0;
        row.querySelector('[data-kcal]').textContent = `${fmt0(scaleN(store.productBase({ per100: it.per100 }), it.grams).kcal)} kcal`;
        renderTotals();
      });
      itemsEl.addEventListener('click', (e) => {
        if (!e.target.closest('[data-a="del"]')) return;
        draft.items.splice(Number(e.target.closest('[data-i]').dataset.i), 1);
        renderItems();
        renderTotals();
      });
      body.querySelectorAll('[data-k]').forEach((i) =>
        i.addEventListener('input', () => {
          const k = i.dataset.k;
          draft[k] = k === 'name' ? i.value : parseNum(i.value);
          renderTotals();
        }),
      );
      selectOnFocus(body);

      body.querySelector('[data-a="add"]').onclick = () => {
        pushPage(
          searchPage({
            mode: 'pick',
            onPick: (product, grams) => {
              draft.items.push({
                productId: product.id,
                name: product.name,
                brand: product.brand || '',
                grams,
                per100: { ...product.per100 },
              });
              popTo(page);
            },
          }),
        );
      };

      body.querySelector('[data-a="save"]').onclick = async () => {
        const name = (draft.name || '').trim();
        if (!name) return toast('Geef de maaltijd een naam.', { error: true });
        if (!draft.items.length) return toast('Voeg minstens één ingrediënt toe.', { error: true });
        const saved = await store.saveMeal({
          ...draft,
          name,
          portions: draft.portions > 0 ? draft.portions : 1,
          totalGrams: draft.totalGrams > 0 ? draft.totalGrams : null,
          items: draft.items.filter((it) => it.grams > 0),
        });
        toast('Maaltijd opgeslagen');
        onSaved?.(saved);
      };
      body.querySelector('[data-a="delete"]')?.addEventListener('click', async () => {
        if (!(await confirmDialog(`“${draft.name}” verwijderen? Je dagboek blijft gewoon kloppen.`))) return;
        await store.deleteMeal(draft.id);
        toast('Maaltijd verwijderd');
        onDeleted?.();
      });
    },
  };
  return page;
}
