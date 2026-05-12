import { SUPA_URL, SUPA_KEY } from './constants';

const _cache = new Map();
const CACHE_TTL = 120_000;
function cacheGet(key) {
  const e = _cache.get(key);
  if (!e || Date.now() - e.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return e.data;
}
function cacheSet(key, data) { _cache.set(key, { data, ts: Date.now() }); }
function cacheDel(...keys) { keys.forEach(k => _cache.delete(k)); }

export async function sendEmail(to, subject, html) {
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
      },
      body: JSON.stringify({ to, subject, html }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.status);
      console.error('[sendEmail] Error de l\'Edge Function:', err);
    }
  } catch (e) {
    console.error('[sendEmail] Error de xarxa:', e?.message || e);
  }
}

export async function supaFetch(path, opts = {}, escolaId = null) {
  if (escolaId && !path.includes('escola_id=eq.') && !opts.bypassSchoolId) {
    path += (path.includes('?') ? '&' : '?') + `escola_id=eq.${escolaId}`;
  }
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        Prefer: opts.prefer || 'return=representation',
        ...opts.headers,
      },
      body: opts.body,
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`Supabase Error (${res.status}): ${await res.text()}`);
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  } catch (err) {
    clearTimeout(tid);
    if (err.name === 'AbortError') throw new Error("Temps d'espera esgotat.");
    throw err;
  }
}

export async function uploadFitxer(file, absenciaId) {
  const ext  = file.name.split('.').pop();
  const path = `${absenciaId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const res  = await fetch(`${SUPA_URL}/storage/v1/object/fitxers-absencies/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!res.ok) throw new Error(`Error pujant fitxer: ${await res.text()}`);
  return {
    nom:  file.name,
    url:  `${SUPA_URL}/storage/v1/object/public/fitxers-absencies/${path}`,
    tipus: ext.toLowerCase(),
  };
}

// Returns all API methods scoped to a school
export function makeApi(escolaId) {
  const f = (path, opts) => supaFetch(path, opts, escolaId);
  const avui = () => new Date().toISOString().split('T')[0];
  return {
    getDocents: () => {
      const k = `doc_${escolaId}`;
      const cached = cacheGet(k);
      if (cached) return Promise.resolve(cached);
      return f('docents?select=*&actiu=eq.true&order=nom').then(d => { cacheSet(k, d); return d; });
    },
    saveDocent: d => {
      cacheDel(`doc_${escolaId}`);
      return d.id
        ? f(`docents?id=eq.${d.id}`, { method: 'PATCH', body: JSON.stringify(d) })
        : f('docents', { method: 'POST', body: JSON.stringify(d) });
    },
    deleteDocent: id => {
      cacheDel(`doc_${escolaId}`);
      return f(`docents?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ actiu: false }) });
    },
    getAbsenciesAvui:    ()    => f(`absencies?data=eq.${avui()}&order=creat_el.desc`),
    getAbsencies:        ()    => f('absencies?order=creat_el.desc&limit=50'),
    getAbsenciaById:     id    => f(`absencies?id=eq.${id}`),
    saveAbsencia: a => { cacheDel(`abs_${escolaId}`); return f('absencies', { method: 'POST', body: JSON.stringify(a) }); },
    patchAbsencia: (id, d) => { cacheDel(`abs_${escolaId}`); return f(`absencies?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(d) }); },
    saveCobertura: c => { cacheDel(`cob_${escolaId}`); return f('cobertures', { method: 'POST', body: JSON.stringify(c) }); },
    deleteCobertures: absId => { cacheDel(`cob_${escolaId}`); return f(`cobertures?absencia_id=eq.${absId}`, { method: 'DELETE', prefer: 'return=minimal' }); },
    deleteDeutesTPCobertura: (docentNom, data, absentNom) => f(`deutes_tp?docent_nom=eq.${encodeURIComponent(docentNom)}&data_deute=eq.${data}&retornat=eq.false&motiu=ilike.*${encodeURIComponent(absentNom)}*`, { method: 'DELETE', prefer: 'return=minimal' }),
    getCobertures:       ()    => f('cobertures?order=data.desc&limit=100'),
    getCoberturesByAbsencia: id => f(`cobertures?absencia_id=eq.${id}`),
    getCoberturasAvui:   ()    => f(`cobertures?data=eq.${avui()}`),
    getCoberturesByDocent: nom => f(`cobertures?docent_cobrint_nom=eq.${encodeURIComponent(nom)}&data=eq.${avui()}`),
    getDeutesTP:         ()    => f('deutes_tp?retornat=eq.false&order=data_deute'),
    getMeusDeutesTP:     nom   => f(`deutes_tp?docent_nom=eq.${encodeURIComponent(nom)}&retornat=eq.false`),
    saveDeuteTP:         d     => f('deutes_tp', { method: 'POST', body: JSON.stringify(d) }),
    marcarDeuteTornat:   id    => f(`deutes_tp?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ retornat: true }) }),
    getNormesIA:         ()    => f(`escoles?id=eq.${escolaId}&select=normes_ia`, { bypassSchoolId: true }),
    saveNormesIA:        txt   => f(`escoles?id=eq.${escolaId}`, { method: 'PATCH', body: JSON.stringify({ normes_ia: txt }), bypassSchoolId: true }),
    getInfoExtra:        ()    => f(`escoles?id=eq.${escolaId}&select=info_extra`, { bypassSchoolId: true }),
    saveInfoExtra:       d     => f(`escoles?id=eq.${escolaId}`, { method: 'PATCH', body: JSON.stringify({ info_extra: d }), bypassSchoolId: true }),
    getBaixes:           ()    => f(`escoles?id=eq.${escolaId}&select=oriol_baixes`, { bypassSchoolId: true }),
    saveBaixes:          d     => f(`escoles?id=eq.${escolaId}`, { method: 'PATCH', body: JSON.stringify({ oriol_baixes: d }), bypassSchoolId: true }),
    getOriolDiari:       ()    => f(`escoles?id=eq.${escolaId}&select=oriol_absents,oriol_reunions,oriol_ceepsir,oriol_baixes`, { bypassSchoolId: true }),
    saveOriolAbsents:    d     => f(`escoles?id=eq.${escolaId}`, { method: 'PATCH', body: JSON.stringify({ oriol_absents: d }),  bypassSchoolId: true }),
    saveOriolReunions:   d     => f(`escoles?id=eq.${escolaId}`, { method: 'PATCH', body: JSON.stringify({ oriol_reunions: d }), bypassSchoolId: true }),
    saveOriolCeepsir:    d     => f(`escoles?id=eq.${escolaId}`, { method: 'PATCH', body: JSON.stringify({ oriol_ceepsir: d }),  bypassSchoolId: true }),
    saveOriolBaixes:     d     => f(`escoles?id=eq.${escolaId}`, { method: 'PATCH', body: JSON.stringify({ oriol_baixes: d }),   bypassSchoolId: true }),
    syncDirectiuPin: (nom, pin) => f(`directius?escola_id=eq.${escolaId}&nom=eq.${encodeURIComponent(nom)}`, { method: 'PATCH', body: JSON.stringify({ pin }), bypassSchoolId: true }),
    getAbsenciesByDocent: nom => f(`absencies?docent_nom=eq.${encodeURIComponent(nom)}&estat=neq.arxivat&order=data.desc&limit=10`),
    getCoberturesForAbsent: nom => f(`cobertures?docent_absent_nom=eq.${encodeURIComponent(nom)}&order=data.desc&limit=30`),
    getAbsenciesHistorial: (offset = 0, limit = 50) => f(`absencies?order=data.desc&limit=${limit}&offset=${offset}`),
    getAbsenciesProvisionals: () => {
      const tom = new Date(); tom.setDate(tom.getDate() + 1);
      return f(`absencies?estat=eq.provisional&data=eq.${tom.toISOString().split('T')[0]}&order=creat_el.desc`);
    },
    getIaDecisions:  ()  => f(`escoles?id=eq.${escolaId}&select=ia_decisions`, { bypassSchoolId: true }),
    saveIaDecisions: d   => f(`escoles?id=eq.${escolaId}`, { method: 'PATCH', body: JSON.stringify({ ia_decisions: d }), bypassSchoolId: true }),
  };
}
