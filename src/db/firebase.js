// CLOUD backend: Google Firestore, shared by every device.
//
// Built to stay inside the free Spark plan (50k reads / 20k writes per day):
//  • Every device keeps a full offline copy (persistent cache). On start it reads that copy for free,
//    then only downloads documents changed since the newest one it already has.
//  • The item master (≈15,000 items) is stored as a few large "chunk" documents, so a full import
//    costs ~4 writes and a new phone downloads it with ~4 reads.
//  • Writes made offline are queued by Firestore and sent automatically when Wi-Fi returns.
//
// Collections:
//   records/{id}          handoff slips, transfers, shipments (never deleted — voided instead)
//   items/{code}          item edits made in the app (override the imported master)
//   itemChunks/{v}_{i}    imported item master, JSON text split into chunks
//   meta/settings         shared settings (warehouses, number seeds, defaults)
//   meta/itemMaster       which item master version is current

import { REQUIRE_LOGIN } from '../config.js';

let fs, db, hooks, authApi, authInst;
let pending = 0;

export const mode = 'cloud';

export async function start(cfg, h) {
  hooks = h;
  const { initializeApp } = await import('../../vendor/firebase-app.js');
  fs = await import('../../vendor/firebase-firestore.js');
  const app = initializeApp(cfg);
  db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });

  if (REQUIRE_LOGIN) {
    authApi = await import('../../vendor/firebase-auth.js');
    authInst = authApi.getAuth(app);
    await new Promise((resolve) => {
      let started = false;
      authApi.onAuthStateChanged(authInst, (user) => {
        h.onUser(user ? { email: user.email, uid: user.uid } : null);
        h.onNeedLogin(!user);
        if (user && !started) { started = true; resolve(); }
      });
    });
  }
  window.addEventListener('online', () => h.onStatus({ online: true }));
  window.addEventListener('offline', () => h.onStatus({ online: false }));
  h.onStatus({ online: navigator.onLine });
  await listen();
}

function onErr(err) {
  console.error(err);
  const denied = err && (err.code === 'permission-denied' || /permission/i.test(err.message || ''));
  hooks.onStatus({ error: denied ? 'permission' : (err.message || String(err)) });
}

const tsMillis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : (typeof ts === 'number' ? ts : 0));

function plain(data) {
  return { ...data, updatedAt: tsMillis(data.updatedAt) };
}

// Load what this device already has, then listen only for newer changes.
async function deltaListen(name, cb, trackStatus) {
  const col = fs.collection(db, name);
  let maxTs = null;
  try {
    const snap = await fs.getDocsFromCache(col);
    const list = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({ id: d.id, data: plain(data) });
      if (data.updatedAt && typeof data.updatedAt.toMillis === 'function' && (!maxTs || data.updatedAt.toMillis() > maxTs.toMillis())) maxTs = data.updatedAt;
    });
    if (list.length) cb(list);
  } catch { /* empty cache on first run */ }
  const q = maxTs ? fs.query(col, fs.where('updatedAt', '>', maxTs)) : fs.query(col);
  fs.onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const list = snap.docChanges().filter((c) => c.type !== 'removed').map((c) => ({ id: c.doc.id, data: plain(c.doc.data()) }));
    if (list.length) cb(list);
    if (trackStatus) hooks.onStatus({ synced: !snap.metadata.fromCache, error: null });
  }, onErr);
}

function assemble(meta, snap) {
  const parts = [];
  snap.forEach((d) => parts.push(d.data()));
  parts.sort((a, b) => a.i - b.i);
  const rows = parts.flatMap((p) => JSON.parse(p.data));
  return { version: meta.version, rows, count: meta.count, importedAt: meta.importedAt, source: meta.source };
}

async function listen() {
  const { doc, collection, query, where, onSnapshot, getDocFromCache, getDocsFromCache, getDocs } = fs;

  onSnapshot(doc(db, 'meta', 'settings'), (s) => hooks.onSettings(s.exists() ? s.data() : {}), onErr);

  let loadedVersion = null;
  try {
    const m = await getDocFromCache(doc(db, 'meta', 'itemMaster'));
    if (m.exists()) {
      const meta = m.data();
      const chunks = await getDocsFromCache(query(collection(db, 'itemChunks'), where('version', '==', meta.version)));
      if (chunks.size >= meta.chunks) { hooks.onItemsMaster(assemble(meta, chunks)); loadedVersion = meta.version; }
    }
  } catch { /* not cached yet */ }

  onSnapshot(doc(db, 'meta', 'itemMaster'), async (s) => {
    if (!s.exists()) return;
    const meta = s.data();
    if (meta.version === loadedVersion) return;
    try {
      const chunks = await getDocs(query(collection(db, 'itemChunks'), where('version', '==', meta.version)));
      if (chunks.size >= meta.chunks) { hooks.onItemsMaster(assemble(meta, chunks)); loadedVersion = meta.version; }
    } catch (e) { onErr(e); }
  }, onErr);

  await deltaListen('items', (list) => hooks.onItemOverrides(list.map((x) => x.data)));
  await deltaListen('records', (list) => hooks.onRecords(list), true);
}

function track(promise) {
  pending += 1;
  hooks.onStatus({ pending });
  return promise.then(
    (v) => { pending -= 1; hooks.onStatus({ pending, error: null }); return v; },
    (e) => { pending -= 1; hooks.onStatus({ pending }); onErr(e); throw e; },
  );
}

// Do NOT await these in the UI: when offline the promise only resolves once the write reaches the server.
export function saveRecord(rec) {
  return track(fs.setDoc(fs.doc(db, 'records', rec.id), { ...rec, updatedAt: fs.serverTimestamp() }));
}

const safeId = (code) => String(code).replace(/[/\s]+/g, '_');

export function saveItem(item) {
  return track(fs.setDoc(fs.doc(db, 'items', safeId(item.code)), { ...item, updatedAt: fs.serverTimestamp() }));
}

export function saveSettings(partial) {
  return track(fs.setDoc(fs.doc(db, 'meta', 'settings'), partial, { merge: true }));
}

// Replace the whole imported item master. Needs a connection (several MB upload).
export async function importItems(master) {
  const { writeBatch, doc, collection, getDocs } = fs;
  const version = Date.now().toString(36);
  const chunks = [];
  let cur = [], size = 0;
  for (const r of master.rows) {
    const s = JSON.stringify(r).length + 1;
    if (size + s > 700_000 && cur.length) { chunks.push(cur); cur = []; size = 0; }
    cur.push(r); size += s;
  }
  if (cur.length) chunks.push(cur);

  const old = await getDocs(collection(db, 'itemChunks')).catch(() => null);
  const batch = writeBatch(db);
  chunks.forEach((rows, i) => batch.set(doc(db, 'itemChunks', `${version}_${i}`), { version, i, data: JSON.stringify(rows) }));
  batch.set(doc(db, 'meta', 'itemMaster'), { version, chunks: chunks.length, count: master.rows.length, importedAt: master.importedAt, source: master.source || '' });
  old?.forEach((d) => { if (d.data().version !== version) batch.delete(d.ref); });
  await track(batch.commit());
}

export async function signIn(email, password) {
  await authApi.signInWithEmailAndPassword(authInst, email, password);
}

export async function signOut() {
  if (authApi) await authApi.signOut(authInst);
  location.reload();
}
