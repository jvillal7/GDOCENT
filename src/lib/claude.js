import { WORKER_URL, FRANJES, FRANJES_ORIOL } from './constants';

async function callClaude(messages, maxTokens = 1000, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
2) Prioritza docents sense TP en aquella franja
3) Reparteix cobertures equitativament
4) Un docent per franja`;

function estatHorari(val) {
  const v = (val || '').toLowerCase().trim();
  if (!v || v === 'lliure' || v === 'libre') return { lliure: true,  text: 'lliure' };
  if (v === 'tp' || v === 'treball personal') return { lliure: false, text: 'TP' };
  return { lliure: false, text: `ocupat: ${val}` };
}

export async function proposarCobertura(absentNom, frangesIds, docents, normes, data, isOriol = false, infoExtra = null, baixes = null) {
  const FRANJES_ACT = isOriol ? FRANJES_ORIOL : FRANJES;
  const dia = data
    ? ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][new Date(data + 'T12:00:00').getDay()]
    : null;

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

  // Per cada docent, mostrar disponibilitat a TOTS els blocs d'hora
  const disponibilitatDocents = docents.map(d => {
    const blocsInfo = blocs.map(b => {
      const totLliure = b.ids.every(fid => {
        const { lliure } = dia ? estatHorari(d.horari?.[dia]?.[fid]) : { lliure: false };
        return lliure;
      });
      const { text } = dia ? estatHorari(d.horari?.[dia]?.[b.ids[0]]) : { text: '?' };
      return `${b.hora}=${totLliure ? 'lliure' : text}`;
    }).join(', ');
    const disponibleTot = blocs.every(b =>
      b.ids.every(fid => {
        const { lliure } = dia ? estatHorari(d.horari?.[dia]?.[fid]) : { lliure: false };
        return lliure;
      })
    );
    return `  · ${d.nom} (${d.grup_principal || '?'}): cob.mes=${d.cobertures_mes || 0} | ${disponibleTot ? '✓ LLIURE TOT EL BLOC' : blocsInfo}`;
  }).join('\n');

  const contextExtra = infoExtra?.context
    ? `\nACTIVITAT ESPECIAL AVUI (prioritat màxima): ${infoExtra.context}\nEls docents implicats en aquesta activitat han estat exclosos de la llista de disponibles.`
    : '';

  const contextBaixes = baixes?.length
    ? `\nBAIXES LLARGUES (docents absents tot el curs):\n${baixes.map(b => `  · ${b.absent} → Substitut permanent: ${b.substitut}${b.notes ? ` (${b.notes})` : ''}. ${b.substitut} fa l'horari complet de ${b.absent} i les seves cobertures. NO assignar ${b.absent} a cap cobertura.`).join('\n')}`
    : '';

  const diaLabel = dia ? dia.charAt(0).toUpperCase() + dia.slice(1) : 'dia no especificat';

  const prompt = `Ets l'assistent de gestió d'un centre educatiu de primària.
DOCENT ABSENT: ${absentNom}
DIA DE L'ABSÈNCIA: ${diaLabel}${data ? ` (${data})` : ''}
DURADA: ${durada} — Blocs horaris: ${blocsDesc}
NORMES DEL CENTRE:
${regles}${contextExtra}${contextBaixes}

REGLA FONAMENTAL: Assigna el MÍNIM de docents possible. Prioritza un SOL docent per a TOTA l'absència. Només si cap docent és lliure en tots els blocs, proposa un per bloc d'hora (mai un per franja de 30 min).
IMPORTANT: La disponibilitat que veus a sota és la de l'horari de ${diaLabel}. Respecta-la estrictament.

DISPONIBILITAT DELS DOCENTS a ${diaLabel} (tots els blocs de l'absència):
${disponibilitatDocents}

INSTRUCCIONS:
1. Tria preferentment un docent marcat com "✓ LLIURE TOT EL BLOC" amb menys cobertures.
2. Si no n'hi ha cap, proposa el mínim (1 per bloc d'hora). Mai 1 per franja de 30 min.
3. Evita docents "ocupat". Usa "TP" només si no hi ha cap altra opció.
4. "franges_ids" ha de contenir TOTES les franges que cobreix aquell docent.

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
{"resum":"descripció breu (1-2 frases)","docentsBlocats":[{"nom":"Nom Cognom","hores":"9:00-12:30"}],"context":"instrucció curta per a la IA de cobertures","data_inici":"${avui}","data_fi":"${avui}"}`
  });
  return callClaude([{ role: 'user', content }], 1000);
}

export async function extractHorariFromPDF(base64, franjes) {
  const franjesDesc = franjes
    .map(f => `${f.id}=${f.sub}${f.lliure ? '(Lliure)' : ''}`)
    .join(', ');
  const diaTemplate = JSON.stringify(
    franjes.reduce((acc, f) => ({ ...acc, [f.id]: f.lliure ? 'Lliure' : '' }), {})
  );
  const tpExId = franjes.filter(f => !f.lliure && !f.patio).slice(-1)[0]?.id || franjes[0]?.id;

  const prompt = `Extreu l'horari del docent d'aquest PDF.
Franges: ${franjesDesc}
Valors: "TP", "Lliure", "Pati", o grup+activitat ("G3 · Lectura")
JSON: {"nom":"Nom","rol":"tutor","grup_principal":"G1","horari":{"dilluns":${diaTemplate},"dimarts":${diaTemplate},"dimecres":${diaTemplate},"dijous":${diaTemplate},"divendres":${diaTemplate}},"tp_franges":["divendres-${tpExId}"]}`;
  return callClaude([{
    role: 'user',
    content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: prompt },
    ],
  }], 2000);
}
