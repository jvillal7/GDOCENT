import { SUPA_URL, SUPA_KEY } from './constants';

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

// Returns all API methods scoped to a school
export function makeApi(escolaId) {
  const f = (path, opts) => supaFetch(path, opts, escolaId);
  const avui = () => new Date().toISOString().split('T')[0];
  return {
    getDocents:          ()    => f('docents?select=*&actiu=eq.true&order=nom'),
    saveDocent:          d     => d.id
      ? f(`docents?id=eq.${d.id}`, { method: 'PATCH', body: JSON.stringify(d) })
      : f('docents', { method: 'POST', body: JSON.stringify(d) }),
    deleteDocent:        id    => f(`docents?id=eq.${id}`, { method: 'DELETE' }),
    getAbsenciesAvui:    ()    => f(`absencies?data=eq.${avui()}&order=creat_el.desc`),
    getAbsencies:        ()    => f('absencies?order=creat_el.desc&limit=50'),
    getAbsenciaById:     id    => f(`absencies?id=eq.${id}`),
    saveAbsencia:        a     => f('absencies', { method: 'POST', body: JSON.stringify(a) }),
    patchAbsencia:       (id,d) => f(`absencies?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    saveCobertura:       c     => f('cobertures', { method: 'POST', body: JSON.stringify(c) }),
    getCobertures:       ()    => f('cobertures?order=data.desc&limit=100'),
    getCoberturasAvui:   ()    => f(`cobertures?data=eq.${avui()}`),
    getCoberturesByDocent: nom => f(`cobertures?docent_cobrint_nom=eq.${encodeURIComponent(nom)}&data=eq.${avui()}`),
    getDeutesTP:         ()    => f('deutes_tp?retornat=eq.false&order=data_deute'),
    getMeusDeutesTP:     nom   => f(`deutes_tp?docent_nom=eq.${encodeURIComponent(nom)}&retornat=eq.false`),
    saveDeuteTP:         d     => f('deutes_tp', { method: 'POST', body: JSON.stringify(d) }),
    marcarDeuteTornat:   id    => f(`deutes_tp?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ retornat: true }) }),
    getNormesIA:         ()    => f(`escoles?id=eq.${escolaId}&select=normes_ia`, { bypassSchoolId: true }),
    saveNormesIA:        txt   => f(`escoles?id=eq.${escolaId}`, { method: 'PATCH', body: JSON.stringify({ normes_ia: txt }), bypassSchoolId: true }),
  };
}
