import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { FRANJES, FRANJES_ORIOL, DIES } from '../../lib/constants';
import { initials, avatarColor, rolLabel } from '../../lib/utils';
import { extractHorariFromPDF } from '../../lib/claude';
import Spinner from '../../components/Spinner';

const DIE_ABBR = { dilluns: 'Dl', dimarts: 'Dt', dimecres: 'Dc', dijous: 'Dj', divendres: 'Dv' };

const ESPECIALISTES_GRUPS = ['Anglès', 'EF', 'Música', 'EI suport'];

const NIVELLS = [
  { key: 'i3',  label: 'I3',                    match: (g)    => /^I3/i.test((g||'').trim()) },
  { key: 'i4',  label: 'I4',                    match: (g)    => /^I4/i.test((g||'').trim()) },
  { key: 'i5',  label: 'I5',                    match: (g)    => /^I5/i.test((g||'').trim()) },
  { key: 'p1',  label: '1r',                    match: (g)    => /^1/i.test((g||'').trim()) },
  { key: 'p2',  label: '2n',                    match: (g)    => /^2/i.test((g||'').trim()) },
  { key: 'p3',  label: '3r',                    match: (g)    => /^3/i.test((g||'').trim()) },
  { key: 'p4',  label: '4t',                    match: (g)    => /^4/i.test((g||'').trim()) },
  { key: 'p5',  label: '5è',                    match: (g)    => /^5/i.test((g||'').trim()) },
  { key: 'p6',  label: '6è',                    match: (g)    => /^6/i.test((g||'').trim()) },
  { key: 'esp', label: 'Especialistes',          match: (g, d) => d.rol === 'teacher' && ESPECIALISTES_GRUPS.includes(g) },
  { key: 'ee',  label: 'Ed. Especial i Suport', match: ()     => true },
];

const COORD_KW = ['coordinació','coordinacio','càrrec','carrec'];

function isCoord(v) { return COORD_KW.some(k => v === k || v.startsWith(k + ' ') || v.startsWith(k + ':') || v.includes(' ' + k)); }

function cellBg(val) {
  const v = (val || '').toLowerCase().trim();
  if (v === 'tp' || v === 'treball personal') return 'var(--amber-bg)';
  if (isCoord(v)) return 'var(--purple-bg)';
  if (v === 'lliure' || v === 'libre' || v === '') return 'var(--green-bg)';
  if (v === 'pati' || v.startsWith('pati')) return 'var(--bg-3)';
  if (val) return 'var(--blue-bg)';
  return 'var(--green-bg)';
}

function cellColor(val) {
  const v = (val || '').toLowerCase().trim();
  if (v === 'tp' || v === 'treball personal') return 'var(--amber)';
  if (isCoord(v)) return 'var(--purple)';
  if (v === 'lliure' || v === 'libre' || v === '') return 'var(--green)';
  return 'var(--ink-2)';
}

export default function HorarisPage() {
  const { api, escola, docents, setDocents, showToast } = useApp();
  const isOriol  = escola?.nom?.toLowerCase().includes('oriol');
  const franjes   = isOriol ? FRANJES_ORIOL : FRANJES;
  const [confirmData, setConfirm]   = useState(null);
  const [uploads, setUploads]   = useState([]);
  const [expanded, setExpanded] = useState(null); // id del docent amb horari obert
  const fileRef = useRef(null);

  useEffect(() => { if (api) reload(); }, [api]);

  async function reload() {
    try { const d = await api.getDocents(); if (d) setDocents(d); }
    catch (e) { console.error(e); }
  }

  async function handleFiles(files) {
    const pdfs = Array.from(files).filter(f => f.type === 'application/pdf');
    if (!pdfs.length) return;
    for (const file of pdfs) {
      const id = Date.now() + Math.random();
      setUploads(prev => [...prev, { id, name: file.name, status: 'loading', msg: 'Llegint PDF...' }]);
      try {
        const base64 = await fileToBase64(file);
        setUploads(prev => prev.map(u => u.id === id ? { ...u, msg: 'IA analitzant...' } : u));
        const result = await extractHorariFromPDF(base64, franjes);
        setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'done', msg: 'Llest' } : u));
        setConfirm(result);
        // Wait for user to confirm before processing next file
        await new Promise(resolve => {
          window._horariResolve = resolve;
        });
      } catch (err) {
        setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'error', msg: '⚠ Error: ' + err.message } : u));
      }
    }
    reload();
  }

  async function saveHorari(data) {
    const nom     = data.nom?.trim();
    const horari  = data.horari || {};
    const tpFranges = [];
    Object.entries(horari).forEach(([dia, franjes]) => {
      Object.entries(franjes || {}).forEach(([franja, val]) => {
        if ((val || '').toLowerCase() === 'tp' || (val || '').toLowerCase() === 'treball personal') {
          tpFranges.push(`${dia}-${franja}`);
        }
      });
    });

    const existing = docents.find(d => d.nom.toLowerCase() === nom.toLowerCase());
    const docent = {
      nom, escola_id: escola.id, rol: data.rol, grup_principal: data.grup_principal, horari, tp_franges: tpFranges, actiu: true,
      cobertures_mes: existing?.cobertures_mes || 0,
      pin: data.pin,
      email: data.email || null,
      ...(existing?.id ? { id: existing.id } : {}),
    };
    try {
      const saved = await api.saveDocent(docent);
      if (!existing && saved?.[0]) {
        setDocents(prev => [...prev, { ...docent, id: saved[0].id }]);
      } else {
        setDocents(prev => prev.map(d => d.nom.toLowerCase() === nom.toLowerCase() ? { ...d, ...docent } : d));
      }
      showToast(`Horari de ${nom} ${existing ? 'actualitzat' : 'afegit'}`);
      setConfirm(null);
      if (window._horariResolve) { window._horariResolve(); window._horariResolve = null; }
    } catch (e) {
      showToast('Error guardant: ' + e.message);
    }
  }

  async function eliminar(id, nom) {
    if (!confirm(`Eliminar ${nom}?`)) return;
    setDocents(prev => prev.filter(d => d.id !== id));
    try { await api.deleteDocent(id); showToast(`Docent ${nom} eliminat`); }
    catch (e) { showToast('Error eliminant: ' + e.message); reload(); }
  }

  if (confirmData) return <ConfirmHorari data={confirmData} franjes={franjes} onSave={saveHorari} onCancel={() => { setConfirm(null); if (window._horariResolve) { window._horariResolve(); window._horariResolve = null; } }} />;

  // Group docents by nivell
  const groups = {};
  NIVELLS.forEach(n => { groups[n.key] = []; });
  docents.forEach((d, i) => {
    const assigned = NIVELLS.slice(0, -1).find(n => n.match(d.grup_principal, d));
    groups[assigned ? assigned.key : 'ee'].push({ d, i });
  });

  return (
    <>
      <div className="page-hdr"><h1>Personal del centre</h1><p>Gestiona el personal: horaris, correus i accés</p></div>

      <div className="alert alert-blue">
        ℹ️ Puja el PDF de l'horari de cada docent. La IA llegirà l'horari automàticament.
      </div>

      {docents.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h3>✅ Docents carregats</h3>
            <span className="sp sp-green">{docents.length} docents</span>
          </div>
          {NIVELLS.map(n => {
            const items = groups[n.key];
            if (!items.length) return null;
            return (
              <div key={n.key}>
                <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
                  {n.label}
                </div>
                {items.map(({ d }) => {
                  const isOpen = expanded === (d.id || d.nom);
                  const teHorari = d.horari && Object.keys(d.horari).length > 0;
                  return (
                    <div key={d.id || d.nom} style={{ borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px' }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarColor(d.nom), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {initials(d.nom)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{d.nom}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                            {rolLabel(d.rol)}{d.grup_principal ? ` · ${d.grup_principal}` : ''} · {(d.tp_franges||[]).length} trams TP
                          </div>
                          {d.email && <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 1 }}>✉ {d.email}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {teHorari && (
                            <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={() => setExpanded(isOpen ? null : (d.id || d.nom))}>
                              {isOpen ? '▴ Tancar' : '▾ Horari'}
                            </button>
                          )}
                          <button className="btn btn-sm" style={{ background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'var(--blue)', fontSize: 12 }} onClick={() => setConfirm(d)}>✏️ Editar</button>
                          <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={() => eliminar(d.id, d.nom)}>✕</button>
                        </div>
                      </div>
                      {isOpen && teHorari && <HorariInline horari={d.horari} tpFranges={d.tp_franges} franjes={franjes} />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h3>📄 Afegir / Actualitzar horari</h3></div>
        <div style={{ padding: 16 }}>
          <div
            style={{ border: '2px dashed var(--border-2)', borderRadius: 'var(--r)', padding: '24px 16px', textAlign: 'center', cursor: 'pointer', background: 'var(--bg)', marginBottom: 12 }}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Puja un PDF d'horari</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Fes clic aquí · Pots pujar-ne diversos alhora</div>
          </div>
          {uploads.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', marginBottom: 8 }}>
              {u.status === 'loading' ? <Spinner size={20} /> : u.status === 'done' ? <span>✅</span> : <span>⚠️</span>}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{u.msg}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {docents.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>💾 Exportar</h3></div>
          <div style={{ padding: '14px 16px' }}>
            <button className="btn btn-primary btn-full" onClick={() => exportJSON(docents)}>📋 Exportar JSON dels horaris</button>
          </div>
        </div>
      )}
    </>
  );
}

function HorariInline({ horari, tpFranges = [], franjes }) {
  const tpSet = new Set(tpFranges);
  const horaGroups = {};
  franjes.forEach(f => { if (!horaGroups[f.hora]) horaGroups[f.hora] = []; horaGroups[f.hora].push(f); });
  const thS = { padding: '4px 4px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 9, fontWeight: 600, color: 'var(--ink-3)', textAlign: 'center', whiteSpace: 'nowrap' };
  const tdS = { padding: '4px 5px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 9, color: 'var(--ink-3)', whiteSpace: 'nowrap' };
  return (
    <div style={{ padding: '0 12px 12px', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        {[['var(--green-bg)','var(--green-mid)','Lliure'],['var(--amber-bg)','#F0D5A8','TP'],['var(--purple-bg)','var(--purple-mid)','Coord/Càrrec'],['var(--blue-bg)','#C0D0EE','Classe'],['var(--bg-3)','var(--border-2)','Pati']].map(([bg,bc,lbl]) => (
          <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9.5, color: 'var(--ink-3)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: bg, border: `1px solid ${bc}`, display: 'inline-block' }} />{lbl}
          </span>
        ))}
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 440 }}>
          <thead>
            <tr>
              <th style={{ ...thS, width: 56, textAlign: 'left' }}>Hora</th>
              <th style={{ ...thS, width: 64, textAlign: 'left' }}>Tram</th>
              {DIES.map(d => <th key={d} style={thS}>{DIE_ABBR[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {franjes.map(f => {
              const grp = horaGroups[f.hora] || [];
              const isFirst = grp[0]?.id === f.id;
              return (
                <tr key={f.id}>
                  {isFirst && (
                    <td rowSpan={grp.length} style={{ ...tdS, fontWeight: 700, verticalAlign: 'middle', color: 'var(--ink-2)' }}>{f.label}</td>
                  )}
                  <td style={{ ...tdS, fontSize: 8 }}>{f.sub}</td>
                  {DIES.map(dia => {
                    const raw = horari?.[dia]?.[f.id] || '';
                    const val = raw || (tpSet.has(`${dia}-${f.id}`) ? 'TP' : '');
                    return (
                      <td key={dia} style={{ padding: '3px 3px', border: '1px solid var(--border)', background: cellBg(val), textAlign: 'center', minWidth: 60 }}>
                        <span style={{ fontSize: 9, color: cellColor(val), fontWeight: val ? 500 : 400 }}>
                          {val || ''}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function exportJSON(docents) {
  const json = JSON.stringify(docents, null, 2);
  navigator.clipboard.writeText(json)
    .then(() => alert('✅ JSON copiat al porta-retalls'))
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = json;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('✅ JSON copiat al porta-retalls');
    });
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Inline confirm/edit view for a docent horari
function ConfirmHorari({ data, onSave, onCancel, franjes }) {
  const [nom,   setNom]   = useState(data.nom || '');
  const [rol,   setRol]   = useState(data.rol || 'tutor');
  const [grup,  setGrup]  = useState(data.grup_principal || '');
  const [pin,   setPin]   = useState(data.pin || '1234');
  const [email, setEmail] = useState(data.email || '');
  const [horari, setHorari] = useState(() => {
    const h = {};
    const tpSet = new Set(data.tp_franges || []);
    DIES.forEach(d => {
      h[d] = {};
      franjes.forEach(f => {
        const raw = data.horari?.[d]?.[f.id] || '';
        h[d][f.id] = raw || (tpSet.has(`${d}-${f.id}`) ? 'TP' : '');
      });
    });
    return h;
  });

  function setCell(dia, fid, val) {
    setHorari(prev => ({ ...prev, [dia]: { ...prev[dia], [fid]: val } }));
  }

  function handleSave() {
    if (!nom.trim()) return alert('Introdueix el nom del docent.');
    if (!pin.trim() || pin.length !== 4 || !/^\d{4}$/.test(pin)) return alert('El PIN ha de ser de 4 dígits.');
    onSave({ nom, rol, grup_principal: grup, horari, pin, email: email.trim() || null });
  }

  // Group franjes by hora for rowspan
  const horaGroups = {};
  franjes.forEach(f => { if (!horaGroups[f.hora]) horaGroups[f.hora] = []; horaGroups[f.hora].push(f); });

  return (
    <>
      <div className="page-hdr"><h1>Confirma l'horari</h1><p>Revisa que la IA ha llegit correctament l'horari de <strong>{data.nom || 'Docent'}</strong></p></div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h3>Dades del docent</h3></div>
        <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="f-label">Nom</label>
            <input type="text" className="f-ctrl" value={nom} onChange={e => setNom(e.target.value)} />
          </div>
          <div>
            <label className="f-label">Rol</label>
            <select className="f-ctrl" value={rol} onChange={e => setRol(e.target.value)}>
              <option value="tutor">Tutor/a</option>
              <option value="especialista">Especialista</option>
              <option value="ee">Ed. Especial</option>
              <option value="directiu">Equip Directiu</option>
              <option value="educador">Educador/a</option>
              <option value="vetllador">Vetllador/a</option>
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="f-label">Grup principal</label>
            <input type="text" className="f-ctrl" value={grup} onChange={e => setGrup(e.target.value)} />
          </div>
          <div>
            <label className="f-label">PIN d'accés (4 dígits)</label>
            <input
              type="text"
              className="f-ctrl"
              maxLength={4}
              placeholder="1234"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="f-label">Correu electrònic (per notificacions)</label>
            <input
              type="email"
              className="f-ctrl"
              placeholder="nom.cognom@xtec.cat"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h3>Horari extret per la IA <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-3)' }}>(pots editar)</span></h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['var(--green-bg)','var(--green-mid)','Lliure'],['var(--amber-bg)','#F0D5A8','TP'],['var(--purple-bg)','var(--purple-mid)','Coord/Càrrec'],['var(--blue-bg)','#C0D0EE','Classe'],['var(--bg-3)','var(--border-2)','Pati']].map(([bg,bc,lbl]) => (
              <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--ink-3)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: bg, border: `1px solid ${bc}`, display: 'inline-block' }} />{lbl}
              </span>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', padding: 10 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 500 }}>
            <thead>
              <tr>
                <th colSpan={2} style={{ padding: '6px 8px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Horari</th>
                {DIES.map(d => <th key={d} title={d.charAt(0).toUpperCase() + d.slice(1)} style={{ padding: '7px 6px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, fontWeight: 600, color: 'var(--ink-2)', textAlign: 'center' }}>{DIE_ABBR[d]}</th>)}
              </tr>
            </thead>
            <tbody>
              {franjes.map(f => {
                const grp    = horaGroups[f.hora];
                const isFirst = grp[0].id === f.id;
                return (
                  <tr key={f.id}>
                    {isFirst && (
                      <td rowSpan={grp.length} style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', padding: '5px 6px', border: '1px solid var(--border)', background: 'var(--bg-2)', verticalAlign: 'middle', width: 60, whiteSpace: 'nowrap' }}>
                        {f.label}
                      </td>
                    )}
                    <td style={{ fontSize: 10, color: 'var(--ink-4)', padding: '4px 6px', border: '1px solid var(--border)', background: 'var(--bg-2)', width: 72, whiteSpace: 'nowrap' }}>{f.sub}</td>
                    {DIES.map(dia => {
                      const val = horari[dia]?.[f.id] || '';
                      return (
                        <td key={dia} style={{ padding: 0, border: '1px solid var(--border)', minWidth: 75 }}>
                          {f.lliure
                            ? <input disabled style={{ width: '100%', border: 'none', outline: 'none', background: cellBg('lliure'), fontFamily: 'inherit', fontSize: 10, textAlign: 'center', padding: '5px 2px', color: 'var(--green)', fontWeight: 600 }} value="Lliure" readOnly />
                            : <input
                                style={{ width: '100%', border: 'none', outline: 'none', background: cellBg(val), fontFamily: 'inherit', fontSize: 10, textAlign: 'center', padding: '5px 2px', color: cellColor(val), transition: 'background .15s, color .15s' }}
                                value={val}
                                onChange={e => setCell(dia, f.id, e.target.value)}
                              />
                          }
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 60 }}>
        <button className="btn btn-full" style={{ padding: 14, background: 'var(--green)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, borderRadius: 'var(--r)' }} onClick={handleSave}>
          ✓ Confirmar i guardar
        </button>
        <button className="btn btn-ghost btn-full" style={{ padding: 13 }} onClick={onCancel}>Cancel·lar</button>
      </div>
    </>
  );
}
