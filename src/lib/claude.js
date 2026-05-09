import { WORKER_URL, WORKER_AUTH_TOKEN, FRANJES, FRANJES_ORIOL } from './constants';

async function callClaude(messages, maxTokens = 1000, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': WORKER_AUTH_TOKEN },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, messages }),
    });
    if (!res.ok) throw new Error('Error al Worker: ' + res.status);
    const data = await res.json();
    if (data.error) {
      const msg = data.error.message || JSON.stringify(data.error);
      const isOverloaded = msg.toLowerCase().includes('overload') || data.error.type === 'overloaded_error';
      if (isOverloaded && attempt < retries) {
        await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      throw new Error(isOverloaded ? 'La IA està sobrecarregada, torna-ho a intentar en uns minuts' : msg);
    }
    let raw = '';
    if (Array.isArray(data.content)) raw = data.content.map(b => b.text || '').join('');
    else if (typeof data.content === 'string') raw = data.content;
    else if (data.choices?.[0]?.message) raw = data.choices[0].message.content;
    else throw new Error('Format de resposta IA no reconegut');
    const clean = raw.replace(/```json|```/g, '').trim();
    // Cerca {"proposta": o {"franja": o {"nom": per saltar-se text de raonament previ
    const jsonStart = /\{(?:\s*"(?:proposta|franja|nom|docent|titol|horari)"\s*:)/.exec(clean);
    const start = jsonStart ? jsonStart.index : clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No s\'ha trobat JSON a la resposta IA');
    return JSON.parse(clean.slice(start, end + 1));
  }
}

const REGLES_DEFAULT = `1) Cap grup sense cobrir
2) Un sol docent per a tota l'absència. Si és tot el dia i no pot ser el mateix, un docent pel matí i un per la tarda`;

const COORD_KW = ['coordinació','coordinacio','càrrec','carrec'];
function isCoordVal(v) { return COORD_KW.some(k => v === k || v.startsWith(k + ' ') || v.startsWith(k + ':') || v.includes(' ' + k)); }

const TP_KW = ['tp', 't.p.', 'treball personal', 'temps personal', 'treball pers.', 't.personal'];
const SUPORT_KW = ['suport', 'mee', 'mesi', 'siei', 'aci', 'acis', 'sup', 'pati', 'tallers'];
function isSuportVal(v) { return SUPORT_KW.some(k => v === k || v.startsWith(k + ' ') || v.startsWith(k + ':') || v.includes(' ' + k)); }

function estatHorari(val) {
  const v = (val || '').toLowerCase().trim();
  if (v === 'lliure' || v === 'libre' || v === 'absent' || v === 'fora' || v.includes('ceepsir') || v.includes('piscina')) return { estat: 'fora', text: v.includes('ceepsir') ? 'FORA (CEEPSIR — assistència externa)' : v.includes('piscina') ? 'FORA (Piscina — fora del centre)' : 'FORA del centre' };
  if (!v)                   return { estat: 'lliure', text: 'lliure al centre' };
  if (TP_KW.includes(v))    return { estat: 'tp',     text: 'TP (pot cobrir amb deute)' };
  if (isCoordVal(v))        return { estat: 'carec',  text: `Càrrec: ${val}` };
  if (isSuportVal(v))       return { estat: 'suport', text: `Suport (flexible): ${val}` };
  return                           { estat: 'ocupat', text: `ocupat: ${val}` };
}

// Normalitza noms de grup per fer matching (ex: "5è A" ≈ "5eA" ≈ "5ea")
function normG(s) {
  return (s || '').toLowerCase()
    .replace(/[èéê]/g,'e').replace(/[àáâ]/g,'a').replace(/[òóô]/g,'o')
    .replace(/[úùû]/g,'u').replace(/[íìï]/g,'i')
    .replace(/\s+/g,'').replace(/[·.\-/]/g,'');
}

function getCicle(gp) {
  const n = normG(gp);
  if (/^i[345]/.test(n) || n.includes('infantil')) return 'Infantil';
  if (/^[12]/.test(n)) return 'Cicle Inicial';
  if (/^[34]/.test(n)) return 'Cicle Mitjà';
  if (/^[56]/.test(n)) return 'Cicle Superior';
  return null;
}

// Detecta si un valor d'horari és un "mig grup" (desdoblament de l'especialista)
// i extreu el grup principal per comprovar si és del mateix cicle
function migGrupCicle(raw) {
  if (!/mig\s*grup/i.test(raw)) return null;
  // "1rA · ORAL Anglès / Mig grup" → agafar el primer token com a grup
  const m = raw.match(/^([^\s·\/·]+)/);
  return m ? getCicle(m[1]) : null;
}

// Detecta si un valor d'horari fa referència al grup absent.
// Usa lookbehind per evitar que "I5B" (Infantil) coincideixi amb "5B" de 5è primària.
// Preserva espais per distingir "Suport 5B" (espai separa paraula) de "I5B" (sense espai).
function matchesAbsentGroup(raw, absentGrupCore) {
  if (!absentGrupCore) return false;
  const m = absentGrupCore.match(/^(\d+)([a-z])$/);
  if (!m) return normG(raw).includes(absentGrupCore);
  const [, digit, letter] = m;
  // Normalitza accents però MANTÉ espais — el lookbehind negatiu descarta "i5b" (lletra enganxada)
  // [a-z]? absorbeix el sufix ordinal: "5è B" → "5e b" → el patró "5e? b" coincideix
  const rawNorm = (raw || '').toLowerCase()
    .replace(/[èéê]/g,'e').replace(/[àáâ]/g,'a').replace(/[òóô]/g,'o')
    .replace(/[úùû]/g,'u').replace(/[íìï]/g,'i');
  if (new RegExp('(?<![a-z])' + digit + '[a-z]?\\s*' + letter + '(?![a-z])').test(rawNorm)) return true;
  // Notació combinada "5È A/B" → normG → "5eab" → /5[a-z]{1,3}b/
  if (new RegExp(digit + '[a-z]{1,3}' + letter).test(normG(raw))) return true;
  // "Racons 5" / "Racons5" → mig grup per curs de primària: dígit immediatament darrere de "racons"
  // Exclou "Racons I5" (Infantil) i "5è A · Racons" (curs explícit amb grup diferent)
  const raconsM = (raw || '').match(/racons\s*(\d+)/i);
  if (raconsM && raconsM[1] === digit) return true;
  return false;
}

export async function proposarCobertura(absentNom, frangesIds, docents, normes, data, isOriol = false, infoExtra = null, baixes = null) {
  const FRANJES_ACT = isOriol ? FRANJES_ORIOL : FRANJES;
  const dia = data
    ? ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][new Date(data + 'T12:00:00').getDay()]
    : null;

  if (dia === 'dissabte' || dia === 'diumenge') throw new Error('No es generen cobertures per a cap de setmana');

  const regles = (normes || '').trim() || REGLES_DEFAULT;

  // Agrupar franges per bloc d'hora (f1a+f1b → "1a hora", etc.)
  const blocsMap = {};
  for (const fid of frangesIds) {
    const f = FRANJES_ACT.find(x => x.id === fid);
    if (!f) continue;
    if (!blocsMap[f.hora]) blocsMap[f.hora] = { hora: f.hora, ids: [] };
    blocsMap[f.hora].ids.push(fid);
  }
  const blocs = Object.values(blocsMap);
  const blocsDesc = blocs.map(b => b.hora).join(' + ');
  const durada = `${frangesIds.length * 30} min`;

  // Identificar grups afectats i tutors per cada bloc
  const absentDocent = docents.find(d => d.nom === absentNom);
  const absentHorariDia = absentDocent?.horari?.[dia] || {};
  // Codi curt del grup absent (ex: "5è B" → "5b") per detectar qui ja treballa amb ell
  const absentGrupCore = (() => {
    const m = (absentDocent?.grup_principal || '').match(/(\d+)\s*[a-zA-ZèéàòíùüÈ]?\s*([a-zA-Z])\b/);
    return m ? `${m[1]}${m[2].toLowerCase()}` : '';
  })();
  const absentCicle = getCicle(absentDocent?.grup_principal);

  const infoGrupsAfectats = dia ? blocs.map(b => {
    const acts = [...new Set(b.ids.map(fid => absentHorariDia[fid]).filter(v => v))];
    if (!acts.length) return null;

    // DESDOBLAMENT / MIG GRUP RACONS: si la tutora absent tenia un desdoblament o racons compartits, l'especialista assumeix tot el grup
    const desdoblVal = acts.find(v => /desdobl|racons/i.test(v));
    if (desdoblVal) {
      const specialist = docents.find(d =>
        d.nom !== absentNom && d.horari &&
        b.ids.some(fid => matchesAbsentGroup(d.horari?.[dia]?.[fid] || '', absentGrupCore))
      );
      const who = specialist ? specialist.nom : "l'especialista del desdoblament";
      const tipusMigGrup = /racons/i.test(desdoblVal) ? 'MIG GRUP RACONS' : 'DESDOBLAMENT';
      return `• ${b.hora} (${desdoblVal}): ⚡ ${tipusMigGrup} — ${who} ja té mig grup. Quan ${absentNom} falta, ${who} assumeix TOT el grup → inclou'l a la proposta per aquesta franja, NO busquis cap altre docent`;
    }

    const tutorsAfectats = docents.filter(d => {
      if (!d.grup_principal || !d.horari) return false;
      if (d.nom === absentNom) return false;
      const gpN = normG(d.grup_principal);
      if (gpN.length < 2) return false;
      return acts.some(act => normG(act).includes(gpN));
    });
    // Detectar docents que ja treballen amb el grup absent en aquest bloc (inclou "5È A/B")
    const jaAmbGrup = absentGrupCore ? docents.filter(d => {
      if (!d.horari || d.nom === absentNom) return false;
      if (tutorsAfectats.some(t => t.nom === d.nom)) return false;
      return b.ids.some(fid => matchesAbsentGroup(d.horari?.[dia]?.[fid] || '', absentGrupCore));
    }) : [];

    const linesJaAmb = jaAmbGrup.map(t => {
      const isMesi = /mesi|mee/i.test(t.grup_principal || '');
      // Determinar exactament quines franges dins del bloc té amb el grup
      const franjesAmb = b.ids.filter(fid => matchesAbsentGroup(t.horari?.[dia]?.[fid] || '', absentGrupCore));
      const frangesLabel = franjesAmb.map(fid => FRANJES_ACT.find(x => x.id === fid)?.sub || fid).join('+');
      const vals = b.ids.map(fid => {
        const v = t.horari?.[dia]?.[fid]; if (!v) return null;
        const f = FRANJES_ACT.find(x => x.id === fid);
        return `${f?.sub || fid}: ${v}`;
      }).filter(Boolean).join(', ');
      if (isMesi) return `  → ${t.nom} (${t.grup_principal}): ⚠️ MESI al grup (${vals}) — ÚLTIMA OPCIÓ: usar SOLS si no hi ha cap suport regular del cicle disponible`;
      return `  → ${t.nom} (${t.grup_principal}): ✅ JA ÉS AMB EL GRUP a ${frangesLabel} (${vals}) — proposar ÚNICAMENT per a ${frangesLabel}; per a les franges restants del bloc, buscar altre docent`;
    }).join('\n');

    if (!tutorsAfectats.length && !jaAmbGrup.length)
      return `• ${b.hora} (${acts.join(' / ')}): cap tutor identificat — buscar al mateix cicle`;

    const lines = tutorsAfectats.map(t => {
      const estats = b.ids.map(fid => estatHorari(t.horari?.[dia]?.[fid]));
      const esFora = estats.some(e => e.estat === 'fora');
      const potCobrir = estats.every(e => ['lliure','tp','carec','suport'].includes(e.estat));
      const detail = estats.map(e => e.text).join(', ');
      if (esFora) return `  → TUTOR/A ${t.nom} (${t.grup_principal}): ❌ FORA — buscar alternativa al cicle`;
      if (potCobrir) return `  → TUTOR/A ${t.nom} (${t.grup_principal}): ✅ PRIMERA OPCIÓ — interrompre (${detail}) i quedar-se amb el seu grup`;
      return `  → TUTOR/A ${t.nom} (${t.grup_principal}): ❌ ja ensenya un altre grup (${detail}) — buscar alternativa`;
    }).join('\n');

    const allLines = [lines, linesJaAmb].filter(Boolean).join('\n');
    return `• ${b.hora} (${acts.join(' / ')}):\n${allLines}`;
  }).filter(Boolean).join('\n') : '';

  // Per cada docent, mostrar disponibilitat a TOTS els blocs d'hora (mateix cicle primer)
  const disponibilitatDocents = docents
    .filter(d => d.horari && d.nom !== absentNom)
    .sort((a, b) => {
      const sa = absentCicle && getCicle(a.grup_principal) === absentCicle;
      const sb = absentCicle && getCicle(b.grup_principal) === absentCicle;
      return sa === sb ? 0 : sa ? -1 : 1;
    })
    .map(d => {
    const isMesiDocent = /mesi|mee/i.test(d.grup_principal || '');
    // Si el docent ja treballa amb el grup absent en una franja → tractar-la com "suport"
    // MESI: rep estat 'mesiAmb' (última opció) en lloc de 'suport'
    const estatCtx = (fid) => {
      const raw = dia ? d.horari?.[dia]?.[fid] : null;
      if (!raw) return dia ? estatHorari(raw) : { estat: 'ocupat', text: '?' };
      if (matchesAbsentGroup(raw, absentGrupCore)) {
        if (isMesiDocent) return { estat: 'mesiAmb', text: `MESI ja és al grup (${raw}) — última opció` };
        return { estat: 'suport', text: `Ja és amb el grup de ${absentNom}: ${raw}` };
      }
      // MESI: fora del seu cicle → no disponible (cada MESI cobreix al seu nivell)
      if (isMesiDocent) {
        const mRaw = raw.match(/(\d+)\s*[a-zA-ZèéàòíùüÈ]?\s*([a-zA-Z])\b/);
        const rawCicle = mRaw ? getCicle(`${mRaw[1]}${mRaw[2]}`) : getCicle(raw);
        if (!rawCicle || rawCicle !== absentCicle)
          return { estat: 'ocupat', text: `MESI a cicle diferent (${raw})` };
      }
      // Mig grup del mateix cicle → pot assumir el grup complet
      const mgCicle = migGrupCicle(raw);
      if (mgCicle && absentCicle && mgCicle === absentCicle)
        return { estat: 'migGrup', text: `Mig grup (${raw}) — pot assumir grup complet` };
      return estatHorari(raw);
    };

    const totsEstats = blocs.flatMap(b => b.ids.map(fid => estatCtx(fid)));

    if (totsEstats.some(e => e.estat === 'fora')) {
      return `  · ${d.nom} (${d.grup_principal || '?'}): ❌ FORA DEL CENTRE — no proposar`;
    }

    // Mostrar per-franja dins de cada bloc (clau quan f1a i f1b del mateix bloc tenen disponibilitats diferents)
    const blocsInfo = blocs.map(b => {
      if (b.ids.length === 1) {
        const { text } = estatCtx(b.ids[0]);
        return `${b.hora}=${text}`;
      }
      const detall = b.ids.map(fid => {
        const { text } = estatCtx(fid);
        const f = FRANJES_ACT.find(x => x.id === fid);
        return `${f?.sub || fid}: ${text}`;
      }).join(' | ');
      return `${b.hora}(${detall})`;
    }).join(', ');

    const estats = totsEstats.map(e => e.estat);
    const COBRIBLE = new Set(['lliure', 'tp', 'carec', 'suport', 'migGrup', 'mesiAmb']);
    const totLliure    = estats.every(e => e === 'lliure');
    const potCobrir    = estats.every(e => COBRIBLE.has(e));
    const parcial      = !potCobrir && estats.some(e => COBRIBLE.has(e));
    const ambTP        = estats.some(e => e === 'tp');
    const ambSuport    = estats.some(e => e === 'suport');
    const ambMigGrup   = estats.some(e => e === 'migGrup');
    const ambMesiAmb   = estats.some(e => e === 'mesiAmb');

    const cicle = getCicle(d.grup_principal);
    const cicleTag = cicle
      ? (cicle === absentCicle ? ' ★MATEIX CICLE' : ` [${cicle}]`)
      : '';
    const base = `  · ${d.nom} (${d.grup_principal || '?'})${cicleTag}: cob.mes=${d.cobertures_mes || 0} |`;
    if (totLliure)                             return `${base} ✅ DISPONIBLE TOT EL BLOC (al centre, sense classe)`;
    if (potCobrir && ambMigGrup)               return `${base} ✅ POT COBRIR (Mig grup → assumeix grup complet) — ${blocsInfo}`;
    if (potCobrir && ambSuport && !ambMesiAmb) return `${base} ✅ POT COBRIR (Suport, flexible) — ${blocsInfo}`;
    if (potCobrir && ambTP && !ambMesiAmb)     return `${base} ⚠️ POT COBRIR amb deute TP (DARRER RECURS si no hi ha suport disponible) — ${blocsInfo}`;
    if (potCobrir && !ambMesiAmb)              return `${base} ⚠️ POT COBRIR (Càrrec, últim recurs) — ${blocsInfo}`;
    if (potCobrir && ambMesiAmb)               return `${base} ⚠️ MESI AMB GRUP (última opció — no interrompre si hi ha alternativa) — ${blocsInfo}`;
    if (parcial)                               return `${base} ⚡ PARCIALMENT DISPONIBLE — pot cobrir els blocs marcats ✅ — ${blocsInfo}`;
                                               return `${base} ❌ OCUPAT — ${blocsInfo}`;
  }).join('\n');

  const contextExtra = infoExtra?.context
    ? `\nACTIVITAT ESPECIAL AVUI (prioritat màxima): ${infoExtra.context}\nEls docents implicats en aquesta activitat han estat exclosos de la llista de disponibles.`
    : '';

  const contextBaixes = baixes?.length
    ? `\nBAIXES LLARGUES (docents absents tot el curs):\n${baixes.map(b => `  · ${b.absent} → Substitut permanent: ${b.substitut}${b.notes ? ` (${b.notes})` : ''}. ${b.substitut} fa l'horari complet de ${b.absent} i les seves cobertures. NO assignar ${b.absent} a cap cobertura.`).join('\n')}`
    : '';

  const contextGrups = infoGrupsAfectats
    ? `\nGRUPS AFECTATS I TUTORS a ${dia ? dia.charAt(0).toUpperCase() + dia.slice(1) : ''}:\n${infoGrupsAfectats}\n`
    : '';

  // Pre-calcula assignacions obligatòries en dues fases (sense deute TP):
  // Fase 1 — JA ÉS AMB EL GRUP (non-MESI): màxima prioritat, per franja exacta
  // Fase 2 — ★CICLE + suport/lliure: evita cridar TP del mateix cicle quan hi ha suport disponible
  const assignacioMap = {};
  const assignedFids = new Set();
  if (dia) {
    const doAddFid = (nom, fid, val) => {
      if (assignedFids.has(fid)) return;
      const f = FRANJES_ACT.find(x => x.id === fid);
      if (!assignacioMap[nom]) assignacioMap[nom] = { fids: [], vals: [] };
      assignacioMap[nom].fids.push(fid);
      assignacioMap[nom].vals.push(`${f?.sub || fid}: ${val || 'lliure'}`);
      assignedFids.add(fid);
    };
    // Fase 1: JA ÉS AMB EL GRUP (non-MESI) — selecciona el millor candidat per franja
    // Prioritat: suport directe (3) > racons/desdoblament (2) > grup combinat tipus "5A/B" (1)
    // Evita que un docent amb "5 A/B" (nom anterior alfabèticament) guanyi a Vero amb "Suport 5 B"
    if (absentGrupCore) {
      const fase1Cand = {}; // fid → [{nom, raw, priority, di}]
      for (let di = 0; di < docents.length; di++) {
        const d = docents[di];
        if (!d.horari || d.nom === absentNom) continue;
        if (/mesi|mee/i.test(d.grup_principal || '')) continue;
        for (const b of blocs) {
          for (const fid of b.ids) {
            if (!frangesIds.includes(fid)) continue;
            const raw = d.horari?.[dia]?.[fid] || '';
            if (!matchesAbsentGroup(raw, absentGrupCore)) continue;
            const priority = /suport/i.test(raw) ? 3 : /racons|desdobl/i.test(raw) ? 2 : 1;
            if (!fase1Cand[fid]) fase1Cand[fid] = [];
            fase1Cand[fid].push({ nom: d.nom, raw, priority, di });
          }
        }
      }
      const orderedF1 = blocs.flatMap(b => b.ids).filter(fid => frangesIds.includes(fid));
      for (const fid of orderedF1) {
        if (!fase1Cand[fid] || assignedFids.has(fid)) continue;
        const best = fase1Cand[fid].sort((a, b) => b.priority - a.priority || a.di - b.di)[0];
        console.log(`[Fase1] ${fid}: ${best.nom} p${best.priority} raw="${best.raw}"`);
        doAddFid(best.nom, fid, best.raw);
      }
    }
    // Fase 1.5: Estén assignacions "Racons N" a franges adjacents amb "Racons" (sense número)
    // Ex: Nil té "Racons 5" a f5a+f5b i "Racons" a f5c → assignar f5c a Nil també
    if (dia && absentGrupCore) {
      const ordAll = FRANJES_ACT.map(f => f.id);
      const f4r = ordAll.indexOf('f4');
      for (const [nom, info] of Object.entries(assignacioMap)) {
        const dObj = docents.find(x => x.nom === nom);
        if (!dObj?.horari) continue;
        for (const assignedFid of [...info.fids]) {
          const rawA = dObj.horari?.[dia]?.[assignedFid] || '';
          if (!/racons\s*\d+/i.test(rawA)) continue;
          const idxA = ordAll.indexOf(assignedFid);
          const sideA = idxA < f4r;
          for (const adjIdx of [idxA - 1, idxA + 1]) {
            if (adjIdx < 0 || adjIdx >= ordAll.length) continue;
            const adjFid = ordAll[adjIdx];
            if (!frangesIds.includes(adjFid) || assignedFids.has(adjFid)) continue;
            if ((adjIdx < f4r) !== sideA) continue;
            const rawAdj = dObj.horari?.[dia]?.[adjFid] || '';
            if (/^racons\s*$/i.test(rawAdj.trim())) {
              console.log(`[Fase1.5] ${adjFid}: ${nom} (Racons adjacent a ${assignedFid})`);
              doAddFid(nom, adjFid, rawAdj);
            }
          }
        }
      }
    }
    // Fase 2: ★CICLE + suport/lliure sense TP
    // Prioritat: suport al cicle (2) > lliure/migGrup del cicle (1)
    // Suport guanya a lliure perquè el docent ja és físicament a l'aula del cicle
    if (absentCicle) {
      const orderedF2 = blocs.flatMap(b => b.ids).filter(fid => frangesIds.includes(fid));
      for (const fid of orderedF2) {
        if (assignedFids.has(fid)) continue;
        const cands = [];
        for (let di = 0; di < docents.length; di++) {
          const d = docents[di];
          if (!d.horari || d.nom === absentNom) continue;
          if (/mesi|mee/i.test(d.grup_principal || '')) continue;
          const raw = d.horari?.[dia]?.[fid] || '';
          if (matchesAbsentGroup(raw, absentGrupCore)) continue; // ja Fase 1
          const e = estatHorari(raw);
          let priority = 0;
          if (e.estat === 'suport') {
            const m = raw.match(/(\d+)\s*[a-zA-ZèéàòíùüÈ]?\s*([a-zA-Z])\b/);
            const cicleEntry = m ? getCicle(`${m[1]}${m[2]}`) : getCicle(d.grup_principal);
            if (cicleEntry === absentCicle) priority = 2;
          } else if (e.estat === 'lliure' && getCicle(d.grup_principal) === absentCicle) {
            priority = 1;
          } else {
            const mgC = migGrupCicle(raw);
            if (mgC && mgC === absentCicle) priority = 1;
          }
          if (priority > 0) cands.push({ nom: d.nom, raw, priority, di });
        }
        if (cands.length > 0) {
          const best = cands.sort((a, b) => b.priority - a.priority || a.di - b.di)[0];
          console.log(`[Fase2] ${fid}: ${best.nom} p${best.priority} raw="${best.raw}"`);
          doAddFid(best.nom, fid, best.raw);
        }
      }
    }
    console.log('[Assignació]', JSON.stringify(assignacioMap), '| Restants:', frangesIds.filter(fid => !assignedFids.has(fid)));
  }
  const assignacioLines = Object.entries(assignacioMap).map(([nom, info]) => {
    const horesStr = info.fids.map(fid => FRANJES_ACT.find(x => x.id === fid)?.sub || fid).join(' / ');
    return `  - ${nom} → franges_ids: ${JSON.stringify(info.fids)}, hores: "${horesStr}" (${info.vals.join(', ')})`;
  });
  const frangesRestants = frangesIds.filter(fid => !assignedFids.has(fid));

  // Build pre-assigned entries split by morning/afternoon session (at the f4 Dinar lliure gap)
  // Les fids s'ordenen cronològicament dins cada sessió (Fase 1 i Fase 2 poden afegir-les en ordre diferent)
  const preAssigEntries = [];
  if (assignacioLines.length > 0) {
    const orderedFids = FRANJES_ACT.map(f => f.id);
    const f4idx = orderedFids.indexOf('f4');
    for (const [nom, info] of Object.entries(assignacioMap)) {
      const pairs = info.fids.map((fid, i) => ({ fid, val: info.vals[i] }));
      const morning   = pairs.filter(p => orderedFids.indexOf(p.fid) < f4idx).sort((a, b) => orderedFids.indexOf(a.fid) - orderedFids.indexOf(b.fid));
      const afternoon = pairs.filter(p => orderedFids.indexOf(p.fid) > f4idx).sort((a, b) => orderedFids.indexOf(a.fid) - orderedFids.indexOf(b.fid));
      for (const session of [morning, afternoon].filter(s => s.length > 0)) {
        const sessionFids = session.map(p => p.fid);
        const firstF = FRANJES_ACT.find(f => f.id === sessionFids[0]);
        const lastF  = FRANJES_ACT.find(f => f.id === sessionFids[sessionFids.length - 1]);
        const hStart = (firstF?.sub || '').split('–')[0].trim();
        const hEnd   = ((lastF?.sub  || '').split('–')[1] || '').trim();
        preAssigEntries.push({
          docent:     nom,
          franges_ids: sessionFids,
          hores:      hStart && hEnd ? `${hStart}–${hEnd}` : sessionFids.map(fid => FRANJES_ACT.find(f => f.id === fid)?.sub || fid).join(', '),
          grup_origen: absentDocent?.grup_principal || '',
          tp_afectat: false,
          motiu:      session.map(p => p.val).join(' / '),
        });
      }
    }
  }

  // Construir el raonament que explica PER QUÈ cada assignació obligatòria és correcta
  const assignacioRaonament = Object.entries(assignacioMap).map(([nom, info]) => {
    const lines = info.fids.map(fid => {
      const raw = dia ? absentDocent?.horari?.[dia]?.[fid] || '' : '';
      const f = FRANJES_ACT.find(x => x.id === fid);
      const label = f?.sub || fid;
      const isDirectMatch = matchesAbsentGroup(raw, absentGrupCore);
      // MIG GRUP (Racons/Desdoblament): el docent ja té la meitat del grup absent
      if (/racons/i.test(raw) && isDirectMatch)
        return `    ${label}: ${nom} té "${raw}" → Racons ${absentGrupCore ? absentGrupCore.replace(/[a-z]$/,'') : ''} = MIG GRUP del curs de ${absentNom} → quan ${absentNom} falta, ${nom} assumeix el grup complet (PATRÓ 2)`;
      if (/desdobl/i.test(raw) && isDirectMatch)
        return `    ${label}: ${nom} té "${raw}" → DESDOBLAMENT del grup de ${absentNom} → quan ${absentNom} falta, ${nom} assumeix el grup complet (PATRÓ 2)`;
      // Suport directe al grup absent (Fase 1)
      if (/suport/i.test(raw) && isDirectMatch)
        return `    ${label}: ${nom} té "${raw}" → suport directe al grup de ${absentNom} → ja és amb ells, millor opció (PATRÓ 1)`;
      // Suport del mateix cicle però altre grup (Fase 2)
      if (/suport/i.test(raw)) {
        const m = raw.match(/(\d+)\s*[a-zA-ZèéàòíùüÈ]?\s*([a-zA-Z])\b/);
        const cicleEntry = m ? getCicle(`${m[1]}${m[2]}`) : null;
        return `    ${label}: ${nom} té "${raw}" → suport al ${cicleEntry || 'mateix cicle'} = ★CICLE Superior, disponible sense generar TP (PATRÓ 5a)`;
      }
      // Docent lliure del mateix cicle
      if (!raw) {
        const cicle = getCicle(docents.find(d => d.nom === nom)?.grup_principal) || '★CICLE';
        return `    ${label}: ${nom} lliure al centre → ${cicle} disponible sense TP (PATRÓ 5a)`;
      }
      // Mig grup d'un altre entrada
      const cicle = getCicle(docents.find(d => d.nom === nom)?.grup_principal) || '★CICLE';
      return `    ${label}: ${nom} té "${raw}" → ${cicle} disponible`;
    }).join('\n');
    const horesStr = info.fids.map(fid => FRANJES_ACT.find(x => x.id === fid)?.sub || fid).join(' / ');
    return `  → ${nom} (${horesStr}):\n${lines}`;
  }).join('\n');

  const contextAssignacio = assignacioLines.length
    ? `\nASSIGNACIONS OBLIGATÒRIES — anàlisi automàtica de qui ja treballa amb el grup de ${absentNom} avui:
RAONAMENT (interioritza'l per aplicar-lo a altres casos):
${assignacioRaonament}
RESULTAT: ${assignacioLines.join('\n')}
Franges RESTANTS que has de cobrir tu: ${JSON.stringify(frangesRestants)}\n`
    : '';

  // Resum per franja: per a cada franja de l'absència, llista qui pot cobrir per ordre de prioritat
  // Permet a la IA veure directament "lliure: Mª Jesús | TP: Chema" sense inferir-ho dels blocs
  const resumPerFranja = dia ? frangesIds.map(fid => {
    const f = FRANJES_ACT.find(x => x.id === fid);
    const gr = { jaAmb: [], suport: [], lliure: [], tp: [], carec: [] };
    for (const d of docents) {
      if (!d.horari || d.nom === absentNom) continue;
      const raw = d.horari?.[dia]?.[fid] || '';
      const isMesi = /mesi|mee/i.test(d.grup_principal || '');
      const star = getCicle(d.grup_principal) === absentCicle ? '★' : '';
      if (matchesAbsentGroup(raw, absentGrupCore) && !isMesi) {
        gr.jaAmb.push(d.nom + star);
      } else {
        // MESI fora del seu cicle → excloure completament
        if (isMesi && !matchesAbsentGroup(raw, absentGrupCore)) {
          const mRaw = raw.match(/(\d+)\s*[a-zA-ZèéàòíùüÈ]?\s*([a-zA-Z])\b/);
          const rawCicle = mRaw ? getCicle(`${mRaw[1]}${mRaw[2]}`) : getCicle(d.grup_principal);
          if (!rawCicle || rawCicle !== absentCicle) continue;
        }
        const e = estatHorari(raw);
        if (e.estat === 'fora') continue;
        if      (e.estat === 'lliure') gr.lliure.push(d.nom + star);
        else if (e.estat === 'suport') gr.suport.push(`${d.nom}${star} (${raw})`);
        else if (e.estat === 'tp')     gr.tp.push(d.nom + star);
        else if (e.estat === 'carec')  gr.carec.push(d.nom + star);
      }
    }
    const parts = [];
    if (gr.jaAmb.length)  parts.push(`✅JA AMB GRUP: ${gr.jaAmb.join(', ')}`);
    if (gr.suport.length) parts.push(`✅suport: ${gr.suport.join(', ')}`);
    if (gr.lliure.length) parts.push(`✅lliure: ${gr.lliure.join(', ')}`);
    if (gr.tp.length)     parts.push(`⚠️TP(deute): ${gr.tp.join(', ')}`);
    if (gr.carec.length)  parts.push(`⚠️càrrec: ${gr.carec.join(', ')}`);
    return `  ${f?.sub || fid}: ${parts.join(' | ') || '❌ ningú disponible'}`;
  }).join('\n') : '';
  const contextResumFranja = resumPerFranja
    ? `\nDISPONIBILITAT PER FRANJA — tria el PRIMER disponible de cada franja (✅ abans de ⚠️, SEMPRE):\n${resumPerFranja}\n`
    : '';

  const diaLabel = dia ? dia.charAt(0).toUpperCase() + dia.slice(1) : 'dia no especificat';

  const prompt = `Ets l'assistent de gestió d'un centre educatiu de primària. La teva feina és proposar cobertures raonant pas a pas, com ho faria una cap d'estudis experta.

═══ CONTEXT ═══
ABSENT: ${absentNom}${absentDocent?.grup_principal ? ` — tutor/a de ${absentDocent.grup_principal}` : ''}${absentCicle ? ` (${absentCicle})` : ''}
DIA: ${diaLabel}${data ? ` (${data})` : ''}
FRANGES RESTANTS A COBRIR: ${JSON.stringify(frangesRestants)}
${contextExtra}${contextBaixes}
NORMES DEL CENTRE:
${regles}
═══ PATRONS DE RAONAMENT (interioritza'ls) ═══

PATRÓ 1 — Suport directe al grup:
Si un docent té "Suport [grup]" on [grup] és el grup absent → ja és amb ells → assignació òptima (no genera TP, el coneix).
Ex: Vero té "Suport 5 B" i la tutora de 5è B falta → Vero és l'opció obligatòria per aquelles franges.

PATRÓ 2 — Mig grup (Racons / Desdoblament):
Si un docent té "Racons N" on N és el CURS del grup absent (no l'etapa) → fa la meitat del grup → quan la tutora falta, assumeix el grup COMPLET. NO genera TP.
Atenció: "Racons 5" = Racons de 5è de primària. "Racons I5" = Racons d'Infantil 5 anys. SÓN GRUPS DIFERENTES.
Ex: Nil té "Racons 5" i la tutora de 5è B falta → Nil assumeix tot 5è B en aquelles franges.

PATRÓ 3 — MESI (especialista d'inclusió):
Cada MESI cobreix exclusivament al seu nivell/cicle. Un MESI de Petits/Inicial NO pot cobrir Cicle Superior i viceversa.

PATRÓ 4 — Sessions matí/tarda:
Si un docent cobreix franges de matí (f1a–f3b) I de tarda (f5a–f5c) → crear DOS entrades separades, no una de sola. El dinar (f4) separa les sessions.

PATRÓ 5 — Jerarquia de prioritats (per les franges sense assignació directa):
  a) ★CICLE + lliure/suport → millor opció, no genera TP
  b) Tutor/a del grup afectat (★CICLE) → interromp el seu TP/coordinació
  c) ★CICLE + TP → genera deute, però preferible a cicle diferent
  d) Cicle diferent → ÚLTIM RECURS. Prohibit si existeix qualsevol opció ★CICLE.
  e) Ningú → "GRUP DESCOBERT"
${contextGrups}${contextAssignacio}
═══ DISPONIBILITAT a ${diaLabel} ═══
(★ = mateix cicle que ${absentNom} — prioritzar sempre)
${disponibilitatDocents}
${contextResumFranja}
═══ PROCEDIMENT ═══

Segueix ESTRICTAMENT aquest ordre:

1. ASSIGNACIONS JA RESOLTES: Si hi ha secció "ASSIGNACIONS OBLIGATÒRIES", aquelles franges ja estan cobertes pel sistema (el raonament és al "RAONAMENT" de cada una). Inclou-les a la proposta sense modificar-les.

2. FRANGES RESTANTS ${JSON.stringify(frangesRestants)}: Per cada franja, aplica la jerarquia (PATRÓ 5). Consulta "DISPONIBILITAT PER FRANJA" per veure qui hi ha disponible.

3. VALIDACIÓ: Comprova que la suma de tots els franges_ids = ${JSON.stringify(frangesRestants)} (cada franja exactament una vegada).

Escriu 2-3 línies de RAONAMENT explicant per què has triat cada docent per a les franges restants, i llavors el JSON:

{"proposta":[{"docent":"Nom","franges_ids":["f1a"],"hores":"9:00–9:30","grup_origen":"GX","tp_afectat":false,"motiu":"raó concreta"},...],"resum":"frase curta"}`;

  // Ordena la proposta per hora d'inici (primera franja de cada entrada)
  const _ordFids = FRANJES_ACT.map(f => f.id);
  const sortProposta = arr => [...arr].sort((a, b) => {
    const aMin = Math.min(...(a.franges_ids || []).map(fid => _ordFids.indexOf(fid)).filter(i => i >= 0), 999);
    const bMin = Math.min(...(b.franges_ids || []).map(fid => _ordFids.indexOf(fid)).filter(i => i >= 0), 999);
    return aMin - bMin;
  });

  // Short-circuit: if Claude has nothing left to cover, return preAssigEntries directly
  if (frangesRestants.length === 0) {
    const sorted = sortProposta(preAssigEntries);
    return { proposta: sorted, resum: sorted.map(e => `${e.docent}: ${e.hores}`).join(' | ') };
  }

  const result = await callClaude([{ role: 'user', content: prompt }], 1600);

  // Post-process: elimina entrades de Claude que solapen fids ja assignats, ordena cronològicament
  const filtered = (result.proposta || []).map(entry => {
    const fids = (entry.franges_ids || []).filter(fid => !assignedFids.has(fid));
    return fids.length ? { ...entry, franges_ids: fids } : null;
  }).filter(Boolean);
  result.proposta = sortProposta([...preAssigEntries, ...filtered]);

  return result;
}

export async function proposarCoberturaCella(grup, hora, fid, temps, docents, normes) {
  const regles = (normes || '').trim() || REGLES_DEFAULT;
  const dia = ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][new Date().getDay()];
  const dl = docents.map(d => {
    const { text } = estatHorari(d.horari?.[dia]?.[fid]);
    return `${d.nom} (${d.grup_principal || '?'}): ${text}, cob:${d.cobertures_mes || 0}`;
  }).join(' | ');
  const diaLabel = dia.charAt(0).toUpperCase() + dia.slice(1);
  const prompt = `Proposa UN docent per cobrir el grup ${grup} a ${hora} (${temps}). Dia: ${diaLabel}. Tria preferentment els marcats com "lliure" a l'horari de ${diaLabel}. Evita els marcats com "ocupat". Normes: ${regles}. Docents (horari ${diaLabel}): ${dl}. JSON: {"proposta":[{"franja":"${hora}","docent":"Nom","grup_origen":"${grup}","tp_afectat":false,"motiu":"raó"}],"resum":"frase"}`;
  return callClaude([{ role: 'user', content: prompt }], 500);
}

export async function analitzarInfoExtra(notes, base64Pdf) {
  const content = [];
  if (base64Pdf) {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf } });
  }
  const notesLine = notes?.trim()
    ? `Informació addicional escrita per la cap d'estudis: ${notes.trim()}\n\n`
    : base64Pdf
      ? `Llegeix el document PDF adjunt i extreu tota la informació sobre l'activitat o esdeveniment.\n\n`
      : '';
  const avui = new Date().toISOString().split('T')[0];
  content.push({
    type: 'text',
    text: `Ets l'assistent d'un centre educatiu de primària. Analitza la informació sobre l'activitat o esdeveniment especial.
${notesLine}La teva tasca:
1. Identificar quins docents NO poden cobrir absències (sortida, colònies, reunió externa, jornada, etc.) i en quins horaris aproximats (p.ex. "9:00-12:30" o "tot el dia").
2. Detectar les dates de l'activitat: data_inici i data_fi en format YYYY-MM-DD. Si és d'un sol dia usa la data d'avui (${avui}) per ambdues. Si dura diversos dies, determina les dates exactes del document.
Extreu els noms complets tal com apareixen. Si no hi ha noms concrets, retorna llista buida.
Respon ÚNICAMENT en JSON sense cap altre text:
{"titol":"2-3 paraules màx (ex: 'Sortida 1r-2n', 'Seminari CRP', 'Reunió externa')","resum":"descripció breu (1-2 frases)","docentsBlocats":[{"nom":"Nom Cognom","hores":"9:00-12:30"}],"context":"instrucció curta per a la IA de cobertures","data_inici":"${avui}","data_fi":"${avui}"}`
  });
  return callClaude([{ role: 'user', content }], 1000);
}

export async function extractHorariFromPDF(base64, franjes, mimeType = 'application/pdf') {
  const franjesDesc = franjes
    .map(f => `${f.id}=${f.sub}${f.lliure ? '(Lliure)' : ''}`)
    .join(', ');
  const diaTemplate = JSON.stringify(
    franjes.reduce((acc, f) => ({ ...acc, [f.id]: f.lliure ? 'Lliure' : '' }), {})
  );
  const tpExId = franjes.filter(f => !f.lliure && !f.patio).slice(-1)[0]?.id || franjes[0]?.id;

  const prompt = `Extreu l'horari del docent d'aquest arxiu.
Franges: ${franjesDesc}

VALORS PERMESOS — usa'ls exactament:
• "" (buit) → docent AL CENTRE sense classe assignada: DISPONIBLE per cobrir absències
• "Lliure" → docent ABSENT/fora del centre (dia lliure, festiu). ÚNICAMENT si NO ve al centre.
• "TP" → Treball Personal (al centre)
• "Pati" → Vigilància de pati
• "GX · Matèria" → Classe amb un grup (ex: "G3 · Matemàtiques", "1r A · Lectura")
• "Tutoria GX" → Tutoria (ex: "Tutoria G4")
• "Suport X" → Suport dins l'aula o a un alumne (ex: "Suport G2", "Suport SIEI")
• "MEE" o "MESI" → Suport de mestre d'educació especial
• "coordinació" → Coordinació de cicle o equip
• "càrrec X" → Càrrec directiu (ex: "càrrec direcció")
• "Racons X" → Sessió de racons (ex: "Racons 3")
• "CEEPSIR" → docent fora del centre fent assistència a altres escoles (no disponible per cobrir)
• "Piscina" → docent/grup fora del centre (activitat aquàtica externa, no disponible per cobrir)

REGLA CRÍTICA: Si el docent no té res assignat en una franja però SÍ és al centre → usa "" (buit), MAI "Lliure".
"Lliure" és EXCLUSIU per quan el docent no ve al centre aquell dia.

JSON: {"nom":"Nom","rol":"tutor","grup_principal":"G1","horari":{"dilluns":${diaTemplate},"dimarts":${diaTemplate},"dimecres":${diaTemplate},"dijous":${diaTemplate},"divendres":${diaTemplate}},"tp_franges":["divendres-${tpExId}"]}`;

  if (mimeType === 'text/plain') {
    return callClaude([{
      role: 'user',
      content: [{ type: 'text', text: `${prompt}\n\nCONTINGUT DE L'ARXIU WORD:\n${base64}` }],
    }], 2000);
  }

  const isImage = mimeType.startsWith('image/');
  const fileBlock = isImage
    ? { type: 'image',    source: { type: 'base64', media_type: mimeType,           data: base64 } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf',  data: base64 } };

  return callClaude([{
    role: 'user',
    content: [fileBlock, { type: 'text', text: prompt }],
  }], 2000);
}
