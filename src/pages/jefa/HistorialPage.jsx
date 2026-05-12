import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import FrangesChips from '../../components/FrangesChips';
import Spinner from '../../components/Spinner';

const MESOS_CAT = ['Gener','Febrer','Març','Abril','Maig','Juny','Juliol','Agost','Setembre','Octubre','Novembre','Desembre'];
const PAGE_SIZE = 50;

export default function HistorialPage() {
  const { api, escola } = useApp();
  const isOriol = escola?.nom?.toLowerCase().includes('oriol');

  const [absencies, setAbsencies]     = useState(null);
  const [cobertures, setCobertures]   = useState([]);
  const [hasMore, setHasMore]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewMode, setViewMode]       = useState('list');
  const [calNav, setCalNav]           = useState(() => { const d = new Date(); return { any: d.getFullYear(), mes: d.getMonth() }; });
  const [diaFiltrat, setDiaFiltrat]   = useState(null);
  const [mesFiltrat, setMesFiltrat]   = useState('tots');
  const [openDies, setOpenDies]       = useState(new Set());

  useEffect(() => { if (api) load(); }, [api]);

  async function load() {
    try {
      const [abs, cob] = await Promise.all([
        api.getAbsenciesHistorial(0, PAGE_SIZE),
        api.getCobertures().catch(() => []),
      ]);
      setHasMore((abs || []).length === PAGE_SIZE);
      setAbsencies(abs || []);
      setCobertures(cob || []);
    } catch {
      setAbsencies([]);
      setCobertures([]);
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore || !absencies) return;
    setLoadingMore(true);
    try {
      const more = await api.getAbsenciesHistorial(absencies.length, PAGE_SIZE);
      setHasMore((more || []).length === PAGE_SIZE);
      setAbsencies(prev => [...prev, ...(more || [])]);
    } finally {
      setLoadingMore(false);
    }
  }

  const topAbsents = useMemo(() => {
    if (!absencies) return [];
    const map = {};
    absencies.filter(a => a.tipus !== 'sortida').forEach(a => {
      if (!map[a.docent_nom]) map[a.docent_nom] = { total: 0, pendents: 0 };
      map[a.docent_nom].total++;
      if (a.estat === 'pendent') map[a.docent_nom].pendents++;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
  }, [absencies]);

  const topCobridors = useMemo(() => {
    const map = {};
    cobertures.forEach(c => {
      if (!c.docent_cobrint_nom) return;
      map[c.docent_cobrint_nom] = (map[c.docent_cobrint_nom] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [cobertures]);

  const byDay = useMemo(() => {
    if (!absencies) return {};
    const result = {};
    absencies.forEach(a => {
      const d = a.data || 'sense-data';
      if (!result[d]) result[d] = { abs: [], cobs: [] };
      result[d].abs.push(a);
    });
    cobertures.forEach(c => {
      const d = c.data || 'sense-data';
      if (!result[d]) result[d] = { abs: [], cobs: [] };
      result[d].cobs.push(c);
    });
    return result;
  }, [absencies, cobertures]);

  const mesosDisponibles = useMemo(() => {
    const mesos = new Set();
    Object.keys(byDay).forEach(d => { if (d.length === 10) mesos.add(d.slice(0, 7)); });
    return [...mesos].sort((a, b) => b.localeCompare(a)).slice(0, 12);
  }, [byDay]);

  const diesFiltrats = useMemo(() => {
    const tots = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
    if (diaFiltrat) return tots.filter(d => d === diaFiltrat);
    if (mesFiltrat !== 'tots') return tots.filter(d => d.startsWith(mesFiltrat));
    return tots;
  }, [byDay, diaFiltrat, mesFiltrat]);

  function toggleDia(dia) {
    setOpenDies(prev => {
      const next = new Set(prev);
      next.has(dia) ? next.delete(dia) : next.add(dia);
      return next;
    });
  }

  function exportCSV() {
    const rows = [['Data', 'Dia de la setmana', 'Docent', 'Motiu', 'Estat', 'Cobert per']];
    diesFiltrats.forEach(dia => {
      const { abs, cobs } = byDay[dia] || {};
      (abs || []).forEach(a => {
        const cobsNoms = [...new Set(
          (cobs || [])
            .filter(c => c.absencia_id === a.id || c.docent_absent_nom === a.docent_nom)
            .map(c => c.docent_cobrint_nom).filter(Boolean)
        )].join('; ');
        const dataFmt = dia !== 'sense-data'
          ? new Date(dia + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : 'Sense data';
        rows.push([dia, dataFmt, a.docent_nom, a.motiu || '', a.estat, cobsNoms]);
      });
    });
    const csv = rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial_${mesFiltrat !== 'tots' ? mesFiltrat : new Date().toISOString().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (absencies == null) {
    return <><div className="page-hdr"><h1>Historial</h1></div><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></>;
  }

  const absenciesReals = absencies.filter(a => a.tipus !== 'sortida');
  const total          = absenciesReals.length;
  const gestionades    = absenciesReals.filter(a => a.estat !== 'pendent').length;

  return (
    <>
      <div className="page-hdr"><h1>Historial</h1><p>Registre d'absències per dia</p></div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi k-red"><div className="kpi-label">Total absències</div><div className="kpi-value">{total}</div></div>
        <div className="kpi k-green"><div className="kpi-label">Gestionades</div><div className="kpi-value">{gestionades}</div></div>
        <div className="kpi k-amber"><div className="kpi-label">Cobertures</div><div className="kpi-value">{cobertures.length}</div></div>
      </div>

      {(topAbsents.length > 0 || topCobridors.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {topAbsents.length > 0 && (
            <div className="card">
              <div className="card-head" style={{ padding: '9px 12px' }}><h3 style={{ fontSize: 12 }}>Absències per docent</h3></div>
              {topAbsents.map(([nom, s]) => (
                <div key={nom} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, fontSize: 11.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom.split(' ')[0]}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--red)', width: Math.max(8, s.total * 10) }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', minWidth: 16, textAlign: 'right' }}>{s.total}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {topCobridors.length > 0 && (
            <div className="card">
              <div className="card-head" style={{ padding: '9px 12px' }}><h3 style={{ fontSize: 12 }}>Qui cobreix més</h3></div>
              {topCobridors.map(([nom, cnt]) => (
                <div key={nom} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, fontSize: 11.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom.split(' ')[0]}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--green)', width: Math.max(8, cnt * 10) }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', minWidth: 16, textAlign: 'right' }}>{cnt}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Controls: filtre + toggle vista + CSV */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={mesFiltrat}
          onChange={e => { setMesFiltrat(e.target.value); setDiaFiltrat(null); }}
          style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', flex: 1, minWidth: 140 }}
        >
          <option value="tots">Tots els mesos</option>
          {mesosDisponibles.map(m => {
            const [y, mo] = m.split('-');
            return <option key={m} value={m}>{MESOS_CAT[parseInt(mo) - 1]} {y}</option>;
          })}
        </select>

        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => { setViewMode('list'); setDiaFiltrat(null); }}
            style={{ padding: '6px 12px', fontSize: 12, border: 'none', cursor: 'pointer', background: viewMode === 'list' ? 'var(--ink)' : 'var(--bg)', color: viewMode === 'list' ? '#fff' : 'var(--ink-3)', fontWeight: viewMode === 'list' ? 600 : 400, fontFamily: 'inherit' }}>
            ☰ Llista
          </button>
          <button onClick={() => setViewMode('calendar')}
            style={{ padding: '6px 12px', fontSize: 12, border: 'none', cursor: 'pointer', background: viewMode === 'calendar' ? 'var(--ink)' : 'var(--bg)', color: viewMode === 'calendar' ? '#fff' : 'var(--ink-3)', fontWeight: viewMode === 'calendar' ? 600 : 400, fontFamily: 'inherit' }}>
            📅 Calendari
          </button>
        </div>

        <button onClick={exportCSV}
          style={{ padding: '6px 12px', fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink-3)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          ⬇ CSV
        </button>

        {diaFiltrat && (
          <button onClick={() => setDiaFiltrat(null)}
            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 8, border: '1px solid var(--red)', background: 'var(--red-bg)', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            ✕ {new Date(diaFiltrat + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })}
          </button>
        )}
      </div>

      {/* Vista calendari */}
      {viewMode === 'calendar' && (
        <div className="card" style={{ marginBottom: 12, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <button
              onClick={() => setCalNav(({ any, mes }) => mes === 0 ? { any: any - 1, mes: 11 } : { any, mes: mes - 1 })}
              style={{ padding: '4px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit', color: 'var(--ink)' }}
            >‹</button>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
              {MESOS_CAT[calNav.mes]} {calNav.any}
            </div>
            <button
              onClick={() => setCalNav(({ any, mes }) => mes === 11 ? { any: any + 1, mes: 0 } : { any, mes: mes + 1 })}
              style={{ padding: '4px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit', color: 'var(--ink)' }}
            >›</button>
          </div>
          <CalendariMes {...calNav} byDay={byDay} diaSeleccionat={diaFiltrat} onDiaClick={setDiaFiltrat} />
        </div>
      )}

      {/* Llista per dia */}
      {diesFiltrats.length === 0 && (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>Cap absència registrada.</div>
      )}

      {diesFiltrats.map(dia => {
        const { abs, cobs } = byDay[dia];
        const dataFmt = dia !== 'sense-data'
          ? new Date(dia + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : 'Sense data';
        const absReals   = abs.filter(a => a.tipus !== 'sortida');
        const sortides   = abs.filter(a => a.tipus === 'sortida');
        const allOk      = abs.every(a => a.estat !== 'pendent');
        const isOpen     = openDies.has(dia);
        return (
          <div key={dia} className="card" style={{ marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => toggleDia(dia)}
              style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderBottom: isOpen ? '1px solid var(--border)' : 'none' }}>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{dataFmt}</div>
              {absReals.length > 0 && <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{absReals.length} abs.</span>}
              {sortides.length > 0 && <span style={{ fontSize: 11, color: 'var(--blue)' }}>🚌 {sortides.length}</span>}
              <span className={`sp ${allOk ? 'sp-green' : 'sp-red'}`}>{allOk ? 'Cobert' : 'Pendent'}</span>
            </div>
            {isOpen && abs.map(a => {
              const dObj = a.data ? new Date(a.data + 'T12:00:00') : new Date();
              const myCobs = cobs.filter(c => c.absencia_id === a.id || c.docent_absent_nom === a.docent_nom);
              const esSortida = a.tipus === 'sortida';
              return (
                <div key={a.id} className={`avis-card${a.estat === 'pendent' ? ' pendent' : ''}`}
                  style={{ margin: '8px 14px', boxShadow: 'none', borderColor: esSortida ? 'var(--blue-mid, #C0D0EE)' : 'var(--border)', background: esSortida ? 'var(--blue-bg)' : undefined }}>
                  <div className="ac-top" style={{ padding: 12 }}>
                    <div className="date-badge" style={{ transform: 'scale(0.85)', marginLeft: -4, opacity: esSortida ? 0.7 : 1 }}>
                      <div className="db-day">{dObj.getDate()}</div>
                      <div className="db-month">{dObj.toLocaleDateString('ca-ES', { month: 'short' }).replace('.', '').toUpperCase()}</div>
                    </div>
                    <div className="ac-content">
                      <div className="ac-name" style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {a.docent_nom}
                        {esSortida && <span style={{ fontSize: 10, background: 'var(--blue-bg)', border: '1px solid var(--blue-mid, #C0D0EE)', borderRadius: 20, padding: '1px 7px', color: 'var(--blue)', fontWeight: 700 }}>🚌 Sortida</span>}
                      </div>
                      <div className="ac-motiu">{a.motiu || 'Sense motiu'}</div>
                    </div>
                    <div className="ac-side">
                      {a.estat === 'pendent' ? <span className="sp sp-red">Pendent</span> : <span className="sp sp-green">Resolt</span>}
                    </div>
                  </div>
                  <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      <FrangesChips frangesJson={a.franges} isOriol={isOriol} />
                    </div>
                    {(() => {
                      const nomsUnics = [...new Set(myCobs.map(c => c.docent_cobrint_nom).filter(Boolean))];
                      if (nomsUnics.length > 0) return (
                        <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-mid)', borderRadius: 10, padding: '8px 10px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 7 }}>Cobert per</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {nomsUnics.slice(0, 4).map(nom => {
                              const parts = nom.trim().split(' ');
                              const ini = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
                              return (
                                <div key={nom} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', borderRadius: 20, padding: '4px 10px 4px 4px', border: '1px solid var(--green-mid)' }}>
                                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--green)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ini.toUpperCase()}</div>
                                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{parts[0]}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                      if (a.estat !== 'pendent') return (
                        <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-mid)', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, color: 'var(--green)', fontWeight: 600 }}>✓ Marcat com a resolt</div>
                      );
                      return null;
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {hasMore && !diaFiltrat && mesFiltrat === 'tots' && (
        <button onClick={loadMore} disabled={loadingMore}
          style={{ width: '100%', padding: 14, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, fontWeight: 500, color: 'var(--ink-3)', cursor: loadingMore ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {loadingMore ? <><Spinner size={14} /> Carregant...</> : `Carregar ${PAGE_SIZE} registres més`}
        </button>
      )}
    </>
  );
}

function CalendariMes({ any, mes, byDay, diaSeleccionat, onDiaClick }) {
  const DIES_CAP = ['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'];
  const primerDia = new Date(any, mes, 1);
  const diesDelMes = new Date(any, mes + 1, 0).getDate();
  const offset = (primerDia.getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= diesDelMes; d++) {
    const date = new Date(any, mes, d);
    const iso = date.toISOString().split('T')[0];
    cells.push({ d, iso, diaset: date.getDay() });
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
      {DIES_CAP.map(d => (
        <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--ink-4)', padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>
      ))}
      {cells.map((cell, i) => {
        if (!cell) return <div key={`e-${i}`} />;
        const { d, iso, diaset } = cell;
        const absAvui = byDay[iso]?.abs?.length || 0;
        const isSelected = diaSeleccionat === iso;
        const isWeekend = diaset === 0 || diaset === 6;
        return (
          <div key={iso} onClick={() => absAvui > 0 && onDiaClick(isSelected ? null : iso)}
            style={{
              padding: '5px 2px 4px', textAlign: 'center', fontSize: 11, borderRadius: 6,
              cursor: absAvui > 0 ? 'pointer' : 'default',
              background: isSelected ? 'var(--ink)' : absAvui > 0 ? 'var(--red-bg)' : 'transparent',
              color: isSelected ? '#fff' : isWeekend ? 'var(--ink-4)' : 'var(--ink)',
              fontWeight: absAvui > 0 ? 600 : 400,
              border: `1px solid ${isSelected ? 'var(--ink)' : absAvui > 0 ? '#F0C0B8' : 'transparent'}`,
              transition: 'background .1s',
            }}>
            {d}
            {absAvui > 0 && (
              <div style={{ width: 16, height: 14, borderRadius: 4, background: isSelected ? 'rgba(255,255,255,.25)' : 'var(--red)', color: '#fff', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px auto 0' }}>
                {absAvui}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
