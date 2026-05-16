import { FRANJES, FRANJES_ORIOL } from './constants';
import { callClaudeRaw } from './claude-api';

export function construirContextXat(escola, docents, normes, isOriol, absenciaContext = null, docentsBlocats = [], baixes = [], decisionsPassades = [], contextIA = '', frangesIA = null) {
  const FRANJES_ACT = frangesIA || (isOriol ? FRANJES_ORIOL : FRANJES);
  const jefaNom     = isOriol ? 'Mireia' : 'Veronica';
  const dies        = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres'];
  const diesShort   = { dilluns: 'dl', dimarts: 'dm', dimecres: 'dc', dijous: 'dj', divendres: 'dv' };
  const normesTxt   = (normes || '').trim() || 'No hi ha normes específiques definides.';
  const franjesList = FRANJES_ACT.filter(f => !f.lliure);

  const horarisDesc = docents.map(d => {
    const diesTxt = dies.map(dia => {
      const h = d.horari?.[dia];
      if (!h) return `  ${diesShort[dia]}: (sense horari)`;
      const vals = franjesList.map(f => `${f.id}=${h[f.id] || '_'}`).join(' | ');
      return `  ${diesShort[dia]}: ${vals}`;
    }).join('\n');
    return `${d.nom} (${d.grup_principal || 'Especialista'}, cob_mes=${d.cobertures_mes || 0}):\n${diesTxt}`;
  }).join('\n\n');

  const _estructuraFallback = isOriol
    ? `CEE Ca N'Oriol — Centre d'Educació Especial\nCicle Infantil-Primària: G1-G6, MxI | Cicle Secundària: G7-G14\nRols: MEE, PAE, MALL, EVIP, MUS, ESTIM`
    : `CEIP Rivo Rubeo — Centre d'Educació Infantil i Primària\nGrups: I3-I5, 1r-6è | Cicles: Petits/Mitjans/Grans`;
  const estructura = (contextIA || '').trim() || _estructuraFallback;

  const frangesDesc = franjesList.map(f => `${f.id}=${f.sub}`).join(' | ');

  const absDesc = absenciaContext
    ? `\n--- ABSÈNCIA EN CONTEXT ---
Docent absent: ${absenciaContext.nom}
Data: ${absenciaContext.data || 'avui'}${absenciaContext.dia ? ` (${absenciaContext.dia})` : ''}
Franges afectades: ${(absenciaContext.frangesIds || []).join(', ')}
Motiu: ${absenciaContext.motiu || 'no especificat'}`
    : '';

  const MESOS_CTX = ['gener','febrer','març','abril','maig','juny','juliol','agost','setembre','octubre','novembre','desembre'];
  const decisionsDesc = decisionsPassades.length
    ? `\n--- DECISIONS APROVADES (referència) ---\nCobertures aprovades per la cap d'estudis — usa-les de guia per a propostes similars:\n${
        decisionsPassades.map(d => {
          const dt = d.data ? new Date(d.data + 'T12:00:00') : null;
          const dataLabel = dt ? `${dt.getDate()} de ${MESOS_CTX[dt.getMonth()]}` : d.data || '';
          const linies = (d.proposta || []).map(p =>
            `  · ${p.hores || p.franja}: ${p.docent}${p.motiu ? ` — ${p.motiu}` : ''}`
          ).join('\n');
          const corrText = d.correccions ? `\n  Instruccions de la cap d'estudis: "${d.correccions}"` : '';
          return `Quan ${d.absent} ha faltat (${d.dia || ''} ${dataLabel}):\n${linies}${corrText}\n  (Aprovat per la cap d'estudis)`;
        }).join('\n\n')
      }`
    : '';

  return `Ets l'assistent expert en gestió de cobertures de ${escola?.nom || 'HORARIA'}.
La cap d'estudis ${jefaNom} et fa consultes sobre cobertures, disponibilitat de docents i organització.
Respon sempre en català. Respostes CURTES i DIRECTES, sense introduccions ni explicacions llargues.

FORMAT DE RESPOSTA OBLIGATORI quan proposes cobertura:
PROHIBIT escriure anàlisi llarg. Si cal aclarir alguna cosa, MÀXIM 2 línies breus abans de la graella.
Vés DIRECTAMENT a la graella. L'últim bloc ha de ser SEMPRE aquesta graella exacta (res després):

📋 COBERTURA [ABSENT] — [DIA] [DATA]
══════════════════════════════════════
[hora ]  │ [Docent         ]  │ [motiu curt         ]  [✓/⚠]
[hora ]  │ ── pati ──         │ No cal cobrir
[hora ]  │ [Docent         ]  │ [motiu curt         ]  [✓/⚠]
══════════════════════════════════════
[conclusió: p.ex. "Cobertura completa · Sense deutes TP"]

<proposta>[{"docent":"Nom","franges_ids":["f1a","f1b"],"hores":"9:00–10:00","grup_origen":"GX","tp_afectat":false,"motiu":"motiu curt"}]</proposta>

REGLES DE LA GRAELLA:
- Inclou TOTES les franges de l'absència, fins les de pati o ja cobertes.
- ✓ = no genera TP | ⚠TP = genera deute de TP
- Per pati o franja ja coberta: usa "── pati ──" o "── ja cobert ──" com a docent.
- Intenta alinear les columnes visualment (espais).
- <proposta> és SEMPRE l'últim element. Mai res després.
- <proposta> conté NOMÉS les franges assignades a un docent real (no pati ni ja cobert).
- IMPORTANT: fins i tot quan no cal cap cobertura, genera SEMPRE la graella i acaba amb <proposta>[]</proposta> perquè la cap d'estudis pugui tancar l'avís.

⛔ REGLA ABSOLUTA — PRIORITAT MÀXIMA PER SOBRE DE TOTES LES NORMES DEL CENTRE:

MIG GRUP / DESDOBLAMENT:
Si el valor de l'horari conté "mig grup", "MIG GRUP", "/" o qualsevol indicació de desdoblament:
→ El desdoblament NO es fa. La tutora del grup assumeix el grup COMPLET.
→ MAI proposes cap docent per cobrir aquesta franja. MAI.
→ Usa "── tutor assumeix grup complet ──" a la graella. ✓
→ Aquesta regla guanya sempre, per sobre de qualsevol altra norma numerada del centre.

Exemples OBLIGATORIS d'aplicació:
• "3rA · Anglès MIG GRUP" → Raquel (tutora 3rA) assumeix 3rA complet. NO cal cobrir. ✓
• "1rA · ORAL Anglès / Mig grup" → Montse (tutora 1rA) assumeix 1rA complet. NO cal cobrir. ✓
• "2nB · Música mig grup" → tutor 2nB assumeix 2nB complet. NO cal cobrir. ✓

SUPORT (docent sense grup propi):
Si falta el docent de suport: el tutor de l'aula assumeix sol. NO cal cobrir.

GRUP FORA DEL CENTRE (sortida, colònies):
Si el grup és fora del centre: no cal cobrir les franges d'aquell grup.

--- NORMES DEL CENTRE ---
${normesTxt}

--- ESTRUCTURA ---
${estructura}

--- FRANGES HORÀRIES ---
${frangesDesc}
(Valor "_" o buit = docent AL CENTRE disponible | "Lliure" = absent/fora del centre | "Suport X" = ASSIGNAT al grup X, NO pot deixar aquells alumnes per cobrir altres grups)

--- HORARIS DE TOTS ELS DOCENTS ---
${horarisDesc}
${absDesc}${baixes?.length ? `\n--- BAIXES LLARGUES (tot el curs) ---\n${baixes.map(b => `  · ${b.absent} (de baixa) → cobert per ${b.substitut}${b.notes ? ` (${b.notes})` : ''}. NO proposar ${b.absent}.`).join('\n')}` : ''}${docentsBlocats.length ? `\n--- DOCENTS FORA AVUI (activitat especial) ---\n${docentsBlocats.map(b => `  · ${b.nom}: absent ${b.hores || 'tot el dia'}`).join('\n')}\nNO els proposis.` : ''}${decisionsDesc}`;
}

// Versió ràpida del botó IA: mateixa lògica que el chatbot però sense UI
export async function proposarCoberturaViaChat(absent, frangesIds, docents, normes, data, isOriol, infoExtraCombinada, baixes, escola, contextIA = '', frangesIA = null) {
  const FRANJES_ACT = frangesIA || (isOriol ? FRANJES_ORIOL : FRANJES);
  const SCHOOL_F = FRANJES_ACT.filter(f => !f.lliure);
  const dateObj = data ? new Date(data + 'T12:00:00') : null;
  const dia = dateObj
    ? ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][dateObj.getDay()]
    : null;
  const MESOS = ['gener','febrer','març','abril','maig','juny','juliol','agost','setembre','octubre','novembre','desembre'];
  const dataStr = dateObj ? `${dateObj.getDate()} de ${MESOS[dateObj.getMonth()]}` : '';
  const esTotElDia = frangesIds.length >= SCHOOL_F.length;
  const frangesStr = esTotElDia
    ? 'tot el dia'
    : frangesIds.map(fid => SCHOOL_F.find(f => f.id === fid)?.sub || fid).join(', ');

  const docentsBlocats = infoExtraCombinada?.docentsBlocats || [];
  const systemCtx = construirContextXat(
    escola, docents, normes, isOriol,
    { nom: absent, data, dia, frangesIds, motiu: '' },
    docentsBlocats, baixes || [], [], contextIA, frangesIA
  );
  const userMsg = `Proposa una cobertura per a ${absent}, ${frangesStr}${dia ? ` del ${dia}` : ''}${dataStr ? ` ${dataStr}` : ''}.`;

  const raw = await xatIA(systemCtx, [{ role: 'user', content: userMsg }], 1500);

  const m = /<proposta>([\s\S]*?)<\/proposta>/i.exec(raw);
  if (!m) throw new Error('La IA no ha retornat una proposta. Torna-ho a intentar o usa Horaria 💬.');
  let proposta;
  try { proposta = JSON.parse(m[1].trim()); }
  catch { throw new Error('Error llegint la proposta. Torna-ho a intentar o usa Horaria 💬.'); }
  if (!Array.isArray(proposta) || proposta.length === 0)
    throw new Error('La proposta és buida. Usa Horaria 💬 per a casos especials.');

  const resum = raw.replace(/<proposta>[\s\S]*?<\/proposta>/gi, '').trim();
  return { proposta, resum };
}

export async function xatIA(systemContext, conversationMessages, maxTokens = 3500) {
  const messages = [
    { role: 'user',      content: systemContext },
    { role: 'assistant', content: 'Entès. Conec tots els horaris i normes del centre. Com et puc ajudar?' },
    ...conversationMessages,
  ];
  return callClaudeRaw(messages, maxTokens);
}
