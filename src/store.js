// App state + actions. Screens read `state` through useStore() and call the actions below.

import { useLayoutEffect, useState } from '../vendor/preact-htm.js';
import { FIREBASE_CONFIG } from './config.js';
import { newId, norm, num, clean, incrementDocNo, today } from './util.js';
import { recordCartons, findCartonInRecord, split } from './model.js';

export const DEFAULT_SETTINGS = {
  warehouses: [
    { code: 'PRO', name: 'Production', vi: 'Sản xuất', short: 'production', layout: 'print' },
    { code: 'PRINT', name: 'Print warehouse', vi: 'Kho Print', short: 'print', layout: 'print' },
    { code: 'PACK', name: 'Pack / Trading warehouse', vi: 'Kho Pack / Trading', short: 'pack', layout: 'trading' },
  ],
  defaults: {
    handoff: { fromWh: 'PRO', toWh: 'PRINT' },
    transfer: { fromWh: 'PRINT', toWh: 'PACK' },
    shipment: { fromWh: 'PACK' },
  },
  // Last number already used on paper. The app suggests the next one.
  seeds: { handoff: '0001955', transfer: 'TF000000', shipment: 'IDE0004000' },
  shippingMark: 'IDEA L PACK',
  origin: 'VIETNAM',
};

const DEVICE_KEY = 'ilp.device';
const DEFAULT_DEVICE = { labelPreset: 'thermal-100x70', qrMode: 'link', showLogo: true, deviceName: '', beep: true };

function loadDevice() {
  try { return { ...DEFAULT_DEVICE, ...JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}') }; } catch { return { ...DEFAULT_DEVICE }; }
}

export const state = {
  ready: false,
  mode: FIREBASE_CONFIG ? 'cloud' : 'local',
  needLogin: false,
  user: null,
  sync: { online: navigator.onLine, pending: 0, synced: !FIREBASE_CONFIG, error: null },
  records: new Map(),
  items: new Map(),
  itemsMeta: null,
  settings: structuredClone(DEFAULT_SETTINGS),
  device: loadDevice(),
  toast: null,
};

let backend = null;
let master = { rows: [] };
let overrides = new Map();
let itemIndex = null;

const listeners = new Set();
let scheduled = false;
let version = 0;
export function emit() {
  version += 1;
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => { scheduled = false; listeners.forEach((f) => f()); });
}

// Subscribes in a layout effect (runs right after render, even in background tabs) and
// catches up if the state changed between rendering and subscribing.
export function useStore() {
  const [, force] = useState(0);
  const seen = version;
  useLayoutEffect(() => {
    const f = () => force((x) => x + 1);
    listeners.add(f);
    if (version !== seen) f();
    return () => listeners.delete(f);
  }, []);
  return state;
}

export function toast(msg, kind = 'ok', ms = 3200) {
  const id = Date.now();
  state.toast = { msg, kind, id };
  emit();
  setTimeout(() => { if (state.toast && state.toast.id === id) { state.toast = null; emit(); } }, ms);
}

// ── Items ───────────────────────────────────────────────────────────────────

const FIELDS = ['code', 'ref', 'desc', 'uom', 'ppc', 'l', 'w', 'h', 'nw', 'gw', 'cust'];
export const rowToItem = (r) => Object.fromEntries(FIELDS.map((f, i) => [f, r[i] ?? '']));
export const itemToRow = (it) => FIELDS.map((f) => it[f] ?? '');

function rebuildItems() {
  const map = new Map();
  for (const r of master.rows || []) { const it = rowToItem(r); if (it.code) map.set(it.code, it); }
  for (const [code, ov] of overrides) {
    const base = map.get(code) || { code };
    const merged = { ...base };
    for (const f of FIELDS) if (ov[f] !== undefined && ov[f] !== '' && ov[f] !== null) merged[f] = ov[f];
    merged.edited = true;
    map.set(code, merged);
  }
  state.items = map;
  itemIndex = null;
}

function getIndex() {
  if (!itemIndex) {
    itemIndex = [...state.items.values()].map((it) => ({
      it, code: it.code.toLowerCase(), ref: norm(it.ref), hay: norm(`${it.code} ${it.ref} ${it.desc}`),
    }));
  }
  return itemIndex;
}

// Ranked search: exact code/ref → code ends with (staff use the last 8 digits) → starts with → contains.
export function searchItems(q, limit = 12) {
  const s = norm(q);
  if (!s) return [];
  const words = s.split(' ');
  const scored = [];
  for (const x of getIndex()) {
    let score = 0;
    if (x.code === s || x.ref === s) score = 100;
    else if (x.code.endsWith(s)) score = 80;
    else if (x.code.startsWith(s) || x.ref.startsWith(s)) score = 70;
    else if (x.code.includes(s) || x.ref.includes(s)) score = 50;
    else if (words.every((w) => x.hay.includes(w))) score = 20;
    if (score) scored.push([score, x.it]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].code.localeCompare(b[1].code));
  return scored.slice(0, limit).map((x) => x[1]);
}

export function saveItem(item) {
  const clean_ = { ...item, code: clean(item.code).toUpperCase() };
  overrides.set(clean_.code, clean_);
  rebuildItems(); emit();
  return backend.saveItem(clean_).catch(() => toast('Could not save item', 'bad'));
}

export async function importItems(rows, source) {
  const m = { rows, count: rows.length, importedAt: Date.now(), source, version: Date.now().toString(36) };
  await backend.importItems(m);
  master = m; state.itemsMeta = { count: m.count, importedAt: m.importedAt, source };
  rebuildItems(); emit();
}

// Remember carton size, weights and dimensions used on a slip so next time they fill in by themselves.
function learnFromRecord(rec) {
  for (const line of rec.lines || []) {
    const code = clean(line.code).toUpperCase();
    if (!code) continue;
    const it = state.items.get(code) || { code };
    const patch = {};
    const take = (f, v) => { if (v !== '' && v !== undefined && num(v) > 0 && num(it[f]) !== num(v)) patch[f] = num(v); };
    const takeText = (f, v) => { if (clean(v) && clean(it[f]) !== clean(v)) patch[f] = clean(v); };
    take('ppc', line.ppc);
    take('nw', line.nw); take('gw', line.gw); take('l', line.l); take('w', line.w); take('h', line.h);
    if (rec.type === 'shipment') takeText('cust', rec.customer);
    if (!it.desc) takeText('desc', line.desc);
    if (!it.ref) takeText('ref', line.ref);
    if (Object.keys(patch).length) saveItem({ ...(overrides.get(code) || { code }), ...patch });
  }
}

// ── Records ─────────────────────────────────────────────────────────────────

export const getRecord = (id) => state.records.get(id) || null;

export function recordsList() {
  return [...state.records.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
}

export function docNoTaken(type, docNo, exceptId) {
  const d = clean(docNo).toUpperCase();
  if (!d) return false;
  for (const r of state.records.values()) {
    if (r.type === type && r.id !== exceptId && r.status !== 'void' && clean(r.docNo).toUpperCase() === d) return r;
  }
  return false;
}

export function nextDocNo(type) {
  const seed = state.settings.seeds?.[type] || '';
  const recs = [...state.records.values()].filter((r) => r.type === type && r.docNo).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  // Highest number that follows the same pattern as the most recent one (e.g. "IDE#######").
  const pattern = (s) => String(s).replace(/\d+/g, '#');
  const tail = (s) => BigInt((String(s).match(/(\d+)\D*$/) || [0, '0'])[1]);
  const ref = recs[0]?.docNo || seed;
  let base = ref;
  for (const s of [seed, ...recs.map((r) => r.docNo)]) if (pattern(s) === pattern(ref) && tail(s) > tail(base)) base = s;
  let next = incrementDocNo(base) || '';
  let guard = 0;
  while (next && docNoTaken(type, next) && guard++ < 500) next = incrementDocNo(next);
  return next;
}

export function newRecord(type) {
  const d = state.settings.defaults?.[type] || {};
  const rec = {
    id: newId(8), type, docNo: nextDocNo(type), date: today(), status: 'active',
    fromWh: d.fromWh || '', toWh: type === 'shipment' ? '' : (d.toWh || ''),
    lines: [], scans: [], nextLn: 1, note: '',
  };
  if (type === 'handoff') Object.assign(rec, { deliveredBy: '', receivedBy: '' });
  if (type === 'transfer') Object.assign(rec, { extRef: '', noteNo: '' });
  if (type === 'shipment') Object.assign(rec, {
    customer: '', shipTo: '', contact: '', salesperson: '', noteNo: '',
    shipDate: today(), shippingMark: state.settings.shippingMark || 'IDEA L PACK', origin: state.settings.origin || 'VIETNAM',
  });
  return rec;
}

function historyEntry(action, extra = {}) {
  return { at: Date.now(), action, device: state.device.deviceName || '', ...extra };
}

export function saveRecord(rec, action = 'edited') {
  const now = Date.now();
  const prev = state.records.get(rec.id);
  const out = {
    ...rec,
    docNo: clean(rec.docNo),
    createdAt: rec.createdAt || now,
    updatedAtClient: now,
    rev: (prev?.rev || 0) + 1,
    history: [...(rec.history || []), historyEntry(prev ? action : 'created')].slice(-50),
  };
  state.records.set(out.id, out);
  emit();
  backend.saveRecord(out).catch((e) => toast(`Sync error: ${e.message || e}`, 'bad', 6000));
  if (action !== 'voided' && action !== 'printed') learnFromRecord(out);
  return out;
}

export function voidRecord(id, reason) {
  const rec = getRecord(id);
  if (!rec) return;
  saveRecord({ ...rec, status: 'void', voidReason: reason, voidedAt: Date.now() }, 'voided');
}

export function restoreRecord(id) {
  const rec = getRecord(id);
  if (!rec) return;
  saveRecord({ ...rec, status: 'active', voidReason: '', voidedAt: null }, 'restored');
}

export function markPrinted(id, what) {
  const rec = getRecord(id);
  if (!rec) return;
  const printed = { ...(rec.printed || {}) };
  printed[what] = (printed[what] || 0) + 1;
  saveRecord({ ...rec, printed, lastPrintedAt: Date.now() }, 'printed');
}

// ── Cartons ─────────────────────────────────────────────────────────────────

export function findCarton(cid) {
  const recId = String(cid).split('-')[0];
  const rec = getRecord(recId);
  if (!rec) return null;
  const carton = findCartonInRecord(rec, cid);
  return carton ? { carton, rec } : { carton: null, rec };
}

// Every record that scanned this carton (transfers / shipments), oldest first.
export function cartonMovements(cid) {
  const out = [];
  for (const r of state.records.values()) {
    if (r.status === 'void') continue;
    if ((r.scans || []).some((s) => s.cid === cid)) out.push(r);
  }
  return out.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0));
}

export function cartonLocation(cid) {
  const found = findCarton(cid);
  if (!found || !found.carton) return null;
  const moves = cartonMovements(cid);
  const last = moves[moves.length - 1];
  if (last) return last.type === 'shipment' ? { shipped: true, rec: last } : { wh: last.toWh, rec: last };
  if (found.rec.type === 'shipment') return { shipped: true, rec: found.rec, isShippingLabel: true };
  return { wh: found.rec.toWh, rec: found.rec };
}

export function allCartonsCount() {
  let n = 0;
  for (const r of state.records.values()) if (r.status !== 'void') for (const l of r.lines || []) n += split(l.qty, l.ppc).count;
  return n;
}

export { recordCartons };

// ── Settings ────────────────────────────────────────────────────────────────

export function saveSettings(partial) {
  state.settings = { ...state.settings, ...partial };
  emit();
  return backend.saveSettings(partial);
}

export function saveDevice(partial) {
  state.device = { ...state.device, ...partial };
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(state.device)); } catch {}
  emit();
}

// ── Boot ────────────────────────────────────────────────────────────────────

const hooks = {
  onRecords(list) {
    for (const { id, data } of list) {
      const local = state.records.get(id);
      // Keep a newer local edit that has not reached the server yet.
      if (local && (local.rev || 0) > (data.rev || 0)) continue;
      state.records.set(id, { ...data, id });
    }
    emit();
  },
  onItemsMaster(m) {
    master = m || { rows: [] };
    state.itemsMeta = m ? { count: m.count ?? m.rows.length, importedAt: m.importedAt, source: m.source } : null;
    rebuildItems(); emit();
  },
  onItemOverrides(list) {
    for (const ov of list) if (ov && ov.code) overrides.set(ov.code, ov);
    rebuildItems(); emit();
  },
  onSettings(s) {
    state.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(s || {}) };
    emit();
  },
  onStatus(s) { state.sync = { ...state.sync, ...s }; emit(); },
  onNeedLogin(v) { state.needLogin = v; if (v) state.ready = true; emit(); },
  onUser(u) { state.user = u; emit(); },
};

export async function init() {
  window.addEventListener('online', () => hooks.onStatus({ online: true }));
  window.addEventListener('offline', () => hooks.onStatus({ online: false }));
  try {
    if (FIREBASE_CONFIG) {
      backend = await import('./db/firebase.js');
      await backend.start(FIREBASE_CONFIG, hooks);
    } else {
      backend = await import('./db/local.js');
      await backend.start(hooks);
    }
  } catch (e) {
    console.error(e);
    state.sync = { ...state.sync, error: e.message || String(e) };
  }
  state.ready = true;
  emit();
}

export const signIn = (email, pw) => backend.signIn(email, pw);
export const signOut = () => backend.signOut();
export const resetDemo = async () => { if (backend.resetDemo) { await backend.resetDemo(); location.reload(); } };

// ── Receipt confirmation ────────────────────────────────────────────────────

// The receiving warehouse confirms what it counted against a handoff / transfer.
export function confirmReceipt(id, { by, ids, note }) {
  const rec = getRecord(id);
  if (!rec) return null;
  const receipt = { by: clean(by), at: Date.now(), ids: [...ids], note: clean(note) };
  return saveRecord({ ...rec, receipt, receivedBy: rec.receivedBy || clean(by) }, 'received');
}

export function clearReceipt(id) {
  const rec = getRecord(id);
  if (!rec) return null;
  return saveRecord({ ...rec, receipt: null }, 'receipt-cleared');
}
