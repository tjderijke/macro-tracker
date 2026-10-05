// Kleine wrapper rond IndexedDB: alle gegevens blijven lokaal op het toestel.

const DB_NAME = 'macro-tracker';
const DB_VERSION = 1;

// Stores die in de back-up meegaan (NEVO niet: die importeer je opnieuw).
export const BACKUP_STORES = ['products', 'meals', 'log', 'days', 'weights', 'settings'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const products = db.createObjectStore('products', { keyPath: 'id' });
      products.createIndex('barcode', 'barcode', { unique: false });
      db.createObjectStore('meals', { keyPath: 'id' });
      const log = db.createObjectStore('log', { keyPath: 'id' });
      log.createIndex('date', 'date', { unique: false });
      db.createObjectStore('days', { keyPath: 'date' });
      db.createObjectStore('weights', { keyPath: 'date' });
      db.createObjectStore('settings', { keyPath: 'key' });
      db.createObjectStore('nevo', { keyPath: 'code' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(name, key) {
  return done((await store(name)).get(key));
}

export async function getAll(name) {
  return done((await store(name)).getAll());
}

export async function getByIndex(name, index, value) {
  return done((await store(name)).index(index).getAll(value));
}

export async function put(name, value) {
  await done((await store(name, 'readwrite')).put(value));
  return value;
}

export async function del(name, key) {
  return done((await store(name, 'readwrite')).delete(key));
}

export async function clear(name) {
  return done((await store(name, 'readwrite')).clear());
}

// Veel records in één transactie (snel, en alles-of-niets).
export async function putMany(name, values) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    const s = tx.objectStore(name);
    for (const v of values) s.put(v);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Vervangt de inhoud van meerdere stores in één transactie (gebruikt bij back-up terugzetten).
export async function replaceAll(data) {
  const db = await open();
  const names = BACKUP_STORES.filter((n) => Array.isArray(data[n]));
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    for (const n of names) {
      const s = tx.objectStore(n);
      if (n === 'settings') {
        // De NEVO-status hoort bij dit toestel (de NEVO-data zit niet in de back-up).
        s.delete('main');
        for (const v of data[n]) if (v.key !== 'nevoMeta') s.put(v);
        continue;
      }
      s.clear();
      for (const v of data[n]) s.put(v);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function exportAll() {
  const out = {};
  for (const n of BACKUP_STORES) out[n] = await getAll(n);
  out.settings = out.settings.filter((s) => s.key !== 'nevoMeta');
  return out;
}

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
