import { FRANJES } from './constants';
import { callClaude } from './claude-api';
import { REGLES_DEFAULT, estatHorari } from './claude-utils';

export async function generarHorarisIntensius(docents, franjes, instruccions, normes) {
  const tardesIds = franjes.filter(f => f.hora === 'Tarda' && !f.lliure).map(f => f.id);

  // Resum compacte dels horaris actuals (només canvis respecte "buit")
  const resumDocents = docents
    .filter(d => d.horari && Object.keys(d.horari).length > 0)
    .map(d => {
      const dies = {};
      Object.entries(d.horari).forEach(([dia, cells]) => {
        const valors = {};
        Object.entries(cells || {}).forEach(([fid, val]) => {
          if (val && val !== '' && val !== 'Lliure') valors[fid] = val;
        });
        if (Object.keys(valors).length) dies[dia] = valors;
      });
      return `${d.nom} (${d.grup_principal || d.rol}): ${JSON.stringify(dies)}`;
    }).join('\n');

  const tardesStr = tardesIds.join(', ');
  const normesTxt = (normes || '').trim();

  const prompt = `Ets l'assistent d'una cap d'estudis d'escola de primària. Ha de generar l'horari de JORNADA INTENSIVA per a tot el claustre.

FRANGES DE TARDA (les que NO existeixen en jornada intensiva): ${tardesStr}

HORARIS ACTUALS:
${resumDocents}

INSTRUCCIONS DE LA CAP D'ESTUDIS:
${instruccions || 'Elimina totes les tardes. Redistribueix les activitats que calgui seguint les normes.'}

NORMES DEL CENTRE:
${normesTxt || 'Repartiment equitatiu. Prioritzar disponibles.'}

TASCA: Genera els canvis necessaris a cada horari per a la jornada intensiva.
- Les franges de tarda (${tardesStr}) han de quedar buides ("") per a tots els docents.
- Si una activitat de tarda cal redistribuir-la al matí, indica on va.
- Retorna ÚNICAMENT els docents amb canvis (no els que no canvien res).
- Per a cada docent, retorna ÚNICAMENT les cel·les que canvien de valor.

JSON (estrictament):
{"canvis":[{"nom":"Nom del docent","dies":{"dilluns":{"f5a":"","f5b":"","f5c":""}}}],"resum":"Descripció breu dels canvis"}`;

  return callClaude([{ role: 'user', content: prompt }], 4000);
}

export async function proposarCoberturaCella(grup, hora, fid, temps, docents, normes) {
  const regles  = (normes || '').trim() || REGLES_DEFAULT;
  const dia     = ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][new Date().getDay()];
  const dl = docents.map(d => {
    const { text } = estatHorari(d.horari?.[dia]?.[fid]);
    return `${d.nom} (${d.grup_principal || '?'}): ${text}, cob:${d.cobertures_mes || 0}`;
  }).join(' | ');
  const diaLabel = dia.charAt(0).toUpperCase() + dia.slice(1);
  const prompt = `Proposa UN docent per cobrir el grup ${grup} a ${hora} (${temps}). Dia: ${diaLabel}. Tria preferentment els marcats com "lliure" a l'horari de ${diaLabel}. Evita els marcats com "ocupat". Normes: ${regles}. Docents (horari ${diaLabel}): ${dl}. JSON: {"proposta":[{"franja":"${hora}","docent":"Nom","grup_origen":"${grup}","tp_afectat":false,"motiu":"raó"}],"resum":"frase"}`;
  return callClaude([{ role: 'user', content: prompt }], 500);
}

export async function analitzarInfoExtra(notes, base64Pdf, nomsDocents = []) {
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
  const nomsLine = nomsDocents.length
    ? `\nLlista de docents del centre (usa SEMPRE el nom exacte d'aquesta llista, fent coincidir amb el nom del document):\n${nomsDocents.join(', ')}\n`
    : '';
  content.push({
    type: 'text',
    text: `Ets l'assistent d'un centre educatiu de primària. Analitza la informació sobre l'activitat o esdeveniment especial.
${notesLine}La teva tasca:
1. Identificar quins docents NO poden cobrir absències (sortida, colònies, reunió externa, jornada, etc.) i en quins horaris aproximats (p.ex. "9:00-12:30" o "tot el dia").
2. Detectar les dates de l'activitat: data_inici i data_fi en format YYYY-MM-DD. Si és d'un sol dia usa la data d'avui (${avui}) per ambdues. Si dura diversos dies, determina les dates exactes del document.${nomsLine}
Per cada docent identificat, troba el nom més semblant de la llista del centre i usa'l exactament. Si no hi ha noms concrets, retorna llista buida.
IMPORTANT — camp "ambGrup" per a cada docent:
- ambGrup: true → surt AMB els alumnes de la sortida/excursió (tutor o especialista acompanyant). Les franges amb grups que van de sortida no necessiten cobertura. Però un especialista pot tenir altres grups al centre que sí cal cobrir.
- ambGrup: false → surt SENSE cap grup d'alumnes (reunió CRP, formació, permís). El seu grup queda descobert.

Camp "grups_fora" (a nivell d'entrada, no per docent): llista dels codis de grups que surten físicament del centre (ex: ["3rA","3rB","4tA","4tB"]). Buit [] si no hi ha grups fora (reunions, formacions...). Serveix per detectar quines franges dels especialistes acompanyants queden cobertes pels grups absents.

Respon ÚNICAMENT en JSON sense cap altre text:
{"titol":"2-3 paraules màx (ex: 'Sortida 1r-2n', 'Seminari CRP', 'Reunió externa')","resum":"descripció breu (1-2 frases)","docentsBlocats":[{"nom":"Nom Cognom","hores":"9:00-12:30","ambGrup":false}],"grups_fora":[],"context":"instrucció curta per a la IA de cobertures","data_inici":"${avui}","data_fi":"${avui}"}`,
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

  const isImage   = mimeType.startsWith('image/');
  const fileBlock = isImage
    ? { type: 'image',    source: { type: 'base64', media_type: mimeType,          data: base64 } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };

  return callClaude([{
    role: 'user',
    content: [fileBlock, { type: 'text', text: prompt }],
  }], 2000);
}
