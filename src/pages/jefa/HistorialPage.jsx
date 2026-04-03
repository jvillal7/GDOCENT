import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { FRANJES, SCHOOL_FRANJES } from '../../lib/constants';
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

export default function HistorialPage() {
  const { api } = useApp();
  const [data,    setData]    = useState(null);
  const [openIdx, setOpenIdx] = useState(new Set([0]));

  useEffect(() => { if (api) load(); }, [api]);

  async function load() {
    try {
      const [absencies, cobertures] = await Promise.all([
        api.getAbsencies(),
        api.getCobertures().catch(() => []),
      ]);
      setData({ absencies: absencies || [], cobertures: cobertures || [] });
    } catch { setData({ absencies: [], cobertures: [] }); }
  }

  if (data == null) {
    return <><div className="page-hdr"><h1>Historial</h1></div><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></>;
  }

  const { absencies, cobertures } = data;
  const total      = absencies.length;
  const gestionades = absencies.filter(a => a.estat !== 'pendent').length;
  const cobTotal   = cobertures.length;

  // Group by day
  const byDay = {};
  absencies.forEach(a => {
    const d = a.data || 'sense-data';
    if (!byDay[d]) byDay[d] = { abs: [], cobs: [] };
    byDay[d].abs.push(a);
  });
  cobertures.forEach(c => {
    const d = c.data || 'sense-data';
    if (!byDay[d]) byDay[d] = { abs: [], cobs: [] };
    byDay[d].cobs.push(c);
  });
  const dies = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

  function toggleDay(i) {
    setOpenIdx(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  return (
    <>
      <div className="page-hdr"><h1>Historial</h1><p>Registre d'absències per dia</p></div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi k-red"><div className="kpi-label">Total absències</div><div className="kpi-value">{total}</div></div>
        <div className="kpi k-green"><div className="kpi-label">Gestionades</div><div className="kpi-value">{gestionades}</div></div>
        <div className="kpi k-amber"><div className="kpi-label">Cobertures</div><div className="kpi-value">{cobTotal}</div></div>
      </div>

      {dies.length === 0 && (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>Cap absència registrada.</div>
      )}

      {dies.map((dia, idx) => {
        const { abs, cobs } = byDay[dia];
        const dataFmt = dia !== 'sense-data'
          ? new Date(dia + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : 'Sense data';
        const allOk  = abs.every(a => a.estat !== 'pendent');
        const isOpen = openIdx.has(idx);
        return (
          <div key={dia} className="card" style={{ marginBottom: 10, overflow: 'hidden' }}>
            <div
              onClick={() => toggleDay(idx)}
              style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderBottom: isOpen ? '1px solid var(--border)' : 'none' }}
            >
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{dataFmt}</div>
              <span className={`sp ${allOk ? 'sp-green' : 'sp-red'}`}>{allOk ? 'Cobert' : 'Pendent'}</span>
            </div>
            {isOpen && abs.map(a => {
              const dObj   = a.data ? new Date(a.data + 'T12:00:00') : new Date();
              const dayNum = dObj.getDate();
              const monthT = dObj.toLocaleDateString('ca-ES', { month: 'short' }).replace('.','').toUpperCase();
              const myCobs = cobs.filter(c => c.absencia_id === a.id || c.docent_absent_nom === a.docent_nom);
              return (
                <div key={a.id} className={`avis-card${a.estat === 'pendent' ? ' pendent' : ''}`} style={{ margin: '8px 14px', boxShadow: 'none', borderColor: 'var(--border)' }}>
                  <div className="ac-top" style={{ padding: 12 }}>
                    <div className="date-badge" style={{ transform: 'scale(0.85)', marginLeft: -4 }}>
                      <div className="db-day">{dayNum}</div>
                      <div className="db-month">{monthT}</div>
                    </div>
                    <div className="ac-content">
                      <div className="ac-name" style={{ fontSize: 14 }}>{a.docent_nom}</div>
                      <div className="ac-motiu">{a.motiu || 'Sense motiu'}</div>
                    </div>
                    <div className="ac-side">
                      {a.estat === 'pendent'
                        ? <span className="sp sp-red">Pendent</span>
                        : <span className="sp sp-green">Resolt</span>}
                    </div>
                  </div>
                  <div style={{ padding: '0 12px 10px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {frangesChips(a.franges)}
                    {myCobs.length > 0 && (
                      <div className="ac-coverage">✓ Cobert per: {myCobs.map(c => c.docent_cobrint_nom).join(', ')}</div>
                    )}
                    {myCobs.length === 0 && a.estat !== 'pendent' && (
                      <div className="ac-coverage">✓ Marcat com a resolt</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
