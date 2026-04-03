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
      <div className="card">
        <div className="card-head"><h3>Deutes pendents</h3></div>
        {deutes == null ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
        ) : deutes.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>Cap deute de TP pendent. ✓</div>
        ) : deutes.map(d => (
          <div key={d.id} style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 500 }}>TP pendent de {d.data_deute}</div>
            <span className="sp sp-red" style={{ fontSize: 11 }}>Pendent de devolució</span>
          </div>
        ))}
      </div>
    </>
  );
}
