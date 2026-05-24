import { FRANJES } from './constants';
import { callClaude } from './claude-api';
import { REGLES_DEFAULT, estatHorari } from './claude-utils';

export async function generarHorarisIntensius(docents, franjes, instruccions, normes) {
  const DIES = ['dilluns','dimarts','dimecres','dijous','divendres'];
  const tardesIds = franjes.filter(f => f.hora === 'Tarda' && !f.lliure).map(f => f.id);
  const matinsIds = franjes.filter(f => !f.lliure && f.hora !== 'Tarda' && f.hora !== 'Dinar').map(f => f.id);

  // PART 1 — Programàtica: buidar totes les tardes (no necessita IA)
  const canvisMap = {};
  for (const d of docents) {
    if (!d.horari) continue;
    for (const dia of DIES) {
      for (const fid of tardesIds) {
        const v = (d.horari[dia] || {})[fid];
        if (v !== undefined && v !== '') {
          if (!canvisMap[d.nom]) canvisMap[d.nom] = {};
          if (!canvisMap[d.nom][dia]) canvisMap[d.nom][dia] = {};
          canvisMap[d.nom][dia][fid] = '';
        }
      }
    }
  }

  const toCanvis = () => Object.entries(canvisMap).map(([nom, dies]) => ({ nom, dies }));

  const totalAmbHorari = docents.filter(d => d.horari).length;

  // PART 2 — IA: només per als casos que necessiten redistribució intel·ligent
  if (!instruccions?.trim()) {
    const n = Object.keys(canvisMap).length;
    const resum = n > 0
      ? `S'han buidat les tardes de ${n} docents (${totalAmbHorari} docents processats).`
      : `Les tardes ja estan buides. S'aplicarà l'horari intensiu als ${totalAmbHorari} docents.`;
    return { canvis: toCanvis(), resum };
  }

  // Identifica casos amb contingut no trivial a la tarda (EF real, TP, suport, etc.)
  // i les franges del matí on aquell docent té espai lliure
  const redistLines = [];
  for (const d of docents) {
    if (!d.horari) continue;
    const tardesRellevants = [];
    const matinsBuits = {};

    for (const dia of DIES) {
      const cells = d.horari[dia] || {};
      // Tardes no trivials (exclou: tallers, càrrec, equip directiu, SIEI interns)
      for (const fid of tardesIds) {
        const v = (cells[fid] || '').trim();
        if (v && !/^(tallers|càrrec|coordinaci|equip direct|lliure)/i.test(v)) {
          tardesRellevants.push(`${dia}/${fid}="${v}"`);
        }
      }
      // Matins lliures o TP (candidats per compactar)
      const buits = matinsIds.filter(fid => {
        const v = (cells[fid] || '').trim();
        return !v || /^tp$/i.test(v);
      });
      if (buits.length) matinsBuits[dia] = buits;
    }

    const tpTarda = (d.tp_franges || []).filter(f => tardesIds.some(t => f.endsWith(t)));
    if (tardesRellevants.length === 0 && tpTarda.length === 0) continue;

    const freeNote = Object.keys(matinsBuits).length
      ? ` | matins lliures/TP: ${Object.entries(matinsBuits).map(([dia, fs]) => `${dia}:${fs.join(',')}`).join(' ')}`
      : ' | sense matins lliures';
    if (tpTarda.length) redistLines.push(`${d.nom} (${d.grup_principal || d.rol}) — TP tarda a redistribuir: ${tpTarda.join(', ')}${freeNote}`);
    if (tardesRellevants.length) redistLines.push(`${d.nom} (${d.grup_principal || d.rol}) — tarda: ${tardesRellevants.join(', ')}${freeNote}`);
  }

  if (redistLines.length === 0) {
    const n = Object.keys(canvisMap).length;
    const resum = n > 0
      ? `S'han buidat les tardes de ${n} docents (${totalAmbHorari} processats, sense casos de redistribució).`
      : `Les tardes ja estan buides. S'aplicarà l'horari intensiu als ${totalAmbHorari} docents.`;
    return { canvis: toCanvis(), resum };
  }

  const prompt = `Jornada intensiva escolar. Les tardes (${tardesIds.join(',')}) ja queden buides per a tothom.
Ara cal decidir si ALGUNES activitats es compacten al matí, seguint les instruccions de la cap d'estudis.

CASOS QUE NECESSITEN VALORACIÓ (docent, contingut de tarda, matins disponibles):
${redistLines.join('\n')}

INSTRUCCIONS DE LA CAP D'ESTUDIS:
${instruccions}

Per a cada cas on calgui moure alguna cosa al matí: indica el docent, el dia, la franja de matí destí i el valor.
Ignora els casos on no cal fer res (Tallers, etc. ja estan resolts).
Retorna ÚNICAMENT els canvis ADDICIONALS al matí en JSON, sense cap text fora del JSON:
{"canvis":[{"nom":"Nom","dies":{"dilluns":{"f3a":"valor mogut"}}}],"resum":"frase breu dels canvis de compactació"}`;

  try {
    const aiResult = await callClaude([{ role: 'user', content: prompt }], 2000);
    for (const c of (aiResult.canvis || [])) {
      if (!canvisMap[c.nom]) canvisMap[c.nom] = {};
      for (const [dia, cells] of Object.entries(c.dies || {})) {
        if (!canvisMap[c.nom][dia]) canvisMap[c.nom][dia] = {};
        Object.assign(canvisMap[c.nom][dia], cells);
      }
    }
    return { canvis: toCanvis(), resum: aiResult.resum || 'Tardes buidades i compactació aplicada.' };
  } catch {
    // Si la IA falla, retorna igualment els canvis programàtics
    const n = Object.keys(canvisMap).length;
    return { canvis: toCanvis(), resum: `S'han buidat les tardes de ${n} docents. (Compactació no aplicada per error de IA.)` };
  }
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

export async function classificarDiariOriol(notes) {
  const avui = new Date().toISOString().split('T')[0];
  const prompt = `Ets l'assistent de la cap d'estudis de l'EE Ca n'Oriol (centre d'educació especial). Avui és ${avui}.

La cap ha escrit:
"${notes.trim()}"

Classifica la informació en tres seccions del document diari "Modificacions Horàries".

ABSENTS — Docents o personal que no és al centre avui (permisos, baixes, reunions que els fan sortir). Format per línia: "Nom (motiu)"
REUNIONS — Reunions al centre i aspectes organitzatius. Format per línia: "HHh: descripció (participants si escau)" o "descripció"
CEEPSIR — Actuacions de suport extern a altres centres (coordinacions, tancaments, reunions CEEPSIR). Format per línia: "HHh a HHh: activitat (persona)"

Si una secció no té informació rellevant retorna null per aquell camp.
Respon ÚNICAMENT JSON sense text addicional:
{"absents":"text multilínia o null","reunions":"text multilínia o null","ceepsir":"text multilínia o null"}`;
  return callClaude([{ role: 'user', content: prompt }], 600);
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
