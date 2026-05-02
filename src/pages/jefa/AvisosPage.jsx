import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { FRANJES, SCHOOL_FRANJES, FRANJES_ORIOL, SCHOOL_FRANJES_ORIOL, APP_URL } from '../../lib/constants';
import { proposarCobertura, analitzarInfoExtra } from '../../lib/claude';
import { sendEmail } from '../../lib/api';
import Spinner from '../../components/Spinner';

function frangesChips(frangesJson, isOriol) {
  const ids = (() => { try { return JSON.parse(frangesJson || '[]'); } catch { return []; } })();
  const franjesAct = isOriol ? FRANJES_ORIOL : FRANJES;
  const schoolFranjesAct = isOriol ? SCHOOL_FRANJES_ORIOL : SCHOOL_FRANJES;
  const selected = franjesAct.filter(f => ids.includes(f.id));
  const isAllDay = ids.length >= schoolFranjesAct.length;
  if (isAllDay) return <span className="slot-chip all-day">✨ Tot el dia</span>;
  const seen = new Set();
  return selected.filter(f => { if (seen.has(f.label)) return false; seen.add(f.label); return true; })
    .map(f => <span key={f.label} className={`slot-chip${f.patio ? ' patio' : ''}`}>{f.label}</span>);
}

export default function AvisosPage() {
  const { api, docents, normes, escola, showToast } = useApp();
  const isOriol = escola?.nom?.toLowerCase().includes('oriol');
  const [absencies, setAbsencies] = useState(null);
  const [baixes,    setBaixes]    = useState([]);
  const [iaState,        setIaState]        = useState('idle');
  const [iaResult,       setIaResult]       = useState(null);
  const [iaTarget,       setIaTarget]       = useState(null);
  const [iaError,        setIaError]        = useState('');
  const [editedProposta, setEditedProposta] = useState(null);
  // Informació extra del dia (activitats especials) — llista d'entrades
  const [showInfoPanel,    setShowInfoPanel]    = useState(false);
  const [infoNotes,        setInfoNotes]        = useState('');
  const [infoFitxer,       setInfoFitxer]       = useState(null);
  const [infoLoading,      setInfoLoading]      = useState(false);
  const [infoExtra,        setInfoExtra]        = useState([]); // [{resum, docentsBlocats, context, data_inici, data_fi}]
  const [expandedInfoIdxs, setExpandedInfoIdxs] = useState(new Set());
  const [editingInfoIdx,   setEditingInfoIdx]   = useState(null);
  const [editingText,      setEditingText]      = useState('');
  const infoFileRef = useRef(null);

  useEffect(() => { if (api) load(); }, [api]);

  async function load() {
    try {
      const avui = new Date().toISOString().split('T')[0];
      const [data, infoRes, diariRes] = await Promise.all([
        api.getAbsencies(),
        api.getInfoExtra().catch(() => null),
        api.getOriolDiari().catch(() => null),
      ]);
      setBaixes(diariRes?.[0]?.oriol_baixes || []);
      // Carregar i validar infoExtra persistent (suporta format antic objecte i nou array)
      const raw = infoRes?.[0]?.info_extra;
      const llista = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      const vigents = llista.filter(ie => !ie.data_fi || ie.data_fi >= avui);
      if (vigents.length !== llista.length) {
        await api.saveInfoExtra(vigents.length ? vigents : null);
      }
      setInfoExtra(vigents);
      const actives = (data || []).filter(a => a.estat !== 'arxivat');
      // Auto-arxivar absències resoltes de fa més de 3 dies (marge perquè la jefa les vegi)
      const limitArxiu = new Date(); limitArxiu.setDate(limitArxiu.getDate() - 3);
      const limitArxiuISO = limitArxiu.toISOString().split('T')[0];
      const passades = actives.filter(a => a.estat === 'resolt' && a.data && a.data < limitArxiuISO);
      if (passades.length > 0) {
        await Promise.all(passades.map(a => api.patchAbsencia(a.id, { estat: 'arxivat' })));
      }
      setAbsencies(actives.filter(a => !passades.find(p => p.id === a.id)));
    } catch { setAbsencies([]); }
  }

  async function marcarResolt(id) {
    try {
      await api.patchAbsencia(id, { estat: 'resolt' });
      showToast('Avis marcat com a resolt');
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  }

  async function arxivar(id) {
    try {
      await api.patchAbsencia(id, { estat: 'arxivat' });
      showToast('Avis esborrat de la llista');
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  }

  async function processarInfoExtra() {
    if (!infoNotes.trim() && !infoFitxer) return showToast('Escriu unes notes o adjunta un document');
    setInfoLoading(true);
    try {
      let base64 = null;
      if (infoFitxer) {
        base64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = e => res(e.target.result.split(',')[1]);
          r.onerror = rej;
          r.readAsDataURL(infoFitxer);
        });
      }
      const result = await analitzarInfoExtra(infoNotes, base64);
      const novaLlista = [...infoExtra, result];
      await api.saveInfoExtra(novaLlista);
      setInfoExtra(novaLlista);
      setShowInfoPanel(false);
      setInfoNotes('');
      setInfoFitxer(null);
      showToast('✓ Informació extra guardada');
    } catch (e) {
      showToast('Error analitzant: ' + e.message);
    } finally {
      setInfoLoading(false);
    }
  }

  function toggleInfoExtra(idx) {
    setExpandedInfoIdxs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function editarInfoExtra(idx, newResum) {
    try {
      const novaLlista = infoExtra.map((ie, i) => i === idx ? { ...ie, resum: newResum } : ie);
      await api.saveInfoExtra(novaLlista);
      setInfoExtra(novaLlista);
      setEditingInfoIdx(null);
      showToast('✓ Informació actualitzada');
    } catch (e) { showToast('Error: ' + e.message); }
  }

  async function eliminarInfoExtra(idx) {
    try {
      const novaLlista = infoExtra.filter((_, i) => i !== idx);
      await api.saveInfoExtra(novaLlista.length ? novaLlista : null);
      setInfoExtra(novaLlista);
      showToast('Entrada eliminada');
    } catch (e) { showToast('Error: ' + e.message); }
  }

  async function generarIA(avis) {
    if (avis.data) {
      const diaSetmana = new Date(avis.data + 'T12:00:00').getDay();
      if (diaSetmana === 0 || diaSetmana === 6) {
        setIaTarget(avis);
        setIaState('error');
        setIaError('Aquesta absència és un cap de setmana — no hi ha classes ni cobertures possibles.');
        return;
      }
    }
    setIaTarget(avis);
    setIaState('loading');
    setIaResult(null);
    setEditedProposta(null);
    setIaError('');
    try {
      const frangesIds = (() => { try { return JSON.parse(avis.franges || '[]'); } catch { return []; } })();
      // Excloure mestres que ja estan cobrint alguna franja d'avui
      const cobsAvui = await api.getCoberturasAvui().catch(() => []);
      const frangesSet = new Set(frangesIds);
      const jaAssignats = new Set(
        cobsAvui.filter(c => frangesSet.has(c.franja)).map(c => c.docent_cobrint_nom).filter(Boolean)
      );
      // Excloure mestres bloquejats per qualsevol activitat especial del dia
      const blocatsExtra = new Set(
        infoExtra.flatMap(ie => (ie.docentsBlocats || []).map(b => (b.nom || b).toLowerCase()))
      );
      const ROLS_EXCLOSOS = new Set(['vetllador', 'educador', 'tei', 'suport', 'directiu']);
      const docentsFiltrats = docents.filter(d =>
        !jaAssignats.has(d.nom) &&
        !blocatsExtra.has(d.nom.toLowerCase()) &&
        !ROLS_EXCLOSOS.has(d.rol) &&
        !['SIEI', 'SIEI+'].includes(d.grup_principal) &&
        d.horari
      );
      // Passar totes les entrades d'info extra a la IA (contexte combinat)
      const infoExtraCombinada = infoExtra.length
        ? { context: infoExtra.map(ie => ie.context).filter(Boolean).join(' | '), docentsBlocats: infoExtra.flatMap(ie => ie.docentsBlocats || []) }
        : null;
      const result = await proposarCobertura(avis.docent_nom, frangesIds, docentsFiltrats, normes, avis.data, isOriol, infoExtraCombinada, baixes.length ? baixes : null);
      setIaResult(result);
      setIaState('done');
      setEditedProposta(result.proposta.map(p => ({ ...p })));
    } catch (e) {
      setIaError(e.message || 'Error generant proposta.');
      setIaState('error');
    }
  }

  async function confirmarCobertura() {
    const proposta = editedProposta || iaResult?.proposta;
    if (!proposta || !iaTarget) return;
    const avui     = new Date().toISOString().split('T')[0];
    const absData  = iaTarget.data || avui;
    const esFutura = absData > avui;
    const nouEstat = esFutura ? 'provisional' : 'resolt';
    try {
      // Grup destí = grup del docent ABSENT (on ha d'anar el cobrint)
      const absentDocent = docents.find(d => d.nom === iaTarget.docent_nom);
      const grupDestí = absentDocent?.grup_principal || '';

      for (const p of proposta) {
        // Nou format: franges_ids (array). Antic: franja (string). Guardem 1 cobertura per franja.
        const frangesACobrir = p.franges_ids?.length ? p.franges_ids : [p.franja];
        for (const fid of frangesACobrir) {
          await api.saveCobertura({
            escola_id:          escola.id,
            absencia_id:        iaTarget.id,
            docent_cobrint_nom: p.docent,
            franja:             fid,
            docent_absent_nom:  iaTarget.docent_nom,
            grup:               grupDestí,
            data:               absData,
            tp_afectat:         p.tp_afectat || false,
            motiu:              p.motiu || '',
          });
        }
        if (p.tp_afectat && !esFutura) {
          await api.saveDeuteTP({
            docent_nom:  p.docent,
            data_deute:  absData,
            motiu:       `Cobertura ${p.hores || p.franja} (${iaTarget.docent_nom})`,
            retornat:    false,
            minuts:      (p.franges_ids?.length || 1) * 30,
          });
        }
      }
      await api.patchAbsencia(iaTarget.id, { estat: nouEstat });
      showToast(esFutura ? '📅 Cobertura provisional guardada' : '✓ Cobertures confirmades');
      // Enviar correu a cada docent cobrint que tingui email
      for (const p of proposta) {
        const cobrintDocent = docents.find(d => d.nom === p.docent);
        if (cobrintDocent?.email) {
          const frangesIds = p.franges_ids?.length ? p.franges_ids : [p.franja].filter(Boolean);
          sendEmail(
            cobrintDocent.email,
            `📋 Cobertura assignada — ${absData}`,
            emailCobertura({ cobrint: p.docent, absent: iaTarget.docent_nom, data: absData, frangesIds, isOriol, grup: grupDestí, esFutura, notes: iaTarget.notes })
          );
        }
      }
      setIaState('idle');
      setIaTarget(null);
      setEditedProposta(null);
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  }

  async function confirmarProvisional(id) {
    try {
      const [cobs] = await Promise.all([
        api.getCoberturesByAbsencia(id),
        api.patchAbsencia(id, { estat: 'resolt' }),
      ]);
      showToast('✓ Cobertura confirmada per avui');

      // Enviar correu a cada docent cobrint (agrupem franges per docent)
      const avis = absencies?.find(a => a.id === id);
      const avui = new Date().toISOString().split('T')[0];
      const perDocent = {};
      for (const cob of (cobs || [])) {
        if (!perDocent[cob.docent_cobrint_nom]) perDocent[cob.docent_cobrint_nom] = { frangesIds: [], grup: cob.grup };
        perDocent[cob.docent_cobrint_nom].frangesIds.push(cob.franja);
      }
      for (const [nom, { frangesIds, grup }] of Object.entries(perDocent)) {
        const cobrintDocent = docents.find(d => d.nom === nom);
        if (cobrintDocent?.email) {
          sendEmail(
            cobrintDocent.email,
            `📋 Cobertura assignada — ${avui}`,
            emailCobertura({ cobrint: nom, absent: avis?.docent_nom || '', data: avui, frangesIds, isOriol, grup, esFutura: false, notes: avis?.notes })
          );
        }
      }
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  }

  if (absencies == null) {
    return <><div className="page-hdr"><h1>Avisos rebuts</h1></div><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></>;
  }

  const pendents = absencies.filter(a => a.estat === 'pendent');

  return (
    <>
      <div className="page-hdr">
        <h1>Avisos rebuts</h1>
        <p>Notificacions d'absències pendents</p>
      </div>

      {/* Botó i panel d'informació extra del dia */}
      <div style={{ marginBottom: 12 }}>
        <button
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
          onClick={() => { setShowInfoPanel(p => !p); setInfoNotes(''); setInfoFitxer(null); }}
        >
          📋 Afegir informació extra del dia
          {infoExtra.length > 0 && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} />}
        </button>

        {/* Llista d'entrades info extra actives */}
        {infoExtra.map((ie, idx) => {
          const isExpanded = expandedInfoIdxs.has(idx);
          const isEditing  = editingInfoIdx === idx;
          return (
            <div key={idx} style={{ marginTop: 8, background: 'var(--amber-bg)', border: '1px solid #F0D5A8', borderRadius: 10, overflow: 'hidden' }}>
              {/* Fila compacta */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggleInfoExtra(idx)}
              >
                {/* Esquerra: etiqueta + badge dies + chips mestres */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>
                    Activitat especial
                  </span>
                  {ie.data_fi && ie.data_fi !== ie.data_inici && (
                    <span style={{ background: 'var(--amber)', color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 10, flexShrink: 0 }}>
                      fins {new Date(ie.data_fi + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  {ie.docentsBlocats?.map((b, i) => {
                    const nom = b.nom || b;
                    const hores = b.hores || '';
                    return (
                      <span key={i} style={{ background: '#fff', border: '1px solid #F0D5A8', borderRadius: 20, padding: '2px 7px', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                        {nom.split(' ')[0]}
                        {hores && <span style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 500 }}>{hores}</span>}
                      </span>
                    );
                  })}
                </div>
                {/* Dreta: botons + chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => { setEditingInfoIdx(idx); setEditingText(ie.resum || ''); if (!isExpanded) toggleInfoExtra(idx); }}
                    title="Editar"
                  >✏️</button>
                  <button
                    className="btn btn-red-soft btn-sm"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => eliminarInfoExtra(idx)}
                    title="Eliminar"
                  >🗑️</button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--amber)', flexShrink: 0 }}>{isExpanded ? '▾' : '▸'}</span>
              </div>

              {/* Contingut expandit */}
              {isExpanded && !isEditing && (
                <div style={{ padding: '0 12px 10px', borderTop: '1px solid #F0D5A8' }}>
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>{ie.resum}</p>
                </div>
              )}

              {/* Mode edició */}
              {isEditing && (
                <div style={{ padding: '8px 12px 12px', borderTop: '1px solid #F0D5A8', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    className="f-ctrl"
                    rows={3}
                    style={{ fontSize: 13 }}
                    value={editingText}
                    onChange={e => setEditingText(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-green btn-sm btn-full" onClick={() => editarInfoExtra(idx, editingText)}>✓ Guardar</button>
                    <button className="btn btn-ghost btn-sm btn-full" onClick={() => setEditingInfoIdx(null)}>Cancel·lar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Panel d'entrada */}
        {showInfoPanel && (
          <div className="card" style={{ marginTop: 8 }}>
            <div className="card-head" style={{ padding: '10px 14px' }}>
              <h3 style={{ fontSize: 13 }}>Nova informació extra del dia</h3>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowInfoPanel(false)}>✕</button>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="f-label" style={{ marginBottom: 6 }}>Descriu l'activitat o esdeveniment d'avui</label>
                <textarea
                  className="f-ctrl"
                  rows={3}
                  placeholder="Ex: 3r i 4t van de sortida a la natura. Tots els mestres acompanyants no poden cobrir. La tutora de 5è té reunió de 10 a 11h..."
                  value={infoNotes}
                  onChange={e => setInfoNotes(e.target.value)}
                />
              </div>
              <div>
                <label className="f-label" style={{ marginBottom: 6 }}>Document d'organització (PDF, opcional)</label>
                <div
                  style={{ border: '1.5px dashed var(--border-2)', borderRadius: 'var(--r-sm)', padding: 12, textAlign: 'center', cursor: 'pointer', background: 'var(--bg)' }}
                  onClick={() => infoFileRef.current?.click()}
                >
                  <input ref={infoFileRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={e => setInfoFitxer(e.target.files?.[0] || null)} />
                  {infoFitxer
                    ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13 }}>
                        <span>📄</span><span style={{ fontWeight: 600 }}>{infoFitxer.name}</span>
                        <span style={{ color: 'var(--ink-3)', cursor: 'pointer', fontWeight: 700 }} onClick={e => { e.stopPropagation(); setInfoFitxer(null); }}>×</span>
                      </div>
                    : <><div style={{ fontSize: 20, marginBottom: 4 }}>📄</div><div style={{ fontSize: 13, fontWeight: 500 }}>Adjunta el document d'organització</div><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>PDF (organització sortida, jornada, colònies...)</div></>
                  }
                </div>
              </div>
              <button
                className="btn btn-full"
                style={{ padding: 13, fontSize: 14, fontWeight: 600, background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', cursor: infoLoading ? 'not-allowed' : 'pointer', opacity: infoLoading ? .6 : 1 }}
                disabled={infoLoading}
                onClick={processarInfoExtra}
              >
                {infoLoading ? <><Spinner size={14} /> Analitzant amb IA...</> : '🤖 Analitzar i activar'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* IA Section — just below header */}
      {iaTarget && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h3>🤖 Proposta IA — {iaTarget.docent_nom}</h3>
          </div>
          <div style={{ padding: 16 }}>
            {iaState === 'loading' && (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <Spinner />
                <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 10 }}>La IA analitzant disponibilitat...</p>
              </div>
            )}
            {iaState === 'error' && (
              <>
                <div className="f-warn" style={{ marginBottom: 12 }}>⚠ {iaError}</div>
                <button className="btn btn-ghost btn-full" onClick={() => generarIA(iaTarget)}>↺ Tornar a intentar</button>
              </>
            )}
            {iaState === 'done' && iaResult && (
              <>
                <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-mid)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--green)', marginBottom: 10 }}>
                  💡 {iaResult.resum}
                </div>
                <div className="card" style={{ marginBottom: 12 }}>
                  {(editedProposta || iaResult.proposta).map((p, i) => (
                    <div key={i} style={{ padding: '10px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', marginBottom: 5 }}>{p.hores || p.franja}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                          className="f-ctrl"
                          style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: '6px 8px' }}
                          value={p.docent}
                          onChange={e => setEditedProposta(prev => prev.map((x, j) => j === i ? { ...x, docent: e.target.value } : x))}
                        >
                          {docents.map(d => <option key={d.id} value={d.nom}>{d.nom}</option>)}
                        </select>
                        {p.tp_afectat && <span className="sp sp-amber" style={{ fontSize: 10, flexShrink: 0 }}>⚠ TP</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{p.motiu}</div>
                      {p.franges_ids?.length > 1 && (
                        <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>Cobreix {p.franges_ids.length} franges ({p.franges_ids.length * 30} min)</div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="btn btn-green btn-full" onClick={confirmarCobertura}>✓ Confirmar i enviar notificacions</button>
                  <button className="btn btn-ghost btn-full" onClick={() => generarIA(iaTarget)}>↺ Generar una altra proposta</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {absencies.length === 0 && (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          Cap absència registrada encara.
        </div>
      )}

      {(() => {
        const absByDocent = {};
        absencies.forEach(a => { absByDocent[a.docent_nom] = (absByDocent[a.docent_nom] || 0) + 1; });
        return absencies.map(a => {
        const avui  = new Date().toISOString().split('T')[0];
        const dObj  = a.data ? new Date(a.data + 'T12:00:00') : new Date();
        const day   = dObj.getDate();
        const month = dObj.toLocaleDateString('ca-ES', { month: 'short' }).replace('.','').toUpperCase();
        const esProvisional = a.estat === 'provisional';
        const esPendent     = a.estat === 'pendent';
        const esAvui        = a.data === avui;
        const diesTotal     = absByDocent[a.docent_nom] || 1;
        return (
          <div key={a.id} className={`avis-card${esPendent ? ' pendent' : ''}`}>
            <div className="ac-top">
              <div className="date-badge">
                <div className="db-day">{day}</div>
                <div className="db-month">{month}</div>
              </div>
              <div className="ac-content">
                <div className="ac-name">{a.docent_nom}</div>
                <div className="ac-motiu">{a.motiu || 'Sense motiu'}</div>
              </div>
              <div className="ac-side">
                {esPendent     && <span className="sp sp-red">Pendent</span>}
                {esProvisional && <span className="sp sp-amber">Provisional</span>}
                {!esPendent && !esProvisional && <span className="sp sp-green">Resolt</span>}
                {diesTotal > 1 && <span className="sp sp-amber" style={{ marginTop: 3 }}>📅 {diesTotal} dies</span>}

                {esPendent     && <button className="btn btn-green btn-sm" style={{ fontWeight: 600, marginTop: 4 }} onClick={() => marcarResolt(a.id)}>✓ Resolt</button>}
                {esProvisional && esAvui && <button className="btn btn-green btn-sm" style={{ fontWeight: 600, marginTop: 4 }} onClick={() => confirmarProvisional(a.id)}>✓ Confirmar</button>}
                {!esPendent && !esProvisional && <button className="btn btn-red-soft btn-sm" style={{ fontWeight: 600, marginTop: 4 }} onClick={() => arxivar(a.id)}>🗑️ Esborrar</button>}
              </div>
            </div>
            <div className="ac-bottom">{frangesChips(a.franges, isOriol)}</div>
            {esProvisional && (
              <div style={{ padding: '4px 16px 10px', fontSize: 11.5, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
                📅 Cobertura provisional — {esAvui ? 'confirma avui' : `prevista per al ${dObj.toLocaleDateString('ca-ES', { weekday: 'short', day: 'numeric', month: 'short' })}`}
              </div>
            )}
            {(esPendent || esProvisional) && (
              <div style={{ padding: '0 16px 14px', display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-ghost btn-sm btn-full"
                  style={{ fontSize: 12 }}
                  onClick={() => generarIA(a)}
                >
                  {esProvisional ? '↺ Canviar proposta IA' : '🤖 Generar proposta IA'}
                </button>
                <button
                  className="btn btn-red-soft btn-sm"
                  style={{ fontSize: 13, flexShrink: 0, paddingInline: 10 }}
                  onClick={() => arxivar(a.id)}
                  title="Eliminar avis"
                >🗑️</button>
              </div>
            )}
            {!esPendent && !esProvisional && (
              <div style={{ padding: '0 16px 14px' }}>
                <button className="btn btn-ghost btn-sm btn-full" style={{ fontSize: 12 }} onClick={() => arxivar(a.id)}>🗑️ Esborrar del registre</button>
              </div>
            )}
          </div>
        );
      });
      })()}

    </>
  );
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function frangesHorari(ids, isOriol) {
  const allFranjes = isOriol ? FRANJES_ORIOL : FRANJES;
  const sel = allFranjes.filter(f => ids.includes(f.id));
  if (!sel.length) return '';
  const start = sel[0].sub.split('–')[0].trim();
  const end   = sel[sel.length - 1].sub.split('–')[1]?.trim() || '';
  return end ? `${start}–${end}` : start;
}

function emailCobertura({ cobrint, absent, data, frangesIds, isOriol, grup, esFutura, notes }) {
  const escolaKey = isOriol ? 'oriol' : 'rivo';
  const dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const horariText = frangesIds?.length ? frangesHorari(frangesIds, isOriol) : '';
  const firstName = cobrint?.split(' ')[0] || cobrint;
  const notesHtml = notes?.trim()
    ? `<div style="margin-top:20px;background:#f0f7ff;border-left:4px solid #4285F4;border-radius:6px;padding:14px 16px">
        <div style="font-size:11px;font-weight:700;color:#4285F4;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Missatge de ${escHtml(absent)}</div>
        <p style="margin:0;font-size:14px;color:#1a1a1a;line-height:1.6">${escHtml(notes.trim()).replace(/\n/g, '<br>')}</p>
      </div>`
    : '';
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;background:#f9f9f9;border-radius:12px">
      <div style="background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a">Hola, <strong>${escHtml(firstName)}</strong></p>
        <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:18px">📋 ${esFutura ? 'Cobertura provisional assignada' : 'Cobertura assignada per avui'}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#666;width:110px">Nom</td><td style="padding:8px 0;font-weight:600">${escHtml(cobrint)}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Data</td><td style="padding:8px 0">${dataFmt}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Horari</td><td style="padding:8px 0;font-weight:600">${horariText || '—'}</td></tr>
          ${grup ? `<tr><td style="padding:8px 0;color:#666">Grup</td><td style="padding:8px 0">${escHtml(grup)}</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#666">Substitueix</td><td style="padding:8px 0">${escHtml(absent)}</td></tr>
        </table>
        ${notesHtml}
        <div style="margin-top:24px;text-align:center">
          <a href="${APP_URL}?escola=${escolaKey}&page=tc" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
            Veure la meva cobertura a GDOCENT →
          </a>
        </div>
      </div>
    </div>`;
}
