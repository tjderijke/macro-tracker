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

// Vitamines en mineralen, per 100 g in de eenheid hieronder (zoals in de NEVO-tabel).
// `nevo`: kolomcode in de NEVO-tabel; `off`: naam bij Open Food Facts (daar altijd in gram).
// `goal`: aanbevolen hoeveelheid per dag voor volwassen mannen (Gezondheidsraad/Voedingscentrum),
// aan te passen in Instellingen. `max`: een bovengrens in plaats van een minimum.
export const MICROS = [
  { id: 'vita', label: 'Vitamine A', unit: 'µg', group: 'vit', nevo: 'VITA_RAE', off: 'vitamin-a', goal: 800 },
  { id: 'vitb1', label: 'Vitamine B1', unit: 'mg', group: 'vit', nevo: 'THIA', off: 'vitamin-b1', goal: 1.1 },
  { id: 'vitb2', label: 'Vitamine B2', unit: 'mg', group: 'vit', nevo: 'RIBF', off: 'vitamin-b2', goal: 1.6 },
  { id: 'vitb6', label: 'Vitamine B6', unit: 'mg', group: 'vit', nevo: 'VITB6', off: 'vitamin-b6', goal: 1.5 },
  { id: 'folaat', label: 'Foliumzuur', unit: 'µg', group: 'vit', nevo: 'FOL', off: 'vitamin-b9', goal: 300 },
  { id: 'vitb12', label: 'Vitamine B12', unit: 'µg', group: 'vit', nevo: 'VITB12', off: 'vitamin-b12', goal: 2.8 },
  { id: 'vitc', label: 'Vitamine C', unit: 'mg', group: 'vit', nevo: 'VITC', off: 'vitamin-c', goal: 75 },
  { id: 'vitd', label: 'Vitamine D', unit: 'µg', group: 'vit', nevo: 'VITD', off: 'vitamin-d', goal: 10 },
  { id: 'vite', label: 'Vitamine E', unit: 'mg', group: 'vit', nevo: 'VITE', off: 'vitamin-e', goal: 13 },
  { id: 'vitk', label: 'Vitamine K', unit: 'µg', group: 'vit', nevo: 'VITK', off: 'vitamin-k', goal: 70 },
  { id: 'calcium', label: 'Calcium', unit: 'mg', group: 'min', nevo: 'CA', off: 'calcium', goal: 950 },
  { id: 'ijzer', label: 'IJzer', unit: 'mg', group: 'min', nevo: 'FE', off: 'iron', goal: 11 },
  { id: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'min', nevo: 'MG', off: 'magnesium', goal: 350 },
  { id: 'zink', label: 'Zink', unit: 'mg', group: 'min', nevo: 'ZN', off: 'zinc', goal: 11 },
  { id: 'kalium', label: 'Kalium', unit: 'mg', group: 'min', nevo: 'K', off: 'potassium', goal: 3500 },
  { id: 'seleen', label: 'Seleen', unit: 'µg', group: 'min', nevo: 'SE', off: 'selenium', goal: 70 },
  { id: 'jodium', label: 'Jodium', unit: 'µg', group: 'min', nevo: 'ID', off: 'iodine', goal: 150 },
  // EPA + DHA: in NEVO en Open Food Facts twee losse vetzuren in gram; wij tellen ze op in mg.
  { id: 'epadha', label: 'Visvetzuren (EPA+DHA)', unit: 'mg', group: 'overig', goal: 200 },
  { id: 'salt', label: 'Zout', unit: 'g', group: 'overig', goal: 6, max: true },
];

const MICRO_IDS = MICROS.filter((m) => m.id !== 'salt').map((m) => m.id);

// Heeft dit product (per 100 g) bruikbare gegevens over vitamines en mineralen?
export function hasMicros(per100) {
  if (!per100) return false;
  return MICRO_IDS.filter((k) => Number.isFinite(per100[k])).length >= 5;
}

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

// Kort met weekdag, bijv. "ma 19 okt"; vandaag en gisteren als woord.
const dfDay = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
export function fmtDayShort(iso) {
  const t = today();
  if (iso === t) return 'vandaag';
  if (iso === addDays(t, -1)) return 'gisteren';
  return dfDay.format(parseDate(iso));
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

// Optellen en schalen werken op alle waarden die erin staan (macro's én micronutriënten).
// Ontbrekende waarden tellen als 0.
export function addN(a, b) {
  const out = emptyN();
  for (const src of [a, b]) {
    for (const k in src) if (Number.isFinite(src[k])) out[k] = (out[k] || 0) + src[k];
  }
  return out;
}

export function scaleN(n, factor) {
  const out = emptyN();
  for (const k in n) if (Number.isFinite(n[k])) out[k] = n[k] * factor;
  return out;
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
