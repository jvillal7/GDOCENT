import { WORKER_URL, FRANJES } from './constants';

async function callClaude(messages, maxTokens = 1000) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, messages }),
  });
  if (!res.ok) throw new Error('Error al Worker: ' + res.status);
  const data = await res.json();
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

export async function proposarCobertura(absentNom, frangesIds, docents, normes, data) {
  const dia = data
    ? ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][new Date(data + 'T12:00:00').getDay()]
    : null;

  const regles = (normes || '').trim() || REGLES_DEFAULT;

  const disponibilitatPerFranja = frangesIds.map(fid => {
    const f = FRANJES.find(x => x.id === fid);
    const label = f ? `${f.label} (${f.sub})` : fid;
    const linies = docents.map(d => {
      const { text } = dia ? estatHorari(d.horari?.[dia]?.[fid]) : { text: 'horari desconegut' };
      return `  · ${d.nom} (${d.grup_principal || '?'}): ${text}, cobertures mes: ${d.cobertures_mes || 0}`;
    }).join('\n');
    return `${label}:\n${linies}`;
  }).join('\n\n');

  const prompt = `Ets l'assistent de gestió d'un centre educatiu de primària.
DOCENT ABSENT: ${absentNom}
NORMES DEL CENTRE:
${regles}
DISPONIBILITAT REAL PER FRANJA (extreta dels horaris individuals):
${disponibilitatPerFranja}
INSTRUCCIONS: Per a cada franja, tria el docent marcat com "lliure" amb menys cobertures aquest mes. Evita els marcats com "ocupat" (ja tenen alumnes). Usa "TP" només si no hi ha cap "lliure".
Respon NOMÉS JSON: {"proposta":[{"franja":"1a hora","docent":"Nom Cognom","grup_origen":"Xè Y","tp_afectat":false,"motiu":"raó"}],"resum":"frase curta"}`;

  return callClaude([{ role: 'user', content: prompt }], 1200);
}

export async function proposarCoberturaCella(grup, hora, fid, temps, docents, normes) {
  const regles = (normes || '').trim() || REGLES_DEFAULT;
  const dia = ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][new Date().getDay()];
  const dl = docents.map(d => {
    const { text } = estatHorari(d.horari?.[dia]?.[fid]);
    return `${d.nom} (${d.grup_principal || '?'}): ${text}, cob:${d.cobertures_mes || 0}`;
  }).join(' | ');
  const prompt = `Proposa UN docent per cobrir el grup ${grup} a ${hora} (${temps}). Tria preferentment els marcats com "lliure". Evita els marcats com "ocupat". Normes: ${regles}. Docents avui: ${dl}. JSON: {"proposta":[{"franja":"${hora}","docent":"Nom","grup_origen":"${grup}","tp_afectat":false,"motiu":"raó"}],"resum":"frase"}`;
  return callClaude([{ role: 'user', content: prompt }], 500);
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
