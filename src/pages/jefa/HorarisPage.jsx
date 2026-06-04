import { useState, useEffect, useRef, useMemo } from 'react';
import mammoth from 'mammoth';
import { useApp } from '../../context/AppContext';
import { FRANJES, FRANJES_ORIOL, FRANJES_INTENSIVA, MAP_NORMAL_TO_INTENSIVA, FRANJES_INTENSIVA_ORIOL, MAP_ORIOL_TO_INTENSIVA, DIES, GRUPS_ORIOL, COORDINADORS_CICLE, MOTIUS_ABSENCIA, esMotuiATRI, MOTIUS_AMB_JUSTIFICANT } from '../../lib/constants';
import { initials, oriolInitials, avatarColor, rolLabel, normGrup } from '../../lib/utils';
import { extractHorariFromPDF, generarHorarisIntensius, extractarReglesIntensiuPDF } from '../../lib/claude';
import { callClaudeRaw, callClaude } from '../../lib/claude-api';
import { uploadFitxer, sendEmail } from '../../lib/api';
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

function convertTo15Min(horari30) {
  const DIES_ALL = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres'];
  const result = {};
  for (const dia of DIES_ALL) {
    result[dia] = {};
    const src = horari30[dia] || {};
    FRANJES_INTENSIVA.forEach(f => { result[dia][f.id] = ''; });
    for (const [f30, f15s] of Object.entries(MAP_NORMAL_TO_INTENSIVA)) {
      const val = src[f30] || '';
      for (const f15 of f15s) result[dia][f15] = val;
    }
    result[dia]['iPA'] = src['patiA'] || src['patiB'] || '';
  }
  return result;
}

function convertOriolTo15Min(horari30) {
  const DIES_ALL = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres'];
  const result = {};
  for (const dia of DIES_ALL) {
    result[dia] = {};
    const src = horari30[dia] || {};
    FRANJES_INTENSIVA_ORIOL.forEach(f => { result[dia][f.id] = ''; });
    for (const [fo, f15s] of Object.entries(MAP_ORIOL_TO_INTENSIVA)) {
      const val = src[fo] || '';
      for (const f15 of f15s) result[dia][f15] = val;
    }
    result[dia]['ioPA'] = src['opatiA'] || src['opatiB'] || '';
  }
  return result;
}

export default function HorarisPage() {
  const { api, escola, setEscola, docents, setDocents, showToast, normes } = useApp();
  const isOriol  = escola?.nom?.toLowerCase().includes('oriol');
  const franjes   = isOriol ? FRANJES_ORIOL : FRANJES;
  const [confirmData, setConfirm]   = useState(null);
  const [uploads, setUploads]   = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const confirmResolveRef = useRef(null);
  const [viewMode, setViewMode] = useState('personal');
  const [selectedGrup, setSelectedGrup] = useState('G1');
  const [selectedRivoGrup, setSelectedRivoGrup] = useState('');
  const [configIntensiva, setConfigIntensiva] = useState(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [intensiuMode, setIntensiuMode] = useState(new Set());
  const [baixes,      setBaixes]      = useState([]);
  const [baixesLoaded, setBaixesLoaded] = useState(false);
  const [baixesSaving, setBaixesSaving] = useState(false);
  const [baixaForm,   setBaixaForm]   = useState(null); // null | 'new' | index
  const [baixaDraft,  setBaixaDraft]  = useState({ absent: '', substitut: '', notes: '', pin: '1234', email: '', data_inici: new Date().toISOString().split('T')[0], data_fi_prevista: '', motiu_detall: '', estat: 'activa' });
  const [baixaMes,    setBaixaMes]    = useState('actives');
  const [baixaCobStats, setBaixaCobStats] = useState({});
  const [baixaDeleteConfirm, setBaixaDeleteConfirm] = useState(null); // { idx, b, substitutDocent }
  const [searchDocent, setSearchDocent] = useState('');
  const fileRef = useRef(null);
  const [dragUpload, setDragUpload] = useState(false);

  useEffect(() => {
    if (!api) return;
    reload();
    api.getConfigIntensiva().then(res => {
      setConfigIntensiva(res?.[0]?.config_intensiva || null);
      setConfigLoaded(true);
    }).catch(() => setConfigLoaded(true));
    api.getBaixes().then(res => {
      const list = res?.[0]?.oriol_baixes || [];
      setBaixes(list);
      setBaixesLoaded(true);
      if (list.length) loadBaixaCobStats(list);
    }).catch(() => setBaixesLoaded(true));
  }, [api]);

  // Sanejament automàtic: si algun substitut ja no existeix com a docent actiu, elimina la baixa
  useEffect(() => {
    if (!api || !baixesLoaded || docents.length === 0 || baixes.length === 0) return;
    const nomsActius = new Set(docents.map(d => d.nom.toLowerCase().trim()));
    const netes = baixes.filter(b => nomsActius.has((b.substitut || '').toLowerCase().trim()));
    if (netes.length !== baixes.length) {
      api.saveBaixes(netes).catch(() => {});
      setBaixes(netes);
    }
  }, [baixesLoaded, docents.length, baixes.length]);

  async function loadBaixes() {
    if (baixesLoaded) return;
    try {
      const res = await api.getBaixes();
      const list = res?.[0]?.oriol_baixes || [];
      setBaixes(list);
      setBaixesLoaded(true);
      if (list.length) loadBaixaCobStats(list);
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
      setBaixaDraft({ absent: '', substitut: '', notes: '', pin: '1234', email: '', data_inici: new Date().toISOString().split('T')[0], data_fi_prevista: '', motiu_detall: '', estat: 'activa' });
    } else {
      const b = baixes[idx];
      setBaixaDraft({ ...b, pin: '1234', email: b.email || '', data_inici: b.data_inici || new Date().toISOString().split('T')[0], data_fi_prevista: b.data_fi_prevista || '', motiu_detall: b.motiu_detall || '', estat: b.estat || 'activa' });
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
      motiu_detall: baixaDraft.motiu_detall || '',
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
            // Si el titular és directiu, sincronitzar el PIN a la taula directius perquè pugui fer login
            if (titular.rol === 'directiu') {
              await api.syncDirectiuPin(nomSubstitut, baixaDraft.pin.trim()).catch(() => {});
            }
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
    const b = baixes[idx];
    const substitutDocent = docents.find(d => d.nom.toLowerCase().trim() === (b.substitut || '').toLowerCase().trim());
    if (substitutDocent) {
      setBaixaDeleteConfirm({ idx, b, substitutDocent });
      return;
    }
    await saveBaixesList(baixes.filter((_, i) => i !== idx));
  }

  async function confirmarDeleteBaixa(eliminarSubstitut) {
    if (!baixaDeleteConfirm) return;
    const { idx, substitutDocent } = baixaDeleteConfirm;
    setBaixaDeleteConfirm(null);
    await saveBaixesList(baixes.filter((_, i) => i !== idx));
    if (eliminarSubstitut && substitutDocent) {
      try {
        await api.deleteDocent(substitutDocent.id);
        setDocents(prev => prev.filter(d => d.id !== substitutDocent.id));
        showToast(`✓ Baixa i compte de ${substitutDocent.nom} eliminats`);
      } catch (e) { showToast('Error eliminant substitut: ' + e.message); }
    }
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
    const tipusInfo = { label: baixa.motiu_detall || baixa.tipus || 'Malaltia' };
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
      if (data.grup_principal === "Cap d'Estudis") {
        const emailJefa = data.email?.trim() || null;
        api.saveEmailNotificacions(emailJefa).catch(() => {});
        setEscola(e => ({ ...e, email_notificacions: emailJefa }));
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
    try {
      await api.deleteDocent(id);
      // Si el docent eliminat era un substitut, netejar la baixa corresponent
      const nomLow = nom.toLowerCase().trim();
      const novaBaixes = baixes.filter(b => (b.substitut || '').toLowerCase().trim() !== nomLow);
      if (novaBaixes.length !== baixes.length) {
        await api.saveBaixes(novaBaixes);
        setBaixes(novaBaixes);
      }
      showToast(`Docent ${nom} eliminat`);
    }
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
      {baixaDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--ink)' }}>Eliminar baixa</div>
            <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginBottom: 20, lineHeight: 1.5 }}>
              <strong>{baixaDeleteConfirm.substitutDocent.nom}</strong> té accés al sistema com a substitut/a de <strong>{baixaDeleteConfirm.b.absent}</strong>. Vols eliminar també el seu compte?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-full" style={{ background: 'var(--red)', color: '#fff', border: 'none', fontWeight: 600 }} onClick={() => confirmarDeleteBaixa(true)}>
                🗑️ Eliminar baixa i compte de {baixaDeleteConfirm.substitutDocent.nom.split(' ')[0]}
              </button>
              <button className="btn btn-ghost btn-full" onClick={() => confirmarDeleteBaixa(false)}>Eliminar només la baixa</button>
              <button className="btn btn-ghost btn-full" style={{ color: 'var(--ink-3)', fontSize: 12 }} onClick={() => setBaixaDeleteConfirm(null)}>Cancel·lar</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'personal',  icon: '👥', title: 'Personal del centre', desc: 'Horaris, correus i accés' },
          { key: 'grups',     icon: '📚', title: 'Grups',               desc: 'Horaris per grup i aula' },
          { key: 'intensiva', icon: '🌅', title: 'Intensiva',           desc: 'Jornada intensiva',        dot: configIntensiva?.actiu },
          { key: 'pati',      icon: '🕐', title: 'Pati',                desc: 'Torns de vigilància' },
          { key: 'sortides',  icon: '🚌', title: 'Sortides',            desc: 'Gestiona sortides escolars' },
          { key: 'baixes',    icon: '🩹', title: 'Baixes',              desc: baixes.filter(b => b.estat !== 'tancada').length ? `${baixes.filter(b => b.estat !== 'tancada').length} actives` : 'Cap baixa activa' },
        ].map(c => {
          const isActive = viewMode === c.key;
          const isAmber  = c.key === 'baixes';
          return (
            <button
              key={c.key}
              onClick={() => {
                setViewMode(c.key);
                if (c.key === 'baixes' && !baixesLoaded) loadBaixes();
              }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: '12px 14px', border: '1.5px solid', borderRadius: 10,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', position: 'relative',
                background: isActive ? (isAmber ? 'var(--amber-bg)' : 'var(--blue-bg)') : 'var(--surface)',
                borderColor: isActive ? (isAmber ? 'var(--amber)' : 'var(--blue)') : 'var(--border)',
                transition: 'all .15s',
              }}
            >
              <span style={{ fontSize: 22, marginBottom: 6, lineHeight: 1 }}>{c.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? (isAmber ? 'var(--amber)' : 'var(--blue)') : 'var(--ink)', lineHeight: 1.3 }}>{c.title}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.3 }}>{c.desc}</span>
              {c.dot && <span style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: '50%', background: 'var(--green)' }} />}
            </button>
          );
        })}
      </div>

      {viewMode === 'grups' && isOriol && (
        <GrupsView docents={docents} franjes={franjes} selectedGrup={selectedGrup} onSelectGrup={setSelectedGrup} onCellSave={handleCellSave} configIntensiva={configIntensiva} onConfigChange={setConfigIntensiva} api={api} showToast={showToast} escola={escola} />
      )}
      {viewMode === 'grups' && !isOriol && (
        <RivoGrupsView docents={docents} franjes={franjes} selectedGrup={selectedRivoGrup} onSelectGrup={setSelectedRivoGrup} onCellSave={handleCellSave} configIntensiva={configIntensiva} onConfigChange={setConfigIntensiva} api={api} showToast={showToast} escola={escola} />
      )}
      {viewMode === 'intensiva' && (
        <IntensivaView
          docents={docents}
          franjes={franjes}
          normes={normes}
          api={api}
          configIntensiva={configIntensiva}
          onConfigChange={cfg => setConfigIntensiva(cfg)}
          onHorarisSaved={reload}
          showToast={showToast}
        />
      )}
      {viewMode === 'pati' && (
        <PatiView
          docents={docents}
          franjes={franjes}
          configIntensiva={configIntensiva}
          api={api}
          showToast={showToast}
          isOriol={isOriol}
          baixes={baixes}
          escola={escola}
        />
      )}
      {viewMode === 'sortides' && (
        <SortidesView
          docents={docents}
          franjes={franjes}
          api={api}
          escola={escola}
          baixes={baixes}
          showToast={showToast}
        />
      )}
      {viewMode === 'baixes' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h3>🩹 Baixes amb substitucions</h3>
            <span className="sp sp-amber">{baixes.filter(b => b.estat !== 'tancada').length} actives</span>
          </div>
          {baixaForm !== 'new' && (
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <button
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '11px 16px', background: 'var(--green-bg)', color: 'var(--green)', border: '1.5px dashed var(--green)', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700 }}
                onClick={() => openBaixaForm('new')}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>＋</span>
                <span>Nova baixa amb substitució</span>
              </button>
            </div>
          )}

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
              const tipusInfo = { label: b.motiu_detall || b.tipus || 'Malaltia', color: b.motiu_detall ? (esMotuiATRI(b.motiu_detall) ? '#2563eb' : '#dc2626') : (TIPUS_BAIXA.find(t => t.key === b.tipus)?.color || '#dc2626') };
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

      {viewMode !== 'grups' && viewMode !== 'intensiva' && viewMode !== 'pati' && viewMode !== 'sortides' && viewMode !== 'baixes' && (<>

      <div className="alert alert-blue">
        ℹ️ Puja el PDF o una foto (PNG, JPG) de l'horari de cada docent. La IA llegirà l'horari automàticament.
      </div>

      {docents.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h3>✅ Docents carregats</h3>
            <span className="sp sp-green">{docents.length} docents</span>
          </div>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 11, fontSize: 15, color: 'var(--ink-3)', pointerEvents: 'none', userSelect: 'none' }}>🔍</span>
              <input
                type="search"
                placeholder="Cercar docent per nom..."
                value={searchDocent}
                onChange={e => setSearchDocent(e.target.value)}
                style={{ paddingLeft: 34, paddingRight: 12, height: 36, border: '1.5px solid var(--border-2)', borderRadius: 20, background: 'var(--surface)', fontFamily: 'inherit', fontSize: 13.5, width: '100%', outline: 'none', color: 'var(--ink)', boxSizing: 'border-box' }}
              />
              {searchDocent && (
                <button onClick={() => setSearchDocent('')} style={{ position: 'absolute', right: 10, border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--ink-3)', lineHeight: 1, padding: 2 }}>✕</button>
              )}
            </div>
          </div>
          {NIVELLS.map(n => {
            const normSearch = searchDocent.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            const allItems = n.sort ? [...groups[n.key]].sort(n.sort) : groups[n.key];
            const items = normSearch
              ? allItems.filter(({ d }) => (d.nom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(normSearch))
              : allItems;
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
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {teHorari && (
                            <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={() => setExpanded(isOpen ? null : (d.id || d.nom))}>
                              {isOpen ? '▴ Tancar' : '▾ Horari'}
                            </button>
                          )}
                          {teHorari && d.horari_intensiu && (
                            <div style={{ display: 'flex', gap: 0, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                              <button
                                style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: !intensiuMode.has(d.id || d.nom) ? 'var(--ink)' : 'transparent', color: !intensiuMode.has(d.id || d.nom) ? '#fff' : 'var(--ink-3)', transition: 'all .1s' }}
                                onClick={() => setIntensiuMode(s => { const n = new Set(s); n.delete(d.id || d.nom); return n; })}
                              >Normal</button>
                              <button
                                style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: intensiuMode.has(d.id || d.nom) ? 'var(--amber)' : 'transparent', color: intensiuMode.has(d.id || d.nom) ? '#fff' : 'var(--ink-3)', transition: 'all .1s' }}
                                onClick={() => { setIntensiuMode(s => { const n = new Set(s); n.add(d.id || d.nom); return n; }); setExpanded(d.id || d.nom); }}
                              >🌅 Intensiu</button>
                            </div>
                          )}
                          <button className="btn btn-sm" style={{ background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'var(--blue)', fontSize: 12 }} onClick={() => setConfirm(d)}>✏️ Editar</button>
                          <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={() => confirmarEliminar(d.id, d.nom)}>✕</button>
                        </div>
                      </div>
                      {isOpen && teHorari && (() => {
                        const mostrarIntensiu = intensiuMode.has(d.id || d.nom) && d.horari_intensiu;
                        const horariShow = mostrarIntensiu ? d.horari_intensiu : d.horari;
                        return <HorariInline horari={horariShow} tpFranges={d.tp_franges} franjes={franjes} onCellSave={mostrarIntensiu ? null : (dia, fid, val) => handleCellSave(d, dia, fid, val)} />;
                      })()}
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
            style={{ border: `2px dashed ${dragUpload ? 'var(--blue)' : 'var(--border-2)'}`, borderRadius: 'var(--r)', padding: '24px 16px', textAlign: 'center', cursor: 'pointer', background: dragUpload ? 'var(--blue-bg)' : 'var(--bg)', marginBottom: 12, transition: 'all .15s' }}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragUpload(true); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragUpload(false); }}
            onDrop={e => { e.preventDefault(); setDragUpload(false); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
          >
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
            {dragUpload
              ? <><div style={{ fontSize: 28, marginBottom: 8 }}>📂</div><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--blue)' }}>Deixa anar el fitxer per pujar-lo</div></>
              : <><div style={{ fontSize: 28, marginBottom: 8 }}>📄</div><div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Puja un PDF, foto o Word de l'horari</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>PDF · PNG · JPG · DOCX · Pots pujar-ne diversos alhora · o arrossega aquí</div></>
            }
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

function IntensivaView({ docents, franjes, normes, api, configIntensiva, onConfigChange, onHorarisSaved, showToast }) {
  const { escola } = useApp();
  const cfg = configIntensiva || {};
  const [dataInici, setDataInici]   = useState(cfg.data_inici || '');
  const [dataFi, setDataFi]         = useState(cfg.data_fi || '');
  const [actiu, setActiu]           = useState(cfg.actiu || false);
  const [generating, setGenerating] = useState(false);
  const [generatingMsg, setGeneratingMsg] = useState('');
  const [editingMap, setEditingMap]         = useState(null); // { docentId: horariModificat }
  const [canvisAnteriors, setCanvisAnteriors] = useState({}); // per diff visual
  const [tornsPati, setTornsPati]           = useState(null);
  const [tpPendents, setTpPendents]         = useState([]);
  const [resumGeneracio, setResumGeneracio] = useState('');
  const [saving, setSaving]                 = useState(false);
  const [configSaving, setConfigSaving]     = useState(false);
  // Regles per checklist
  const [regleTpTarda, setRegleTpTarda]       = useState(cfg.regles?.tpTarda || 'pati');
  const [regleTpAltraText, setRegleTpAltraText] = useState(cfg.regles?.tpAltraText || '');
  const [reglesEquilibraEsp, setReglesEquilibraEsp] = useState(cfg.regles?.equilibrarEspecialistes || false);
  const [reglesNoTallers, setReglesNoTallers] = useState(cfg.regles?.noTallers || false);
  const [reglesCompactar45, setReglesCompactar45] = useState(cfg.regles?.compactar45 || false);
  const [instruccionsLliures, setInstruccionsLliures] = useState(cfg.regles?.instruccionsLliures || '');
  const [plantillaSaving, setPlantillaSaving] = useState(false);
  // Importar horari passat
  const importFileRef = useRef(null);
  const [detectant, setDetectant]   = useState(false);
  const [importBase64, setImportBase64] = useState(null);
  const [importMime, setImportMime]     = useState(null);
  const [dragImport, setDragImport] = useState(false);

  // Sync local state quan canvia la config externa
  useEffect(() => {
    if (configIntensiva) {
      setDataInici(configIntensiva.data_inici || '');
      setDataFi(configIntensiva.data_fi || '');
      setActiu(configIntensiva.actiu || false);
      if (configIntensiva.regles) {
        setRegleTpTarda(configIntensiva.regles.tpTarda || 'pati');
        setRegleTpAltraText(configIntensiva.regles.tpAltraText || '');
        setReglesEquilibraEsp(configIntensiva.regles.equilibrarEspecialistes || false);
        setReglesNoTallers(configIntensiva.regles.noTallers || false);
        setReglesCompactar45(configIntensiva.regles.compactar45 || false);
        setInstruccionsLliures(configIntensiva.regles.instruccionsLliures || '');
      }
    }
  }, [configIntensiva]);

  async function saveConfig(patch) {
    setConfigSaving(true);
    try {
      const nova = { ...cfg, ...patch };
      await api.saveConfigIntensiva(nova);
      onConfigChange(nova);
      showToast('✓ Configuració guardada');
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setConfigSaving(false); }
  }

  async function guardarPlantilla() {
    setPlantillaSaving(true);
    try {
      const regles = { tpTarda: regleTpTarda, tpAltraText: regleTpAltraText, equilibrarEspecialistes: reglesEquilibraEsp, noTallers: reglesNoTallers, compactar45: reglesCompactar45, instruccionsLliures };
      const nova = { ...cfg, regles };
      await api.saveConfigIntensiva(nova);
      onConfigChange(nova);
      showToast('✓ Regles guardades com a plantilla');
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setPlantillaSaving(false); }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setImportBase64(ev.target.result.split(',')[1]);
      setImportMime(file.type || 'application/pdf');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function detectarRegles() {
    if (!importBase64) return;
    setDetectant(true);
    try {
      const result = await extractarReglesIntensiuPDF(importBase64, importMime);
      if (result.tpTarda) setRegleTpTarda(result.tpTarda);
      if (result.instruccionsLliures) setInstruccionsLliures(result.instruccionsLliures);
      showToast(`✓ Regles detectades: ${result.resum || 'OK'}`);
    } catch (e) { showToast('Error detectant regles: ' + e.message); }
    finally { setDetectant(false); }
  }

  async function generar() {
    const MSGS_GENERANT = [
      '✨ Analitzant els horaris actuals...',
      '🔍 Buscant les millors combinacions...',
      '🧩 Encaixant franges i grups...',
      '⚖️ Equilibrant la càrrega de cada docent...',
      '🌅 Adaptant a la jornada intensiva...',
      '🤖 HorarIA pensant fort...',
      '📐 Respectant les teves instruccions...',
      '🎯 Optimitzant els canvis...',
      '✅ Ja quasi llest...',
    ];
    let msgIdx = 0;
    setGeneratingMsg(MSGS_GENERANT[0]);
    const msgInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % MSGS_GENERANT.length;
      setGeneratingMsg(MSGS_GENERANT[msgIdx]);
    }, 2200);

    setGenerating(true);
    try {
      // Si l'opció és "altra", la instrucció personalitzada gestiona el TP; internament usem 'eliminar'
      const tpTardaEfectiu = regleTpTarda === 'altra' ? 'eliminar' : regleTpTarda;
      let instruccionsEfectives = regleTpTarda === 'altra' && regleTpAltraText.trim()
        ? `GESTIÓ DEL TP DE TARDA: ${regleTpAltraText.trim()}\n\n${instruccionsLliures}`
        : instruccionsLliures;

      // Equilibri d'especialistes: instruccions concretes amb slots exactes
      if (reglesEquilibraEsp) {
        const DIES_S = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres'];
        const ESP_KW = ['ef', 'anglès', 'angles', 'música', 'musica', 'ei suport'];
        const instrLines = [];

        for (const d of docents) {
          if (!d.horari) continue;
          if (!ESP_KW.some(kw => (d.grup_principal || '').toLowerCase().includes(kw))) continue;

          const grupsMap = {}; // grupNom → ['dilluns/f3a', ...]
          for (const dia of DIES_S) {
            for (const [fid, v] of Object.entries(d.horari[dia] || {})) {
              const val = (v || '').trim();
              if (!val || /^(tp|lliure|pati|coordinaci|càrrec|ceepsir)/i.test(val)) continue;
              const gnom = val.split(/\s*[·/]\s*/)[0].trim();
              if (!gnom) continue;
              if (!grupsMap[gnom]) grupsMap[gnom] = [];
              grupsMap[gnom].push(`${dia}/${fid}`);
            }
          }

          const keys = Object.keys(grupsMap);
          if (keys.length <= 1) continue;
          const counts = keys.map(g => grupsMap[g].length);
          if (Math.max(...counts) === Math.min(...counts)) continue;

          const target = Math.round(counts.reduce((a, b) => a + b, 0) / keys.length);
          instrLines.push(`
${d.nom} (${d.grup_principal}) — objectiu: ${target} slots/grup:`);
          for (const g of keys) {
            const diff = grupsMap[g].length - target;
            if (diff > 0)      instrLines.push(`  BUIDA ${diff} slot(s) de "${g}" (ara ${grupsMap[g].length}→${target}). Opcions: ${grupsMap[g].join(', ')}`);
            else if (diff < 0) instrLines.push(`  AFEGEIX ${Math.abs(diff)} slot(s) a "${g}" (ara ${grupsMap[g].length}→${target}). Posa'l a una franja lliure.`);
          }
        }

        if (instrLines.length > 0) {
          instruccionsEfectives = [
            'EQUILIBRAR SESSIONS D\'ESPECIALISTES — CANVIS OBLIGATORIS:',
            '"BUIDA": retorna "" en el slot indicat. "AFEGEIX": assigna el nom del grup a una franja lliure del docent. No toquis cap altre slot.',
            instrLines.join('\n'),
            '',
            instruccionsEfectives,
          ].filter(Boolean).join('\n').trim();
        }
      }

      const regles = { tpTarda: tpTardaEfectiu, instruccionsLliures: instruccionsEfectives };
      const grups_curriculum = cfg.grups_curriculum || null;
      const result = await generarHorarisIntensius(docents, franjes, regles, normes, grups_curriculum);
      const DIES_ALL = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres'];
      const tardesIds = franjes.filter(f => f.hora === 'Tarda' && !f.lliure).map(f => f.id);
      const isOriolFranjesGlobal = franjes.some(f => f.id.startsWith('o'));
      const canvisPerNom = {};
      result.canvis.forEach(c => { canvisPerNom[c.nom] = c.dies; });
      const map = {};
      const pendents = [];
      for (const d of docents) {
        if (!d.horari) continue;

        const base = JSON.parse(JSON.stringify(d.horari));
        const canvis = canvisPerNom[d.nom];
        if (canvis) {
          Object.entries(canvis).forEach(([dia, cells]) => {
            if (!base[dia]) base[dia] = {};
            Object.entries(cells).forEach(([fid, val]) => { base[dia][fid] = val; });
          });
        }

        // Guardar contingut de tarda ORIGINAL (d.horari, abans que Part 1 la buidi)
        // Excloure TP, Lliure, Tallers i Racons (no passen a i4a/i4b)
        const tardesOriginals = {};
        for (const dia of DIES_ALL) {
          tardesOriginals[dia] = tardesIds
            .map(f => (d.horari[dia] || {})[f] || '')
            .filter(v => v && !/^tp$/i.test(v.trim()) && v.toLowerCase() !== 'lliure' && !/^(tallers|racons)/i.test(v.trim()));
        }
        const converted = isOriolFranjesGlobal ? convertOriolTo15Min(base) : convertTo15Min(base);

        if (!isOriolFranjesGlobal) {
          const isTR = v => /^(tallers|racons)/i.test((v || '').trim());
          const isSkip = v => !v || /^(lliure|pati|tp)$/i.test((v || '').trim()) || isTR(v);
          // Tots els slots intensius de matí (pre-pati + post-pati, sense iPA)
          const MATI_SLOTS = ['i1a', 'i1b', 'i1c', 'i1d', 'i2a', 'i2b', 'i3a', 'i3b', 'i3c', 'i3d'];
          // Aplicar si checkbox actiu O si instruccions mencionen tallers/racons
          const aplicarNoTallers = reglesNoTallers || /tallers|racons/i.test(instruccionsLliures || '');

          // Norma 1+3: Eliminar Tallers/Racons del matí i de i4a/i4b, omplir amb activitat anterior
          if (aplicarNoTallers) {
            for (const dia of DIES_ALL) {
              if (!converted[dia]) continue;
              let lastValid = '';
              for (const slot of MATI_SLOTS) {
                const v = converted[dia][slot] || '';
                if (isTR(v)) {
                  converted[dia][slot] = lastValid;
                } else {
                  if (v && !/^(lliure|pati|tp)$/i.test(v.trim())) lastValid = v;
                }
              }
            }
          }

          // Norma 2 (sempre): Omplir i4a/i4b — ampliar última classe fins les 13:00
          for (const dia of DIES_ALL) {
            if (!converted[dia]) continue;
            const vals = tardesOriginals[dia];
            if (vals.length > 0) {
              if (!converted[dia]['i4a']) converted[dia]['i4a'] = vals[0];
              if (!converted[dia]['i4b']) converted[dia]['i4b'] = vals[1] || vals[0];
            } else {
              const prevVal = converted[dia]['i3d'] || '';
              if (prevVal && !/^(lliure|pati)$/i.test(prevVal.trim()) && !isTR(prevVal)) {
                if (!converted[dia]['i4a']) converted[dia]['i4a'] = prevVal;
                if (!converted[dia]['i4b']) converted[dia]['i4b'] = prevVal;
              }
            }
            // Assegurar que Tallers/Racons no arriben a i4a/i4b en cap cas
            if (aplicarNoTallers) {
              if (isTR(converted[dia]['i4a'] || '')) converted[dia]['i4a'] = converted[dia]['i3c'] || converted[dia]['i3b'] || converted[dia]['i3a'] || '';
              if (isTR(converted[dia]['i4b'] || '')) converted[dia]['i4b'] = converted[dia]['i4a'] || '';
            }
          }

          // Norma 4: Compactació 45+45 — 4 slots iguals + 2 slots altra activitat → 3+3
          if (reglesCompactar45) {
            for (const dia of DIES_ALL) {
              if (!converted[dia]) continue;
              const vA = converted[dia]['i3a'];
              const vB = converted[dia]['i4a'];
              if (!isSkip(vA) && !isSkip(vB) && vA !== vB
                  && converted[dia]['i3b'] === vA
                  && converted[dia]['i3c'] === vA
                  && converted[dia]['i3d'] === vA
                  && converted[dia]['i4b'] === vB) {
                converted[dia]['i3d'] = vB;
              }
            }
          }
        }

        map[d.id] = converted;

        // Si tpTarda no és 'pati' ni 'mati', mostra els TP pendents
        if (regleTpTarda === 'eliminar') {
          const tpSlots = [];
          for (const dia of DIES_ALL) {
            for (const fid of tardesIds) {
              const v = ((d.horari[dia] || {})[fid] || '').trim();
              if (/^tp$/i.test(v) || (d.tp_franges || []).includes(`${dia}-${fid}`)) {
                tpSlots.push({ dia, fid });
              }
            }
          }
          if (tpSlots.length) pendents.push({ nom: d.nom, grup: d.grup_principal, slots: tpSlots });
        }
      }
      setEditingMap(map);
      setCanvisAnteriors(result.canvisAnteriors || {});
      setTornsPati(result.tornsPati || null);
      setTpPendents(pendents);
      setResumGeneracio(result.resum || '');
    } catch (e) { showToast('Error IA: ' + e.message); }
    finally { clearInterval(msgInterval); setGenerating(false); setGeneratingMsg(''); }
  }

  async function confirmarIGuardar() {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(editingMap).map(([id, horari]) => api.saveHorariIntensiu(id, horari))
      );
      const n = Object.keys(editingMap).length;
      // Desar torns de pati si s'han generat
      if (tornsPati) {
        try { await api.savePatiTorns({ torns: tornsPati, generat: new Date().toISOString().split('T')[0] }); } catch {}
      }
      showToast(`✓ Horaris intensius guardats (${n} docents)`);
      setEditingMap(null);
      setTpPendents([]);
      setResumGeneracio('');
      setCanvisAnteriors({});
      setTornsPati(null);
      onHorarisSaved();
    } catch (e) { showToast('Error guardant: ' + e.message); }
    finally { setSaving(false); }
  }

  const docentAmbIntensiu = docents.filter(d => d.horari_intensiu).length;

  if (editingMap) {
    const isOriolFranjes = franjes.some(f => f.id.startsWith('o'));
    const editFranjes = isOriolFranjes ? FRANJES_INTENSIVA_ORIOL : FRANJES_INTENSIVA;
    return (
      <EditingIntensivaView
        docents={docents.filter(d => editingMap[d.id] !== undefined)}
        editingMap={editingMap}
        normalFranjes={franjes}
        canvisAnteriors={canvisAnteriors}
        tornsPati={tornsPati}
        tpPendents={tpPendents}
        resumGeneracio={resumGeneracio}
        franjes={editFranjes}
        onCellEdit={(id, dia, fid, val) => setEditingMap(prev => ({
          ...prev,
          [id]: { ...prev[id], [dia]: { ...(prev[id][dia] || {}), [fid]: val } },
        }))}
        onConfirm={confirmarIGuardar}
        onDiscard={() => { setEditingMap(null); setTpPendents([]); setResumGeneracio(''); setCanvisAnteriors({}); setTornsPati(null); }}
        saving={saving}
        escola={escola}
        configIntensiva={configIntensiva}
      />
    );
  }

  return (
    <>
      {/* Config dates */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h3>🌅 Configuració jornada intensiva</h3>
          {docentAmbIntensiu > 0 && (
            <span className="sp sp-green">{docentAmbIntensiu} docents amb horari intensiu</span>
          )}
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }}>Del</label>
            <input type="date" className="f-ctrl" value={dataInici} onChange={e => setDataInici(e.target.value)} style={{ width: 148 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }}>Al</label>
            <input type="date" className="f-ctrl" value={dataFi} onChange={e => setDataFi(e.target.value)} style={{ width: 148 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn btn-sm"
              style={{ background: actiu ? 'var(--green)' : 'var(--bg-3)', color: actiu ? '#fff' : 'var(--ink-3)', borderColor: actiu ? 'var(--green)' : 'var(--border)', fontWeight: 600 }}
              onClick={() => { const nou = !actiu; setActiu(nou); saveConfig({ actiu: nou, data_inici: dataInici, data_fi: dataFi }); }}
            >
              {actiu ? '● Activa' : '○ Inactiva'}
            </button>
            <button
              className="btn btn-sm"
              style={{ fontSize: 12 }}
              disabled={configSaving}
              onClick={() => saveConfig({ actiu, data_inici: dataInici, data_fi: dataFi })}
            >
              {configSaving ? 'Guardant...' : '💾 Guardar dates'}
            </button>
          </div>
        </div>
        {actiu && dataInici && dataFi && (
          <div style={{ padding: '0 16px 12px', fontSize: 12.5, color: 'var(--green)' }}>
            ✓ Jornada intensiva activa del {new Date(dataInici + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'long' })} al {new Date(dataFi + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'long' })}
          </div>
        )}
      </div>

      {/* Regles de generació — checklist */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h3>🤖 Generar horaris intensius amb HorarIA</h3>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Regla 1: eliminar tardes (sempre actiu) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8, opacity: 0.65 }}>
            <span style={{ fontSize: 16 }}>☑</span>
            <div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 600 }}>Eliminar totes les franges de tarda</div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>Les hores de f5a, f5b, f5c queden buides per a tothom</div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-4)', fontStyle: 'italic', flexShrink: 0 }}>sempre actiu</span>
          </div>

          {/* Regla 2: TP de tarda — targetes de decisió */}
          <div style={{ padding: '12px 14px', background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 4 }}>
              🕐 Treball Personal (TP) a la tarda — Què fem?
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 10 }}>
              Alguns docents tenen TP assignat a les tardes. Cal decidir on es col·loca en jornada intensiva.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { val: 'pati',    icon: '🕐', label: 'Mou al pati del mateix dia',        desc: 'El TP passa al torn de pati si hi ha lloc' },
                { val: 'mati',    icon: '☀️', label: 'Mou a la primera hora lliure del matí', desc: 'Es busca el primer slot buit del matí' },
                { val: 'eliminar',icon: '🗑️', label: 'Elimina (sense reubicació)',          desc: 'El TP s\'esborra i apareix a la llista de pendents' },
                { val: 'altra',   icon: '✍️', label: 'Altra opció (instrucció pròpia)',     desc: 'Escriu com vols que HorarIA gestioni el TP de tarda' },
              ].map(({ val, icon, label, desc }) => (
                <label key={val} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', border: `1.5px solid ${regleTpTarda === val ? 'var(--blue)' : 'var(--border)'}`, background: regleTpTarda === val ? 'var(--blue-bg)' : 'var(--bg)', transition: 'all .1s' }}>
                  <input type="radio" name="tpTarda" value={val} checked={regleTpTarda === val} onChange={() => setRegleTpTarda(val)} style={{ marginTop: 2, accentColor: 'var(--blue)', cursor: 'pointer', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: regleTpTarda === val ? 'var(--blue)' : 'var(--ink-2)' }}>{icon} {label}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>{desc}</div>
                    {val === 'altra' && regleTpTarda === 'altra' && (
                      <textarea
                        className="f-ctrl"
                        rows={2}
                        placeholder={'Exemple: "El TP de tarda passa al dimecres a la 3a hora, distribuït equitativament"'}
                        value={regleTpAltraText}
                        onChange={e => { e.stopPropagation(); setRegleTpAltraText(e.target.value); }}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '100%', resize: 'vertical', marginTop: 8, fontSize: 11 }}
                      />
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Norma 1+3: No Tallers ni Racons */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: reglesNoTallers ? '#FFF0F0' : 'var(--bg-2)', borderRadius: 8, cursor: 'pointer', border: `1px solid ${reglesNoTallers ? '#E05050' : 'var(--border)'}`, transition: 'all .1s' }}>
            <input type="checkbox" checked={reglesNoTallers} onChange={e => setReglesNoTallers(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#E05050', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, color: reglesNoTallers ? '#C03030' : 'var(--ink-2)', fontWeight: 600 }}>🚫 No hi ha Tallers ni Racons</div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>Elimina "Tallers" i "Racons" de totes les franges i amplia l'activitat anterior</div>
            </div>
          </label>

          {/* Norma 4: Compactació 45+45 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8, cursor: 'pointer', border: `1px solid ${reglesCompactar45 ? 'var(--blue)' : 'var(--border)'}`, transition: 'all .1s' }}>
            <input type="checkbox" checked={reglesCompactar45} onChange={e => setReglesCompactar45(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--blue)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, color: reglesCompactar45 ? 'var(--blue)' : 'var(--ink-2)', fontWeight: 600 }}>⏱️ Compactació 45+45 post-pati</div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>Si 1h amb un grup + 30min amb un altre, equilibra a 45min + 45min</div>
            </div>
          </label>

          {/* Norma 2: ampliar fins les 13:00 — sempre actiu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8, opacity: 0.65 }}>
            <span style={{ fontSize: 16 }}>☑</span>
            <div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 600 }}>Ampliar última classe fins les 13:00</div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>Les franges 12:30–13:00 (i4a, i4b) s'omplen amb l'activitat de 12:15–12:30</div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-4)', fontStyle: 'italic', flexShrink: 0 }}>sempre actiu</span>
          </div>

          {/* Especialistes: equilibrar entre grups */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8, cursor: 'pointer', border: `1px solid ${reglesEquilibraEsp ? 'var(--blue)' : 'var(--border)'}`, transition: 'all .1s' }}>
            <input type="checkbox" checked={reglesEquilibraEsp} onChange={e => setReglesEquilibraEsp(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--blue)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13, color: reglesEquilibraEsp ? 'var(--blue)' : 'var(--ink-2)', fontWeight: 600 }}>↔️ Tots els grups, les mateixes sessions</div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>Si 3rA té 3 sessions d'EF i 3rB en té 2, la IA redistribueix fins que cap grup tingui més que un altre</div>
            </div>
          </label>

          {/* Instruccions lliures */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', display: 'block', marginBottom: 6 }}>
              💬 Instruccions addicionals per a HorarIA <span style={{ fontWeight: 400, fontStyle: 'italic' }}>(opcional)</span>
            </label>
            <textarea
              className="f-ctrl"
              rows={3}
              placeholder={'Exemple: "No hi ha Tallers ni Racons amb jornada intensiva. Les tutories de tarda passen al dimecres a la 3a hora."'}
              value={instruccionsLliures}
              onChange={e => setInstruccionsLliures(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={generar}
              disabled={generating || docents.filter(d => d.horari).length === 0}
              style={{ minWidth: 220, transition: 'all .2s' }}
            >
              {generating
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', animation: 'spin .8s linear infinite' }} />
                    {generatingMsg || '✨ Generant horaris...'}
                  </span>
                : '✨ Generar amb HorarIA'}
            </button>
            <button
              className="btn btn-sm"
              style={{ fontSize: 12, background: 'var(--purple-bg)', color: 'var(--purple)', borderColor: 'var(--purple)' }}
              disabled={plantillaSaving}
              onClick={guardarPlantilla}
            >
              {plantillaSaving ? 'Guardant...' : '💾 Guardar com a plantilla'}
            </button>
          </div>
          {docents.filter(d => d.horari).length === 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Primer puja els horaris normals des de la vista Personal.</div>
          )}
        </div>
      </div>

      {/* Importar horari de l'any passat */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h3>📂 Importar horari de l'any passat</h3></div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
            Puja el PDF o una imatge de l'horari intensiu de l'any passat. La IA detectarà automàticament les regles que s'aplicaven.
          </div>
          <input ref={importFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={handleImportFile} />
          <div
            style={{ border: `2px dashed ${dragImport ? 'var(--blue)' : importBase64 ? 'var(--green)' : 'var(--border-2)'}`, borderRadius: 8, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', background: dragImport ? 'var(--blue-bg)' : importBase64 ? 'var(--green-bg)' : 'var(--bg)', transition: 'all .15s' }}
            onClick={() => importFileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragImport(true); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragImport(false); }}
            onDrop={e => {
              e.preventDefault(); setDragImport(false);
              const file = e.dataTransfer.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => { setImportBase64(ev.target.result.split(',')[1]); setImportMime(file.type || 'application/pdf'); };
              reader.readAsDataURL(file);
            }}
          >
            {dragImport
              ? <><div style={{ fontSize: 22, marginBottom: 4 }}>📂</div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>Deixa anar el fitxer</div></>
              : <><div style={{ fontSize: 22, marginBottom: 4 }}>{importBase64 ? '✅' : '📄'}</div><div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{importBase64 ? 'Fitxer carregat — prem "Detectar regles"' : 'Clica o arrossega el PDF o imatge'}</div></>
            }
          </div>
          {importBase64 && (
            <button
              className="btn btn-sm"
              style={{ background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'var(--blue)', fontWeight: 600 }}
              disabled={detectant}
              onClick={detectarRegles}
            >
              {detectant ? '⏳ Analitzant...' : '🤖 Detectar regles automàticament'}
            </button>
          )}
        </div>
      </div>

      {/* Llista docents amb/sense intensiu */}
      {docentAmbIntensiu > 0 && (
        <div className="card">
          <div className="card-head"><h3>📋 Docents amb horari intensiu</h3></div>
          <div style={{ padding: '8px 16px' }}>
            {docents.filter(d => d.horari_intensiu).map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(d.nom), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {initials(d.nom)}
                </div>
                <span style={{ flex: 1, fontSize: 13 }}>{d.nom}</span>
                <span className="sp sp-green" style={{ fontSize: 10 }}>✓ Intensiu</span>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, color: 'var(--red)' }}
                  onClick={async () => {
                    try { await api.saveHorariIntensiu(d.id, null); onHorarisSaved(); showToast(`✓ Horari intensiu eliminat per ${d.nom}`); }
                    catch (e) { showToast('Error: ' + e.message); }
                  }}
                >✕ Eliminar intensiu</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function EditingIntensivaView({ docents, editingMap, normalFranjes, canvisAnteriors, tornsPati, tpPendents, resumGeneracio, franjes, onCellEdit, onConfirm, onDiscard, saving, escola, configIntensiva }) {
  const DIE_LBL = { dilluns: 'Dl', dimarts: 'Dt', dimecres: 'Dc', dijous: 'Dj', divendres: 'Dv' };
  const DIES_ALL = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres'];
  const tpNoms = new Set((tpPendents || []).map(t => t.nom));
  // compareMode=false → vista Intensiva (editable, diff groc); compareMode=true → vista Normal (lectura, sense tarda)
  const [compareMode, setCompareMode] = useState(false);
  // mainView: 'professionals' → docent per docent | 'grups' → grup per grup (vista alumnat)
  const [mainView, setMainView] = useState('professionals');

  // Construeix l'horari intensiu d'un grup
  function buildGroupHorariIntensiu(grupNom) {
    // 1. Font de veritat: grups_curriculum (horari de l'alumnat, format 30-min)
    const gc = configIntensiva?.grups_curriculum || {};
    const key = Object.keys(gc).find(k => normGrup(k) === normGrup(grupNom));
    if (key) {
      const raw = gc[key];
      const horariNormal = typeof raw === 'string'
        ? (() => { try { return JSON.parse(raw); } catch { return null; } })()
        : raw;
      if (horariNormal && typeof horariNormal === 'object') {
        const converted = convertTo15Min(horariNormal);
        // Norma 2 (sempre): omplir i4a/i4b des de i3d
        for (const dia of DIES_ALL) {
          if (!converted[dia]) continue;
          const prevVal = converted[dia]['i3d'] || '';
          if (prevVal && !/^(lliure|pati)$/i.test(prevVal.trim()) && !/^(tallers|racons)/i.test(prevVal.trim())) {
            if (!converted[dia]['i4a']) converted[dia]['i4a'] = prevVal;
            if (!converted[dia]['i4b']) converted[dia]['i4b'] = prevVal;
          }
        }
        return converted;
      }
    }

    // 2. Fallback: invertir editingMap dels docents, filtrant valors docent-específics
    const tutor = docents.find(d => normGrup(d.grup_principal || '') === normGrup(grupNom));
    const isTeacherOnly = v => !v || /^(tp|lliure|coordinaci|càrrec|ceepsir|piscina)/i.test(v.trim()) || /^pati/i.test(v.trim());
    const result = {};
    for (const dia of DIES_ALL) {
      result[dia] = {};
      for (const f of franjes) {
        const tutorVal = tutor ? ((editingMap[tutor.id] || {})[dia]?.[f.id] || '') : '';
        const tutorStudent = isTeacherOnly(tutorVal) ? '' : tutorVal;
        if (tutorStudent) { result[dia][f.id] = tutorStudent; continue; }
        let found = '';
        for (const d of docents) {
          if (tutor && d.id === tutor.id) continue;
          const v = ((editingMap[d.id] || {})[dia]?.[f.id] || '').trim();
          if (v && normGrup(v) === normGrup(grupNom)) { found = d.nom.split(' ')[0]; break; }
        }
        result[dia][f.id] = found || '';
      }
    }
    return result;
  }

  // Construeix l'horari normal d'un grup des de grups_curriculum (format 30-min)
  function buildGroupHorariNormal(grupNom) {
    const gc = configIntensiva?.grups_curriculum || {};
    // Cercar per nom normalitzat
    const key = Object.keys(gc).find(k => normGrup(k) === normGrup(grupNom));
    if (!key) return null;
    const raw = gc[key];
    // Pot ser string o objecte (JSONB)
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw || null;
  }

  // Llista de grups (union de grup_principal dels docents + claus grups_curriculum)
  const grupsLlista = useMemo(() => {
    const fromDocents = docents.map(d => d.grup_principal).filter(Boolean);
    const fromCurriculum = Object.keys(configIntensiva?.grups_curriculum || {});
    const all = [...new Set([...fromDocents, ...fromCurriculum])];
    return all.sort((a, b) => a.localeCompare(b, 'ca'));
  }, [docents, configIntensiva]);

  // Comprova si una cel·la ha estat modificada per mostrar diff visual
  function isModified(nomDocent, dia, fid) {
    return !!(canvisAnteriors?.[nomDocent]?.[dia]?.[fid] !== undefined);
  }

  async function imprimirHorariIntensiu() {
    const nomEscola = escola?.nom || configIntensiva?.nom_escola || 'Centre educatiu';
    const dates = configIntensiva
      ? (() => {
          const fmt = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
          return `${fmt(configIntensiva.data_inici)} – ${fmt(configIntensiva.data_fi)}`;
        })()
      : '';

    // Detectar logo per escola
    const nomLower = nomEscola.toLowerCase();
    const logoFile = nomLower.includes('rivo') ? 'logo_rivo.png'
      : (nomLower.includes('oriol') || nomLower.includes("ca n'")) ? 'logo_canoriol.png'
      : null;

    // Carregar logo com a base64 per incrustar al HTML (funciona off-line i en finestra nova)
    let logoB64 = null;
    if (logoFile) {
      try {
        const resp = await fetch(`${window.location.origin}/${logoFile}`);
        const blob = await resp.blob();
        logoB64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
      } catch { /* sense logo */ }
    }

    // Color d'acent per l'escola (portada)
    const isRivo  = nomLower.includes('rivo');
    const isOriol = nomLower.includes('oriol') || nomLower.includes("ca n'");
    const accentColor = isRivo ? '#E05A22' : isOriol ? '#1E6BA0' : '#4A5568';
    const accentLight = isRivo ? '#FFF3EE' : isOriol ? '#EEF4FA' : '#F7F8FA';

    // Funció per pintar cel·la
    function cellStyle(val) {
      const v = (val || '').trim().toLowerCase();
      if (!v || v === '—') return 'background:#fafafa;color:#ccc;';
      if (/^lliure$/.test(v)) return 'background:#E6F4EA;color:#3A7D52;font-weight:600;';
      if (/^tp$/.test(v))     return 'background:#FEF3E2;color:#B06020;font-weight:600;';
      if (/^pati$/.test(v))   return 'background:#F0E6F9;color:#7B52A0;font-weight:600;';
      if (/coordinaci|càrrec|equip direct/i.test(v)) return 'background:#EAE4F5;color:#5C4A8A;';
      return 'background:#E8F1FB;color:#3A5F8A;';
    }

    // Funció per pintar capçalera de hora (pastel amb text fosc)
    function horaHeaderStyle(hora) {
      if (hora === 'Pati')  return `background:#EFE0F8;color:#6B3FA0;font-weight:700;`;
      if (hora === 'Dinar') return `background:#E8EDF0;color:#4A5E6A;font-weight:700;`;
      if (hora === 'Tarda') return `background:#FDE8E4;color:#A04030;font-weight:700;`;
      // Matí: color d'accent molt clar
      const matiLight = isRivo ? '#FDEEE6' : '#E6EFF8';
      const matiText  = isRivo ? '#A04010' : '#2A5080';
      return `background:${matiLight};color:${matiText};font-weight:700;`;
    }

    // Agrupar franges per hora
    const horaGroups = {};
    franjes.forEach(f => { if (!horaGroups[f.hora]) horaGroups[f.hora] = []; horaGroups[f.hora].push(f); });

    // Generar taula d'un horari (docent o grup)
    function buildTable(h, accentLeft = null) {
      const thBase = `padding:4px 6px;font-size:9.5px;border:1px solid #ddd;text-align:center;font-weight:700;`;
      let files = '';
      Object.entries(horaGroups).forEach(([hora, fs]) => {
        // Fila de capçalera de hora
        files += `<tr><td colspan="${DIES_ALL.length + 1}" style="${horaHeaderStyle(hora)}padding:3px 8px;font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">${hora}</td></tr>`;
        fs.forEach(f => {
          const cels = DIES_ALL.map(dia => {
            const val = (h[dia]?.[f.id] || '').trim();
            return `<td style="${thBase}${cellStyle(val)}">${val || '—'}</td>`;
          }).join('');
          files += `<tr>
            <td style="${thBase}background:#FAFAFA;color:#666;font-size:8.5px;white-space:nowrap;">${f.sub || f.id}</td>
            ${cels}
          </tr>`;
        });
      });
      const borderLeft = accentLeft ? `border-left:4px solid ${accentLeft};` : '';
      return `<table style="border-collapse:collapse;width:100%;margin-bottom:16px;${borderLeft}page-break-inside:avoid;">
        <thead>
          <tr>
            <th style="${thBase}background:#F4F5F6;color:#7A8A90;min-width:52px;"></th>
            ${DIES_ALL.map(dia => { const dBg = isRivo ? '#FCEADF' : '#DDE9F6'; const dCol = isRivo ? '#A04010' : '#2A5080'; return `<th style="${thBase}background:${dBg};color:${dCol};">${DIE_LBL[dia]}</th>`; }).join('')}
          </tr>
        </thead>
        <tbody>${files}</tbody>
      </table>`;
    }

    // Colors per docent (barra lateral)
    const AVATAR_COLORS = ['#E53935','#D81B60','#8E24AA','#3949AB','#1E88E5','#00897B','#43A047','#FB8C00','#6D4C41','#546E7A'];
    function strColor(nom) {
      let h = 0; for (let i = 0; i < nom.length; i++) h = nom.charCodeAt(i) + ((h << 5) - h);
      return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
    }

    // ── Secció professionals ──
    const seccions = docents.map(d => {
      const h = editingMap[d.id];
      if (!h) return '';
      const color = strColor(d.nom);
      const inicials = d.nom.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
      return `
        <div style="margin-bottom:6px;display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0;">${inicials}</div>
          <div>
            <div style="font-size:13px;font-weight:700;color:#1a1a1a;">${d.nom}</div>
            <div style="font-size:10px;color:#666;">${rolLabel(d.rol)}${d.grup_principal ? ' · ' + d.grup_principal : ''}</div>
          </div>
        </div>
        ${buildTable(h, color)}`;
    }).join('<div style="margin:4px 0;border-top:1px dashed #e0e0e0;"></div>');

    // ── Secció grups / alumnat ──
    const seccionsGrups = grupsLlista.map(grup => {
      const hGrup = buildGroupHorariIntensiu(grup);
      if (!hGrup) return '';
      const tutor = docents.find(d => normGrup(d.grup_principal || '') === normGrup(grup));
      const grupColor = strColor(grup);
      const grupInicials = grup.substring(0, 2).toUpperCase();
      return `
        <div style="margin-bottom:6px;display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:7px;background:${grupColor};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0;">${grupInicials}</div>
          <div>
            <div style="font-size:13px;font-weight:700;color:#1a1a1a;">${grup}</div>
            <div style="font-size:10px;color:#666;">${tutor ? 'Tutor/a: ' + tutor.nom : 'Sense tutor assignat'}</div>
          </div>
        </div>
        ${buildTable(hGrup, grupColor)}`;
    }).filter(Boolean).join('<div style="margin:4px 0;border-top:1px dashed #e0e0e0;"></div>');

    const logoHtml = `<div style="text-align:right;">
      ${logoB64
        ? `<img src="${logoB64}" alt="${nomEscola}" style="height:64px;width:auto;max-width:180px;object-fit:contain;display:block;margin-left:auto;" />`
        : `<div style="font-size:13px;font-weight:800;color:${accentColor};max-width:160px;text-align:right;line-height:1.3;">${nomEscola}</div>`}
      <div style="font-size:7.5px;color:#aaa;margin-top:4px;letter-spacing:.03em;">Generat per <strong>HorariaPro</strong></div>
    </div>`;

    const css = `<style>
      *{box-sizing:border-box;}
      body{font-family:'Arial',sans-serif;color:#1a1a1a;margin:0;padding:0;font-size:11px;background:#fff;}
      @media print{body{margin:0;padding:0;}.no-print{display:none!important;}}
    </style>`;

    const html = `<!DOCTYPE html><html lang="ca"><head><meta charset="utf-8"><title>Horari Intensiu — ${nomEscola}</title>${css}</head>
    <body>
      <!-- PORTADA / CAPÇALERA -->
      <div style="background:${accentLight};border-bottom:4px solid ${accentColor};padding:18px 24px;display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
        <div>
          <div style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;">Departament d'Educació · Generalitat de Catalunya</div>
          <div style="font-size:22px;font-weight:900;color:${accentColor};line-height:1.1;margin-bottom:4px;">Horari Jornada Intensiva</div>
          <div style="font-size:15px;font-weight:700;color:#333;margin-bottom:3px;">${nomEscola}</div>
          ${dates ? `<div style="font-size:11px;color:#888;">Període: ${dates}</div>` : ''}
        </div>
        <div style="text-align:right;">
          ${logoHtml}
        </div>
      </div>

      <!-- LLEGENDA -->
      <div style="display:flex;gap:14px;flex-wrap:wrap;padding:0 24px 14px;font-size:9px;">
        ${[['#E6F4EA','#3A7D52','Lliure'],['#FEF3E2','#B06020','TP'],['#F0E6F9','#7B52A0','Pati'],['#EAE4F5','#5C4A8A','Coord/Càrrec'],['#E8F1FB','#3A5F8A','Classe']].map(([bg,c,lbl])=>
          `<span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:${bg};border:1px solid ${c};display:inline-block;"></span><span style="color:#666;">${lbl}</span></span>`
        ).join('')}
      </div>

      <!-- HORARIS PROFESSIONALS -->
      <div style="padding:0 24px 8px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid ${accentColor};">
          <div style="width:28px;height:28px;border-radius:50%;background:${accentColor};display:flex;align-items:center;justify-content:center;font-size:14px;">👩‍🏫</div>
          <div>
            <div style="font-size:14px;font-weight:800;color:${accentColor};">Horaris dels Professionals</div>
            <div style="font-size:10px;color:#888;">${docents.filter(d => editingMap[d.id]).length} docents</div>
          </div>
        </div>
        ${seccions}
      </div>

      <!-- SALT DE PÀGINA -->
      <div style="page-break-before:always;"></div>

      <!-- HORARIS GRUPS / ALUMNAT -->
      ${seccionsGrups ? `
      <div style="padding:24px 24px 8px;">
        <!-- Capçalera repetida per la nova pàgina -->
        <div style="background:${accentLight};border-bottom:4px solid ${accentColor};padding:12px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;border-radius:6px;">
          <div>
            <div style="font-size:14px;font-weight:900;color:${accentColor};">Horari Jornada Intensiva — Alumnat</div>
            <div style="font-size:12px;font-weight:600;color:#333;">${nomEscola}</div>
            ${dates ? `<div style="font-size:10px;color:#888;">Període: ${dates}</div>` : ''}
          </div>
          <div>${logoHtml}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #43A047;">
          <div style="width:28px;height:28px;border-radius:50%;background:#43A047;display:flex;align-items:center;justify-content:center;font-size:14px;">🧒</div>
          <div>
            <div style="font-size:14px;font-weight:800;color:#43A047;">Horaris dels Grups (Alumnat)</div>
            <div style="font-size:10px;color:#888;">${grupsLlista.length} grups · Jornada intensiva</div>
          </div>
        </div>
        ${seccionsGrups}
      </div>` : ''}


      <!-- FOOTER -->
      <div style="border-top:1px solid #eee;padding:10px 24px;display:flex;justify-content:space-between;font-size:8.5px;color:#aaa;margin-top:10px;">
        <span>Generat per <strong>HorariaPRO</strong> · horariapro.cat</span>
        <span>${nomEscola}</span>
      </div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=960,height=750');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 800); }
  }

  return (
    <>
      {/* Capçalera enganxosa — disseny responsive */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 14px 8px', marginBottom: 12 }}>

        {/* Fila 1: toggle PROFESSIONALS / GRUPS (ample complet) */}
        <div style={{ display: 'flex', gap: 0, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', marginBottom: 8 }}>
          <button
            style={{ flex: 1, padding: '9px 10px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: mainView === 'professionals' ? 'var(--blue)' : 'transparent', color: mainView === 'professionals' ? '#fff' : 'var(--ink-3)', transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            onClick={() => setMainView('professionals')}
          >
            <span>👩‍🏫</span>
            <span>Professionals</span>
            {mainView === 'professionals' && <span style={{ background: 'rgba(255,255,255,.25)', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{docents.length}</span>}
          </button>
          <button
            style={{ flex: 1, padding: '9px 10px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: mainView === 'grups' ? 'var(--green)' : 'transparent', color: mainView === 'grups' ? '#fff' : 'var(--ink-3)', transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            onClick={() => setMainView('grups')}
          >
            <span>🧒</span>
            <span>Grups</span>
            {mainView === 'grups' && <span style={{ background: 'rgba(255,255,255,.25)', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{grupsLlista.length}</span>}
          </button>
        </div>

        {/* Fila 2: accions principals (Descartar + Guardar) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            onClick={onDiscard}
            style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'var(--bg-2)', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
          >
            <span style={{ fontSize: 15 }}>✕</span> Descartar
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            style={{ flex: 2, padding: '9px 12px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: saving ? 'var(--border)' : 'var(--green)', color: saving ? 'var(--ink-3)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'background .15s' }}
          >
            {saving ? <><span>⏳</span> Guardant...</> : <><span>💾</span> Confirmar i guardar</>}
          </button>
        </div>

        {/* Fila 3: vista Intensiva/Normal + imprimir */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 0, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', flex: 1 }}>
            <button
              style={{ flex: 1, padding: '5px 8px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: !compareMode ? 'var(--amber)' : 'transparent', color: !compareMode ? '#fff' : 'var(--ink-3)', transition: 'all .1s' }}
              onClick={() => setCompareMode(false)}
            >🌅 Intensiva</button>
            <button
              style={{ flex: 1, padding: '5px 8px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: compareMode ? 'var(--ink)' : 'transparent', color: compareMode ? '#fff' : 'var(--ink-3)', transition: 'all .1s' }}
              onClick={() => setCompareMode(true)}
            >📅 Normal</button>
          </div>
          <button
            className="btn btn-sm btn-ghost"
            style={{ fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={imprimirHorariIntensiu}
          >🖨️ Imprimir</button>
        </div>
      </div>

      {resumGeneracio && (
        <div style={{ padding: '8px 12px', background: 'var(--blue-bg)', border: '1px solid var(--blue)', borderRadius: 8, marginBottom: 10, fontSize: 12.5, color: 'var(--blue)' }}>
          💬 {resumGeneracio}
        </div>
      )}

      {tpPendents && tpPendents.length > 0 && (
        <div style={{ padding: '10px 14px', background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', marginBottom: 6 }}>
            ⚠️ TP de tarda eliminat ({tpPendents.length} docents)
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tpPendents.map(t => (
              <span key={t.nom} style={{ fontSize: 11.5, background: 'var(--amber)', color: '#fff', borderRadius: 5, padding: '2px 9px', fontWeight: 600 }}>
                {t.nom} · {t.slots.map(s => `${DIE_LBL[s.dia]} ${s.fid}`).join(', ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {!compareMode && Object.keys(canvisAnteriors || {}).length > 0 && mainView === 'professionals' && (
        <div style={{ padding: '8px 12px', background: '#FFF9C4', border: '1px solid #F0D020', borderRadius: 8, marginBottom: 10, fontSize: 12, color: '#6B5900' }}>
          👁 Les cel·les en <strong>groc</strong> han canviat respecte l'horari normal. Usa "📅 Normal" per veure l'original.
        </div>
      )}
      {compareMode && mainView === 'professionals' && (
        <div style={{ padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, fontSize: 12, color: 'var(--ink-3)' }}>
          📅 Mostrant l'horari <strong>normal</strong> (amb tarda). Torna a "🌅 Intensiva" per editar.
        </div>
      )}
      {compareMode && mainView === 'grups' && (
        <div style={{ padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, fontSize: 12, color: 'var(--ink-3)' }}>
          📅 Mostrant l'horari <strong>normal</strong> de l'alumnat. Torna a "🌅 Intensiva" per veure la versió intensiva.
        </div>
      )}

      {/* ── VISTA GRUPS ── */}
      {mainView === 'grups' && (
        <>
          {grupsLlista.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              No s'han trobat grups. Assigna un grup principal als docents o carrega els horaris d'alumnat.
            </div>
          )}
          {grupsLlista.map(grup => {
            const tutor = docents.find(d => normGrup(d.grup_principal || '') === normGrup(grup));
            let horariGrup;
            if (compareMode) {
              horariGrup = buildGroupHorariNormal(grup);
              if (!horariGrup && tutor) horariGrup = tutor.horari || {};
            } else {
              horariGrup = buildGroupHorariIntensiu(grup);
            }
            const grupFranjes = compareMode ? (normalFranjes || franjes) : franjes;
            return (
              <div key={grup} className="card" style={{ marginBottom: 10 }}>
                <div className="card-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: avatarColor(grup), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                      {grup.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{grup}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                        {tutor ? `Tutor/a: ${tutor.nom}` : 'Sense tutor assignat'}
                        {!compareMode && ' · Horari intensiu'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 0, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                    <button style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, background: !compareMode ? 'var(--amber)' : 'transparent', color: !compareMode ? '#fff' : 'var(--ink-3)' }} onClick={() => setCompareMode(false)}>🌅 Int</button>
                    <button style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, background: compareMode ? 'var(--ink)' : 'transparent', color: compareMode ? '#fff' : 'var(--ink-3)' }} onClick={() => setCompareMode(true)}>📅 Norm</button>
                  </div>
                </div>
                {horariGrup ? (
                  <HorariInlineIntensiu
                    horari={horariGrup}
                    horariAnterior={{}}
                    tpFranges={[]}
                    franjes={grupFranjes}
                    onCellSave={null}
                    showDiff={false}
                    nomDocent={grup}
                  />
                ) : (
                  <div style={{ padding: '12px 16px', color: 'var(--ink-4)', fontSize: 12 }}>
                    Sense dades d'horari per a aquest grup.
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* ── VISTA PROFESSIONALS ── */}
      {mainView === 'professionals' && docents.map(d => (
        <div key={d.id} className="card" style={{ marginBottom: 10, border: tpNoms.has(d.nom) ? '1.5px solid var(--amber)' : undefined }}>
          <div className="card-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor(d.nom), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {initials(d.nom)}
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{d.nom}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{rolLabel(d.rol)}{d.grup_principal ? ` · ${d.grup_principal}` : ''}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {tpNoms.has(d.nom) && <span className="sp sp-amber" style={{ fontSize: 10 }}>⚠️ TP eliminat</span>}
              {/* Toggle per targeta — canvia el mode global */}
              <div style={{ display: 'flex', gap: 0, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                <button
                  style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, background: !compareMode ? 'var(--amber)' : 'transparent', color: !compareMode ? '#fff' : 'var(--ink-3)', transition: 'all .1s' }}
                  onClick={() => setCompareMode(false)}
                >🌅 Int</button>
                <button
                  style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, background: compareMode ? 'var(--ink)' : 'transparent', color: compareMode ? '#fff' : 'var(--ink-3)', transition: 'all .1s' }}
                  onClick={() => setCompareMode(true)}
                >📅 Norm</button>
              </div>
            </div>
          </div>
          <HorariInlineIntensiu
            horari={compareMode ? (d.horari || {}) : editingMap[d.id]}
            horariAnterior={canvisAnteriors[d.nom] || {}}
            tpFranges={d.tp_franges}
            franjes={compareMode ? (normalFranjes || franjes) : franjes}
            onCellSave={compareMode ? null : (dia, fid, val) => onCellEdit(d.id, dia, fid, val)}
            showDiff={!compareMode}
            nomDocent={d.nom}
          />
        </div>
      ))}

      {/* Torns de pati generats */}
      {tornsPati && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>🕐 Torns de Pati (generats per IA)</h3></div>
          <div style={{ overflowX: 'auto', padding: '10px 16px' }}>
            <table style={{ borderCollapse: 'collapse', minWidth: 400 }}>
              <thead>
                <tr>
                  <th style={{ padding: '5px 10px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, fontWeight: 700, color: 'var(--ink-3)' }}>Torn / Dia</th>
                  {DIES_ALL.map(dia => (
                    <th key={dia} style={{ padding: '5px 10px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textAlign: 'center' }}>{DIE_LBL[dia]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(tornsPati[DIES_ALL[0]] || {}).map(pid => (
                  <tr key={pid}>
                    <td style={{ padding: '5px 10px', border: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', background: 'var(--bg-2)' }}>{pid}</td>
                    {DIES_ALL.map(dia => {
                      const noms = tornsPati[dia]?.[pid] || [];
                      return (
                        <td key={dia} style={{ padding: '4px 8px', border: '1px solid var(--border)', fontSize: 10, textAlign: 'center', background: noms.length ? 'var(--green-bg)' : 'var(--bg)' }}>
                          {noms.length
                            ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>{noms.map(n => n.split(' ')[0]).join(', ')}</span>
                            : <span style={{ color: 'var(--ink-4)' }}>—</span>
                          }
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '8px 0 24px' }}>
        <button className="btn btn-ghost" onClick={onDiscard}>✕ Descartar canvis</button>
        <button
          className="btn"
          style={{ background: 'var(--green)', color: '#fff', border: 'none', fontWeight: 600 }}
          onClick={onConfirm}
          disabled={saving}
        >
          {saving ? 'Guardant...' : '💾 Confirmar i guardar tots els horaris intensius'}
        </button>
      </div>
    </>
  );
}

// Versió de HorariInline amb diff visual per a la vista d'intensiva
function HorariInlineIntensiu({ horari, horariAnterior, tpFranges = [], franjes, onCellSave, showDiff, nomDocent }) {
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState('');
  const tpSet = new Set(Array.isArray(tpFranges) ? tpFranges : []);
  const horaGroups = {};
  franjes.forEach(f => { if (!horaGroups[f.hora]) horaGroups[f.hora] = []; horaGroups[f.hora].push(f); });
  const thS = { padding: '4px 4px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 9, fontWeight: 600, color: 'var(--ink-3)', textAlign: 'center', whiteSpace: 'nowrap' };
  const tdS = { padding: '4px 5px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 9, color: 'var(--ink-3)', whiteSpace: 'nowrap' };

  function startEdit(dia, fid, currentVal) { setEditing({ dia, fid }); setEditVal(currentVal); }
  function commitEdit(dia, fid, original) {
    if (onCellSave && editVal !== original) onCellSave(dia, fid, editVal);
    setEditing(null);
  }

  return (
    <div style={{ padding: '0 12px 12px', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['var(--green-bg)','var(--green-mid)','Lliure'],['var(--amber-bg)','#F0D5A8','TP'],['var(--purple-bg)','var(--purple-mid)','Coord/Càrrec'],['var(--blue-bg)','#C0D0EE','Classe'],['var(--bg-3)','var(--border-2)','Pati']].map(([bg,bc,lbl]) => (
          <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9.5, color: 'var(--ink-3)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: bg, border: `1px solid ${bc}`, display: 'inline-block' }} />{lbl}
          </span>
        ))}
        {showDiff && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9.5, color: '#6B5900' }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: '#FFF9C4', border: '1px solid #F0D020', display: 'inline-block' }} />Modificat
          </span>
        )}
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
              const rowH = f.lliure ? 18 : f.patio ? 22 : (f.min || 15) * 2;
              const pad  = (f.lliure || f.patio || (f.min || 15) <= 15) ? '1px 3px' : '4px 3px';
              return (
                <tr key={f.id} style={{ height: rowH }}>
                  {isFirst && (
                    <td rowSpan={grp.length} style={{ ...tdS, fontWeight: 700, verticalAlign: 'middle', color: 'var(--ink-2)' }}>{f.label}</td>
                  )}
                  <td style={{ ...tdS, fontSize: 8 }}>{f.sub}</td>
                  {DIES.map(dia => {
                    const raw = horari?.[dia]?.[f.id] || '';
                    const val = raw || (tpSet.has(`${dia}-${f.id}`) ? 'TP' : '');
                    const hasChanged = showDiff && horariAnterior?.[dia]?.[f.id] !== undefined;
                    const isEdit = editing?.dia === dia && editing?.fid === f.id;
                    const cellStyle = hasChanged
                      ? { padding: 0, border: '2px solid #F0D020', background: '#FFF9C4', textAlign: 'center', minWidth: 60 }
                      : { padding: 0, border: '1px solid var(--border)', background: isEdit ? 'var(--surface)' : cellBg(val), textAlign: 'center', minWidth: 60 };
                    return (
                      <td key={dia} style={cellStyle}>
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
                            style={{ fontSize: 9, color: hasChanged ? '#6B5900' : cellColor(val), fontWeight: val ? 500 : 400, display: 'block', padding: pad, cursor: onCellSave ? 'text' : 'default' }}
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

// Mostra (i opcionalment edita) l'horari de l'alumnat com a taula dia × franja
// onCellSave(dia, fid, nouVal) → activa mode edició cel·la a cel·la
function HorariAlumnatTable({ data, franjes, onCellSave }) {
  const DIES = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres'];
  const DIE_LBL = { dilluns: 'Dl', dimarts: 'Dt', dimecres: 'Dc', dijous: 'Dj', divendres: 'Dv' };
  const files = franjes.filter(f => !f.lliure);
  const [editing, setEditing] = useState(null); // { dia, fid }
  const [editVal, setEditVal] = useState('');

  const th = { padding: '5px 8px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textAlign: 'center' };
  const tdLbl = { padding: '5px 10px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, fontWeight: 600, color: 'var(--ink-2)', whiteSpace: 'nowrap', verticalAlign: 'top' };

  function startEdit(dia, fid, val) { setEditing({ dia, fid }); setEditVal(val); }
  function commitEdit(dia, fid) { if (onCellSave) onCellSave(dia, fid, editVal); setEditing(null); }

  return (
    <div style={{ overflowX: 'auto' }}>
      {onCellSave && <div style={{ fontSize: 10, color: 'var(--ink-4)', marginBottom: 6, padding: '0 2px' }}>· Fes clic a qualsevol cel·la per editar-la</div>}
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', minWidth: 90 }}>Franja</th>
            {DIES.map(d => <th key={d} style={{ ...th, minWidth: 100 }}>{DIE_LBL[d]}</th>)}
          </tr>
        </thead>
        <tbody>
          {files.map(f => (
            <tr key={f.id}>
              <td style={tdLbl}>
                <div>{f.label}</div>
                <div style={{ fontSize: 9, color: 'var(--ink-4)', fontWeight: 400 }}>{f.sub}</div>
              </td>
              {DIES.map(d => {
                const val = data?.[d]?.[f.id] || '';
                const isEditing = editing?.dia === d && editing?.fid === f.id;
                const bg = isEditing ? 'var(--surface)' : val ? (val.toLowerCase().includes('pati') ? 'var(--green-bg)' : 'var(--bg)') : 'var(--bg-2)';
                return (
                  <td key={d} style={{ padding: 0, border: '1px solid var(--border)', background: bg, minWidth: 100, textAlign: 'center', verticalAlign: 'middle' }}>
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => commitEdit(d, f.id)}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(d, f.id); if (e.key === 'Escape') setEditing(null); }}
                        style={{ width: '100%', border: 'none', outline: '2px solid var(--blue)', borderRadius: 2, background: 'var(--surface)', fontFamily: 'inherit', fontSize: 11, textAlign: 'center', padding: '4px 2px', color: 'var(--ink)' }}
                      />
                    ) : (
                      <span
                        onClick={() => onCellSave && startEdit(d, f.id, val)}
                        style={{ fontSize: 11, display: 'block', padding: '5px 8px', color: val ? 'var(--ink)' : 'var(--ink-4)', cursor: onCellSave ? 'text' : 'default' }}
                      >
                        {val || '—'}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Intenta parsejar el contingut com a JSON d'horari (retorna objecte o null)
function parseHorariAlumnat(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'object' ? raw : JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const dies = ['dilluns','dimarts','dimecres','dijous','divendres'];
      if (dies.some(d => d in parsed)) return parsed;
    }
  } catch {}
  return null;
}

function PatiView({ docents, franjes, configIntensiva, api, showToast, isOriol, baixes, escola }) {
  const DIES_ALL = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres'];
  const DIE_LBL  = { dilluns: 'Dl', dimarts: 'Dt', dimecres: 'Dc', dijous: 'Dj', divendres: 'Dv' };
  const patioFranjes = franjes.filter(f => f.patio);

  // Baixes actives: mapa absent (lowercase) → substitut
  const baixesActives = (baixes || []).filter(b => b.estat === 'activa');
  const absentSet = new Set(baixesActives.map(b => b.absent.toLowerCase().trim()));
  const substitutMap = Object.fromEntries(baixesActives.map(b => [b.absent.toLowerCase().trim(), b.substitut]));
  // Docents disponibles al selector (excloem els de baixa)
  const docentsDisponibles = docents.filter(d => !absentSet.has(d.nom.toLowerCase().trim()));

  // Rivo Rubeo: Torn B es duplica en Infantil i Primària (patis separats)
  const TORN_B_RIVO = [
    { id: 'patiB_inf', label: 'Torn B · Infantil', sub: "11:00–11:30 · Pati d'Infantil (I3/I4/I5)" },
    { id: 'patiB_pri', label: 'Torn B · Primària', sub: '11:00–11:30 · Pati de Primària (4t/5è/6è)' },
  ];
  // filesTorns: files a mostrar a la taula (Rivo: patiB → patiB_inf + patiB_pri)
  const filesTorns = !isOriol
    ? patioFranjes.flatMap(f => f.id === 'patiB' ? TORN_B_RIVO : [f])
    : patioFranjes;

  const [torns, setTorns] = useState(null); // { dia: { patioId: [nom, ...] } }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Inicialitza torns buits
  const initTorns = () => {
    const t = {};
    DIES_ALL.forEach(dia => {
      t[dia] = {};
      filesTorns.forEach(f => { t[dia][f.id] = []; });
    });
    return t;
  };

  useEffect(() => {
    if (!api) return;
    api.getPatiTorns().then(res => {
      const saved = res?.[0]?.config_pati?.torns;
      setTorns(saved || initTorns());
    }).catch(() => setTorns(initTorns()))
    .finally(() => setLoading(false));
  }, [api]);

  function setTornDocent(dia, pid, idx, nom) {
    setTorns(prev => {
      const nou = JSON.parse(JSON.stringify(prev));
      if (!nou[dia]) nou[dia] = {};
      if (!nou[dia][pid]) nou[dia][pid] = [];
      nou[dia][pid][idx] = nom;
      return nou;
    });
  }

  function afegirSlot(dia, pid) {
    setTorns(prev => {
      const nou = JSON.parse(JSON.stringify(prev));
      if (!nou[dia]) nou[dia] = {};
      if (!nou[dia][pid]) nou[dia][pid] = [];
      nou[dia][pid].push('');
      return nou;
    });
  }

  function eliminarSlot(dia, pid, idx) {
    setTorns(prev => {
      const nou = JSON.parse(JSON.stringify(prev));
      nou[dia][pid].splice(idx, 1);
      return nou;
    });
  }

  async function suggerirAutomaticament(usaIntensiu = false) {
    const nousTorns = initTorns();
    for (const d of docents) {
      const h = usaIntensiu ? d.horari_intensiu : d.horari;
      if (!h) continue;
      for (const dia of DIES_ALL) {
        for (const f of patioFranjes) {
          const val = (h[dia]?.[f.id] || '').toLowerCase().trim();
          if (val === 'pati' || val.startsWith('pati')) {
            if (!isOriol && f.id === 'patiB') {
              // Rivo: enrutar al pati d'Infantil o de Primària segons grup_principal
              const gp = (d.grup_principal || '').trim();
              const dest = /^[iI]/.test(gp) ? 'patiB_inf'
                         : /^[456]/.test(gp) ? 'patiB_pri'
                         : 'patiB_inf'; // per defecte → Infantil
              if (!nousTorns[dia][dest]) nousTorns[dia][dest] = [];
              nousTorns[dia][dest].push(d.nom);
            } else {
              if (!nousTorns[dia][f.id]) nousTorns[dia][f.id] = [];
              nousTorns[dia][f.id].push(d.nom);
            }
          }
        }
      }
    }
    setTorns(nousTorns);
    showToast('✓ Torns suggerits automàticament');
  }

  function actualitzarBaixes() {
    if (baixesActives.length === 0) return showToast('Cap baixa activa registrada');
    let canvis = 0;
    setTorns(prev => {
      const nou = JSON.parse(JSON.stringify(prev));
      for (const dia of DIES_ALL) {
        for (const fila of filesTorns) {
          const llista = nou[dia]?.[fila.id];
          if (!llista) continue;
          nou[dia][fila.id] = llista.map(nom => {
            const clau = (nom || '').toLowerCase().trim();
            if (substitutMap[clau]) { canvis++; return substitutMap[clau]; }
            return nom;
          });
        }
      }
      return nou;
    });
    setTimeout(() => showToast(canvis > 0 ? `✓ ${canvis} torn${canvis > 1 ? 's' : ''} actualitzat${canvis > 1 ? 's' : ''} amb els substituts` : 'Cap torn afectat per baixes'), 50);
  }

  async function guardar() {
    setSaving(true);
    try {
      await api.savePatiTorns({ torns, generat: new Date().toISOString().split('T')[0] });
      showToast('✓ Torns de pati guardats');
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setSaving(false); }
  }

  function imprimirTornsPati() {
    if (!torns) return showToast('Primer guarda els torns de pati');
    const nomEscola = escola?.nom || 'Centre Educatiu';
    const _nomLow   = nomEscola.toLowerCase();
    const logoUrl   = _nomLow.includes('rivo')  ? `${window.location.origin}/logo_rivo.png`
                    : _nomLow.includes('oriol') ? `${window.location.origin}/logo_canoriol.png`
                    : null;
    const ara = new Date();
    const curs = ara.getMonth() >= 8
      ? `${ara.getFullYear()}–${ara.getFullYear() + 1}`
      : `${ara.getFullYear() - 1}–${ara.getFullYear()}`;

    const PDF_INFO = {
      patiA:     { label: 'Primària · 1r, 2n i 3r',  time: '10:30–11:00', color: '#16a34a' },
      patiB_inf: { label: 'Infantil · I3, I4 i I5',  time: '11:00–11:30', color: '#2563eb' },
      patiB_pri: { label: 'Primària · 4t, 5è i 6è',  time: '11:00–11:30', color: '#7c3aed' },
      opatiA:    { label: 'Infantil / Primària',       time: '11:00–11:30', color: '#16a34a' },
      opatiB:    { label: 'Secundària',                time: '11:30–12:00', color: '#2563eb' },
    };
    const DIES_ALL  = ['dilluns','dimarts','dimecres','dijous','divendres'];
    const DIES_FULL = { dilluns:'Dilluns', dimarts:'Dimarts', dimecres:'Dimecres', dijous:'Dijous', divendres:'Divendres' };

    const pagesHtml = filesTorns.map(f => {
      const info   = PDF_INFO[f.id] || { label: f.label, time: f.sub || '', color: '#374151' };
      const colsHtml = DIES_ALL.map(dia => {
        const noms  = (torns[dia]?.[f.id] || []).filter(Boolean);
        const chips = noms.length > 0
          ? noms.map(n => `<div class="chip">${n}</div>`).join('')
          : `<div class="empty">—</div>`;
        return `<div class="col"><div class="col-hdr">${DIES_FULL[dia]}</div><div class="col-body">${chips}</div></div>`;
      }).join('');

      const logoTag = logoUrl
        ? `<img src="${logoUrl}" class="logo" alt="" />`
        : '';

      return `
<div class="pg">
  <div class="hdr" style="border-top:5px solid ${info.color}">
    <div class="school-wrap">${logoTag}<span class="school-name">${nomEscola}</span></div>
    <div class="turn-wrap">
      <span class="turn-label" style="color:${info.color}">${info.label}</span>
      <span class="hora">🕐 ${info.time}</span>
    </div>
  </div>
  <div class="grid">${colsHtml}</div>
  <div class="ftr">
    <span>Curs ${curs} · Torns de vigilància de pati</span>
    <span class="brand">Gestionat per HorariaPro</span>
  </div>
</div>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="ca"><head><meta charset="UTF-8">
<title>Torns de Pati – ${nomEscola}</title><style>
@page{size:A4 landscape;margin:14mm 18mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#fff;color:#111}
.pg{display:flex;flex-direction:column;height:calc(210mm - 28mm);page-break-after:always;break-after:page}
.pg:last-child{page-break-after:avoid;break-after:avoid}
.hdr{padding:12px 0 10px;border-bottom:2px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.school-wrap{display:flex;align-items:center;gap:10px}
.logo{height:32px;width:auto;object-fit:contain}
.school-name{font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.07em}
.turn-wrap{display:flex;align-items:center;gap:14px}
.turn-label{font-size:18px;font-weight:800;letter-spacing:.02em}
.hora{font-size:12px;color:#6b7280;white-space:nowrap}
.grid{flex:1;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;min-height:0}
.col{display:flex;flex-direction:column;border:2px solid #e5e7eb;border-radius:12px;overflow:hidden}
.col-hdr{background:#f3f4f6;padding:10px 8px;font-size:12px;font-weight:800;color:#374151;text-align:center;text-transform:uppercase;letter-spacing:.07em;border-bottom:2px solid #e5e7eb}
.col-body{flex:1;padding:10px 8px;display:flex;flex-direction:column;gap:7px;background:#fff}
.chip{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:9px 10px;font-size:14px;font-weight:600;color:#1e293b;text-align:center;letter-spacing:.01em}
.empty{color:#cbd5e1;font-size:26px;text-align:center;padding:20px 0;line-height:1}
.ftr{padding:9px 0 0;border-top:2px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:#9ca3af;margin-top:12px}
.brand{font-weight:700;color:#6366f1;letter-spacing:.02em}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>${pagesHtml}</body></html>`;

    const w = window.open('', '_blank', 'width=1000,height=750');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 600); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;

  const hasIntensiu = docents.some(d => d.horari_intensiu);

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h3>🕐 Torns de vigilància de pati</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" style={{ background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'var(--blue)', fontSize: 11 }} onClick={() => suggerirAutomaticament(false)}>
              🔄 Suggerir (horari normal)
            </button>
            {hasIntensiu && configIntensiva?.actiu && (
              <button className="btn btn-sm" style={{ background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber)', fontSize: 11 }} onClick={() => suggerirAutomaticament(true)}>
                🌅 Regenerar per intensiva
              </button>
            )}
            {baixesActives.length > 0 && (
              <button className="btn btn-sm" style={{ background: 'var(--red-bg,#fff0f0)', color: 'var(--red)', borderColor: 'var(--red)', fontSize: 11 }} onClick={actualitzarBaixes} title="Substitueix als torns els docents de baixa pel seu substitut">
                🩹 Actualitzar baixes ({baixesActives.length})
              </button>
            )}
            <button className="btn btn-sm" style={{ background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green)', fontSize: 11, fontWeight: 600 }} onClick={guardar} disabled={saving}>
              {saving ? 'Guardant...' : '💾 Guardar torns'}
            </button>
            <button className="btn btn-sm" style={{ background: 'var(--purple-bg,#f5f3ff)', color: 'var(--purple,#7c3aed)', borderColor: 'var(--purple,#7c3aed)', fontSize: 11, fontWeight: 600 }} onClick={imprimirTornsPati}>
              🖨️ Imprimir PDF
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto', padding: '10px 16px' }}>
          {filesTorns.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '16px 0' }}>No hi ha franges de pati definides per a aquesta escola.</div>
          ) : (
            <table style={{ borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 12px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textAlign: 'left', minWidth: 120 }}>Torn</th>
                  {DIES_ALL.map(dia => (
                    <th key={dia} style={{ padding: '6px 10px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textAlign: 'center', minWidth: 100 }}>{DIE_LBL[dia]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filesTorns.map(f => (
                  <tr key={f.id}>
                    <td style={{ padding: '6px 12px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', verticalAlign: 'top' }}>
                      <div>{f.label}</div>
                      <div style={{ fontSize: 9, color: 'var(--ink-4)' }}>{f.sub}</div>
                    </td>
                    {DIES_ALL.map(dia => {
                      const noms = torns?.[dia]?.[f.id] || [];
                      return (
                        <td key={dia} style={{ padding: '6px 8px', border: '1px solid var(--border)', verticalAlign: 'top', background: noms.filter(Boolean).length ? 'var(--green-bg)' : 'var(--bg)', minWidth: 100 }}>
                          {noms.map((nom, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
                              <select
                                className="f-ctrl"
                                value={nom || ''}
                                onChange={e => setTornDocent(dia, f.id, idx, e.target.value)}
                                style={{ flex: 1, fontSize: 10, padding: '2px 4px', height: 26 }}
                              >
                                <option value="">Selecciona...</option>
                                {docentsDisponibles.map(d => <option key={d.id} value={d.nom}>{d.nom}</option>)}
                              </select>
                              <button onClick={() => eliminarSlot(dia, f.id, idx)} style={{ fontSize: 10, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)', padding: '0 2px', lineHeight: 1 }}>✕</button>
                            </div>
                          ))}
                          <button
                            onClick={() => afegirSlot(dia, f.id)}
                            style={{ fontSize: 10, color: 'var(--green)', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 0', lineHeight: 1, fontWeight: 700 }}
                          >+ Afegir</button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

const RATIOS_SORTIDA = {
  sortida:  { EI: 10, CI: 15, CM: 15, CS: 20 },
  colonies: { EI: 8,  CI: 12, CM: 12, CS: 18 },
};
const CICLE_LABEL = { EI: 'Ed. Infantil', CI: 'Cicle Inicial', CM: 'Cicle Mitjà', CS: 'Cicle Superior' };

function detectarCiclesGrups(grups) {
  const cicles = new Set();
  for (const g of grups) {
    const gl = (g || '').toLowerCase().trim();
    if (/^(i[345]|p[345]|ei\b)/.test(gl) || gl.includes('infantil')) cicles.add('EI');
    else if (/^(1r|2n)/.test(gl)) cicles.add('CI');
    else if (/^(3r|4t)/.test(gl)) cicles.add('CM');
    else if (/^(5[eè]|6[eè])/.test(gl)) cicles.add('CS');
  }
  return [...cicles];
}

function calcRecomanacioRatio(numAlumnes, cicles, tipus) {
  if (!numAlumnes || !cicles.length) return null;
  const taula = RATIOS_SORTIDA[tipus] || RATIOS_SORTIDA.sortida;
  const ratios = cicles.map(c => taula[c]).filter(Boolean);
  if (!ratios.length) return null;
  const ratioMinim = Math.min(...ratios);
  const cicleMinim = cicles.find(c => taula[c] === ratioMinim);
  return { recomanats: Math.ceil(numAlumnes / ratioMinim), ratio: ratioMinim, cicleMinim };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, bytes.length)));
  }
  return btoa(binary);
}

async function analitzarNombreAlumnes(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let msgContent;
  if (ext === 'docx') {
    const ab = await file.arrayBuffer();
    const { value } = await mammoth.convertToHtml({ arrayBuffer: ab });
    msgContent = [{ type: 'text', text: value }];
  } else if (ext === 'pdf') {
    const ab = await file.arrayBuffer();
    msgContent = [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arrayBufferToBase64(ab) } }];
  } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    const ab = await file.arrayBuffer();
    const mt = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`;
    msgContent = [{ type: 'image', source: { type: 'base64', media_type: mt, data: arrayBufferToBase64(ab) } }];
  } else {
    return null;
  }
  msgContent.push({ type: 'text', text: "Analitza aquest document d'una sortida escolar. Troba el nombre TOTAL d'alumnes. El nombre pot estar com a total explícit, o REPARTIT PER GRUPS/CLASSES (ex: '1rA: 17 alumnes, 1rB: 17 alumnes, 2nA: 23 alumnes, 2nB: 23 alumnes' → has de sumar: 17+17+23+23 = 80). SUMA SEMPRE tots els grups per obtenir el total. Respon ÚNICAMENT amb el número enter resultant, sense cap altre text (ex: \"80\"). Si no pots trobar cap nombre d'alumnes, respon exactament: NO_TROBAT" });
  const resp = await callClaudeRaw([{ role: 'user', content: msgContent }], 100);
  const t = resp.trim();
  if (t === 'NO_TROBAT') return null;
  const n = parseInt(t.replace(/\D/g, ''), 10);
  return (!isNaN(n) && n > 0) ? n : null;
}

function buildSortidaEmailHtml({ title, date, descripcio, llistaPart, docAdjunt, escolaNom }) {
  const fmtData = iso => new Date(iso + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#1d4ed8;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
      <h1 style="margin:0;font-size:20px">🚌 ${title}</h1>
      <p style="margin:6px 0 0;opacity:.85;font-size:14px">${fmtData(date)}</p>
    </div>
    <div style="padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
      ${descripcio?.trim() ? `<h2 style="font-size:15px;color:#374151;margin:0 0 8px">Sobre l'activitat</h2><p style="color:#4b5563;font-size:14px;line-height:1.6;white-space:pre-wrap;margin:0 0 20px">${descripcio.trim()}</p>` : ''}
      <h2 style="font-size:15px;color:#374151;margin:0 0 8px">Professionals que assisteixen</h2>
      <ul style="margin:0 0 20px;padding-left:20px;color:#374151;font-size:14px;line-height:2">${llistaPart}</ul>
      ${docAdjunt ? `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:12px 14px;margin-top:8px"><p style="margin:0;font-size:13px;color:#0369a1">📎 Document adjunt: <strong>${docAdjunt.nom}</strong></p></div>` : ''}
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af">${escolaNom} · Gestió Docent</div>
    </div>
  </div>`;
}

const _isoToDMY = iso => iso ? iso.split('-').reverse().join('/') : '';
const _dmyToIso = s => {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
function InputDataDMY({ value, onChange, min, style }) {
  const [txt, setTxt] = useState(() => _isoToDMY(value));
  const pickerRef = useRef(null);
  useEffect(() => {
    const iso = _dmyToIso(txt);
    if (iso !== value) setTxt(_isoToDMY(value));
  }, [value]);
  function handleChange(e) {
    let v = e.target.value.replace(/[^0-9/]/g, '');
    if (v.length === 2 && txt.length === 1) v += '/';
    if (v.length === 5 && txt.length === 4) v += '/';
    setTxt(v);
    const iso = _dmyToIso(v);
    if (iso && (!min || iso >= min)) onChange(iso);
  }
  function handlePicker(e) {
    const iso = e.target.value;
    if (iso) { setTxt(_isoToDMY(iso)); onChange(iso); }
  }
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input className="f-ctrl" type="text" inputMode="numeric"
        placeholder="DD/MM/AAAA" value={txt} onChange={handleChange}
        maxLength={10} style={style} />
      <button type="button"
        onClick={() => pickerRef.current?.showPicker()}
        style={{ padding: '6px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg-2)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
        title="Obrir calendari"
      >📅</button>
      <input ref={pickerRef} type="date" value={value} min={min} lang="ca"
        onChange={handlePicker}
        style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', width: 0, height: 0 }} />
    </div>
  );
}

function SortidesView({ docents, franjes, api, escola, baixes, showToast }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateFi, setDateFi] = useState(new Date().toISOString().split('T')[0]);
  const [title, setTitle] = useState('');
  const [grupsSeleccionats, setGrupsSeleccionats] = useState(new Set());
  const [docentsAniran, setDocentsAniran] = useState(new Set());
  // acompanyants manuals: noms fora dels tutors/especialistes suggerits
  const [descripcio, setDescripcio] = useState('');
  const [docSortida, setDocSortida] = useState(null);
  const [tipusActivitat, setTipusActivitat] = useState('sortida');
  const [numAlumnes, setNumAlumnes] = useState(null);
  const [numAlumnesInput, setNumAlumnesInput] = useState('');
  const [analitzantDoc, setAnalitzantDoc] = useState(false);
  const [demanaManual, setDemanaManual] = useState(false);
  const [acompanyantSearch, setAcompanyantSearch] = useState('');
  const [showAcompanyantPicker, setShowAcompanyantPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(null);

  // null → disponible
  // { status:'baixa' }        → de baixa sense retorn previst (exclou de suggeriments)
  // { status:'pendent', fi }  → baixa amb fi prevista < data sortida (avisa en ambre)
  function estatBaixa(nom) {
    const nomN = (nom || '').toLowerCase().trim();
    for (const b of (baixes || [])) {
      if (b.estat === 'tancada') continue;
      if ((b.absent || '').toLowerCase().trim() !== nomN) continue;
      if (b.data_fi_prevista && date > b.data_fi_prevista) {
        return { status: 'pendent', fi: b.data_fi_prevista };
      }
      return { status: 'baixa' };
    }
    return null;
  }

  const allGrups = useMemo(() =>
    [...new Set(docents.filter(d => d.rol === 'tutor' && d.grup_principal?.trim()).map(d => d.grup_principal.trim()))]
      .sort((a, b) => sortRivoGrupKey(a).localeCompare(sortRivoGrupKey(b))),
    [docents]
  );

  const tutorsDeGrups = useMemo(() =>
    docents.filter(d => d.rol === 'tutor' && grupsSeleccionats.has(d.grup_principal?.trim())),
    [docents, grupsSeleccionats]
  );

  // Tots els dies laborables de la sortida (de date a dateFi)
  const diesSortida = useMemo(() => {
    const dies = [];
    let cur = new Date(date + 'T12:00:00');
    const fi = new Date((dateFi || date) + 'T12:00:00');
    while (cur <= fi) {
      const d = cur.getDay();
      if (d >= 1 && d <= 5) dies.push(['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][d]);
      cur.setDate(cur.getDate() + 1);
    }
    return dies;
  }, [date, dateFi]);

  const especialistesSuggerits = useMemo(() => {
    if (!grupsSeleccionats.size) return [];
    const tutorIds = new Set(tutorsDeGrups.map(d => d.id));
    const scores = {};
    for (const d of docents) {
      if (tutorIds.has(d.id) || !d.horari) continue;
      if (estatBaixa(d.nom)?.status === 'baixa') continue;
      // Criteri 1: afinitat setmanal (sessions amb els grups al llarg de tota la setmana)
      let count = 0;
      for (const dH of Object.values(d.horari)) {
        for (const v of Object.values(dH || {})) {
          for (const g of grupsSeleccionats) { if (matchesGrup(v, g)) count++; }
        }
      }
      if (!count) continue;
      // Criteri 2: franges amb els grups que marxen durant TOTS els dies de la sortida
      // → si acompanya, aquestes franges NO necessiten cobertura (el grup tampoc és al centre)
      let dayGroupSlots = 0;
      for (const dia of diesSortida) {
        for (const v of Object.values(d.horari[dia] || {})) {
          for (const g of grupsSeleccionats) { if (matchesGrup(v, g)) { dayGroupSlots++; break; } }
        }
      }
      // Slots ocupats durant tota la sortida (per saber quant de "buit" deix si marxa)
      const daySlots = diesSortida.reduce((total, dia) =>
        total + Object.values(d.horari[dia] || {}).filter(v => {
          const vl = (v || '').toLowerCase().trim();
          return vl && vl !== 'lliure' && vl !== 'libre';
        }).length, 0);
      scores[d.id] = { d, count, daySlots, dayGroupSlots, leaveStatus: estatBaixa(d.nom) };
    }
    // Ordre: primer els que tenen més franges del grup que marxa durant la sortida (menys cobertura),
    // després per afinitat setmanal, finalment menys slots ocupats durant la sortida
    return Object.values(scores).sort((a, b) =>
      b.dayGroupSlots - a.dayGroupSlots || b.count - a.count || a.daySlots - b.daySlots
    );
  }, [docents, grupsSeleccionats, diesSortida, tutorsDeGrups, baixes]);

  // Docents disponibles per afegir manualment (no tutors dels grups, no en els suggerits, no de baixa total)
  const tutorNoms = useMemo(() => new Set(tutorsDeGrups.map(d => d.nom)), [tutorsDeGrups]);
  const especialisteNoms = useMemo(() => new Set(especialistesSuggerits.map(({ d }) => d.nom)), [especialistesSuggerits]);
  const docentsManualsDisponibles = useMemo(() => {
    const normS = acompanyantSearch.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return docents.filter(d => {
      if (tutorNoms.has(d.nom) || especialisteNoms.has(d.nom)) return false;
      if (estatBaixa(d.nom)?.status === 'baixa') return false;
      if (!normS) return true;
      return (d.nom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(normS);
    });
  }, [docents, tutorNoms, especialisteNoms, acompanyantSearch, baixes, date]);

  // Auto-selecciona tutors disponibles
  useEffect(() => {
    setDocentsAniran(new Set(tutorsDeGrups.filter(d => !estatBaixa(d.nom)).map(d => d.nom)));
  }, [tutorsDeGrups, baixes, date]);

  // Quan es puja un document, analitza automàticament quants alumnes hi ha
  useEffect(() => {
    if (!docSortida) {
      setNumAlumnes(null);
      setNumAlumnesInput('');
      setDemanaManual(false);
      return;
    }
    let cancelled = false;
    setAnalitzantDoc(true);
    setDemanaManual(false);
    setNumAlumnes(null);
    analitzarNombreAlumnes(docSortida)
      .then(n => {
        if (cancelled) return;
        console.log('[analitzar] resultat IA:', n);
        if (n) { setNumAlumnes(n); setDemanaManual(false); }
        else setDemanaManual(true);
      })
      .catch(e => {
        console.error('[analitzar] error:', e?.message || e);
        if (!cancelled) setDemanaManual(true);
      })
      .finally(() => { if (!cancelled) setAnalitzantDoc(false); });
    return () => { cancelled = true; };
  }, [docSortida]);

  function toggleGrup(g) {
    setGrupsSeleccionats(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  }
  function toggleDocent(nom) {
    setDocentsAniran(prev => { const n = new Set(prev); n.has(nom) ? n.delete(nom) : n.add(nom); return n; });
  }
  function afegirManual(nom) {
    setDocentsAniran(prev => new Set([...prev, nom]));
    setAcompanyantSearch('');
    setShowAcompanyantPicker(false);
  }

  // Noms dels tutors dels grups seleccionats (van AMB el grup → ambGrup: true)
  const nomsTutors = useMemo(() => new Set(tutorsDeGrups.map(d => d.nom)), [tutorsDeGrups]);

  async function confirmarSortida() {
    if (!title.trim()) return showToast('Introdueix un títol per a la sortida');
    if (!grupsSeleccionats.size) return showToast('Selecciona almenys un grup');
    if (!docentsAniran.size) return showToast('Selecciona almenys un docent');
    setSaving(true);
    try {
      const absenciaFranges = franjes.filter(f => !f.lliure).map(f => f.id);
      const grupsStr = [...grupsSeleccionats].join(', ');
      const motiu = `Sortida: ${title.trim()}`;

      // Calcular tots els dies laborables entre date i dateFi
      const dies = [];
      let cur = new Date(date + 'T12:00:00');
      const fi = new Date((dateFi || date) + 'T12:00:00');
      while (cur <= fi) {
        const d = cur.getDay();
        if (d >= 1 && d <= 5) dies.push(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() + 1);
      }
      const dataFiReal = dateFi && dateFi > date ? dateFi : date;

      // Puja document adjunt si n'hi ha
      let docAdjunt = null;
      if (docSortida) {
        try {
          docAdjunt = await uploadFitxer(docSortida, `sortida_${date}`);
        } catch (e) {
          console.error('[sortida] Error pujant document:', e);
        }
      }

      // Crea avís NOMÉS per als acompanyants (no tutors): els tutors van amb el grup i no cal cobertura
      const acompanyants = [...docentsAniran].filter(nom => !nomsTutors.has(nom));
      await Promise.all(dies.flatMap(dia => acompanyants.map(nom => {
        const doc = docents.find(d => d.nom === nom);
        return api.saveAbsencia({
          escola_id: escola.id,
          docent_id: doc?.id || null,
          docent_nom: nom,
          data: dia,
          franges: absenciaFranges,
          motiu,
          notes: `Acompanyant a la sortida (${grupsStr}) · Cal cobrir les seves franges habituals`,
          estat: 'pendent',
          tipus: 'sortida',
        });
      })));

      // Envia correus a tots els participants que tenen email configurat
      try {
        const participants = [...docentsAniran]
          .map(nom => docents.find(d => d.nom === nom))
          .filter(d => d?.email?.trim());
        if (participants.length > 0) {
          const fmtDataLlarga = iso => new Date(iso + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          const llistaPart = [...docentsAniran].map(nom => {
            const esTutor = nomsTutors.has(nom);
            return `<li style="margin-bottom:4px">${nom} <span style="color:#6b7280;font-size:12px">(${esTutor ? 'tutor/a · va amb el grup' : 'acompanyant'})</span></li>`;
          }).join('');
          const htmlEmail = buildSortidaEmailHtml({
            title: title.trim(), date, descripcio, llistaPart, docAdjunt, escolaNom: escola.nom,
          });
          const attachments = docAdjunt ? [{ filename: docAdjunt.nom, path: docAdjunt.url }] : undefined;
          await sendEmail(participants.map(d => d.email.trim()), `[Sortida] ${title.trim()} — ${fmtDataLlarga(date)}`, htmlEmail, attachments);
        }
      } catch (e) {
        console.error('[sortida] Error enviant correus:', e);
      }

      // Crea entrada a info_extra perquè la IA de cobertures sàpiga que aquells grups no són al centre
      try {
        const rawInfoExtra = await api.getInfoExtra();
        const infoExtraActual = (() => {
          const raw = rawInfoExtra?.[0]?.info_extra;
          if (!raw) return [];
          if (Array.isArray(raw)) return raw;
          return [raw];
        })();
        const novaEntrada = {
          titol: `Sortida: ${title.trim()}`,
          resum: `${[...grupsSeleccionats].join(', ')} surten del centre. Acompanyants: ${[...docentsAniran].join(', ')}.`,
          docentsBlocats: [...docentsAniran].map(nom => ({
            nom,
            hores: 'tot el dia',
            ambGrup: nomsTutors.has(nom),
          })),
          grups_fora: [...grupsSeleccionats],
          context: `Sortida escolar "${title.trim()}". Grups fora del centre: ${grupsStr}. Les franges dels tutors acompanyants no necessiten cobertura per al grup. Els acompanyants extra sí que deixen franges descobertes.`,
          data_inici: date,
          data_fi: dataFiReal,
        };
        await api.saveInfoExtra([...infoExtraActual, novaEntrada]);
      } catch { /* si falla info_extra, els avisos ja estan creats */ }

      const totalAvisos = acompanyants.length * dies.length;
      const info = { count: totalAvisos, title: title.trim(), date, dateFi: dataFiReal, dies: dies.length };
      setSavedOk(info);
      const msgDies = dies.length > 1 ? ` (${dies.length} dies)` : '';
      showToast(`✓ ${totalAvisos} avis${totalAvisos !== 1 ? 'os' : ''} creats per "${info.title}"${msgDies}`);
      setTitle('');
      setDescripcio('');
      setDocSortida(null);
      setTipusActivitat('sortida');
      setNumAlumnes(null);
      setNumAlumnesInput('');
      setDemanaManual(false);
      setGrupsSeleccionats(new Set());
      setDocentsAniran(new Set());
      setShowAcompanyantPicker(false);
      const avui = new Date().toISOString().split('T')[0];
      setDate(avui);
      setDateFi(avui);
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setSaving(false); }
  }

  const fmtData = iso => new Date(iso + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  // Docents manuals ja afegits (no tutors ni suggerits però sí a docentsAniran)
  const docentsManualsAfegits = [...docentsAniran].filter(nom => !tutorNoms.has(nom) && !especialisteNoms.has(nom));

  const ambEmailCount = useMemo(() =>
    [...docentsAniran].filter(nom => docents.find(d => d.nom === nom)?.email?.trim()).length,
    [docentsAniran, docents]
  );

  const ciclesDetectats = useMemo(() => detectarCiclesGrups([...grupsSeleccionats]), [grupsSeleccionats]);
  const recomanacio = useMemo(() => calcRecomanacioRatio(numAlumnes, ciclesDetectats, tipusActivitat), [numAlumnes, ciclesDetectats, tipusActivitat]);

  return (
    <>
      {savedOk && (
        <div style={{ padding: '10px 14px', background: 'var(--green-bg)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
          ✅ <strong>{savedOk.count} avis{savedOk.count !== 1 ? 'os' : ''} creats</strong> per la sortida "{savedOk.title}"
          {savedOk.dies > 1
            ? ` (${fmtData(savedOk.date)} – ${fmtData(savedOk.dateFi)} · ${savedOk.dies} dies)`
            : ` (${fmtData(savedOk.date)})`}.
          La IA ja sap quins grups surten. Gestiona les cobertures des de <strong>Avisos</strong>.
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h3>🚌 Nova sortida escolar</h3></div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label className="f-label">Nom de la sortida</label>
              <input className="f-ctrl" placeholder="Ex: Visita al Museu, Colònies 5è..." value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="f-label">Data inici</label>
              <InputDataDMY value={date} onChange={iso => { setDate(iso); if (iso > dateFi) setDateFi(iso); }} style={{ width: 130 }} />
            </div>
            <div>
              <label className="f-label">Data fi</label>
              <InputDataDMY value={dateFi} min={date} onChange={iso => setDateFi(iso)} style={{ width: 130 }} />
            </div>
          </div>

          <div>
            <label className="f-label">Descripció de l'activitat <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(opcional)</span></label>
            <textarea
              className="f-ctrl"
              placeholder="Explica de què va la sortida, itinerari, observacions..."
              rows={3}
              value={descripcio}
              onChange={e => setDescripcio(e.target.value)}
              style={{ resize: 'vertical', minHeight: 72 }}
            />
          </div>

          <div>
            <label className="f-label">Tipus d'activitat</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {[['sortida', '🚌 Sortida'], ['colonies', '🏕️ Colònies']].map(([val, lab]) => (
                <button key={val} type="button" className="btn btn-sm"
                  style={tipusActivitat === val
                    ? { background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700 }
                    : { background: 'var(--bg-2)', borderColor: 'var(--border)' }}
                  onClick={() => setTipusActivitat(val)}>{lab}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="f-label">Document adjunt <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(opcional · PDF, Word...)</span></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 10px', border: '1px dashed var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--ink-3)', background: 'var(--bg-2)' }}>
              <span>📎</span>
              {docSortida
                ? <span style={{ flex: 1, color: 'var(--ink)', fontWeight: 500 }}>{docSortida.name}</span>
                : <span style={{ flex: 1 }}>Puja un document amb l'organització de la sortida...</span>
              }
              {docSortida && (
                <button type="button" onClick={e => { e.preventDefault(); setDocSortida(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
              )}
              <input type="file" accept=".pdf,.doc,.docx,.png,.jpg" style={{ display: 'none' }}
                onChange={e => setDocSortida(e.target.files[0] || null)} />
            </label>
            {analitzantDoc && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--blue)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                Analitzant document amb IA...
              </div>
            )}
            {!analitzantDoc && numAlumnes && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--green-dark, var(--green))', fontWeight: 600 }}>
                📊 {numAlumnes} alumnes detectats al document
              </div>
            )}
            {!analitzantDoc && demanaManual && (
              <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--amber-bg)', border: '1px solid var(--border)', borderRadius: 6 }}>
                <div style={{ fontSize: 11.5, color: 'var(--amber)', fontWeight: 600, marginBottom: 6 }}>
                  ⚠ No s'ha pogut detectar el nombre d'alumnes al document. Introdueix-lo manualment:
                </div>
                <input
                  type="number" min="1" className="f-ctrl"
                  style={{ width: 100 }}
                  placeholder="Ex: 47"
                  value={numAlumnesInput}
                  onChange={e => { setNumAlumnesInput(e.target.value); setNumAlumnes(parseInt(e.target.value, 10) || null); }}
                />
              </div>
            )}
            {recomanacio && (
              <div style={{ marginTop: 8, padding: '10px 12px', background: docentsAniran.size >= recomanacio.recomanats ? 'var(--green-bg)' : 'var(--amber-bg)', border: '1px solid var(--border)', borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>
                  📋 Recomanació de ràtio ({tipusActivitat === 'colonies' ? 'colònies' : 'sortida'})
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginBottom: 4 }}>
                  {numAlumnes} alumnes · {ciclesDetectats.map(c => CICLE_LABEL[c] || c).join(' + ')} · Ràtio {recomanacio.ratio}:1{ciclesDetectats.length > 1 ? ' (el més restrictiu)' : ''}
                </div>
                {docentsAniran.size >= recomanacio.recomanats
                  ? <div style={{ fontSize: 12, color: 'var(--green-dark, var(--green))', fontWeight: 600 }}>✓ Cobert — tens {docentsAniran.size} professionals, mínim {recomanacio.recomanats}</div>
                  : <div style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>⚠ Calen mínim {recomanacio.recomanats} professionals — tens {docentsAniran.size}, falten {recomanacio.recomanats - docentsAniran.size}</div>
                }
              </div>
            )}
          </div>

          {(() => { const dw = new Date(date + 'T12:00:00').getDay(); return dw === 0 || dw === 6; })() && (
            <div style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>⚠ La data seleccionada és cap de setmana.</div>
          )}

          <div>
            <label className="f-label">Grups que van de sortida</label>
            {allGrups.length === 0
              ? <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>Primer puja els horaris dels tutors des de Personal.</p>
              : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {allGrups.map(g => (
                    <button key={g} className="btn btn-sm"
                      style={grupsSeleccionats.has(g)
                        ? { background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700 }
                        : { background: 'var(--bg-2)', borderColor: 'var(--border)' }
                      }
                      onClick={() => toggleGrup(g)}
                    >{g}</button>
                  ))}
                </div>
              )
            }
          </div>
        </div>
      </div>

      {grupsSeleccionats.size > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h3>👥 Qui va a la sortida</h3>
            <span className="sp sp-blue">{docentsAniran.size} docents</span>
          </div>

          <div style={{ padding: '7px 14px', background: 'var(--blue-bg)', borderBottom: '1px solid var(--border)', fontSize: 11.5, color: 'var(--blue)' }}>
            ℹ️ Tutors/es: avís sense cobertura del grup (surten amb els alumnes). Acompanyants extra: cal cobrir les seves franges habituals.
          </div>

          {tutorsDeGrups.length > 0 && (
            <>
              <div style={{ padding: '5px 16px 4px', fontSize: 9.5, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
                Tutors/es dels grups · Surten amb els alumnes
              </div>
              {tutorsDeGrups.map(d => (
                <SortidaDocentsRow key={d.id} d={d} selected={docentsAniran.has(d.nom)} onToggle={() => toggleDocent(d.nom)} isTutor leaveStatus={estatBaixa(d.nom)} />
              ))}
            </>
          )}

          {especialistesSuggerits.length > 0 && (() => {
            const ambDia = especialistesSuggerits.filter(e => e.dayGroupSlots > 0);
            const nomesSetmana = especialistesSuggerits.filter(e => e.dayGroupSlots === 0);
            const grupsLabel = [...grupsSeleccionats].join('+');
            const multiDia = diesSortida.length > 1;
            const periodeLabel = multiDia ? `durant la sortida (${diesSortida.length} dies)` : `el ${diesSortida[0] || ''}`;
            return (
              <>
                {ambDia.length > 0 && (
                  <>
                    <div style={{ padding: '5px 16px 4px', fontSize: 9.5, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.06em', background: 'var(--green-bg)', borderBottom: '1px solid var(--border)' }}>
                      🎯 Especialistes de la sortida · Menys cobertura necessària
                    </div>
                    {ambDia.slice(0, 8).map(({ d, count, dayGroupSlots, leaveStatus }) => (
                      <SortidaDocentsRow
                        key={d.id} d={d}
                        selected={docentsAniran.has(d.nom)}
                        onToggle={() => toggleDocent(d.nom)}
                        leaveStatus={leaveStatus}
                        dayGroupSlots={dayGroupSlots}
                        hint={`${dayGroupSlots} fr. amb ${grupsLabel} ${periodeLabel} · ${count} sessions/setm.`}
                      />
                    ))}
                  </>
                )}
                {nomesSetmana.length > 0 && (
                  <>
                    <div style={{ padding: '5px 16px 4px', fontSize: 9.5, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
                      Especialistes per afinitat setmanal
                    </div>
                    {nomesSetmana.slice(0, 6).map(({ d, count, leaveStatus }) => (
                      <SortidaDocentsRow
                        key={d.id} d={d}
                        selected={docentsAniran.has(d.nom)}
                        onToggle={() => toggleDocent(d.nom)}
                        leaveStatus={leaveStatus}
                        hint={`${count} sessions/setm. amb ${grupsLabel}`}
                      />
                    ))}
                  </>
                )}
              </>
            );
          })()}

          {/* Acompanyants manuals ja afegits */}
          {docentsManualsAfegits.length > 0 && (
            <>
              <div style={{ padding: '5px 16px 4px', fontSize: 9.5, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '.06em', background: 'var(--purple-bg)', borderBottom: '1px solid var(--border)' }}>
                Acompanyants afegits manualment
              </div>
              {docentsManualsAfegits.map(nom => {
                const d = docents.find(x => x.nom === nom) || { nom, rol: '', grup_principal: '' };
                return (
                  <SortidaDocentsRow key={nom} d={d} selected onToggle={() => toggleDocent(nom)} leaveStatus={estatBaixa(nom)} isManual />
                );
              })}
            </>
          )}

          {/* Botó afegir acompanyant manual */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            {!showAcompanyantPicker ? (
              <button
                className="btn btn-sm"
                style={{ background: 'var(--purple-bg)', color: 'var(--purple)', borderColor: 'var(--purple)', fontWeight: 600 }}
                onClick={() => setShowAcompanyantPicker(true)}
              >
                + Afegir acompanyant per criteri personal
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--purple)' }}>Cerca un docent del centre</div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--ink-3)', pointerEvents: 'none' }}>🔍</span>
                  <input
                    autoFocus
                    className="f-ctrl"
                    style={{ paddingLeft: 28 }}
                    placeholder="Nom del docent..."
                    value={acompanyantSearch}
                    onChange={e => setAcompanyantSearch(e.target.value)}
                  />
                </div>
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                  {docentsManualsDisponibles.length === 0 && (
                    <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink-3)' }}>Cap docent coincident</div>
                  )}
                  {docentsManualsDisponibles.map(d => {
                    const jaAfegit = docentsAniran.has(d.nom);
                    const ls = estatBaixa(d.nom);
                    return (
                      <div key={d.id}
                        onClick={() => !jaAfegit && afegirManual(d.nom)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: jaAfegit ? 'default' : 'pointer', background: jaAfegit ? 'var(--bg-2)' : undefined, opacity: jaAfegit ? 0.5 : 1 }}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(d.nom), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {initials(d.nom)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{d.nom}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{rolLabel(d.rol)}{d.grup_principal ? ` · ${d.grup_principal}` : ''}</div>
                        </div>
                        {ls?.status === 'pendent' && <span style={{ fontSize: 9, color: 'var(--amber)', fontWeight: 700, flexShrink: 0 }}>⚠ Permís</span>}
                        {jaAfegit ? <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Ja afegit</span> : <span style={{ fontSize: 11, color: 'var(--purple)', fontWeight: 700 }}>+</span>}
                      </div>
                    );
                  })}
                </div>
                <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { setShowAcompanyantPicker(false); setAcompanyantSearch(''); }}>
                  Tancar
                </button>
              </div>
            )}
          </div>

          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!title.trim() && (
              <div style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>⚠ Introdueix el nom de la sortida per poder confirmar.</div>
            )}
            {ambEmailCount > 0 && (
              <div style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 500 }}>✉ S'enviarà correu a {ambEmailCount} participant{ambEmailCount !== 1 ? 's' : ''} amb correu configurat.</div>
            )}
            <button className="btn btn-primary btn-full" onClick={confirmarSortida} disabled={saving || !title.trim()}>
              {saving ? 'Creant avisos i enviant correus...' : `🚌 Crear ${docentsAniran.size} avís${docentsAniran.size !== 1 ? 'os' : ''} i registrar sortida`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function SortidaDocentsRow({ d, selected, onToggle, isTutor, isManual, leaveStatus, hint, dayGroupSlots }) {
  const isBaixa   = leaveStatus?.status === 'baixa';
  const isPendent = leaveStatus?.status === 'pendent';
  const fmtFi = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' }) : '';

  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        background: isBaixa ? 'var(--amber-bg)' : isPendent ? 'var(--amber-bg)' : selected ? 'var(--blue-bg)' : undefined,
        cursor: 'pointer', transition: 'background .1s',
        opacity: isBaixa ? 0.65 : 1,
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: (isBaixa || isPendent) ? 'var(--amber)' : selected ? 'var(--blue)' : avatarColor(d.nom), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
        {initials(d.nom)}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: selected ? 600 : 400, color: isBaixa ? 'var(--ink-3)' : isPendent ? 'var(--amber)' : selected ? 'var(--blue)' : 'var(--ink)', textDecoration: isBaixa ? 'line-through' : undefined }}>
          {d.nom}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>
          {rolLabel(d.rol)}{d.grup_principal ? ` · ${d.grup_principal}` : ''}
          {hint && <span style={{ marginLeft: 6, color: dayGroupSlots > 0 ? 'var(--green)' : 'var(--ink-4)' }}>· {hint}</span>}
        </div>
      </div>
      {isBaixa   && <span className="sp sp-amber" style={{ fontSize: 9.5, flexShrink: 0 }}>🩹 De baixa</span>}
      {isPendent && <span style={{ fontSize: 9.5, flexShrink: 0, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber)', borderRadius: 20, padding: '1px 7px', fontWeight: 700, whiteSpace: 'nowrap' }}>⚠ Permís fins {fmtFi(leaveStatus.fi)}</span>}
      {!leaveStatus && dayGroupSlots > 0 && <span style={{ fontSize: 9.5, flexShrink: 0, background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-mid)', borderRadius: 20, padding: '1px 7px', fontWeight: 700 }}>🎯 {dayGroupSlots} fr.</span>}
      {!leaveStatus && isTutor && <span className="sp sp-blue" style={{ fontSize: 9.5, flexShrink: 0 }}>tutor/a</span>}
      <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selected ? 'var(--blue)' : 'var(--border)'}`, background: selected ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .1s' }}>
        {selected && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}
      </div>
    </div>
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
              const rowH = f.lliure ? 18 : f.patio ? 22 : (f.min || 30) * 1.5;
              const pad  = (f.lliure || f.patio || (f.min || 30) <= 15) ? '1px 3px' : '4px 3px';
              return (
                <tr key={f.id} style={{ height: rowH }}>
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
                            style={{ fontSize: 9, color: cellColor(val), fontWeight: val ? 500 : 400, display: 'block', padding: pad, cursor: onCellSave ? 'text' : 'default' }}
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
  const [substitutNou, setSubstitutNou] = useState(false);
  const docentsSorted = [...(docents || [])].sort((a, b) => a.nom.localeCompare(b.nom));
  const titular = docentsSorted.find(d => d.nom.toLowerCase() === draft.absent.toLowerCase().trim());
  const substitutJaExisteix = !substitutNou && docentsSorted.some(d => d.nom.toLowerCase() === draft.substitut.toLowerCase().trim());
  const mostraCrearCompte = isNew && draft.substitut.trim() && (substitutNou || !substitutJaExisteix);

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
          {substitutNou ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="f-ctrl" style={{ flex: 1 }} placeholder="Nom complet del nou substitut" value={draft.substitut} onChange={e => onChange(d => ({ ...d, substitut: e.target.value }))} autoFocus />
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11, whiteSpace: 'nowrap' }} onClick={() => { setSubstitutNou(false); onChange(d => ({ ...d, substitut: '' })); }}>← Existent</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <select className="f-ctrl" style={{ flex: 1 }} value={draft.substitut} onChange={e => onChange(d => ({ ...d, substitut: e.target.value }))}>
                <option value="">Selecciona docent existent...</option>
                {docentsSorted.filter(d => d.nom !== draft.absent).map(d => <option key={d.id} value={d.nom}>{d.nom}</option>)}
              </select>
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11, whiteSpace: 'nowrap' }} onClick={() => { setSubstitutNou(true); onChange(d => ({ ...d, substitut: '' })); }}>+ Nou</button>
            </div>
          )}
        </div>
      </div>

      {/* Fila 2: Motiu + Dates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label className="f-label">Dates d'inici i fi prevista</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" className="f-ctrl" value={draft.data_inici || ''} onChange={e => onChange(d => ({ ...d, data_inici: e.target.value }))} />
            <input type="date" className="f-ctrl" value={draft.data_fi_prevista || ''} onChange={e => onChange(d => ({ ...d, data_fi_prevista: e.target.value }))} placeholder="Fi prevista" />
          </div>
        </div>
        <div>
          <label className="f-label">Motiu / Tipus de baixa</label>
          <select className="f-ctrl" value={draft.motiu_detall || ''} onChange={e => onChange(d => ({ ...d, motiu_detall: e.target.value }))}>
            <option value="">Seleccionar motiu...</option>
            {MOTIUS_ABSENCIA.map(g => (
              <optgroup key={g.grup} label={g.grup}>
                {g.opcions.map(o => <option key={o} value={o}>{o}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* Alertes motiu */}
      {draft.motiu_detall && esMotuiATRI(draft.motiu_detall) && (
        <div className="f-warn" style={{ background: '#eff6ff', borderColor: '#93c5fd', color: '#1d4ed8', fontSize: 12 }}>
          🖥️ No oblidis gestionar aquest permís per <strong>ATRI</strong> (portal Generalitat).
        </div>
      )}
      {draft.motiu_detall && MOTIUS_AMB_JUSTIFICANT.has(draft.motiu_detall) && (
        <div className="f-warn" style={{ fontSize: 12 }}>
          📄 Recorda sol·licitar el <strong>justificant</strong> corresponent.
        </div>
      )}

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
  if (b === 'PAE')          return { bg: 'var(--purple-bg)', color: 'var(--purple)' };
  if (b === 'MALL')         return { bg: 'var(--amber-bg)',  color: 'var(--amber)'  };
  if (b === 'MUS' || b === 'MÚS') return { bg: 'var(--green-bg)', color: 'var(--green)' };
  if (b === 'ESTIM')        return { bg: 'var(--blue-bg)',   color: 'var(--blue)'   };
  if (b === 'EVIP')         return { bg: 'var(--red-bg)',    color: 'var(--red)'    };
  if (b === 'SUP')          return { bg: 'var(--amber-bg)',  color: 'var(--amber)'  };
  if (b === 'EF')           return { bg: 'var(--green-bg)',  color: 'var(--green)'  };
  if (b === 'ANG')          return { bg: 'var(--blue-bg)',   color: 'var(--blue)'   };
  if (b === 'EIS')          return { bg: 'var(--amber-bg)',  color: 'var(--amber)'  };
  if (b === 'SIEI')         return { bg: '#FFF0F0',          color: '#C03030'       };
  if (b === 'SIEI+')        return { bg: '#FFF0F5',          color: '#D81B60'       };
  if (b === 'MESI')         return { bg: 'var(--blue-bg)',   color: 'var(--blue)'   };
  if (b === 'TEI')          return { bg: 'var(--green-bg)',  color: 'var(--green)'  };
  if (b === 'TUT')          return { bg: 'var(--bg-3)',      color: 'var(--ink-3)'  };
  return { bg: 'var(--blue-bg)', color: 'var(--blue)' };
}

function sortRivoGrupKey(g) {
  const v = (g || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/^i3/.test(v)) return '01' + v;
  if (/^i4/.test(v)) return '02' + v;
  if (/^i5/.test(v)) return '03' + v;
  if (/^1/.test(v))  return '04' + v;
  if (/^2/.test(v))  return '05' + v;
  if (/^3/.test(v))  return '06' + v;
  if (/^4/.test(v))  return '07' + v;
  if (/^5/.test(v))  return '08' + v;
  if (/^6/.test(v))  return '09' + v;
  return '99' + v;
}

function rolBadgeRivo(e, activeGrup) {
  // Tutor d'aquest grup concret → sense badge (és la referència del grup)
  if (e.rol === 'tutor' && e.grup_principal?.trim() === activeGrup) return null;

  // Badge explícit al nom: "Laura (SUP)" → extreu "SUP"
  const extracted = extractBadge(e.nom);
  if (extracted) return extracted;

  const gp = (e.grup_principal || '').trim();
  const gpL = gp.toLowerCase();

  // Detectar per grup_principal — molt més fiable que el rol
  if (/mesi\+?/i.test(gpL))  return 'MESI';
  if (/siei\+/i.test(gpL))   return 'SIEI+';
  if (/siei/i.test(gpL))     return 'SIEI';
  if (gpL === 'ef')           return 'EF';
  if (/^angl[eè]s$/i.test(gpL)) return 'ANG';
  if (/^m[uú]sica$/i.test(gpL)) return 'MÚS';
  if (gpL === 'ei suport')   return 'EIS';
  if (/mall/i.test(gpL))     return 'MALL';
  if (/estim/i.test(gpL))    return 'ESTIM';
  if (/evip/i.test(gpL))     return 'EVIP';
  if (/^tei/i.test(gpL))     return 'TEI';
  if (/^pae/i.test(gpL))     return 'PAE';

  // Fallback pel rol si el grup_principal no és informatiu
  if (e.rol === 'ee')         return 'SIEI';
  if (e.rol === 'msuport')    return 'SUP';
  if (e.rol === 'suport')     return 'SUP'; // suport a grup específic, no PAE
  if (['educador', 'vetllador'].includes(e.rol)) return 'PAE';
  if (e.rol === 'tei')        return 'TEI';
  if (e.rol === 'tutor')      return 'TUT';
  // teacher / especialista sense grup_principal → sense badge
  return null;
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

function RivoGrupsView({ docents, franjes, selectedGrup, onSelectGrup, onCellSave, configIntensiva, onConfigChange, api, showToast, escola }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editing, setEditing] = useState(null); // { nom, dia, fid, currentVal }
  const [editVal, setEditVal] = useState('');
  const [addingEntry, setAddingEntry] = useState(null); // { dia, fid }
  const [addVal, setAddVal] = useState('');
  // Currículum del grup
  const [curriculumEdit, setCurriculumEdit] = useState(false);
  const [curriculumText, setCurriculumText] = useState('');
  const [editDraft, setEditDraft] = useState(null); // objecte editable (còpia del JSON)
  const [curriculumSaving, setCurriculumSaving] = useState(false);
  const currFileRef = useRef(null);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showAlumnatIntensiva, setShowAlumnatIntensiva] = useState(false); // vista intensiva alumnat

  // Filtra sempre per escola per evitar que docents d'altres escoles apareguen
  const docentsPropis = useMemo(() =>
    escola?.id ? docents.filter(d => d.escola_id === escola.id) : docents,
    [docents, escola?.id]
  );

  const grups = useMemo(() => {
    const tutorGroups = docentsPropis
      .filter(d => d.rol === 'tutor' && d.grup_principal?.trim())
      .map(d => d.grup_principal.trim());
    return [...new Set(tutorGroups)].sort((a, b) =>
      sortRivoGrupKey(a).localeCompare(sortRivoGrupKey(b))
    );
  }, [docentsPropis]);

  const activeGrup = grups.includes(selectedGrup) ? selectedGrup : (grups[0] || '');

  useEffect(() => {
    if (grups.length && !grups.includes(selectedGrup)) onSelectGrup(grups[0]);
  }, [grups]);

  // Carregar horari alumnat quan canvia el grup
  useEffect(() => {
    const raw = configIntensiva?.grups_curriculum?.[activeGrup];
    const parsed = parseHorariAlumnat(raw);
    setCurriculumText(parsed ? JSON.stringify(parsed, null, 2) : (raw || ''));
    setCurriculumEdit(false);
    setShowAlumnatIntensiva(false);
  }, [activeGrup, configIntensiva]);

  async function guardarCurriculum() {
    setCurriculumSaving(true);
    try {
      const toSave = editDraft || (() => { try { const p = JSON.parse(curriculumText); return (p && typeof p === 'object') ? p : curriculumText; } catch { return curriculumText; } })();
      const nova_cfg = { ...(configIntensiva || {}), grups_curriculum: { ...(configIntensiva?.grups_curriculum || {}), [activeGrup]: toSave } };
      await api.saveConfigIntensiva(nova_cfg);
      onConfigChange?.(nova_cfg); // actualitza el pare perquè els canvis persisteixin entre grups
      if (editDraft) setCurriculumText(JSON.stringify(editDraft, null, 2));
      setEditDraft(null);
      showToast(`✓ Horari de l'alumnat de ${activeGrup} guardat`);
      setCurriculumEdit(false);
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setCurriculumSaving(false); }
  }

  async function pujarCurriculumPDF(file) {
    setLoadingCurriculum(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const mime = file.type || 'application/pdf';
      const isImage = mime.startsWith('image/');
      const fileBlock = isImage
        ? { type: 'image',    source: { type: 'base64', media_type: mime, data: base64 } }
        : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
      const schoolFranjes = franjes.filter(f => !f.lliure);
      const franjDesc = schoolFranjes.map(f => `${f.id}=${f.sub}`).join(', ');
      const diaTemplate = JSON.stringify(schoolFranjes.reduce((acc, f) => ({ ...acc, [f.id]: '' }), {}));
      const prompt = `Extreu l'horari setmanal de l'alumnat del grup ${activeGrup} d'aquest document.
Franges: ${franjDesc}
Cada cel·la ha de contenir el nom curt de la matèria o activitat (ex: "Matemàtiques","Llengua","Música","Ed.Física","Pati","Psicomotricitat","Anglès","Tutoria","Plàstica","Racons","Religió","Valors"). Si no consta o és lliure, posa "".
Retorna ÚNICAMENT JSON sense cap altre text:
{"dilluns":${diaTemplate},"dimarts":${diaTemplate},"dimecres":${diaTemplate},"dijous":${diaTemplate},"divendres":${diaTemplate}}`;
      const result = await callClaude([{ role: 'user', content: [fileBlock, { type: 'text', text: prompt }] }], 2500);
      const novaText = JSON.stringify(result, null, 2);
      setCurriculumText(novaText);
      // Auto-desa immediatament sense necessitat de prémer Editar+Guardar
      const nova_cfg = { ...(configIntensiva || {}), grups_curriculum: { ...(configIntensiva?.grups_curriculum || {}), [activeGrup]: result } };
      await api.saveConfigIntensiva(nova_cfg);
      onConfigChange?.(nova_cfg);
      setCurriculumEdit(false);
      showToast('✓ Horari extret i guardat. Prem ✏️ per corregir si cal.');
    } catch (e) { showToast('Error extraient horari: ' + e.message); }
    finally { setLoadingCurriculum(false); }
  }

  function startGroupEdit(nom, dia, fid, currentVal) {
    setAddingEntry(null);
    setEditing({ nom, dia, fid, currentVal });
    setEditVal(currentVal);
  }
  function commitGroupEdit() {
    if (!editing || !onCellSave) { setEditing(null); return; }
    const docent = docentsPropis.find(d => d.nom === editing.nom);
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
    const v = addVal.trim().toLowerCase();
    const target = docentsPropis.find(d =>
      d.nom.toLowerCase() === v ||
      initials(d.nom).toLowerCase() === v ||
      d.nom.toLowerCase().split(' ')[0] === v
    );
    if (target) onCellSave(target, addingEntry.dia, addingEntry.fid, activeGrup);
    setAddingEntry(null);
    setAddVal('');
  }

  const grupHorari = useMemo(() => {
    if (!activeGrup) return {};
    const result = {};
    DIES.forEach(dia => {
      result[dia] = {};
      franjes.forEach(f => {
        result[dia][f.id] = [];
        docentsPropis.forEach(d => {
          const val = d.horari?.[dia]?.[f.id] || '';
          if (matchesGrup(val, activeGrup)) {
            result[dia][f.id].push({ nom: d.nom, val, rol: d.rol, grup_principal: d.grup_principal });
          }
        });
      });
    });
    return result;
  }, [docentsPropis, franjes, activeGrup]);

  const tutor = useMemo(() =>
    docentsPropis.find(d => d.rol === 'tutor' && d.grup_principal?.trim() === activeGrup),
    [docentsPropis, activeGrup]
  );

  const visibleFranjes = franjes.filter(f => !f.lliure);
  const horaGroups = {};
  visibleFranjes.forEach(f => {
    if (!horaGroups[f.hora]) horaGroups[f.hora] = [];
    horaGroups[f.hora].push(f);
  });

  const thS = { padding: '6px 8px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textAlign: 'center', whiteSpace: 'nowrap' };
  const tdS = { padding: '4px 6px', border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 10, color: 'var(--ink-3)', whiteSpace: 'nowrap' };

  const renderEntry = (e, dia, fid) => {
    const badge = rolBadgeRivo(e, activeGrup);
    const isEditing = isEditMode && editing?.nom === e.nom && editing?.dia === dia && editing?.fid === fid;
    if (isEditing) {
      return (
        <input
          key={e.nom}
          autoFocus
          value={editVal}
          onChange={ev => setEditVal(ev.target.value)}
          onBlur={commitGroupEdit}
          onKeyDown={ev => { if (ev.key === 'Enter') commitGroupEdit(); if (ev.key === 'Escape') setEditing(null); }}
          style={{ width: 72, border: 'none', outline: '2px solid var(--blue)', borderRadius: 2, background: 'var(--surface)', fontFamily: 'inherit', fontSize: 9, textAlign: 'center', padding: '2px', color: 'var(--ink)' }}
        />
      );
    }
    if (badge) {
      const { bg, color } = badgeStyle(badge);
      return (
        <div key={e.nom} title={e.nom}
          onClick={() => isEditMode && startGroupEdit(e.nom, dia, fid, e.val)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 2, lineHeight: 1.3, whiteSpace: 'nowrap', cursor: isEditMode ? 'text' : 'default' }}>
          <span style={{ fontSize: 9, color: 'var(--ink-2)', fontWeight: 600 }}>{initials(e.nom)}</span>
          <span style={{ fontSize: 7.5, background: bg, color, borderRadius: 3, padding: '0 2px', fontWeight: 700, flexShrink: 0 }}>{badge}</span>
        </div>
      );
    }
    return (
      <div key={e.nom} title={e.nom}
        onClick={() => isEditMode && startGroupEdit(e.nom, dia, fid, e.val)}
        style={{ fontSize: 9.5, color: 'var(--ink-2)', fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap', cursor: isEditMode ? 'text' : 'default' }}>
        {e.nom.split(' ')[0]}
      </div>
    );
  };

  if (!activeGrup && docents.length === 0) {
    return (
      <div className="card" style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
        No hi ha docents carregats. Primer puja els horaris des de la vista Personal.
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h3>Selecciona el grup</h3></div>
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {grups.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Sense grups. Comprova que els tutors tenen un grup assignat a la vista Personal.</span>
          ) : grups.map(g => (
            <button
              key={g}
              className="btn btn-sm"
              style={activeGrup === g
                ? { background: 'var(--ink)', color: '#fff', border: 'none', fontWeight: 700, minWidth: 44 }
                : { background: 'var(--bg-2)', borderColor: 'var(--border)', minWidth: 44 }
              }
              onClick={() => onSelectGrup(g)}
            >{g}</button>
          ))}
        </div>
      </div>

      {activeGrup && (
        <div className="card">
          <div className="card-head">
            <h3>Horari del {activeGrup}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {tutor && <span className="sp sp-green">Tutor/a: {tutor.nom.split(' ')[0]}</span>}
              {onCellSave && (
                <button
                  className="btn btn-sm"
                  style={isEditMode
                    ? { background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green)', fontSize: 12, fontWeight: 600 }
                    : { background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'var(--blue)', fontSize: 12, fontWeight: 600 }
                  }
                  onClick={() => { setIsEditMode(o => !o); setEditing(null); setAddingEntry(null); }}
                >{isEditMode ? '✓ Fet' : '✏️ Editar'}</button>
              )}
              <span className="sp sp-blue">Professionals al grup per franja</span>
            </div>
          </div>
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
                        const primaris = entries.filter(e => !rolBadgeRivo(e, activeGrup));
                        const suports  = entries.filter(e =>  rolBadgeRivo(e, activeGrup));
                        const hasCoverage = entries.length > 0;
                        const isAdding = addingEntry?.dia === dia && addingEntry?.fid === f.id;
                        return (
                          <td key={dia} style={{
                            padding: '3px 4px', border: '1px solid var(--border)',
                            background: hasCoverage ? 'var(--blue-bg)' : 'var(--bg)',
                            textAlign: 'center', minWidth: 80, overflow: 'visible',
                          }}>
                            {hasCoverage && (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                {primaris.map(e => renderEntry(e, dia, f.id))}
                                {suports.map(e => renderEntry(e, dia, f.id))}
                              </div>
                            )}
                            {isAdding ? (
                              <>
                                <input
                                  autoFocus
                                  list="rivo-grups-docents-list"
                                  value={addVal}
                                  onChange={ev => setAddVal(ev.target.value)}
                                  onBlur={commitAddEntry}
                                  onKeyDown={ev => { if (ev.key === 'Enter') commitAddEntry(); if (ev.key === 'Escape') { setAddingEntry(null); setAddVal(''); } }}
                                  placeholder="Nom..."
                                  style={{ width: 72, border: 'none', outline: '2px solid var(--green)', borderRadius: 2, background: 'var(--surface)', fontFamily: 'inherit', fontSize: 9, textAlign: 'center', padding: '2px', color: 'var(--ink)' }}
                                />
                                <datalist id="rivo-grups-docents-list">
                                  {docentsPropis.map(d => <option key={d.id} value={d.nom} />)}
                                </datalist>
                              </>
                            ) : (
                              <span
                                onClick={() => startAddEntry(dia, f.id)}
                                style={{ fontSize: hasCoverage ? 9 : 12, color: hasCoverage ? 'var(--ink-4)' : 'var(--ink-3)', cursor: 'pointer', display: 'block', padding: '1px 0', lineHeight: 1, opacity: hasCoverage ? 0.4 : 0.6 }}
                                title="Afegir professional"
                              >{hasCoverage ? '+' : '+'}</span>
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
      )}

      {/* Horari de l'alumnat (Rivo) */}
      {activeGrup && (
        <div
          className="card"
          style={{ marginTop: 14, transition: 'outline 0.1s', outline: dragOver ? '2px dashed var(--blue)' : '2px solid transparent', background: dragOver ? 'var(--blue-bg)' : undefined }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) pujarCurriculumPDF(f); }}
        >
          <div className="card-head">
            <h3>📅 Horari de l'alumnat · {activeGrup}</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Toggle Normal / Intensiva per a l'horari de l'alumnat */}
              {(() => { const hd = parseHorariAlumnat(curriculumText); return hd && !curriculumEdit ? (
                <div style={{ display: 'flex', gap: 0, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                  <button style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, background: !showAlumnatIntensiva ? 'var(--ink)' : 'transparent', color: !showAlumnatIntensiva ? '#fff' : 'var(--ink-3)', transition: 'all .1s' }} onClick={() => setShowAlumnatIntensiva(false)}>📅 Normal</button>
                  <button style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, background: showAlumnatIntensiva ? 'var(--amber)' : 'transparent', color: showAlumnatIntensiva ? '#fff' : 'var(--ink-3)', transition: 'all .1s' }} onClick={() => setShowAlumnatIntensiva(true)}>🌅 Intensiva</button>
                </div>
              ) : null; })()}
              <input ref={currFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pujarCurriculumPDF(f); e.target.value = ''; }} />
              <button className="btn btn-sm" style={{ fontSize: 11, background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'var(--blue)' }} onClick={() => currFileRef.current?.click()} disabled={loadingCurriculum}>
                {loadingCurriculum ? '⏳ Extraient...' : '📎 Pujar PDF/Word'}
              </button>
              {!curriculumEdit && <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={() => { const d = parseHorariAlumnat(curriculumText); setEditDraft(d ? JSON.parse(JSON.stringify(d)) : {}); setCurriculumEdit(true); }}>✏️ Editar</button>}
            </div>
          </div>
          <div style={{ padding: '12px 16px' }}>
            {dragOver ? (
              <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>📂 Deixa anar el fitxer per pujar-lo</div>
            ) : curriculumEdit ? (
              <>
                <HorariAlumnatTable
                  data={editDraft || {}}
                  franjes={franjes}
                  onCellSave={(dia, fid, val) => setEditDraft(prev => ({ ...prev, [dia]: { ...(prev?.[dia] || {}), [fid]: val } }))}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#fff', border: 'none' }} onClick={guardarCurriculum} disabled={curriculumSaving}>{curriculumSaving ? 'Guardant...' : '💾 Guardar'}</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setEditDraft(null); setCurriculumEdit(false); }}>Cancel·lar</button>
                </div>
              </>
            ) : (() => {
              const horariData = parseHorariAlumnat(curriculumText);
              if (!horariData) return curriculumText
                ? <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{curriculumText}</div>
                : <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>
                    Cap horari de l'alumnat pujat per a {activeGrup}.<br />
                    <span style={{ fontSize: 11 }}>Puja el PDF o Word de l'horari dels nens, o arrossega'l aquí.</span>
                  </div>;
              const franjesAlumnat = showAlumnatIntensiva
                ? franjes.filter(f => !f.lliure && f.hora !== 'Tarda')
                : franjes;
              return (
                <>
                  {showAlumnatIntensiva && (
                    <div style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600, marginBottom: 8, padding: '4px 8px', background: 'var(--amber-bg)', borderRadius: 5, display: 'inline-block' }}>
                      🌅 Jornada intensiva — sense tarda
                    </div>
                  )}
                  <HorariAlumnatTable data={horariData} franjes={franjesAlumnat} />
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}

function GrupsView({ docents, franjes, selectedGrup, onSelectGrup, onCellSave, configIntensiva, onConfigChange, api, showToast, escola }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editing, setEditing] = useState(null); // { nom, dia, fid, currentVal }
  const [editVal, setEditVal] = useState('');
  // Currículum del grup
  const [curriculumEdit, setCurriculumEdit] = useState(false);
  const [curriculumText, setCurriculumText] = useState('');
  const [editDraft, setEditDraft] = useState(null);
  const [curriculumSaving, setCurriculumSaving] = useState(false);
  const currFileRef = useRef(null);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [addingEntry, setAddingEntry] = useState(null); // { dia, fid }
  const [addVal, setAddVal] = useState('');
  const [showAlumnatIntensiva, setShowAlumnatIntensiva] = useState(false); // vista intensiva alumnat

  function startGroupEdit(nom, dia, fid, currentVal) {
    setAddingEntry(null);
    setEditing({ nom, dia, fid, currentVal });
    setEditVal(currentVal);
  }
  // Filtra docents per escola per evitar que docents d'altres escoles apareguen
  const docentsPropis = useMemo(() =>
    escola?.id ? docents.filter(d => d.escola_id === escola.id) : docents,
    [docents, escola?.id]
  );

  function commitGroupEdit() {
    if (!editing || !onCellSave) { setEditing(null); return; }
    const docent = docentsPropis.find(d => d.nom === editing.nom);
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
    const target = docentsPropis.find(d =>
      d.nom.toLowerCase() === addVal.toLowerCase() ||
      oriolInitials(d.nom).toLowerCase() === addVal.toLowerCase().trim()
    );
    if (target) onCellSave(target, addingEntry.dia, addingEntry.fid, selectedGrup);
    setAddingEntry(null);
    setAddVal('');
  }

  // Carregar horari alumnat quan canvia el grup seleccionat
  useEffect(() => {
    const raw = configIntensiva?.grups_curriculum?.[selectedGrup];
    const parsed = parseHorariAlumnat(raw);
    setCurriculumText(parsed ? JSON.stringify(parsed, null, 2) : (raw || ''));
    setCurriculumEdit(false);
    setShowAlumnatIntensiva(false);
  }, [selectedGrup, configIntensiva]);

  async function guardarCurriculum() {
    setCurriculumSaving(true);
    try {
      const toSave = editDraft || (() => { try { const p = JSON.parse(curriculumText); return (p && typeof p === 'object') ? p : curriculumText; } catch { return curriculumText; } })();
      const nova_cfg = { ...(configIntensiva || {}), grups_curriculum: { ...(configIntensiva?.grups_curriculum || {}), [selectedGrup]: toSave } };
      await api.saveConfigIntensiva(nova_cfg);
      onConfigChange?.(nova_cfg);
      if (editDraft) setCurriculumText(JSON.stringify(editDraft, null, 2));
      setEditDraft(null);
      showToast(`✓ Horari de l'alumnat de ${selectedGrup} guardat`);
      setCurriculumEdit(false);
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setCurriculumSaving(false); }
  }

  async function pujarCurriculumPDF(file) {
    setLoadingCurriculum(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const mime = file.type || 'application/pdf';
      const isImage = mime.startsWith('image/');
      const fileBlock = isImage
        ? { type: 'image',    source: { type: 'base64', media_type: mime, data: base64 } }
        : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
      const schoolFranjes = franjes.filter(f => !f.lliure);
      const franjDesc = schoolFranjes.map(f => `${f.id}=${f.sub}`).join(', ');
      const diaTemplate = JSON.stringify(schoolFranjes.reduce((acc, f) => ({ ...acc, [f.id]: '' }), {}));
      const prompt = `Extreu l'horari setmanal de l'alumnat del grup ${selectedGrup} d'aquest document.
Franges: ${franjDesc}
Cada cel·la ha de contenir el nom curt de la matèria o activitat (ex: "Matemàtiques","Llengua","Música","Ed.Física","Pati","Psicomotricitat","Anglès","Tutoria","Plàstica","Racons","Religió","Valors"). Si no consta o és lliure, posa "".
Retorna ÚNICAMENT JSON sense cap altre text:
{"dilluns":${diaTemplate},"dimarts":${diaTemplate},"dimecres":${diaTemplate},"dijous":${diaTemplate},"divendres":${diaTemplate}}`;
      const result = await callClaude([{ role: 'user', content: [fileBlock, { type: 'text', text: prompt }] }], 2500);
      const novaText = JSON.stringify(result, null, 2);
      setCurriculumText(novaText);
      const nova_cfg = { ...(configIntensiva || {}), grups_curriculum: { ...(configIntensiva?.grups_curriculum || {}), [selectedGrup]: result } };
      await api.saveConfigIntensiva(nova_cfg);
      onConfigChange?.(nova_cfg);
      setCurriculumEdit(false);
      showToast('✓ Horari extret i guardat. Prem ✏️ per corregir si cal.');
    } catch (e) { showToast('Error extraient horari: ' + e.message); }
    finally { setLoadingCurriculum(false); }
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
            {tutor && <span className="sp sp-blue">Tutor/a: {tutor.nom.split(' ')[0]}</span>}
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
                                    {docentsPropis.map(d => <option key={d.id} value={d.nom} />)}
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

      {/* Horari de l'alumnat */}
      <div
        className="card"
        style={{ marginTop: 14, transition: 'outline 0.1s', outline: dragOver ? '2px dashed var(--blue)' : '2px solid transparent', background: dragOver ? 'var(--blue-bg)' : undefined }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) pujarCurriculumPDF(f); }}
      >
        <div className="card-head">
          <h3>📅 Horari de l'alumnat · {selectedGrup}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Toggle Normal / Intensiva per a l'horari de l'alumnat */}
            {(() => { const hd = parseHorariAlumnat(curriculumText); return hd && !curriculumEdit ? (
              <div style={{ display: 'flex', gap: 0, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                <button style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, background: !showAlumnatIntensiva ? 'var(--ink)' : 'transparent', color: !showAlumnatIntensiva ? '#fff' : 'var(--ink-3)', transition: 'all .1s' }} onClick={() => setShowAlumnatIntensiva(false)}>📅 Normal</button>
                <button style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, background: showAlumnatIntensiva ? 'var(--amber)' : 'transparent', color: showAlumnatIntensiva ? '#fff' : 'var(--ink-3)', transition: 'all .1s' }} onClick={() => setShowAlumnatIntensiva(true)}>🌅 Intensiva</button>
              </div>
            ) : null; })()}
            <input ref={currFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pujarCurriculumPDF(f); e.target.value = ''; }} />
            <button className="btn btn-sm" style={{ fontSize: 11, background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'var(--blue)' }} onClick={() => currFileRef.current?.click()} disabled={loadingCurriculum}>
              {loadingCurriculum ? '⏳ Extraient...' : '📎 Pujar PDF/Word'}
            </button>
            {!curriculumEdit && <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={() => { const d = parseHorariAlumnat(curriculumText); setEditDraft(d ? JSON.parse(JSON.stringify(d)) : {}); setCurriculumEdit(true); }}>✏️ Editar</button>}
          </div>
        </div>
        <div style={{ padding: '12px 16px' }}>
          {dragOver ? (
            <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>📂 Deixa anar el fitxer per pujar-lo</div>
          ) : curriculumEdit ? (
            <>
              <HorariAlumnatTable
                data={editDraft || {}}
                franjes={franjes}
                onCellSave={(dia, fid, val) => setEditDraft(prev => ({ ...prev, [dia]: { ...(prev?.[dia] || {}), [fid]: val } }))}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#fff', border: 'none' }} onClick={guardarCurriculum} disabled={curriculumSaving}>{curriculumSaving ? 'Guardant...' : '💾 Guardar'}</button>
                <button className="btn btn-sm btn-ghost" onClick={() => { setEditDraft(null); setCurriculumEdit(false); }}>Cancel·lar</button>
              </div>
            </>
          ) : (() => {
            const horariData = parseHorariAlumnat(curriculumText);
            if (!horariData) return curriculumText
              ? <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{curriculumText}</div>
              : <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>
                  Cap horari de l'alumnat pujat per a {selectedGrup}.<br />
                  <span style={{ fontSize: 11 }}>Puja el PDF o Word de l'horari dels nens, o arrossega'l aquí.</span>
                </div>;
            const franjesAlumnat = showAlumnatIntensiva
              ? franjes.filter(f => !f.lliure && f.hora !== 'Tarda')
              : franjes;
            return (
              <>
                {showAlumnatIntensiva && (
                  <div style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600, marginBottom: 8, padding: '4px 8px', background: 'var(--amber-bg)', borderRadius: 5, display: 'inline-block' }}>
                    🌅 Jornada intensiva — sense tarda
                  </div>
                )}
                <HorariAlumnatTable data={horariData} franjes={franjesAlumnat} />
              </>
            );
          })()}
        </div>
      </div>
    </>
  );
}
