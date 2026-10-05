// Bibliotheek: je eigen producten en maaltijden beheren.

import * as store from '../store.js';
import { openProductEditor, openMealEditor } from '../food.js';
import { html, segmented } from '../ui.js';
import { icons } from '../icons.js';
import { esc, fmt0, macroLine, norm } from '../util.js';

const SOURCE = { eigen: 'Eigen', off: 'Open Food Facts', nevo: 'NEVO' };

export async function renderLibrary(root, app) {
  const tab = app.libraryTab || 'meals';
  const query = app.libraryQuery || '';
  root.innerHTML = '';
  root.append(html(`<header class="view-head"><h1>Bibliotheek</h1></header>`));

  const tabs = segmented(
    [
      { id: 'meals', label: 'Maaltijden' },
      { id: 'products', label: 'Producten' },
    ],
    tab,
    (id) => {
      app.libraryTab = id;
      app.render();
    },
  );
  root.append(tabs);

  const tools = html(`<div class="lib-tools">
    <div class="search-bar"><span class="search-icon">${icons.search(18)}</span>
      <input type="search" placeholder="Filter" value="${esc(query)}" autocomplete="off" autocorrect="off" spellcheck="false"></div>
    <button class="btn primary small" data-a="new">${icons.plus(18)} Nieuw</button>
  </div>`);
  root.append(tools);
  const listEl = html('<div class="list"></div>');
  root.append(listEl);

  tools.querySelector('[data-a="new"]').onclick = () => (tab === 'meals' ? openMealEditor() : openProductEditor());

  const meals = (await store.allMeals()).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  const products = (await store.allProducts()).sort(
    (a, b) => (a.source === 'eigen' ? 0 : 1) - (b.source === 'eigen' ? 0 : 1) || a.name.localeCompare(b.name, 'nl'),
  );

  const draw = () => {
    const tokens = norm(app.libraryQuery || '').split(/\s+/).filter(Boolean);
    const match = (s) => tokens.every((t) => norm(s).includes(t));
    if (tab === 'meals') {
      const list = meals.filter((m) => match(m.name));
      listEl.innerHTML = list.length
        ? list
            .map((m) => {
              const t = store.mealTotals(m);
              return `<button class="row" data-id="${esc(m.id)}">
                <span class="row-main"><span class="row-title">${esc(m.name)}</span>
                <span class="row-sub">${m.items.length} ingrediënten · per portie ${fmt0(t.perPortion.kcal)} kcal · ${macroLine(t.perPortion)}</span></span>
                <span class="row-chev">${icons.right(16)}</span></button>`;
            })
            .join('')
        : `<p class="empty">${meals.length ? 'Geen maaltijden gevonden.' : 'Nog geen maaltijden. Tik op “Nieuw” om je eerste maaltijd of recept te maken.'}</p>`;
    } else {
      const list = products.filter((p) => match(`${p.name} ${p.brand || ''}`));
      listEl.innerHTML = list.length
        ? list
            .map(
              (p) => `<button class="row" data-id="${esc(p.id)}">
                <span class="row-main"><span class="row-title">${esc(p.name)}</span>
                <span class="row-sub">${esc([p.brand, `${fmt0(p.per100?.kcal)} kcal per 100 ${p.unit === 'ml' ? 'ml' : 'g'}`].filter(Boolean).join(' · '))}</span></span>
                <span class="badge">${SOURCE[p.source] || 'Eigen'}</span>
                <span class="row-chev">${icons.right(16)}</span></button>`,
            )
            .join('')
        : `<p class="empty">${products.length ? 'Geen producten gevonden.' : 'Nog geen producten. Producten die je scant, zoekt of zelf aanmaakt verschijnen hier.'}</p>`;
    }
  };
  draw();

  tools.querySelector('input').addEventListener('input', (e) => {
    app.libraryQuery = e.target.value;
    draw();
  });
  listEl.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    if (tab === 'meals') openMealEditor(meals.find((m) => m.id === row.dataset.id));
    else openProductEditor(products.find((p) => p.id === row.dataset.id));
  });
}
