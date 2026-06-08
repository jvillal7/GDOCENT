// Agent vigilant — s'executa cada nit via pg_cron (vegeu migració 004).
// No s'invoca mai des del navegador: és server-to-server (cron → aquesta funció).
//
// Detecta dos tipus de problemes i els deixa registrats a `agent_alerts`,
// visibles només des del SuperAdmin (pestanya "Alertes"):
//   C) Errors recurrents de la IA (propostes de cobertura / xat Horaria)
//   D) Inconsistències de qualitat de dades als horaris dels docents
//
// L'agent NOMÉS detecta i registra — mai modifica dades de l'escola.

const SUPA_URL    = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AUTH_TOKEN  = Deno.env.get('AGENT_WATCHDOG_TOKEN')!;

const LLINDAR_ERRORS_IA    = 3;  // núm. d'errors en 24h per generar alerta
const FINESTRA_DEDUPE_DIES = 7;  // no repetir la mateixa alerta dins d'aquest interval

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
}

// Mateixa lògica que src/lib/utils.js normGrup() — normalitza noms de grup per comparar-los
function normGrup(s: string): string {
  if (!s) return '';
  return s.toLowerCase()
    .replace(/[\s\-.]/g, '')
    .replace(/[èé]/g, 'e').replace(/à/g, 'a')
    .replace(/[òó]/g, 'o').replace(/[úü]/g, 'u')
    .replace(/[íï]/g, 'i').replace(/º/g, '');
}

type CandidatAlerta = {
  escola_id: string;
  tipus: string;
  dedupe_key: string;
  condicio: boolean;
  gravetat: 'info' | 'warning' | 'critical';
  titol: string;
  missatge: string;
  extra?: Record<string, unknown>;
};

// Afegeix l'alerta a la llista només si la condició es compleix i no se n'ha
// registrat una d'igual (mateixa escola+tipus+entitat) recentment.
function afegirSiCal(arr: Record<string, unknown>[], dedupeKeys: Set<string>, c: CandidatAlerta) {
  if (!c.condicio) return;
  const key = `${c.escola_id}::${c.tipus}::${c.dedupe_key}`;
  if (dedupeKeys.has(key)) return;
  dedupeKeys.add(key); // evita duplicats dins la mateixa execució
  arr.push({
    escola_id: c.escola_id,
    tipus: c.tipus,
    gravetat: c.gravetat,
    titol: c.titol,
    missatge: c.missatge,
    metadata: { dedupe_key: c.dedupe_key, ...(c.extra || {}) },
  });
}

Deno.serve(async (req) => {
  if (req.headers.get('x-auth-token') !== AUTH_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const ara = new Date();
    const desDe24h    = new Date(ara.getTime() - 24 * 3600 * 1000).toISOString();
    const desDeDedupe = new Date(ara.getTime() - FINESTRA_DEDUPE_DIES * 86_400_000).toISOString();

    const escoles = await (await rest('escoles?select=id,nom')).json();

    // Alertes registrades recentment (totes les escoles) — per evitar duplicar-les
    const recents = await (await rest(
      `agent_alerts?select=escola_id,tipus,metadata&creat_el=gte.${desDeDedupe}`
    )).json();
    const dedupeKeys = new Set<string>(
      (Array.isArray(recents) ? recents : []).map((a: any) =>
        `${a.escola_id}::${a.tipus}::${a.metadata?.dedupe_key ?? ''}`)
    );

    const novesAlertes: Record<string, unknown>[] = [];

    for (const escola of (Array.isArray(escoles) ? escoles : [])) {
      // ── C) Errors recurrents de la IA ────────────────────────────────────
      const iaErrors = await (await rest(
        `ia_logs?select=id,error_msg,ts&escola_id=eq.${escola.id}&error_msg=not.is.null&ts=gte.${desDe24h}&order=ts.desc`
      )).json();
      const iaErrArr = Array.isArray(iaErrors) ? iaErrors : [];
      afegirSiCal(novesAlertes, dedupeKeys, {
        escola_id: escola.id, tipus: 'ia_errors_propostes', dedupe_key: 'propostes',
        condicio: iaErrArr.length >= LLINDAR_ERRORS_IA,
        gravetat: 'warning',
        titol: 'Errors repetits generant propostes de cobertura',
        missatge: `${iaErrArr.length} errors en les últimes 24h generant propostes de cobertura per a ${escola.nom}. Últim: "${(iaErrArr[0]?.error_msg || '').slice(0, 160)}"`,
        extra: { count: iaErrArr.length },
      });

      const xatErrors = await (await rest(
        `chat_logs?select=id,error_msg,creat_el&escola_id=eq.${escola.id}&error_msg=not.is.null&creat_el=gte.${desDe24h}&order=creat_el.desc`
      )).json();
      const xatErrArr = Array.isArray(xatErrors) ? xatErrors : [];
      afegirSiCal(novesAlertes, dedupeKeys, {
        escola_id: escola.id, tipus: 'ia_errors_xat', dedupe_key: 'xat',
        condicio: xatErrArr.length >= LLINDAR_ERRORS_IA,
        gravetat: 'warning',
        titol: 'Errors repetits al xat Horaria',
        missatge: `${xatErrArr.length} errors en les últimes 24h al xat Horaria de ${escola.nom}. Últim: "${(xatErrArr[0]?.error_msg || '').slice(0, 160)}"`,
        extra: { count: xatErrArr.length },
      });

      // ── D) Qualitat de dades dels horaris ────────────────────────────────
      const docents = await (await rest(
        `docents?select=id,nom,rol,grup_principal,horari,actiu&escola_id=eq.${escola.id}&actiu=eq.true`
      )).json();

      for (const d of (Array.isArray(docents) ? docents : [])) {
        const horariBuit = !d.horari || typeof d.horari !== 'object' || Object.keys(d.horari).length === 0;

        afegirSiCal(novesAlertes, dedupeKeys, {
          escola_id: escola.id, tipus: 'horari_buit', dedupe_key: `buit:${d.id}`,
          condicio: horariBuit,
          gravetat: 'warning',
          titol: 'Docent actiu sense horari carregat',
          missatge: `${d.nom} (${escola.nom}) està marcat com a actiu però no té cap horari carregat al sistema. No podrà rebre propostes de cobertura ni aparèixer com a disponible.`,
          extra: { docent_id: d.id, docent_nom: d.nom },
        });

        if (!horariBuit && d.grup_principal && /tutor/i.test(d.rol || '')) {
          const grupNorm = normGrup(d.grup_principal);
          const apareix = Object.values(d.horari as Record<string, unknown>).some((dia: any) =>
            dia && typeof dia === 'object' && Object.values(dia).some((v: any) =>
              typeof v === 'string' && v && normGrup(v).includes(grupNorm))
          );
          afegirSiCal(novesAlertes, dedupeKeys, {
            escola_id: escola.id, tipus: 'tutor_sense_grup', dedupe_key: `tutor:${d.id}`,
            condicio: !apareix,
            gravetat: 'info',
            titol: 'Tutor sense classes amb el seu grup',
            missatge: `${d.nom} (${escola.nom}) consta com a tutor de ${d.grup_principal}, però el seu horari no mostra cap sessió amb aquest grup. Pot ser un error de transcripció de l'horari.`,
            extra: { docent_id: d.id, docent_nom: d.nom, grup: d.grup_principal },
          });
        }
      }
    }

    if (novesAlertes.length) {
      await rest('agent_alerts', { method: 'POST', body: JSON.stringify(novesAlertes) });
    }

    return new Response(JSON.stringify({
      ok: true,
      escoles_revisades: Array.isArray(escoles) ? escoles.length : 0,
      alertes_noves: novesAlertes.length,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
