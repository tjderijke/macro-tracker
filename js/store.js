// Gegevenslaag van de app: instellingen, doelen, dagboek, producten, maaltijden en gewicht.

import * as db from './db.js';
import { weekday, scaleN, sumN, norm, emptyN } from './util.js';

const emptyGoal = () => ({ kcal: null, prot: null, carb: null, fat: null });

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

export async function setDayType(date, type) {
  await db.put('days', { date, type });
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

export function productBase(product) {
  // Voedingswaarden per 1 gram (of ml).
  const p = product.per100 || {};
  return scaleN({ kcal: p.kcal, prot: p.prot, carb: p.carb, fat: p.fat, fiber: p.fiber }, 1 / 100);
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
