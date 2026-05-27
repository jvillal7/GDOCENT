import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { FRANJES, FRANJES_ORIOL } from '../../lib/constants';
import Spinner from '../../components/Spinner';

const DAYS_CAT = ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'];

function nextWeekday(dateObj, dir) {
  const d = new Date(dateObj);
  do { d.setDate(d.getDate() + dir); } while (d.getDay() === 0 || d.getDay() === 6);
  return d;
}

const TORN_LABELS = {
  patiA:     { label: 'Torn A',             sub: '10:30–11:00', color: 'var(--green)' },
  patiB:     { label: 'Torn B',             sub: '11:00–11:30', color: 'var(--blue)'  },
  patiB_inf: { label: 'Torn B · Infantil',  sub: '11:00–11:30', color: 'var(--blue)'  },
  patiB_pri: { label: 'Torn B · Primària',  sub: '11:00–11:30', color: 'var(--purple)'},
  opatiA:    { label: 'Pati A',             sub: '11:00–11:30', color: 'var(--green)' },
  opatiB:    { label: 'Pati B',             sub: '11:30–12:00', color: 'var(--blue)'  },
};
const DIES_SETMANA = ['dilluns','dimarts','dimecres','dijous','divendres'];
const DIES_LBL_LG  = { dilluns:'Dilluns', dimarts:'Dimarts', dimecres:'Dimecres', dijous:'Dijous', divendres:'Divendres' };

export default function CoberturasPage() {
  const { api, perfil, escola } = useApp();
  const isOriol = escola?.nom?.toLowerCase().includes('oriol');
  const FRANJES_ACT = isOriol ? FRANJES_ORIOL : FRANJES;

  const todayISO = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    if (d.getDay() === 0 || d.getDay() === 6) return nextWeekday(d, 1).toISOString().split('T')[0];
    return d.toISOString().split('T')[0];
  });
  const [cobertures, setCobertures] = useState(null);
  const [me,         setMe]         = useState(null);
  const [configIntensiva, setConfigIntensiva] = useState(null);
  const [patiTorns,  setPatiTorns]  = useState(null); // { dia: { patioId: [nom,...] } }
  const [notesFn, setNotesFn] = useState(null);
  const [notes,   setNotes]   = useState(null);
  const [fitxers, setFitxers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [vists, setVists] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('gd_cobs_vistes') || '[]')); }
    catch { return new Set(); }
  });

  useEffect(() => { if (api && perfil) loadDocent(); }, [api, perfil]);
  useEffect(() => { if (api && perfil && me !== undefined) loadCobertures(); }, [api, perfil, selectedDate]);

  async function loadDocent() {
    try {
      const [docents, cfgRes, patiRes] = await Promise.all([
        api.getDocents(),
        api.getConfigIntensiva().catch(() => null),
        api.getPatiTorns().catch(() => null),
      ]);
      setMe(docents?.find(d => d.nom === perfil.nom) || null);
      setConfigIntensiva(cfgRes?.[0]?.config_intensiva || null);
      setPatiTorns(patiRes?.[0]?.config_pati?.torns || null);
    } catch { setMe(null); }
  }

  // Detectar si selectedDate és dins del rang de jornada intensiva activa
  const esPeriodeIntensiu = configIntensiva?.actiu
    && configIntensiva?.data_inici
    && configIntensiva?.data_fi
    && selectedDate >= configIntensiva.data_inici
    && selectedDate <= configIntensiva.data_fi;

  async function loadCobertures() {
    try {
      const cobs = await api.getCoberturesByDocentData(perfil.nom, selectedDate);
      setCobertures(cobs || []);
    } catch { setCobertures([]); }
  }

  function canviarDia(dir) {
    const d = new Date(selectedDate + 'T12:00:00');
    setSelectedDate(nextWeekday(d, dir).toISOString().split('T')[0]);
    setCobertures(null);
  }

  function marcarVist(cobId) {
    setVists(prev => {
      const next = new Set(prev);
      next.add(String(cobId));
      localStorage.setItem('gd_cobs_vistes', JSON.stringify([...next]));
      return next;
    });
  }

  async function openNotes(absenciaId, absent, grup) {
    setNotesFn({ absenciaId, absent, grup });
    setNotes(null);
    setFitxers([]);
    setLoading(true);
    try {
      const abs = await api.getAbsenciaById(absenciaId);
      setNotes(abs?.[0]?.notes || '');
      setFitxers(abs?.[0]?.fitxers || []);
    } catch { setNotes(''); setFitxers([]); }
    finally { setLoading(false); }
  }

  const dateObj  = new Date(selectedDate + 'T12:00:00');
  const diaCat   = DAYS_CAT[dateObj.getDay()];
  const esAvui   = selectedDate === todayISO;

  if (me === null && cobertures === null) {
    return <><div className="page-hdr"><h1>Les meves cobertures</h1></div><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></>;
  }

  if (me !== null && !me?.horari) {
    return (
      <>
        <div className="page-hdr"><h1>Les meves cobertures</h1></div>
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-4)' }}>
          L'administració encara no ha carregat el teu horari.
        </div>
      </>
    );
  }

  // Usar horari intensiu si estem en període intensiu i el docent el té
  const horariActiu = (esPeriodeIntensiu && me?.horari_intensiu) ? me.horari_intensiu : me?.horari;
  const myHorari = horariActiu?.[diaCat] || {};

  return (
    <>
      <div className="page-hdr"><h1>Les meves cobertures</h1></div>

      {/* Banner jornada intensiva */}
      {esPeriodeIntensiu && me?.horari_intensiu && (
        <div style={{ padding: '8px 12px', background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 8, marginBottom: 12, fontSize: 12.5, color: '#E65100', fontWeight: 600 }}>
          🌅 Jornada intensiva activa — mostrant l'horari d'intensiva
        </div>
      )}

      {/* Notes modal */}
      {notesFn && (
        <div className="modal-overlay open" onClick={() => setNotesFn(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="m-head">
              <h3>Notes de {notesFn.absent}</h3>
              <p>Instruccions per al grup {notesFn.grup}</p>
            </div>
            <div className="m-body">
              {loading
                ? <div style={{ textAlign: 'center' }}><Spinner /></div>
                : <>
                    {notes
                      ? <p style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{notes}</p>
                      : <div style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>No s'ha deixat cap nota específica.</div>
                    }
                    {fitxers.length > 0 && (
                      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Fitxers adjunts</div>
                        {fitxers.map((f, i) => (
                          <a
                            key={i}
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-2)', borderRadius: 8, padding: '10px 12px', textDecoration: 'none', color: 'inherit' }}
                          >
                            <span style={{ fontSize: 22 }}>{f.tipus === 'pdf' ? '📄' : '📝'}</span>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nom}</span>
                            <span style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>Obrir →</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </>
              }
            </div>
            <div className="m-foot">
              <button className="btn btn-ghost btn-full" onClick={() => setNotesFn(null)}>Tancar</button>
            </div>
          </div>
        </div>
      )}

      {/* Navegació de dies */}
      <div style={{ marginBottom: 24, padding: '0 4px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '.04em' }}>
          {esAvui ? 'La teva agenda d\'avui' : 'La teva agenda'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => canviarDia(-1)}
            style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)', flexShrink: 0 }}
          >‹</button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 600, textTransform: 'capitalize', fontFamily: 'Georgia,serif' }}>
              {diaCat}, {dateObj.toLocaleDateString('ca-ES', { day: 'numeric', month: 'long' })}
            </div>
            {!esAvui && (
              <button
                onClick={() => { setSelectedDate(todayISO); setCobertures(null); }}
                style={{ marginTop: 4, fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', textDecoration: 'underline' }}
              >
                Tornar a avui
              </button>
            )}
          </div>
          <button
            onClick={() => canviarDia(1)}
            style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)', flexShrink: 0 }}
          >›</button>
        </div>
      </div>

      {/* Torns de pati setmanals */}
      {patiTorns && (() => {
        const nomNorm = (perfil.nom || '').toLowerCase().trim();
        const meusPatins = DIES_SETMANA.flatMap(dia => {
          const torn = patiTorns[dia] || {};
          return Object.entries(torn)
            .filter(([, noms]) => (noms || []).some(n => n.toLowerCase().trim() === nomNorm))
            .map(([pid]) => ({ dia, pid }));
        });
        if (!meusPatins.length) return null;
        const avuiPati = meusPatins.filter(p => p.dia === diaCat);
        return (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-head">
              <h3>🕐 Els meus torns de pati</h3>
              <span className="sp sp-green">{meusPatins.length} torns/setmana</span>
            </div>
            {/* Banner avui si toca pati */}
            {avuiPati.length > 0 && (
              <div style={{ padding: '8px 16px', background: '#FFF3E0', borderBottom: '1px solid #FFB74D', fontSize: 12.5, fontWeight: 700, color: '#E65100' }}>
                🔔 Avui tens torn de pati: {avuiPati.map(p => (TORN_LABELS[p.pid]?.label || p.pid)).join(' i ')}
              </div>
            )}
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {meusPatins.map(({ dia, pid }) => {
                const t = TORN_LABELS[pid] || { label: pid, sub: '', color: 'var(--ink-3)' };
                const esDia = dia === diaCat;
                return (
                  <div key={`${dia}-${pid}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', background: esDia ? '#FFF3E0' : 'var(--bg-2)', borderRadius: 8, border: esDia ? '1.5px solid #FFB74D' : '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: esDia ? '#E65100' : 'var(--ink-2)', minWidth: 72 }}>{DIES_LBL_LG[dia]}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: t.color }}>{t.label}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>🕐 {t.sub}</span>
                    {esDia && <span style={{ fontSize: 10, fontWeight: 700, color: '#E65100', background: 'rgba(255,183,77,.25)', borderRadius: 4, padding: '2px 7px' }}>Avui</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {cobertures === null
        ? <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
        : <div className="agenda-wrap">
        {FRANJES_ACT.map(f => {
          const originalVal = myHorari[f.id] || '';
          const cob = cobertures.find(c =>
            c.franja === f.id || c.franja === f.label || c.franja === f.hora
          );
          const isModified = !!cob;

          let slotClass = '';
          if (isModified) {
            slotClass = 'modified';
          } else {
            const v = originalVal.toLowerCase();
            if (v === 'tp' || v === 'treball personal') slotClass = 'tp';
            else if (!originalVal || v === 'lliure') slotClass = 'green-slot';
            else if (f.patio) slotClass = 'patio-slot';
            else if (originalVal) slotClass = 'blue-slot';
          }

          const label = isModified
            ? `COBERTURA: ${cob.docent_absent_nom} (${cob.grup})`
            : (!originalVal || originalVal.toLowerCase() === 'lliure') ? 'Disponibilitat' : originalVal;

          const sub = isModified
            ? `Grup destí: ${cob.grup}`
            : f.label + (f.sub ? ' · ' + f.sub : '');

          return (
            <div key={f.id} className={`agenda-row${isModified ? ' modified-row' : ''}`}>
              <div className="agenda-time">
                <span className="at-start">{f.sub?.split('–')[0]}</span>
                <span className="at-end">{f.sub?.split('–')[1]}</span>
              </div>
              <div className="agenda-connector" />
              <div className="timeline-dot" />
              <div
                className={`agenda-slot ${slotClass}`}
                onClick={isModified ? () => openNotes(cob.absencia_id, cob.docent_absent_nom, cob.grup) : undefined}
              >
                {isModified && <span className="as-tag">Modificació</span>}
                <div className="as-label">{label}</div>
                <div className="as-sub">{sub}</div>
                {isModified && (() => {
                  const cobKey = cob.id ? String(cob.id) : `${cob.absencia_id}_${cob.franja}`;
                  const vist = vists.has(cobKey);
                  return vist
                    ? <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, marginTop: 4, display: 'block' }}>✓ Vista</span>
                    : <button
                        onClick={e => { e.stopPropagation(); marcarVist(cobKey); }}
                        style={{ marginTop: 6, fontSize: 10.5, padding: '3px 10px', borderRadius: 20, border: '1.5px solid var(--green)', background: 'var(--green-bg)', color: 'var(--green)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'block' }}
                      >He vist la cobertura ✓</button>;
                })()}
              </div>
            </div>
          );
        })}
      </div>}
    </>
  );
}
