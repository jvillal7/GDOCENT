import { FRANJES_ORIOL } from './constants';
import { callClaude } from './claude-api';
import { estatHorari } from './claude-utils';

export async function proposarCoberturaOriol(absentNom, frangesIds, docents, normes, data, infoExtra, baixes) {
  const dia = data
    ? ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][new Date(data + 'T12:00:00').getDay()]
    : null;

  if (dia === 'dissabte' || dia === 'diumenge') throw new Error('No es generen cobertures per a cap de setmana');

  const regles = (normes || '').trim() || 'Prioritzar MEE disponibles. PAE mai sol — sempre paired amb un MEE.';
  const rolBadge = nom => (/\(([^)]+)\)/.exec(nom || '') || [])[1]?.toUpperCase() || '';

  const absentDocent = docents.find(d => d.nom === absentNom);
  const absentGrup   = absentDocent?.grup_principal || '';
  const absentGrupN  = (absentGrup.match(/\d+/) || [])[0] || '';

  function jaAmbGrup(d, fid) {
    if (!d.horari || !dia || !absentGrupN) return false;
    const raw = (d.horari?.[dia]?.[fid] || '').toLowerCase().replace(/\s+/g, '');
    return raw.includes(`g${absentGrupN}`) || new RegExp(`g\\s*${absentGrupN}\\b`).test(raw);
  }

  const blocsMap = {};
  for (const fid of frangesIds) {
    const f = FRANJES_ORIOL.find(x => x.id === fid);
    if (!f) continue;
    if (!blocsMap[f.hora]) blocsMap[f.hora] = { hora: f.hora, ids: [] };
    blocsMap[f.hora].ids.push(fid);
  }
  const blocs = Object.values(blocsMap);

  const assignacioMap = {};
  const assignedFids = new Set();
  if (dia && absentGrupN) {
    for (const fid of frangesIds) {
      if (assignedFids.has(fid)) continue;
      for (const d of docents) {
        if (!d.horari || d.nom === absentNom || rolBadge(d.nom) === 'PAE') continue;
        if (jaAmbGrup(d, fid)) {
          if (!assignacioMap[d.nom]) assignacioMap[d.nom] = { fids: [], vals: [] };
          assignacioMap[d.nom].fids.push(fid);
          assignacioMap[d.nom].vals.push(d.horari?.[dia]?.[fid] || '');
          assignedFids.add(fid);
          break;
        }
      }
    }
  }

  const frangesRestants = frangesIds.filter(fid => !assignedFids.has(fid));
  const _ordFids = FRANJES_ORIOL.map(f => f.id);
  const sortProposta = arr => [...arr].sort((a, b) => {
    const ai = Math.min(...(a.franges_ids || []).map(f => _ordFids.indexOf(f)).filter(i => i >= 0), 999);
    const bi = Math.min(...(b.franges_ids || []).map(f => _ordFids.indexOf(f)).filter(i => i >= 0), 999);
    return ai - bi;
  });

  const preAssigEntries = [];
  for (const [nom, info] of Object.entries(assignacioMap)) {
    const sorted = [...info.fids].sort((a, b) => _ordFids.indexOf(a) - _ordFids.indexOf(b));
    const firstF = FRANJES_ORIOL.find(f => f.id === sorted[0]);
    const lastF  = FRANJES_ORIOL.find(f => f.id === sorted[sorted.length - 1]);
    const hStart = (firstF?.sub || '').split('–')[0].trim();
    const hEnd   = ((lastF?.sub || '').split('–')[1] || '').trim();
    preAssigEntries.push({
      docent: nom,
      franges_ids: sorted,
      hores: hStart && hEnd ? `${hStart}–${hEnd}` : sorted.join(', '),
      grup_origen: absentGrup,
      tp_afectat: false,
      motiu: info.vals.join(' / '),
    });
  }

  if (frangesRestants.length === 0) {
    const s = sortProposta(preAssigEntries);
    return { proposta: s, resum: s.map(e => `${e.docent}: ${e.hores}`).join(' | ') };
  }

  const disponibilitatDocents = docents
    .filter(d => d.horari && d.nom !== absentNom)
    .map(d => {
      const rol = rolBadge(d.nom) || d.rol?.toUpperCase() || '?';
      const esPAE = rol === 'PAE';
      const totsEstats = frangesRestants.map(fid => estatHorari(d.horari?.[dia]?.[fid]));
      if (totsEstats.some(e => e.estat === 'fora')) return `  · ${d.nom} [${rol}]: ❌ FORA DEL CENTRE`;
      const blocsInfo = blocs.map(b => {
        const fR = b.ids.filter(f => frangesRestants.includes(f));
        if (!fR.length) return null;
        if (fR.length === 1) return `${b.hora}=${estatHorari(d.horari?.[dia]?.[fR[0]]).text}`;
        return `${b.hora}(${fR.map(fid => {
          const f = FRANJES_ORIOL.find(x => x.id === fid);
          return `${f?.sub || fid}: ${estatHorari(d.horari?.[dia]?.[fid]).text}`;
        }).join(' | ')})`;
      }).filter(Boolean).join(', ');
      const estats = totsEstats.map(e => e.estat);
      const COBR = new Set(['lliure', 'tp', 'carec', 'suport']);
      const totLliure = estats.every(e => e === 'lliure');
      const potCobrir = estats.every(e => COBR.has(e));
      const ambTP = estats.some(e => e === 'tp');
      const parcial = !potCobrir && estats.some(e => COBR.has(e));
      const base = `  · ${d.nom} [${rol}]${esPAE ? ' ⚠️(mai sol)' : ''}: cob.mes=${d.cobertures_mes || 0} |`;
      if (esPAE)              return `${base} ℹ️ PAE — no proposar com a cobertura independent`;
      if (totLliure)          return `${base} ✅ DISPONIBLE (lliure)`;
      if (potCobrir && !ambTP) return `${base} ✅ POT COBRIR — ${blocsInfo}`;
      if (potCobrir && ambTP)  return `${base} ⚠️ TP (genera deute) — ${blocsInfo}`;
      if (parcial)             return `${base} ⚡ PARCIALMENT — ${blocsInfo}`;
      return `${base} ❌ OCUPAT — ${blocsInfo}`;
    }).join('\n');

  const resumPerFranja = dia ? frangesRestants.map(fid => {
    const f = FRANJES_ORIOL.find(x => x.id === fid);
    const gr = { jaAmb: [], lliure: [], suport: [], tp: [] };
    for (const d of docents) {
      if (!d.horari || d.nom === absentNom || rolBadge(d.nom) === 'PAE') continue;
      const raw = d.horari?.[dia]?.[fid] || '';
      const e = estatHorari(raw);
      const rol = rolBadge(d.nom) || d.rol?.toUpperCase() || '';
      if (e.estat === 'fora') continue;
      if (jaAmbGrup(d, fid))   { gr.jaAmb.push(`${d.nom}[${rol}]`); continue; }
      if (e.estat === 'lliure') gr.lliure.push(`${d.nom}[${rol}]`);
      else if (e.estat === 'suport') gr.suport.push(`${d.nom}[${rol}]`);
      else if (e.estat === 'tp')     gr.tp.push(`${d.nom}[${rol}]`);
    }
    const parts = [];
    if (gr.jaAmb.length)  parts.push(`✅JA AMB GRUP: ${gr.jaAmb.join(', ')}`);
    if (gr.lliure.length) parts.push(`✅lliure: ${gr.lliure.join(', ')}`);
    if (gr.suport.length) parts.push(`✅suport: ${gr.suport.join(', ')}`);
    if (gr.tp.length)     parts.push(`⚠️TP(deute): ${gr.tp.join(', ')}`);
    return `  ${f?.sub || fid}: ${parts.join(' | ') || '❌ ningú disponible'}`;
  }).join('\n') : '';

  const assignacioLines = Object.entries(assignacioMap).map(([nom, info]) => {
    const hores = info.fids.map(fid => FRANJES_ORIOL.find(x => x.id === fid)?.sub || fid).join(' / ');
    return `  - ${nom} → franges_ids: ${JSON.stringify(info.fids)}, hores: "${hores}"`;
  });
  const ctxAssig  = assignacioLines.length ? `\nASSIGNACIONS JA RESOLTES:\n${assignacioLines.join('\n')}\nFRANGES RESTANTS: ${JSON.stringify(frangesRestants)}\n` : '';
  const ctxExtra  = infoExtra?.context ? `\nACTIVITAT ESPECIAL: ${infoExtra.context}\n` : '';
  const ctxBaixes = baixes?.length ? `\nBAIXES LLARGUES:\n${baixes.map(b => `  · ${b.absent} → Substitut: ${b.substitut}`).join('\n')}\n` : '';
  const diaLabel  = dia ? dia.charAt(0).toUpperCase() + dia.slice(1) : 'dia no especificat';

  const prompt = `Ets l'assistent de gestió del CEE CA N'ORIOL (centre d'educació especial). Proposa cobertures respectant les regles del CEE.

═══ CONTEXT ═══
ABSENT: ${absentNom}${absentGrup ? ` — grup ${absentGrup}` : ''}
DIA: ${diaLabel}${data ? ` (${data})` : ''}
FRANGES A COBRIR: ${JSON.stringify(frangesRestants)}
${ctxExtra}${ctxBaixes}
NORMES DEL CENTRE:
${regles}

═══ CICLES DEL CENTRE ═══
• Infantil-Primària: G1, G2, G3, G4, G5, G6, MxI
• Secundària: G7, G8, G9, G10, G11, G12, G13, G14

═══ CONCEPTES CLAU ═══
• REFERENT d'un grup = docent que apareix a l'horari d'aquell grup (el coneix, hi entra habitualment)
• PAE REFERENT SOL: permès com a últim recurs (nivell 6), però mai com a primera opció.
• CEEPSIR / Piscina a l'horari → FORA DEL CENTRE, no disponible.

═══ JERARQUIA DE COBERTURA DE GRUP (ordre estricte) ═══
Quan falta qualsevol membre d'un grup (tutor, especialista, PAE...) el grup ha de quedar cobert.
Busca la millor combinació possible en aquest ordre:

1. ✅ MEE TUTOR del grup + PAE REFERENT del grup
2. ✅ MEE REFERENT (no tutor, però entra al grup — ex: msuport, MALL) + PAE REFERENT
3. ✅ MEE REFERENT + PAE NO REFERENT (disponible)
4. ✅ MEE NO REFERENT + PAE REFERENT
5. ✅ MEE REFERENT SOL (si no hi ha PAE disponible)
6. ✅ PAE REFERENT SOL (el PAE coneix el grup; millor que un MEE extern desconegut)
7. ✅ MEE NO REFERENT SOL
⚠️ ÚLTIM RECURS (nivell 8, si no hi ha cap MEE ni PAE referent): A.G (MUS), N.C (EVIP), A.G (MALL), R.E (MALL), C.P (MALL)
   → Poden quedar-se SOLS amb el grup sense PAE. És l'excepció permesa quan no hi ha cap altra opció.
❌ PAE NO REFERENT SOL → PROHIBIT sempre

═══ MESTRES DE SUPORT FLOTANTS (prioritzar sempre) ═══
• L.M (MEE): horari sempre "Suport" → disponible per a Infantil-Primària (G1–G6). Compta com a REFERENT d'aquest cicle.
• R.S (MEE): horari sempre "Suport" → disponible per a Secundària (G7–G14). Compta com a REFERENT d'aquest cicle.

═══ CASOS ESPECIALS ═══
▸ G5 COTUTORIA: A.S (MEE) + R.V (MEE) comparteixen G5. Cada una fa 1h TP/setmana. Si una falta, l'altra és referent del grup → primera opció (nivell 1).
▸ ESTIM absent: les franges d'Estimulació NO es cobreixen. La tutora es queda amb el grup. No cal proposar ningú.
▸ MALL referent: si ja entra al grup absent → pot actuar com a MEE referent (nivell 2 o 3). Si NO hi entra → últim recurs (nivell 6).
▸ MxI REGLA ABSOLUTA: si C.F (MEE) o M.V (PAE) falta → ÚNICS substituts: L.M (MEE) o R.E (MALL). Cap altre docent.
${ctxAssig}
═══ DISPONIBILITAT a ${diaLabel} ═══
${disponibilitatDocents}

DISPONIBILITAT PER FRANJA:
${resumPerFranja}

═══ PROCEDIMENT ═══
1. Identifica el grup afectat i comprova quins referents té disponibles.
2. Aplica la jerarquia de cobertura de grup (nivells 1→6). Para en el primer nivell possible.
3. Comprova sempre L.M (Infantil-Primària) o R.S (Secundària) abans de mirar altres MEE.
4. No proposis cap PAE sol en cap cas.
5. Si el grup és MxI, aplica la REGLA ABSOLUTA.
6. Si el mateix docent cobreix franges consecutives → una sola entrada amb totes les franges_ids.

Escriu 2-3 línies de raonament i llavors el JSON:
{"proposta":[{"docent":"Nom","franges_ids":["o1a","o1b"],"hores":"9:30–10:30","grup_origen":"${absentGrup}","tp_afectat":false,"motiu":"raó"},...],"resum":"frase curta"}`;

  const result = await callClaude([{ role: 'user', content: prompt }], 1200);
  const filtered = (result.proposta || []).map(entry => {
    const fids = (entry.franges_ids || []).filter(fid => !assignedFids.has(fid));
    return fids.length ? { ...entry, franges_ids: fids } : null;
  }).filter(Boolean);
  result.proposta = sortProposta([...preAssigEntries, ...filtered]);
  return result;
}
