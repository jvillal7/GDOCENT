import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { FRANJES, DIES } from '../../lib/constants';
import { initials, avatarColor, rolLabel } from '../../lib/utils';
import { extractHorariFromPDF } from '../../lib/claude';
import Spinner from '../../components/Spinner';

const NIVELLS = [
  { key: 'i',  label: 'Infantil', match: g => /^I/i.test((g||'').trim()) },
  { key: 'p1', label: '1r',       match: g => /^1/i.test((g||'').trim()) },
  { key: 'p2', label: '2n',       match: g => /^2/i.test((g||'').trim()) },
  { key: 'p3', label: '3r',       match: g => /^3/i.test((g||'').trim()) },
  { key: 'p4', label: '4t',       match: g => /^4/i.test((g||'').trim()) },
  { key: 'p5', label: '5è',       match: g => /^5/i.test((g||'').trim()) },
  { key: 'p6', label: '6è',       match: g => /^6/i.test((g||'').trim()) },
  { key: 'ee', label: 'Ed. Especial / Especialistes', match: () => true },
];

function cellBg(val) {
  const v = (val || '').toLowerCase().trim();
  if (v === 'tp' || v === 'treball personal') return 'var(--amber-bg)';
  if (v === 'lliure' || v === 'libre' || v === '') return 'var(--green-bg)';
  if (v === 'pati' || v.startsWith('pati')) return 'var(--bg-3)';
  if (val) return 'var(--blue-bg)';
  return 'var(--green-bg)';
}

export default function HorarisPage() {
  const { api, docents, setDocents, showToast } = useApp();
  const [confirm, setConfirm]   = useState(null); // horari data to confirm
  const [uploads, setUploads]   = useState([]);   // [{ name, status, msg }]
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
        const result = await extractHorariFromPDF(base64);
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
      nom, rol: data.rol, grup_principal: data.grup_principal, horari, tp_franges: tpFranges, actiu: true,
      cobertures_mes: existing?.cobertures_mes || 0,
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
    } catch (e) {
      showToast('Error guardant: ' + e.message);
    }
    setConfirm(null);
    if (window._horariResolve) { window._horariResolve(); window._horariResolve = null; }
  }

  async function eliminar(id, nom) {
    if (!confirm(`Eliminar ${nom}?`)) return;
    setDocents(prev => prev.filter(d => d.id !== id));
    try { await api.deleteDocent(id); showToast(`Docent ${nom} eliminat`); }
    catch (e) { showToast('Error eliminant: ' + e.message); reload(); }
  }

  if (confirm) return <ConfirmHorari data={confirm} onSave={saveHorari} onCancel={() => { setConfirm(null); if (window._horariResolve) { window._horariResolve(); window._horariResolve = null; } }} />;

  // Group docents by nivell
  const groups = {};
  NIVELLS.forEach(n => { groups[n.key] = []; });
  docents.forEach((d, i) => {
    const assigned = NIVELLS.slice(0, -1).find(n => n.match(d.grup_principal));
    groups[assigned ? assigned.key : 'ee'].push({ d, i });
  });

  return (
    <>
      <div className="page-hdr"><h1>Horaris del centre</h1><p>Gestiona els horaris de tots els docents</p></div>

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
                {items.map(({ d }) => (
                  <div key={d.id || d.nom} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarColor(d.nom), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {initials(d.nom)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{d.nom}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                        {rolLabel(d.rol)}{d.grup_principal ? ` · ${d.grup_principal}` : ''} · {(d.tp_franges||[]).length} trams TP
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" style={{ background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'var(--blue)', fontSize: 12 }} onClick={() => setConfirm(d)}>✏️ Editar</button>
                      <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={() => eliminar(d.id, d.nom)}>✕</button>
                    </div>
                  </div>
                ))}
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
function ConfirmHorari({ data, onSave, onCancel }) {
  const [nom,   setNom]   = useState(data.nom || '');
  const [rol,   setRol]   = useState(data.rol || 'tutor');
  const [grup,  setGrup]  = useState(data.grup_principal || '');
  const [horari, setHorari] = useState(() => {
    const h = {};
    DIES.forEach(d => {
      h[d] = {};
      FRANJES.forEach(f => { h[d][f.id] = data.horari?.[d]?.[f.id] || ''; });
    });
    return h;
  });

  function setCell(dia, fid, val) {
    setHorari(prev => ({ ...prev, [dia]: { ...prev[dia], [fid]: val } }));
  }

  function handleSave() {
    if (!nom.trim()) return alert('Introdueix el nom del docent.');
    onSave({ nom, rol, grup_principal: grup, horari });
  }

  // Group FRANJES by hora for rowspan
  const horaGroups = {};
  FRANJES.forEach(f => { if (!horaGroups[f.hora]) horaGroups[f.hora] = []; horaGroups[f.hora].push(f); });

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
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="f-label">Grup principal</label>
            <input type="text" className="f-ctrl" value={grup} onChange={e => setGrup(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h3>Horari extret per la IA <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-3)' }}>(pots editar)</span></h3></div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', padding: 10 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 500 }}>
            <thead>
              <tr>
                <th colSpan={2} style={{ padding: '6px 8px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Horari</th>
                {DIES.map(d => <th key={d} style={{ padding: '7px 6px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, fontWeight: 600, color: 'var(--ink-2)', textAlign: 'center' }}>{d.slice(0,2).toUpperCase()}</th>)}
              </tr>
            </thead>
            <tbody>
              {FRANJES.map(f => {
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
                        <td key={dia} style={{ padding: 3, border: '1px solid var(--border)', minWidth: 75, background: cellBg(val), transition: 'background .15s' }}>
                          {f.lliure
                            ? <input disabled style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 10, textAlign: 'center', padding: '2px', color: 'var(--green)', fontWeight: 600 }} value="Lliure" readOnly />
                            : <input
                                style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 10, textAlign: 'center', padding: 2, color: 'var(--ink)' }}
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
