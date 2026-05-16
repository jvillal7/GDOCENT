import { FRANJES } from './constants';
import { callClaude, logIA } from './claude-api';
import { proposarCoberturaOriol } from './claude-oriol';
import {
  REGLES_DEFAULT, TP_KW,
  estatHorari, normG, getCicle, migGrupCicle, matchesAbsentGroup,
} from './claude-utils';

export async function proposarCobertura(absentNom, frangesIds, docents, normes, data, isOriol = false, infoExtra = null, baixes = null, frangesIA = null) {
  if (isOriol) return proposarCoberturaOriol(absentNom, frangesIds, docents, normes, data, infoExtra, baixes, frangesIA);

  const t0 = Date.now();
  const frangesInput = [...frangesIds];
  const logData = {
    escola_id: docents[0]?.escola_id ?? null,
    tipus: 'cobertura',
    absent_nom: absentNom,
    data_absencia: data ?? null,
    franges_input: frangesInput,
  };

  try {
    return await _proposarCoberturaRivo(absentNom, frangesIds, docents, normes, data, infoExtra, baixes, logData);
  } catch (e) {
    logData.error_msg = e.message;
    throw e;
  } finally {
    logData.duration_ms = Date.now() - t0;
    logIA(logData);
  }
}

async function _proposarCoberturaRivo(absentNom, frangesIds, docents, normes, data, infoExtra, baixes, logData) {
  const FRANJES_ACT = FRANJES;
  const dia = data
    ? ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][new Date(data + 'T12:00:00').getDay()]
    : null;

  logData.dia = dia;

  if (dia === 'dissabte' || dia === 'diumenge') throw new Error('No es generen cobertures per a cap de setmana');

  const regles = (normes || '').trim() || REGLES_DEFAULT;

  const absentDocent   = docents.find(d => d.nom === absentNom);
  const absentHorariDia = absentDocent?.horari?.[dia] || {};
  const absentGrupCore = (() => {
    const m = (absentDocent?.grup_principal || '').match(/(\d+)\s*[a-zA-ZèéàòíùüÈ]?\s*([a-zA-Z])\b/);
    return m ? `${m[1]}${m[2].toLowerCase()}` : '';
  })();
  const absentCicle = getCicle(absentDocent?.grup_principal);

  const esEspecialista = !absentGrupCore;
  const autoresolt = [];
  if (dia) {
    frangesIds = frangesIds.filter(fid => {
      const raw  = (absentHorariDia[fid] || '').trim();
      const rawL = raw.toLowerCase();
      const fLabel = FRANJES_ACT.find(x => x.id === fid)?.sub || fid;
      if (TP_KW.some(k => rawL === k)) {
        autoresolt.push({ fid, fLabel, raw, motiu: 'TP — sense grup assignat en aquesta franja' });
        return false;
      }
      if (esEspecialista) {
        if (/^racons/i.test(rawL))          { autoresolt.push({ fid, fLabel, raw, motiu: 'Racons — tutors es queden amb el grup complet (Norma 2)' }); return false; }
        if (/^tallers?$/i.test(rawL))        { autoresolt.push({ fid, fLabel, raw, motiu: 'Tallers — alumnes queden amb la seva tutora (Norma 3)' }); return false; }
        if (/desdoblament|mig\s*grup/i.test(rawL)) { autoresolt.push({ fid, fLabel, raw, motiu: 'Desdoblament — tutor es queda amb el grup complet' }); return false; }
        if (rawL.includes('suport'))         { autoresolt.push({ fid, fLabel, raw, motiu: "Suport — el tutor principal ja és a l'aula" }); return false; }
      }
      return true;
    });
  }

  if (frangesIds.length === 0) {
    logData.no_cal_cobrir = true;
    logData.franges_restants = [];
    logData.proposta = [];
    return { proposta: [], resum: 'No cal cobrir cap franja.', noCalCobrir: true, autoresolt };
  }

  const blocsMap = {};
  for (const fid of frangesIds) {
    const f = FRANJES_ACT.find(x => x.id === fid);
    if (!f) continue;
    if (!blocsMap[f.hora]) blocsMap[f.hora] = { hora: f.hora, ids: [] };
    blocsMap[f.hora].ids.push(fid);
  }
  const blocs = Object.values(blocsMap);

  const infoGrupsAfectats = dia ? blocs.map(b => {
    const acts = [...new Set(b.ids.map(fid => absentHorariDia[fid]).filter(v => v))];
    if (!acts.length) return null;

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
      if (!d.grup_principal || !d.horari || d.nom === absentNom) return false;
      const gpN = normG(d.grup_principal);
      if (gpN.length < 2) return false;
      return acts.some(act => normG(act).includes(gpN));
    });
    const jaAmbGrup = absentGrupCore ? docents.filter(d => {
      if (!d.horari || d.nom === absentNom) return false;
      if (tutorsAfectats.some(t => t.nom === d.nom)) return false;
      return b.ids.some(fid => matchesAbsentGroup(d.horari?.[dia]?.[fid] || '', absentGrupCore));
    }) : [];

    const linesJaAmb = jaAmbGrup.map(t => {
      const isMesi = /mesi|mee/i.test(t.grup_principal || '');
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
      const esFora    = estats.some(e => e.estat === 'fora');
      const potCobrir = estats.every(e => ['lliure','tp','carec','suport'].includes(e.estat));
      const detail    = estats.map(e => e.text).join(', ');
      if (esFora)    return `  → TUTOR/A ${t.nom} (${t.grup_principal}): ❌ FORA — buscar alternativa al cicle`;
      if (potCobrir) return `  → TUTOR/A ${t.nom} (${t.grup_principal}): ✅ PRIMERA OPCIÓ — interrompre (${detail}) i quedar-se amb el seu grup`;
      return `  → TUTOR/A ${t.nom} (${t.grup_principal}): ❌ ja ensenya un altre grup (${detail}) — buscar alternativa`;
    }).join('\n');

    return `• ${b.hora} (${acts.join(' / ')}):\n${[lines, linesJaAmb].filter(Boolean).join('\n')}`;
  }).filter(Boolean).join('\n') : '';

  const disponibilitatDocents = docents
    .filter(d => d.horari && d.nom !== absentNom)
    .sort((a, b) => {
      const sa = absentCicle && getCicle(a.grup_principal) === absentCicle;
      const sb = absentCicle && getCicle(b.grup_principal) === absentCicle;
      return sa === sb ? 0 : sa ? -1 : 1;
    })
    .map(d => {
      const isMesiDocent = /mesi|mee/i.test(d.grup_principal || '');
      const estatCtx = (fid) => {
        const raw = dia ? d.horari?.[dia]?.[fid] : null;
        if (!raw) return dia ? estatHorari(raw) : { estat: 'ocupat', text: '?' };
        if (matchesAbsentGroup(raw, absentGrupCore)) {
          if (isMesiDocent) return { estat: 'mesiAmb', text: `MESI ja és al grup (${raw}) — última opció` };
          return { estat: 'suport', text: `Ja és amb el grup de ${absentNom}: ${raw}` };
        }
        if (isMesiDocent) {
          const mRaw = raw.match(/(\d+)\s*[a-zA-ZèéàòíùüÈ]?\s*([a-zA-Z])\b/);
          const rawCicle = mRaw ? getCicle(`${mRaw[1]}${mRaw[2]}`) : getCicle(raw);
          if (!rawCicle || rawCicle !== absentCicle) return { estat: 'ocupat', text: `MESI a cicle diferent (${raw})` };
        }
        const mgCicle = migGrupCicle(raw);
        if (mgCicle && absentCicle && mgCicle === absentCicle)
          return { estat: 'migGrup', text: `Mig grup (${raw}) — pot assumir grup complet` };
        // "Suport X" amb grup específic diferent al de l'absent → compromès amb aquells alumnes, no disponible
        if (/^suport\s+\S/i.test(raw.trim()))
          return { estat: 'ocupat', text: `Suport fixat a altre grup: ${raw}` };
        return estatHorari(raw);
      };

      const totsEstats = blocs.flatMap(b => b.ids.map(fid => estatCtx(fid)));
      if (totsEstats.some(e => e.estat === 'fora'))
        return `  · ${d.nom} (${d.grup_principal || '?'}): ❌ FORA DEL CENTRE — no proposar`;

      const blocsInfo = blocs.map(b => {
        if (b.ids.length === 1) return `${b.hora}=${estatCtx(b.ids[0]).text}`;
        const detall = b.ids.map(fid => {
          const f = FRANJES_ACT.find(x => x.id === fid);
          return `${f?.sub || fid}: ${estatCtx(fid).text}`;
        }).join(' | ');
        return `${b.hora}(${detall})`;
      }).join(', ');

      const estats     = totsEstats.map(e => e.estat);
      const COBRIBLE   = new Set(['lliure', 'tp', 'carec', 'suport', 'migGrup', 'mesiAmb']);
      const totLliure  = estats.every(e => e === 'lliure');
      const potCobrir  = estats.every(e => COBRIBLE.has(e));
      const parcial    = !potCobrir && estats.some(e => COBRIBLE.has(e));
      const ambTP      = estats.some(e => e === 'tp');
      const ambSuport  = estats.some(e => e === 'suport');
      const ambMigGrup = estats.some(e => e === 'migGrup');
      const ambMesiAmb = estats.some(e => e === 'mesiAmb');
      const cicle      = getCicle(d.grup_principal);
      const cicleTag   = cicle ? (cicle === absentCicle ? ' ★MATEIX CICLE' : ` [${cicle}]`) : '';
      const base = `  · ${d.nom} (${d.grup_principal || '?'})${cicleTag}: cob.mes=${d.cobertures_mes || 0} |`;
      if (totLliure)                              return `${base} ✅ DISPONIBLE TOT EL BLOC (al centre, sense classe)`;
      if (potCobrir && ambMigGrup)                return `${base} ✅ POT COBRIR (Mig grup → assumeix grup complet) — ${blocsInfo}`;
      if (potCobrir && ambSuport && !ambMesiAmb)  return `${base} ✅ POT COBRIR (Suport, flexible) — ${blocsInfo}`;
      if (potCobrir && ambTP && !ambMesiAmb)      return `${base} ⚠️ POT COBRIR amb deute TP (DARRER RECURS si no hi ha suport disponible) — ${blocsInfo}`;
      if (potCobrir && !ambMesiAmb)               return `${base} ⚠️ POT COBRIR (Càrrec, últim recurs) — ${blocsInfo}`;
      if (potCobrir && ambMesiAmb)                return `${base} ⚠️ MESI AMB GRUP (última opció — no interrompre si hi ha alternativa) — ${blocsInfo}`;
      if (parcial)                                return `${base} ⚡ PARCIALMENT DISPONIBLE — pot cobrir els blocs marcats ✅ — ${blocsInfo}`;
                                                  return `${base} ❌ OCUPAT — ${blocsInfo}`;
    }).join('\n');

  const contextExtra  = infoExtra?.context
    ? `\nACTIVITAT ESPECIAL AVUI (prioritat màxima): ${infoExtra.context}\nEls docents implicats en aquesta activitat han estat exclosos de la llista de disponibles.`
    : '';
  const contextBaixes = baixes?.length
    ? `\nBAIXES LLARGUES (docents absents tot el curs):\n${baixes.map(b => `  · ${b.absent} → Substitut permanent: ${b.substitut}${b.notes ? ` (${b.notes})` : ''}. ${b.substitut} fa l'horari complet de ${b.absent} i les seves cobertures. NO assignar ${b.absent} a cap cobertura.`).join('\n')}`
    : '';
  const contextGrups  = infoGrupsAfectats
    ? `\nGRUPS AFECTATS I TUTORS a ${dia ? dia.charAt(0).toUpperCase() + dia.slice(1) : ''}:\n${infoGrupsAfectats}\n`
    : '';

  // Fases 1, 1.5, 2: pre-assignacions obligatòries
  const assignacioMap = {};
  const assignedFids  = new Set();
  if (dia) {
    const doAddFid = (nom, fid, val) => {
      if (assignedFids.has(fid)) return;
      const f = FRANJES_ACT.find(x => x.id === fid);
      if (!assignacioMap[nom]) assignacioMap[nom] = { fids: [], vals: [] };
      assignacioMap[nom].fids.push(fid);
      assignacioMap[nom].vals.push(`${f?.sub || fid}: ${val || 'lliure'}`);
      assignedFids.add(fid);
    };
    if (absentGrupCore) {
      const fase1Cand = {};
      for (let di = 0; di < docents.length; di++) {
        const d = docents[di];
        if (!d.horari || d.nom === absentNom || /mesi|mee/i.test(d.grup_principal || '')) continue;
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
        doAddFid(best.nom, fid, best.raw);
      }
    }
    if (absentGrupCore) {
      const ordAll = FRANJES_ACT.map(f => f.id);
      const f4r = ordAll.indexOf('f4');
      for (const [nom, info] of Object.entries(assignacioMap)) {
        const dObj = docents.find(x => x.nom === nom);
        if (!dObj?.horari) continue;
        for (const assignedFid of [...info.fids]) {
          const rawA = dObj.horari?.[dia]?.[assignedFid] || '';
          if (!/racons\s*\d+/i.test(rawA)) continue;
          const idxA  = ordAll.indexOf(assignedFid);
          const sideA = idxA < f4r;
          for (const adjIdx of [idxA - 1, idxA + 1]) {
            if (adjIdx < 0 || adjIdx >= ordAll.length) continue;
            const adjFid = ordAll[adjIdx];
            if (!frangesIds.includes(adjFid) || assignedFids.has(adjFid)) continue;
            if ((adjIdx < f4r) !== sideA) continue;
            const rawAdj = dObj.horari?.[dia]?.[adjFid] || '';
            if (/^racons\s*$/i.test(rawAdj.trim())) doAddFid(nom, adjFid, rawAdj);
          }
        }
      }
    }
    if (absentCicle) {
      const orderedF2 = blocs.flatMap(b => b.ids).filter(fid => frangesIds.includes(fid));
      for (const fid of orderedF2) {
        if (assignedFids.has(fid)) continue;
        const cands = [];
        for (let di = 0; di < docents.length; di++) {
          const d = docents[di];
          if (!d.horari || d.nom === absentNom || /mesi|mee/i.test(d.grup_principal || '')) continue;
          const raw = d.horari?.[dia]?.[fid] || '';
          if (matchesAbsentGroup(raw, absentGrupCore)) continue;
          const e = estatHorari(raw);
          let priority = 0;
          if (e.estat === 'suport') {
            const m2 = raw.match(/(\d+)\s*[a-zA-ZèéàòíùüÈ]?\s*([a-zA-Z])\b/);
            const cicleEntry = m2 ? getCicle(`${m2[1]}${m2[2]}`) : getCicle(d.grup_principal);
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
          doAddFid(best.nom, fid, best.raw);
        }
      }
    }
  }

  const assignacioLines = Object.entries(assignacioMap).map(([nom, info]) => {
    const horesStr = info.fids.map(fid => FRANJES_ACT.find(x => x.id === fid)?.sub || fid).join(' / ');
    return `  - ${nom} → franges_ids: ${JSON.stringify(info.fids)}, hores: "${horesStr}" (${info.vals.join(', ')})`;
  });
  const frangesRestants = frangesIds.filter(fid => !assignedFids.has(fid));

  logData.franges_restants = frangesRestants;
  logData.no_cal_cobrir    = false;

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
        const hEnd   = ((lastF?.sub || '').split('–')[1] || '').trim();
        preAssigEntries.push({
          docent: nom, franges_ids: sessionFids,
          hores: hStart && hEnd ? `${hStart}–${hEnd}` : sessionFids.map(fid => FRANJES_ACT.find(f => f.id === fid)?.sub || fid).join(', '),
          grup_origen: absentDocent?.grup_principal || '', tp_afectat: false,
          motiu: session.map(p => p.val).join(' / '),
        });
      }
    }
  }

  const assignacioRaonament = Object.entries(assignacioMap).map(([nom, info]) => {
    const lines = info.fids.map(fid => {
      const raw   = dia ? absentDocent?.horari?.[dia]?.[fid] || '' : '';
      const f     = FRANJES_ACT.find(x => x.id === fid);
      const label = f?.sub || fid;
      const isDirectMatch = matchesAbsentGroup(raw, absentGrupCore);
      if (/racons/i.test(raw) && isDirectMatch)
        return `    ${label}: ${nom} té "${raw}" → Racons ${absentGrupCore ? absentGrupCore.replace(/[a-z]$/,'') : ''} = MIG GRUP del curs de ${absentNom} → quan ${absentNom} falta, ${nom} assumeix el grup complet (PATRÓ 2)`;
      if (/desdobl/i.test(raw) && isDirectMatch)
        return `    ${label}: ${nom} té "${raw}" → DESDOBLAMENT del grup de ${absentNom} → quan ${absentNom} falta, ${nom} assumeix el grup complet (PATRÓ 2)`;
      if (/suport/i.test(raw) && isDirectMatch)
        return `    ${label}: ${nom} té "${raw}" → suport directe al grup de ${absentNom} → ja és amb ells, millor opció (PATRÓ 1)`;
      if (/suport/i.test(raw)) {
        const m2 = raw.match(/(\d+)\s*[a-zA-ZèéàòíùüÈ]?\s*([a-zA-Z])\b/);
        const cicleEntry = m2 ? getCicle(`${m2[1]}${m2[2]}`) : null;
        return `    ${label}: ${nom} té "${raw}" → suport al ${cicleEntry || 'mateix cicle'} = ★CICLE Superior, disponible sense generar TP (PATRÓ 5a)`;
      }
      if (!raw) {
        const cicle = getCicle(docents.find(d => d.nom === nom)?.grup_principal) || '★CICLE';
        return `    ${label}: ${nom} lliure al centre → ${cicle} disponible sense TP (PATRÓ 5a)`;
      }
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

  const resumPerFranja = dia ? frangesIds.map(fid => {
    const f  = FRANJES_ACT.find(x => x.id === fid);
    const gr = { jaAmb: [], suport: [], lliure: [], tp: [], carec: [] };
    for (const d of docents) {
      if (!d.horari || d.nom === absentNom) continue;
      const raw    = d.horari?.[dia]?.[fid] || '';
      const isMesi = /mesi|mee/i.test(d.grup_principal || '');
      const star   = getCicle(d.grup_principal) === absentCicle ? '★' : '';
      if (matchesAbsentGroup(raw, absentGrupCore) && !isMesi) { gr.jaAmb.push(d.nom + star); continue; }
      if (isMesi) {
        const mRaw = raw.match(/(\d+)\s*[a-zA-ZèéàòíùüÈ]?\s*([a-zA-Z])\b/);
        const rawCicle = mRaw ? getCicle(`${mRaw[1]}${mRaw[2]}`) : getCicle(d.grup_principal);
        if (!rawCicle || rawCicle !== absentCicle) continue;
      }
      const e = estatHorari(raw);
      if (e.estat === 'fora') continue;
      // "Suport X" amb grup específic diferent al de l'absent → no disponible
      if (e.estat === 'suport' && /^suport\s+\S/i.test(raw.trim())) continue;
      if      (e.estat === 'lliure') gr.lliure.push(d.nom + star);
      else if (e.estat === 'suport') gr.suport.push(`${d.nom}${star} (${raw})`);
      else if (e.estat === 'tp')     gr.tp.push(d.nom + star);
      else if (e.estat === 'carec')  gr.carec.push(d.nom + star);
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

PATRÓ 2 — Mig grup (Racons / Desdoblament):
Si un docent té "Racons N" on N és el CURS del grup absent → fa la meitat del grup → quan la tutora falta, assumeix el grup COMPLET. NO genera TP.

PATRÓ 3 — MESI: cobreix exclusivament al seu nivell/cicle.

PATRÓ 4 — Sessions matí/tarda: si cobreix matí I tarda → crear DOS entrades separades.

PATRÓ 5 — Jerarquia de prioritats:
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
1. ASSIGNACIONS JA RESOLTES: Si hi ha secció "ASSIGNACIONS OBLIGATÒRIES", inclou-les sense modificar.
2. FRANGES RESTANTS ${JSON.stringify(frangesRestants)}: Per cada franja, aplica la jerarquia (PATRÓ 5).
3. VALIDACIÓ: cada franja de ${JSON.stringify(frangesRestants)} exactament una vegada.

Respon ÚNICAMENT amb el JSON (sense text previ ni explicació):
{"proposta":[{"docent":"Nom","franges_ids":["f1a"],"hores":"9:00–9:30","grup_origen":"GX","tp_afectat":false,"motiu":"raó concreta"},...],"resum":"frase curta"}`;

  logData.prompt_chars = prompt.length;

  const _ordFids = FRANJES_ACT.map(f => f.id);
  const sortProposta = arr => [...arr].sort((a, b) => {
    const aMin = Math.min(...(a.franges_ids || []).map(fid => _ordFids.indexOf(fid)).filter(i => i >= 0), 999);
    const bMin = Math.min(...(b.franges_ids || []).map(fid => _ordFids.indexOf(fid)).filter(i => i >= 0), 999);
    return aMin - bMin;
  });

  if (frangesRestants.length === 0) {
    const sorted = sortProposta(preAssigEntries);
    logData.proposta = sorted;
    return { proposta: sorted, resum: sorted.map(e => `${e.docent}: ${e.hores}`).join(' | ') };
  }

  const result  = await callClaude([{ role: 'user', content: prompt }], 2000);
  const filtered = (result.proposta || []).map(entry => {
    const fids = (entry.franges_ids || []).filter(fid => !assignedFids.has(fid));
    return fids.length ? { ...entry, franges_ids: fids } : null;
  }).filter(Boolean);
  result.proposta = sortProposta([...preAssigEntries, ...filtered]);

  logData.proposta = result.proposta;
  return result;
}
