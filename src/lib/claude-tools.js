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
        if (!cur || cur.trim().toLowerCase() === 'lliure') {
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

  // Identifica casos amb contingut no trivial a la tarda + contingut actual del matí (agrupat per docent,
  // per poder dividir-ho en lots i evitar respostes IA tan llargues que es tallin — JSON invàlid)
  const casosDocents = [];
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

    const redist = [];
    if (tpTarda.length) redist.push(`${d.nom} (${d.grup_principal || d.rol}) — TP tarda a redistribuir: ${tpTarda.join(', ')}${freeNote}`);
    if (tardesRellevants.length) redist.push(`${d.nom} (${d.grup_principal || d.rol}) — tarda: ${tardesRellevants.join(', ')}${freeNote}`);

    const matins = [];
    if (Object.keys(matinsActuals).length) {
      matins.push(`${d.nom} — matí actual: ${Object.entries(matinsActuals).map(([dia, fs]) => `${dia}:${fs.join(',')}`).join(' ')}`);
    }

    if (redist.length || matins.length) casosDocents.push({ nom: d.nom, redist, matins });
  }

  // Si no hi ha redistribució ni matins a revisar, retornar directament
  if (!casosDocents.length) {
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

  // Dividim els docents en lots petits: així cada crida IA genera una resposta curta
  // que no arriba mai a tallar-se per max_tokens (causa de "No s'ha trobat JSON a la resposta IA").
  const MIDA_LOT = 12;
  const lots = [];
  for (let i = 0; i < casosDocents.length; i += MIDA_LOT) lots.push(casosDocents.slice(i, i + MIDA_LOT));

  const errors = [];
  let unLot = 0;
  for (const lot of lots) {
    const redistLines = lot.flatMap(c => c.redist);
    const matinsLines = lot.flatMap(c => c.matins);
    if (!redistLines.length && !matinsLines.length) continue;

    const redistSection = redistLines.length
      ? `CASOS QUE NECESSITEN VALORACIÓ (redistribució tarda → matí):
${redistLines.join('\n')}

`
      : '';
    const matiSection = matinsLines.length
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

Retorna ÚNICAMENT els canvis en JSON, sense cap text fora del JSON, per als ${lot.length} docents llistats més amunt (i només aquests).
Per buidar una franja, usa valor "". Per moure una activitat, usa el valor de l'activitat.
{"canvis":[{"nom":"Nom","dies":{"dilluns":{"f3a":"valor o buit"}}}],"resum":"frase breu dels canvis aplicats"}`;

    try {
      // Lots petits → resposta curta i predictible; marge generós sense arriscar truncament
      const tokensEstimats = Math.min(6000, Math.max(1800, (redistLines.length + matinsLines.length) * 180));
      const aiResult = await callClaude([{ role: 'user', content: prompt }], tokensEstimats);
      for (const c of (aiResult.canvis || [])) {
        if (!canvisMap[c.nom]) canvisMap[c.nom] = {};
        for (const [dia, cells] of Object.entries(c.dies || {})) {
          if (!canvisMap[c.nom][dia]) canvisMap[c.nom][dia] = {};
          Object.assign(canvisMap[c.nom][dia], cells);
        }
      }
      unLot++;
    } catch (e) {
      errors.push(e.message || 'error de IA');
    }
  }

  const n = Object.keys(canvisMap).length;
  let resum;
  if (errors.length && unLot === 0) {
    resum = `S'han buidat les tardes de ${n} docents. (Compactació no aplicada — ${errors[0]}.)`;
  } else if (errors.length) {
    resum = `S'han buidat les tardes de ${n} docents. Compactació aplicada parcialment (${unLot}/${lots.length} lots; ${errors.length} amb error: ${errors[0]}).`;
  } else {
    resum = `Tardes buidades i compactació aplicada (${n} docents).`;
  }
  return { canvis: toCanvis(), canvisAnteriors, resum, tornsPati };
}

// Extreu el PATRÓ ORGANITZATIU (no la transcripció literal) d'un horari intensiu d'un curs anterior.
// Pensat per poder combinar diversos documents i detectar quins criteris es repeteixen any rere any.
export async function extractarReglesIntensiuPDF(base64, mimeType = 'application/pdf') {
  const isImage = mimeType.startsWith('image/');
  const fileBlock = isImage
    ? { type: 'image',    source: { type: 'base64', media_type: mimeType,          data: base64 } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };

  const prompt = `Aquest document és l'horari de jornada intensiva d'un curs ANTERIOR d'una escola. L'objectiu NO és transcriure'l, sinó deduir-ne el criteri organitzatiu general que es pugui reaplicar a un horari nou (amb una altra graella horària i altres docents).

IMPORTANT — ignora completament:
- Hores exactes (ex: "12:15-12:45"): la graella d'enguany és diferent
- Noms de persones concretes (ex: "Marcel", "Geo"): poden haver canviat
- Codis o abreviatures pròpies del document (ex: "L", "P", "EXC"): no es poden reaplicar

Detecta NOMÉS aquests criteris generals (usa null si el document no permet deduir-ho amb confiança):
1. tpTarda: el "Temps Personal" de tarda dels docents, en jornada intensiva, ON es trasllada → "pati" (es fa durant el pati), "mati" (es passa al matí), "eliminar" (desapareix), o null si no es pot deduir
2. noTallers: true si tallers/racons/activitats similars NO es fan en jornada intensiva, false si es mantenen, null si no surt
3. compactar45: true si les sessions es reorganitzen en blocs més llargs (ex: de 30 a 45 min) per encabir el matí, false si es manté la mateixa durada, null si no es pot saber
4. equilibrarEspecialistes: true si sembla que han repartit/equilibrat les sessions dels especialistes (EF, anglès, música...) entre grups, null si no surt
5. notes: 1-2 frases amb altres CRITERIS organitzatius generals i reutilitzables que detectes (mai noms ni hores concretes; ex: "la coordinació de cicle es manté en horari de matí", "els càrrecs directius mantenen el seu horari habitual"). Cadena buida si no n'hi ha.

Retorna ÚNICAMENT JSON sense cap text addicional:
{"tpTarda":"pati|mati|eliminar|null","noTallers":true|false|null,"compactar45":true|false|null,"equilibrarEspecialistes":true|false|null,"notes":"text general o buit","resum":"1 frase descrivint el criteri general d'aquest document"}`;

  return callClaude([{
    role: 'user',
    content: [fileBlock, { type: 'text', text: prompt }],
  }], 700);
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
    ? `La cap d'estudis ha escrit: "${notes.trim()}"\n\n`
    : base64Pdf
      ? `Llegeix el document PDF adjunt i extreu tota la informació sobre absències o activitats especials.\n\n`
      : '';
  const avui = new Date().toISOString().split('T')[0];
  const nomsLine = nomsDocents.length
    ? `\nPersonal del centre (usa SEMPRE el nom exacte d'aquesta llista quan el text en faci referència):\n${nomsDocents.join(', ')}\n`
    : '';
  content.push({
    type: 'text',
    text: `Ets l'assistent de la cap d'estudis d'una escola de primària. Avui és ${avui}.

${notesLine}TASCA: Identifica TOTA persona del centre que avui NO estarà disponible o no podrà cobrir absències. Inclou QUALSEVOL cas:
- Permís personal o sindical (p.ex. "Jorge té un permís avui")
- Malaltia o baixa
- Reunió fora del centre (CRP, inspecció, formació...)
- Sortida o colònies amb alumnes
- Qualsevol altre motiu d'absència o indisponibilitat

REGLES IMPORTANTS:
- Si el text menciona el nom d'algú (fins i tot en minúscules o amb nom abreujat), inclou'l SEMPRE a docentsBlocats.
- Busca el nom a la llista del personal i usa'l exactament. Si no hi és, inclou'l tal com apareix al text.
- Si no s'especifica horari, usa hores="tot el dia".
- Si no s'esmenta cap persona, retorna docentsBlocats=[].${nomsLine}
Camp "ambGrup":
- true → surt AMB alumnes (tutor/especialista acompanyant en sortida)
- false → surt sense alumnes (permís, reunió, formació, malaltia)

Camp "grups_fora": grups que surten físicament del centre (ex: ["3rA","4tA"]). Buit [] si no n'hi ha.

Respon ÚNICAMENT en JSON:
{"titol":"màx 3 paraules","resum":"1-2 frases","docentsBlocats":[{"nom":"Nom Cognom","hores":"tot el dia","ambGrup":false}],"grups_fora":[],"context":"nota breu per a la IA de cobertures","data_inici":"${avui}","data_fi":"${avui}"}`,
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
