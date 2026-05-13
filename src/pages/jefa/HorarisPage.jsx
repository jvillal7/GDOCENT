import { useState, useEffect, useRef, useMemo } from 'react';
import mammoth from 'mammoth';
import { useApp } from '../../context/AppContext';
import { FRANJES, FRANJES_ORIOL, DIES, GRUPS_ORIOL, COORDINADORS_CICLE } from '../../lib/constants';
import { initials, oriolInitials, avatarColor, rolLabel } from '../../lib/utils';
import { extractHorariFromPDF } from '../../lib/claude';
import Spinner from '../../components/Spinner';

const DIE_ABBR = { dilluns: 'Dl', dimarts: 'Dt', dimecres: 'Dc', dijous: 'Dj', divendres: 'Dv' };

const ESPECIALISTES_GRUPS = ['Anglès', 'EF', 'Música', 'EI suport'];
const PAE_ROLS = ['educador', 'vetllador', 'tei', 'suport'];

const NIVELLS = [
  { key: 'dir',  label: 'Equip Directiu',               match: (g, d) => d.rol === 'directiu',
    sort: (a, b) => {
      const ord = { 'directora': 0, 'director': 0, "cap d'estudis": 1, 'secretaria': 2 };
      return (ord[(a.d.grup_principal||'').toLowerCase()] ?? 9) - (ord[(b.d.grup_principal||'').toLowerCase()] ?? 9);
    }
  },
  { key: 'tutors_cee', label: 'Tutors/es',             match: (g, d) => d.rol === 'tutor' && (/^G\d+/i.test((g||'').trim()) || /^MxI$/i.test((g||'').trim())),
    sort: (a, b) => {
      const g2n = g => /^MxI$/i.test((g||'').trim()) ? 999 : parseInt((g||'').match(/\d+/)?.[0] || '99');
      return g2n(a.d.grup_principal) - g2n(b.d.grup_principal);
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
  { key: 'mus',  label: 'Especialistes · Música',          match: (g) => /^música$/i.test((g||'').trim()) },
  { key: 'eis',  label: 'Especialistes · EI Suport',       match: (g) => g === 'EI suport' },
  { key: 'siei', label: 'MESI / SIEI',                     match: (g, d) => d.rol === 'ee' || /MESI|SIEI/i.test(g||'') },
  { key: 'mall',  label: 'Especialista · Audició i Llenguatge', match: (g, d) => /MALL/i.test(d.nom || '') },
  { key: 'estim',   label: "Especialista · Estimulació",    match: (g, d) => /ESTIM/i.test(d.nom || '') },
  { key: 'evip',    label: 'Especialista · Educació Artística', match: (g, d) => /EVIP/i.test(d.nom || '') },
  { key: 'msuport', label: 'Mestres de Suport',            match: (g, d) => d.rol === 'msuport' },
  { key: 'pae',     label: 'Suport d\'Educació Especial',  match: (g, d) => ['educador','vetllador','tei','suport'].includes(d.rol) },
  { key: 'ee',   label: 'Altres',                          match: () => true },
];

const COORD_KW = ['coordinació','coordinacio','càrrec','carrec'];

function isCoord(v) { return COORD_KW.some(k => v === k || v.startsWith(k + ' ') || v.startsWith(k + ':') || v.includes(' ' + k)); }

function isTP(v) { return /^tp\b/i.test(v) || v === 'treball personal'; }

function cellBg(val) {
  const v = (val || '').toLowerCase().trim();
  if (isTP(v)) return 'var(--amber-bg)';
  if (isCoord(v)) return 'var(--purple-bg)';
  if (v === 'lliure' || v === 'libre' || v === '') return 'var(--green-bg)';
  if (v === 'pati' || v.startsWith('pati')) return 'var(--bg-3)';
  if (v.includes('piscina')) return '#EBF5FB';
  if (val) return 'var(--blue-bg)';
  return 'var(--green-bg)';
}

function cellColor(val) {
  const v = (val || '').toLowerCase().trim();
  if (isTP(v)) return 'var(--amber)';
  if (isCoord(v)) return 'var(--purple)';
  if (v === 'lliure' || v === 'libre' || v === '') return 'var(--green)';
  if (v.includes('piscina')) return '#1A6E9F';
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
  const [baixaDraft,  setBaixaDraft]  = useState({ absent: '', substitut: '', notes: '', pin: '1234', email: '', data_inici: new Date().toISOString().split('T')[0], data_fi_prevista: '', tipus: 'malaltia', estat: 'activa' });
  const [baixaMes,    setBaixaMes]    = useState('actives');
  const [baixaCobStats, setBaixaCobStats] = useState({});
  const fileRef = useRef(null);

  useEffect(() => {
    if (!api) return;
    reload();
    api.getBaixes().then(res => {
      const list = res?.[0]?.oriol_baixes || [];
      setBaixes(list);
      setBaixesLoaded(true);
      if (list.length) loadBaixaCobStats(list);
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
      setBaixaDraft({ absent: '', substitut: '', notes: '', pin: '1234', email: '', data_inici: new Date().toISOString().split('T')[0], data_fi_prevista: '', tipus: 'malaltia', estat: 'activa' });
    } else {
      const b = baixes[idx];
      setBaixaDraft({ ...b, pin: '1234', email: b.email || '', data_inici: b.data_inici || new Date().toISOString().split('T')[0], data_fi_prevista: b.data_fi_prevista || '', tipus: b.tipus || 'malaltia', estat: b.estat || 'activa' });
    }
    setBaixaForm(idx);
  }

  async function confirmBaixaForm() {
    if (!baixaDraft.absent.trim() || !baixaDraft.substitut.trim()) return showToast('Introdueix els dos noms');
    const existing = baixaForm !== 'new' ? baixes[baixaForm] : null;
    const item = {
      id: existing?.id || String(Date.now()),
      absent: baixaDraft.absent.trim(),
      substitut: baixaDraft.substitut.trim(),
      notes: baixaDraft.notes.trim(),
      data_inici: baixaDraft.data_inici || new Date().toISOString().split('T')[0],
      data_fi_prevista: baixaDraft.data_fi_prevista || null,
      data_fi_real: existing?.data_fi_real || null,
      tipus: baixaDraft.tipus || 'malaltia',
      estat: existing?.estat || 'activa',
    };
    const nova = baixaForm === 'new'
      ? [...baixes, item]
      : baixes.map((b, i) => i === baixaForm ? item : b);
    setBaixaForm(null);
    await saveBaixesList(nova);

    // Crear docent substitut si és nova baixa i no existeix ja al sistema
    if (baixaForm === 'new') {
      const nomSubstitut = baixaDraft.substitut.trim();
      const jaExisteix = docents.some(d => d.nom.toLowerCase() === nomSubstitut.toLowerCase());
      if (!jaExisteix && baixaDraft.pin.length === 4) {
        const titular = docents.find(d => d.nom.toLowerCase() === baixaDraft.absent.toLowerCase().trim());
        if (titular) {
          try {
            await api.saveDocent({
              nom: nomSubstitut,
              escola_id: escola.id,
              rol: titular.rol,
              grup_principal: titular.grup_principal,
              horari: titular.horari || {},
              tp_franges: titular.tp_franges || [],
              cobertures_mes: 0,
              pin: baixaDraft.pin.trim(),
              email: baixaDraft.email.trim() || null,
              actiu: true,
            });
            await reload();
            showToast(`✓ Baixa guardada · ${nomSubstitut} pot fer login al sistema`);
          } catch (e) {
            showToast(`Baixa guardada, però error creant compte: ${e.message}`);
          }
        }
      }
    }
  }

  async function deleteBaixa(idx) {
    await saveBaixesList(baixes.filter((_, i) => i !== idx));
  }

  async function tancarBaixa(idx) {
    const nova = baixes.map((b, i) => i === idx ? { ...b, estat: 'tancada', data_fi_real: new Date().toISOString().split('T')[0] } : b);
    await saveBaixesList(nova);
  }

  async function reobrirBaixa(idx) {
    const nova = baixes.map((b, i) => i === idx ? { ...b, estat: 'activa', data_fi_real: null } : b);
    await saveBaixesList(nova);
  }

  async function loadBaixaCobStats(list) {
    const items = list || baixes;
    if (!items.length || !api) return;
    try {
      const entries = await Promise.all(
        items.filter(b => b.absent).map(async b => {
          const cobs = await api.getCoberturesForAbsent(b.absent).catch(() => []);
          return [b.absent, cobs?.length || 0];
        })
      );
      setBaixaCobStats(Object.fromEntries(entries));
    } catch {}
  }

  function imprimirInforme(baixa, cobCount) {
    const tipusInfo = TIPUS_BAIXA.find(t => t.key === baixa.tipus) || TIPUS_BAIXA[0];
    const dies = duradaDies(baixa);
    const fmtData = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const html = `<!DOCTYPE html><html lang="ca"><head><meta charset="utf-8"><title>Baixa – ${baixa.absent}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:560px;margin:48px auto;color:#222;line-height:1.5}
  h1{font-size:22px;margin:0 0 4px}
  .school{color:#666;font-size:13px;margin-bottom:32px}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  th{text-align:left;font-size:10px;text-transform:uppercase;color:#888;padding:5px 0;border-bottom:2px solid #eee;letter-spacing:.06em}
  td{padding:11px 0;border-bottom:1px solid #f0f0f0;font-size:13.5px;vertical-align:top}
  td:first-child{color:#888;width:160px;font-size:12px}
  .badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700}
  .activa{background:#dcfce7;color:#166534}.tancada{background:#f3f4f6;color:#6b7280}.tipus{background:#fee2e2;color:#991b1b}
  .footer{margin-top:40px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#aaa;display:flex;justify-content:space-between}
  @media print{body{margin:20px}}
</style></head><body>
<h1>Informe de Baixa Laboral</h1>
<div class="school">${escola?.nom || 'Centre educatiu'} · Generat el ${new Date().toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
<table>
  <tr><th>Camp</th><th>Valor</th></tr>
  <tr><td>Docent de baixa</td><td><strong>${baixa.absent}</strong></td></tr>
  <tr><td>Substitut/a</td><td>${baixa.substitut || '—'}</td></tr>
  <tr><td>Tipus de baixa</td><td><span class="badge tipus">${tipusInfo.label}</span></td></tr>
  <tr><td>Estat</td><td><span class="badge ${baixa.estat === 'tancada' ? 'tancada' : 'activa'}">${baixa.estat === 'tancada' ? 'Tancada' : 'Activa'}</span></td></tr>
  <tr><td>Data d'inici</td><td>${fmtData(baixa.data_inici)}</td></tr>
  <tr><td>Fi prevista</td><td>${fmtData(baixa.data_fi_prevista)}</td></tr>
  <tr><td>Fi real</td><td>${fmtData(baixa.data_fi_real)}</td></tr>
  ${dies !== null ? `<tr><td>Durada total</td><td><strong>${dies} dies</strong>${dies >= 7 ? ' (' + formatDurada(dies) + ')' : ''}</td></tr>` : ''}
  ${cobCount > 0 ? `<tr><td>Cobertures generades</td><td><strong>${cobCount}</strong> franges cobertes registrades</td></tr>` : ''}
  ${baixa.notes ? `<tr><td>Notes</td><td>${baixa.notes}</td></tr>` : ''}
</table>
<div class="footer"><span>GDocent · Gestió Docent</span><span>${escola?.nom || ''}</span></div>
</body></html>`;
    const w = window.open('', '_blank', 'width=700,height=620');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
  }

  async function reload() {
    try { const d = await api.getDocents(); if (d) setDocents(d); }
    catch (e) { console.error(e); }
  }

  async function handleCellSave(docent, dia, fid, value) {
    const updatedHorari = { ...docent.horari, [dia]: { ...docent.horari?.[dia], [fid]: value } };
    const updated = { ...docent, horari: updatedHorari };
    try {
      await api.saveDocent(updated);
      setDocents(prev => prev.map(d => d.id === docent.id ? updated : d));
      showToast(`✓ ${docent.nom} actualitzat`);
    } catch (e) { showToast('Error: ' + e.message); }
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
        if (isTP((val || '').toLowerCase())) {
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
      coordinador_cicle: data.coordinador_cicle || null,
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

  // Hooks han d'estar SEMPRE aquí (mai après d'un early return)
  const mesosAcademics = useMemo(() => {
    const now = new Date();
    const acadYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return [
      ...Array.from({ length: 4 }, (_, i) => `${acadYear}-${String(i + 9).padStart(2, '0')}`),
      ...Array.from({ length: 7 }, (_, i) => `${acadYear + 1}-${String(i + 1).padStart(2, '0')}`),
    ];
  }, []);

  const baixesDelMes = useMemo(() => {
    if (baixaMes === 'actives') return baixes.filter(b => b.estat !== 'tancada');
    const [y, m] = baixaMes.split('-').map(Number);
    const primerDia = new Date(y, m - 1, 1);
    const ultimDia = new Date(y, m, 0);
    return baixes.filter(b => {
      if (!b.data_inici) return b.estat !== 'tancada';
      const inici = new Date(b.data_inici + 'T12:00:00');
      if (inici > ultimDia) return false;
      if (b.data_fi_real) return new Date(b.data_fi_real + 'T12:00:00') >= primerDia;
      return true;
    });
  }, [baixes, baixaMes]);

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
  const substitutMap = Object.fromEntries(
    baixes.map(b => [b.substitut.toLowerCase().trim(), b])
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isOriol && (
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
              <button
                style={{ padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all .15s', background: viewMode === 'personal' ? 'var(--surface)' : 'transparent', color: viewMode === 'personal' ? 'var(--ink)' : 'var(--ink-3)', boxShadow: viewMode === 'personal' ? '0 1px 4px rgba(0,0,0,.12)' : 'none' }}
                onClick={() => setViewMode('personal')}
              >👥 Personal</button>
              <button
                style={{ padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all .15s', background: viewMode === 'grups' ? 'var(--surface)' : 'transparent', color: viewMode === 'grups' ? 'var(--ink)' : 'var(--ink-3)', boxShadow: viewMode === 'grups' ? '0 1px 4px rgba(0,0,0,.12)' : 'none' }}
                onClick={() => setViewMode('grups')}
              >📚 Grups</button>
            </div>
          )}
          <button
            className="btn btn-sm"
            style={{ background: showBaixes ? 'var(--amber)' : 'var(--amber-bg)', color: showBaixes ? '#fff' : 'var(--amber)', borderColor: 'var(--amber)', fontSize: 13, fontWeight: 600, padding: '7px 14px', flexShrink: 0 }}
            onClick={() => { setShowBaixes(o => !o); if (!baixesLoaded) loadBaixes(); }}
          >
            🩹 Baixes{baixes.length > 0 ? ` (${baixes.length})` : ''}
          </button>
        </div>
      </div>

      {viewMode === 'grups' && isOriol && (
        <GrupsView docents={docents} franjes={franjes} selectedGrup={selectedGrup} onSelectGrup={setSelectedGrup} onCellSave={handleCellSave} />
      )}
      {(viewMode !== 'grups' || !isOriol) && (<>

      {showBaixes && (
        <div className="card" style={{ marginBottom: 14 }}>
          {/* Capçalera */}
          <div className="card-head">
            <h3>🩹 Baixes amb substitucions</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {baixaForm !== 'new' && (
                <button className="btn btn-sm" style={{ background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green)', fontSize: 12, fontWeight: 600 }} onClick={() => openBaixaForm('new')}>
                  + Nova baixa
                </button>
              )}
              <span className="sp sp-amber">{baixes.filter(b => b.estat !== 'tancada').length} actives</span>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--blue)', background: 'var(--blue-bg)', padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
            ℹ️ La IA llegeix aquesta llista. El substitut farà l'horari i les cobertures del docent de baixa.
          </div>

          {!baixesLoaded ? (
            <div style={{ padding: 24, textAlign: 'center' }}><Spinner /></div>
          ) : (<>

            {/* Navegació mensual */}
            <div style={{ display: 'flex', gap: 5, padding: '10px 14px', borderBottom: '1px solid var(--border)', overflowX: 'auto', scrollbarWidth: 'none' }}>
              <button
                onClick={() => setBaixaMes('actives')}
                style={{ padding: '4px 11px', borderRadius: 20, border: '1.5px solid', flexShrink: 0, fontFamily: 'inherit', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', borderColor: baixaMes === 'actives' ? 'var(--green)' : 'var(--border)', background: baixaMes === 'actives' ? 'var(--green-bg)' : 'var(--bg)', color: baixaMes === 'actives' ? 'var(--green)' : 'var(--ink-3)' }}
              >● Actives ({baixes.filter(b => b.estat !== 'tancada').length})</button>
              {mesosAcademics.map(mes => {
                const [y, m] = mes.split('-').map(Number);
                const primerDia = new Date(y, m - 1, 1);
                const ultimDia = new Date(y, m, 0);
                const count = baixes.filter(b => {
                  if (!b.data_inici) return false;
                  const inici = new Date(b.data_inici + 'T12:00:00');
                  if (inici > ultimDia) return false;
                  if (b.data_fi_real) return new Date(b.data_fi_real + 'T12:00:00') >= primerDia;
                  return true;
                }).length;
                const isFutur = mes > new Date().toISOString().slice(0, 7);
                if (count === 0 && isFutur) return null;
                const isSel = baixaMes === mes;
                return (
                  <button key={mes}
                    onClick={() => setBaixaMes(mes)}
                    style={{ padding: '4px 11px', borderRadius: 20, border: '1.5px solid', flexShrink: 0, fontFamily: 'inherit', cursor: 'pointer', fontSize: 11.5, whiteSpace: 'nowrap', fontWeight: isSel ? 700 : count > 0 ? 500 : 400, borderColor: isSel ? 'var(--amber)' : count > 0 ? 'var(--border)' : 'transparent', background: isSel ? 'var(--amber-bg)' : 'var(--bg)', color: isSel ? 'var(--amber)' : count > 0 ? 'var(--ink-2)' : 'var(--ink-4)' }}
                  >{MESOS_NOM[m - 1].slice(0, 3)} {String(y).slice(2)}{count > 0 ? ` (${count})` : ''}</button>
                );
              })}
            </div>

            {/* KPIs del mes */}
            {baixesDelMes.length > 0 && (() => {
              const actives  = baixesDelMes.filter(b => b.estat !== 'tancada').length;
              const tancades = baixesDelMes.filter(b => b.estat === 'tancada').length;
              const diesTot  = baixesDelMes.reduce((s, b) => s + (duradaDies(b) || 0), 0);
              const cobsTot  = baixesDelMes.reduce((s, b) => s + (baixaCobStats[b.absent] || 0), 0);
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid var(--border)' }}>
                  {[['Actives', actives, 'var(--amber)'], ['Tancades', tancades, 'var(--ink-3)'], ['Dies totals', diesTot, 'var(--blue)'], ['Cobertures', cobsTot, 'var(--green)']].map(([lbl, val, col]) => (
                    <div key={lbl} style={{ padding: '10px 6px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
                      <div style={{ fontSize: 9, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{lbl}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Formulari nova baixa */}
            {baixaForm === 'new' && (
              <BaixaFormRow draft={baixaDraft} onChange={setBaixaDraft} onSave={confirmBaixaForm} onCancel={() => setBaixaForm(null)} saving={baixesSaving} isNew docents={docents} />
            )}

            {/* Llista buida */}
            {baixesDelMes.length === 0 && baixaForm !== 'new' && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                {baixaMes === 'actives' ? 'Cap baixa activa ara mateix.' : 'Cap baixa registrada per a aquest mes.'}
              </div>
            )}

            {/* Cards de baixes */}
            {baixesDelMes.map(b => {
              const idx = baixes.indexOf(b);
              const tipusInfo = TIPUS_BAIXA.find(t => t.key === b.tipus) || TIPUS_BAIXA[0];
              const dies = duradaDies(b);
              const isActiva = b.estat !== 'tancada';
              const cobCount = baixaCobStats[b.absent] ?? 0;

              if (baixaForm === idx) {
                return <BaixaFormRow key={idx} draft={baixaDraft} onChange={setBaixaDraft} onSave={confirmBaixaForm} onCancel={() => setBaixaForm(null)} saving={baixesSaving} docents={docents} />;
              }

              return (
                <div key={b.id || idx} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: isActiva ? undefined : 'var(--bg-2)', opacity: isActiva ? 1 : 0.75 }}>
                  {/* Nom + badges */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: isActiva ? 'var(--amber)' : 'var(--ink-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {initials(b.absent)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{b.absent}</span>
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 700, background: tipusInfo.color + '18', color: tipusInfo.color, border: `1px solid ${tipusInfo.color}35` }}>{tipusInfo.label}</span>
                        {isActiva
                          ? <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 700, background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-mid)' }}>● Activa</span>
                          : <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 700, background: 'var(--bg-3)', color: 'var(--ink-4)', border: '1px solid var(--border)' }}>Tancada</span>
                        }
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 3 }}>
                        Substitut/a: <span style={{ color: 'var(--green)', fontWeight: 600 }}>{b.substitut}</span>
                      </div>
                    </div>
                  </div>

                  {/* Dates i stats */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    {[
                      b.data_inici         && ['Inici',       new Date(b.data_inici + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' }), 'var(--ink-2)'],
                      b.data_fi_prevista   && ['Fi prevista', new Date(b.data_fi_prevista + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' }), 'var(--ink-3)'],
                      b.data_fi_real       && ['Fi real',     new Date(b.data_fi_real + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' }), 'var(--green)'],
                      dies !== null        && ['Durada',       formatDurada(dies), 'var(--amber)'],
                      cobCount > 0         && ['Cobertures',   String(cobCount), 'var(--blue)'],
                    ].filter(Boolean).map(([lbl, val, col]) => (
                      <div key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '6px 10px', background: 'var(--bg-2)', borderRadius: 8, minWidth: 60 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{lbl}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: col }}>{val}</span>
                      </div>
                    ))}
                  </div>

                  {b.notes && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 10, padding: '6px 10px', background: 'var(--bg-2)', borderRadius: 6 }}>{b.notes}</div>
                  )}

                  {/* Accions */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11.5 }} onClick={() => openBaixaForm(idx)}>✏️ Editar</button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11.5 }} onClick={() => imprimirInforme(b, cobCount)}>📄 Informe</button>
                    {isActiva
                      ? <button className="btn btn-sm" style={{ fontSize: 11.5, background: 'var(--bg-2)', color: 'var(--ink-3)', borderColor: 'var(--border)' }} onClick={() => tancarBaixa(idx)}>✓ Tancar baixa</button>
                      : <button className="btn btn-sm" style={{ fontSize: 11.5, background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green)' }} onClick={() => reobrirBaixa(idx)}>↩ Reobrir</button>
                    }
                    <button className="btn btn-red-soft btn-sm" style={{ fontSize: 11.5 }} onClick={() => deleteBaixa(idx)}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </>)}
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
                  const esSubstitut = substitutMap[d.nom.toLowerCase().trim()];
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
                            {esSubstitut && (
                              <span className="sp sp-amber" style={{ fontSize: 10 }}>🔄 Substituint {esSubstitut.absent}</span>
                            )}
                            {hasCeepsir(d) && (
                              <span style={{ fontSize: 9.5, background: 'var(--blue-bg)', color: 'var(--blue)', borderRadius: 4, padding: '1px 5px', fontWeight: 700, letterSpacing: '.03em' }}>CEEPSIR</span>
                            )}
                            {(() => { const cicle = cicleCoordinador(d, isOriol); return cicle ? (
                              <span style={{ fontSize: 9.5, background: 'var(--purple-bg)', color: 'var(--purple)', borderRadius: 4, padding: '1px 5px', fontWeight: 700, letterSpacing: '.03em' }}>
                                Coord. {cicle}
                              </span>
                            ) : null; })()}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                              {rolLabel(d.rol)}{d.grup_principal ? ` · ${d.grup_principal}` : ''} · {(d.tp_franges||[]).length} trams TP
                            </span>
                            {d.rol === 'tutor' && d.grup_principal?.trim() && (
                              <span style={{ fontSize: 15, background: 'var(--green-bg)', color: 'var(--green)', borderRadius: 5, padding: '2px 7px', fontWeight: 700 }}>{d.grup_principal.trim()}</span>
                            )}
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
                      {isOpen && teHorari && <HorariInline horari={d.horari} tpFranges={d.tp_franges} franjes={franjes} onCellSave={(dia, fid, val) => handleCellSave(d, dia, fid, val)} />}
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

function HorariInline({ horari, tpFranges = [], franjes, onCellSave }) {
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState('');
  const tpSet = new Set(Array.isArray(tpFranges) ? tpFranges : []);
  const horaGroups = {};
  franjes.forEach(f => { if (!horaGroups[f.hora]) horaGroups[f.hora] = []; horaGroups[f.hora].push(f); });
  const thS = { padding: '4px 4px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 9, fontWeight: 600, color: 'var(--ink-3)', textAlign: 'center', whiteSpace: 'nowrap' };
  const tdS = { padding: '4px 5px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 9, color: 'var(--ink-3)', whiteSpace: 'nowrap' };

  function startEdit(dia, fid, currentVal) {
    setEditing({ dia, fid });
    setEditVal(currentVal);
  }
  function commitEdit(dia, fid, original) {
    if (onCellSave && editVal !== original) onCellSave(dia, fid, editVal);
    setEditing(null);
  }

  return (
    <div style={{ padding: '0 12px 12px', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['var(--green-bg)','var(--green-mid)','Lliure'],['var(--amber-bg)','#F0D5A8','TP'],['var(--purple-bg)','var(--purple-mid)','Coord/Càrrec'],['var(--blue-bg)','#C0D0EE','Classe'],['var(--bg-3)','var(--border-2)','Pati'],['#EBF5FB','#A9D4EC','Piscina']].map(([bg,bc,lbl]) => (
          <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9.5, color: 'var(--ink-3)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: bg, border: `1px solid ${bc}`, display: 'inline-block' }} />{lbl}
          </span>
        ))}
        {onCellSave && <span style={{ fontSize: 9, color: 'var(--ink-4)', marginLeft: 4 }}>· Clic a una cel·la per editar</span>}
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
                    const isEdit = editing?.dia === dia && editing?.fid === f.id;
                    return (
                      <td key={dia} style={{ padding: 0, border: '1px solid var(--border)', background: isEdit ? 'var(--surface)' : cellBg(val), textAlign: 'center', minWidth: 60 }}>
                        {isEdit ? (
                          <input
                            autoFocus
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={() => commitEdit(dia, f.id, val)}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(dia, f.id, val); if (e.key === 'Escape') setEditing(null); }}
                            style={{ width: '100%', border: 'none', outline: '2px solid var(--blue)', borderRadius: 2, background: 'var(--surface)', fontFamily: 'inherit', fontSize: 9, textAlign: 'center', padding: '4px 2px', color: 'var(--ink)' }}
                          />
                        ) : (
                          <span
                            onClick={() => onCellSave && startEdit(dia, f.id, val)}
                            style={{ fontSize: 9, color: cellColor(val), fontWeight: val ? 500 : 400, display: 'block', padding: '4px 3px', cursor: onCellSave ? 'text' : 'default', minHeight: 20 }}
                          >
                            {val || ''}
                          </span>
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
  const [nom,            setNom]            = useState(data.nom || '');
  const [rol,            setRol]            = useState(data.rol || 'tutor');
  const [grup,           setGrup]           = useState(data.grup_principal || '');
  const [pin,            setPin]            = useState(data.pin || '1234');
  const [email,          setEmail]          = useState(data.email || '');
  const [coordCicle,     setCoordCicle]     = useState(data.coordinador_cicle ?? null); // null = no coord, string = coord + cicle
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
    // Si el grup principal és G1–G14 o MxI, el rol ha de ser tutor sempre
    const rolFinal = /^G\d+/i.test(grup.trim()) || /^MxI$/i.test(grup.trim()) ? 'tutor' : rol;
    onSave({ id: data.id, nom, rol: rolFinal, grup_principal: grup, horari, pin, email: email.trim() || null, coordinador_cicle: (coordCicle !== null && coordCicle.trim()) ? coordCicle.trim() : null });
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
              <option value="msuport">Mestre/a de Suport</option>
              <option value="ee">Ed. Especial</option>
              <option value="directiu">Equip Directiu</option>
              <option value="educador">Educador/a</option>
              <option value="vetllador">Vetllador/a</option>
            </select>
          </div>
          <div>
            <label className="f-label">Grup principal</label>
            <input type="text" className="f-ctrl" value={grup} onChange={e => setGrup(e.target.value)} />
          </div>
          <div>
            <label className="f-label">Coordinador/a de cicle</label>
            <select
              className="f-ctrl"
              value={coordCicle !== null ? 'si' : 'no'}
              onChange={e => setCoordCicle(e.target.value === 'si' ? '' : null)}
              style={{ marginBottom: coordCicle !== null ? 6 : 0 }}
            >
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>
            {coordCicle !== null && (
              <input
                type="text"
                className="f-ctrl"
                placeholder="Ex: Petits, Mitjans, Grans, Secundària..."
                value={coordCicle}
                onChange={e => setCoordCicle(e.target.value)}
              />
            )}
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

function BaixaFormRow({ draft, onChange, onSave, onCancel, saving, isNew, docents }) {
  const docentsSorted = [...(docents || [])].sort((a, b) => a.nom.localeCompare(b.nom));
  const titular = docentsSorted.find(d => d.nom.toLowerCase() === draft.absent.toLowerCase().trim());
  const substitutJaExisteix = docentsSorted.some(d => d.nom.toLowerCase() === draft.substitut.toLowerCase().trim());
  const mostraCrearCompte = isNew && draft.substitut.trim() && !substitutJaExisteix;

  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12, background: isNew ? 'var(--green-bg)' : 'var(--bg-2)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: isNew ? 'var(--green)' : 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {isNew ? '+ Nova baixa' : '✏️ Editant baixa'}
      </div>

      {/* Fila 1: Docent i Substitut */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label className="f-label">Docent de baixa</label>
          <select className="f-ctrl" value={draft.absent} onChange={e => onChange(d => ({ ...d, absent: e.target.value }))}>
            <option value="">Selecciona...</option>
            {docentsSorted.map(d => <option key={d.id} value={d.nom}>{d.nom}</option>)}
          </select>
        </div>
        <div>
          <label className="f-label">Substitut/a</label>
          <input className="f-ctrl" placeholder="Nom del substitut/a" value={draft.substitut} onChange={e => onChange(d => ({ ...d, substitut: e.target.value }))} />
        </div>
      </div>

      {/* Fila 2: Tipus + Dates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div>
          <label className="f-label">Tipus de baixa</label>
          <select className="f-ctrl" value={draft.tipus || 'malaltia'} onChange={e => onChange(d => ({ ...d, tipus: e.target.value }))}>
            {TIPUS_BAIXA.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="f-label">Data d'inici</label>
          <input type="date" className="f-ctrl" value={draft.data_inici || ''} onChange={e => onChange(d => ({ ...d, data_inici: e.target.value }))} />
        </div>
        <div>
          <label className="f-label">Fi prevista (opcional)</label>
          <input type="date" className="f-ctrl" value={draft.data_fi_prevista || ''} onChange={e => onChange(d => ({ ...d, data_fi_prevista: e.target.value }))} />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="f-label">Notes (opcional)</label>
        <input className="f-ctrl" placeholder="Observacions sobre la baixa..." value={draft.notes} onChange={e => onChange(d => ({ ...d, notes: e.target.value }))} />
      </div>

      {/* Bloc crear compte substitut */}
      {mostraCrearCompte && (
        <div style={{ background: 'var(--blue-bg)', border: '1px solid var(--blue-mid, #C0D0EE)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>🔑 Crear accés per a {draft.substitut}</div>
          {titular && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>S'importarà l'horari i el grup de <strong>{titular.nom}</strong></div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
            <div>
              <label className="f-label">PIN (4 dígits)</label>
              <input className="f-ctrl" maxLength={4} placeholder="1234" value={draft.pin || ''} onChange={e => onChange(d => ({ ...d, pin: e.target.value.replace(/[^0-9]/g, '') }))} />
            </div>
            <div>
              <label className="f-label">Correu electrònic</label>
              <input type="email" className="f-ctrl" placeholder="nom@xtec.cat" value={draft.email || ''} onChange={e => onChange(d => ({ ...d, email: e.target.value }))} />
            </div>
          </div>
          {!titular && draft.absent.trim() && (
            <div style={{ fontSize: 11, color: 'var(--amber)' }}>⚠ Titular no trobat — compte es crearà sense horari</div>
          )}
        </div>
      )}
      {isNew && draft.substitut.trim() && substitutJaExisteix && (
        <div style={{ fontSize: 11.5, color: 'var(--green)', background: '#fff', border: '1px solid var(--green-mid)', borderRadius: 6, padding: '7px 10px' }}>
          ✓ {draft.substitut} ja té compte al sistema
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-green" style={{ fontSize: 13, padding: '7px 16px' }} onClick={onSave} disabled={saving || !draft.absent.trim() || !draft.substitut.trim()}>
          {saving ? 'Guardant...' : '✓ Guardar baixa'}
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 13, padding: '7px 12px' }} onClick={onCancel}>Cancel·lar</button>
      </div>
    </div>
  );
}

const TIPUS_BAIXA = [
  { key: 'malaltia',   label: 'Malaltia',             color: '#dc2626' },
  { key: 'maternitat', label: 'Maternitat/Paternitat', color: '#7c3aed' },
  { key: 'accident',   label: 'Accident laboral',      color: '#d97706' },
  { key: 'llicencia',  label: 'Llicència oficial',     color: '#2563eb' },
  { key: 'altre',      label: 'Altra causa',           color: '#6b7280' },
];

const MESOS_NOM = ['Gener','Febrer','Març','Abril','Maig','Juny','Juliol','Agost','Setembre','Octubre','Novembre','Desembre'];

function duradaDies(b) {
  if (!b.data_inici) return null;
  const fi = b.data_fi_real || (b.estat === 'tancada' ? null : new Date().toISOString().split('T')[0]);
  if (!fi) return null;
  return Math.max(0, Math.round((new Date(fi + 'T12:00:00') - new Date(b.data_inici + 'T12:00:00')) / 86400000));
}

function formatDurada(dies) {
  if (dies === null || dies === undefined) return null;
  if (dies === 0) return '0 dies';
  if (dies < 7) return `${dies} d`;
  const s = Math.floor(dies / 7), r = dies % 7;
  return r === 0 ? `${s} setm.` : `${s}s ${r}d`;
}

function hasCeepsir(d) {
  if (!d.horari) return false;
  return Object.values(d.horari).some(dia =>
    Object.values(dia || {}).some(v => (v || '').toLowerCase().includes('ceepsir'))
  );
}

// Retorna el cicle si el docent és coordinador, o null
function cicleCoordinador(d, isOriol) {
  // Prioritat: camp de la base de dades (editable)
  if (d.coordinador_cicle) return d.coordinador_cicle;
  // Fallback: llista hardcoded per a docents sense el camp migrat
  const escola = isOriol ? 'oriol' : 'rivo';
  const llista = COORDINADORS_CICLE[escola] || [];
  const nomNet = oriolInitials(d.nom || '').trim();
  const primer = nomNet.split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const c of llista) {
    if (c.inicials && nomNet === c.inicials) return c.cicle;
    if (c.firstName && primer === c.firstName) return c.cicle;
  }
  return null;
}

function extractBadge(nom) {
  const m = (nom || '').match(/\(([^)]+)\)/);
  return m ? m[1] : null;
}

function badgeStyle(badge) {
  if (!badge) return {};
  const b = badge.toUpperCase();
  if (b === 'PAE')  return { bg: 'var(--purple-bg)', color: 'var(--purple)' };
  if (b === 'MALL') return { bg: 'var(--amber-bg)',  color: 'var(--amber)'  };
  if (b === 'MUS')   return { bg: 'var(--green-bg)',  color: 'var(--green)'  };
  if (b === 'ESTIM') return { bg: 'var(--blue-bg)',   color: 'var(--blue)'   };
  if (b === 'EVIP')  return { bg: 'var(--red-bg)',    color: 'var(--red)'    };
  if (b === 'SUP')   return { bg: 'var(--amber-bg)',  color: 'var(--amber)'  };
  return { bg: 'var(--blue-bg)', color: 'var(--blue)' };
}

function matchesGrup(val, grup) {
  const v = (val || '').trim().toLowerCase();
  const g = grup.toLowerCase();
  if (v === g) return true;
  if (v.startsWith(g + ' ') || v.startsWith(g + '-') || v.startsWith(g + '/')) return true;
  // Detecta també "Suport. G9", "G9. Suport", etc.
  const escaped = g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\b' + escaped + '\\b').test(v);
}

function GrupsView({ docents, franjes, selectedGrup, onSelectGrup, onCellSave }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editing, setEditing] = useState(null); // { nom, dia, fid, currentVal }
  const [editVal, setEditVal] = useState('');
  const [addingEntry, setAddingEntry] = useState(null); // { dia, fid }
  const [addVal, setAddVal] = useState('');

  function startGroupEdit(nom, dia, fid, currentVal) {
    setAddingEntry(null);
    setEditing({ nom, dia, fid, currentVal });
    setEditVal(currentVal);
  }
  function commitGroupEdit() {
    if (!editing || !onCellSave) { setEditing(null); return; }
    const docent = docents.find(d => d.nom === editing.nom);
    if (docent && editVal !== editing.currentVal) onCellSave(docent, editing.dia, editing.fid, editVal);
    setEditing(null);
  }
  function startAddEntry(dia, fid) {
    setEditing(null);
    setAddingEntry({ dia, fid });
    setAddVal('');
  }
  function commitAddEntry() {
    if (!addingEntry || !onCellSave || !addVal.trim()) { setAddingEntry(null); setAddVal(''); return; }
    const target = docents.find(d =>
      d.nom.toLowerCase() === addVal.toLowerCase() ||
      oriolInitials(d.nom).toLowerCase() === addVal.toLowerCase().trim()
    );
    if (target) onCellSave(target, addingEntry.dia, addingEntry.fid, selectedGrup);
    setAddingEntry(null);
    setAddVal('');
  }

  const grupHorari = useMemo(() => {
    const result = {};
    DIES.forEach(dia => {
      result[dia] = {};
      franjes.forEach(f => {
        result[dia][f.id] = [];
        docents.forEach(d => {
          const val = d.horari?.[dia]?.[f.id] || '';
          if (matchesGrup(val, selectedGrup)) {
            result[dia][f.id].push({ nom: d.nom, val, rol: d.rol });
          }
        });
      });
    });
    return result;
  }, [docents, franjes, selectedGrup]);

  const tutor = useMemo(() =>
    docents.find(d => d.rol === 'tutor' && d.grup_principal?.trim().startsWith(selectedGrup)),
    [docents, selectedGrup]
  );

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {onCellSave && (
              <button
                className="btn btn-sm"
                style={isEditMode
                  ? { background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green)', fontSize: 12, fontWeight: 600 }
                  : { background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'var(--blue)', fontSize: 12, fontWeight: 600 }
                }
                onClick={() => { setIsEditMode(o => !o); setEditing(null); }}
              >{isEditMode ? '✓ Fet' : '✏️ Editar'}</button>
            )}
            <span className="sp sp-blue">Professionals assignats per franja</span>
          </div>
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
                        const tutorRawVal    = tutor?.horari?.[dia]?.[f.id] || '';
                        const tutorVal       = tutorRawVal.toLowerCase();
                        const isGrupPiscina  = tutorVal.includes('piscina');
                        const isGrupCeepsir  = tutorVal.includes('ceepsir');
                        const isGrupActivity = isGrupPiscina || isGrupCeepsir;
                        const isTutorTrivial = !tutorRawVal || tutorVal === 'lliure' || tutorVal === 'libre' || tutorVal.startsWith('pati') || /^tp\b/i.test(tutorVal);
                        const showTutorPresence = !isTutorTrivial && !isGrupActivity;
                        const rolBadge = e => extractBadge(e.nom) || (e.rol === 'msuport' ? 'SUP' : null);
                        const primaris = entries.filter(e => !rolBadge(e));
                        const suports  = entries.filter(e =>  rolBadge(e));
                        const renderEntry = (e, i, isSup) => {
                          const isEditing = isEditMode && editing?.nom === e.nom && editing?.dia === dia && editing?.fid === f.id;
                          const badge = isSup ? rolBadge(e) : null;
                          const { bg, color } = badge ? badgeStyle(badge) : {};
                          if (isEditing) {
                            return (
                              <input
                                key={i}
                                autoFocus
                                value={editVal}
                                onChange={ev => setEditVal(ev.target.value)}
                                onBlur={commitGroupEdit}
                                onKeyDown={ev => { if (ev.key === 'Enter') commitGroupEdit(); if (ev.key === 'Escape') setEditing(null); }}
                                style={{ width: 70, border: 'none', outline: '2px solid var(--blue)', borderRadius: 2, background: 'var(--surface)', fontFamily: 'inherit', fontSize: 9, textAlign: 'center', padding: '2px 2px', color: 'var(--ink)' }}
                              />
                            );
                          }
                          if (isSup) {
                            return (
                              <div key={i} title={e.nom}
                                onClick={() => isEditMode && startGroupEdit(e.nom, dia, f.id, e.val)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 2, lineHeight: 1.3, whiteSpace: 'nowrap', cursor: isEditMode ? 'text' : 'default' }}>
                                <span style={{ fontSize: 9, color, fontWeight: 600 }}>{oriolInitials(e.nom)}</span>
                                <span style={{ fontSize: 7.5, background: bg, color, borderRadius: 3, padding: '0 2px', fontWeight: 700, flexShrink: 0 }}>{badge}</span>
                              </div>
                            );
                          }
                          return (
                            <div key={i} title={e.nom}
                              onClick={() => isEditMode && startGroupEdit(e.nom, dia, f.id, e.val)}
                              style={{ fontSize: 9.5, color: 'var(--ink-2)', fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap', cursor: isEditMode ? 'text' : 'default' }}>
                              {oriolInitials(e.nom)}
                            </div>
                          );
                        };
                        return (
                          <td key={dia} style={{ padding: '3px 4px', border: '1px solid var(--border)', background: isGrupPiscina ? '#EBF5FB' : isGrupCeepsir ? 'var(--blue-bg)' : entries.length ? 'var(--blue-bg)' : showTutorPresence ? 'var(--bg-2)' : isEditMode ? 'var(--bg-2)' : 'var(--bg)', textAlign: 'center', minWidth: 80, overflow: 'visible' }}>
                            {isGrupActivity && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: isGrupPiscina ? '#1A6E9F' : 'var(--blue)', display: 'block', marginBottom: entries.length ? 2 : 0 }}>
                                {isGrupPiscina ? '🏊 Piscina' : 'CEEPSIR'}
                              </span>
                            )}
                            {entries.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                {primaris.map((e, i) => renderEntry(e, i, false))}
                                {suports.map((e, i) => renderEntry(e, i, true))}
                              </div>
                            )}
                            {entries.length === 0 && !isGrupActivity && !isEditMode && !showTutorPresence && (
                              <span style={{ fontSize: 9, color: 'var(--ink-4)' }}>—</span>
                            )}
                            {entries.length === 0 && showTutorPresence && !isEditMode && (
                              <span style={{ fontSize: 8.5, color: 'var(--ink-2)', fontWeight: 600, display: 'block', lineHeight: 1.3 }}>
                                {tutorRawVal}
                              </span>
                            )}
                            {isEditMode && (
                              addingEntry?.dia === dia && addingEntry?.fid === f.id ? (
                                <>
                                  <input
                                    autoFocus
                                    list="grups-docents-list"
                                    value={addVal}
                                    onChange={ev => setAddVal(ev.target.value)}
                                    onBlur={commitAddEntry}
                                    onKeyDown={ev => { if (ev.key === 'Enter') commitAddEntry(); if (ev.key === 'Escape') { setAddingEntry(null); setAddVal(''); } }}
                                    placeholder="Nom..."
                                    style={{ width: 70, border: 'none', outline: '2px solid var(--green)', borderRadius: 2, background: 'var(--surface)', fontFamily: 'inherit', fontSize: 9, textAlign: 'center', padding: '2px', color: 'var(--ink)' }}
                                  />
                                  <datalist id="grups-docents-list">
                                    {docents.map(d => <option key={d.id} value={d.nom} />)}
                                  </datalist>
                                </>
                              ) : (
                                <span
                                  onClick={() => startAddEntry(dia, f.id)}
                                  style={{ fontSize: 11, color: 'var(--green)', cursor: 'pointer', display: 'block', padding: '1px 0', lineHeight: 1 }}
                                >+</span>
                              )
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
