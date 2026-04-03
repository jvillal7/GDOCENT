import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import Spinner from '../../components/Spinner';

export default function TPPage() {
  const { api, showToast } = useApp();
  const [deutes, setDeutes] = useState(null);

  useEffect(() => { if (api) load(); }, [api]);

  async function load() {
    try { setDeutes(await api.getDeutesTP()); }
    catch { setDeutes([]); }
  }

  async function marcarTornat(id) {
    try {
      await api.marcarDeuteTornat(id);
      showToast('Deute marcat com a tornat');
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  }

  return (
    <>
      <div className="page-hdr"><h1>Treball Personal</h1><p>Deutes pendents de devolució</p></div>
      <div className="alert alert-blue">
        Quan un docent cobreix durant el seu TP, el sistema registra el deute.
      </div>
      <div className="card">
        <div className="card-head"><h3>Deutes pendents</h3></div>
        {deutes == null ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
        ) : deutes.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>Cap deute de TP pendent.</div>
        ) : deutes.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{d.docent_nom}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {d.motiu} · {d.data_deute ? new Date(d.data_deute + 'T12:00:00').toLocaleDateString('ca-ES') : ''}
              </div>
            </div>
            <span className={`sp ${d.data_devolucio ? 'sp-amber' : 'sp-red'}`}>
              {d.data_devolucio ? new Date(d.data_devolucio + 'T12:00:00').toLocaleDateString('ca-ES') : 'Sense data'}
            </span>
            <button className="btn btn-sm btn-ghost" onClick={() => marcarTornat(d.id)}>Tornat</button>
          </div>
        ))}
      </div>
    </>
  );
}
