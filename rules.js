// Reglas puras de Fichas de Parámetros (sin pantalla ni base de datos).
export const HORARIOS = { N: 'N · 22:00–07:00', M: 'M · 07:00–15:00', T: 'T · 15:00–22:00' };
export const MOTIVOS = ['Mantención programada', 'Sin programa', 'Pruebas producción', 'Falta de personal'];
export const NAVES = [
  { n: 'Nave 1', ms: ['E150', 'E90', 'E40', 'E180', 'E30', 'E160'] },
  { n: 'Nave 2', ms: ['E170', 'E110', 'E51', 'E60', 'E100'] },
  { n: 'Nave 3', ms: ['E130', 'E70', 'E120', 'E80', 'E140'] },
];
export const MAQS = NAVES.flatMap(n => n.ms);
export const pad = n => (n < 10 ? '0' : '') + n;
export const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const dmy = s => { const [y, m, d] = s.split('-'); return d + '-' + m + '-' + y; };
export const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(y, m - 1, d + n); return ymd(x); };

// Horario (N, M, T) que corresponde a una hora del reloj. Solo se usa para el aviso de coherencia y para el tablero.
export function horarioAt(d) {
  const h = d.getHours();
  return h >= 22 || h < 7 ? 'N' : h < 15 ? 'M' : 'T';
}
// Fecha del documento: el día parte con la noche; N registrado desde las 22:00 pertenece al día siguiente.
export function docFecha(d, horario) {
  const s = ymd(d);
  return horario === 'N' && d.getHours() >= 22 ? addDays(s, 1) : s;
}
export function slotAt(d) { const h = horarioAt(d); return { fecha: docFecha(d, h), h }; }
// Inicio del bloque de horario en que está d.
export function slotStart(d) {
  const h = horarioAt(d), x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (h === 'M') x.setHours(7); else if (h === 'T') x.setHours(15);
  else { x.setHours(22); if (d.getHours() < 22) x.setDate(x.getDate() - 1); }
  return x;
}
export function prevSlot(d) { return slotAt(new Date(slotStart(d).getTime() - 60000)); }

export function median(a) { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
export function toNum(v) { if (v === null || v === undefined || String(v).trim() === '') return NaN; return parseFloat(String(v).replace(',', '.')); }
// ¿El valor se aleja de lo habitual en esa máquina y punto? Solo avisa si hay al menos 5 datos previos.
export function esAnormal(v, hist) {
  const x = toNum(v); if (isNaN(x) || !hist || hist.length < 5) return null;
  const m = median(hist); if (m === 0) return x !== 0 && Math.abs(x) > 1 ? { m } : null;
  const a = Math.abs(x), b = Math.abs(m);
  return (Math.sign(x) !== Math.sign(m) && x !== 0) || a > b * 1.5 || a < b * 0.5 ? { m } : null;
}
export const listo = p => p.na || (p.v !== undefined && p.v !== null && String(p.v).trim() !== '');
export function resumenPuntos(puntos) { const n = puntos.length, l = puntos.filter(listo).length; return { n, l }; }
export function completo(reg) {
  if (reg.estado === 'stop') return !!reg.motivo;
  const { n, l } = resumenPuntos(reg.puntos || []);
  return !!reg.codigo && !!reg.mpTipo && !!(reg.mpDetalle || '').trim() && n > 0 && l === n;
}
// Estado de una máquina en un bloque (fecha+horario) a partir de sus registros y justificaciones.
export function estadoBloque(regs, just) {
  if (just) return { s: 'just', motivo: just.motivo };
  if (!regs.length) return { s: 'pend' };
  if (regs.some(r => r.completo)) return { s: regs.find(r => r.completo).estado === 'stop' ? 'stop' : 'ok', reg: regs.find(r => r.completo) };
  return { s: 'part', reg: regs[0] };
}
export const slug = s => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('fichas|' + s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
