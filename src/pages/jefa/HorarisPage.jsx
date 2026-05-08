import { useState, useEffect, useRef, useMemo } from 'react';
import mammoth from 'mammoth';
import { useApp } from '../../context/AppContext';
import { FRANJES, FRANJES_ORIOL, DIES, GRUPS_ORIOL } from '../../lib/constants';
import { initials, avatarColor, rolLabel } from '../../lib/utils';
import { extractHorariFromPDF } from '../../lib/claude';
import Spinner from '../../components/Spinner';

const DIE_ABBR = { dilluns: 'Dl', dimarts: 'Dt', dimecres: 'Dc', dijous: 'Dj', divendres: 'Dv' };

const ESPECIALISTES_GRUPS = ['Anglès', 'EF', 'Música', 'EI suport'];

const NIVELLS = [
  { key: 'dir',  label: 'Equip Directiu',               match: (g, d) => d.rol === 'directiu',
    sort: (a, b) => {
      const ord = { 'directora': 0, 'director': 0, "cap d'estudis": 1, 'secretaria': 2 };
      return (ord[(a.d.grup_principal||'').toLowerCase()] ?? 9) - (ord[(b.d.grup_principal||'').toLowerCase()] ?? 9);
    }
  },
  { key: 'i3',   label: 'I3',                          match: (g)    => /^I3/i.test((g||'').trim()) },
  { key: 'i4',   label: 'I4',                          match: (g)    => /^I4/i.test((g||'').trim()) },
  { key: 'i5',   label: 'I5',                          match: (g)    => /^I5/i.test((g||'').trim()) },
  { key: 'p1',   label: '1r',                          match: (g)    => /^1/i.test((g||'').trim()) },
  { key: 'p2',   label: '2n',                          match: (g)    => /^2/i.test((g||'').trim()) },
  { key: 'p3',   label: '3r',                          match: (g)    => /^3/i.test((g||'').trim()) },
  { key: 'p4',   label: '4t',                          match: (g)    => /^4/i.test((g||'').trim()) },
  { key: 'p5',   label: '5è',                          match: (g)    => /^5/i.test((g||'').trim()) },
  { key: 'p6',   label: '6è',                          match: (g)    => /^6/i.test((g||'').trim()) },
  { key: 'ef',   label: 'Especialistes · Educació Física', match: (g) => g === 'EF' },
  { key: 'ang',  label: 'Especialistes · Anglès',          match: (g) => g === 'Anglès' },
  { key: 'mus',  label: 'Especialistes · Música',          match: (g) => g === 'Música' },
  { key: 'eis',  label: 'Especialistes · EI Suport',       match: (g) => g === 'EI suport' },
  { key: 'siei', label: 'MESI / SIEI',                     match: (g, d) => d.rol === 'ee' || /MESI|SIEI/i.test(g||'') },
  { key: 'pae',  label: 'Suport d\'Educació Especial',     match: (g, d) => ['educador','vetllador','tei','suport'].includes(d.rol) },
  { key: 'ee',   label: 'Altres',                          match: () => true },
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
  const [expanded, setExpanded] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const confirmResolveRef = useRef(null);
  const [viewMode, setViewMode] = useState('personal');
  const [selectedGrup, setSelectedGrup] = useState('G1');
  const [showBaixes,  setShowBaixes]  = useState(false);
  const [baixes,      setBaixes]      = useState([]);
  const [baixesLoaded, setBaixesLoaded] = useState(false);
  const [baixesSaving, setBaixesSaving] = useState(false);
  const [baixaForm,   setBaixaForm]   = useState(null); // null | 'new' | index
  const [baixaDraft,  setBaixaDraft]  = useState({ absent: '', substitut: '', notes: '' });
  const fileRef = useRef(null);

  useEffect(() => {
    if (!api) return;
    reload();
    if (!isOriol) api.getBaixes().then(res => {
      setBaixes(res?.[0]?.oriol_baixes || []);
      setBaixesLoaded(true);
    }).catch(() => setBaixesLoaded(true));
  }, [api]);

  async function loadBaixes() {
    if (baixesLoaded) return;
    try {
      const res = await api.getBaixes();
      setBaixes(res?.[0]?.oriol_baixes || []);
      setBaixesLoaded(true);
    } catch { setBaixes([]); setBaixesLoaded(true); }
  }

  async function saveBaixesList(nova) {
    setBaixesSaving(true);
    try {
      await api.saveBaixes(nova);
      setBaixes(nova);
      showToast('✓ Baixes guardades');
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setBaixesSaving(false); }
  }

  function openBaixaForm(idx) {
    if (idx === 'new') {
      setBaixaDraft({ absent: '', substitut: '', notes: '' });
    } else {
      setBaixaDraft({ ...baixes[idx] });
    }
    setBaixaForm(idx);
  }

  async function confirmBaixaForm() {
    if (!baixaDraft.absent.trim() || !baixaDraft.substitut.trim()) return showToast('Introdueix els dos noms');
    const item = { absent: baixaDraft.absent.trim(), substitut: baixaDraft.substitut.trim(), notes: baixaDraft.notes.trim() };
    const nova = baixaForm === 'new'
      ? [...baixes, item]
      : baixes.map((b, i) => i === baixaForm ? item : b);
    setBaixaForm(null);
    await saveBaixesList(nova);
  }

  async function deleteBaixa(idx) {
    await saveBaixesList(baixes.filter((_, i) => i !== idx));
  }

  async function reload() {
    try { const d = await api.getDocents(); if (d) setDocents(d); }
    catch (e) { console.error(e); }
  }

  async function handleFiles(files) {
    const ACCEPTED = [
      'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const pdfs = Array.from(files).filter(f => ACCEPTED.includes(f.type) || f.name.endsWith('.docx'));
    if (!pdfs.length) return;
    for (const file of pdfs) {
      const id = Date.now() + Math.random();
      setUploads(prev => [...prev, { id, name: file.name, status: 'loading', msg: 'Llegint arxiu...' }]);
      try {
        const isDocx = file.name.endsWith('.docx') || file.type.includes('wordprocessingml');
        let base64, mimeType;
        if (isDocx) {
          setUploads(prev => prev.map(u => u.id === id ? { ...u, msg: 'Convertint Word...' } : u));
          const arrayBuffer = await file.arrayBuffer();
          const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
          base64 = html;
          mimeType = 'text/plain';
        } else {
          base64 = await fileToBase64(file);
          mimeType = file.type;
        }
        setUploads(prev => prev.map(u => u.id === id ? { ...u, msg: 'IA analitzant...' } : u));
        const result = await extractHorariFromPDF(base64, franjes, mimeType);
        setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'done', msg: 'Llest' } : u));
        setConfirm(result);
        await new Promise(resolve => {
          confirmResolveRef.current = resolve;
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

    const existing = data.id
      ? docents.find(d => d.id === data.id)
      : docents.find(d => d.nom.toLowerCase() === nom.toLowerCase());
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
        setDocents(prev => prev.map(d =>
          (existing?.id ? d.id === existing.id : d.nom.toLowerCase() === nom.toLowerCase())
            ? { ...d, ...docent }
            : d
        ));
      }
      if (data.rol === 'directiu' && data.pin) {
        api.syncDirectiuPin(nom, data.pin).catch(() => {});
      }
      showToast(`Horari de ${nom} ${existing ? 'actualitzat' : 'afegit'}`);
      setConfirm(null);
      if (confirmResolveRef.current) { confirmResolveRef.current(); confirmResolveRef.current = null; }
    } catch (e) {
      showToast('Error guardant: ' + e.message);
    }
  }

  function confirmarEliminar(id, nom) {
    setDeleteTarget({ id, nom });
  }

  async function eliminar() {
    if (!deleteTarget) return;
    const { id, nom } = deleteTarget;
    setDeleteTarget(null);
    setDocents(prev => prev.filter(d => d.id !== id));
    try { await api.deleteDocent(id); showToast(`Docent ${nom} eliminat`); }
    catch (e) { showToast('Error eliminant: ' + e.message); reload(); }
  }

  if (confirmData) return <ConfirmHorari data={confirmData} franjes={franjes} onSave={saveHorari} onCancel={() => { setConfirm(null); if (confirmResolveRef.current) { confirmResolveRef.current(); confirmResolveRef.current = null; } }} />;

  // Group docents by nivell
  const groups = {};
  NIVELLS.forEach(n => { groups[n.key] = []; });
  docents.forEach((d, i) => {
    const assigned = NIVELLS.slice(0, -1).find(n => n.match(d.grup_principal, d));
    groups[assigned ? assigned.key : 'ee'].push({ d, i });
  });

  const baixesMap = Object.fromEntries(
    baixes.map(b => [b.absent.toLowerCase().trim(), b])
  );

  return (
    <>
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, maxWidth: 340, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--ink)' }}>Eliminar docent</div>
            <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginBottom: 20, lineHeight: 1.5 }}>
              Segur que vols eliminar <strong>{deleteTarget.nom}</strong>? Aquesta acció no es pot desfer.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-full" onClick={() => setDeleteTarget(null)}>Cancel·lar</button>
              <button className="btn btn-full" style={{ background: 'var(--red)', color: '#fff', border: 'none', fontWeight: 600 }} onClick={eliminar}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
      <div className="page-hdr">
        <div>
          <h1>Personal del centre</h1>
          <p>Gestiona el personal: horaris, correus i accés</p>
        </div>
        {isOriol ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-sm"
              style={viewMode === 'personal' ? { background: 'var(--ink)', color: '#fff', border: 'none', fontWeight: 600 } : {}}
              onClick={() => setViewMode('personal')}
            >👥 Personal</button>
            <button
              className="btn btn-sm"
              style={viewMode === 'grups' ? { background: 'var(--ink)', color: '#fff', border: 'none', fontWeight: 600 } : {}}
              onClick={() => setViewMode('grups')}
            >📚 Grups</button>
          </div>
        ) : (
          <button
            className="btn btn-sm"
            style={{ background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber)', fontSize: 13, fontWeight: 600, padding: '7px 14px', flexShrink: 0 }}
            onClick={() => { setShowBaixes(o => !o); if (!baixesLoaded) loadBaixes(); }}
          >
            🩹 Baixes{baixes.length > 0 ? ` (${baixes.length})` : ''}
          </button>
        )}
      </div>

      {viewMode === 'grups' && isOriol && (
        <GrupsView docents={docents} franjes={franjes} selectedGrup={selectedGrup} onSelectGrup={setSelectedGrup} />
      )}
      {(viewMode !== 'grups' || !isOriol) && (<>

      {showBaixes && !isOriol && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h3>Baixes amb substitucions</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {baixaForm !== 'new' && (
                <button className="btn btn-sm" style={{ background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green)', fontSize: 12, fontWeight: 600 }} onClick={() => openBaixaForm('new')}>
                  + Afegir baixa
                </button>
              )}
              <span className="sp sp-amber">{baixes.length} baixes</span>
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--blue)', background: 'var(--blue-bg)', padding: '9px 14px', borderBottom: '1px solid var(--border)' }}>
            ℹ️ La IA llegeix aquesta llista. El substitut farà l'horari i les cobertures del docent de baixa.
          </div>

          {!baixesLoaded ? (
            <div style={{ padding: 24, textAlign: 'center' }}><Spinner /></div>
          ) : (
            <>
              {baixes.length === 0 && baixaForm !== 'new' && (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Cap baixa registrada.</div>
              )}
              {baixes.map((b, idx) => (
                <div key={idx}>
                  {baixaForm === idx ? (
                    <BaixaFormRow
                      draft={baixaDraft} onChange={setBaixaDraft}
                      onSave={confirmBaixaForm} onCancel={() => setBaixaForm(null)}
                      saving={baixesSaving}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{b.absent}</span>
                          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>→</span>
                          <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>Substitut/a: {b.substitut}</span>
                        </div>
                        {b.notes && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{b.notes}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => openBaixaForm(idx)}>✏️</button>
                        <button className="btn btn-red-soft btn-sm" style={{ fontSize: 12 }} onClick={() => deleteBaixa(idx)}>🗑️</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {baixaForm === 'new' && (
                <BaixaFormRow
                  draft={baixaDraft} onChange={setBaixaDraft}
                  onSave={confirmBaixaForm} onCancel={() => setBaixaForm(null)}
                  saving={baixesSaving} isNew
                />
              )}
            </>
          )}
        </div>
      )}

      <div className="alert alert-blue">
        ℹ️ Puja el PDF o una foto (PNG, JPG) de l'horari de cada docent. La IA llegirà l'horari automàticament.
      </div>

      {docents.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h3>✅ Docents carregats</h3>
            <span className="sp sp-green">{docents.length} docents</span>
          </div>
          {NIVELLS.map(n => {
            const items = n.sort ? [...groups[n.key]].sort(n.sort) : groups[n.key];
            if (!items.length) return null;
            return (
              <div key={n.key}>
                <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
                  {n.label}
                </div>
                {items.map(({ d }) => {
                  const isOpen = expanded === (d.id || d.nom);
                  const teHorari = d.horari && Object.keys(d.horari).length > 0;
                  const baixa = baixesMap[d.nom.toLowerCase().trim()];
                  return (
                    <div key={d.id || d.nom} style={{ borderBottom: '1px solid var(--border)', background: baixa ? 'var(--amber-bg)' : undefined }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px' }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: baixa ? 'var(--amber)' : avatarColor(d.nom), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0, opacity: baixa ? 0.7 : 1 }}>
                          {initials(d.nom)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 500, color: baixa ? 'var(--ink-3)' : undefined, textDecoration: baixa ? 'line-through' : undefined }}>{d.nom}</span>
                            {baixa && (
                              <>
                                <span className="sp sp-amber" style={{ fontSize: 10 }}>🩹 Baixa</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)' }}>→ {baixa.substitut}</span>
                              </>
                            )}
                          </div>
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
                          <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={() => confirmarEliminar(d.id, d.nom)}>✕</button>
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
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Puja un PDF, foto o Word de l'horari</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>PDF · PNG · JPG · DOCX · Pots pujar-ne diversos alhora</div>
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
    </>)}
    </>
  );
}

function HorariInline({ horari, tpFranges = [], franjes }) {
  const tpSet = new Set(Array.isArray(tpFranges) ? tpFranges : []);
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
    const tpSet = new Set(Array.isArray(data.tp_franges) ? data.tp_franges : []);
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
    onSave({ id: data.id, nom, rol, grup_principal: grup, horari, pin, email: email.trim() || null });
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

function BaixaFormRow({ draft, onChange, onSave, onCancel, saving, isNew }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {isNew && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Nova baixa</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label className="f-label">Docent de baixa</label>
          <input className="f-ctrl" placeholder="Nom complet" value={draft.absent} onChange={e => onChange(d => ({ ...d, absent: e.target.value }))} />
        </div>
        <div>
          <label className="f-label">Substitut/a</label>
          <input className="f-ctrl" placeholder="Nom del substitut/a" value={draft.substitut} onChange={e => onChange(d => ({ ...d, substitut: e.target.value }))} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label className="f-label">Notes (opcional)</label>
          <input className="f-ctrl" placeholder="Ex: Baixa des del 01/03/2026" value={draft.notes} onChange={e => onChange(d => ({ ...d, notes: e.target.value }))} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-green" style={{ fontSize: 13, padding: '7px 16px' }} onClick={onSave} disabled={saving || !draft.absent.trim() || !draft.substitut.trim()}>
          {saving ? 'Guardant...' : '✓ Guardar'}
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 13, padding: '7px 12px' }} onClick={onCancel}>Cancel·lar</button>
      </div>
    </div>
  );
}

function matchesGrup(val, grup) {
  const v = (val || '').trim().toLowerCase();
  const g = grup.toLowerCase();
  return v === g || v.startsWith(g + ' ') || v.startsWith(g + '-') || v.startsWith(g + '/');
}

function GrupsView({ docents, franjes, selectedGrup, onSelectGrup }) {
  const grupHorari = useMemo(() => {
    const result = {};
    DIES.forEach(dia => {
      result[dia] = {};
      franjes.forEach(f => {
        result[dia][f.id] = [];
        docents.forEach(d => {
          const val = d.horari?.[dia]?.[f.id] || '';
          if (matchesGrup(val, selectedGrup)) {
            result[dia][f.id].push({ nom: d.nom, val });
          }
        });
      });
    });
    return result;
  }, [docents, franjes, selectedGrup]);

  const visibleFranjes = franjes.filter(f => !f.lliure);
  const horaGroups = {};
  visibleFranjes.forEach(f => {
    if (!horaGroups[f.hora]) horaGroups[f.hora] = [];
    horaGroups[f.hora].push(f);
  });

  const thS = { padding: '6px 8px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textAlign: 'center', whiteSpace: 'nowrap' };
  const tdS = { padding: '4px 6px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, color: 'var(--ink-3)', whiteSpace: 'nowrap' };

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h3>Selecciona el grup</h3></div>
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {GRUPS_ORIOL.map(g => (
            <button
              key={g}
              className="btn btn-sm"
              style={selectedGrup === g
                ? { background: 'var(--ink)', color: '#fff', border: 'none', fontWeight: 700, minWidth: 40 }
                : { background: 'var(--bg-2)', borderColor: 'var(--border)', minWidth: 40 }
              }
              onClick={() => onSelectGrup(g)}
            >{g}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Horari del {selectedGrup}</h3>
          <span className="sp sp-blue">Docents assignats per franja</span>
        </div>
        {docents.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            No hi ha docents carregats. Primer puja els horaris des de la vista Personal.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', padding: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 440 }}>
              <thead>
                <tr>
                  <th colSpan={2} style={{ ...thS, textAlign: 'left' }}>Franja</th>
                  {DIES.map(d => <th key={d} style={thS}>{DIE_ABBR[d]}</th>)}
                </tr>
              </thead>
              <tbody>
                {visibleFranjes.map(f => {
                  const grp = horaGroups[f.hora] || [];
                  const isFirst = grp[0]?.id === f.id;
                  return (
                    <tr key={f.id}>
                      {isFirst && (
                        <td rowSpan={grp.length} style={{ ...tdS, fontWeight: 700, verticalAlign: 'middle', color: 'var(--ink-2)', width: 56 }}>{f.label}</td>
                      )}
                      <td style={{ ...tdS, fontSize: 9, width: 68 }}>{f.sub}</td>
                      {DIES.map(dia => {
                        const entries = grupHorari[dia]?.[f.id] || [];
                        return (
                          <td key={dia} style={{ padding: '4px 5px', border: '1px solid var(--border)', background: entries.length ? 'var(--blue-bg)' : 'var(--bg)', textAlign: 'center', minWidth: 72 }}>
                            {entries.length ? entries.map((e, i) => (
                              <div key={i} title={e.nom} style={{ fontSize: 9.5, color: 'var(--ink-2)', fontWeight: 600, lineHeight: 1.4 }}>
                                {e.nom.split(' ')[0]}
                              </div>
                            )) : (
                              <span style={{ fontSize: 9, color: 'var(--ink-4)' }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
