import { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { FRANJES_ORIOL } from '../../../lib/constants';
import Spinner from '../../../components/Spinner';

// ── Constants ────────────────────────────────────────────────────────────────
const DIES_CA  = ['DIUMENGE','DILLUNS','DIMARTS','DIMECRES','DIJOUS','DIVENDRES','DISSABTE'];
const DIES_KEY = ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'];
const ESP_COLORS = ['#E8D5C4','#D9C8E8','#D4E6F1','#D5E8D5','#F1D4D4','#F5EDD4','#E8E8D4','#F5D4EC'];

function avuiDDMMYYYY() {
  const t = new Date();
  return `${String(t.getDate()).padStart(2,'0')}-${String(t.getMonth()+1).padStart(2,'0')}-${t.getFullYear()}`;
}

// ── Helpers de franges ────────────────────────────────────────────────────────
function franjaInici(fid) {
  const f = FRANJES_ORIOL.find(x => x.id === fid);
  return f?.sub?.split('–')[0]?.trim() || '';
}
function franjaFi(fid) {
  const f = FRANJES_ORIOL.find(x => x.id === fid);
  return f?.sub?.split('–')[1]?.split('·')[0]?.trim() || '';
}
function franjaOrder(fid) {
  return FRANJES_ORIOL.findIndex(f => f.id === fid);
}
function horaRange(franjaIds) {
  if (!franjaIds.length) return '';
  const sorted = [...franjaIds].sort((a,b) => franjaOrder(a) - franjaOrder(b));
  return `${franjaInici(sorted[0])}h a ${franjaFi(sorted[sorted.length-1])}h`;
}

// Agrupa IDs de franja consecutius amb la mateixa activitat en blocs
function aggregateSlots(slots, labelFn) {
  // slots: [{fid, activitat}] sorted by franja order
  const result = [];
  let current = null;
  for (const s of slots) {
    if (current && s.activitat === current.activitat &&
        franjaOrder(s.fid) === franjaOrder(current.lastFid) + 1) {
      current.fids.push(s.fid);
      current.lastFid = s.fid;
    } else {
      if (current) result.push({ hora: horaRange(current.fids), activitat: labelFn ? labelFn(current.activitat) : current.activitat });
      current = { fids: [s.fid], lastFid: s.fid, activitat: s.activitat };
    }
  }
  if (current) result.push({ hora: horaRange(current.fids), activitat: labelFn ? labelFn(current.activitat) : current.activitat });
  return result;
}

// ── Derivació automàtica ──────────────────────────────────────────────────────

// Extreu el primer grup (G1-G14, MxI, CEEPSIR) d'un valor de horari qualsevol.
// Funciona per a tots els formats: "Suport G13", "G13 Suport", "G8 · Suport", "G14. Suport", "G7. SUPORT", etc.
function extractGrupFromHorari(val) {
  if (!val) return null;
  const m = (val || '').match(/\b(G\d{1,2}|MxI|CEEPSIR)\b/i);
  return m ? m[1].toUpperCase() : null;
}

function getEtapa(grup) {
  const n = parseInt(grup.replace(/\D/g,'')) || 0;
  if (grup.toLowerCase().includes('mxi')) return 'INFANTIL/PRIMÀRIA';
  if (!n) return 'INFANTIL/PRIMÀRIA';
  return n >= 7 ? 'SECUNDÀRIA' : 'INFANTIL/PRIMÀRIA';
}

function buildTaulaGrups(cobertures) {
  // Cada cobertura: {grup, franja, docent_cobrint_nom, docent_absent_nom}
  // Agrupar per grup → per (grup, set_cobrint) → franges consecutives
  const map = new Map(); // `${grup}|${cobrint_sorted}` → {grup, cobrint, fids: Set}

  for (const c of cobertures) {
    // Quan grup és buit (especialistes itinerants), usem les inicials de l'absent com a referència
    const grup = c.grup || c.docent_absent_nom?.split(' ')[0] || null;
    const nom  = (c.docent_cobrint_nom || '').split(' ')[0];
    const fid  = c.franja;
    if (!grup || !fid) continue;

    // Clau provisonal per grup (al final agrupem per grup+cobrint)
    const cellKey = `${grup}||${fid}`;
    if (!map.has(cellKey)) map.set(cellKey, { grup, fid, suports: new Set() });
    if (nom) map.get(cellKey).suports.add(nom);
  }

  // Ara agrupem per grup i construïm blocs consecutius
  const byGrup = new Map();
  for (const [, cell] of map) {
    if (!byGrup.has(cell.grup)) byGrup.set(cell.grup, []);
    byGrup.get(cell.grup).push({
      fid: cell.fid,
      fidIdx: franjaOrder(cell.fid),
      suports: [...cell.suports].sort().join('/'),
    });
  }

  const rows = [];
  for (const [grup, cells] of byGrup) {
    const sorted = cells.sort((a,b) => a.fidIdx - b.fidIdx);
    // Agrupa franges consecutives amb mateixos suports
    let current = null;
    for (const c of sorted) {
      if (current && c.suports === current.suports && c.fidIdx === current.lastIdx + 1) {
        current.fids.push(c.fid); current.lastIdx = c.fidIdx;
      } else {
        if (current) rows.push({ etapa: getEtapa(grup), grup, hora: horaRange(current.fids), suport: current.suports });
        current = { fids: [c.fid], lastIdx: c.fidIdx, suports: c.suports };
      }
    }
    if (current) rows.push({ etapa: getEtapa(grup), grup, hora: horaRange(current.fids), suport: current.suports });
  }

  return rows.sort((a,b) => {
    const e = { 'INFANTIL/PRIMÀRIA': 0, 'SECUNDÀRIA': 1 };
    const ed = (e[a.etapa]||0) - (e[b.etapa]||0);
    if (ed) return ed;
    return (parseInt(a.grup.replace(/\D/g,''))||0) - (parseInt(b.grup.replace(/\D/g,''))||0);
  });
}

function buildTaulaEspecialistes(cobertures, docents, todayDia, absentsAvui) {
  // Per cada docent absent: quines franges cobreix l'absència?
  // '*' = tot el dia (quan franges és buit o null)
  const absentFranges = new Map();
  for (const a of (absentsAvui || [])) {
    if (!absentFranges.has(a.docent_nom)) absentFranges.set(a.docent_nom, new Set());
    const s = absentFranges.get(a.docent_nom);
    if (!a.franges?.length) s.add('*'); else a.franges.forEach(f => s.add(f));
  }
  const isAbsent = (nom, fid) => {
    const s = absentFranges.get(nom);
    return !!s && (s.has('*') || s.has(fid));
  };

  const cobrintNoms = [...new Set(cobertures.map(c => c.docent_cobrint_nom).filter(Boolean))];
  const normStr = s => (s || '').toLowerCase().replace(/\s+/g, '');

  return cobrintNoms.map((nom, idx) => {
    const coberturesD = cobertures.filter(c => c.docent_cobrint_nom === nom);
    // Nom de cobertura pot ser "A.R" mentre a la BD és "A.R (MEE)" — cerca per prefix
    const docent = docents?.find(d => d.nom === nom || d.nom.startsWith(nom + ' '));

    const slotMap = new Map();

    // Horari normal (sense lliures i trivials)
    if (docent?.horari?.[todayDia]) {
      for (const [fid, val] of Object.entries(docent.horari[todayDia])) {
        if (!val) continue;
        const vl = val.toLowerCase().trim();
        if (vl === 'lliure' || vl === 'libre' || vl === '' || vl === 'tp' || vl === '_') continue;
        slotMap.set(fid, val);
      }
    }

    // Cobertures del dia (sobreescriuen horari normal per aquella franja)
    for (const c of coberturesD) {
      if (!c.franja) continue;
      const activitat = c.grup || (c.docent_absent_nom ? `Cob. ${c.docent_absent_nom.split(' ')[0]}` : 'Cobertura');
      slotMap.set(c.franja, activitat);
    }

    if (!slotMap.size) return null;

    const cobFranges = new Set(coberturesD.map(c => c.franja).filter(Boolean));
    // Detectem si és tutor: grup_principal conté un grup real (G1-G14, MxI)
    const grupTutor = extractGrupFromHorari(docent?.grup_principal || '');

    function labelSlot(fid, rawVal) {
      const vl = (rawVal || '').toLowerCase().trim();

      // Pati
      if (vl.includes('patia') || vl === 'pati a' || vl === 'pati primaria') return 'PATI PRIMÀRIA';
      if (vl.includes('patib') || vl === 'pati b' || vl === 'pati secundaria') return 'PATI SECUNDÀRIA';

      // Franja de cobertura: extreure grup del valor o mostrar-lo net
      if (cobFranges.has(fid)) {
        return extractGrupFromHorari(rawVal) || rawVal.split('·')[0].split('/')[0].trim().toUpperCase();
      }

      // Horari normal: extreure grup del valor (funciona per a tots els formats)
      const grup = extractGrupFromHorari(rawVal);
      if (grup) return grup;

      // No s'ha trobat grup en el valor:

      if (grupTutor) {
        // El tutor SEMPRE és en el seu propi grup. El valor mostra qui entra de suport.
        // Detectem noms de persona (patró "X.X" o "X. X")
        const anyNames = /\w+\.\s*\w+/i.test(rawVal);
        if (!anyNames) return grupTutor; // cap suport definit per aquesta franja

        // Comprovem quins dels docents esmentats estan presents avui
        const rawNorm = normStr(rawVal);
        const supportPresent = docents.filter(d => {
          if (d.nom === docent?.nom) return false;
          return rawNorm.includes(normStr(d.nom)) && !isAbsent(d.nom, fid);
        });

        if (!supportPresent.length) return `${grupTutor} SOL/A`;
        const labels = supportPresent.map(d => d.nom.split(' ')[0]).join('/');
        return `${grupTutor} + ${labels}`;
      }

      // Especialista sense grup determinat (ex. "SUPORT" sol): saltem la franja
      return null;
    }

    // Aplica labelSlot a cada slot i filtra els null
    const slots = [...slotMap.entries()]
      .map(([fid, activitat]) => {
        const label = labelSlot(fid, activitat);
        return label ? { fid, activitat: label, fidIdx: franjaOrder(fid) } : null;
      })
      .filter(s => s && s.fidIdx >= 0)
      .sort((a,b) => a.fidIdx - b.fidIdx);

    if (!slots.length) return null;

    // Agregar consecutius amb la mateixa etiqueta
    const horaris = aggregateSlots(slots, v => v);

    // Color del bloc: determinat per l'etapa dels grups que cobreix
    const grupsCoberts = coberturesD.map(c => c.grup).filter(g => g && g !== 'Suport' && !g.startsWith('Cob.'));
    let colorFons;
    if (grupsCoberts.length) {
      const nSec = grupsCoberts.filter(g => getEtapa(g) === 'SECUNDÀRIA').length;
      colorFons = nSec > grupsCoberts.length / 2 ? COLOR_SEC : COLOR_INF_PRI;
    } else {
      colorFons = ESP_COLORS[idx % ESP_COLORS.length];
    }

    const nomCurt = nom.split(' ')[0].toUpperCase();
    return { nom: nomCurt, color_fons: colorFons, horaris };
  }).filter(Boolean);
}

// Colors per etapa — especialistes
const COLOR_INF_PRI = '#D4EDD0'; // verd clar  — Infantil/Primària
const COLOR_SEC     = '#FFE4C0'; // taronja clar — Secundària

// ── Colors pels practicants ───────────────────────────────────────────────────
const PRAC_COLORS = ['#E8D5C4','#D9C8E8','#D4E6F1'];

function PracticantsEditor({ items, setItems }) {
  function add() { setItems([...items, { nom: '', color_fons: '#E8D5C4', horaris: [] }]); }
  function del(i) { setItems(items.filter((_,idx) => idx !== i)); }
  function upd(i,k,v) { setItems(items.map((p,idx) => idx===i ? {...p,[k]:v} : p)); }
  function addH(pi) { setItems(items.map((p,idx) => idx!==pi ? p : {...p, horaris:[...(p.horaris||[]),{hora:'',activitat:''}]})); }
  function delH(pi,hi) { setItems(items.map((p,idx) => idx!==pi ? p : {...p, horaris:p.horaris.filter((_,i) => i!==hi)})); }
  function updH(pi,hi,k,v) { setItems(items.map((p,idx) => idx!==pi ? p : {...p, horaris:p.horaris.map((h,i) => i!==hi ? h : {...h,[k]:v})})); }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {items.map((p, pi) => (
        <div key={pi} style={{ border:'1px solid var(--border)', borderRadius:6, overflow:'hidden' }}>
          <div style={{ display:'flex', gap:8, padding:'8px 10px', background: p.color_fons, alignItems:'center' }}>
            <input value={p.nom} onChange={e => upd(pi,'nom',e.target.value)} placeholder="Nom practicant"
              style={{ flex:1, fontWeight:700, fontSize:13, background:'transparent', border:'none', outline:'none', padding:0 }} />
            <div style={{ display:'flex', gap:4, flexShrink:0 }}>
              {PRAC_COLORS.map(c => (
                <button key={c} onClick={() => upd(pi,'color_fons',c)} title={c}
                  style={{ width:18, height:18, borderRadius:'50%', background:c, padding:0, cursor:'pointer',
                    border: p.color_fons===c ? '2px solid #444' : '1px solid #bbb' }} />
              ))}
            </div>
            <button onClick={() => del(pi)} style={{ background:'none', border:'none', color:'#b00', cursor:'pointer', fontSize:15, padding:0 }}>✕</button>
          </div>
          <div style={{ padding:'8px 10px', display:'flex', flexDirection:'column', gap:5 }}>
            {(p.horaris||[]).map((h,hi) => (
              <div key={hi} style={{ display:'flex', gap:5, alignItems:'center' }}>
                <input className="f-ctrl" value={h.hora} onChange={e => updH(pi,hi,'hora',e.target.value)}
                  placeholder="9:30h a 11h" style={{ flex:'0 0 130px', fontSize:12 }} />
                <input className="f-ctrl" value={h.activitat} onChange={e => updH(pi,hi,'activitat',e.target.value)}
                  placeholder="G8 / PATI SECUNDÀRIA / ..." style={{ flex:1, fontSize:12 }} />
                <button onClick={() => delH(pi,hi)} style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:14, padding:'0 4px' }}>✕</button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ alignSelf:'flex-start', fontSize:11, marginTop:2 }} onClick={() => addH(pi)}>
              + Afegir franja
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" style={{ alignSelf:'flex-start', fontSize:12 }} onClick={add}>
        + Afegir practicant/a
      </button>
    </div>
  );
}

// ── Pàgina principal ──────────────────────────────────────────────────────────

export default function OriolPDFPage() {
  const { api, docents, showToast, coverageAppliedAt } = useApp();
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);

  // Dades llegides automàticament
  const [absentsText,  setAbsentsText]  = useState('');
  const [absentsCount, setAbsentsCount] = useState(0);
  const [baixes,       setBaixes]       = useState([]);
  const [reunionsText, setReunionsText] = useState('');
  const [ceepsirText,  setCeepsirText]  = useState('');

  // Derivades automàticament
  const [taulaGrups, setTaulaGrups] = useState([]);
  const [taulaEsp,   setTaulaEsp]   = useState([]);

  // Entrada manual mínima
  const [lema,      setLema]      = useState('');
  const [taulaPrac, setTaulaPrac] = useState([]);

  const avui = new Date().toISOString().split('T')[0];
  const today = new Date();
  const todayDia = DIES_KEY[today.getDay()];

  useEffect(() => { if (api && docents.length > 0) load(); }, [api, docents.length, coverageAppliedAt]);

  async function load() {
    setLoading(true);
    try {
      const [diariRes, cobRes, absRes] = await Promise.all([
        api.getOriolDiari(),
        api.getCoberturasAvui(),
        api.getAbsenciesAvui(),
      ]);
      const d   = diariRes?.[0] || {};
      const cob = cobRes || [];

      // Absents: sempre llegit de la taula d'absències (font de veritat)
      // Ignora el text guardat manualment — aquest pot ser parcial o desactualitzat
      const SCHOOL_F = FRANJES_ORIOL.filter(f => !f.lliure);
      const liveAbsents = (absRes || []).filter(a => a.estat !== 'arxivat');
      setAbsentsCount(liveAbsents.length);
      const autoAbsents = liveAbsents.map(a => {
        const isFullDay = (a.franges?.length || 0) >= SCHOOL_F.length;
        const timeRange = !isFullDay && a.franges?.length ? horaRange(a.franges) : '';
        return `• ${a.docent_nom} — ${a.motiu || 'Absència'}${timeRange ? ` (${timeRange})` : ''}`;
      }).join('\n');
      setAbsentsText(autoAbsents);
      setBaixes(d.oriol_baixes || []);
      setReunionsText(d.oriol_reunions?.data === avui ? (d.oriol_reunions?.text || '') : '');
      setCeepsirText(d.oriol_ceepsir?.data === avui ? (d.oriol_ceepsir?.text || '') : '');
      setLema(d.oriol_lema || '');

      // Derivació automàtica de les taules
      setTaulaGrups(buildTaulaGrups(cob));
      setTaulaEsp(buildTaulaEspecialistes(cob, docents, todayDia, liveAbsents));

      // Practicants: llegits de BD o buits
      const pdfData = d.oriol_pdf_data;
      setTaulaPrac(pdfData?.taula_practicants || []);
    } catch(e) { showToast('Error carregant dades: ' + e.message); }
    finally { setLoading(false); }
  }

  async function handleGenerarPDF() {
    setGenerating(true);
    try {
      // Desa lema i practicants
      await Promise.all([
        api.saveOriolLema(lema),
        api.saveOriolPdfData({ data: avui, taula_practicants: taulaPrac }),
      ]);

      const pdfData = {
        metadata: { dia_setmana: DIES_CA[today.getDay()], data: avuiDDMMYYYY(), lema },
        absents_text:        absentsText,
        baixes,
        reunions_text:       reunionsText,
        ceepsir_text:        ceepsirText,
        taula_grups:         taulaGrups,
        taula_especialistes: taulaEsp,
        taula_practicants:   taulaPrac,
      };

      const { generarOriolPDF } = await import('../../../lib/oriol-pdf');
      const doc = await generarOriolPDF(pdfData);
      doc.save(`MODIFICACIONS_HORARIES_${avuiDDMMYYYY()}.pdf`);
      showToast('✓ PDF generat i descarregat');
    } catch(e) {
      showToast('Error generant PDF: ' + e.message);
      console.error(e);
    } finally { setGenerating(false); }
  }

  if (loading) return <div style={{ padding:40, textAlign:'center' }}><Spinner /></div>;

  const nCob = taulaGrups.length;
  const nEsp = taulaEsp.length;

  return (
    <>
      <div className="page-hdr" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1>Generar PDF diari</h1>
          <p>Document "Modificacions Horàries" · Ca n'Oriol</p>
        </div>
        <button
          className="btn btn-full"
          style={{ padding:'12px 20px', background:'#5B4B8A', color:'#fff', border:'none', fontSize:14, fontWeight:700, borderRadius:'var(--r)', opacity: generating ? .6 : 1, minWidth:200 }}
          disabled={generating}
          onClick={handleGenerarPDF}
        >
          {generating ? 'Generant...' : '📄 Generar i descarregar PDF'}
        </button>
      </div>

      {/* Resum de dades llegides automàticament */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-head" style={{ padding:'10px 14px' }}>
          <h3 style={{ fontSize:13 }}>Dades llegides automàticament</h3>
          <button className="btn btn-ghost btn-sm" style={{ fontSize:12 }} onClick={load}>↺ Actualitzar</button>
        </div>
        <div style={{ padding:'10px 14px', display:'flex', flexWrap:'wrap', gap:10 }}>
          {[
            { icon: '👤', label: 'Absents',      val: absentsCount,      ok: absentsCount > 0 },
            { icon: '📋', label: 'Baixes',        val: baixes.length,     ok: true },
            { icon: '📝', label: 'Reunions',      val: reunionsText ? '✓' : '–', ok: !!reunionsText },
            { icon: '🏥', label: 'CEEPSIR',       val: ceepsirText ? '✓' : '–', ok: !!ceepsirText },
            { icon: '📊', label: 'Files de grup', val: nCob,              ok: nCob > 0 },
            { icon: '👩‍🏫', label: 'Especialistes', val: nEsp,             ok: nEsp > 0 },
          ].map(item => (
            <div key={item.label} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', background: item.ok ? '#f0fdf4' : '#fafafa', borderRadius:6, border:'1px solid', borderColor: item.ok ? '#bbf7d0' : 'var(--border)', minWidth:120 }}>
              <span style={{ fontSize:16 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize:11, color:'var(--ink-3)' }}>{item.label}</div>
                <div style={{ fontSize:13, fontWeight:600, color: item.ok ? '#16a34a' : 'var(--ink-3)' }}>{item.val}</div>
              </div>
            </div>
          ))}
        </div>
        {nCob === 0 && (
          <div className="alert alert-amber" style={{ margin:'0 14px 14px', fontSize:12 }}>
            ⚠️ No s'han trobat cobertures per avui. Assegura't d'haver gestionat els avisos d'absència des de l'apartat "Avisos".
          </div>
        )}
      </div>

      {/* Lema */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-head" style={{ padding:'10px 14px' }}>
          <h3 style={{ fontSize:13 }}>Lema del document</h3>
        </div>
        <div style={{ padding:14 }}>
          <input
            className="f-ctrl"
            value={lema}
            onChange={e => setLema(e.target.value)}
            placeholder="Escriu el lema o missatge inspirador del dia..."
            style={{ fontSize:13 }}
          />
          <p style={{ fontSize:11, color:'var(--ink-3)', marginTop:6 }}>
            Es recorda entre sessions. Pots canviar-lo quan vulguis.
          </p>
        </div>
      </div>

      {/* Practicants (únic camp manual) */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-head" style={{ padding:'10px 14px' }}>
          <h3 style={{ fontSize:13 }}>Alumnat de pràctiques (manual)</h3>
          <span style={{ fontSize:11, color:'var(--ink-3)' }}>No es pot derivar automàticament</span>
        </div>
        <div style={{ padding:14 }}>
          <PracticantsEditor items={taulaPrac} setItems={setTaulaPrac} />
        </div>
      </div>

      {/* Botó principal */}
      <button
        className="btn btn-full"
        style={{ padding:14, background:'#5B4B8A', color:'#fff', border:'none', fontSize:15, fontWeight:700, borderRadius:'var(--r)', marginBottom:24, opacity: generating ? .6 : 1 }}
        disabled={generating}
        onClick={handleGenerarPDF}
      >
        {generating ? 'Generant PDF...' : '📄 Generar i descarregar PDF'}
      </button>
    </>
  );
}
