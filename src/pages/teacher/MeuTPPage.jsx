import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import Spinner from '../../components/Spinner';

export default function MeuTPPage() {
  const { api, perfil } = useApp();
  const [deutes, setDeutes] = useState(null);

  useEffect(() => { if (api && perfil) load(); }, [api, perfil]);

  async function load() {
    try { setDeutes(await api.getMeusDeutesTP(perfil.nom)); }
    catch { setDeutes([]); }
  }

  return (
    <>
      <div className="page-hdr"><h1>El meu Treball Personal</h1></div>
      <div className="alert alert-blue">Quan cobreixes durant el teu TP, es registra un deute.</div>
      {deutes != null && deutes.filter(d => !d.data_devolucio).length > 0 && (
        <div style={{ background: '#FFF8E7', border: '1px solid #F0D5A8', borderRadius: 10, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', marginBottom: 2 }}>
              Tens {deutes.filter(d => !d.data_devolucio).length} deute{deutes.filter(d => !d.data_devolucio).length > 1 ? 's' : ''} de TP sense data de devolució
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Parla amb la cap d'estudis per programar la devolució.
            </div>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-head"><h3>Deutes pendents</h3></div>
        {deutes == null ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
        ) : deutes.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>Cap deute de TP pendent. ✓</div>
        ) : deutes.map(d => (
          <div key={d.id} style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 500 }}>TP pendent de {d.data_deute
              ? new Date(d.data_deute + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'short', day: 'numeric', month: 'long' })
              : '—'}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {d.data_devolucio
                ? <span className="sp sp-amber" style={{ fontSize: 11 }}>📅 Devolució: {new Date(d.data_devolucio + 'T12:00:00').toLocaleDateString('ca-ES')}</span>
                : <span className="sp sp-red" style={{ fontSize: 11 }}>Sense data de devolució</span>
              }
              {d.motiu && <span className="sp sp-ink" style={{ fontSize: 11 }}>{d.motiu}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
