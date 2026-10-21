// Gegevenslaag van de app: instellingen, doelen, dagboek, producten, maaltijden en gewicht.

import * as db from './db.js';
import { weekday, scaleN, sumN, norm, emptyN, NUTRIENTS, MICROS, hasMicros } from './util.js';

const emptyGoal = () => ({ kcal: null, prot: null, carb: null, fat: null });

// Pillen die je dagelijks afvinkt. `micros`: wat één dosis bevat (in de eenheden van MICROS).
const DEFAULT_SUPPLEMENTS = [
  { id: 's_creatine', name: 'Creatine', micros: {} },
  { id: 's_vitamines', name: 'Vitamines', micros: {} },
];

export const defaultMicroGoals = () => Object.fromEntries(MICROS.map((m) => [m.id, m.goal]));

// --- Instellingen en doelen ---

let settingsCache = null;

export async function getSettings() {
  if (settingsCache) return settingsCache;
  const s = (await db.get('settings', 'main')) || {};
  settingsCache = {
    key: 'main',
    goals: {
      training: { ...emptyGoal(), ...(s.goals?.training || {}) },
      rust: { ...emptyGoal(), ...(s.goals?.rust || {}) },
    },
    trainingDays: Array.isArray(s.trainingDays) ? s.trainingDays : [],
    supplements: Array.isArray(s.supplements) ? s.supplements : structuredClone(DEFAULT_SUPPLEMENTS),
    microGoals: { ...defaultMicroGoals(), ...(s.microGoals || {}) },
  };
  return settingsCache;
}

export async function saveSettings(s) {
  settingsCache = s;
  await db.put('settings', s);
}

export function invalidateCaches() {
  settingsCache = null;
}

export function hasGoals(goal) {
  return Number.isFinite(goal?.kcal) && goal.kcal > 0;
}

export async function getDayType(date) {
  const override = await db.get('days', date);
  if (override?.type) return override.type;
  const s = await getSettings();
  return s.trainingDays.includes(weekday(date)) ? 'training' : 'rust';
}

// Per dag: { date, type?, checks?: { [id]: true } } (type alleen als je het zelf omzet).
async function getDay(date) {
  return (await db.get('days', date)) || { date };
}

export async function setDayType(date, type) {
  await db.put('days', { ...(await getDay(date)), date, type });
}

export async function checksFor(date) {
  return (await getDay(date)).checks || {};
}

// Zet een afvinkje (supplement of weekcheck) aan of uit. Geeft de nieuwe stand terug.
export async function toggleCheck(date, id) {
  const day = await getDay(date);
  const checks = { ...(day.checks || {}) };
  if (checks[id]) delete checks[id];
  else checks[id] = true;
  await db.put('days', { ...day, checks });
  return !!checks[id];
}

export function daysBetween(from, to) {
  return db.getRange('days', from, to);
}

export async function goalsFor(date) {
  const type = await getDayType(date);
  const s = await getSettings();
  return { type, goal: s.goals[type] };
}

// --- Dagboek ---

export async function logForDate(date) {
  const entries = await db.getByIndex('log', 'date', date);
  return entries.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export function logBetween(from, to) {
  return db.getRange('log', from, to, 'date');
}

export async function addLog(entry) {
  const e = {
    id: db.uid('l'),
    createdAt: new Date().toISOString(),
    ...entry,
    n: scaleN(entry.base, entry.amount),
  };
  await db.put('log', e);
  if (e.kind === 'product' && e.refId) await touch('products', e.refId);
  if (e.kind === 'meal' && e.refId) await touch('meals', e.refId);
  return e;
}

export async function updateLog(entry) {
  entry.n = scaleN(entry.base, entry.amount);
  return db.put('log', entry);
}

export function deleteLog(id) {
  return db.del('log', id);
}

async function touch(storeName, id) {
  const item = await db.get(storeName, id);
  if (!item) return;
  item.lastUsed = new Date().toISOString();
  item.useCount = (item.useCount || 0) + 1;
  await db.put(storeName, item);
}

// --- Producten ---

const BASE_KEYS = [...new Set([...NUTRIENTS, ...MICROS].map((n) => n.id))];

export function productBase(product) {
  // Voedingswaarden per 1 gram (of ml), inclusief vitamines en mineralen als die bekend zijn.
  const p = product.per100 || {};
  const n = {};
  for (const k of BASE_KEYS) if (Number.isFinite(p[k])) n[k] = p[k];
  // `mk`: kcal waarvan de micronutriënten bekend zijn (om te laten zien hoe volledig het dagtotaal is).
  if (hasMicros(p)) n.mk = p.kcal || 0;
  return scaleN(n, 1 / 100);
}

export function getProduct(id) {
  return db.get('products', id);
}

export async function allProducts() {
  return db.getAll('products');
}

// Eigen producten gaan voor: eerst 'eigen', daarna opgeslagen OFF/NEVO-producten.
export async function findByBarcode(code) {
  const list = await db.getByIndex('products', 'barcode', code);
  if (!list.length) return null;
  return list.find((p) => p.source === 'eigen') || list[0];
}

export async function saveProduct(p) {
  const now = new Date().toISOString();
  const product = { ...p };
  if (!product.id) {
    product.id = db.uid('p');
    product.createdAt = now;
  }
  product.updatedAt = now;
  if (!product.barcode) product.barcode = null;
  await db.put('products', product);
  return product;
}

export function deleteProduct(id) {
  return db.del('products', id);
}

// Zorgt dat een product uit Open Food Facts of NEVO lokaal bewaard is (voor 'recent' en offline gebruik).
export async function ensureLocalProduct(p) {
  if (p.id) return p;
  if (p.barcode) {
    const existing = await findByBarcode(p.barcode);
    if (existing) return existing;
  }
  if (p.nevoCode) {
    const all = await db.getAll('products');
    const existing = all.find((x) => x.nevoCode === p.nevoCode);
    if (existing) return existing;
  }
  const { image, quantity, ...rest } = p;
  return saveProduct(rest);
}

// --- Maaltijden ---

export function getMeal(id) {
  return db.get('meals', id);
}

export function allMeals() {
  return db.getAll('meals');
}

export async function saveMeal(m) {
  const now = new Date().toISOString();
  const meal = { ...m };
  if (!meal.id) {
    meal.id = db.uid('m');
    meal.createdAt = now;
  }
  meal.updatedAt = now;
  await db.put('meals', meal);
  return meal;
}

export function deleteMeal(id) {
  return db.del('meals', id);
}

export function mealTotals(meal) {
  const total = sumN(
    (meal.items || []).map((it) => scaleN(productBase({ per100: it.per100 }), it.grams || 0)),
  );
  const portions = meal.portions > 0 ? meal.portions : 1;
  const perPortion = scaleN(total, 1 / portions);
  const rawGrams = (meal.items || []).reduce((s, it) => s + (it.grams || 0), 0);
  const totalGrams = meal.totalGrams > 0 ? meal.totalGrams : null;
  const perGram = totalGrams ? scaleN(total, 1 / totalGrams) : null;
  return { total, perPortion, perGram, portions, rawGrams, totalGrams };
}

// --- Zoeken in eigen producten en maaltijden ---

export async function searchLocal(query) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  const match = (text) => tokens.every((t) => text.includes(t));
  const [products, meals] = await Promise.all([allProducts(), allMeals()]);
  const sourceRank = { eigen: 0, off: 1, nevo: 2 };
  const prods = products
    .filter((p) => match(norm(`${p.name} ${p.brand || ''} ${p.barcode || ''}`)))
    .sort(
      (a, b) =>
        (sourceRank[a.source] ?? 3) - (sourceRank[b.source] ?? 3) ||
        (b.useCount || 0) - (a.useCount || 0) ||
        a.name.localeCompare(b.name, 'nl'),
    );
  const ms = meals
    .filter((m) => match(norm(m.name)))
    .sort((a, b) => (b.useCount || 0) - (a.useCount || 0) || a.name.localeCompare(b.name, 'nl'));
  return { products: prods, meals: ms };
}

export async function recentItems(limit = 30) {
  const [products, meals] = await Promise.all([allProducts(), allMeals()]);
  return [
    ...products.filter((p) => p.lastUsed).map((p) => ({ type: 'product', item: p })),
    ...meals.filter((m) => m.lastUsed).map((m) => ({ type: 'meal', item: m })),
  ]
    .sort((a, b) => b.item.lastUsed.localeCompare(a.item.lastUsed))
    .slice(0, limit);
}

// --- Micronutriënten achteraf aanvullen (na het importeren van de NEVO-tabel) ---

const MICRO_KEYS = MICROS.map((m) => m.id);

// Voegt alleen ontbrekende micronutriënten toe; macro's en eigen waarden blijven zoals ze zijn.
function fillMissing(target, source) {
  let changed = false;
  for (const k of MICRO_KEYS) {
    if (!Number.isFinite(target[k]) && Number.isFinite(source[k])) {
      target[k] = source[k];
      changed = true;
    }
  }
  return changed;
}

// Vult producten, maaltijden en dagboekregels die uit NEVO komen aan met vitamines en mineralen.
// `nevoItems`: de NEVO-records (met per100 inclusief micronutriënten).
export async function backfillMicros(nevoItems) {
  const byCode = new Map(nevoItems.map((n) => [n.code, n.per100]));
  const products = await db.getAll('products');
  const productById = new Map();
  for (const p of products) {
    productById.set(p.id, p);
    const src = p.nevoCode && byCode.get(p.nevoCode);
    if (src && fillMissing((p.per100 ||= {}), src)) await db.put('products', p);
  }

  const meals = await db.getAll('meals');
  const mealById = new Map();
  for (const m of meals) {
    mealById.set(m.id, m);
    let changed = false;
    for (const it of m.items || []) {
      const p = it.productId && productById.get(it.productId);
      if (p && fillMissing((it.per100 ||= {}), p.per100 || {})) changed = true;
    }
    if (changed) await db.put('meals', m);
  }

  // Dagboekregels: alleen de micronutriënten toevoegen aan de bewaarde kopie (`base`).
  for (const e of await db.getAll('log')) {
    if (!e.base || hasMicros(e.base)) continue;
    let src = null;
    if (e.kind === 'product') {
      const p = productById.get(e.refId);
      if (p && hasMicros(p.per100)) src = productBase(p);
    } else if (e.kind === 'meal') {
      const m = mealById.get(e.refId);
      if (m) {
        const t = mealTotals(m);
        src = e.unit === 'g' ? t.perGram : t.perPortion;
      }
    }
    if (!src || !src.mk) continue;
    fillMissing(e.base, src);
    e.base.mk = src.mk;
    e.n = scaleN(e.base, e.amount);
    await db.put('log', e);
  }
}

// --- Gewicht ---

export async function weights() {
  const list = await db.getAll('weights');
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export function saveWeight(date, kg) {
  return db.put('weights', { date, kg });
}

export function deleteWeight(date) {
  return db.del('weights', date);
}

export { emptyN };
