// Hulpfuncties: getallen, datums, voedingswaarden en HTML-escaping.

export const MOMENTS = [
  { id: 'ontbijt', label: 'Ontbijt' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'avondeten', label: 'Avondeten' },
  { id: 'snacks', label: 'Snacks' },
];

export const MACROS = [
  { id: 'prot', label: 'Eiwit', short: 'E' },
  { id: 'carb', label: 'Koolhydraten', short: 'K' },
  { id: 'fat', label: 'Vet', short: 'V' },
];

// Alle voedingswaarden die we per 100 g bijhouden.
export const NUTRIENTS = [
  { id: 'kcal', label: 'Energie', unit: 'kcal', required: true },
  { id: 'prot', label: 'Eiwit', unit: 'g', required: true },
  { id: 'carb', label: 'Koolhydraten', unit: 'g', required: true },
  { id: 'sugar', label: 'waarvan suikers', unit: 'g', sub: true },
  { id: 'fat', label: 'Vet', unit: 'g', required: true },
  { id: 'satfat', label: 'waarvan verzadigd', unit: 'g', sub: true },
  { id: 'fiber', label: 'Vezels', unit: 'g' },
  { id: 'salt', label: 'Zout', unit: 'g' },
];

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const nf0 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

export function fmt0(n) {
  return nf0.format(Math.round(n || 0));
}

export function fmt1(n) {
  return nf1.format(Math.round((n || 0) * 10) / 10);
}

// Grammen: onder de 10 met één decimaal, daarboven afgerond.
export function fmtG(n) {
  return Math.abs(n || 0) < 10 ? fmt1(n) : fmt0(n);
}

// Leest "12,5" of "12.5" als 12.5; leeg of ongeldig wordt null.
export function parseNum(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Getal naar invoerveld-tekst met komma.
export function numToInput(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

// --- Datums (altijd lokale tijd, als 'YYYY-MM-DD') ---

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today() {
  return toISODate(new Date());
}

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

const dfLong = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
const dfShort = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' });
const dfShortYear = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });

export function fmtDayTitle(iso) {
  const t = today();
  if (iso === t) return 'Vandaag';
  if (iso === addDays(t, -1)) return 'Gisteren';
  if (iso === addDays(t, 1)) return 'Morgen';
  const s = dfLong.format(parseDate(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtDateShort(iso, withYear = false) {
  return (withYear ? dfShortYear : dfShort).format(parseDate(iso));
}

// 0 = zondag ... 6 = zaterdag
export function weekday(iso) {
  return parseDate(iso).getDay();
}

// --- Voedingswaarden ---

export function emptyN() {
  return { kcal: 0, prot: 0, carb: 0, fat: 0, fiber: 0 };
}

export function addN(a, b) {
  return {
    kcal: (a.kcal || 0) + (b.kcal || 0),
    prot: (a.prot || 0) + (b.prot || 0),
    carb: (a.carb || 0) + (b.carb || 0),
    fat: (a.fat || 0) + (b.fat || 0),
    fiber: (a.fiber || 0) + (b.fiber || 0),
  };
}

export function scaleN(n, factor) {
  return {
    kcal: (n.kcal || 0) * factor,
    prot: (n.prot || 0) * factor,
    carb: (n.carb || 0) * factor,
    fat: (n.fat || 0) * factor,
    fiber: (n.fiber || 0) * factor,
  };
}

export function sumN(list) {
  return list.reduce((acc, n) => addN(acc, n), emptyN());
}

// Kcal berekend uit macro's (Atwater: 4/4/9).
export function kcalFromMacros(n) {
  return (n.prot || 0) * 4 + (n.carb || 0) * 4 + (n.fat || 0) * 9;
}

export function macroLine(n) {
  return `E ${fmtG(n.prot)} · K ${fmtG(n.carb)} · V ${fmtG(n.fat)}`;
}

// Zoeken: kleine letters, zonder accenten.
export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
