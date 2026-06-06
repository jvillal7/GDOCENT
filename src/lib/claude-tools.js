import { FRANJES } from './constants';
import { callClaude } from './claude-api';
import { REGLES_DEFAULT, estatHorari } from './claude-utils';

// Nova signatura amb regles estructurades i suport a grups_curriculum
export async function generarHorarisIntensius(docents, franjes, regles, normes, grups_curriculum) {
  const DIES = ['dilluns','dimarts','dimecres','dijous','divendres'];
  const tardesIds = franjes.filter(f => f.hora === 'Tarda' && !f.lliure).map(f => f.id);
  const matinsIds = franjes.filter(f => !f.lliure && f.hora !== 'Tarda' && f.hora !== 'Dinar' && !f.patio).map(f => f.id);
  const patioIds  = franjes.filter(f => f.patio).map(f => f.id);

  // Suport a crida antiga (string instruccions) — compatibilitat enrere
  let reglesObj;
  if (typeof regles === 'string' || regles === null || regles === undefined) {
    reglesObj = { tpTarda: 'eliminar', instruccionsLliures: regles || '', generarTornsPati: false, especialistesReduccio: false };
  } else {
    reglesObj = { tpTarda: 'eliminar', generarTornsPati: false, especialistesReduccio: false, instruccionsLliures: '', ...regles };
  }

  // PART 1 — Programàtica: buidar totes les tardes i gestionar TP
  const canvisMap = {};      // nom → dia → fid → nouValor
  const canvisAnteriors = {}; // nom → dia → fid → valorOriginal (per diff visual)

  for (const d of docents) {
    if (!d.horari) continue;

    for (const dia of DIES) {
      for (const fid of tardesIds) {
        const v = (d.horari[dia] || {})[fid];
        if (v === undefined) continue;

        const isTP = /^tp\b/i.test((v || '').trim()) || (d.tp_franges || []).includes(`${dia}-${fid}`);

        if (isTP) {
          // Gestionar TP de tarda segons la regla
          if (reglesObj.tpTarda === 'pati') {
            // Buscar primera franja de pati del mateix dia on el docent estigui lliure
            const patioLliure = patioIds.find(pid => {
              const pv = (d.horari[dia] || {})[pid] || '';
              return !pv || pv.toLowerCase() === 'lliure';
            });
            // Registrar canvi original
            if (!canvisAnteriors[d.nom]) canvisAnteriors[d.nom] = {};
            if (!canvisAnteriors[d.nom][dia]) canvisAnteriors[d.nom][dia] = {};
            canvisAnteriors[d.nom][dia][fid] = v;

            if (!canvisMap[d.nom]) canvisMap[d.nom] = {};
            if (!canvisMap[d.nom][dia]) canvisMap[d.nom][dia] = {};
            canvisMap[d.nom][dia][fid] = ''; // buidar tarda

            if (patioLliure) {
              canvisAnteriors[d.nom][dia][patioLliure] = (d.horari[dia] || {})[patioLliure] || '';
              canvisMap[d.nom][dia][patioLliure] = 'Pati';
            }
          } else if (reglesObj.tpTarda === 'mati') {
            // Buscar primera franja de matí lliure del dia
            const matinLliure = matinsIds.find(mid => {
              const mv = (d.horari[dia] || {})[mid] || '';
              return !mv || mv.toLowerCase() === 'lliure' || /^tp\b/i.test(mv);
            });
            if (!canvisAnteriors[d.nom]) canvisAnteriors[d.nom] = {};
            if (!canvisAnteriors[d.nom][dia]) canvisAnteriors[d.nom][dia] = {};
            canvisAnteriors[d.nom][dia][fid] = v;
            if (!canvisMap[d.nom]) canvisMap[d.nom] = {};
            if (!canvisMap[d.nom][dia]) canvisMap[d.nom][dia] = {};
            canvisMap[d.nom][dia][fid] = '';

            if (matinLliure) {
              canvisAnteriors[d.nom][dia][matinLliure] = (d.horari[dia] || {})[matinLliure] || '';
              canvisMap[d.nom][dia][matinLliure] = 'TP';
            }
          } else {
            // eliminar: buidar
            if (v !== '') {
              if (!canvisAnteriors[d.nom]) canvisAnteriors[d.nom] = {};
              if (!canvisAnteriors[d.nom][dia]) canvisAnteriors[d.nom][dia] = {};
              canvisAnteriors[d.nom][dia][fid] = v;
              if (!canvisMap[d.nom]) canvisMap[d.nom] = {};
              if (!canvisMap[d.nom][dia]) canvisMap[d.nom][dia] = {};
              canvisMap[d.nom][dia][fid] = '';
            }
          }
        } else if (v !== '') {
          // Buidar tarda no-TP
          if (!canvisAnteriors[d.nom]) canvisAnteriors[d.nom] = {};
          if (!canvisAnteriors[d.nom][dia]) canvisAnteriors[d.nom][dia] = {};
          canvisAnteriors[d.nom][dia][fid] = v;
          if (!canvisMap[d.nom]) canvisMap[d.nom] = {};
          if (!canvisMap[d.nom][dia]) canvisMap[d.nom][dia] = {};
          canvisMap[d.nom][dia][fid] = '';
        }
      }
    }
  }

  // Enforce minimum weekly morning TP: clearing tardes may have removed all TP;
  // ensure each teacher has at least tpMinsMin in morning slots before the AI runs.
  for (const d of docents) {
    if (!d.horari || !d.tp_franges?.length) continue;
    const jornada = d.jornada || 'sencera';
    const tpMinsMin = jornada === 'mitja' ? 30 : 60;
    let morningTpMins = 0;
    for (const dia of DIES) {
      for (const fid of matinsIds) {
        const changed = canvisMap[d.nom]?.[dia]?.[fid];
        const val = changed !== undefined ? changed : ((d.horari[dia] || {})[fid] || '');
        if (/^tp\b/i.test((val || '').trim())) morningTpMins += 30;
      }
    }
    if (morningTpMins >= tpMinsMin) continue;
    let slotsNeeded = Math.ceil((tpMinsMin - morningTpMins) / 30);
    outer: for (const dia of DIES) {
      for (const fid of matinsIds) {
        if (slotsNeeded <= 0) break outer;
        const changed = canvisMap[d.nom]?.[dia]?.[fid];
        const orig = (d.horari[dia] || {})[fid] || '';
        const cur = changed !== undefined ? changed : orig;
        if (!cur) {
          if (!canvisMap[d.nom]) canvisMap[d.nom] = {};
          if (!canvisMap[d.nom][dia]) canvisMap[d.nom][dia] = {};
          canvisMap[d.nom][dia][fid] = 'TP';
          if (!canvisAnteriors[d.nom]) canvisAnteriors[d.nom] = {};
          if (!canvisAnteriors[d.nom][dia]) canvisAnteriors[d.nom][dia] = {};
          if (canvisAnteriors[d.nom][dia][fid] === undefined) canvisAnteriors[d.nom][dia][fid] = orig;
          slotsNeeded--;
        }
      }
    }
  }

  const toCanvis = () => Object.entries(canvisMap).map(([nom, dies]) => ({ nom, dies }));
  const totalAmbHorari = docents.filter(d => d.horari).length;

  // PART 2 — Generar torns de pati (si s'ha demanat)
  let tornsPati = null;
  if (reglesObj.generarTornsPati && patioIds.length > 0) {
    tornsPati = {};
    for (const dia of DIES) {
      tornsPati[dia] = {};
      for (const pid of patioIds) {
        tornsPati[dia][pid] = [];
        for (const d of docents) {
          if (!d.horari) continue;
          // Aplicar canvis pendents
          const vFinal = canvisMap[d.nom]?.[dia]?.[pid] ?? (d.horari[dia] || {})[pid] ?? '';
          const isEmpty = !vFinal || vFinal.toLowerCase() === 'lliure';
          if (isEmpty) tornsPati[dia][pid].push(d.nom);
        }
      }
    }
  }

  // PART 3 — IA: redistribució intel·ligent si hi ha instruccions lliures
  const instruccions = reglesObj.instruccionsLliures || '';
  if (!instruccions.trim()) {
    const n = Object.keys(canvisMap).length;
    const resum = n > 0
      ? `S'han buidat les tardes de ${n} docents (${totalAmbHorari} docents processats).`
      : `Les tardes ja estan buides. S'aplicarà l'horari intensiu als ${totalAmbHorari} docents.`;
    return { canvis: toCanvis(), canvisAnteriors, resum, tornsPati };
  }

  // Identifica casos amb contingut no trivial a la tarda + contingut actual del matí
  const redistLines = [];
  const matinsLines = []; // contingut del matí per detectar activitats a eliminar
  for (const d of docents) {
    if (!d.horari) continue;
    const tardesRellevants = [];
    const matinsBuits = {};
    const matinsActuals = {};

    for (const dia of DIES) {
      const cells = d.horari[dia] || {};
      for (const fid of tardesIds) {
        const v = (cells[fid] || '').trim();
        if (v && !/^(tallers|càrrec|coordinaci|equip direct|lliure)/i.test(v)) {
          tardesRellevants.push(`${dia}/${fid}="${v}"`);
        }
      }
      const buits = matinsIds.filter(fid => {
        const v = (cells[fid] || '').trim();
        return !v || /^tp$/i.test(v);
      });
      if (buits.length) matinsBuits[dia] = buits;
      // Recollir contingut no trivial del matí
      const matContent = matinsIds
        .map(fid => { const v = (cells[fid] || '').trim(); return v && !/^(lliure|tp)$/i.test(v) ? `${fid}="${v}"` : null; })
        .filter(Boolean);
      if (matContent.length) matinsActuals[dia] = matContent;
    }

    const tpTarda = (d.tp_franges || []).filter(f => tardesIds.some(t => f.endsWith(t)));

    const freeNote = Object.keys(matinsBuits).length
      ? ` | matins lliures/TP: ${Object.entries(matinsBuits).map(([dia, fs]) => `${dia}:${fs.join(',')}`).join(' ')}`
      : ' | sense matins lliures';
    if (tpTarda.length) redistLines.push(`${d.nom} (${d.grup_principal || d.rol}) — TP tarda a redistribuir: ${tpTarda.join(', ')}${freeNote}`);
    if (tardesRellevants.length) redistLines.push(`${d.nom} (${d.grup_principal || d.rol}) — tarda: ${tardesRellevants.join(', ')}${freeNote}`);

    if (Object.keys(matinsActuals).length) {
      matinsLines.push(`${d.nom} — matí actual: ${Object.entries(matinsActuals).map(([dia, fs]) => `${dia}:${fs.join(',')}`).join(' ')}`);
    }
  }

  // Si no hi ha redistribució ni matins a revisar, retornar directament
  const hasRedist = redistLines.length > 0;
  const hasMati = matinsLines.length > 0;
  if (!hasRedist && !hasMati) {
    const n = Object.keys(canvisMap).length;
    const resum = n > 0
      ? `S'han buidat les tardes de ${n} docents (${totalAmbHorari} processats, sense casos de redistribució).`
      : `Les tardes ja estan buides. S'aplicarà l'horari intensiu als ${totalAmbHorari} docents.`;
    return { canvis: toCanvis(), canvisAnteriors, resum, tornsPati };
  }

  // Context de currículum per grup (si s'ha passat)
  const curriculumContext = grups_curriculum && Object.keys(grups_curriculum).length
    ? `\nCONTEXT CURRICULAR DELS GRUPS:\n${Object.entries(grups_curriculum).map(([g, txt]) => {
        const s = typeof txt === 'string' ? txt : JSON.stringify(txt);
        return `${g}: ${(s || '').slice(0, 300)}`;
      }).join('\n')}`
    : '';

  const redistSection = hasRedist
    ? `CASOS QUE NECESSITEN VALORACIÓ (redistribució tarda → matí):
${redistLines.join('\n')}

`
    : '';

  const matiSection = hasMati
    ? `CONTINGUT ACTUAL DEL MATÍ (per si cal eliminar activitats que no es fan en intensiva):
${matinsLines.join('\n')}

`
    : '';

  const prompt = `Jornada intensiva escolar. Les tardes (${tardesIds.join(',')}) ja queden buides per a tothom.
Tasques a fer:
1. Per als casos de redistribució: mou al matí les activitats que calgui, seguint les instruccions.
2. Per al contingut del matí: si les instruccions diuen que alguna activitat NO es fa en jornada intensiva (ex: "Tallers", "Racons", etc.), genera canvis que la buiden (valor "") de les franges del matí on aparegui.

${redistSection}${matiSection}INSTRUCCIONS DE LA CAP D'ESTUDIS:
${instruccions}${curriculumContext}

Retorna ÚNICAMENT els canvis en JSON, sense cap text fora del JSON.
Per buidar una franja, usa valor "". Per moure una activitat, usa el valor de l'activitat.
{"canvis":[{"nom":"Nom","dies":{"dilluns":{"f3a":"valor o buit"}}}],"resum":"frase breu dels canvis aplicats"}`;

  try {
    const aiResult = await callClaude([{ role: 'user', content: prompt }], 2000);
    for (const c of (aiResult.canvis || [])) {
      if (!canvisMap[c.nom]) canvisMap[c.nom] = {};
      for (const [dia, cells] of Object.entries(c.dies || {})) {
        if (!canvisMap[c.nom][dia]) canvisMap[c.nom][dia] = {};
        Object.assign(canvisMap[c.nom][dia], cells);
      }
    }
    return { canvis: toCanvis(), canvisAnteriors, resum: aiResult.resum || 'Tardes buidades i compactació aplicada.', tornsPati };
  } catch {
    const n = Object.keys(canvisMap).length;
    return { canvis: toCanvis(), canvisAnteriors, resum: `S'han buidat les tardes de ${n} docents. (Compactació no aplicada per error de IA.)`, tornsPati };
  }
}

// Extreu regles d'un horari intensiu de l'any passat (PDF o imatge)
export async function extractarReglesIntensiuPDF(base64, mimeType = 'application/pdf') {
  const isImage = mimeType.startsWith('image/');
  const fileBlock = isImage
    ? { type: 'image',    source: { type: 'base64', media_type: mimeType,          data: base64 } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };

  const prompt = `Analitza aquest horari intensiu d'una escola i extreu les regles que s'apliquen.
Fixa't en:
1. Si el TP de tarda s'ha mogut al pati, al matí, o s'ha eliminat
2. Si les tardes estan totes buides
3. Si hi ha instruccions especials per als especialistes
4. Qualsevol altra regla o observació rellevant

Retorna ÚNICAMENT JSON sense cap text addicional:
{"tpTarda":"pati|mati|eliminar","especialistesReduccio":true|false,"instruccionsLliures":"text opcional amb regles especials detectades o buit","resum":"descripció breu de les regles detectades"}`;

  return callClaude([{
    role: 'user',
    content: [fileBlock, { type: 'text', text: prompt }],
  }], 800);
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
  const diaTemplate = JSON.stringify(
    franjes.reduce((acc, f) => ({ ...acc, [f.id]: f.lliure ? 'Lliure' : '' }), {})
  );
  const tpExId = franjes.filter(f => !f.lliure && !f.patio).slice(-1)[0]?.id || franjes[0]?.id;

  // Taula de correspondència hora → id (format bullet list per màxima claredat)
  const franjaTable = franjes
    .map(f => `  ${f.sub.padEnd(13)}→  ${f.id}${f.lliure ? '  [Dinar — sempre "Lliure"]' : f.patio ? '  (pati)' : ''}`)
    .join('\n');

  // Agrupació per períodes d'1h (parelles consecutives de 30 min que no siguin pati/lliure)
  const actives = franjes.filter(f => !f.lliure && !f.patio);
  const parelles = [];
  for (let i = 0; i < actives.length - 1; i++) {
    parelles.push(`${actives[i].id} + ${actives[i+1].id}`);
    i++; // salt de 2 en 2
  }
  const exempleParella = parelles[0] || `${actives[0]?.id} + ${actives[1]?.id}`;
  const exempleParellaSub = actives[0] ? `${actives[0].sub.split('–')[0]}–${actives[1]?.sub?.split('–')[1] || ''}` : '';

  const prompt = `Extreu l'horari setmanal del docent d'aquest document. Llegeix-lo amb atenció i omple cada franja de 30 minuts amb el valor correcte.

CORRESPONDÈNCIA EXACTA hora → ID de franja:
${franjaTable}

⚠️ REGLA DURADA — és la més important per evitar errors d'assignació:
• Classe de 30 min (ex: ${actives[0]?.sub}) → omple NOMÉS la franja d'aquells 30 min (ex: ${actives[0]?.id})
• Classe d'1h (ex: ${exempleParellaSub}) → omple les DUES franges de 30 min (ex: ${exempleParella} = mateix valor)
• Classe de 90 min → omple les TRES franges de 30 min amb el mateix valor
• Si el document no indica la durada exacta i sembla una classe normal, tracta-la com a 1h i omple les dues franges corresponents

VALORS PERMESOS — usa'ls exactament:
• "" (buit) → docent al centre però sense classe assignada (disponible per cobrir)
• "Lliure" → docent absent/fora del centre aquell dia sencer. MAI per buits puntuals.
• "TP" → Treball Personal (al centre, no pot cobrir)
• "Pati" → Vigilància de pati
• "GX · Matèria" → Classe amb grup (ex: "3rA · Matemàtiques", "I4 · Psicomotricitat")
• "Tutoria GX" → Tutoria (ex: "Tutoria 2nB")
• "Suport GX" → Suport dins l'aula (ex: "Suport 1rA", "Suport SIEI")
• "MEE" / "MESI" → Suport de mestre d'educació especial
• "coordinació" → Coordinació de cicle o equip directiu
• "càrrec X" → Càrrec (ex: "càrrec direcció", "càrrec secretaria")
• "Racons X" → Sessió de racons (ex: "Racons I3")
• "CEEPSIR" → Docent fora del centre (no disponible per cobrir)
• "Piscina" → Activitat aquàtica fora del centre (no disponible)

JSON exacte a retornar (sense cap text fora del JSON):
{"nom":"Nom Cognom","rol":"tutor","grup_principal":"G1","horari":{"dilluns":${diaTemplate},"dimarts":${diaTemplate},"dimecres":${diaTemplate},"dijous":${diaTemplate},"divendres":${diaTemplate}},"tp_franges":["divendres-${tpExId}"]}`;

  if (mimeType === 'text/plain') {
    return callClaude([{
      role: 'user',
      content: [{ type: 'text', text: `${prompt}\n\nCONTINGUT DE L'ARXIU WORD:\n${base64}` }],
    }], 2500);
  }

  const isImage   = mimeType.startsWith('image/');
  const fileBlock = isImage
    ? { type: 'image',    source: { type: 'base64', media_type: mimeType,          data: base64 } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };

  return callClaude([{
    role: 'user',
    content: [fileBlock, { type: 'text', text: prompt }],
  }], 2500);
}
