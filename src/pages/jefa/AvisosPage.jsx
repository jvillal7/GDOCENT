import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { FRANJES, SCHOOL_FRANJES, FRANJES_ORIOL, SCHOOL_FRANJES_ORIOL, APP_URL } from '../../lib/constants';
import { proposarCobertura, analitzarInfoExtra } from '../../lib/claude';
import { sendEmail } from '../../lib/api';
import { parseFranges } from '../../lib/utils';
import Spinner from '../../components/Spinner';

function frangesChips(frangesJson, isOriol) {
  const ids = parseFranges(frangesJson);
  const franjesAct = isOriol ? FRANJES_ORIOL : FRANJES;
  const schoolFranjesAct = isOriol ? SCHOOL_FRANJES_ORIOL : SCHOOL_FRANJES;
  const selected = franjesAct.filter(f => ids.includes(f.id));
  const isAllDay = ids.length >= schoolFranjesAct.length;
  if (isAllDay) return <span className="slot-chip all-day">✨ Tot el dia</span>;
  const seen = new Set();
  return selected.filter(f => { if (seen.has(f.label)) return false; seen.add(f.label); return true; })
    .map(f => <span key={f.label} className={`slot-chip${f.patio ? ' patio' : ''}`}>{f.label}</span>);
}

export default function AvisosPage() {
  const { api, docents, normes, escola, showToast } = useApp();
  const isOriol = escola?.nom?.toLowerCase().includes('oriol');
  const [absencies, setAbsencies] = useState(null);
  const [baixes,    setBaixes]    = useState([]);
  const [iaState,        setIaState]        = useState('idle');
  const [iaResult,       setIaResult]       = useState(null);
  const [iaTarget,       setIaTarget]       = useState(null);
  const [iaError,        setIaError]        = useState('');
  const [editedProposta, setEditedProposta] = useState(null);
  // Informació extra del dia (activitats especials) — llista d'entrades
  const [showInfoPanel,    setShowInfoPanel]    = useState(false);
  const [infoNotes,        setInfoNotes]        = useState('');
  const [infoFitxer,       setInfoFitxer]       = useState(null);
  const [infoLoading,      setInfoLoading]      = useState(false);
  const [infoExtra,        setInfoExtra]        = useState([]); // [{resum, docentsBlocats, context, data_inici, data_fi}]
  const [expandedInfoIdxs, setExpandedInfoIdxs] = useState(new Set());
  const [editingInfoIdx,   setEditingInfoIdx]   = useState(null);
  const [editingText,      setEditingText]      = useState('');
  const [editingDateIdx,   setEditingDateIdx]   = useState(null);
  const [editingDateInici, setEditingDateInici] = useState('');
  const [editingDateFi,    setEditingDateFi]    = useState('');
  // Cobertura manual
  const [showCoberturaManual, setShowCoberturaManual] = useState(false);
  const [cmAbsent,  setCmAbsent]  = useState('');
  const [cmData,    setCmData]    = useState(() => new Date().toISOString().split('T')[0]);
  const [cmFranges, setCmFranges] = useState(new Set());
  const [cmCobrint, setCmCobrint] = useState('');
  const [cmGrup,    setCmGrup]    = useState('');
  const [cmSaving,  setCmSaving]  = useState(false);
  // Avisos descoberts des d'infoExtra
  const [avisosDescoberts, setAvisosDescoberts] = useState([]);
  const [creantAvisos,     setCreantAvisos]     = useState(false);
  const [coberturesPerId,  setCoberturesPerId]  = useState({});
  const infoFileRef = useRef(null);

  useEffect(() => { if (api) load(); }, [api]);

  async function load() {
    try {
      const avui = new Date().toISOString().split('T')[0];
      const [data, infoRes, diariRes] = await Promise.all([
        api.getAbsencies(),
        api.getInfoExtra().catch(() => null),
        api.getOriolDiari().catch(() => null),
      ]);
      setBaixes(diariRes?.[0]?.oriol_baixes || []);
      // Carregar i validar infoExtra persistent (suporta format antic objecte i nou array)
      const raw = infoRes?.[0]?.info_extra;
      const llista = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      const vigents = llista.filter(ie => !ie.data_fi || ie.data_fi >= avui);
      if (vigents.length !== llista.length) {
        await api.saveInfoExtra(vigents.length ? vigents : null);
      }
      setInfoExtra(vigents);
      const actives = (data || []).filter(a => a.estat !== 'arxivat');
      // Auto-arxivar absències resoltes de fa més de 3 dies (marge perquè la jefa les vegi)
      const limitArxiu = new Date(); limitArxiu.setDate(limitArxiu.getDate() - 3);
      const limitArxiuISO = limitArxiu.toISOString().split('T')[0];
      const passades = actives.filter(a => a.estat === 'resolt' && a.data && a.data < limitArxiuISO);
      if (passades.length > 0) {
        await Promise.all(passades.map(a => api.patchAbsencia(a.id, { estat: 'arxivat' })));
      }
      const restants = actives.filter(a => !passades.find(p => p.id === a.id));
      restants.sort((a, b) => (a.data || '') < (b.data || '') ? -1 : (a.data || '') > (b.data || '') ? 1 : 0);
      setAbsencies(restants);
      // Carregar cobertures per a les absències no-pendents (per mostrar qui cobreix)
      const nopendes = restants.filter(a => a.estat !== 'pendent');
      if (nopendes.length > 0) {
        const cobsArray = await Promise.all(nopendes.map(a => api.getCoberturesByAbsencia(a.id).catch(() => [])));
        const map = {};
        nopendes.forEach((a, i) => { map[a.id] = cobsArray[i] || []; });
        setCoberturesPerId(map);
      } else {
        setCoberturesPerId({});
      }
    } catch { setAbsencies([]); }
  }

  async function marcarResolt(id) {
    try {
      await api.patchAbsencia(id, { estat: 'resolt' });
      showToast('Avis marcat com a resolt');
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  }

  async function arxivar(id) {
    try {
      await api.patchAbsencia(id, { estat: 'arxivat' });
      showToast('Avis esborrat de la llista');
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  }

  function nomsSimilars(a, b) {
    const clean = s => (s || '').toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[ªº.]/g, '').replace(/\s+/g, ' ').trim();
    const ca = clean(a), cb = clean(b);
    if (ca === cb) return true;
    const toks = s => s.split(' ').filter(w => w.length >= 2);
    const ta = toks(ca), tb = toks(cb);
    const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    return shorter.length > 0 && shorter.every(sw => longer.some(lw => lw === sw || lw.startsWith(sw) || sw.startsWith(lw)));
  }

  function needsCoverage(val) {
    if (!val || val === 'Lliure' || val === 'TP' || val === 'Pati') return false;
    const low = val.toLowerCase();
    if (low.startsWith('suport') || low.startsWith('càrrec') || low.startsWith('racons') ||
        low === 'coordinació' || low === 'mee' || low === 'mesi') return false;
    return true;
  }

  function horaAFranges(hores, schoolFranjes) {
    if (!hores || hores.toLowerCase().includes('tot el dia')) return schoolFranjes.map(f => f.id);
    const m = hores.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    if (!m) return schoolFranjes.map(f => f.id);
    const toMin = s => { const [h, mn] = s.split(':').map(Number); return h * 60 + mn; };
    const start = toMin(m[1]), end = toMin(m[2]);
    return schoolFranjes.filter(f => {
      const parts = f.sub.split('–');
      if (parts.length < 2) return false;
      const fStart = toMin(parts[0].trim()), fEnd = toMin(parts[1].trim());
      return fStart < end && fEnd > start;
    }).map(f => f.id);
  }

  function detectarClassesDescobertes(entrada) {
    const { docentsBlocats = [], data_inici, data_fi } = entrada;
    if (!data_inici) return [];
    const schoolFranjesAct = isOriol ? SCHOOL_FRANJES_ORIOL : SCHOOL_FRANJES;
    const dates = [];
    let cur = new Date(data_inici + 'T12:00:00');
    const fi = new Date((data_fi || data_inici) + 'T12:00:00');
    while (cur <= fi) {
      const d = cur.getDay();
      if (d >= 1 && d <= 5) {
        const dia = ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][d];
        dates.push({ iso: cur.toISOString().split('T')[0], dia });
      }
      cur.setDate(cur.getDate() + 1);
    }
    const results = [];
    for (const blocked of docentsBlocats) {
      const nom = blocked.nom || blocked;
      const docent = docents.find(d => nomsSimilars(d.nom, nom));
      if (!docent?.horari) continue;
      // MESI/MEE: les seves activitats són sempre suport, no cal cobertura
      const gp = (docent.grup_principal || '').toUpperCase();
      if (gp.includes('MESI') || gp.includes('MEE')) continue;
      const esTutor = !!docent.grup_principal && !gp.includes('SIEI');
      const frangesBloquejades = horaAFranges(blocked.hores, schoolFranjesAct);
      for (const { iso, dia } of dates) {
        const horariDia = docent.horari[dia] || {};
        // Tutor: el grup ha d'estar cobert tota la jornada — inclou TP, buit, Pati...
        // Especialista: només les franges on fa classe (needsCoverage)
        const afectades = esTutor
          ? frangesBloquejades.filter(fid => (horariDia[fid] || '').toLowerCase() !== 'lliure')
          : frangesBloquejades.filter(fid => needsCoverage(horariDia[fid]));
        if (afectades.length > 0) results.push({ nom, data: iso, dia, franges: afectades, motiu: entrada.titol || entrada.resum?.split(' ').slice(0, 4).join(' ') || 'Activitat especial' });
      }
    }
    return results;
  }

  async function crearAvisosAutomatics() {
    setCreantAvisos(true);
    try {
      for (const av of avisosDescoberts) {
        await api.saveAbsencia({
          escola_id: escola.id,
          docent_nom: av.nom,
          data: av.data,
          franges: JSON.stringify(av.franges),
          motiu: av.motiu || 'Activitat especial',
          estat: 'pendent',
        });
      }
      setAvisosDescoberts([]);
      showToast(`✓ ${avisosDescoberts.length} avís${avisosDescoberts.length > 1 ? 'os' : ''} creat${avisosDescoberts.length > 1 ? 's' : ''}`);
      load();
    } catch (e) {
      showToast('Error creant avisos: ' + e.message);
    } finally {
      setCreantAvisos(false);
    }
  }

  async function guardarCoberturaManual() {
    if (!cmAbsent || !cmCobrint || !cmGrup || cmFranges.size === 0) return showToast('Omple tots els camps');
    setCmSaving(true);
    const avui = new Date().toISOString().split('T')[0];
    const esFutura = cmData > avui;
    const schoolFranjesAct = isOriol ? SCHOOL_FRANJES_ORIOL : SCHOOL_FRANJES;
    const dia = ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'][new Date(cmData + 'T12:00:00').getDay()];
    const frangesArr = [...cmFranges];
    try {
      // 1. Crear absència (resolta directament)
      const absResult = await api.saveAbsencia({
        escola_id: escola.id,
        docent_nom: cmAbsent,
        data: cmData,
        franges: JSON.stringify(frangesArr),
        motiu: 'Cobertura manual',
        estat: esFutura ? 'provisional' : 'resolt',
      });
      const absId = absResult?.[0]?.id || null;

      // 2. Cobertura per cada franja (detecta TP)
      const cobrintDocent = docents.find(d => d.nom === cmCobrint);
      for (const fid of frangesArr) {
        const val = cobrintDocent?.horari?.[dia]?.[fid] || '';
        const tpAfectat = val.toLowerCase() === 'tp';
        await api.saveCobertura({
          escola_id: escola.id,
          absencia_id: absId,
          docent_cobrint_nom: cmCobrint,
          docent_absent_nom: cmAbsent,
          franja: fid,
          grup: cmGrup,
          data: cmData,
          tp_afectat: tpAfectat,
          motiu: 'Cobertura manual',
        });
        if (tpAfectat && !esFutura) {
          await api.saveDeuteTP({
            escola_id: escola.id,
            docent_nom: cmCobrint,
            data_deute: cmData,
            motiu: `Cobertura manual (${cmAbsent})`,
            retornat: false,
            minuts: 30,
          });
        }
      }

      // 3. Blocar el mestre cobrint a infoExtra perquè la IA no el proposi
      const franjesLabel = frangesArr.map(fid => schoolFranjesAct.find(x => x.id === fid)?.sub?.split('–')[0]?.trim() || fid).join(', ');
      const novaLlista = [...infoExtra, {
        titol: `Cobertura ${cmGrup}`,
        resum: `${cmCobrint} cobreix ${cmAbsent} al grup ${cmGrup}`,
        context: `${cmCobrint} ja té cobertura manual assignada per ${cmGrup}`,
        data_inici: cmData,
        data_fi: cmData,
        docentsBlocats: [{ nom: cmCobrint, hores: franjesLabel }],
      }];
      await api.saveInfoExtra(novaLlista);
      setInfoExtra(novaLlista);

      // 4. Correu al mestre cobrint
      if (cobrintDocent?.email) {
        sendEmail(
          cobrintDocent.email,
          `📋 Cobertura assignada — ${cmData}`,
          emailCobertura({ cobrint: cmCobrint, absent: cmAbsent, data: cmData, frangesIds: frangesArr, isOriol, grup: cmGrup, esFutura, notes: null })
        );
      }

      showToast('✓ Cobertura manual registrada');
      setShowCoberturaManual(false);
      setCmAbsent(''); setCmData(new Date().toISOString().split('T')[0]); setCmFranges(new Set()); setCmCobrint(''); setCmGrup('');
      load();
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally {
      setCmSaving(false);
    }
  }

  async function processarInfoExtra() {
    if (!infoNotes.trim() && !infoFitxer) return showToast('Escriu unes notes o adjunta un document');
    setInfoLoading(true);
    try {
      let base64 = null;
      if (infoFitxer) {
        base64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = e => res(e.target.result.split(',')[1]);
          r.onerror = rej;
          r.readAsDataURL(infoFitxer);
        });
      }
      const result = await analitzarInfoExtra(infoNotes, base64);
      const novaLlista = [...infoExtra, result];
      await api.saveInfoExtra(novaLlista);
      setInfoExtra(novaLlista);
      setShowInfoPanel(false);
      setInfoNotes('');
      setInfoFitxer(null);
      // Detectar si algun docent blocat té classes descobertes
      const descoberts = detectarClassesDescobertes(result);
      if (descoberts.length > 0) setAvisosDescoberts(descoberts);
      else showToast('✓ Informació extra guardada');
    } catch (e) {
      showToast('Error analitzant: ' + e.message);
    } finally {
      setInfoLoading(false);
    }
  }

  function toggleInfoExtra(idx) {
    setExpandedInfoIdxs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function editarInfoExtra(idx, newResum) {
    try {
      const novaLlista = infoExtra.map((ie, i) => i === idx ? { ...ie, resum: newResum } : ie);
      await api.saveInfoExtra(novaLlista);
      setInfoExtra(novaLlista);
      setEditingInfoIdx(null);
      showToast('✓ Informació actualitzada');
    } catch (e) { showToast('Error: ' + e.message); }
  }

  async function confirmarDates(idx) {
    try {
      const novaLlista = infoExtra.map((ie, i) => i === idx ? { ...ie, data_inici: editingDateInici, data_fi: editingDateFi || editingDateInici } : ie);
      await api.saveInfoExtra(novaLlista);
      setInfoExtra(novaLlista);
      setEditingDateIdx(null);
      showToast('✓ Dates actualitzades');
    } catch (e) { showToast('Error: ' + e.message); }
  }

  async function eliminarInfoExtra(idx) {
    try {
      const novaLlista = infoExtra.filter((_, i) => i !== idx);
      await api.saveInfoExtra(novaLlista.length ? novaLlista : null);
      setInfoExtra(novaLlista);
      showToast('Entrada eliminada');
    } catch (e) { showToast('Error: ' + e.message); }
  }

  async function generarIA(avis) {
    if (avis.data) {
      const diaSetmana = new Date(avis.data + 'T12:00:00').getDay();
      if (diaSetmana === 0 || diaSetmana === 6) {
        setIaTarget(avis);
        setIaState('error');
        setIaError('Aquesta absència és un cap de setmana — no hi ha classes ni cobertures possibles.');
        return;
      }
    }
    setIaTarget(avis);
    setIaState('loading');
    setIaResult(null);
    setEditedProposta(null);
    setIaError('');
    try {
      const frangesIds = parseFranges(avis.franges);
      if (frangesIds.length === 0) {
        setIaState('error');
        setIaError("Aquesta absència no té franges horàries. Edita-la i torna-la a enviar.");
        return;
      }
      // Excloure mestres que ja estan cobrint alguna franja d'avui
      const cobsAvui = await api.getCoberturasAvui().catch(() => []);
      const frangesSet = new Set(frangesIds);
      const jaAssignats = new Set(
        cobsAvui.filter(c => frangesSet.has(c.franja)).map(c => c.docent_cobrint_nom).filter(Boolean)
      );
      // Excloure mestres bloquejats per qualsevol activitat especial del dia
      const blocatsExtra = new Set(
        infoExtra.flatMap(ie => (ie.docentsBlocats || []).map(b => (b.nom || b).toLowerCase()))
      );
      const ROLS_EXCLOSOS = new Set(['vetllador', 'educador', 'tei', 'suport', 'directiu']);
      const docentsFiltrats = docents.filter(d =>
        !jaAssignats.has(d.nom) &&
        !blocatsExtra.has(d.nom.toLowerCase()) &&
        !ROLS_EXCLOSOS.has(d.rol) &&
        !['SIEI', 'SIEI+'].includes(d.grup_principal) &&
        d.horari
      );
      // Passar totes les entrades d'info extra a la IA (contexte combinat)
      const infoExtraCombinada = infoExtra.length
        ? { context: infoExtra.map(ie => ie.context).filter(Boolean).join(' | '), docentsBlocats: infoExtra.flatMap(ie => ie.docentsBlocats || []) }
        : null;
      const result = await proposarCobertura(avis.docent_nom, frangesIds, docentsFiltrats, normes, avis.data, isOriol, infoExtraCombinada, baixes.length ? baixes : null);
      setIaResult(result);
      setIaState('done');
      setEditedProposta(result.proposta.map(p => ({ ...p })));
    } catch (e) {
      setIaError(e.message || 'Error generant proposta.');
      setIaState('error');
    }
  }

  async function confirmarCobertura() {
    const proposta = editedProposta || iaResult?.proposta;
    if (!proposta || !iaTarget) return;
    const avui     = new Date().toISOString().split('T')[0];
    const absData  = iaTarget.data || avui;
    const esFutura = absData > avui;
    const nouEstat = esFutura ? 'provisional' : 'resolt';
    try {
      // Grup destí = grup del docent ABSENT (on ha d'anar el cobrint)
      const absentDocent = docents.find(d => d.nom === iaTarget.docent_nom);
      const grupDestí = absentDocent?.grup_principal || '';

      for (const p of proposta) {
        // Nou format: franges_ids (array). Antic: franja (string). Guardem 1 cobertura per franja.
        const frangesACobrir = p.franges_ids?.length ? p.franges_ids : [p.franja];
        for (const fid of frangesACobrir) {
          await api.saveCobertura({
            escola_id:          escola.id,
            absencia_id:        iaTarget.id,
            docent_cobrint_nom: p.docent,
            franja:             fid,
            docent_absent_nom:  iaTarget.docent_nom,
            grup:               grupDestí,
            data:               absData,
            tp_afectat:         p.tp_afectat || false,
            motiu:              p.motiu || '',
          });
        }
        if (p.tp_afectat && !esFutura) {
          await api.saveDeuteTP({
            docent_nom:  p.docent,
            data_deute:  absData,
            motiu:       `Cobertura ${p.hores || p.franja} (${iaTarget.docent_nom})`,
            retornat:    false,
            minuts:      (p.franges_ids?.length || 1) * 30,
          });
        }
      }
      await api.patchAbsencia(iaTarget.id, { estat: nouEstat });
      showToast(esFutura ? '📅 Cobertura provisional guardada' : '✓ Cobertures confirmades');
      // Enviar correu a cada docent cobrint que tingui email
      for (const p of proposta) {
        const cobrintDocent = docents.find(d => d.nom === p.docent);
        if (cobrintDocent?.email) {
          const frangesIds = p.franges_ids?.length ? p.franges_ids : [p.franja].filter(Boolean);
          sendEmail(
            cobrintDocent.email,
            `📋 Cobertura assignada — ${absData}`,
            emailCobertura({ cobrint: p.docent, absent: iaTarget.docent_nom, data: absData, frangesIds, isOriol, grup: grupDestí, esFutura, notes: iaTarget.notes })
          );
        }
      }
      setIaState('idle');
      setIaTarget(null);
      setEditedProposta(null);
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  }

  async function confirmarProvisional(id) {
    try {
      const [cobs] = await Promise.all([
        api.getCoberturesByAbsencia(id),
        api.patchAbsencia(id, { estat: 'resolt' }),
      ]);
      showToast('✓ Cobertura confirmada per avui');

      // Enviar correu a cada docent cobrint (agrupem franges per docent)
      const avis = absencies?.find(a => a.id === id);
      const avui = new Date().toISOString().split('T')[0];
      const perDocent = {};
      for (const cob of (cobs || [])) {
        if (!perDocent[cob.docent_cobrint_nom]) perDocent[cob.docent_cobrint_nom] = { frangesIds: [], grup: cob.grup };
        perDocent[cob.docent_cobrint_nom].frangesIds.push(cob.franja);
      }
      for (const [nom, { frangesIds, grup }] of Object.entries(perDocent)) {
        const cobrintDocent = docents.find(d => d.nom === nom);
        if (cobrintDocent?.email) {
          sendEmail(
            cobrintDocent.email,
            `📋 Cobertura assignada — ${avui}`,
            emailCobertura({ cobrint: nom, absent: avis?.docent_nom || '', data: avui, frangesIds, isOriol, grup, esFutura: false, notes: avis?.notes })
          );
        }
      }
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  }

  if (absencies == null) {
    return <><div className="page-hdr"><h1>Avisos rebuts</h1></div><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></>;
  }

  const pendents = absencies.filter(a => a.estat === 'pendent');

  return (
    <>
      <div className="page-hdr">
        <h1>Avisos rebuts</h1>
        <p>Notificacions d'absències pendents</p>
      </div>

      {/* Botons acció del dia + panells */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: infoExtra.length > 0 ? 10 : 4 }}>
          <button
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 13.5, fontWeight: 600, borderRadius: 10, cursor: 'pointer', border: '1.5px solid #a5d6a7', background: showInfoPanel ? '#c8e6c9' : '#e8f5e9', color: '#2e7d32', transition: 'background .15s' }}
            onClick={() => { setShowInfoPanel(p => !p); setShowCoberturaManual(false); setInfoNotes(''); setInfoFitxer(null); }}
          >
            📋 Informació extra del dia
            {infoExtra.length > 0 && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2e7d32', display: 'inline-block', flexShrink: 0 }} />}
          </button>
          <button
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 13.5, fontWeight: 600, borderRadius: 10, cursor: 'pointer', border: '1.5px solid #80cbc4', background: showCoberturaManual ? '#b2dfdb' : '#e0f2f1', color: '#00695c', transition: 'background .15s' }}
            onClick={() => { setShowCoberturaManual(p => !p); setShowInfoPanel(false); }}
          >
            ✍️ Cobertura manual
          </button>
        </div>

        {/* Panel d'entrada */}
        {showInfoPanel && (
          <div className="card" style={{ marginTop: 8 }}>
            <div className="card-head" style={{ padding: '10px 14px' }}>
              <h3 style={{ fontSize: 13 }}>Nova informació extra del dia</h3>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowInfoPanel(false)}>✕</button>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="f-label" style={{ marginBottom: 6 }}>Descriu l'activitat o esdeveniment d'avui</label>
                <textarea
                  className="f-ctrl"
                  rows={3}
                  placeholder="Ex: 3r i 4t van de sortida a la natura. Tots els mestres acompanyants no poden cobrir. La tutora de 5è té reunió de 10 a 11h..."
                  value={infoNotes}
                  onChange={e => setInfoNotes(e.target.value)}
                />
              </div>
              <div>
                <label className="f-label" style={{ marginBottom: 6 }}>Document d'organització (PDF, opcional)</label>
                <div
                  style={{ border: '1.5px dashed var(--border-2)', borderRadius: 'var(--r-sm)', padding: 12, textAlign: 'center', cursor: 'pointer', background: 'var(--bg)' }}
                  onClick={() => infoFileRef.current?.click()}
                >
                  <input ref={infoFileRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={e => setInfoFitxer(e.target.files?.[0] || null)} />
                  {infoFitxer
                    ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13 }}>
                        <span>📄</span><span style={{ fontWeight: 600 }}>{infoFitxer.name}</span>
                        <span style={{ color: 'var(--ink-3)', cursor: 'pointer', fontWeight: 700 }} onClick={e => { e.stopPropagation(); setInfoFitxer(null); }}>×</span>
                      </div>
                    : <><div style={{ fontSize: 20, marginBottom: 4 }}>📄</div><div style={{ fontSize: 13, fontWeight: 500 }}>Adjunta el document d'organització</div><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>PDF (organització sortida, jornada, colònies...)</div></>
                  }
                </div>
              </div>
              <button
                className="btn btn-full"
                style={{ padding: 13, fontSize: 14, fontWeight: 600, background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', cursor: infoLoading ? 'not-allowed' : 'pointer', opacity: infoLoading ? .6 : 1 }}
                disabled={infoLoading}
                onClick={processarInfoExtra}
              >
                {infoLoading ? <><Spinner size={14} /> Analitzant amb IA...</> : '🤖 Analitzar i activar'}
              </button>
            </div>
          </div>
        )}

        {/* Avís classes descobertes */}
        {avisosDescoberts.length > 0 && (
          <div style={{ marginTop: 8, background: '#FFF8E7', border: '1px solid #F0D5A8', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', marginBottom: 4 }}>
                  S'han detectat {avisosDescoberts.length} classe{avisosDescoberts.length > 1 ? 's' : ''} sense cobrir
                </div>
                {avisosDescoberts.map((av, i) => {
                  const schoolFranjesAct = isOriol ? SCHOOL_FRANJES_ORIOL : SCHOOL_FRANJES;
                  const frangesLabel = av.franges.map(fid => schoolFranjesAct.find(f => f.id === fid)?.label || fid).join(', ');
                  const dataFmt = new Date(av.data + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'short', day: 'numeric', month: 'short' });
                  return (
                    <div key={i} style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 2 }}>
                      · <strong>{av.nom}</strong> — {dataFmt} ({frangesLabel})
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'var(--amber)', color: '#fff', borderColor: 'var(--amber)', fontSize: 12, fontWeight: 600, padding: '6px 14px' }}
                    onClick={crearAvisosAutomatics}
                    disabled={creantAvisos}
                  >
                    {creantAvisos ? 'Creant...' : '+ Crear avisos'}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => setAvisosDescoberts([])}>
                    Ignorar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Panel cobertura manual */}
        {showCoberturaManual && (() => {
          const schoolFranjesAct = isOriol ? SCHOOL_FRANJES_ORIOL : SCHOOL_FRANJES;
          const docentsSorted = [...(docents || [])].sort((a, b) => a.nom.localeCompare(b.nom));
          return (
            <div className="card" style={{ marginTop: 8 }}>
              <div className="card-head" style={{ padding: '10px 14px' }}>
                <h3 style={{ fontSize: 13 }}>✍️ Registrar cobertura manual</h3>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowCoberturaManual(false)}>✕</button>
              </div>
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label className="f-label" style={{ marginBottom: 4 }}>Data</label>
                    <input type="date" className="f-ctrl" value={cmData} onChange={e => setCmData(e.target.value)} style={{ fontSize: 13 }} />
                  </div>
                  <div style={{ flex: 2, minWidth: 160 }}>
                    <label className="f-label" style={{ marginBottom: 4 }}>Mestre absent</label>
                    <select className="f-ctrl" value={cmAbsent} style={{ fontSize: 13 }}
                      onChange={e => {
                        setCmAbsent(e.target.value);
                        const d = docents.find(x => x.nom === e.target.value);
                        if (d?.grup_principal) setCmGrup(d.grup_principal);
                      }}>
                      <option value="">Selecciona...</option>
                      {docentsSorted.map(d => <option key={d.id} value={d.nom}>{d.nom}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 2, minWidth: 160 }}>
                    <label className="f-label" style={{ marginBottom: 4 }}>Mestre que cobreix</label>
                    <select className="f-ctrl" value={cmCobrint} onChange={e => setCmCobrint(e.target.value)} style={{ fontSize: 13 }}>
                      <option value="">Selecciona...</option>
                      {docentsSorted.map(d => <option key={d.id} value={d.nom}>{d.nom}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label className="f-label" style={{ marginBottom: 4 }}>Grup</label>
                    <input type="text" className="f-ctrl" placeholder="Ex: I5, 3rA..." value={cmGrup} onChange={e => setCmGrup(e.target.value)} style={{ fontSize: 13 }} />
                  </div>
                </div>
                <div>
                  <label className="f-label" style={{ marginBottom: 6 }}>Franges afectades</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {schoolFranjesAct.filter(f => !f.patio).map(f => {
                      const sel = cmFranges.has(f.id);
                      return (
                        <button key={f.id} type="button"
                          onClick={() => setCmFranges(prev => { const n = new Set(prev); sel ? n.delete(f.id) : n.add(f.id); return n; })}
                          style={{ fontSize: 12, padding: '5px 10px', borderRadius: 20, border: `1.5px solid ${sel ? 'var(--blue)' : 'var(--border)'}`, background: sel ? 'var(--blue-bg)' : 'var(--bg)', color: sel ? 'var(--blue)' : 'var(--ink-2)', fontWeight: sel ? 600 : 400, cursor: 'pointer' }}>
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  className="btn btn-full"
                  style={{ padding: 12, fontSize: 14, fontWeight: 600, background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', opacity: cmSaving ? .6 : 1 }}
                  disabled={cmSaving}
                  onClick={guardarCoberturaManual}
                >
                  {cmSaving ? <><Spinner size={14} /> Guardant...</> : '✓ Guardar cobertura'}
                </button>
              </div>
            </div>
          );
        })()}

        {/* Llista d'entrades info extra actives */}
        {infoExtra.map((ie, idx) => {
          const isExpanded = expandedInfoIdxs.has(idx);
          const isEditing  = editingInfoIdx === idx;
          return (
            <div key={idx} style={{ marginTop: 8, background: 'var(--amber-bg)', border: '1px solid #F0D5A8', borderRadius: 10, overflow: 'hidden' }}>
              {/* Fila compacta */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggleInfoExtra(idx)}
              >
                {/* Esquerra: etiqueta + badge dies + chips mestres */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>
                    {ie.titol || (ie.resum ? ie.resum.split(' ').slice(0, 4).join(' ') : 'Activitat especial')}
                  </span>
                  {ie.docentsBlocats?.map((b, i) => {
                    const nom = b.nom || b;
                    const hores = b.hores || '';
                    return (
                      <span key={i} style={{ background: '#fff', border: '1px solid #F0D5A8', borderRadius: 20, padding: '2px 7px', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                        {nom.split(' ')[0]}
                        {hores && <span style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 500 }}>{hores}</span>}
                      </span>
                    );
                  })}
                </div>
                {/* Dreta: data + botons + chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {ie.data_inici && editingDateIdx === idx ? (
                    <>
                      <input type="date" value={editingDateInici} onChange={e => setEditingDateInici(e.target.value)}
                        style={{ fontSize: 11, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, width: 110 }} />
                      <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>–</span>
                      <input type="date" value={editingDateFi} onChange={e => setEditingDateFi(e.target.value)}
                        style={{ fontSize: 11, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, width: 110 }} />
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--green)', fontWeight: 700 }} onClick={() => confirmarDates(idx)}>✓</button>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setEditingDateIdx(null)}>✕</button>
                    </>
                  ) : ie.data_inici ? (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11, color: 'var(--ink-3)', marginRight: 2, fontWeight: 500, padding: '2px 6px' }}
                      title="Editar dates"
                      onClick={() => { setEditingDateIdx(idx); setEditingDateInici(ie.data_inici); setEditingDateFi(ie.data_fi || ie.data_inici); }}
                    >
                      {ie.data_fi && ie.data_fi !== ie.data_inici
                        ? `${new Date(ie.data_inici + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })} – ${new Date(ie.data_fi + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })}`
                        : new Date(ie.data_inici + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })}
                    </button>
                  ) : null}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => { setEditingInfoIdx(idx); setEditingText(ie.resum || ''); if (!isExpanded) toggleInfoExtra(idx); }}
                    title="Editar"
                  >✏️</button>
                  <button
                    className="btn btn-red-soft btn-sm"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => eliminarInfoExtra(idx)}
                    title="Eliminar"
                  >🗑️</button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--amber)', flexShrink: 0 }}>{isExpanded ? '▾' : '▸'}</span>
              </div>

              {/* Contingut expandit */}
              {isExpanded && !isEditing && (
                <div style={{ padding: '0 12px 10px', borderTop: '1px solid #F0D5A8' }}>
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>{ie.resum}</p>
                </div>
              )}

              {/* Mode edició */}
              {isEditing && (
                <div style={{ padding: '8px 12px 12px', borderTop: '1px solid #F0D5A8', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    className="f-ctrl"
                    rows={3}
                    style={{ fontSize: 13 }}
                    value={editingText}
                    onChange={e => setEditingText(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-green btn-sm btn-full" onClick={() => editarInfoExtra(idx, editingText)}>✓ Guardar</button>
                    <button className="btn btn-ghost btn-sm btn-full" onClick={() => setEditingInfoIdx(null)}>Cancel·lar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

      </div>

      {/* IA Section — just below header */}
      {iaTarget && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h3>🤖 Proposta IA — {iaTarget.docent_nom}</h3>
          </div>
          <div style={{ padding: 16 }}>
            {iaState === 'loading' && (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <Spinner />
                <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 10 }}>La IA analitzant disponibilitat...</p>
              </div>
            )}
            {iaState === 'error' && (
              <>
                <div className="f-warn" style={{ marginBottom: 12 }}>⚠ {iaError}</div>
                <button className="btn btn-ghost btn-full" onClick={() => generarIA(iaTarget)}>↺ Tornar a intentar</button>
              </>
            )}
            {iaState === 'done' && iaResult && (
              <>
                <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-mid)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--green)', marginBottom: 10 }}>
                  💡 {iaResult.resum}
                </div>
                <div className="card" style={{ marginBottom: 12 }}>
                  {(editedProposta || iaResult.proposta).map((p, i) => (
                    <div key={i} style={{ padding: '10px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', marginBottom: 5 }}>{p.hores || p.franja}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                          className="f-ctrl"
                          style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: '6px 8px' }}
                          value={p.docent}
                          onChange={e => setEditedProposta(prev => prev.map((x, j) => j === i ? { ...x, docent: e.target.value } : x))}
                        >
                          {docents.map(d => <option key={d.id} value={d.nom}>{d.nom}</option>)}
                        </select>
                        {p.tp_afectat && <span className="sp sp-amber" style={{ fontSize: 10, flexShrink: 0 }}>⚠ TP</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{p.motiu}</div>
                      {p.franges_ids?.length > 1 && (
                        <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>Cobreix {p.franges_ids.length} franges ({p.franges_ids.length * 30} min)</div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="btn btn-green btn-full" onClick={confirmarCobertura}>✓ Confirmar i enviar notificacions</button>
                  <button className="btn btn-ghost btn-full" onClick={() => generarIA(iaTarget)}>↺ Generar una altra proposta</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {absencies.length === 0 && (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          Cap absència registrada encara.
        </div>
      )}

      {(() => {
        const avui = new Date().toISOString().split('T')[0];
        const absByDocent = {};
        absencies.forEach(a => { absByDocent[a.docent_nom] = (absByDocent[a.docent_nom] || 0) + 1; });
        const pendentsList   = absencies.filter(a => a.estat === 'pendent');
        const noPendentsList = absencies.filter(a => a.estat !== 'pendent');
        const schoolFranjesAct = isOriol ? SCHOOL_FRANJES_ORIOL : SCHOOL_FRANJES;

        const renderCard = (a) => {
          const dObj  = a.data ? new Date(a.data + 'T12:00:00') : new Date();
          const day   = dObj.getDate();
          const month = dObj.toLocaleDateString('ca-ES', { month: 'short' }).replace('.','').toUpperCase();
          const esProvisional = a.estat === 'provisional';
          const esPendent     = a.estat === 'pendent';
          const esAvui        = a.data === avui;
          const totalAvís     = absByDocent[a.docent_nom] || 1;

          // Cobridors: agrupar franges per nom de docent cobrint
          const cobsCard = coberturesPerId[a.id] || [];
          const perDocent = {};
          for (const c of cobsCard) {
            if (!perDocent[c.docent_cobrint_nom]) perDocent[c.docent_cobrint_nom] = [];
            perDocent[c.docent_cobrint_nom].push(c.franja);
          }

          return (
            <div key={a.id} className={`avis-card${esPendent ? ' pendent' : ''}`}>
              <div className="ac-top">
                <div className="date-badge">
                  <div className="db-day">{day}</div>
                  <div className="db-month">{month}</div>
                </div>
                <div className="ac-content">
                  <div className="ac-name" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <span>{a.docent_nom}</span>
                    {!esPendent && Object.keys(perDocent).length > 0 && (
                      <>
                        <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 14, lineHeight: 1 }}>→</span>
                        {Object.entries(perDocent).map(([nom, franges], i) => {
                          const isTotal = franges.length >= schoolFranjesAct.length;
                          const hLabel  = isTotal ? null : frangesHorari(franges, isOriol);
                          return (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--green-bg)', border: '1px solid var(--green-mid)', borderRadius: 20, padding: '2px 8px', fontSize: 11.5, fontWeight: 600, color: 'var(--green)' }}>
                              {nom.split(' ')[0]}
                              {hLabel && <span style={{ fontSize: 10, fontWeight: 400, opacity: .85 }}>· {hLabel}</span>}
                            </span>
                          );
                        })}
                      </>
                    )}
                  </div>
                  <div className="ac-motiu">{a.motiu || 'Sense motiu'}</div>
                </div>
                <div className="ac-side">
                  {esPendent     && <span className="sp sp-red">Pendent</span>}
                  {esProvisional && <span className="sp sp-amber">Provisional</span>}
                  {!esPendent && !esProvisional && <span className="sp sp-green">Resolt</span>}
                  {totalAvís > 1 && <span className="sp sp-amber" style={{ marginTop: 3 }} title={`${totalAvís} avisos actius per a aquest docent`}>📅 {totalAvís} avisos</span>}

                  {esPendent     && <button className="btn btn-green btn-sm" style={{ fontWeight: 600, marginTop: 4 }} onClick={() => marcarResolt(a.id)}>✓ Resolt</button>}
                  {esProvisional && esAvui && <button className="btn btn-green btn-sm" style={{ fontWeight: 600, marginTop: 4 }} onClick={() => confirmarProvisional(a.id)}>✓ Confirmar</button>}
                  {!esPendent && !esProvisional && <button className="btn btn-red-soft btn-sm" style={{ fontWeight: 600, marginTop: 4 }} onClick={() => arxivar(a.id)}>🗑️ Esborrar</button>}
                </div>
              </div>
              <div className="ac-bottom">{frangesChips(a.franges, isOriol)}</div>

              {esProvisional && (
                <div style={{ padding: '4px 16px 10px', fontSize: 11.5, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  📅 Cobertura provisional — {esAvui ? 'confirma avui' : `prevista per al ${dObj.toLocaleDateString('ca-ES', { weekday: 'short', day: 'numeric', month: 'short' })}`}
                </div>
              )}
              {(esPendent || esProvisional) && (
                <div style={{ padding: '0 16px 14px', display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-ghost btn-sm btn-full"
                    style={{ fontSize: 12 }}
                    onClick={() => generarIA(a)}
                  >
                    {esProvisional ? '↺ Canviar proposta IA' : '🤖 Generar proposta IA'}
                  </button>
                  <button
                    className="btn btn-red-soft btn-sm"
                    style={{ fontSize: 13, flexShrink: 0, paddingInline: 10 }}
                    onClick={() => arxivar(a.id)}
                    title="Eliminar avis"
                  >🗑️</button>
                </div>
              )}
              {!esPendent && !esProvisional && (
                <div style={{ padding: '0 16px 14px' }}>
                  <button className="btn btn-ghost btn-sm btn-full" style={{ fontSize: 12 }} onClick={() => arxivar(a.id)}>🗑️ Esborrar del registre</button>
                </div>
              )}
            </div>
          );
        };

        const nPendents = pendentsList.length;
        const nConfirm  = noPendentsList.length;
        return (
          <>
            {absencies.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {nPendents > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', background: 'var(--red-bg)', borderRadius: 20, padding: '3px 10px' }}>{nPendents} pendent{nPendents > 1 ? 's' : ''}</span>}
                {nConfirm  > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', background: 'var(--green-bg)', borderRadius: 20, padding: '3px 10px' }}>{nConfirm} coberta{nConfirm > 1 ? 's' : ''}</span>}
              </div>
            )}
            {absencies.map(renderCard)}
          </>
        );
      })()}

    </>
  );
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function frangesHorari(ids, isOriol) {
  const allFranjes = isOriol ? FRANJES_ORIOL : FRANJES;
  const sel = allFranjes.filter(f => ids.includes(f.id));
  if (!sel.length) return '';
  const start = sel[0].sub.split('–')[0].trim();
  const end   = sel[sel.length - 1].sub.split('–')[1]?.trim() || '';
  return end ? `${start}–${end}` : start;
}

function emailCobertura({ cobrint, absent, data, frangesIds, isOriol, grup, esFutura, notes }) {
  const escolaKey = isOriol ? 'oriol' : 'rivo';
  const dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const horariText = frangesIds?.length ? frangesHorari(frangesIds, isOriol) : '';
  const firstName = cobrint?.split(' ')[0] || cobrint;
  const notesHtml = notes?.trim()
    ? `<div style="margin-top:20px;background:#f0f7ff;border-left:4px solid #4285F4;border-radius:6px;padding:14px 16px">
        <div style="font-size:11px;font-weight:700;color:#4285F4;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Missatge de ${escHtml(absent)}</div>
        <p style="margin:0;font-size:14px;color:#1a1a1a;line-height:1.6">${escHtml(notes.trim()).replace(/\n/g, '<br>')}</p>
      </div>`
    : '';
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;background:#f9f9f9;border-radius:12px">
      <div style="background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a">Hola, <strong>${escHtml(firstName)}</strong></p>
        <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:18px">📋 ${esFutura ? 'Cobertura provisional assignada' : 'Cobertura assignada per avui'}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#666;width:110px">Nom</td><td style="padding:8px 0;font-weight:600">${escHtml(cobrint)}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Data</td><td style="padding:8px 0">${dataFmt}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Horari</td><td style="padding:8px 0;font-weight:600">${horariText || '—'}</td></tr>
          ${grup ? `<tr><td style="padding:8px 0;color:#666">Grup</td><td style="padding:8px 0">${escHtml(grup)}</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#666">Substitueix</td><td style="padding:8px 0">${escHtml(absent)}</td></tr>
        </table>
        ${notesHtml}
        <div style="margin-top:24px;text-align:center">
          <a href="${APP_URL}?escola=${escolaKey}&page=tc" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
            Veure la meva cobertura a GDOCENT →
          </a>
        </div>
      </div>
    </div>`;
}
