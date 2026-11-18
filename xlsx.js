// Exporta al Excel ORIGINAL: toma la plantilla (el libro actual) y solo rellena celdas, sin cambiar diseño.
import { toNum, dmy } from './rules.js';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const parse = s => new DOMParser().parseFromString(s, 'application/xml');
const ser = d => new XMLSerializer().serializeToString(d);
const colN = ref => { const m = /^([A-Z]+)/.exec(ref)[1]; let n = 0; for (const ch of m) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
const rowN = ref => +/(\d+)$/.exec(ref)[1];
const els = (p, tag) => [...p.getElementsByTagNameNS(NS, tag)];

class Sheet {
  constructor(xml, styles) { this.doc = parse(xml); this.sd = this.doc.getElementsByTagNameNS(NS, 'sheetData')[0]; this.styles = styles; }
  row(r) { return els(this.sd, 'row').find(x => +x.getAttribute('r') === r); }
  cell(ref) {
    const row = this.row(rowN(ref)); if (!row) return null;
    let c = els(row, 'c').find(x => x.getAttribute('r') === ref);
    if (!c) {
      c = this.doc.createElementNS(NS, 'c'); c.setAttribute('r', ref);
      const after = els(row, 'c').filter(x => colN(x.getAttribute('r')) < colN(ref)).pop();
      if (after) after.after(c); else row.prepend(c);
    }
    return c;
  }
  _clear(c) { while (c.firstChild) c.removeChild(c.firstChild); c.removeAttribute('t'); }
  text(ref, t, styleOpts) {
    const c = this.cell(ref); if (!c) return; this._clear(c);
    if (t === null || t === undefined || t === '') { if (styleOpts) this.restyle(c, styleOpts); return; }
    c.setAttribute('t', 'inlineStr');
    const is = this.doc.createElementNS(NS, 'is'), te = this.doc.createElementNS(NS, 't');
    te.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); te.textContent = String(t);
    is.appendChild(te); c.appendChild(is); if (styleOpts) this.restyle(c, styleOpts);
  }
  num(ref, n) { const c = this.cell(ref); if (!c) return; this._clear(c); const v = this.doc.createElementNS(NS, 'v'); v.textContent = String(n); c.appendChild(v); }
  restyle(c, o) { c.setAttribute('s', this.styles.clone(+c.getAttribute('s') || 0, o)); }
  value(ref, v) { // número si lo es, texto si no
    const n = toNum(v); const raw = String(v).trim();
    if (!isNaN(n) && /^-?\d+([.,]\d+)?$/.test(raw)) this.num(ref, n); else this.text(ref, raw);
  }
  unmerge(ref) { els(this.doc, 'mergeCell').filter(m => m.getAttribute('ref') === ref).forEach(m => m.remove()); this._cnt(); }
  merge(ref) { let mc = this.doc.getElementsByTagNameNS(NS, 'mergeCells')[0];
    if (!mc) { mc = this.doc.createElementNS(NS, 'mergeCells'); this.sd.after(mc); }
    const m = this.doc.createElementNS(NS, 'mergeCell'); m.setAttribute('ref', ref); mc.appendChild(m); this._cnt(); }
  _cnt() { const mc = this.doc.getElementsByTagNameNS(NS, 'mergeCells')[0]; if (mc) mc.setAttribute('count', els(mc, 'mergeCell').length); }
  height(r, ht) { const x = this.row(r); if (x) { x.setAttribute('ht', ht); x.setAttribute('customHeight', '1'); } }
  hideRow(r) { const x = this.row(r); if (x) x.setAttribute('hidden', '1'); }
  lastRow() { return Math.max(...els(this.sd, 'row').map(x => +x.getAttribute('r'))); }
  appendRowLike(srcRow, newR) {
    const src = this.row(srcRow), n = src.cloneNode(true); n.setAttribute('r', newR); n.removeAttribute('hidden');
    els(n, 'c').forEach(c => { c.setAttribute('r', /^[A-Z]+/.exec(c.getAttribute('r'))[0] + newR); this._clear(c); });
    this.sd.appendChild(n); this.merge('A' + newR + ':B' + newR);
    const d = this.doc.getElementsByTagNameNS(NS, 'dimension')[0]; if (d) d.setAttribute('ref', 'A1:F' + newR);
  }
  clean() {
    const sv = this.doc.getElementsByTagNameNS(NS, 'sheetView')[0];
    if (sv) { sv.removeAttribute('tabSelected'); sv.removeAttribute('topLeftCell'); els(sv, 'selection').forEach(s => { s.setAttribute('activeCell', 'A1'); s.setAttribute('sqref', 'A1'); }); }
    const ps = this.doc.getElementsByTagNameNS(NS, 'pageSetup')[0]; if (ps) ps.removeAttributeNS(RNS, 'id');
    // dibuja la hoja en el área impresa completa
  }
  xml() { return ser(this.doc); }
}

class Styles {
  constructor(xml) { this.doc = parse(xml); this.cache = {}; this.xfs = this.doc.getElementsByTagNameNS(NS, 'cellXfs')[0]; }
  clone(base, o) {
    const key = base + JSON.stringify(o); if (this.cache[key] !== undefined) return this.cache[key];
    const list = els(this.xfs, 'xf'), n = list[base].cloneNode(true);
    o = { ...o }; const fsz = o.fontSz; delete o.fontSz;
    if (fsz) { const fonts = this.doc.getElementsByTagNameNS(NS, 'fonts')[0], fl = els(fonts, 'font'), f = fl[+n.getAttribute('fontId') || 0].cloneNode(true);
      let sz = els(f, 'sz')[0]; if (!sz) { sz = this.doc.createElementNS(NS, 'sz'); f.prepend(sz); } sz.setAttribute('val', fsz);
      fonts.appendChild(f); fonts.setAttribute('count', fl.length + 1); n.setAttribute('fontId', fl.length); n.setAttribute('applyFont', '1'); }
    let al = els(n, 'alignment')[0]; if (!al) { al = this.doc.createElementNS(NS, 'alignment'); n.insertBefore(al, n.firstChild); }
    for (const [k, v] of Object.entries(o)) al.setAttribute(k, v);
    n.setAttribute('applyAlignment', '1'); this.xfs.appendChild(n);
    const idx = list.length; this.xfs.setAttribute('count', idx + 1); this.cache[key] = idx; return idx;
  }
  xml() { return ser(this.doc); }
}

const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const SHRINK = { shrinkToFit: '1', wrapText: '0', horizontal: 'center', vertical: 'center' };
const WRAPC = { wrapText: '1', shrinkToFit: '0', horizontal: 'center', vertical: 'center', fontSz: '8' };
const WRAP_TOP = { wrapText: '1', vertical: 'top', horizontal: 'left', shrinkToFit: '0' };

export async function construirLibro(plantillaBuf, specs) {
  const JSZip = globalThis.JSZip, zip = await JSZip.loadAsync(plantillaBuf);
  const rd = async p => zip.file(p).async('string');
  const wbDoc = parse(await rd('xl/workbook.xml')), relDoc = parse(await rd('xl/_rels/workbook.xml.rels'));
  const rels = {}; [...relDoc.getElementsByTagNameNS(PR, 'Relationship')].forEach(r => rels[r.getAttribute('Id')] = r);
  const sheetPath = name => { const s = els(wbDoc, 'sheet').find(x => x.getAttribute('name') === name); if (!s) throw new Error('Hoja no encontrada en la plantilla: ' + name); return 'xl/' + rels[s.getAttributeNS(RNS, 'id')].getAttribute('Target'); };
  const styles = new Styles(await rd('xl/styles.xml'));
  const out = new JSZip(), keep = [];
  const ct = parse(await rd('[Content_Types].xml')), ctRoot = ct.documentElement;
  const CTN = ctRoot.namespaceURI;
  [...ctRoot.children].forEach(o => { const p = o.getAttribute('PartName'); if (p && (/^\/xl\/(worksheets|drawings|calcChain|printerSettings)/.test(p))) o.remove(); });
  const addOverride = (part, type) => { const o = ct.createElementNS(CTN, 'Override'); o.setAttribute('PartName', part); o.setAttribute('ContentType', type); ctRoot.appendChild(o); };
  const shNames = [];
  let i = 0;
  for (const sp of specs) {
    i++;
    const path = sheetPath(sp.src), sh = new Sheet(await rd(path), styles);
    rellenar(sh, sp);
    sh.clean();
    out.file(`xl/worksheets/sheet${i}.xml`, sh.xml());
    const relP = path.replace('worksheets/', 'worksheets/_rels/') + '.rels', rel = parse(await rd(relP));
    const dr = [...rel.getElementsByTagNameNS(PR, 'Relationship')].find(r => /\/drawing$/.test(r.getAttribute('Type')));
    let relXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}">`;
    if (dr) {
      const dPath = 'xl/drawings/' + dr.getAttribute('Target').split('/').pop();
      out.file(`xl/drawings/drawing${i}.xml`, await rd(dPath));
      out.file(`xl/drawings/_rels/drawing${i}.xml.rels`, await rd(dPath.replace('drawings/', 'drawings/_rels/') + '.rels'));
      relXml += `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${i}.xml"/>`;
      addOverride(`/xl/drawings/drawing${i}.xml`, 'application/vnd.openxmlformats-officedocument.drawing+xml');
      // el dibujo del original es rId2 en la hoja: se reescribe el id
    }
    relXml += '</Relationships>'; out.file(`xl/worksheets/_rels/sheet${i}.xml.rels`, relXml);
    addOverride(`/xl/worksheets/sheet${i}.xml`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');
    shNames.push(sp.name);
  }
  // el <drawing r:id="rId2"/> de cada hoja apunta ahora a rId1
  for (let k = 1; k <= specs.length; k++) { const f = out.file(`xl/worksheets/sheet${k}.xml`); out.file(`xl/worksheets/sheet${k}.xml`, (await f.async('string')).replace(/(<drawing [^>]*r:id=")rId\d+"/, '$1rId1"')); }
  // libro: hojas nuevas, sin nombres definidos ni calcChain
  const sheetsEl = els(wbDoc, 'sheets')[0]; [...sheetsEl.children].forEach(c => c.remove());
  shNames.forEach((n, k) => { const s = wbDoc.createElementNS(NS, 'sheet'); s.setAttribute('name', n); s.setAttribute('sheetId', String(k + 1)); s.setAttributeNS(RNS, 'r:id', 'rId' + (k + 1)); sheetsEl.appendChild(s); });
  els(wbDoc, 'definedNames').forEach(x => x.remove());
  const bv = els(wbDoc, 'workbookView')[0]; if (bv) { bv.removeAttribute('activeTab'); bv.removeAttribute('firstSheet'); }
  out.file('xl/workbook.xml', ser(wbDoc));
  let wr = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}">`;
  shNames.forEach((_, k) => wr += `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`);
  [...relDoc.getElementsByTagNameNS(PR, 'Relationship')].filter(r => !/\/(worksheet|calcChain)$/.test(r.getAttribute('Type'))).forEach(r => { wr += `<Relationship Id="x${r.getAttribute('Id')}" Type="${r.getAttribute('Type')}" Target="${r.getAttribute('Target')}"/>`; });
  out.file('xl/_rels/workbook.xml.rels', wr + '</Relationships>');
  out.file('xl/styles.xml', styles.xml());
  out.file('[Content_Types].xml', ser(ct));
  out.file('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>');
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue;
    if (/^xl\/(worksheets|drawings|printerSettings|calcChain|styles\.xml|workbook\.xml|_rels)/.test(name) || name === '[Content_Types].xml' || name === 'docProps/app.xml') continue;
    out.file(name, await zip.file(name).async('uint8array'));
  }
  return out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function rellenar(sh, sp) {
  const { regs, puntos, fecha, productos } = sp; // regs: {'1':reg,'2':reg,'3':reg}
  const cols = { 1: 'C', 2: 'D', 3: 'E' };
  const turnos = ['1', '2', '3'], conReg = turnos.filter(t => regs[t]);
  // Código y producto
  const prods = conReg.filter(t => regs[t].estado !== 'stop' && regs[t].codigo);
  const codigos = [...new Set(prods.map(t => regs[t].codigo))];
  const nombre = c => productos[c] || (prods.map(t => regs[t]).find(r => r.codigo === c) || {}).producto || '';
  if (codigos.length <= 1) {
    if (codigos[0]) { sh.value('C3', codigos[0]); sh.text('C4', nombre(codigos[0])); } else { sh.text('C3', ''); sh.text('C4', ''); }
  } else {
    sh.unmerge('C3:F3'); sh.unmerge('C4:F4');
    for (const t of turnos) { const r = regs[t]; const ok = r && r.estado !== 'stop' && r.codigo;
      if (ok) { sh.value(cols[t] + '3', r.codigo); sh.text(cols[t] + '4', nombre(r.codigo), WRAPC); } else { sh.text(cols[t] + '3', ''); sh.text(cols[t] + '4', ''); } }
    sh.height(4, 56);
    sh.text('F3', 'CAMBIO DE PRODUCTO', { wrapText: '1', horizontal: 'center', vertical: 'center', shrinkToFit: '0' }); sh.merge('F3:F4');
  }
  sh.text('C5', dmy(fecha), { horizontal: 'center' });
  for (const t of turnos) {
    const r = regs[t]; if (!r) continue;
    sh.height(6, 30); sh.height(7, 30);
    sh.text(cols[t] + '6', (r.operador || '') + ' · ' + r.horario, WRAPC);
    sh.text(cols[t] + '7', r.estado === 'stop' ? '' : `${r.mpTipo || ''}${r.mpDetalle ? ': ' + r.mpDetalle : ''}`, WRAPC);
  }
  // Puntos de control
  const usados = new Set(); let last = sh.lastRow(), firstData = null;
  for (const p of puntos) {
    let r = p.row;
    if (p.estado === 'retirado') { if (r) sh.hideRow(r); continue; }
    if (!r) { const src = last; last++; sh.appendRowLike(src, last); r = last; p.row = r; }
    usados.add(r); if (firstData === null || r < firstData) firstData = r;
    const orig = norm(p.xl);
    sh.text('A' + r, p.label === orig && p.xl ? p.xl : p.label);
    for (const t of turnos) { const rg = regs[t]; if (!rg || rg.estado === 'stop') continue;
      if (p.estado === 'noaplica') { sh.text(cols[t] + r, 'N/A', SHRINK); continue; }
      const pv = (rg.puntos || []).find(x => x.k === p.k); if (!pv) continue;
      if (pv.na) sh.text(cols[t] + r, 'N/A', SHRINK); else if (pv.v !== undefined && String(pv.v).trim() !== '') sh.value(cols[t] + r, pv.v); }
  }
  (sp.removidas || []).forEach(r => sh.hideRow(r)); // puntos del original que ya no están en el catálogo
  // detenciones en la primera fila de datos, y observaciones
  const obs = [];
  for (const t of turnos) { const r = regs[t]; if (!r) continue;
    if (r.estado === 'stop') { if (firstData) sh.text(cols[t] + firstData, 'DETENIDA', SHRINK); obs.push(`Turno ${t} (${r.operador}, ${r.horario}): MÁQUINA DETENIDA – ${r.motivo || ''}`); }
    if ((r.obs || '').trim()) obs.push(`Turno ${t} (${r.operador}): ${r.obs.trim()}`); }
  if (obs.length) { const to = Math.min(9 + 17, Math.max(9, sh.lastRow())); sh.text('F9', obs.join('\n'), WRAP_TOP); if (to > 9) sh.merge('F9:F' + to); }
}
