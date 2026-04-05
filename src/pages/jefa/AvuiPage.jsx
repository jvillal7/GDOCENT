import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { FRANJES } from '../../lib/constants';
import { normGrup } from '../../lib/utils';
import { proposarCoberturaCella } from '../../lib/claude';
import Spinner from '../../components/Spinner';

const GRUPS = ['I3A','I3B','I4A','I4B','I5A','I5B','1rA','1rB','2nA','2nB','3rA','3rB','4tA','4tB','5eA','5eB','6eA','6eB'];

const BLOCS = [
  { hora: '1a hora', slots: ['f1a','f1b'] },
  { hora: '2a hora', slots: ['f2a'] },
  { hora: 'Pati A',  slots: ['patiA'] },
  { hora: 'Pati B',  slots: ['patiB'] },
  { hora: '3a hora', slots: ['f3a','f3b'] },
  { hora: 'Dinar',   slots: ['f4'] },
  { hora: '5a hora', slots: ['f5a','f5b','f5c'] },
];

export default function AvuiPage() {
  const { api, docents, normes, escola, setPage, showToast } = useApp();
  const [kpiAbs, setKpiAbs] = useState(null);
  const [kpiTP,  setKpiTP]  = useState(null);
  const [cells,  setCells]  = useState({});
  // Cobrir sub-view
  const [cobrirData, setCobrirData] = useState(null); // { grup, hora, temps, avisId }
  const [iaResult,   setIaResult]   = useState(null);
  const [iaLoading,  setIaLoading]  = useState(false);
  const [iaError,    setIaError]    = useState('');

  const today = new Date();
  const dtStr = ['Diumenge','Dilluns','Dimarts','Dimecres','Dijous','Divendres','Dissabte'][today.getDay()] +
    ', ' + today.getDate() + ' de ' +
    ['gener','febrer','març','abril','maig','juny','juliol','agost','setembre','octubre','novembre','desembre'][today.getMonth()] +
    ' de ' + today.getFullYear();

  useEffect(() => { if (api && docents.length > 0) loadData(); }, [api, docents.length]);

  async function loadData() {
    try {
      const [deutes, absencies, cobertures] = await Promise.all([
        api.getDeutesTP(),
        api.getAbsenciesAvui(),
        api.getCoberturasAvui(),
      ]);

      setKpiTP({
        count:    deutes?.length || 0,
        sensData: deutes?.filter(d => !d.data_devolucio).length || 0,
        ambData:  deutes?.filter(d =>  d.data_devolucio).length || 0,
      });

      const pendents = (absencies || []).filter(a => a.estat === 'pendent');
      const resoltes = (absencies || []).filter(a => a.estat === 'resolt');
      setKpiAbs({ pendents, resoltes });

      const newCells = {};
      (absencies || []).forEach(a => {
        const docent = docents.find(d => d.nom === a.docent_nom);
        if (!docent?.grup_principal) return;
        const grupNorm = normGrup(docent.grup_principal);
        const colGrup  = GRUPS.find(g => normGrup(g) === grupNorm);
        if (!colGrup) return;
        let franges = [];
        try { franges = JSON.parse(a.franges || '[]'); } catch {}
        franges.forEach(fid => {
          const key = `${colGrup}__${fid}`;
          if (a.estat === 'pendent') {
            newCells[key] = { estat: 'pendent', avisId: a.id, grup: colGrup, fid };
          } else if (a.estat === 'resolt' || a.estat === 'arxivat') {
            const franjaLabel = FRANJES.find(f => f.id === fid)?.label || '';
            const franjaSub   = FRANJES.find(f => f.id === fid)?.sub   || '';
            const exactFormat = `${franjaLabel} (${franjaSub})`.toLowerCase();
            const matchFn = cf =>
              cf === fid.toLowerCase() || cf === exactFormat || cf === franjaSub.toLowerCase();
            const fallbackFn = cf =>
              cf === franjaLabel.toLowerCase() || cf.startsWith(franjaLabel.toLowerCase());
            const cob =
              (cobertures || []).find(c => c.absencia_id === a.id && matchFn((c.franja || '').toLowerCase())) ||
              (cobertures || []).find(c => c.absencia_id === a.id && fallbackFn((c.franja || '').toLowerCase()));
            newCells[key] = { estat: 'resolt', cobrint: cob?.docent_cobrint_nom?.split(' ')[0] || '?' };
          }
        });
      });
      setCells(newCells);
    } catch (e) { console.error('loadAvuiData:', e); }
  }

  async function cobrimCella(grup, hora, temps, avisId, fid) {
    setCobrirData({ grup, hora, temps, avisId, fid });
    setIaResult(null);
    setIaError('');
    setIaLoading(true);
    try {
      const result = await proposarCoberturaCella(grup, hora, temps, docents, normes);
      setIaResult(result);
    } catch (e) {
      setIaError(e.message || 'Error generant proposta.');
    } finally {
      setIaLoading(false);
    }
  }

  async function confirmarCobertura() {
    if (!iaResult?.proposta) return;
    const avui = new Date().toISOString().split('T')[0];
    try {
      for (const p of iaResult.proposta) {
        await api.saveCobertura({
          escola_id:          escola.id,
          absencia_id:        cobrirData.avisId || null,
          docent_cobrint_nom: p.docent,
          franja:             cobrirData.fid || p.franja,
          docent_absent_nom:  cobrirData.grup,
          grup:               p.grup_origen || cobrirData.grup,
          data:               avui,
          tp_afectat:         p.tp_afectat || false,
          motiu:              p.motiu || '',
        });
        if (p.tp_afectat) {
          await api.saveDeuteTP({
            docent_nom:  p.docent,
            data_deute:  avui,
            motiu:       `Cobertura ${p.franja} (${cobrirData.grup})`,
            retornat:    false,
          });
        }
      }
      if (cobrirData.avisId) {
        await api.patchAbsencia(cobrirData.avisId, { estat: 'resolt' });
      }
      showToast('✓ Cobertures confirmades');
      setCobrirData(null);
      loadData();
    } catch (e) {
      showToast('Error guardant cobertura: ' + e.message);
    }
  }

  // Sub-view: Cobrir
  if (cobrirData) {
    return (
      <>
        <div className="page-hdr">
          <h1>Cobrir {cobrirData.grup}</h1>
          <p>{cobrirData.hora} · {cobrirData.temps}</p>
        </div>
        <div className="card">
          <div style={{ background: 'var(--ink)', padding: '14px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>Proposta IA</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>La IA analitza la disponibilitat...</div>
          </div>
          <div style={{ padding: 16 }}>
            {iaLoading && (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <Spinner />
                <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 10 }}>Buscant docent per {cobrirData.grup}...</p>
              </div>
            )}
            {iaError && (
              <div className="f-warn" style={{ marginBottom: 12 }}>⚠ {iaError}</div>
            )}
            {iaResult && (
              <>
                <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-mid)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--green)', marginBottom: 10 }}>
                  💡 {iaResult.resum}
                </div>
                <div className="card" style={{ marginBottom: 16, border: '1px solid var(--border-2)' }}>
                  {iaResult.proposta.map((p, i) => (
                    <div key={i} className="ia-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 10px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase' }}>{p.franja}</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{p.docent} <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 400 }}>· {p.motiu}</span></div>
                      </div>
                      {p.tp_afectat && <span className="sp sp-amber" style={{ fontSize: 10 }}>⚠ TP</span>}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="btn btn-green btn-full" onClick={confirmarCobertura}>✓ Confirmar i notificar</button>
                  <button className="btn btn-ghost btn-full" onClick={() => cobrimCella(cobrirData.grup, cobrirData.hora, cobrirData.temps, cobrirData.avisId)}>↺ Altra proposta</button>
                </div>
              </>
            )}
            {iaError && (
              <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={() => cobrimCella(cobrirData.grup, cobrirData.hora, cobrirData.temps, cobrirData.avisId)}>↺ Tornar a intentar</button>
            )}
          </div>
        </div>
        <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={() => setCobrirData(null)}>← Tornar a Avui</button>
      </>
    );
  }

  // Main grid view
  return (
    <>
      <div className="page-hdr" style={{ marginBottom: 12 }}><h1>Avui</h1><p>{dtStr}</p></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <KPICard color="red" label="Absències avui">
          {kpiAbs == null ? <Spinner size={20} /> : (
            <>
              <div style={{ fontFamily: 'Georgia,serif', fontSize: 36, lineHeight: 1, marginBottom: 5, color: kpiAbs.pendents.length > 0 ? 'var(--red)' : 'var(--green)' }}>
                {kpiAbs.pendents.length}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {kpiAbs.pendents.length === 0
                  ? <span className="sp sp-green" style={{ fontSize: 10 }}>Tot cobert</span>
                  : kpiAbs.pendents.map(a => <span key={a.id} className="sp sp-red" style={{ fontSize: 10 }}>{a.docent_nom.split(' ')[0]}</span>)
                }
                {kpiAbs.resoltes.length > 0 && <span className="sp sp-amber" style={{ fontSize: 10 }}>{kpiAbs.resoltes.length} resolt</span>}
              </div>
            </>
          )}
        </KPICard>
        <KPICard color="amber" label="Deutes TP">
          {kpiTP == null ? <Spinner size={20} /> : (
            <>
              <div style={{ fontFamily: 'Georgia,serif', fontSize: 36, lineHeight: 1, marginBottom: 5, color: 'var(--amber)' }}>{kpiTP.count}</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {kpiTP.sensData > 0 && <span className="sp sp-red" style={{ fontSize: 10 }}>{kpiTP.sensData} sense data</span>}
                {kpiTP.ambData  > 0 && <span className="sp sp-amber" style={{ fontSize: 10 }}>{kpiTP.ambData} programat</span>}
                {kpiTP.count === 0 && <span className="sp sp-green" style={{ fontSize: 10 }}>Tot al dia</span>}
              </div>
            </>
          )}
        </KPICard>
      </div>

      <div className="alert alert-amber" style={{ cursor: 'pointer', padding: '9px 12px', fontSize: 12.5 }} onClick={() => setPage('javis')}>
        🔔 <div>Consulta els <strong>Avisos rebuts</strong> per veure les absències del dia. <span style={{ textDecoration: 'underline' }}>Veure →</span></div>
      </div>

      <div className="card">
        <div className="card-head" style={{ padding: '10px 14px' }}>
          <h3 style={{ fontSize: 13 }}>Estat dels grups</h3>
          <div style={{ display: 'flex', gap: 8, fontSize: 10.5, color: 'var(--ink-3)' }}>
            {[['var(--green-bg)','var(--green-mid)','OK'],['var(--amber-bg)','#F0D5A8','Cobert'],['var(--red-bg)','#F0C0B8','Pendent']].map(([bg,bc,lbl]) => (
              <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: bg, border: `1px solid ${bc}`, display: 'inline-block' }} />
                {lbl}
              </span>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
            <thead>
              <tr>
                <Th sticky left={0}  minW={58} zIdx={2}>Hora</Th>
                <Th sticky left={58} minW={60} zIdx={2}>Tram</Th>
                {GRUPS.map(g => <Th key={g}>{g}</Th>)}
              </tr>
            </thead>
            <tbody>
              {BLOCS.map(bloc => bloc.slots.map((fid, si) => {
                const franja = FRANJES.find(f => f.id === fid);
                return (
                  <tr key={fid}>
                    {si === 0 && (
                      <Td rowSpan={bloc.slots.length} sticky left={0} minW={58} zIdx={1} style={{ fontWeight: 700, verticalAlign: 'middle' }}>
                        {bloc.hora}
                      </Td>
                    )}
                    <Td sticky left={58} minW={60} zIdx={1} style={{ fontSize: 9 }}>{franja?.sub}</Td>
                    {GRUPS.map(g => {
                      const cell = cells[`${g}__${fid}`];
                      const bg   = cell?.estat === 'pendent' ? 'var(--red-bg)'   : cell?.estat === 'resolt' ? 'var(--amber-bg)' : 'var(--green-bg)';
                      const bc   = cell?.estat === 'pendent' ? '#F0C0B8'         : cell?.estat === 'resolt' ? '#F0D5A8'         : 'var(--green-mid)';
                      return (
                        <td key={g}
                          style={{ padding: '3px 2px', border: `1px solid ${bc}`, textAlign: 'center', background: bg, cursor: cell?.estat === 'pendent' ? 'pointer' : 'default', minWidth: 48 }}
                          onClick={() => cell?.estat === 'pendent' && cobrimCella(cell.grup, franja.hora, franja.sub, cell.avisId, fid)}
                        >
                          {cell?.estat === 'pendent' && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)' }}>!</span>}
                          {cell?.estat === 'resolt'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--amber)', display: 'block', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell.cobrint}</span>}
                          {!cell && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)' }}>✓</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function KPICard({ color, label, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '13px 14px', boxShadow: 'var(--sh)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: `var(--${color})` }} />
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function Th({ children, sticky, left, minW, zIdx }) {
  return (
    <th style={{
      padding: '5px 3px', border: '1px solid var(--border)', background: 'var(--bg-2)',
      fontSize: 9, fontWeight: 600, color: 'var(--ink-2)', textAlign: 'center', whiteSpace: 'nowrap',
      ...(sticky ? { position: 'sticky', left, zIndex: zIdx, textAlign: 'left', minWidth: minW, maxWidth: minW } : {}),
    }}>{children}</th>
  );
}

function Td({ children, rowSpan, sticky, left, minW, zIdx, style = {} }) {
  return (
    <td rowSpan={rowSpan} style={{
      padding: '4px 5px', border: '1px solid var(--border)', background: 'var(--bg-2)',
      fontSize: 10, color: 'var(--ink-2)', whiteSpace: 'nowrap',
      ...(sticky ? { position: 'sticky', left, zIndex: zIdx, minWidth: minW, maxWidth: minW } : {}),
      ...style,
    }}>{children}</td>
  );
}
