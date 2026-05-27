import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import Spinner from '../../components/Spinner';

const TORN_LABELS = {
  patiA:     { label: 'Torn A',            sub: '10:30–11:00', color: 'var(--green)'  },
  patiB:     { label: 'Torn B',            sub: '11:00–11:30', color: 'var(--blue)'   },
  patiB_inf: { label: 'Torn B · Infantil', sub: '11:00–11:30', color: 'var(--blue)'   },
  patiB_pri: { label: 'Torn B · Primària', sub: '11:00–11:30', color: 'var(--purple)' },
  opatiA:    { label: 'Pati A',            sub: '11:00–11:30', color: 'var(--green)'  },
  opatiB:    { label: 'Pati B',            sub: '11:30–12:00', color: 'var(--blue)'   },
};

const DIES_SETMANA = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres'];
const DIES_LBL = {
  dilluns: 'Dilluns', dimarts: 'Dimarts', dimecres: 'Dimecres',
  dijous: 'Dijous', divendres: 'Divendres',
};
const DIES_CAT = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];

export default function MeusPatiTornsPage() {
  const { api, perfil } = useApp();
  const [patiTorns, setPatiTorns] = useState(undefined); // undefined = carregant
  const todayDia = DIES_CAT[new Date().getDay()];

  useEffect(() => {
    if (!api || !perfil) return;
    api.getPatiTorns()
      .then(res => setPatiTorns(res?.[0]?.config_pati?.torns || null))
      .catch(() => setPatiTorns(null));
  }, [api, perfil]);

  if (patiTorns === undefined) {
    return (
      <>
        <div className="page-hdr"><h1>Els meus torns de pati</h1></div>
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      </>
    );
  }

  if (!patiTorns) {
    return (
      <>
        <div className="page-hdr"><h1>Els meus torns de pati</h1></div>
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🕐</div>
          La cap d'estudis encara no ha configurat els torns de pati.
        </div>
      </>
    );
  }

  const nomNorm = (perfil?.nom || '').toLowerCase().trim();
  const meusPatins = DIES_SETMANA.flatMap(dia => {
    const torn = patiTorns[dia] || {};
    return Object.entries(torn)
      .filter(([, noms]) => (noms || []).some(n => n.toLowerCase().trim() === nomNorm))
      .map(([pid]) => ({ dia, pid }));
  });

  const avuiPati = meusPatins.filter(p => p.dia === todayDia);
  const tornsSetmana = meusPatins.length;

  return (
    <>
      <div className="page-hdr"><h1>Els meus torns de pati</h1></div>

      {/* KPI resum */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--blue)' }}>{tornsSetmana}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>torns/setmana</div>
        </div>
        <div style={{ background: avuiPati.length ? '#FFF3E0' : 'var(--surface)', border: `1px solid ${avuiPati.length ? '#FFB74D' : 'var(--border)'}`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: avuiPati.length ? '#E65100' : 'var(--ink-4)' }}>{avuiPati.length}</div>
          <div style={{ fontSize: 11, color: avuiPati.length ? '#E65100' : 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>avui</div>
        </div>
      </div>

      {/* Banner avui */}
      {avuiPati.length > 0 && (
        <div style={{ padding: '10px 14px', background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 10, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🔔</span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#E65100' }}>
              Avui tens torn{avuiPati.length > 1 ? 's' : ''} de pati
            </div>
            <div style={{ fontSize: 12, color: '#BF5E1A' }}>
              {avuiPati.map(p => {
                const t = TORN_LABELS[p.pid] || { label: p.pid, sub: '' };
                return `${t.label} · ${t.sub}`;
              }).join(' | ')}
            </div>
          </div>
        </div>
      )}

      {meusPatins.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>☀️</div>
          No estàs assignat/ada a cap torn de pati aquesta setmana.
        </div>
      ) : (
        <div className="card">
          <div className="card-head">
            <h3>🗓️ Torns de la setmana</h3>
          </div>
          <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {meusPatins.map(({ dia, pid }) => {
              const t = TORN_LABELS[pid] || { label: pid, sub: '', color: 'var(--ink-3)' };
              const esDia = dia === todayDia;
              return (
                <div
                  key={`${dia}-${pid}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 14px', borderRadius: 10,
                    background: esDia ? '#FFF3E0' : 'var(--bg-2)',
                    border: esDia ? '1.5px solid #FFB74D' : '1px solid var(--border)',
                  }}
                >
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: esDia ? '#E65100' : 'var(--ink-2)',
                    minWidth: 78,
                  }}>
                    {DIES_LBL[dia]}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: t.color, flex: 1 }}>
                    {t.label}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                    🕐 {t.sub}
                  </span>
                  {esDia && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: '#E65100',
                      background: 'rgba(255,183,77,.25)', borderRadius: 4,
                      padding: '2px 7px', whiteSpace: 'nowrap',
                    }}>Avui</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
