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
  return JSON.parse(raw.replace(/```json|```/g, '').trim());
}

export async function proposarCobertura(absentNom, frangesIds, docents) {
  const frangesStr = frangesIds.map(fid => {
    const f = FRANJES.find(x => x.id === fid);
    return f ? `${f.label} (${f.sub})` : fid;
  }).join(', ');

  const prompt = `Ets l'assistent de gestió d'un centre educatiu de primària.
DOCENT ABSENT: ${absentNom}
FRANGES AFECTADES: ${frangesStr}
DOCENTS DISPONIBLES:
${docents.map(d => `- ${d.nom} (${d.grup_principal || ''}): TP a ${(d.tp_franges || []).join(', ') || 'cap'}, cobertures aquest mes: ${d.cobertures_mes || 0}`).join('\n')}
REGLES: 1)Cap grup sense cobrir 2)Prioritza sense TP en aquella franja 3)Reparteix equitativament 4)Un docent per franja
Respon NOMÉS JSON: {"proposta":[{"franja":"1a hora","docent":"Nom Cognom","grup_origen":"Xè Y","tp_afectat":false,"motiu":"raó"}],"resum":"frase curta"}`;

  return callClaude([{ role: 'user', content: prompt }], 1000);
}

export async function proposarCoberturaCella(grup, hora, temps, docents) {
  const dl = docents.map(d => `${d.nom} (${d.grup_principal || ''}): TP ${d.tp_franges?.[0] || 'cap'}, cob:${d.cobertures_mes || 0}`).join(', ');
  const prompt = `Proposa UN docent per cobrir ${grup} a ${hora} (${temps}). Docents: ${dl}. Prioritza sense TP i menys cobertures. JSON: {"proposta":[{"franja":"${hora}","docent":"Nom","grup_origen":"${grup}","tp_afectat":false,"motiu":"raó"}],"resum":"frase"}`;
  return callClaude([{ role: 'user', content: prompt }], 400);
}

export async function extractHorariFromPDF(base64) {
  const prompt = `Extreu l'horari del docent d'aquest PDF.
Franges: f1a=9:00-9:30, f1b=9:30-10:00, f2a=10:00-10:30, patiA=10:30-11:00, patiB=11:00-11:30, f3a=11:30-12:00, f3b=12:00-12:30, f4=12:30-15:00(Lliure), f5a=15:00-15:30, f5b=15:30-16:00, f5c=16:00-16:30
Valors: "TP", "Lliure", "Pati", o grup+activitat ("1r A · Lectura")
JSON: {"nom":"Nom","rol":"tutor","grup_principal":"1r A","horari":{"dilluns":{"f1a":"","f1b":"","f2a":"","patiA":"","patiB":"","f3a":"","f3b":"","f4":"Lliure","f5a":"","f5b":"","f5c":""},"dimarts":{},"dimecres":{},"dijous":{},"divendres":{}},"tp_franges":["divendres-f5a"]}`;
  return callClaude([{
    role: 'user',
    content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: prompt },
    ],
  }], 2000);
}
