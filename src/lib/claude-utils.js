export const REGLES_DEFAULT = `1) Cap grup sense cobrir
2) Un sol docent per a tota l'absència. Si és tot el dia i no pot ser el mateix, un docent pel matí i un per la tarda`;

export const COORD_KW  = ['coordinació','coordinacio','càrrec','carrec'];
export const TP_KW     = ['tp', 't.p.', 'treball personal', 'temps personal', 'treball pers.', 't.personal'];
export const SUPORT_KW = ['suport', 'mee', 'mesi', 'siei', 'aci', 'acis', 'sup', 'pati', 'tallers'];

export function isCoordVal(v) {
  return COORD_KW.some(k => v === k || v.startsWith(k + ' ') || v.startsWith(k + ':') || v.includes(' ' + k));
}
export function isSuportVal(v) {
  return SUPORT_KW.some(k => v === k || v.startsWith(k + ' ') || v.startsWith(k + ':') || v.includes(' ' + k));
}

export function estatHorari(val) {
  const v = (val || '').toLowerCase().trim();
  if (v === 'lliure' || v === 'libre' || v === 'absent' || v === 'fora' || v.includes('ceepsir') || v.includes('piscina'))
    return { estat: 'fora', text: v.includes('ceepsir') ? 'FORA (CEEPSIR — assistència externa)' : v.includes('piscina') ? 'FORA (Piscina — fora del centre)' : 'FORA del centre' };
  if (!v)               return { estat: 'lliure', text: 'lliure al centre' };
  if (TP_KW.includes(v)) return { estat: 'tp',    text: 'TP (pot cobrir amb deute)' };
  if (isCoordVal(v))    return { estat: 'carec',  text: `Càrrec: ${val}` };
  if (isSuportVal(v))   return { estat: 'suport', text: `Suport (flexible): ${val}` };
  return                       { estat: 'ocupat', text: `ocupat: ${val}` };
}

export function normG(s) {
  return (s || '').toLowerCase()
    .replace(/[èéê]/g,'e').replace(/[àáâ]/g,'a').replace(/[òóô]/g,'o')
    .replace(/[úùû]/g,'u').replace(/[íìï]/g,'i')
    .replace(/\s+/g,'').replace(/[·.\-/]/g,'');
}

export function getCicle(gp) {
  const n = normG(gp);
  if (/^i[345]/.test(n) || n.includes('infantil')) return 'Infantil';
  if (/^[12]/.test(n)) return 'Cicle Inicial';
  if (/^[34]/.test(n)) return 'Cicle Mitjà';
  if (/^[56]/.test(n)) return 'Cicle Superior';
  return null;
}

export function migGrupCicle(raw) {
  if (!/mig\s*grup/i.test(raw)) return null;
  const m = raw.match(/^([^\s·\/·]+)/);
  return m ? getCicle(m[1]) : null;
}

export function matchesAbsentGroup(raw, absentGrupCore) {
  if (!absentGrupCore) return false;
  const m = absentGrupCore.match(/^(\d+)([a-z])$/);
  if (!m) return normG(raw).includes(absentGrupCore);
  const [, digit, letter] = m;
  const rawNorm = (raw || '').toLowerCase()
    .replace(/[èéê]/g,'e').replace(/[àáâ]/g,'a').replace(/[òóô]/g,'o')
    .replace(/[úùû]/g,'u').replace(/[íìï]/g,'i');
  if (new RegExp('(?<![a-z])' + digit + '[a-z]?\\s*' + letter + '(?![a-z])').test(rawNorm)) return true;
  if (new RegExp(digit + '[a-z]{1,3}' + letter).test(normG(raw))) return true;
  const raconsM = (raw || '').match(/racons\s*(\d+)/i);
  if (raconsM && raconsM[1] === digit) return true;
  return false;
}
