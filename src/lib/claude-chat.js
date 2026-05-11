import { FRANJES, FRANJES_ORIOL } from './constants';
import { callClaudeRaw } from './claude-api';

export function construirContextXat(escola, docents, normes, isOriol, absenciaContext = null) {
  const FRANJES_ACT = isOriol ? FRANJES_ORIOL : FRANJES;
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

  const estructura = isOriol
    ? `CEE Ca N'Oriol — Centre d'Educació Especial
Grups: G1–G8
Rols: MEE (mestre educació especial), PAE (mai cobertura independent), EVIP, MALL, ESTIM, MUS
CEEPSIR/Piscina a l'horari = fora del centre, no disponible`
    : `CEIP Rivo Rubeo — Centre d'Educació Infantil i Primària
Grups: I3A, I3B, I4A, I4B, I5A, I5B, 1rA, 1rB, 2nA, 2nB, 3rA, 3rB, 4tA, 4tB, 5eA, 5eB, 6eA, 6eB
Cicles: Petits (I3-I5) | Mitjans (1r-3r) | Grans (4t-6è)
Coordinadors: Lidia (Petits), Lorena (Mitjans), Chema (Grans)
Alumnes SIEI (no cobribles): Theo, Sebas, Tyler, Pol, Aaron, Mohamed, Claudia, Maxim, Miranda, Adam`;

  const frangesDesc = franjesList.map(f => `${f.id}=${f.sub}`).join(' | ');

  const absDesc = absenciaContext
    ? `\n--- ABSÈNCIA EN CONTEXT ---
Docent absent: ${absenciaContext.nom}
Data: ${absenciaContext.data || 'avui'}${absenciaContext.dia ? ` (${absenciaContext.dia})` : ''}
Franges afectades: ${(absenciaContext.frangesIds || []).join(', ')}
Motiu: ${absenciaContext.motiu || 'no especificat'}`
    : '';

  return `Ets l'assistent expert en gestió de cobertures de ${escola?.nom || 'HORARIA'}.
La cap d'estudis ${jefaNom} et fa consultes sobre cobertures, disponibilitat de docents i organització.
Respon sempre en català, de forma clara i concisa.

Quan proposis una cobertura concreta, inclou-la entre etiquetes <proposta>...</proposta> en format JSON:
<proposta>[{"docent":"Nom","franges_ids":["f1a","f1b"],"hores":"9:00–10:00","grup_origen":"3rA","tp_afectat":false,"motiu":"disponible"}]</proposta>

--- NORMES DEL CENTRE ---
${normesTxt}

--- ESTRUCTURA ---
${estructura}

--- FRANGES HORÀRIES ---
${frangesDesc}
(Valor "_" o buit = docent AL CENTRE disponible | "Lliure" = absent/fora del centre)

--- HORARIS DE TOTS ELS DOCENTS ---
${horarisDesc}
${absDesc}`;
}

export async function xatIA(systemContext, conversationMessages, maxTokens = 2000) {
  const messages = [
    { role: 'user',      content: systemContext },
    { role: 'assistant', content: 'Entès. Conec tots els horaris i normes del centre. Com et puc ajudar?' },
    ...conversationMessages,
  ];
  return callClaudeRaw(messages, maxTokens);
}
