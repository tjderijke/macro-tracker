// Open Food Facts: gratis, open productdatabase (crowdsourced).
// Productgegevens: Open Database License (ODbL), (c) Open Food Facts-bijdragers.

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = [
  'code', 'product_name', 'product_name_nl', 'generic_name_nl', 'brands', 'quantity',
  'serving_size', 'serving_quantity', 'nutriments', 'image_front_small_url',
].join(',');

function num(v) {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return Number.isFinite(n) ? n : null;
}

// Zet een OFF-product om naar ons eigen productformaat (nog niet opgeslagen).
export function fromOff(p) {
  const n = p.nutriments || {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === null && num(n['energy-kj_100g']) !== null) kcal = num(n['energy-kj_100g']) / 4.184;
  if (kcal === null && num(n.energy_100g) !== null) kcal = num(n.energy_100g) / 4.184;
  const per100 = {
    kcal,
    prot: num(n.proteins_100g),
    carb: num(n.carbohydrates_100g),
    sugar: num(n.sugars_100g),
    fat: num(n.fat_100g),
    satfat: num(n['saturated-fat_100g']),
    fiber: num(n.fiber_100g),
    salt: num(n.salt_100g),
  };
  const brands = Array.isArray(p.brands) ? p.brands.join(', ') : p.brands || '';
  const name = (p.product_name_nl || p.product_name || p.generic_name_nl || '').trim();
  const servings = [];
  const sq = num(p.serving_quantity);
  if (sq && sq > 0) servings.push({ label: '1 portie', grams: sq });
  return {
    id: null,
    name: name || 'Onbekend product',
    brand: brands.split(',')[0].trim(),
    barcode: p.code || null,
    source: 'off',
    unit: 'g',
    per100,
    servings,
    quantity: p.quantity || '',
    image: p.image_front_small_url || '',
  };
}

// Mist er een van de basiswaarden? Dan laten we de gebruiker het product eerst aanvullen.
export function isComplete(product) {
  const p = product.per100 || {};
  return ['kcal', 'prot', 'carb', 'fat'].every((k) => Number.isFinite(p[k]));
}

export async function lookupBarcode(code) {
  const res = await fetch(`${BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts gaf foutcode ${res.status}`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  return fromOff({ ...data.product, code: data.product.code || code });
}

// Zoeken op naam, beperkt tot producten die in Nederland verkocht worden.
// Let op: OFF staat maar ~10 zoekopdrachten per minuut toe, dus alleen op verzoek.
export async function search(query) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '25',
    fields: FIELDS,
    tagtype_0: 'countries',
    tag_contains_0: 'contains',
    tag_0: 'netherlands',
  });
  const res = await fetch(`${BASE}/cgi/search.pl?${params}`);
  if (!res.ok) throw new Error(`Open Food Facts gaf foutcode ${res.status}`);
  const data = await res.json();
  return (data.products || []).map(fromOff).filter((p) => p.name !== 'Onbekend product');
}
