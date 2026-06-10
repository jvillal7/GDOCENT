import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { fmtData } from '../../lib/utils';
import Spinner from '../../components/Spinner';

export default function MeuTPPage() {
  const { api, perfil } = useApp();
  const [deutes, setDeutes] = useState(null);

  useEffect(() => { if (api && perfil) load(); }, [api, perfil]);

  async function load() {
    try { setDeutes(await api.getMeusDeutesTP(perfil.nom)); }
    catch { setDeutes([]); }
  }

  const pendents   = (deutes || []).filter(d => !d.retornat);
  const sensData   = pendents.filter(d => !d.data_devolucio);
  const ambData    = pendents.filter(d => !!d.data_devolucio);
  const totalMins  = pendents.reduce((s, d) => s + (d.minuts || 30), 0);
  const proper = ambData.length > 0
    ? ambData.sort((a, b) => (a.data_devolucio || '') < (b.data_devolucio || '') ? -1 : 1)[0]
    : null;

  if (deutes == null) {
    return (
      <>
        <div className="page-hdr"><h1>El meu Treball Personal</h1></div>
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      </>
    );
  }

  return (
    <>
      <div className="page-hdr"><h1>El meu Treball Personal</h1></div>

      <div className="alert alert-blue" style={{ marginBottom: 14 }}>
        Quan cobreixes durant el teu TP, es registra un deute que la cap d'estudis haurà de retornar-te.
      </div>

      {/* KPIs */}
      {pendents.length > 0 && (
        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <div className={`kpi ${sensData.length > 0 ? 'k-red' : 'k-amber'}`}>
            <div className="kpi-label">Temps pendent</div>
            <div className="kpi-value">{totalMins >= 60 ? `${totalMins / 60}h` : `${totalMins}min`}</div>
            <div className="kpi-sub">{pendents.length} cobertura{pendents.length !== 1 ? 's' : ''} sense compensar</div>
          </div>
          <div className={`kpi ${proper ? 'k-amber' : 'k-ink'}`}>
            <div className="kpi-label">Propera devolució</div>
            <div className="kpi-value" style={{ fontSize: proper ? 18 : 30 }}>
              {proper
                ? fmtData(proper.data_devolucio, { year: false })
                : '—'
              }
            </div>
            <div className="kpi-sub">{proper ? 'data acordada' : 'sense programar'}</div>
          </div>
        </div>
      )}

      {/* Avís si té deutes sense data */}
      {sensData.length > 0 && (
        <div style={{ background: '#FFF8E7', border: '1px solid #F0D5A8', borderRadius: 10, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', marginBottom: 2 }}>
              Tens {sensData.length} deute{sensData.length > 1 ? 's' : ''} de TP sense data de devolució
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Parla amb la cap d'estudis per programar quan te'l retornarà.
            </div>
          </div>
        </div>
      )}

      {pendents.length === 0 ? (
        <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>☀️</div>
          No tens cap deute de TP pendent. Tot compensat!
        </div>
      ) : (
        <>
          {sensData.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
                Sense data de devolució
              </div>
              <div className="tp-grid">
                {sensData.map(d => <MeuTPCard key={d.id} d={d} />)}
              </div>
            </div>
          )}
          {ambData.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} />
                Devolució programada
              </div>
              <div className="tp-grid">
                {ambData.map(d => <MeuTPCard key={d.id} d={d} />)}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function MeuTPCard({ d }) {
  const tensDevolucio = !!d.data_devolucio;
  const barColor = tensDevolucio ? 'var(--amber)' : 'var(--red)';
  const mins = d.minuts || 30;
  const avui = new Date().toISOString().split('T')[0];
  const esPropera = tensDevolucio && d.data_devolucio >= avui;

  return (
    <div className="tp-card">
      <div className="tp-card-bar" style={{ background: barColor }} />
      <div className="tp-card-body">
        {/* Capçalera */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 20 }}>⏱️</span>
            <span style={{ fontWeight: 700, fontSize: 15, color: tensDevolucio ? 'var(--amber)' : 'var(--red)' }}>
              {mins >= 60 ? `${mins / 60}h` : `${mins} min`} de TP
            </span>
          </div>
          <span className={`sp ${tensDevolucio ? 'sp-amber' : 'sp-red'}`} style={{ fontSize: 11 }}>
            {tensDevolucio ? '📅 Programat' : 'Pendent'}
          </span>
        </div>

        {/* Context */}
        <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px', color: 'var(--ink-2)' }}>
              Cobertura: {d.data_deute
                ? fmtData(d.data_deute, { weekday: 'short' })
                : '—'}
            </span>
          </div>
          {tensDevolucio && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Devolució:</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: esPropera ? 'var(--amber)' : 'var(--green)' }}>
                {fmtData(d.data_devolucio, { weekday: 'short' })}
              </span>
            </div>
          )}
          {d.motiu && (
            <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>{d.motiu}</div>
          )}
        </div>

        {!tensDevolucio && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic', textAlign: 'center' }}>
            Parla amb la cap d'estudis per programar la devolució
          </div>
        )}
      </div>
    </div>
  );
}
