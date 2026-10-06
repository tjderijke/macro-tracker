// Start van de app: navigatie tussen de schermen.

import { renderToday } from './views/today.js';
import { renderLibrary } from './views/library.js';
import { renderWeight } from './views/weight.js';
import { renderSettings } from './views/settings.js';
import { setChangeHandler } from './food.js';
import { isSheetOpen, closeSheet } from './ui.js';
import { esc, today } from './util.js';

const VIEWS = {
  vandaag: renderToday,
  bibliotheek: renderLibrary,
  gewicht: renderWeight,
  instellingen: renderSettings,
};

const app = {
  date: today(),
  view: 'vandaag',
  rendering: null,

  go(view) {
    if (location.hash !== `#${view}`) location.hash = view;
    else this.render();
  },

  setDate(date) {
    this.date = date;
    this.render();
  },

  async render() {
    const view = VIEWS[this.view] ? this.view : 'vandaag';
    document.querySelectorAll('.tabbar a').forEach((a) => {
      if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const root = document.getElementById('view');
    const keepScroll = root.dataset.view === view ? root.scrollTop : 0;
    // Teken in een los element en wissel daarna, zodat het scherm niet knippert.
    const next = document.createElement('div');
    const token = Symbol();
    this.rendering = token;
    try {
      await VIEWS[view](next, this);
    } catch (err) {
      console.error(err);
      next.innerHTML = `<p class="empty error-text">Er ging iets mis: ${esc(err.message || err)}</p>`;
    }
    if (this.rendering !== token) return;
    root.replaceChildren(...next.childNodes);
    root.dataset.view = view;
    root.scrollTop = keepScroll;
  },
};

function route() {
  const v = location.hash.replace('#', '') || 'vandaag';
  if (isSheetOpen()) closeSheet(true);
  app.view = VIEWS[v] ? v : 'vandaag';
  document.getElementById('view').scrollTop = 0;
  app.render();
}

window.addEventListener('hashchange', route);
setChangeHandler(() => app.render());

// Als de app de volgende dag weer geopend wordt, spring naar de nieuwe dag.
let lastToday = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (today() !== lastToday) {
    if (app.date === lastToday) app.date = today();
    lastToday = today();
    if (!isSheetOpen()) app.render();
  }
});

route();

// Vraag het systeem de gegevens niet zomaar op te ruimen.
navigator.storage?.persist?.().catch(() => {});

// Service worker: laat de app ook offline openen.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW', err));
}
