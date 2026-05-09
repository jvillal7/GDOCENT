import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { FRANJES, SIEI_ALUMNES, FRANJES_ORIOL, GRUPS_ORIOL, BLOCS_ORIOL } from '../../lib/constants';
import { normGrup, parseFranges } from '../../lib/utils';
import Spinner from '../../components/Spinner';

const GRUPS_RIVO = ['I3A','I3B','I4A','I4B','I5A','I5B','1rA','1rB','2nA','2nB','3rA','3rB','4tA','4tB','5eA','5eB','6eA','6eB'];

const BLOCS_RIVO = [
  { hora: '1a hora', slots: ['f1a','f1b'] },
  { hora: '2a hora', slots: ['f2a'] },
  { hora: 'Pati A',  slots: ['patiA'] },
  { hora: 'Pati B',  slots: ['patiB'] },
  { hora: '3a hora', slots: ['f3a','f3b'] },
  { hora: 'Dinar',   slots: ['f4'] },
  { hora: 'Tarda',   slots: ['f5a','f5b','f5c'] },
];

export default function AvuiPage() {
  const { api, docents, escola, setPage } = useApp();
  const isOriol = escola?.nom?.toLowerCase().includes('oriol');
  const GRUPS   = isOriol ? GRUPS_ORIOL : GRUPS_RIVO;
  const BLOCS   = isOriol ? BLOCS_ORIOL : BLOCS_RIVO;
  const FRANJES_ACT = isOriol ? FRANJES_ORIOL : FRANJES;

  const [kpiAbs, setKpiAbs] = useState(null);
  const [kpiTP,  setKpiTP]  = useState(null);
  const [cells,     setCells]     = useState({});
  const [sieiCells, setSieiCells] = useState({});
  const [provisionals, setProvisionals] = useState([]);

  const today = new Date();
  const dtStr = ['Diumenge','Dilluns','Dimarts','Dimecres','Dijous','Divendres','Dissabte'][today.getDay()] +
    ', ' + today.getDate() + ' de ' +
    ['gener','febrer','març','abril','maig','juny','juliol','agost','setembre','octubre','novembre','desembre'][today.getMonth()] +
    ' de ' + today.getFullYear();

  useEffect(() => { if (api && docents.length > 0) loadData(); }, [api, docents.length]);

  async function loadData() {
    try {
      const [deutes, absencies, cobertures, provsDeuma] = await Promise.all([
        api.getDeutesTP(),
        api.getAbsenciesAvui(),
        api.getCoberturasAvui(),
        api.getAbsenciesProvisionals().catch(() => []),
      ]);
      setProvisionals(provsDeuma || []);

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
        const franges = parseFranges(a.franges);
        franges.forEach(fid => {
          const key = `${colGrup}__${fid}`;
          if (a.estat === 'pendent') {
            newCells[key] = { estat: 'pendent', avisId: a.id, grup: colGrup, fid };
          } else if (a.estat === 'resolt' || a.estat === 'arxivat') {
            const cob = findCobertura(cobertures, a.id, fid, FRANJES_ACT, a.docent_nom);
            newCells[key] = { estat: 'resolt', cobrint: cob?.docent_cobrint_nom?.split(' ')[0] || '?' };
          }
        });
      });
      setCells(newCells);

      const sieiStudents = escola?.nom?.toLowerCase().includes('rivo') ? SIEI_ALUMNES.rivo : [];
      const newSieiCells = {};
      if (sieiStudents.length > 0) {
        const todayDia = ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][today.getDay()];
        (absencies || []).forEach(a => {
          const docent = docents.find(d => d.nom === a.docent_nom);
          if (!docent?.horari) return;
          const franges = parseFranges(a.franges);
          franges.forEach(fid => {
            const val = (docent.horari?.[todayDia]?.[fid] || '').toUpperCase();
            const matched = sieiStudents.find(s => val.includes(s));
            if (!matched) return;
            const key = `${matched}__${fid}`;
            if (a.estat === 'pendent') {
              newSieiCells[key] = { estat: 'pendent', avisId: a.id, student: matched, fid };
            } else {
              const cob = findCobertura(cobertures, a.id, fid, FRANJES_ACT, a.docent_nom);
              newSieiCells[key] = { estat: 'resolt', cobrint: cob?.docent_cobrint_nom?.split(' ')[0] || '?' };
            }
          });
        });
      }
      setSieiCells(newSieiCells);

    } catch (e) { console.error('loadAvuiData:', e); }
  }

  const groupSpans = useMemo(() => computeSpans(GRUPS, cells, BLOCS), [cells, isOriol]);
  const sieiSpans  = useMemo(() => computeSpans(SIEI_ALUMNES.rivo || [], sieiCells, BLOCS), [sieiCells, isOriol]);

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

      {provisionals.length > 0 && (
        <div className="alert alert-amber" style={{ cursor: 'pointer', padding: '9px 12px', fontSize: 12.5, marginBottom: 8 }} onClick={() => setPage('javis')}>
          📅 <div>
            <strong>Demà tens {provisionals.length} cobertura{provisionals.length > 1 ? 's' : ''} provisional{provisionals.length > 1 ? 's' : ''}</strong> per confirmar: {provisionals.map(a => a.docent_nom.split(' ')[0]).join(', ')}. <span style={{ textDecoration: 'underline' }}>Confirmar →</span>
          </div>
        </div>
      )}

      <div className="alert alert-amber" style={{ cursor: 'pointer', padding: '9px 12px', fontSize: 12.5 }} onClick={() => setPage('javis')}>
        🔔 <div>Consulta els <strong>Avisos rebuts</strong> per veure les absències del dia. <span style={{ textDecoration: 'underline' }}>Veure →</span></div>
      </div>

      <GraellaCard
        title="Estat dels grups"
        items={GRUPS}
        cells={cells}
        spans={groupSpans}
        blocs={BLOCS}
        franjesAct={FRANJES_ACT}
        pendentLabel="Pendent"
        onPendentClick={() => setPage('javis')}
      />

      {escola?.nom?.toLowerCase().includes('rivo') && (
        <GraellaCard
          title="SIEI · Alumnes"
          items={SIEI_ALUMNES.rivo}
          cells={sieiCells}
          spans={sieiSpans}
          blocs={BLOCS}
          franjesAct={FRANJES_ACT}
          pendentLabel="Sense suport"
          onPendentClick={() => setPage('javis')}
          style={{ marginTop: 14 }}
        />
      )}
    </>
  );
}

function findCobertura(cobertures, absenciaId, fid, franjesAct, docentAbsentNom) {
  const franjaLabel = franjesAct.find(f => f.id === fid)?.label || '';
  const franjaSub   = franjesAct.find(f => f.id === fid)?.sub   || '';
  const exactFormat = `${franjaLabel} (${franjaSub})`.toLowerCase();
  const matchFn    = cf => cf === fid.toLowerCase() || cf === exactFormat || cf === franjaSub.toLowerCase();
  const fallbackFn = cf => cf === franjaLabel.toLowerCase() || cf.startsWith(franjaLabel.toLowerCase());
  const pool = cobertures || [];

  // Intent 1: absencia_id exacte + franja
  const byId = pool.find(c => c.absencia_id === absenciaId && matchFn((c.franja || '').toLowerCase()))
            || pool.find(c => c.absencia_id === absenciaId && fallbackFn((c.franja || '').toLowerCase()));
  if (byId) return byId;

  // Intent 2 (fallback): absencia_id null/erroni → buscar per docent absent + franja
  // Evita mostrar '?' quan absencia_id no coincideix (ex: guardat manualment sense ID)
  if (docentAbsentNom) {
    return pool.find(c => c.docent_absent_nom === docentAbsentNom && matchFn((c.franja || '').toLowerCase()))
        || pool.find(c => c.docent_absent_nom === docentAbsentNom && fallbackFn((c.franja || '').toLowerCase()));
  }
  return undefined;
}

function computeSpans(items, cellsMap, blocs) {
  const allSlots = blocs.flatMap(b => b.slots);
  const spans = {};
  for (const item of items) {
    spans[item] = {};
    let i = 0;
    while (i < allSlots.length) {
      const fid = allSlots[i];
      const cell = cellsMap[`${item}__${fid}`];
      if (cell?.estat === 'resolt' && cell.cobrint) {
        let span = 1;
        while (i + span < allSlots.length) {
          const next = cellsMap[`${item}__${allSlots[i + span]}`];
          if (next?.estat === 'resolt' && next.cobrint === cell.cobrint) span++;
          else break;
        }
        spans[item][fid] = { rowSpan: span };
        for (let j = 1; j < span; j++) spans[item][allSlots[i + j]] = { skip: true };
        i += span;
      } else if (cell?.estat === 'pendent') {
        let span = 1;
        while (i + span < allSlots.length) {
          const next = cellsMap[`${item}__${allSlots[i + span]}`];
          if (next?.estat === 'pendent' && next.avisId === cell.avisId) span++;
          else break;
        }
        spans[item][fid] = { rowSpan: span };
        for (let j = 1; j < span; j++) spans[item][allSlots[i + j]] = { skip: true };
        i += span;
      } else {
        spans[item][fid] = { rowSpan: 1 };
        i++;
      }
    }
  }
  return spans;
}

function GraellaCard({ title, items, cells, spans, blocs, franjesAct, pendentLabel = 'Pendent', onPendentClick, style }) {
  return (
    <div className="card" style={style}>
      <div className="card-head" style={{ padding: '10px 14px' }}>
        <h3 style={{ fontSize: 13 }}>{title}</h3>
        <div style={{ display: 'flex', gap: 8, fontSize: 10.5, color: 'var(--ink-3)' }}>
          {[['var(--green-bg)','var(--green-mid)','OK'],['var(--amber-bg)','#F0D5A8','Cobert'],['var(--red-bg)','#F0C0B8', pendentLabel]].map(([bg,bc,lbl]) => (
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
              {items.map(g => <Th key={g}>{g}</Th>)}
            </tr>
          </thead>
          <tbody>
            {blocs.map(bloc => bloc.slots.map((fid, si) => {
              const franja = franjesAct.find(f => f.id === fid);
              return (
                <tr key={fid}>
                  {si === 0 && (
                    <Td rowSpan={bloc.slots.length} sticky left={0} minW={58} zIdx={1} style={{ fontWeight: 700, verticalAlign: 'middle' }}>
                      {bloc.hora}
                    </Td>
                  )}
                  <Td sticky left={58} minW={60} zIdx={1} style={{ fontSize: 9 }}>{(franja?.sub || '').split(' · ')[0]}</Td>
                  {items.map(item => {
                    const sp = spans[item]?.[fid] || {};
                    if (sp.skip) return null;
                    const cell = cells[`${item}__${fid}`];
                    const bg = cell?.estat === 'pendent' ? 'var(--red-bg)' : cell?.estat === 'resolt' ? 'var(--amber-bg)' : 'var(--green-bg)';
                    const bc = cell?.estat === 'pendent' ? '#F0C0B8' : cell?.estat === 'resolt' ? '#F0D5A8' : 'var(--green-mid)';
                    return (
                      <td key={item} rowSpan={sp.rowSpan || 1}
                        style={{ padding: '3px 2px', border: `1px solid ${bc}`, textAlign: 'center', background: bg, cursor: cell?.estat === 'pendent' ? 'pointer' : 'default', minWidth: 48, verticalAlign: 'middle' }}
                        onClick={() => cell?.estat === 'pendent' && onPendentClick?.()}
                      >
                        {cell?.estat === 'pendent' && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)' }}>!{sp.rowSpan > 1 ? ` ×${sp.rowSpan}` : ''}</span>}
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
