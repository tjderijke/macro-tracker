// NEVO-tabel (RIVM): algemene Nederlandse voedingsmiddelen.
// Je downloadt het bestand zelf via https://nevo-online.rivm.nl/ en importeert het in de app,
// zodat de gegevens alleen op je eigen toestel staan.

import * as db from './db.js';
import { norm } from './util.js';

let cache = null;

export async function getMeta() {
  return (await db.get('settings', 'nevoMeta')) || null;
}

export async function all() {
  if (!cache) cache = await db.getAll('nevo');
  return cache;
}

export async function removeAll() {
  await db.clear('nevo');
  await db.del('settings', 'nevoMeta');
  cache = [];
}

// --- Bestand lezen (CSV, of de zip zoals je hem van de RIVM-site krijgt) ---

export async function importFile(file) {
  const { items, name } = await readFile(file);
  await db.clear('nevo');
  await db.putMany('nevo', items);
  const meta = {
    key: 'nevoMeta',
    count: items.length,
    fileName: name,
    version: guessVersion(name) || guessVersion(file.name),
    importedAt: new Date().toISOString(),
  };
  await db.put('settings', meta);
  cache = items;
  return meta;
}

// Leest een CSV- of zip-bestand en geeft de NEVO-producten terug (zonder iets op te slaan).
export async function readFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let candidates;
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    candidates = await unzipCsvFiles(buf);
    if (!candidates.length) throw new Error('Geen CSV-bestand gevonden in de zip.');
  } else {
    candidates = [{ name: file.name, data: buf }];
  }
  let lastError = null;
  for (const c of candidates) {
    try {
      const items = parseNevoCsv(decode(c.data ?? (await c.load())));
      if (items.length < 100) throw new Error('Te weinig producten gevonden.');
      return { items, name: c.name };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Dit lijkt geen NEVO-bestand te zijn. ${lastError ? lastError.message : ''}`.trim());
}

function guessVersion(name) {
  const m = /NEVO[\s_-]*(\d{4})[\s_-]*v?(\d+(?:\.\d+)?)?/i.exec(name || '');
  if (!m) return '';
  return m[2] ? `${m[1]}/${m[2]}` : m[1];
}

function decode(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.replace(/^﻿/, '');
}

// Kies het scheidingsteken dat het vaakst in de kopregel voorkomt.
function detectDelimiter(text) {
  const firstLine = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : 2000);
  let best = ',';
  let bestCount = 0;
  for (const d of ['|', ';', '\t', ',']) {
    const count = firstLine.split(d).length;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function parseCsv(text, delim) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toNum(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Zoekt een kolom op basis van de NEVO-componentcode (bijv. "ENERCC") of een tekstfragment.
function findCol(header, test) {
  return header.findIndex((h) => test(h, h.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)));
}

export function parseNevoCsv(text) {
  const rows = parseCsv(text, detectDelimiter(text)).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) throw new Error('Leeg bestand.');
  const header = rows[0].map((h) => h.trim());
  const byCode = (code) => findCol(header, (_h, tokens) => tokens[0] === code);

  const col = {
    code: findCol(header, (h) => /nevo.?code/i.test(h)),
    name: findCol(header, (h) => /voedingsmiddelnaam|dutch food name/i.test(h)),
    nameEn: findCol(header, (h) => /engelse naam|^food name/i.test(h)),
    group: findCol(header, (h) => /^voedingsmiddelgroep/i.test(h)),
    synonym: findCol(header, (h) => /synoniem|synonym/i.test(h)),
    quantity: findCol(header, (h) => /hoeveelheid|quantity/i.test(h)),
    kcal: byCode('ENERCC'),
    kj: byCode('ENERCJ'),
    prot: byCode('PROT'),
    carb: byCode('CHO'),
    sugar: byCode('SUGAR'),
    fat: byCode('FAT'),
    satfat: byCode('FASAT'),
    fiber: byCode('FIBT'),
    na: byCode('NA'),
    nacl: byCode('NACL'),
  };
  if (col.code < 0 || col.name < 0 || col.prot < 0 || col.fat < 0 || col.carb < 0 || (col.kcal < 0 && col.kj < 0)) {
    throw new Error('Kolommen voor naam of voedingswaarden niet gevonden.');
  }

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const code = String(r[col.code] ?? '').trim();
    const name = String(r[col.name] ?? '').trim();
    if (!code || !name || !/^\d+$/.test(code)) continue;
    let kcal = col.kcal >= 0 ? toNum(r[col.kcal]) : null;
    if (kcal === null && col.kj >= 0 && toNum(r[col.kj]) !== null) kcal = toNum(r[col.kj]) / 4.184;
    const na = col.na >= 0 ? toNum(r[col.na]) : null;
    const nacl = col.nacl >= 0 ? toNum(r[col.nacl]) : null;
    const qty = col.quantity >= 0 ? String(r[col.quantity] ?? '') : '';
    items.push({
      code,
      name,
      nameEn: col.nameEn >= 0 ? String(r[col.nameEn] ?? '').trim() : '',
      group: col.group >= 0 ? String(r[col.group] ?? '').trim() : '',
      synonym: col.synonym >= 0 ? String(r[col.synonym] ?? '').trim() : '',
      unit: /ml/i.test(qty) ? 'ml' : 'g',
      per100: {
        kcal,
        prot: toNum(r[col.prot]),
        carb: toNum(r[col.carb]),
        sugar: col.sugar >= 0 ? toNum(r[col.sugar]) : null,
        fat: toNum(r[col.fat]),
        satfat: col.satfat >= 0 ? toNum(r[col.satfat]) : null,
        fiber: col.fiber >= 0 ? toNum(r[col.fiber]) : null,
        // Zout in gram: NaCl in mg, of anders natrium (mg) x 2,5.
        salt: nacl !== null ? nacl / 1000 : na !== null ? (na * 2.5) / 1000 : null,
      },
    });
  }
  return items;
}

// --- Minimale zip-lezer (alleen CSV-bestanden), met de ingebouwde DecompressionStream ---

async function unzipCsvFiles(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Zoek de "end of central directory"-record vanaf het einde.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Ongeldig zip-bestand.');
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(buf.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;
    if (!/\.csv$/i.test(name) || /(^|\/)(__MACOSX|\._)/.test(name) || /detail/i.test(name)) continue;
    if (method !== 0 && method !== 8) continue;
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    // Pas uitpakken als het bestand echt nodig is (het detailbestand is bijv. 88 MB).
    out.push({ name: name.split('/').pop(), load: () => (method === 0 ? raw : inflate(raw)) });
  }
  // Het hoofdbestand (bijv. NEVO2025_v9.0.csv) eerst; recept- en referentiebestanden achteraan.
  // Het detailbestand (88 MB) slaan we hierboven helemaal over.
  const rank = (f) => (/^NEVO\d{4}[_-]v?[\d.]+\.csv$/i.test(f.name) ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
}

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Deze iOS-versie kan geen zip openen. Pak de zip eerst uit in de Bestanden-app.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// --- Zoeken ---

export async function search(query, limit = 40) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const items = await all();
  const wordStart = new RegExp(`(^|[\\s,(])${tokens[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const results = [];
  for (const item of items) {
    if (!item._s) item._s = norm(`${item.name} ${item.synonym}`);
    if (tokens.every((t) => item._s.includes(t))) {
      const n = norm(item.name);
      let score = 0;
      if (n.startsWith(tokens[0])) score += 3;
      if (wordStart.test(n)) score += 2;
      score -= n.length / 100;
      results.push({ item, score });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map((r) => r.item);
}

// Zet een NEVO-record om naar ons productformaat (nog niet opgeslagen).
export function toProduct(item) {
  return {
    id: null,
    name: item.name,
    brand: '',
    barcode: null,
    source: 'nevo',
    nevoCode: item.code,
    unit: item.unit || 'g',
    per100: { ...item.per100 },
    servings: [],
  };
}
