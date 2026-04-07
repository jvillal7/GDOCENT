import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { FRANJES, SCHOOL_FRANJES } from '../../lib/constants';
import { proposarCobertura } from '../../lib/claude';
import Spinner from '../../components/Spinner';

function frangesChips(frangesJson) {
  const ids = (() => { try { return JSON.parse(frangesJson || '[]'); } catch { return []; } })();
  const selected = FRANJES.filter(f => ids.includes(f.id));
  const isAllDay = ids.length >= SCHOOL_FRANJES.length;
  if (isAllDay) return <span className="slot-chip all-day">✨ Tot el dia</span>;
  const seen = new Set();
  return selected.filter(f => { if (seen.has(f.label)) return false; seen.add(f.label); return true; })
    .map(f => <span key={f.label} className={`slot-chip${f.patio ? ' patio' : ''}`}>{f.label}</span>);
}

export default function AvisosPage() {
  const { api, docents, normes, escola, showToast } = useApp();
  const [absencies, setAbsencies] = useState(null);
  const [iaState,   setIaState]   = useState('idle'); // idle | loading | done | error
  const [iaResult,  setIaResult]  = useState(null);
  const [iaTarget,  setIaTarget]  = useState(null); // { nom, franges, id }
  const [iaError,   setIaError]   = useState('');

  useEffect(() => { if (api) load(); }, [api]);

  async function load() {
    try {
      const data = await api.getAbsencies();
      setAbsencies((data || []).filter(a => a.estat !== 'arxivat'));
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

  async function generarIA(avis) {
    setIaTarget(avis);
    setIaState('loading');
    setIaResult(null);
    setIaError('');
    try {
      const frangesIds = (() => { try { return JSON.parse(avis.franges || '[]'); } catch { return []; } })();
      const result = await proposarCobertura(avis.docent_nom, frangesIds, docents, normes, avis.data);
      setIaResult(result);
      setIaState('done');
    } catch (e) {
      setIaError(e.message || 'Error generant proposta.');
      setIaState('error');
    }
  }

  async function confirmarCobertura() {
    if (!iaResult?.proposta || !iaTarget) return;
    const avui = new Date().toISOString().split('T')[0];
    try {
      for (const p of iaResult.proposta) {
        await api.saveCobertura({
          escola_id:          escola.id,
          absencia_id:        iaTarget.id,
          docent_cobrint_nom: p.docent,
          franja:             p.franja,
          docent_absent_nom:  iaTarget.docent_nom,
          grup:               p.grup_origen || '',
          data:               avui,
          tp_afectat:         p.tp_afectat || false,
          motiu:              p.motiu || '',
        });
        if (p.tp_afectat) {
          await api.saveDeuteTP({
            docent_nom:  p.docent,
            data_deute:  avui,
            motiu:       `Cobertura ${p.franja} (${iaTarget.docent_nom})`,
            retornat:    false,
          });
        }
      }
      await api.patchAbsencia(iaTarget.id, { estat: 'resolt' });
      showToast('✓ Cobertures confirmades');
      setIaState('idle');
      setIaTarget(null);
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
                  {iaResult.proposta.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 10px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase' }}>{p.franja}</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{p.docent} <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 400 }}>· {p.motiu}</span></div>
                      </div>
                      {p.tp_afectat && <span className="sp sp-amber" style={{ fontSize: 10 }}>⚠ TP</span>}
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

      {absencies.map(a => {
        const dObj  = a.data ? new Date(a.data + 'T12:00:00') : new Date();
        const day   = dObj.getDate();
        const month = dObj.toLocaleDateString('ca-ES', { month: 'short' }).replace('.','').toUpperCase();
        return (
          <div key={a.id} className={`avis-card${a.estat === 'pendent' ? ' pendent' : ''}`}>
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
                {a.estat === 'pendent'
                  ? <span className="sp sp-red">Pendent</span>
                  : <span className="sp sp-green">Resolt</span>
                }
                {a.estat === 'pendent'
                  ? <button className="btn btn-green btn-sm" style={{ fontWeight: 600, marginTop: 4 }} onClick={() => marcarResolt(a.id)}>✓ Resolt</button>
                  : <button className="btn btn-red-soft btn-sm" style={{ fontWeight: 600, marginTop: 4 }} onClick={() => arxivar(a.id)}>🗑️ Esborrar</button>
                }
              </div>
            </div>
            <div className="ac-bottom">{frangesChips(a.franges)}</div>
            {a.estat === 'pendent' && (
              <div style={{ padding: '0 16px 14px' }}>
                <button
                  className="btn btn-ghost btn-sm btn-full"
                  style={{ fontSize: 12 }}
                  onClick={() => generarIA(a)}
                >
                  🤖 Generar proposta IA
                </button>
              </div>
            )}
          </div>
        );
      })}

    </>
  );
}
