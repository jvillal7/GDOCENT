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
const SUPORT_KW = ['suport', 'mee', 'mesi', 'siei', 'aci', 'acis'];
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

  const infoGrupsAfectats = dia ? blocs.map(b => {
    const acts = [...new Set(b.ids.map(fid => absentHorariDia[fid]).filter(v => v))];
    if (!acts.length) return null;
    const tutorsAfectats = docents.filter(d => {
      if (!d.grup_principal || !d.horari) return false;
      const gpN = normG(d.grup_principal);
      if (gpN.length < 2) return false;
      return acts.some(act => normG(act).includes(gpN));
    });
    if (!tutorsAfectats.length) return `• ${b.hora} (${acts.join(' / ')}): cap tutor identificat — buscar al mateix cicle`;
    const lines = tutorsAfectats.map(t => {
      const estats = b.ids.map(fid => estatHorari(t.horari?.[dia]?.[fid]));
      const esFora = estats.some(e => e.estat === 'fora');
      const potCobrir = estats.every(e => ['lliure','tp','carec','suport'].includes(e.estat));
      const detail = estats.map(e => e.text).join(', ');
      if (esFora) return `  → TUTOR/A ${t.nom} (${t.grup_principal}): ❌ FORA — buscar alternativa al cicle`;
      if (potCobrir) return `  → TUTOR/A ${t.nom} (${t.grup_principal}): ✅ PRIMERA OPCIÓ — interrompre (${detail}) i quedar-se amb el seu grup`;
      return `  → TUTOR/A ${t.nom} (${t.grup_principal}): ❌ ja ensenya un altre grup (${detail}) — buscar alternativa`;
    }).join('\n');
    return `• ${b.hora} (${acts.join(' / ')}):\n${lines}`;
  }).filter(Boolean).join('\n') : '';

  // Per cada docent, mostrar disponibilitat a TOTS els blocs d'hora
  const disponibilitatDocents = docents.filter(d => d.horari).map(d => {
    const totsEstats = blocs.flatMap(b =>
      b.ids.map(fid => (dia ? estatHorari(d.horari?.[dia]?.[fid]) : { estat: 'ocupat', text: '?' }))
    );

    if (totsEstats.some(e => e.estat === 'fora')) {
      return `  · ${d.nom} (${d.grup_principal || '?'}): ❌ FORA DEL CENTRE — no proposar`;
    }

    const blocsInfo = blocs.map(b => {
      const { text } = dia ? estatHorari(d.horari?.[dia]?.[b.ids[0]]) : { text: '?' };
      return `${b.hora}=${text}`;
    }).join(', ');

    const estats = totsEstats.map(e => e.estat);
    const totLliure = estats.every(e => e === 'lliure');
    const potCobrir = estats.every(e => ['lliure', 'tp', 'carec', 'suport'].includes(e));
    const ambTP     = estats.some(e => e === 'tp');
    const ambSuport = estats.some(e => e === 'suport');

    const base = `  · ${d.nom} (${d.grup_principal || '?'}): cob.mes=${d.cobertures_mes || 0} |`;
    if (totLliure)              return `${base} ✅ DISPONIBLE TOT EL BLOC (al centre, sense classe)`;
    if (potCobrir && ambSuport) return `${base} ✅ POT COBRIR (Suport, flexible) — ${blocsInfo}`;
    if (potCobrir && ambTP)     return `${base} ✅ POT COBRIR amb deute TP — ${blocsInfo}`;
    if (potCobrir)              return `${base} ⚠️ POT COBRIR (Càrrec, últim recurs) — ${blocsInfo}`;
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

  const diaLabel = dia ? dia.charAt(0).toUpperCase() + dia.slice(1) : 'dia no especificat';

  const prompt = `Ets l'assistent de gestió d'un centre educatiu de primària.
DOCENT ABSENT: ${absentNom}
DIA DE L'ABSÈNCIA: ${diaLabel}${data ? ` (${data})` : ''}
DURADA: ${durada} — Blocs horaris: ${blocsDesc}
NORMES DEL CENTRE:
${regles}${contextExtra}${contextBaixes}${contextGrups}

JERARQUIA DE PRIORITATS per a cada bloc (ordre estricte):
1. TUTOR/A DEL GRUP AFECTAT marcats com "PRIMERA OPCIÓ": si fan TP, coordinació o suport → INTERROMPRE i quedar-se amb el seu grup. Un tutor/a sempre prefereix quedar-se amb el seu propi grup.
2. Docent del MATEIX cicle (Infantil I3-I5 · Cicle Inicial 1r-2n · Cicle Mitjà 3r-4t · Cicle Superior 5è-6è) amb disponibilitat (✅).
3. Docent d'un cicle diferent — ÚLTIM RECURS absolut. Només si cap opció anterior existeix.
4. Si ningú disponible per un bloc → indicar "GRUP DESCOBERT" al resum, no inventar ningú.

REGLES ADDICIONALS:
- ❌ "FORA DEL CENTRE" = MAI proposar. Ignora'l completament.
- ❌ "OCUPAT" = ensenya un altre grup. No proposar (excepte si és el tutor del grup afectat que ja és amb el seu grup).
- Mínim de docents possible: un sol docent per a TOTA l'absència si pot. Si no, un per bloc d'hora (mai per franja de 30 min).
- tp_afectat:true si el docent proposat tenia TP en aquelles franges.
- Aplica les NORMES DEL CENTRE per a restriccions addicionals.

DISPONIBILITAT DELS DOCENTS a ${diaLabel}:
${disponibilitatDocents}

Respon NOMÉS JSON: {"proposta":[{"docent":"Nom Cognom","franges_ids":${JSON.stringify(frangesIds)},"hores":"${blocsDesc}","grup_origen":"GX","tp_afectat":false,"motiu":"raó"}],"resum":"frase curta"}`;

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
