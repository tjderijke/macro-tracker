// Checklist: dagelijkse supplementen en de weekchecks (vette vis, rood vlees in de afgelopen 7 dagen).

import * as store from './store.js';
import { norm, addDays } from './util.js';

export const WEEKLY = [
  { id: 'vettevis', label: 'Vette vis' },
  { id: 'roodvlees', label: 'Rood vlees' },
];

// Herkenning op naam (kleine letters, zonder accenten). Bij een product of maaltijd kun je
// het ook zelf aangeven; dat gaat altijd voor.
// Rood vlees: een stuk vers vlees (rund, varken, lam, kalf, wild). Vleeswaren zoals ham, salami
// en rookworst tellen niet automatisch mee.
const word = (w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`);
const RULES = {
  vettevis: {
    include: [
      /zalm/, /makreel/, /haring/, /maatje/, /bokking/, /rolmops/, /sprot/, /sardien/, /sardine/,
      /ansjovis/, /forel/, /paling/, /heilbot/, /vette vis/, /vis vet/, /salmon/, /mackerel/, /herring/,
      /anchov/, /trout/,
    ],
    exclude: [/smaak/, /aroma/, /worst/],
  },
  roodvlees: {
    include: [
      /rund/, /biefstuk/, /entrecote/, /rib.?eye/, /rosbief/, /riblap/, /sukade/, /ossenhaas/, /tartaar/,
      /steak/, /gehakt/, /burger/, /varken/, /karbonade/, /speklap/, /procureur/, /hamlap/, /braadworst/,
      /saucijs/, /slavink/, /spareribs/, /shoarma/, /gyros/, /lams/, word('lam'), /schapenvlees/,
      /geitenvlees/, /kalfs/, /paardenvlees/, /hertenvlees/, /hertenbiefstuk/, /hertenstoof/, word('ree'),
      /reebout/, /reerug/, word('haas'), /wildzwijn/, /wild zwijn/, /beef/, /pork/, /lamb/, /veal/,
    ],
    exclude: [
      /kip/, /kalkoen/, /vega/, /vegeta/, /veggie/, /plantaardig/, /plant-based/, /vleesvervang/, /beyond/,
      /vivera/, /garden gourmet/, /tonijn/, /zalm/, /vis/, /bouillon/, /fond/, /smaak/, /aroma/, /jus/, /soep/,
      /uitgesmolten/, /reuzel/, /vleeswaar/, /rookvlees/, /corned/, /worst (rook|knak)/, /(rook|knak)worst/,
      /chicken/, /turkey/, /tuna/,
    ],
  },
};

export function detectTags(name) {
  const n = norm(name);
  return WEEKLY.map((w) => w.id).filter(
    (id) => RULES[id].include.some((r) => r.test(n)) && !RULES[id].exclude.some((r) => r.test(n)),
  );
}

// Zelf ingesteld (`tags`) gaat voor; anders herkennen op naam.
export function productTags(p) {
  return Array.isArray(p?.tags) ? p.tags : detectTags(p?.name);
}

export function mealTags(meal) {
  if (Array.isArray(meal?.tags)) return meal.tags;
  const set = new Set(detectTags(meal?.name));
  for (const it of meal?.items || []) productTags(it).forEach((t) => set.add(t));
  return [...set];
}

function entryTags(e, products, meals) {
  if (e.kind === 'product') return productTags(products.get(e.refId) || { name: e.name });
  if (e.kind === 'meal') return mealTags(meals.get(e.refId) || { name: e.name });
  return detectTags(e.name);
}

// Voor elke weekcheck: wanneer en waarmee voor het laatst in de 7 dagen t/m `date`.
export async function weeklyStatus(date) {
  const from = addDays(date, -6);
  const [entries, days, products, meals] = await Promise.all([
    store.logBetween(from, date),
    store.daysBetween(from, date),
    store.allProducts(),
    store.allMeals(),
  ]);
  const pById = new Map(products.map((p) => [p.id, p]));
  const mById = new Map(meals.map((m) => [m.id, m]));
  const checksOn = new Map(days.map((d) => [d.date, d.checks || {}]));
  const sorted = [...entries].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''),
  );
  return WEEKLY.map((w) => {
    const hit = sorted.find((e) => entryTags(e, pById, mById).includes(w.id));
    const manualDates = days.filter((d) => d.checks?.[w.id]).map((d) => d.date).sort().reverse();
    let last = hit ? { date: hit.date, name: hit.name } : null;
    if (manualDates[0] && (!last || manualDates[0] > last.date)) last = { date: manualDates[0], name: '' };
    return { ...w, last, manual: !!checksOn.get(date)?.[w.id] };
  });
}
