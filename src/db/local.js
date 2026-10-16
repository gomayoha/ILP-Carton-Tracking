// DEMO backend: keeps everything in this browser (IndexedDB). Used until Firebase is configured.
// Same interface as firebase.js so the rest of the app does not care which one is running.

const DB = 'ilp-carton-demo';
const STORE = 'kv';
let dbp;

function idb() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function kvGet(key) {
  try {
    const db = await idb();
    return await new Promise((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch {
    try { return JSON.parse(localStorage.getItem('ilp.demo.' + key)); } catch { return undefined; }
  }
}

async function kvSet(key, value) {
  try {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  } catch {
    try { localStorage.setItem('ilp.demo.' + key, JSON.stringify(value)); } catch {}
  }
}

let records = {};
let overrides = {};
let settings = {};

export const mode = 'local';

export async function start(h) {
  records = (await kvGet('records')) || {};
  overrides = (await kvGet('itemOverrides')) || {};
  settings = (await kvGet('settings')) || {};
  const master = await kvGet('itemMaster');
  h.onSettings(settings);
  if (master) h.onItemsMaster(master);
  h.onItemOverrides(Object.values(overrides));
  h.onRecords(Object.values(records).map((data) => ({ id: data.id, data })));
  h.onStatus({ online: navigator.onLine, pending: 0, synced: true });
}

export async function saveRecord(rec) {
  records[rec.id] = { ...rec, updatedAt: Date.now() };
  await kvSet('records', records);
}

export async function saveItem(item) {
  overrides[item.code] = { ...item, updatedAt: Date.now() };
  await kvSet('itemOverrides', overrides);
}

export async function importItems(master) {
  await kvSet('itemMaster', master);
}

export async function saveSettings(partial) {
  settings = { ...settings, ...partial };
  await kvSet('settings', settings);
}

export async function resetDemo() {
  records = {}; overrides = {}; settings = {};
  await Promise.all([kvSet('records', {}), kvSet('itemOverrides', {}), kvSet('settings', {}), kvSet('itemMaster', null)]);
}

export async function signIn() {}
export async function signOut() {}
