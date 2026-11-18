// Almacén de datos: Firebase (Firestore) cuando hay configuración; modo demo (solo este celular) si no.
// Misma interfaz en ambos: get, set, update, del, list, query, watch.
const FS_VER = '10.12.2';
const cmp = (a, op, b) => op === '==' ? a === b : op === '>=' ? a >= b : op === '<=' ? a <= b : op === '>' ? a > b : op === '<' ? a < b : false;

class DemoStore {
  constructor() { this.mode = 'demo'; this.key = 'fichas_demo_v1'; this.ls = new Set(); this.db = this._load();
    addEventListener('storage', e => { if (e.key === this.key) { this.db = this._load(); this._fire(); } }); }
  _load() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch (e) { return {}; } }
  _save() { try { localStorage.setItem(this.key, JSON.stringify(this.db)); } catch (e) { throw new Error('No hay espacio para guardar en este celular'); } this._fire(); }
  _fire() { this.ls.forEach(f => f()); }
  async init() { return this; }
  async get(c, id) { const d = (this.db[c] || {})[id]; return d ? JSON.parse(JSON.stringify(d)) : null; }
  async set(c, id, o) { (this.db[c] = this.db[c] || {})[id] = JSON.parse(JSON.stringify(o)); this._save(); }
  async update(c, id, o) { const cur = (this.db[c] || {})[id] || {}; await this.set(c, id, { ...cur, ...o }); }
  async del(c, id) { if (this.db[c]) delete this.db[c][id]; this._save(); }
  _rows(c, conds) {
    return Object.entries(this.db[c] || {}).filter(([id, d]) => (conds || []).every(([f, op, v]) => cmp(f === '__id' ? id : d[f], op, v))).map(([id, d]) => ({ id, ...JSON.parse(JSON.stringify(d)) }));
  }
  async list(c) { return this._rows(c, []); }
  async query(c, conds) { return this._rows(c, conds); }
  watch(c, conds, cb) { const f = () => cb(this._rows(c, conds)); this.ls.add(f); f(); return () => this.ls.delete(f); }
  async prueba() { await this.set('prueba', 'x', { t: Date.now() }); return 'Modo demo: guardado local OK (los datos NO se comparten entre celulares).'; }
}

class CloudStore {
  constructor(cfg) { this.mode = 'cloud'; this.cfg = cfg; }
  async init() {
    const base = `https://www.gstatic.com/firebasejs/${FS_VER}/`;
    const [A, F] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js')]);
    this.F = F; this.app = A.initializeApp(this.cfg);
    try { this.db = F.initializeFirestore(this.app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
    catch (e) { this.db = F.getFirestore(this.app); }
    return this;
  }
  _q(c, conds) {
    const F = this.F; const w = (conds || []).map(([f, op, v]) => F.where(f === '__id' ? F.documentId() : f, op, v));
    return F.query(F.collection(this.db, c), ...w);
  }
  async get(c, id) { const s = await this.F.getDoc(this.F.doc(this.db, c, id)); return s.exists() ? s.data() : null; }
  async set(c, id, o) { await this.F.setDoc(this.F.doc(this.db, c, id), o); }
  async update(c, id, o) { await this.F.setDoc(this.F.doc(this.db, c, id), o, { merge: true }); }
  async del(c, id) { await this.F.deleteDoc(this.F.doc(this.db, c, id)); }
  async list(c) { const s = await this.F.getDocs(this.F.collection(this.db, c)); return s.docs.map(d => ({ id: d.id, ...d.data() })); }
  async query(c, conds) { const s = await this.F.getDocs(this._q(c, conds)); return s.docs.map(d => ({ id: d.id, ...d.data() })); }
  watch(c, conds, cb) { return this.F.onSnapshot(this._q(c, conds), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.error('watch', e)); }
  async prueba() {
    const t = Date.now(); await this.set('prueba', 'conexion', { t });
    const back = await this.get('prueba', 'conexion');
    if (!back || back.t !== t) throw new Error('Escribió pero no pudo leer de vuelta');
    return 'Conexión con Firebase OK: se pudo escribir y leer.';
  }
}

export async function abrirAlmacen() {
  const cfg = globalThis.FICHAS_FIREBASE;
  const usable = cfg && cfg.apiKey && cfg.projectId && !/PEGA_AQUI/.test(JSON.stringify(cfg));
  if (usable) { try { return await new CloudStore(cfg).init(); } catch (e) { console.error(e); const d = new DemoStore(); d.error = 'No se pudo conectar con Firebase: ' + e.message; return d; } }
  return new DemoStore();
}
