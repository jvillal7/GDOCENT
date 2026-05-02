import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { FRANJES, SCHOOL_FRANJES, FRANJES_ORIOL, SCHOOL_FRANJES_ORIOL, JEFA_EMAIL } from '../../lib/constants';
import { todayISO, emailAbsencia } from '../../lib/utils';
import { uploadFitxer, sendEmail } from '../../lib/api';
import MeusAvisosCard from '../../components/MeusAvisosCard';

export default function AvisarPage() {
  const { api, perfil, escola, showToast } = useApp();
  const isOriol = escola?.nom?.toLowerCase().includes('oriol');
  const franjesActives    = isOriol ? FRANJES_ORIOL    : FRANJES;
  const schoolFranjesAct  = isOriol ? SCHOOL_FRANJES_ORIOL : SCHOOL_FRANJES;
  const [selectedFranjes, setSelectedFranjes] = useState(new Set());
  const [selectedDates,   setSelectedDates]   = useState(new Set([todayISO()]));
  const [motiu,   setMotiu]   = useState('');
  const [notes,   setNotes]   = useState('');
  const [sent,        setSent]        = useState(false);
  const [sending,     setSending]     = useState(false);
  const [imgSrc,      setImgSrc]      = useState(null);
  const [fitxers,     setFitxers]     = useState([]);
  const [meusAvisos,  setMeusAvisos]  = useState([]);
  const dateRef    = useRef(null);
  const fileRef    = useRef(null);
  const fitxerRef  = useRef(null);
  const touchRef = useRef({ y: 0, x: 0, moved: false });

  const today = new Date();
  const dies  = ['Dg','Dl','Dt','Dc','Dj','Dv','Ds'];
  const nomDia = dies[today.getDay()];
  const firstName = perfil?.nom?.split(' ')[0] || 'Docent';

  useEffect(() => { if (api && perfil) loadMeusAvisos(); }, [api, perfil]);

  async function loadMeusAvisos() {
    try {
      const [abs, cobs] = await Promise.all([
        api.getAbsencies(),
        api.getCobertures(),
      ]);
      const meves = (abs || []).filter(a => a.docent_nom === perfil.nom && a.estat !== 'arxivat');
      const cobsMap = {};
      (cobs || []).forEach(c => {
        if (c.absencia_id) {
          if (!cobsMap[c.absencia_id]) cobsMap[c.absencia_id] = [];
          cobsMap[c.absencia_id].push(c.docent_cobrint_nom);
        }
      });
      setMeusAvisos(meves.slice(0, 6).map(a => ({ ...a, cobrants: cobsMap[a.id] || [] })));
    } catch { setMeusAvisos([]); }
  }

  function toggleFranja(fid) {
    setSelectedFranjes(prev => {
      const next = new Set(prev);
      next.has(fid) ? next.delete(fid) : next.add(fid);
      return next;
    });
  }

  function selectAll()  { setSelectedFranjes(new Set(schoolFranjesAct.map(f => f.id))); }
  function clearAll()   { setSelectedFranjes(new Set()); }
  function selectToday(){ setSelectedDates(new Set([todayISO()])); }
  function addDate(d)   { if (d) setSelectedDates(prev => new Set([...prev, d])); }
  function removeDate(d){ setSelectedDates(prev => { const n = new Set(prev); n.delete(d); return n; }); }

  async function enviar() {
    if (selectedDates.size === 0) return showToast('Selecciona almenys un dia');
    if (selectedFranjes.size === 0) return showToast('Selecciona almenys una franja');
    setSending(true);
    try {
      for (const d of Array.from(selectedDates).sort()) {
        const abs = await api.saveAbsencia({
          docent_nom: perfil.nom,
          docent_id:  perfil.id,
          escola_id:  escola.id,
          data:       d,
          franges:    JSON.stringify(Array.from(selectedFranjes)),
          motiu:      motiu || 'No especificat',
          notes,
          estat:      'pendent',
          fitxers:    [],
        });
        // Pujar fitxers adjunts si n'hi ha
        if (fitxers.length > 0 && abs?.[0]?.id) {
          const absId = abs[0].id;
          const uploaded = [];
          for (const f of fitxers) {
            try {
              const info = await uploadFitxer(f, absId);
              uploaded.push(info);
            } catch { /* si falla un fitxer, continua */ }
          }
          if (uploaded.length > 0) {
            await api.patchAbsencia(absId, { fitxers: uploaded });
          }
        }
      }
      setSent(true);
      showToast(`Enviats ${selectedDates.size} avisos correctament`);
      // Notificar la cap d'estudis per correu
      sendEmail(
        JEFA_EMAIL,
        `🔔 Nova absència — ${perfil.nom}`,
        emailAbsencia({ nom: perfil.nom, dates: Array.from(selectedDates).sort(), franges: Array.from(selectedFranjes), motiu, isOriol, escola })
      );
      loadMeusAvisos();
    } catch (e) {
      showToast('Error enviant avisos: ' + e.message);
    } finally {
      setSending(false);
    }
  }

  async function avisRapidAvui() {
    setSending(true);
    try {
      await api.saveAbsencia({
        docent_nom: perfil.nom,
        docent_id:  perfil.id,
        escola_id:  escola.id,
        data:       todayISO(),
        franges:    JSON.stringify(schoolFranjesAct.map(f => f.id)),
        motiu:      'Tot el dia',
        notes:      '',
        estat:      'pendent',
      });
      setSent(true);
      showToast('Avis enviat correctament');
      sendEmail(
        JEFA_EMAIL,
        `🔔 Nova absència — ${perfil.nom}`,
        emailAbsencia({ nom: perfil.nom, dates: [todayISO()], franges: schoolFranjesAct.map(f => f.id), motiu: 'Tot el dia', isOriol, escola })
      );
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setSelectedFranjes(new Set());
    setSelectedDates(new Set([todayISO()]));
    setMotiu('');
    setNotes('');
    setImgSrc(null);
    setFitxers([]);
    setSent(false);
  }

  function handleFitxers(e) {
    const nous = Array.from(e.target.files || []);
    setFitxers(prev => {
      const noms = new Set(prev.map(f => f.name));
      return [...prev, ...nous.filter(f => !noms.has(f.name))];
    });
    e.target.value = '';
  }

  function removeFitxer(nom) {
    setFitxers(prev => prev.filter(f => f.name !== nom));
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setImgSrc(ev.target.result);
    reader.readAsDataURL(file);
  }

  // Touch handling for franja buttons - prevent ghost clicks during scroll
  function onTouchStart(e, fid) {
    touchRef.current = { y: e.touches[0].clientY, x: e.touches[0].clientX, moved: false, fid };
  }
  function onTouchMove(e) {
    const dy = Math.abs(e.touches[0].clientY - touchRef.current.y);
    const dx = Math.abs(e.touches[0].clientX - touchRef.current.x);
    if (dy > 10 || dx > 10) touchRef.current.moved = true;
  }
  function onTouchEnd(e, fid) {
    if (!touchRef.current.moved) {
      e.preventDefault();
      toggleFranja(fid);
    }
  }

  const datesArr = Array.from(selectedDates).sort();

  if (sent) {
    return (
      <>
        <div style={{ background: 'var(--ink-static)', borderRadius: 'var(--r)', padding: '18px 18px 16px', marginBottom: 14, color: '#fff' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Hola, {firstName}</div>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: 22, fontWeight: 300, marginBottom: 3 }}>Avisa la teva <em style={{ fontStyle: 'italic', color: '#B8DFC8' }}>absència</em></div>
        </div>
        <div className="avis-sent show">
          <div className="sent-icon">✅</div>
          <div className="sent-title">Avis enviat</div>
          <div className="sent-sub">La cap d'estudis ha rebut el teu avis i gestionarà la cobertura.</div>
          <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={reset}>Enviar un altre avis</button>
        </div>
        <MeusAvisosCard avisos={meusAvisos} franjesAct={franjesActives} schoolFranjesAct={schoolFranjesAct} />
      </>
    );
  }

  return (
    <>
      <div style={{ background: 'var(--ink-static)', borderRadius: 'var(--r)', padding: '18px 18px 16px', marginBottom: 14, color: '#fff' }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Hola, {firstName}</div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: 22, fontWeight: 300, marginBottom: 3 }}>Avisa la teva <em style={{ fontStyle: 'italic', color: '#B8DFC8' }}>absència</em></div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.4)' }}>Seràs notificat quan la cobertura estigui assignada</div>
      </div>

      <MeusAvisosCard avisos={meusAvisos} franjesAct={franjesActives} schoolFranjesAct={schoolFranjesAct} />

      <button
        disabled={sending}
        onClick={avisRapidAvui}
        style={{ width: '100%', padding: '18px 16px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontFamily: "'Instrument Sans',sans-serif", fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14, opacity: sending ? .6 : 1 }}
      >
        <span style={{ fontSize: 22 }}>🏥</span>
        <div style={{ textAlign: 'left' }}>
          <div>Falto avui tot el dia</div>
          <div style={{ fontSize: 12, fontWeight: 400, opacity: .75 }}>{nomDia} - Totes les franges</div>
        </div>
      </button>

      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        O personalitza
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      <div className="avis-form">
        {/* Dates */}
        <div>
          <label className="f-label" style={{ marginBottom: 8 }}>Quins dies faltaràs?</label>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button className="btn btn-ghost" style={{ flex: 1, padding: 12, flexDirection: 'column', alignItems: 'center', gap: 4 }} onClick={selectToday}>
              <span style={{ fontSize: 18 }}>📅</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Avui</span>
            </button>
            <button className="btn btn-ghost" style={{ flex: 1, padding: 12, flexDirection: 'column', alignItems: 'center', gap: 4 }} onClick={() => dateRef.current?.showPicker()}>
              <input ref={dateRef} type="date" style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }} onChange={e => { addDate(e.target.value); e.target.value = ''; }} />
              <span style={{ fontSize: 18 }}>➕</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Altre dia</span>
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {datesArr.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 6, width: '100%' }}>Cap dia seleccionat</div>
              : datesArr.map(d => (
                <div key={d} className="sp sp-ink" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12.5 }}>
                  {new Date(d + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                  <span onClick={() => removeDate(d)} style={{ cursor: 'pointer', opacity: .6, fontSize: 14, fontWeight: 700 }}>×</span>
                </div>
              ))
            }
          </div>
        </div>

        {/* Franges */}
        <div>
          <label className="f-label" style={{ marginBottom: 8 }}>Franges afectades</label>
          <div className="sel-all-row">
            <button className="btn btn-ghost btn-sm" onClick={selectAll}>Tot el dia</button>
            <button className="btn btn-ghost btn-sm" onClick={clearAll}>Cap</button>
          </div>
          <div className="franjes-grid">
            {schoolFranjesAct.map(f => (
              <div
                key={f.id}
                className={`franja-btn${f.patio ? ' patio' : ''}${selectedFranjes.has(f.id) ? ' selected' : ''}`}
                data-franja-id={f.id}
                onTouchStart={e => onTouchStart(e, f.id)}
                onTouchMove={onTouchMove}
                onTouchEnd={e => onTouchEnd(e, f.id)}
                onClick={() => { if ('ontouchstart' in window) return; toggleFranja(f.id); }}
              >
                <p>{f.label}</p>
                <span>{f.sub}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Motiu */}
        <div>
          <label className="f-label" style={{ marginBottom: 8 }}>Motiu (opcional)</label>
          <select className="f-ctrl" value={motiu} onChange={e => setMotiu(e.target.value)}>
            <option value="">Seleccionar...</option>
            <option>Malaltia</option>
            <option>Metge / Especialista</option>
            <option>Formació</option>
            <option>Assumpte personal</option>
          </select>
        </div>

        {/* Justificant */}
        <div>
          <label className="f-label" style={{ marginBottom: 8 }}>Justificant mèdic (opcional)</label>
          <div
            style={{ border: '1.5px dashed var(--border-2)', borderRadius: 'var(--r-sm)', padding: 14, textAlign: 'center', cursor: 'pointer', background: 'var(--bg)' }}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
            {imgSrc ? (
              <img src={imgSrc} alt="Justificant" style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 8, objectFit: 'cover' }} />
            ) : (
              <>
                <div style={{ fontSize: 24, marginBottom: 6 }}>📷</div>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 2 }}>Fes una foto del justificant</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Càmera o galeria del mòbil</div>
              </>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="f-label" style={{ marginBottom: 8 }}>Notes per al substitut (opcional)</label>
          <textarea className="f-ctrl" rows={3} placeholder="Ex: Els alumnes estan fent la pàgina 45..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {/* Fitxers adjunts */}
        <div>
          <label className="f-label" style={{ marginBottom: 8 }}>Fitxers per al substitut (opcional)</label>
          <div
            style={{ border: '1.5px dashed var(--border-2)', borderRadius: 'var(--r-sm)', padding: 14, textAlign: 'center', cursor: 'pointer', background: 'var(--bg)' }}
            onClick={() => fitxerRef.current?.click()}
          >
            <input
              ref={fitxerRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
              style={{ display: 'none' }}
              onChange={handleFitxers}
            />
            <div style={{ fontSize: 24, marginBottom: 6 }}>📎</div>
            <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 2 }}>Adjunta PDF o Word</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Programació, fitxes de feina, activitats... (màx. 10 MB per fitxer)</div>
          </div>
          {fitxers.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {fitxers.map(f => (
                <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-2)', borderRadius: 8, padding: '8px 12px' }}>
                  <span style={{ fontSize: 18 }}>{f.name.endsWith('.pdf') ? '📄' : '📝'}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{(f.size / 1024).toFixed(0)} KB</span>
                  <span onClick={() => removeFitxer(f.name)} style={{ cursor: 'pointer', fontSize: 16, color: 'var(--ink-3)', fontWeight: 700, padding: '0 4px' }}>×</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="btn btn-red-soft btn-full" style={{ padding: 15, fontSize: 15 }} disabled={sending} onClick={enviar}>
          {sending ? 'Enviant...' : 'Enviar avis'}
        </button>
      </div>
    </>
  );
}

