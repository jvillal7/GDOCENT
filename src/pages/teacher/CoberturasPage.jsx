import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { FRANJES } from '../../lib/constants';
import Spinner from '../../components/Spinner';

export default function CoberturasPage() {
  const { api, perfil } = useApp();
  const [data,    setData]    = useState(null);
  const [notesFn, setNotesFn] = useState(null); // { absenciaId, absent, grup }
  const [notes,   setNotes]   = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (api && perfil) load(); }, [api, perfil]);

  async function load() {
    try {
      const days = ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'];
      const today = new Date();
      const todayCat = days[today.getDay()];

      const [cobertures, docents] = await Promise.all([
        api.getCoberturesByDocent(perfil.nom),
        api.getDocents(),
      ]);
      const me = docents?.find(d => d.nom === perfil.nom);
      setData({ cobertures: cobertures || [], me, todayCat, today });
    } catch (e) {
      setData({ cobertures: [], me: null, todayCat: '', today: new Date() });
    }
  }

  async function openNotes(absenciaId, absent, grup) {
    setNotesFn({ absenciaId, absent, grup });
    setNotes(null);
    setLoading(true);
    try {
      const abs = await api.getAbsenciaById(absenciaId);
      setNotes(abs?.[0]?.notes || '');
    } catch { setNotes(''); }
    finally { setLoading(false); }
  }

  if (data == null) {
    return <><div className="page-hdr"><h1>Les meves cobertures</h1></div><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></>;
  }

  const { cobertures, me, todayCat, today } = data;

  if (!me?.horari) {
    return (
      <>
        <div className="page-hdr"><h1>Les meves cobertures</h1></div>
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-4)' }}>
          L'administració encara no ha carregat el teu horari.
        </div>
      </>
    );
  }

  const myHorari = me.horari[todayCat] || {};

  return (
    <>
      <div className="page-hdr"><h1>Les meves cobertures</h1></div>

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
                : notes
                  ? <p style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: notes.replace(/\n/g, '<br>') }} />
                  : <div style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>No s'ha deixat cap nota específica.</div>
              }
            </div>
            <div className="m-foot">
              <button className="btn btn-ghost btn-full" onClick={() => setNotesFn(null)}>Tancar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 24, padding: '0 4px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '.04em' }}>La teva agenda d'avui</div>
        <div style={{ fontSize: 24, fontWeight: 600, textTransform: 'capitalize', fontFamily: 'Georgia,serif' }}>
          {todayCat}, {today.toLocaleDateString('ca-ES', { day: 'numeric', month: 'long' })}
        </div>
      </div>

      <div className="agenda-wrap">
        {FRANJES.map(f => {
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
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
