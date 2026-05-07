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
    const start = clean.indexOf('{');
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
  if (v === 'lliure' || v === 'libre' || v === 'absent' || v === 'fora') return { estat: 'fora',   text: 'FORA del centre' };
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
  return new RegExp(digit + '[a-z]{1,3}' + letter).test(normG(raw));
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

    // DESDOBLAMENT: si la tutora absent tenia un desdoblament, l'especialista assumeix tot el grup
    const desdoblVal = acts.find(v => /desdobl/i.test(v));
    if (desdoblVal) {
      const specialist = docents.find(d =>
        d.nom !== absentNom && d.horari &&
        b.ids.some(fid => matchesAbsentGroup(d.horari?.[dia]?.[fid] || '', absentGrupCore))
      );
      const who = specialist ? specialist.nom : "l'especialista del desdoblament";
      return `• ${b.hora} (${desdoblVal}): ⚡ DESDOBLAMENT — ${who} ja té mig grup. Quan ${absentNom} falta, ${who} assumeix TOT el grup → inclou'l a la proposta per aquesta franja, NO busquis cap altre docent`;
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
    // Fase 1
    if (absentGrupCore) {
      for (const b of blocs) {
        for (const d of docents) {
          if (!d.horari || d.nom === absentNom) continue;
          if (/mesi|mee/i.test(d.grup_principal || '')) continue;
          for (const fid of b.ids) {
            if (!frangesIds.includes(fid)) continue;
            const raw = d.horari?.[dia]?.[fid] || '';
            if (matchesAbsentGroup(raw, absentGrupCore)) doAddFid(d.nom, fid, raw);
          }
        }
      }
    }
    // Fase 2: suport del MATEIX CICLE — cicle detectat des de l'entrada d'horari, no del grup_principal
    // Permet trobar Vero ("SUP 5A") fins i tot si el seu grup_principal és buit o "Equip Directiu"
    if (absentCicle) {
      for (const b of blocs) {
        for (const fid of b.ids) {
          if (!frangesIds.includes(fid) || assignedFids.has(fid)) continue;
          for (const d of docents) {
            if (!d.horari || d.nom === absentNom) continue;
            if (/mesi|mee/i.test(d.grup_principal || '')) continue;
            if (assignedFids.has(fid)) break;
            const raw = d.horari?.[dia]?.[fid] || '';
            if (matchesAbsentGroup(raw, absentGrupCore)) continue; // ja gestionat a Fase 1
            const e = estatHorari(raw);
            if (e.estat === 'suport') {
              // Extreu grup de l'entrada: "SUP 5A" → "5A" → Cicle Superior
              const m = raw.match(/(\d+)\s*[a-zA-ZèéàòíùüÈ]?\s*([a-zA-Z])\b/);
              const cicleEntry = m ? getCicle(`${m[1]}${m[2]}`) : getCicle(d.grup_principal);
              if (cicleEntry === absentCicle) doAddFid(d.nom, fid, raw);
            } else if (e.estat === 'lliure' && getCicle(d.grup_principal) === absentCicle) {
              doAddFid(d.nom, fid, raw);
            } else {
              const mgC = migGrupCicle(raw);
              if (mgC && mgC === absentCicle) doAddFid(d.nom, fid, raw);
            }
          }
        }
      }
    }
  }
  const assignacioLines = Object.entries(assignacioMap).map(([nom, info]) => {
    const horesStr = info.fids.map(fid => FRANJES_ACT.find(x => x.id === fid)?.sub || fid).join(' / ');
    return `  - ${nom} → franges_ids: ${JSON.stringify(info.fids)}, hores: "${horesStr}" (${info.vals.join(', ')})`;
  });
  const frangesRestants = frangesIds.filter(fid => !assignedFids.has(fid));
  const contextAssignacio = assignacioLines.length
    ? `\nASSIGNACIÓ OBLIGATÒRIA (sense deute TP — copia-les DIRECTAMENT a la proposta, no les debatis):\n${assignacioLines.join('\n')}\nFranges RESTANTS (usa TP ★CICLE si cal, altre cicle com a últim recurs): ${JSON.stringify(frangesRestants)}\n`
    : '';

  const diaLabel = dia ? dia.charAt(0).toUpperCase() + dia.slice(1) : 'dia no especificat';

  const prompt = `Ets l'assistent de gestió d'un centre educatiu de primària.
DOCENT ABSENT: ${absentNom}
DIA DE L'ABSÈNCIA: ${diaLabel}${data ? ` (${data})` : ''}
DURADA: ${durada} — Blocs horaris: ${blocsDesc}
NORMES DEL CENTRE:
${regles}${contextExtra}${contextBaixes}${contextGrups}${contextAssignacio}
JERARQUIA DE PRIORITATS (ordre ABSOLUT, no negociable):
0. ✅ JA ÉS AMB EL GRUP (indicat a GRUPS AFECTATS per franja concreta): MÀXIMA PRIORITAT. Usa'l OBLIGATÒRIAMENT per a aquelles franges exactes. Ni el cicle ni el nombre de cobertures canvien aquesta regla.
1. Docent que fa SUPORT al MATEIX CICLE (★MATEIX CICLE, amb 'suport' o 'lliure' en aquelles franges, fins i tot si és ⚡): millor que TP perquè no genera deute. Obligatori abans de qualsevol TP.
2. TUTOR/A DEL GRUP AFECTAT ("PRIMERA OPCIÓ"): interrompre TP/coordinació i quedar-se amb el seu grup.
3. Docent ★MATEIX CICLE amb TP (deute). Obligatori ABANS de qualsevol altre cicle.
4. Docent d'un cicle diferent — ÚLTIM RECURS. PROHIBIT si existeix qualsevol opció ★MATEIX CICLE.
5. Si ningú disponible → "GRUP DESCOBERT" al resum.

REGLES ADDICIONALS:
- ❌ "FORA DEL CENTRE" = MAI proposar.
- ❌ "OCUPAT" = ensenya un altre grup. No proposar.
- ⚡ PARCIALMENT DISPONIBLE: tractar-lo com ✅ per als blocs/franges on el seu detall mostra 'suport' o 'lliure'. Per als blocs 'ocupat' → buscar altre docent. NO descartar per no ser ✅ global.
- ❌ NO proposis mai a ${absentNom}.
- COBERTURA COMPLETA OBLIGATÒRIA: La proposta ha de cobrir TOTES les franges de l'absència sense excepció. Cada franja_id ha d'aparèixer en EXACTAMENT UNA entrada. La suma = ${JSON.stringify(frangesIds)}. Si after 2h (4 franges) un docent no pot continuar, CONTINUA amb el següent docent fins cobrir-ho tot. Una proposta incompleta és INVÀLIDA.
- JA ÉS AMB EL GRUP per franja concreta: si el docent és amb el grup a 9:00–9:30 però no a 9:30–10:00, proposa'l SOLS per a 9:00–9:30 i busca un altre per a 9:30–10:00. NO estenguis automàticament.
- MESI AMB GRUP (⚠️): usar ÚNICAMENTE si no hi ha cap suport regular del MATEIX CICLE disponible. Si hi ha ★MATEIX CICLE amb suport disponible, usar-lo i NO interrompre el MESI.
- MIG GRUP (✅): assumeix grup complet. Prioritzar per sobre de TP.
- tp_afectat:true si el docent tenia TP en aquelles franges.
- Aplica les NORMES DEL CENTRE per a restriccions addicionals.

DISPONIBILITAT DELS DOCENTS a ${diaLabel}:
${disponibilitatDocents}

IMPORTANT: la proposta HA DE tenir UNA ENTRADA PER DOCENT. Si diversos docents cobreixen franges diferents, cada un té la seva entrada amb el seu subconjunt de franges_ids. La suma de TOTS els franges_ids de totes les entrades = ${JSON.stringify(frangesIds)}.
Respon NOMÉS JSON: {"proposta":[{"docent":"Nom1","franges_ids":["f1a"],"hores":"9:00–9:30","grup_origen":"GX","tp_afectat":false,"motiu":"raó"},{"docent":"Nom2","franges_ids":["f1b","f2a"],"hores":"9:30–10:30","grup_origen":"GX","tp_afectat":false,"motiu":"raó"}],"resum":"frase curta"}`;

  return callClaude([{ role: 'user', content: prompt }], 1200);
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

REGLA CRÍTICA: Si el docent no té res assignat en una franja però SÍ és al centre → usa "" (buit), MAI "Lliure".
"Lliure" és EXCLUSIU per quan el docent no ve al centre aquell dia.

JSON: {"nom":"Nom","rol":"tutor","grup_principal":"G1","horari":{"dilluns":${diaTemplate},"dimarts":${diaTemplate},"dimecres":${diaTemplate},"dijous":${diaTemplate},"divendres":${diaTemplate}},"tp_franges":["divendres-${tpExId}"]}`;

  const isImage = mimeType.startsWith('image/');
  const fileBlock = isImage
    ? { type: 'image',    source: { type: 'base64', media_type: mimeType,           data: base64 } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf',  data: base64 } };

  return callClaude([{
    role: 'user',
    content: [fileBlock, { type: 'text', text: prompt }],
  }], 2000);
}
