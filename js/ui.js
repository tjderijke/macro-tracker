// UI-bouwstenen: schuifpaneel (sheet) met pagina's, meldingen en bevestigingen.

import { esc } from './util.js';

const sheetEl = () => document.getElementById('sheet');
let stack = [];
let onCloseHandlers = [];

// Een pagina: { title, render(body, ctx), action?: { label, onClick }, onLeave?() }
export function openSheet(page, { onClose } = {}) {
  closeSheet(true);
  stack = [];
  onCloseHandlers = onClose ? [onClose] : [];
  const el = sheetEl();
  el.hidden = false;
  document.body.classList.add('sheet-open');
  // Pas in het volgende frame openen (voor de schuifanimatie), maar niet als hij intussen al gesloten is.
  requestAnimationFrame(() => stack.length && el.classList.add('open'));
  pushPage(page);
}

export function pushPage(page) {
  stack.at(-1)?.onLeave?.();
  stack.push(page);
  renderTop();
}

export function popPage() {
  if (stack.length <= 1) return closeSheet();
  stack.pop().onLeave?.();
  renderTop();
}

// Terug tot en met de gegeven pagina (die bovenaan komt te staan).
export function popTo(page) {
  if (!stack.includes(page)) return;
  while (stack.at(-1) !== page) stack.pop().onLeave?.();
  renderTop();
}

// Vervangt de bovenste pagina (bijv. na scannen: scanner -> productpagina).
export function replacePage(page) {
  stack.pop()?.onLeave?.();
  stack.push(page);
  renderTop();
}

export function closeSheet(silent = false) {
  const el = sheetEl();
  if (!el || el.hidden) return;
  while (stack.length) stack.pop().onLeave?.();
  el.classList.remove('open');
  document.body.classList.remove('sheet-open');
  setTimeout(() => {
    if (!el.classList.contains('open')) {
      el.hidden = true;
      el.querySelector('.sheet-body').innerHTML = '';
    }
  }, 250);
  const handlers = onCloseHandlers;
  onCloseHandlers = [];
  if (!silent) handlers.forEach((h) => h());
}

export function isSheetOpen() {
  return stack.length > 0;
}

// Opnieuw tekenen van de bovenste pagina (na een wijziging).
export function refreshPage() {
  renderTop();
}

function renderTop() {
  const page = stack.at(-1);
  if (!page) return;
  const el = sheetEl();
  const head = el.querySelector('.sheet-head');
  const body = el.querySelector('.sheet-body');
  head.innerHTML = `
    <button class="head-btn left" data-act="back">${stack.length > 1 ? '‹ Terug' : 'Sluiten'}</button>
    <h2>${esc(page.title || '')}</h2>
    ${page.action ? `<button class="head-btn right strong" data-act="action">${esc(page.action.label)}</button>` : '<span class="head-btn right"></span>'}
  `;
  head.querySelector('[data-act="back"]').onclick = () => popPage();
  if (page.action) head.querySelector('[data-act="action"]').onclick = () => page.action.onClick();
  body.innerHTML = '';
  body.scrollTop = 0;
  page.render(body);
}

// --- Meldingen ---

let toastTimer;
export function toast(message, { error = false } = {}) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => (el.hidden = true), 250);
  }, error ? 4500 : 2200);
}

export function confirmDialog(message) {
  return Promise.resolve(window.confirm(message));
}

// HTML-string naar één element.
export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

// Segmented control: opties [{id,label}], geselecteerd id, onChange(id).
export function segmented(options, selected, onChange, { small = false } = {}) {
  const el = html(`<div class="segmented${small ? ' small' : ''}" role="tablist">
    ${options
      .map(
        (o) =>
          `<button role="tab" data-id="${esc(o.id)}" aria-selected="${o.id === selected}">${esc(o.label)}</button>`,
      )
      .join('')}
  </div>`);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    onChange(b.dataset.id);
  });
  return el;
}

// Selecteert de inhoud van een numeriek veld bij focus (snel overtypen op de telefoon).
export function selectOnFocus(root) {
  root.querySelectorAll('input[inputmode="decimal"], input[inputmode="numeric"]').forEach((i) => {
    i.addEventListener('focus', () => setTimeout(() => i.select(), 0));
  });
}
