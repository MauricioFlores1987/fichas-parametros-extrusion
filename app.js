import { HORARIOS, MOTIVOS, NAVES, MAQS, pad, ymd, dmy, addDays, horarioAt, docFecha, slotAt, prevSlot, esAnormal, toNum, listo, completo, estadoBloque, slug, sha } from './rules.js';
import { abrirAlmacen } from './store.js';
import { construirLibro } from './xlsx.js';

const KPI_URL = 'https://mauricioflores1987.github.io/kpi-extrusion-turno3/';
const COMPUESTOS_DEF = ['HIDRAULICO Virgen', 'San Gris Virgen', 'San Gris 40 PHR Oscuro', 'Colector Virgen', 'San Bco Virgen', 'Conduit Virgen 40 PHR', 'Antiquemante', 'Can Bco (tubo)', 'Can Café (tubo)', 'Manguera c/ Diox', 'Manguera s/ Diox', 'Can Bco (MQ140) F7', 'Can Bco (MQ140) F11', 'Manguera Galactica', 'Manguera Nivel', 'Can Cafe (MQ140)', 'Gris inyección', 'Blanco UV inyección', 'Blanco inyección'];
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18.5v.01"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', back: '<path d="M15 5l-7 7 7 7"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', clip: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>',
  dl: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', plus: '<path d="M12 5v14M5 12h14"/>'
};
const ic = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

/* ---------- estado ---------- */
let store, CAT0, PROD, CFG = null;
const CATS = {}; const HIST = {}; let OPS = null, OPS_AT = 0;
const S = { view: 'boot', ses: null, jefe: null, form: null, cons: { m: 'E30', q: '', cod: '', t: 'todos', res: [], regs: null, busy: false },
  regs: [], just: [], unsub: [], jtab: 'cump', jf: { fecha: '', maq: 'E30', desde: '', hasta: '' }, jdata: null, ident: { name: '', t: '', h: '', code: '', ack: false }, toast: '', modal: null, busy: false, setupErr: '' };
const T0 = (() => { const p = new URLSearchParams(location.search).get('t'); return p ? { base: new Date(p).getTime(), start: Date.now() } : null; })();
const now = () => T0 ? new Date(T0.base + Date.now() - T0.start) : new Date();
const iso = () => now().toISOString();
const store_ = { toastT: 0 };
function toast(t) { S.toast = t; clearTimeout(store_.toastT); store_.toastT = setTimeout(() => { S.toast = ''; paintToast(); }, 3200); paintToast(); }
function paintToast() { const el = $('#toast'); if (!el) return; el.textContent = S.toast; el.hidden = !S.toast; }
const guardar = (p) => Promise.race([p.then(() => 'ok'), new Promise(r => setTimeout(() => r('pend'), 3500))]);
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };

/* ---------- datos ---------- */
async function getJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error('No se pudo leer ' + u); return r.json(); }
async function getCatalogo(maq) {
  if (CATS[maq]) return CATS[maq];
  const d = await store.get('catalogo', maq);
  CATS[maq] = d && d.puntos ? d : { puntos: JSON.parse(JSON.stringify(CAT0[maq].puntos)), rev: 0, upd: null, base: true };
  return CATS[maq];
}
async function loadOps(force) {
  if (OPS && !force && Date.now() - OPS_AT < 120000) return OPS;
  OPS = await store.list('operadores'); OPS_AT = Date.now(); return OPS;
}
const opMap = () => { const m = {}; (OPS || []).forEach(o => { if (o.alias) m[o.name] = o.alias; }); return m; };
const opName = n => opMap()[n] || n;
async function histFor(maq) {
  const c = HIST[maq]; if (c && Date.now() - c.at < 600000) return c.m;
  const from = addDays(ymd(now()), -45), regs = await store.query('registros', [['__id', '>=', `${maq}_${from}`], ['__id', '<=', `${maq}_9999`]]);
  const m = {}; regs.forEach(r => (r.puntos || []).forEach(p => { const x = toNum(p.v); if (!p.na && !isNaN(x)) (m[p.k] = m[p.k] || []).push(x); }));
  HIST[maq] = { at: Date.now(), m }; return m;
}
const mNum = m => m.slice(1);
const turnoCol = { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)' };

/* ---------- sesión del operador ---------- */
function loadSes() { try { const s = JSON.parse(localStorage.getItem('fichas_ses')); if (s && Date.now() - s.at < 10 * 3600 * 1000) return s; } catch (e) { } return null; }
function saveSes(s) { try { localStorage.setItem('fichas_ses', JSON.stringify(s)); } catch (e) { } }
const plantaOk = () => { try { return CFG && localStorage.getItem('fichas_planta') === CFG.plantaHash; } catch (e) { return false; } };

/* ---------- piezas de pantalla ---------- */
function bar(title, sub, opts = {}) {
  return `<header class="bar">${opts.back ? `<button class="ibtn" data-a="${opts.back}" aria-label="${opts.backLabel || 'Volver'}">${ic(opts.backIcon || 'back')}</button>` : ''}<h1>${esc(title)}${sub ? `<span>${esc(sub)}</span>` : ''}</h1>
  <button class="ibtn" data-a="theme" aria-label="Cambiar entre modo claro y oscuro">${ic(isDark() ? 'sun' : 'moon')}</button></header>`;
}
const pill = (k, t, i) => `<span class="pill ${k}">${i ? ic(i) : ''}${esc(t)}</span>`;
function navHtml() {
  const t = [['hoy', 'Hoy', 'clip'], ['cons', 'Consultar', 'search'], ['jefe', 'Jefe', 'lock']];
  return t.map(x => `<button data-a="go" data-v="${x[0]}" ${S.view === x[0] || (S.view === 'reg' && x[0] === 'hoy') ? 'aria-current="page"' : ''}>${ic(x[2])}${x[1]}</button>`).join('');
}
const banners = () => (store && store.mode === 'demo' ? `<div class="ban-demo">MODO DEMO · los datos quedan solo en este celular${store.error ? ' · ' + esc(store.error) : ''}</div>` : '') + (navigator.onLine ? '' : '<div class="ban-off">Sin señal · lo que guardes se enviará cuando vuelva</div>');

/* ---------- vistas ---------- */
function vBoot() { return bar('Fichas de Parámetros', 'Cargando…') + '<main><div class="card"><div class="muted">Cargando…</div></div></main>'; }
function vNoCfg() { return bar('Fichas de Parámetros', 'Falta configurar') + '<main><div class="card"><h2>Aún no está configurada</h2><div class="muted sm" style="margin-top:6px">Avisa al jefe de planta para que haga la configuración inicial.</div></div></main>'; }
function vSetup() {
  return bar('Configuración inicial', 'Solo jefes') + `<main><div class="card"><h2>Crear PIN y código de planta</h2><div class="muted sm">El PIN lo comparten los tres jefes. El código de planta se lo entregas a los operadores; lo piden una sola vez por celular.</div>
  <label class="f2" for="sp1">PIN de jefes (4 a 8 dígitos)</label><input class="in" id="sp1" inputmode="numeric" type="password" autocomplete="off">
  <label class="f2" for="sp2">Repite el PIN</label><input class="in" id="sp2" inputmode="numeric" type="password" autocomplete="off">
  <label class="f2" for="sc">Código de planta (para operadores)</label><input class="in" id="sc" autocomplete="off"></div>
  ${S.setupErr ? `<div class="err">${esc(S.setupErr)}</div>` : ''}<button class="btn full" data-a="setupGo">Guardar configuración</button></main>`;
}
function warnHtml() {
  const I = S.ident, sug = horarioAt(now());
  if (!I.h || I.h === sug || I.ack) return '';
  return `<div class="winl" style="margin-top:10px">Elegiste horario <b>${I.h}</b>, pero por la hora de este celular (${pad(now().getHours())}:${pad(now().getMinutes())}) correspondería <b>${sug}</b>. ¿Es correcto?<div class="row"><button class="btn sm" data-a="idack">Sí, es correcto</button><button class="btn ghost sm" data-a="idh" data-v="">Cambiar horario</button></div></div>`;
}
const identOk = () => S.ident.name.trim() && S.ident.t && S.ident.h;
function vIdent() {
  const I = S.ident, names = (OPS || []).filter(o => !o.alias).map(o => o.name);
  return bar('Fichas de Parámetros', 'Antes de empezar', { back: 'panel', backIcon: 'grid', backLabel: 'Ir al Panel de Planta' }) + `<main><div><h2>¿Quién registra hoy?</h2><div class="muted sm">Se pide una vez al empezar tu turno de trabajo y vale para todas las máquinas que registres.</div></div>
  <div class="card"><label class="f2" style="margin-top:0" for="idn">Tu nombre</label><input class="in" id="idn" list="ops" autocomplete="off" placeholder="Escribe o elige" value="${esc(I.name)}"><datalist id="ops">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
  <div class="muted sm" style="margin-top:4px">Si tu nombre no aparece, escríbelo: queda agregado a la lista.</div>
  ${plantaOk() ? '' : `<label class="f2" for="idc">Código de planta</label><input class="in" id="idc" autocomplete="off" placeholder="Solo la primera vez en este celular" value="${esc(I.code)}">`}
  <label class="f2">Turno</label><div class="seg" role="group" aria-label="Turno">${['1', '2', '3'].map(t => `<button data-a="idt" data-v="${t}" aria-pressed="${I.t === t}"><span class="dot" style="background:${turnoCol[t]}"></span>Turno ${t}</button>`).join('')}</div>
  <label class="f2">Horario</label><div class="seg" role="group" aria-label="Horario">${Object.entries(HORARIOS).map(([k, v]) => `<button data-a="idh" data-v="${k}" aria-pressed="${I.h === k}" style="font-size:12px">${v}</button>`).join('')}</div>${warnHtml()}</div>
  ${S.setupErr ? `<div class="err">${esc(S.setupErr)}</div>` : ''}<button class="btn full" id="idgo" data-a="idgo" ${identOk() ? '' : 'disabled style="opacity:.5"'}>Continuar</button></main>`;
}

function bloque() { return { cur: slotAt(now()), prev: prevSlot(now()) }; }
function estM(m, slot) {
  const rs = S.regs.filter(r => r.maq === m && r.fecha === slot.fecha && r.horario === slot.h);
  const j = S.just.find(x => x.id === `${slot.fecha}_${m}_${slot.h}`);
  return estadoBloque(rs, j);
}
const enInst = m => (CFG.inst || []).includes(m);
function vHoy() {
  const { cur, prev } = bloque(), maqs = MAQS.filter(m => !enInst(m));
  const bad = s => s.s === 'pend' || s.s === 'part';
  const pendCur = maqs.filter(m => bad(estM(m, cur))).length, pendPrev = maqs.filter(m => bad(estM(m, prev))).length;
  const done = maqs.length - pendCur, pct = Math.round(done / maqs.length * 100);
  const ban = pendPrev ? `<div class="banner bad" role="alert">${ic('alert')}<div><b>No registrado: ${pendPrev} máquina${pendPrev > 1 ? 's' : ''}</b>Comenzó el turno siguiente con pendientes del horario ${prev.h}. El jefe debe justificarlas.</div></div>`
    : pendCur ? `<div class="banner warn" role="alert">${ic('clock')}<div><b>Faltan ${pendCur} máquinas por registrar</b>Horario ${cur.h} · documento ${dmy(cur.fecha)}. Toca una máquina para registrarla.</div></div>`
      : `<div class="banner ok">${ic('check')}<div><b>Horario ${cur.h} completo</b>Todas las máquinas están registradas o con su estado.</div></div>`;
  let h = bar('Fichas de Parámetros', `Documento ${dmy(docFecha(now(), S.ses.h))} · Turno ${S.ses.t} · ${S.ses.h}`, { back: 'panel', backIcon: 'grid', backLabel: 'Ir al Panel de Planta' }) + '<main>' + ban +
    `<div class="card row sp"><span class="sm"><b>${esc(S.ses.n)}</b><br><span class="muted">Turno ${S.ses.t} · horario ${S.ses.h}</span></span><button class="btn sec sm" data-a="chg">Cambiar</button></div>` +
    `<div class="card"><div class="row sp"><h3>Avance del horario ${cur.h}</h3>${pill(pendCur ? 'warn' : 'ok', `${done} de ${maqs.length}`)}</div><div class="bar-track" style="margin-top:8px"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
  NAVES.forEach(n => {
    const ms = n.ms, d = ms.filter(m => !enInst(m) && !bad(estM(m, cur))).length, t = ms.filter(m => !enInst(m)).length;
    h += `<section class="nave"><h3><span>${n.n}</span><span class="muted sm">${d} de ${t}</span></h3>`;
    ms.forEach(m => {
      if (enInst(m)) { h += `<div class="mrow ro"><span class="mname">${m}</span><span class="mmid"><span class="sm" style="display:block">Línea nueva · sin registro aún</span></span>${pill('dash', 'En instalación')}</div>`; return; }
      const e = estM(m, cur), ep = estM(m, prev); let p, line = '';
      if (e.s === 'ok') { p = pill('ok', 'Registrado', 'check'); line = `${esc(opName(e.reg.operador))} · ${(e.reg.actualizado || '').slice(11, 16) ? hhmm(e.reg.actualizado) : ''} · ${esc(e.reg.codigo || '')}`; }
      else if (e.s === 'stop') { p = pill('mut', 'Detenida', 'pause'); line = `${esc(e.reg.motivo || '')} · ${esc(opName(e.reg.operador))}`; }
      else if (e.s === 'just') { p = pill('mut', 'Justificada', 'check'); line = esc(e.motivo || ''); }
      else if (e.s === 'part') { p = pill('warn', 'Incompleto', 'clock'); line = `${e.reg.nListos || 0} de ${e.reg.nPuntos || 0} puntos`; }
      else { p = pill('warn', 'Pendiente', 'clock'); line = 'Sin registro en este horario'; }
      if (bad(ep)) line = `<b style="color:var(--bad)">Falta ${prev.h}</b>` + (e.s === 'pend' ? '' : ' · ' + line);
      h += `<button class="mrow" data-a="reg" data-m="${m}"><span class="mname">${m}</span><span class="mmid"><span class="sm" style="display:block">${line}</span></span>${p}</button>`;
    });
    h += '</section>';
  });
  const top = constancia().slice(0, 3);
  h += `<div class="card"><h3>Constancia de la semana</h3><div class="muted sm" style="margin:2px 0 8px">Registros completos en los últimos 7 días.</div>${top.length ? top.map((r, i) => `<div class="row sp" style="padding:6px 0;border-top:1px solid var(--line)"><span><b>${i + 1}.</b> ${esc(r.name)}</span>${pill('ok', r.ok + ' completos')}</div>`).join('') : '<div class="muted sm">Aún no hay registros esta semana.</div>'}</div>`;
  return h + '</main>';
}
const hhmm = s => { const d = new Date(s); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
function constancia() {
  const from = addDays(ymd(now()), -7), r = [];
  (OPS || []).filter(o => !o.alias).forEach(o => { const merged = (OPS || []).filter(x => x.alias === o.name).concat(o).flatMap(x => x.recent || []).filter(e => e.f >= from);
    const ok = merged.filter(e => e.ok).length; if (merged.length) r.push({ name: o.name, ok, total: merged.length }); });
  return r.sort((a, b) => b.ok - a.ok || b.total - a.total);
}

/* ----- registro ----- */
function grupos(cat) { const v = cat.puntos.filter(p => p.estado === 'vigente'), g = []; v.forEach(p => { const l = g[g.length - 1]; if (l && l.sec === p.sec) l.items.push(p); else g.push({ sec: p.sec, items: [p] }); }); return g; }
function formCounts(f) { let n = 0, l = 0; f.cat.puntos.filter(p => p.estado === 'vigente').forEach(p => { n++; const x = f.vals[p.k]; if (x && (x.na || String(x.v || '').trim() !== '')) l++; }); return { n, l }; }
async function abrirReg(maq) {
  S.busy = true; paint();
  try {
    const cat = await getCatalogo(maq), fecha = docFecha(now(), S.ses.h), id = `${maq}_${fecha}_${S.ses.t}`;
    const [ex, doc, hist] = await Promise.all([store.get('registros', id), store.query('registros', [['maq', '==', maq], ['fecha', '==', fecha]]), histFor(maq)]);
    const vals = {}; if (ex) (ex.puntos || []).forEach(p => vals[p.k] = { v: p.v, na: !!p.na });
    const ro = !!ex && opName(ex.operador) !== opName(S.ses.n) && !S.jefe;
    S.form = { maq, fecha, id, cat, ex, doc, hist, ro, estado: ex ? ex.estado : 'prod', motivo: ex ? ex.motivo || '' : '', codigo: ex ? ex.codigo || '' : '', mpTipo: ex ? ex.mpTipo || '' : '', mpDetalle: ex ? ex.mpDetalle || '' : '', obs: ex ? ex.obs || '' : '', vals, open: { 0: true }, anom: {}, prop: null, histOpen: false };
    S.view = 'reg';
  } catch (e) { toast('No se pudo abrir: ' + e.message); }
  S.busy = false; paint();
}
function codMsg(c) {
  if (!c) return '<span class="muted">Digita el código; se valida contra la base de productos.</span>';
  if (PROD[c]) return pill('ok', 'Existe', 'check') + ` <b>${esc(PROD[c])}</b>`;
  return c.length >= 5 ? pill('bad', 'No existe en la base de productos', 'alert') : '<span class="muted">Sigue digitando…</span>';
}
function cambioMsg(f) {
  if (f.estado !== 'prod' || !PROD[f.codigo]) return '';
  const otros = [...new Set(f.doc.filter(r => r.id !== f.id && r.estado !== 'stop' && r.codigo).map(r => r.codigo))].filter(c => c !== f.codigo);
  return otros.length ? `<div class="note" style="margin-top:8px"><b>Cambio de producto.</b> Otro turno de este día corrió ${esc(otros.join(', '))}. Queda en el mismo documento, marcado así.</div>` : '';
}
function vReg() {
  const f = S.form, ro = f.ro ? 'disabled' : '';
  let h = bar('Registrar ' + f.maq, `${NAVES.find(n => n.ms.includes(f.maq)).n} · Turno ${S.ses.t} · ${S.ses.h}`, { back: 'hoy', backLabel: 'Volver al tablero' }) + '<main>';
  h += `<div class="card"><h2>Documento ${dmy(f.fecha)}</h2><div class="muted sm">Un documento por máquina y día; este turno llena su columna.</div>${f.ex ? `<div class="note" style="margin-top:8px">Ya existe un registro de ${esc(opName(f.ex.operador))}. ${f.ro ? 'Solo su autor o un jefe puede corregirlo.' : 'Estás corrigiendo ese registro; queda anotado quién y cuándo.'}</div>` : ''}</div>`;
  h += `<div class="seg" role="group" aria-label="Estado de la máquina"><button data-a="est" data-v="prod" ${ro} aria-pressed="${f.estado === 'prod'}">Produciendo</button><button data-a="est" data-v="stop" ${ro} aria-pressed="${f.estado === 'stop'}">Detenida</button></div>`;
  if (f.estado === 'stop') {
    h += `<div class="card"><h3>Motivo de la detención</h3><div class="sel-list">${MOTIVOS.map(m => `<button class="mrow" ${ro} data-a="mot" data-v="${esc(m)}" aria-pressed="${f.motivo === m}" style="${f.motivo === m ? 'border-color:var(--accent);background:var(--navy-tint)' : ''}"><span class="mmid"><b>${esc(m)}</b></span>${f.motivo === m ? pill('ok', '', 'check') : ''}</button>`).join('')}</div>
    <label class="f2" for="obs">Observaciones</label><textarea class="in" id="obs" ${ro} placeholder="Opcional">${esc(f.obs)}</textarea></div><button class="btn full" data-a="save" ${ro}>Guardar estado de la máquina</button></main>`;
    return h;
  }
  h += `<div class="card"><label class="f2" style="margin-top:0" for="cod">Código de producto</label><input class="in" id="cod" ${ro} inputmode="numeric" placeholder="Ej. 50573" value="${esc(f.codigo)}" autocomplete="off"><div id="codmsg" class="sm" style="margin-top:6px">${codMsg(f.codigo)}</div><div id="cambio">${cambioMsg(f)}</div>
  <label class="f2">Materia prima</label><div class="seg" role="group" aria-label="Tipo de materia prima">${['Compuesto', 'Reciclado'].map(t => `<button data-a="mpt" data-v="${t}" ${ro} aria-pressed="${f.mpTipo === t}">${t}</button>`).join('')}</div>`;
  if (f.mpTipo === 'Compuesto') h += `<label class="f2" for="mpd">¿Qué compuesto es?</label><select class="in" id="mpd" ${ro}><option value="">Elegir…</option>${(CFG.compuestos || []).map(c => `<option ${f.mpDetalle === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
  if (f.mpTipo === 'Reciclado') { let rc = []; try { rc = JSON.parse(localStorage.getItem('fichas_reciclados')) || []; } catch (e) { }
    h += `<label class="f2" for="mpd">¿Qué tipo de reciclado es?</label><input class="in" id="mpd" ${ro} list="rcl" placeholder="Ej. pulverizado, compuesto rechazado…" value="${esc(f.mpDetalle)}" autocomplete="off"><datalist id="rcl">${rc.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`; }
  h += `<button class="btn ghost full sm" style="margin-top:12px" data-a="hist" ${PROD[f.codigo] ? '' : 'disabled style="opacity:.5;margin-top:12px"'}>${ic('search')} Última vez que corrió este producto</button><div id="histp">${f.histOpen && PROD[f.codigo] ? '<div class="note" style="margin-top:8px">Buscando…</div>' : ''}</div></div>`;
  grupos(f.cat).forEach((g, gi) => {
    const k0 = g.items, ready = k0.filter(p => { const x = f.vals[p.k]; return x && (x.na || String(x.v || '').trim() !== ''); }).length, o = f.open[gi];
    h += `<div class="acc"><button data-a="sec" data-v="${gi}" aria-expanded="${!!o}"><span>${esc(g.sec)}</span><span class="pill ${ready === k0.length ? 'ok' : 'mut'}" id="cnt_${gi}">${ready} de ${k0.length}</span></button>`;
    if (o) { h += '<div class="body">'; g.items.forEach(p => { const x = f.vals[p.k] || {}, na = !!x.na;
      h += `<div class="fld${na ? ' isna' : ''}"><span class="lb">${esc(p.label)}</span><input class="in" data-k="${p.k}" ${ro || (na ? 'disabled' : '')} inputmode="decimal" placeholder="—" value="${esc(x.v ?? '')}" aria-label="${esc(p.label)}"><button class="na" ${ro} data-a="na" data-k="${p.k}" aria-pressed="${na}" title="Este punto no aplica hoy">N/A</button><button class="more" data-a="prop" data-k="${p.k}" aria-label="Proponer cambio de este punto" title="Proponer cambio">⋯</button><div class="winl" id="w_${p.k}" hidden></div>
      ${f.prop === p.k ? `<div class="prop"><div class="sm"><b>Proponer al jefe</b> (queda pendiente hasta que lo apruebe)</div><input class="in" id="pnom" placeholder="Nombre correcto del punto (si está mal escrito)"><div class="row"><button class="btn sm" data-a="propNom" data-k="${p.k}">Enviar nombre nuevo</button><button class="btn sec sm" data-a="propNA" data-k="${p.k}">No aplica nunca en esta máquina</button></div></div>` : ''}</div>`; }); h += '</div>'; }
    h += '</div>'; });
  h += `<div class="card"><label class="f2" style="margin-top:0" for="obs">Observaciones</label><textarea class="in" id="obs" ${ro} placeholder="Opcional">${esc(f.obs)}</textarea></div>`;
  const c = formCounts(f);
  return h + `<div class="sticky"><div class="card row sp"><span id="tot" class="sm"><b>${c.l} de ${c.n}</b> puntos listos</span><button class="btn" data-a="save" ${ro}>Guardar registro</button></div></div></main>`;
}
function updCounts() {
  const f = S.form; if (!f) return; const c = formCounts(f), t = $('#tot'); if (t) t.innerHTML = `<b>${c.l} de ${c.n}</b> puntos listos`;
  grupos(f.cat).forEach((g, gi) => { const el = $('#cnt_' + gi); if (!el) return; const r = g.items.filter(p => { const x = f.vals[p.k]; return x && (x.na || String(x.v || '').trim() !== ''); }).length; el.textContent = `${r} de ${g.items.length}`; el.className = 'pill ' + (r === g.items.length ? 'ok' : 'mut'); });
}
async function guardarReg() {
  const f = S.form; if (!f || f.ro) return;
  if (f.estado === 'stop' && !f.motivo) return toast('Elige el motivo de la detención');
  if (f.estado === 'prod' && f.codigo && !PROD[f.codigo]) return toast('Ese código no existe en la base de productos');
  const t = iso(), vig = f.cat.puntos.filter(p => p.estado === 'vigente');
  const reg = { id: f.id, maq: f.maq, fecha: f.fecha, turno: S.ses.t, horario: S.ses.h, operador: f.ex ? f.ex.operador : S.ses.n, estado: f.estado, motivo: f.estado === 'stop' ? f.motivo : '', codigo: f.estado === 'prod' ? f.codigo : '', producto: f.estado === 'prod' ? (PROD[f.codigo] || '') : '',
    mpTipo: f.estado === 'prod' ? f.mpTipo : '', mpDetalle: f.estado === 'prod' ? f.mpDetalle : '', obs: f.obs, puntos: f.estado === 'prod' ? vig.map(p => { const x = f.vals[p.k] || {}; return { k: p.k, sec: p.sec, label: p.label, v: x.na ? '' : String(x.v ?? ''), na: !!x.na }; }) : [],
    creado: f.ex ? f.ex.creado : t, actualizado: t, hist: (f.ex ? (f.ex.hist || []).concat([{ at: t, by: S.ses.n }]) : []).slice(-10) };
  reg.completo = completo(reg); reg.nPuntos = reg.puntos.length; reg.nListos = reg.puntos.filter(listo).length;
  S.busy = true; paint();
  try {
    const r = await guardar(store.set('registros', reg.id, reg));
    if (reg.mpTipo === 'Reciclado' && reg.mpDetalle.trim()) { try { const l = JSON.parse(localStorage.getItem('fichas_reciclados')) || []; if (!l.includes(reg.mpDetalle.trim())) { l.push(reg.mpDetalle.trim()); localStorage.setItem('fichas_reciclados', JSON.stringify(l.slice(-40))); } } catch (e) { } }
    delete HIST[f.maq];
    store.get('operadores', slug(S.ses.n)).then(async o => { o = o || { name: S.ses.n }; const rec = (o.recent || []).filter(e => e.id !== reg.id); rec.push({ id: reg.id, f: reg.fecha, ok: reg.completo }); o.recent = rec.slice(-60); o.turno = S.ses.t; await store.set('operadores', slug(S.ses.n), o); OPS_AT = 0; }).catch(() => { });
    toast(r === 'pend' ? 'Guardado en el celular; se enviará cuando haya señal' : reg.completo ? 'Registro completo guardado' : `Guardado como incompleto: ${reg.nListos} de ${reg.nPuntos} puntos`);
    S.form = null; S.view = 'hoy';
  } catch (e) { toast('No se pudo guardar: ' + e.message); }
  S.busy = false; await ensureHoy(); paint();
}

/* ----- consultar ----- */
function vCons() {
  const c = S.cons;
  let h = bar('Consultar', 'Último dato por máquina y producto', { back: 'panel', backIcon: 'grid', backLabel: 'Ir al Panel de Planta' }) + `<main><div class="card"><div class="row wrap"><div style="flex:1;min-width:110px"><label class="f" for="cm">Máquina</label><select class="in" id="cm">${MAQS.map(m => `<option ${m === c.m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
  <div style="flex:2;min-width:160px"><label class="f" for="cq">Código o nombre del producto</label><input class="in" id="cq" placeholder="Ej. 50573 o conduit" value="${esc(c.q)}" autocomplete="off"></div></div>
  <button class="btn full" style="margin-top:10px" data-a="cbuscar">${ic('search')} Buscar</button>
  ${c.res.length ? `<div class="sel-list">${c.res.map(([k, n]) => `<button class="res" data-a="cpick" data-v="${k}"><b>${k}</b> · ${esc(n)}</button>`).join('')}</div>` : ''}</div>`;
  if (c.busy) return h + '<div class="note">Buscando…</div></main>';
  if (c.regs === null) return h + '<div class="note">Elige máquina y producto para ver los últimos datos ingresados.</div></main>';
  h += `<div class="muted sm"><b>${esc(PROD[c.cod] || c.cod)}</b></div><div class="sub" role="group" aria-label="Filtrar por turno">${[['todos', 'Todos'], ['1', 'Turno 1'], ['2', 'Turno 2'], ['3', 'Turno 3']].map(t => `<button class="chip" data-a="ct" data-v="${t[0]}" aria-pressed="${c.t === t[0]}">${t[1]}</button>`).join('')}</div>`;
  const RF = c.regs.filter(r => r.estado !== 'stop' && (c.t === 'todos' || r.turno === c.t)).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.turno.localeCompare(a.turno)).slice(0, 6);
  if (!RF.length) return h + `<div class="note">No hay registros de ${c.t === 'todos' ? 'ese producto' : 'ese turno'} en ${c.m}. Es la primera vez que se corre aquí o aún no se ha registrado.</div></main>`;
  h += `<div class="card"><h3>Últimos registros</h3>${RF.map(r => `<div class="row sp" style="padding:8px 0;border-top:1px solid var(--line)"><span><b>${dmy(r.fecha)}</b><br><span class="muted sm">Turno ${r.turno} · ${r.horario} · ${esc(opName(r.operador))}</span></span>${pill('mut', r.mpTipo ? r.mpTipo + (r.mpDetalle ? ': ' + r.mpDetalle : '') : '—')}</div>`).join('')}</div>`;
  const keys = [], seen = {}; RF.forEach(r => (r.puntos || []).forEach(p => { if (!seen[p.k]) { seen[p.k] = p; keys.push(p); } }));
  h += `<div class="scroll"><table class="tbl"><thead><tr><th>Punto</th>${RF.map(r => `<th>${dmy(r.fecha).slice(0, 5)} · T${r.turno}</th>`).join('')}</tr></thead><tbody>`;
  let sec = null; keys.forEach(p => { if (p.sec !== sec) { sec = p.sec; h += `<tr><th colspan="${RF.length + 1}" style="background:var(--navy-tint)">${esc(sec)}</th></tr>`; }
    h += `<tr><td>${esc(p.label)}</td>${RF.map(r => { const x = (r.puntos || []).find(q => q.k === p.k); return `<td class="n">${x ? (x.na ? 'N/A' : esc(x.v)) : ''}</td>`; }).join('')}</tr>`; });
  return h + '</tbody></table></div></main>';
}
function buscarProd(q) { q = q.trim().toLowerCase(); if (!q) return []; if (PROD[q]) return [[q, PROD[q]]]; return Object.entries(PROD).filter(([k, n]) => k.startsWith(q) || n.toLowerCase().includes(q)).slice(0, 8); }
async function consultar(cod) {
  const c = S.cons; c.cod = cod; c.res = []; c.busy = true; paint();
  try { c.regs = await store.query('registros', [['maq', '==', c.m], ['codigo', '==', cod]]); } catch (e) { toast('No se pudo consultar: ' + e.message); c.regs = []; }
  c.busy = false; paint();
}

/* ----- jefe ----- */
function vJefe() {
  let h = bar('Panel del jefe', 'Cumplimiento, catálogo y exportación', { back: 'panel', backIcon: 'grid', backLabel: 'Ir al Panel de Planta' }) + '<main>';
  if (!S.jefe) return h + `<div class="card" style="text-align:center"><h2>Ingresa tu PIN</h2><div class="muted sm" style="margin-bottom:6px">Un PIN compartido por los tres jefes.</div><label class="f2" for="jn">Tu nombre</label><input class="in" id="jn" autocomplete="off" placeholder="Para dejar registro de lo que apruebas">
  <label class="f2" for="jp">PIN</label><input class="in" id="jp" type="password" inputmode="numeric" autocomplete="off"></div>${S.setupErr ? `<div class="err">${esc(S.setupErr)}</div>` : ''}<button class="btn full" data-a="jgo">Entrar</button></main>`;
  h += `<div class="row sp"><span class="sm muted">Jefe: <b>${esc(S.jefe.name)}</b></span><button class="btn ghost sm" data-a="jout">Salir</button></div><div class="tabs">${[['cump', 'Cumplimiento'], ['cat', 'Catálogo'], ['ope', 'Operadores'], ['cfg', 'Ajustes'], ['exp', 'Exportar']].map(t => `<button class="chip" data-a="jt" data-v="${t[0]}" aria-pressed="${S.jtab === t[0]}">${t[1]}</button>`).join('')}</div>`;
  const d = S.jdata;
  if (S.jtab === 'cump') {
    h += `<div class="card"><label class="f2" style="margin-top:0" for="jfecha">Documento (fecha)</label><input class="in" id="jfecha" type="date" value="${S.jf.fecha}"></div>`;
    if (!d || d.tab !== 'cump') return h + '<div class="note">Cargando…</div></main>';
    h += `<div class="card"><h3>Cumplimiento por máquina</h3><div class="muted sm" style="margin:2px 0 8px">Columnas por horario; toca una celda pendiente para justificarla. Los turnos rotan: cada registro guarda su turno.</div><div class="grid3"><span></span>${['N', 'M', 'T'].map(x => `<b class="sm" style="text-align:center">${x}</b>`).join('')}`;
    MAQS.forEach(m => { h += `<b>${m}</b>`; ['N', 'M', 'T'].forEach(x => { if (enInst(m)) { h += '<span class="cellb">—</span>'; return; }
      const rs = d.regs.filter(r => r.maq === m && r.horario === x), j = d.just.find(q => q.id === `${S.jf.fecha}_${m}_${x}`), e = estadoBloque(rs, j);
      const lab = { ok: pill('ok', 'T' + (e.reg || {}).turno, 'check'), stop: pill('mut', 'T' + (e.reg || {}).turno, 'pause'), just: pill('mut', 'Just.', 'check'), part: pill('warn', 'Incomp.', 'clock'), pend: '<span class="muted">·</span>' }[e.s];
      h += `<button class="cellb" data-a="jjust" data-m="${m}" data-h="${x}" aria-label="${m} horario ${x}">${lab}</button>`; }); });
    h += '</div></div>';
    if (S.modal && S.modal.t === 'just') { const mo = S.modal; h += `<div class="card"><h3>Justificar ${mo.m} · horario ${mo.h}</h3><div class="sel-list">${MOTIVOS.map(x => `<button class="mrow" data-a="jmot" data-v="${esc(x)}"><span class="mmid"><b>${esc(x)}</b></span></button>`).join('')}</div><label class="f2" for="jotro">Otro motivo</label><input class="in" id="jotro" placeholder="Escribe el motivo"><div class="row" style="margin-top:8px"><button class="btn" data-a="jmotOtro">Guardar</button><button class="btn ghost" data-a="jquitarJ">Quitar justificación</button><button class="btn ghost" data-a="jcerrar">Cerrar</button></div></div>`; }
    const cs = constancia();
    h += `<div class="card"><h3>Constancia (últimos 7 días)</h3>${cs.length ? `<table class="tbl"><thead><tr><th>Operador</th><th>Completos</th><th>Total</th></tr></thead><tbody>${cs.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${r.ok}</td><td class="n">${r.total}</td></tr>`).join('')}</tbody></table>` : '<div class="muted sm">Sin registros esta semana.</div>'}</div>`;
  }
  if (S.jtab === 'cat') {
    h += `<div class="card"><label class="f2" style="margin-top:0" for="jm">Máquina</label><select class="in" id="jm">${MAQS.map(m => `<option ${m === S.jf.maq ? 'selected' : ''}>${m}</option>`).join('')}</select></div>`;
    if (!d || d.tab !== 'cat') return h + '<div class="note">Cargando…</div></main>';
    const cat = d.cat;
    h += `<div class="card"><h3>Solicitudes pendientes</h3>${d.props.length ? d.props.map(p => `<div style="padding:10px 0;border-top:1px solid var(--line)"><b>${esc(p.label)}</b><div class="muted sm">${esc(opName(p.by))} propone: ${p.tipo === 'noaplica' ? 'No aplica nunca' : 'Nombre nuevo → «' + esc(p.nuevo) + '»'}</div><div class="row" style="margin-top:6px"><button class="btn sm" data-a="pap" data-id="${p.id}">Aprobar</button><button class="btn ghost sm" data-a="pre" data-id="${p.id}">Rechazar</button></div></div>`).join('') : '<div class="muted sm">No hay solicitudes.</div>'}</div>`;
    h += `<div class="card"><div class="row sp"><div><h3>Puntos de ${S.jf.maq}</h3><div class="muted sm">${cat.puntos.filter(p => p.estado === 'vigente').length} vigentes · revisión ${cat.rev || 0}${cat.upd ? ' · actualizado ' + dmy(cat.upd.slice(0, 10)) : ''}</div></div></div>`;
    cat.puntos.forEach(p => { h += `<div style="padding:8px 0;border-top:1px solid var(--line)"><div class="row sp"><span><b>${esc(p.label)}</b><br><span class="muted sm">${esc(p.sec)}</span></span>${pill(p.estado === 'vigente' ? 'ok' : p.estado === 'noaplica' ? 'warn' : 'bad', p.estado === 'vigente' ? 'Vigente' : p.estado === 'noaplica' ? 'No aplica' : 'Retirado')}</div>
      <div class="row" style="margin-top:6px;flex-wrap:wrap"><button class="btn ghost sm" data-a="cest" data-k="${p.k}" data-v="vigente">Vigente</button><button class="btn ghost sm" data-a="cest" data-k="${p.k}" data-v="noaplica">No aplica</button><button class="btn ghost sm" data-a="cest" data-k="${p.k}" data-v="retirado">Retirar</button><button class="btn ghost sm" data-a="cren" data-k="${p.k}">Renombrar</button></div>${S.modal && S.modal.t === 'ren' && S.modal.k === p.k ? `<div class="row" style="margin-top:6px"><input class="in" id="rnom" value="${esc(p.label)}"><button class="btn sm" data-a="crenOk" data-k="${p.k}">Guardar</button></div>` : ''}</div>`; });
    const secs = [...new Set(cat.puntos.map(p => p.sec))];
    h += `<div style="padding-top:10px;border-top:1px solid var(--line)"><h3>Agregar punto nuevo</h3><label class="f2" for="nsec">Sección</label><select class="in" id="nsec">${secs.map(s => `<option>${esc(s)}</option>`).join('')}</select><label class="f2" for="nlab">Nombre y unidad</label><input class="in" id="nlab" placeholder="Ej. Temp. zona 5 (°C)"><button class="btn full" style="margin-top:8px" data-a="cadd">${ic('plus')} Agregar punto</button></div></div>`;
  }
  if (S.jtab === 'ope') {
    const ops = (OPS || []); const mains = ops.filter(o => !o.alias);
    h += `<div class="card"><h3>Operadores</h3><div class="muted sm" style="margin:2px 0 8px">La lista se llena sola al registrarse. Aquí se fusionan los nombres duplicados.</div>${mains.map(o => `<div class="row sp" style="padding:8px 0;border-top:1px solid var(--line)"><span><b>${esc(o.name)}</b><br><span class="muted sm">${(o.recent || []).length} registros recientes${ops.filter(x => x.alias === o.name).length ? ' · fusionado con ' + ops.filter(x => x.alias === o.name).map(x => esc(x.name)).join(', ') : ''}</span></span></div>`).join('') || '<div class="muted sm">Aún no hay operadores.</div>'}</div>
    <div class="card"><h3>Fusionar duplicado</h3><label class="f2" for="fa">Nombre duplicado (se reemplaza)</label><select class="in" id="fa"><option value="">Elegir…</option>${mains.map(o => `<option>${esc(o.name)}</option>`).join('')}</select><label class="f2" for="fb">Nombre correcto (se conserva)</label><select class="in" id="fb"><option value="">Elegir…</option>${mains.map(o => `<option>${esc(o.name)}</option>`).join('')}</select><button class="btn full" style="margin-top:8px" data-a="fusion">Fusionar</button></div>`;
  }
  if (S.jtab === 'cfg') {
    h += `<div class="card"><h3>Compuestos disponibles</h3><div class="muted sm" style="margin:2px 0 8px">Es la lista que ve el operador al elegir «Compuesto».</div>${(CFG.compuestos || []).map((c, i) => `<div class="row sp" style="padding:6px 0;border-top:1px solid var(--line)"><span>${esc(c)}</span><button class="btn ghost sm" data-a="cdel" data-i="${i}">Quitar</button></div>`).join('')}<div class="row" style="margin-top:8px"><input class="in" id="ncomp" placeholder="Nuevo compuesto"><button class="btn sm" data-a="cdadd">Agregar</button></div></div>
    <div class="card"><h3>Máquinas en instalación</h3><div class="muted sm" style="margin:2px 0 8px">No cuentan para el cumplimiento hasta que se quiten de aquí.</div><div class="row wrap">${MAQS.map(m => `<button class="chip" data-a="cinst" data-v="${m}" aria-pressed="${enInst(m)}">${m}</button>`).join('')}</div></div>
    <div class="card"><h3>PIN y código de planta</h3><label class="f2" for="npin">Nuevo PIN (déjalo vacío para no cambiarlo)</label><input class="in" id="npin" type="password" inputmode="numeric"><label class="f2" for="ncod">Nuevo código de planta (vacío = no cambiar)</label><input class="in" id="ncod"><button class="btn full" style="margin-top:8px" data-a="ccred">Guardar</button></div>
    <div class="card"><h3>Conexión</h3><div class="muted sm" style="margin:2px 0 8px">Modo: <b>${store.mode === 'cloud' ? 'Firebase (compartido)' : 'DEMO (solo este celular)'}</b></div><button class="btn sec full" data-a="cprueba">Probar conexión</button><div id="pr" class="sm" style="margin-top:8px"></div></div>`;
  }
  if (S.jtab === 'exp') {
    const f = S.jf; h += `<div class="card"><h3>Exportar al Excel original</h3><div class="muted sm" style="margin:2px 0 8px">Mismo diseño, colores y tabla que el libro actual, listo para auditoría y archivo.</div>
    <label class="f2" for="edia">Día (fecha del documento)</label><input class="in" id="edia" type="date" value="${f.fecha}"><button class="btn full" style="margin-top:8px" data-a="expdia">${ic('dl')} Exportar día (una hoja por máquina)</button></div>
    <div class="card"><label class="f2" style="margin-top:0" for="em">Máquina</label><select class="in" id="em">${MAQS.map(m => `<option ${m === f.maq ? 'selected' : ''}>${m}</option>`).join('')}</select><div class="row wrap"><div style="flex:1;min-width:130px"><label class="f2" for="ed">Desde</label><input class="in" id="ed" type="date" value="${f.desde}"></div><div style="flex:1;min-width:130px"><label class="f2" for="eh">Hasta</label><input class="in" id="eh" type="date" value="${f.hasta}"></div></div><button class="btn full" style="margin-top:8px" data-a="expmaq">${ic('dl')} Exportar máquina (rango de fechas)</button></div><div id="exmsg" class="sm"></div>`;
  }
  return h + '</main>';
}
async function cargarJ() {
  const t = S.jtab; if (!S.jefe) return;
  try {
    if (t === 'cump') { const [regs, just] = await Promise.all([store.query('registros', [['fecha', '==', S.jf.fecha]]), store.query('justif', [['fecha', '==', S.jf.fecha]])]); await loadOps(); S.jdata = { tab: 'cump', regs, just }; }
    if (t === 'cat') { const maq = S.jf.maq; delete CATS[maq]; const [cat, props] = await Promise.all([getCatalogo(maq), store.query('propuestas', [['maq', '==', maq]])]); await loadOps(); S.jdata = { tab: 'cat', cat, props: props.filter(p => p.estado === 'pend') }; }
    if (t === 'ope') await loadOps(true);
  } catch (e) { toast('No se pudo cargar: ' + e.message); }
  paint();
}
async function saveCat(cat, maq) { cat.rev = (cat.rev || 0) + 1; cat.upd = iso(); cat.by = S.jefe.name; delete cat.base; CATS[maq] = cat; await store.set('catalogo', maq, cat); }

/* ----- exportar ----- */
function descargar(bytes, nombre) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function specDoc(maq, fecha, regsDoc) {
  const cat = await getCatalogo(maq), orig = CAT0[maq], regs = {}; regsDoc.forEach(r => regs[r.turno] = { ...r, operador: opName(r.operador) });
  let puntos = cat.puntos.map(p => ({ ...p }));
  const snap = {}; regsDoc.forEach(r => (r.puntos || []).forEach(p => snap[p.k] = p));
  if (regsDoc.some(r => r.estado !== 'stop')) puntos = puntos.map(p => snap[p.k] ? { ...p, estado: 'vigente', label: snap[p.k].label } : (p.estado === 'noaplica' ? p : { ...p, estado: 'retirado' }));
  const have = new Set(cat.puntos.map(p => p.k)), removidas = orig.puntos.filter(p => !have.has(p.k)).map(p => p.row);
  return { src: orig.sheet, name: orig.sheet, fecha, regs, puntos, productos: PROD, removidas };
}
async function exportar(modo) {
  const msg = $('#exmsg'); const say = t => { if (msg) msg.innerHTML = t; };
  try {
    say('Preparando el Excel…'); await loadOps();
    const plantilla = await (await fetch('plantilla.xlsx')).arrayBuffer(); let specs = [], nombre;
    if (modo === 'dia') {
      const f = $('#edia').value; if (!f) return say('Elige la fecha.');
      const regs = await store.query('registros', [['fecha', '==', f]]);
      for (const m of MAQS) specs.push(await specDoc(m, f, regs.filter(r => r.maq === m)));
      nombre = `FICHAS_PARAMETROS_EXTRUSION_${f}.xlsx`;
    } else {
      const m = $('#em').value, d = $('#ed').value, h = $('#eh').value; if (!d || !h || d > h) return say('Elige un rango de fechas válido.');
      const regs = await store.query('registros', [['__id', '>=', `${m}_${d}`], ['__id', '<=', `${m}_${h}_9`]]);
      const fechas = [...new Set(regs.map(r => r.fecha))].sort(); if (!fechas.length) return say('No hay registros de esa máquina en ese rango.');
      if (fechas.length > 90) return say('Son demasiados días para un solo libro; usa un rango más corto (máximo 90 días).');
      for (const f of fechas) { const s = await specDoc(m, f, regs.filter(r => r.fecha === f)); s.name = `${s.src} ${f.slice(8)}-${f.slice(5, 7)}-${f.slice(2, 4)}`; specs.push(s); }
      nombre = `FICHAS_${m}_${d}_a_${h}.xlsx`;
    }
    descargar(await construirLibro(plantilla, specs), nombre); say(pill('ok', 'Listo', 'check') + ' Se descargó ' + esc(nombre));
  } catch (e) { console.error(e); say(`<div class="err">No se pudo exportar: ${esc(e.message)}</div>`); }
}

/* ---------- control de pantalla ---------- */
function html() {
  const v = S.view; let b;
  if (S.busy && v !== 'reg') b = vBoot();
  else if (v === 'boot') b = vBoot(); else if (v === 'nocfg') b = vNoCfg(); else if (v === 'setup') b = vSetup();
  else if ((v === 'hoy' || v === 'reg') && !S.ses) b = vIdent();
  else if (v === 'hoy') b = vHoy(); else if (v === 'reg') b = vReg(); else if (v === 'cons') b = vCons(); else if (v === 'jefe') b = vJefe(); else b = vBoot();
  return banners() + b;
}
function paint() {
  const a = $('#app'), sx = scrollY, keep = {}; ['jn', 'jp', 'sp1', 'sp2', 'sc', 'cq', 'idc'].forEach(i => { const e = $('#' + i); if (e) keep[i] = e.value; });
  a.innerHTML = html(); Object.keys(keep).forEach(i => { const e = $('#' + i); if (e && !e.value) e.value = keep[i]; });
  const nav = $('#nav'), show = ['hoy', 'reg', 'cons', 'jefe'].includes(S.view) && !((S.view === 'hoy' || S.view === 'reg') && !S.ses); nav.hidden = !show; $('#navin').innerHTML = navHtml();
  if (S._keep) { scrollTo(0, sx); S._keep = false; }
}
function go(v) { S.view = v; S.setupErr = ''; if (v !== 'reg') S.form = null; if (v === 'hoy') ensureHoy(); paint(); scrollTo(0, 0); if (v === 'jefe' && S.jefe) cargarJ(); if (v === 'cons') loadOps(); }
async function ensureHoy() {
  S.unsub.forEach(u => u()); S.unsub = [];
  if (!S.ses) return; await loadOps();
  const { cur, prev } = bloque(), fechas = [...new Set([cur.fecha, prev.fecha])]; S.regs = []; S.just = [];
  const bucketR = {}, bucketJ = {};
  fechas.forEach(f => {
    S.unsub.push(store.watch('registros', [['fecha', '==', f]], rows => { bucketR[f] = rows; S.regs = Object.values(bucketR).flat(); if (S.view === 'hoy') { S._keep = true; paint(); } }));
    S.unsub.push(store.watch('justif', [['fecha', '==', f]], rows => { bucketJ[f] = rows; S.just = Object.values(bucketJ).flat(); if (S.view === 'hoy') { S._keep = true; paint(); } }));
  });
}

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, v = b.dataset.v, f = S.form;
  try {
    if (a === 'go') return go(v);
    if (a === 'panel') return void (location.href = KPI_URL);
    if (a === 'theme') { document.documentElement.dataset.theme = isDark() ? 'light' : 'dark'; return paint(); }
    if (a === 'setupGo') {
      const p1 = $('#sp1').value.trim(), p2 = $('#sp2').value.trim(), c = $('#sc').value.trim();
      if (!/^\d{4,8}$/.test(p1)) { S.setupErr = 'El PIN debe tener entre 4 y 8 dígitos.'; return paint(); }
      if (p1 !== p2) { S.setupErr = 'Los dos PIN no coinciden.'; return paint(); }
      if (c.length < 3) { S.setupErr = 'El código de planta debe tener al menos 3 caracteres.'; return paint(); }
      CFG = { pinHash: await sha(p1), plantaHash: await sha(c.toLowerCase()), compuestos: COMPUESTOS_DEF, inst: ['E170'], creado: iso() };
      await store.set('config', 'main', CFG); localStorage.setItem('fichas_planta', CFG.plantaHash); S.setupErr = ''; return go('hoy');
    }
    if (a === 'chg') { S.ses = null; localStorage.removeItem('fichas_ses'); S.ident = { name: '', t: '', h: '', code: '', ack: false }; return go('hoy'); }
    if (a === 'idt') { S.ident.t = v; return paint(); }
    if (a === 'idh') { S.ident.h = v; S.ident.ack = false; return paint(); }
    if (a === 'idack') { S.ident.ack = true; return paint(); }
    if (a === 'idgo') {
      const I = S.ident; if (!identOk()) return;
      if (!plantaOk()) { if ((await sha(I.code.trim().toLowerCase())) !== CFG.plantaHash) { S.setupErr = 'El código de planta no es correcto.'; return paint(); } localStorage.setItem('fichas_planta', CFG.plantaHash); }
      S.setupErr = ''; S.ses = { n: I.name.trim().replace(/\s+/g, ' '), t: I.t, h: I.h, at: Date.now() }; saveSes(S.ses);
      const id = slug(S.ses.n); store.get('operadores', id).then(o => { if (!o) { store.set('operadores', id, { name: S.ses.n, creado: iso(), recent: [] }); OPS_AT = 0; } }).catch(() => { });
      return go('hoy');
    }
    if (a === 'reg') { const m = b.dataset.m; return abrirReg(m); }
    if (a === 'est') { f.estado = v; return paint(); }
    if (a === 'mot') { f.motivo = v; return paint(); }
    if (a === 'mpt') { f.mpTipo = v; f.mpDetalle = ''; return paint(); }
    if (a === 'sec') { f.open[v] = !f.open[v]; return paint(); }
    if (a === 'na') { const k = b.dataset.k; const x = f.vals[k] || (f.vals[k] = {}); x.na = !x.na; return paint(); }
    if (a === 'prop') { f.prop = f.prop === b.dataset.k ? null : b.dataset.k; return paint(); }
    if (a === 'propNom' || a === 'propNA') {
      const k = b.dataset.k, p = f.cat.puntos.find(q => q.k === k), nuevo = ($('#pnom') || {}).value || '';
      if (a === 'propNom' && !nuevo.trim()) return toast('Escribe el nombre correcto');
      await guardar(store.set('propuestas', `${f.maq}_${k}_${Date.now()}`, { maq: f.maq, k, label: p.label, tipo: a === 'propNA' ? 'noaplica' : 'nombre', nuevo: nuevo.trim(), by: S.ses.n, at: iso(), estado: 'pend' }));
      f.prop = null; toast('Propuesta enviada al jefe'); return paint();
    }
    if (a === 'hist') {
      f.histOpen = !f.histOpen; paint(); if (!f.histOpen) return;
      const rs = (await store.query('registros', [['maq', '==', f.maq], ['codigo', '==', f.codigo]])).filter(r => r.id !== f.id && r.estado !== 'stop').sort((x, y) => y.fecha.localeCompare(x.fecha))[0];
      const el = $('#histp'); if (!el) return;
      el.innerHTML = rs ? `<div class="note" style="margin-top:8px"><b>Última corrida de ${esc(f.codigo)} en ${f.maq}</b><div class="muted sm">${dmy(rs.fecha)} · Turno ${rs.turno} · ${esc(opName(rs.operador))}${rs.mpDetalle ? ' · ' + esc(rs.mpDetalle) : ''}</div><div class="scroll" style="max-height:240px;margin-top:6px"><table class="tbl">${(rs.puntos || []).filter(p => p.na || String(p.v).trim() !== '').slice(0, 60).map(p => `<tr><td>${esc(p.label)}</td><td class="n">${p.na ? 'N/A' : esc(p.v)}</td></tr>`).join('')}</table></div><button class="btn sec sm" style="margin-top:8px" data-a="hcopy" data-id="${esc(rs.id)}">Usar estos valores como punto de partida</button></div>` : '<div class="note" style="margin-top:8px">No hay registros anteriores de este producto en esta máquina.</div>';
      return;
    }
    if (a === 'hcopy') {
      const rs = await store.get('registros', b.dataset.id); if (!rs) return; let n = 0;
      (rs.puntos || []).forEach(p => { if (f.cat.puntos.some(q => q.k === p.k && q.estado === 'vigente') && !(f.vals[p.k] && (f.vals[p.k].na || String(f.vals[p.k].v || '').trim() !== ''))) { f.vals[p.k] = { v: p.v, na: !!p.na }; n++; } });
      f.histOpen = false; toast(`Se copiaron ${n} valores: revísalos y corrige los que cambien`); return paint();
    }
    if (a === 'save') return guardarReg();
    if (a === 'confirm') { f.anom[b.dataset.k] = 'ok'; const w = $('#w_' + b.dataset.k); if (w) w.hidden = true; return; }
    if (a === 'fix') { const k = b.dataset.k; f.vals[k] = { ...(f.vals[k] || {}), v: '' }; const i = $(`[data-k="${k}"]`); if (i) { i.value = ''; i.focus(); } const w = $('#w_' + k); if (w) w.hidden = true; return updCounts(); }
    if (a === 'ct') { S.cons.t = v; return paint(); }
    if (a === 'cpick') { S.cons.q = PROD[v] ? v : S.cons.q; return consultar(v); }
    if (a === 'cbuscar') {
      const q = ($('#cq').value || '').trim(); S.cons.q = q; S.cons.m = $('#cm').value; if (!q) return toast('Escribe un código o un nombre');
      const r = buscarProd(q); if (!r.length) { S.cons.res = []; S.cons.regs = null; toast('No encontré ese producto en la base'); return paint(); }
      if (r.length === 1 || PROD[q]) return consultar(r[0][0]); S.cons.res = r; S.cons.regs = null; return paint();
    }
    // jefe
    if (a === 'jgo') {
      const n = ($('#jn').value || '').trim().replace(/\s+/g, ' '), p = ($('#jp').value || '').trim(); if (!n) { S.setupErr = 'Escribe tu nombre.'; return paint(); }
      if ((await sha(p)) !== CFG.pinHash) { S.setupErr = 'PIN incorrecto.'; return paint(); }
      S.jefe = { name: n }; S.setupErr = ''; S.jf.fecha = S.jf.fecha || slotAt(now()).fecha; S.jf.hasta = S.jf.hasta || ymd(now()); S.jf.desde = S.jf.desde || addDays(ymd(now()), -7); paint(); return cargarJ();
    }
    if (a === 'jout') { S.jefe = null; return paint(); }
    if (a === 'jt') { S.jtab = v; S.jdata = null; S.modal = null; paint(); return cargarJ(); }
    if (a === 'jjust') { S.modal = { t: 'just', m: b.dataset.m, h: b.dataset.h }; return paint(); }
    if (a === 'jcerrar') { S.modal = null; return paint(); }
    if (a === 'jmot' || a === 'jmotOtro') {
      const mo = S.modal, motivo = a === 'jmot' ? v : (($('#jotro') || {}).value || '').trim(); if (!motivo) return toast('Escribe el motivo');
      await guardar(store.set('justif', `${S.jf.fecha}_${mo.m}_${mo.h}`, { fecha: S.jf.fecha, maq: mo.m, h: mo.h, motivo, by: S.jefe.name, at: iso() })); S.modal = null; toast('Justificación guardada'); return cargarJ();
    }
    if (a === 'jquitarJ') { const mo = S.modal; await guardar(store.del('justif', `${S.jf.fecha}_${mo.m}_${mo.h}`)); S.modal = null; return cargarJ(); }
    if (a === 'cest') { const cat = S.jdata.cat, p = cat.puntos.find(q => q.k === b.dataset.k); p.estado = v; await saveCat(cat, S.jf.maq); toast('Catálogo actualizado'); return paint(); }
    if (a === 'cren') { S.modal = { t: 'ren', k: b.dataset.k }; return paint(); }
    if (a === 'crenOk') { const cat = S.jdata.cat, p = cat.puntos.find(q => q.k === b.dataset.k), n = ($('#rnom').value || '').trim(); if (!n) return; p.label = n; p.xl = ''; S.modal = null; await saveCat(cat, S.jf.maq); toast('Nombre actualizado; los registros antiguos conservan el suyo'); return paint(); }
    if (a === 'cadd') {
      const n = ($('#nlab').value || '').trim(); if (!n) return toast('Escribe el nombre del punto'); const cat = S.jdata.cat, sec = $('#nsec').value;
      const idx = cat.puntos.map(p => p.sec).lastIndexOf(sec); cat.puntos.splice(idx + 1, 0, { k: 'n' + Date.now().toString(36), sec, label: n, xl: '', estado: 'vigente' }); await saveCat(cat, S.jf.maq); toast('Punto agregado'); return paint();
    }
    if (a === 'pap' || a === 'pre') {
      const p = S.jdata.props.find(q => q.id === b.dataset.id), cat = S.jdata.cat;
      if (a === 'pap') { const pt = cat.puntos.find(q => q.k === p.k); if (pt) { if (p.tipo === 'noaplica') pt.estado = 'noaplica'; else { pt.label = p.nuevo; pt.xl = ''; } await saveCat(cat, S.jf.maq); } }
      await store.update('propuestas', p.id, { estado: a === 'pap' ? 'ok' : 'no', resuelta: iso(), por: S.jefe.name }); toast(a === 'pap' ? 'Aprobado' : 'Rechazado'); return cargarJ();
    }
    if (a === 'fusion') { const x = $('#fa').value, y = $('#fb').value; if (!x || !y || x === y) return toast('Elige dos nombres distintos'); await store.update('operadores', slug(x), { alias: y }); await loadOps(true); toast('Fusionados'); return paint(); }
    if (a === 'cdadd') { const n = ($('#ncomp').value || '').trim(); if (!n) return; CFG.compuestos = [...(CFG.compuestos || []), n]; await store.update('config', 'main', { compuestos: CFG.compuestos }); return paint(); }
    if (a === 'cdel') { CFG.compuestos = CFG.compuestos.filter((_, i) => i !== +b.dataset.i); await store.update('config', 'main', { compuestos: CFG.compuestos }); return paint(); }
    if (a === 'cinst') { const s = new Set(CFG.inst || []); s.has(v) ? s.delete(v) : s.add(v); CFG.inst = [...s]; await store.update('config', 'main', { inst: CFG.inst }); return paint(); }
    if (a === 'ccred') {
      const p = ($('#npin').value || '').trim(), c = ($('#ncod').value || '').trim(), up = {};
      if (p) { if (!/^\d{4,8}$/.test(p)) return toast('El PIN debe tener 4 a 8 dígitos'); up.pinHash = await sha(p); } if (c) { if (c.length < 3) return toast('Código demasiado corto'); up.plantaHash = await sha(c.toLowerCase()); }
      if (!Object.keys(up).length) return toast('No hay cambios'); Object.assign(CFG, up); await store.update('config', 'main', up); if (up.plantaHash) localStorage.setItem('fichas_planta', CFG.plantaHash); return toast('Guardado');
    }
    if (a === 'cprueba') { const el = $('#pr'); el.textContent = 'Probando…'; try { el.innerHTML = pill('ok', 'OK', 'check') + ' ' + esc(await store.prueba()); } catch (err) { el.innerHTML = `<div class="err">${esc(err.message)}<br>${esc(err.code || '')}</div>`; } return; }
    if (a === 'expdia') return exportar('dia');
    if (a === 'expmaq') return exportar('maq');
  } catch (err) { console.error(err); toast('Algo falló: ' + err.message); }
});
document.addEventListener('input', e => {
  const t = e.target, f = S.form;
  if (t.id === 'idn') { S.ident.name = t.value; const g = $('#idgo'); if (g) { g.disabled = !identOk(); g.style.opacity = identOk() ? 1 : .5; } }
  else if (t.id === 'idc') S.ident.code = t.value;
  else if (f && t.id === 'cod') { f.codigo = t.value.trim(); $('#codmsg').innerHTML = codMsg(f.codigo); $('#cambio').innerHTML = cambioMsg(f); const hb = $('[data-a="hist"]'); if (hb) { hb.disabled = !PROD[f.codigo]; hb.style.opacity = PROD[f.codigo] ? 1 : .5; } }
  else if (f && t.id === 'mpd') f.mpDetalle = t.value;
  else if (f && t.id === 'obs') f.obs = t.value;
  else if (f && t.dataset && t.dataset.k) { const x = f.vals[t.dataset.k] || (f.vals[t.dataset.k] = {}); x.v = t.value; updCounts(); }
});
document.addEventListener('change', e => {
  const t = e.target, f = S.form;
  if (f && t.id === 'mpd') { f.mpDetalle = t.value; return; }
  if (f && t.dataset && t.dataset.k && t.tagName === 'INPUT') {
    const k = t.dataset.k, r = esAnormal(t.value, f.hist[k]), w = $('#w_' + k);
    if (w && r && f.anom[k] !== 'ok') { w.hidden = false; w.innerHTML = `Valor anormal para esta máquina. ¿Confirmas? (lo habitual está cerca de ${Math.round(r.m * 100) / 100})<div class="row"><button class="btn sm" data-a="confirm" data-k="${k}">Confirmar</button><button class="btn ghost sm" data-a="fix" data-k="${k}">Corregir</button></div>`; } else if (w) w.hidden = true;
    return;
  }
  if (t.id === 'cm') { S.cons.m = t.value; S.cons.regs = null; return paint(); }
  if (t.id === 'jfecha') { S.jf.fecha = t.value; S.jdata = null; paint(); return cargarJ(); }
  if (t.id === 'jm') { S.jf.maq = t.value; S.jdata = null; S.modal = null; paint(); return cargarJ(); }
  if (t.id === 'edia') S.jf.fecha = t.value; if (t.id === 'em') S.jf.maq = t.value; if (t.id === 'ed') S.jf.desde = t.value; if (t.id === 'eh') S.jf.hasta = t.value;
});
addEventListener('online', paint); addEventListener('offline', paint);

/* ---------- arranque ---------- */
(async function () {
  paint();
  try {
    [store, CAT0, PROD] = await Promise.all([abrirAlmacen(), getJSON('catalog.json'), getJSON('products.json')]);
    CFG = await store.get('config', 'main'); S.ses = loadSes();
    if (!CFG) S.view = (store.mode === 'demo' || location.hash === '#setup') ? 'setup' : 'nocfg'; else { S.view = new URLSearchParams(location.search).get('v') || 'hoy'; await loadOps(); }
    if (S.view === 'hoy') await ensureHoy();
  } catch (e) { console.error(e); $('#app').innerHTML = `<main><div class="err">No se pudo iniciar la app: ${esc(e.message)}</div></main>`; return; }
  paint();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
