import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { extractAndSaveCorreccio } from '../../lib/claude';
import Spinner from '../../components/Spinner';

// ── Normes del sistema ────────────────────────────────────────────────────────

const REGLES_DEFAULT = ['Cap grup sense cobrir'];

function parseNormes(text) {
  if (!text?.trim()) return [];
  return text.split('\n').map(l => l.replace(/^[-–•]\s*/, '').trim()).filter(Boolean);
}

function serializeNormes(normes) {
  return normes.map(n => `- ${n}`).join('\n');
}

function EditRow({ value, onChange, onConfirm, onCancel, saving, isNew }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      {isNew && (
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Nova norma</div>
      )}
      <textarea
        className="f-ctrl"
        rows={2}
        autoFocus
        placeholder="Escriu la norma aquí... (ex: Els especialistes d'EF no cobreixen grups d'infantil)"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ fontSize: 13, lineHeight: 1.5, resize: 'vertical', marginBottom: 8 }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onConfirm(); if (e.key === 'Escape') onCancel(); }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-green" style={{ fontSize: 13, padding: '7px 16px' }} onClick={onConfirm} disabled={saving || !value.trim()}>
          {saving ? 'Guardant...' : '✓ Guardar'}
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 13, padding: '7px 12px' }} onClick={onCancel}>Cancel·lar</button>
      </div>
    </div>
  );
}

function NormesPanel({ api, escola, normes, setNormes, showToast }) {
  const [items,       setItems]       = useState([]);
  const [editing,     setEditing]     = useState(null);
  const [draft,       setDraft]       = useState('');
  const [saving,      setSaving]      = useState(false);
  const [loaded,      setLoaded]      = useState(false);
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [dragIdx,     setDragIdx]     = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  useEffect(() => {
    if (normes !== undefined) { setItems(parseNormes(normes)); setLoaded(true); }
  }, [normes]);

  async function persistItems(newItems) {
    setSaving(true);
    try {
      const text = serializeNormes(newItems);
      await api.saveNormesIA(text);
      setNormes(text);
      showToast('Normes guardades');
    } catch (e) { showToast('Error guardant: ' + e.message); }
    finally { setSaving(false); }
  }

  function startNew()   { setDraft(''); setEditing('new'); }
  function startEdit(i) { setDraft(items[i]); setEditing(i); }
  function cancelEdit() { setEditing(null); setDraft(''); }

  async function confirmEdit() {
    if (!draft.trim()) return;
    const newItems = editing === 'new'
      ? [...items, draft.trim()]
      : items.map((it, i) => i === editing ? draft.trim() : it);
    setItems(newItems); setEditing(null); setDraft('');
    await persistItems(newItems);
  }

  async function deleteItem(i) {
    const newItems = items.filter((_, idx) => idx !== i);
    setItems(newItems);
    await persistItems(newItems);
  }

  function handleDragStart(i) { setDragIdx(i); }
  function handleDragOver(e, i) { e.preventDefault(); if (i !== dragOverIdx) setDragOverIdx(i); }
  async function handleDrop(i) {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOverIdx(null); return; }
    const newItems = [...items];
    const [moved] = newItems.splice(dragIdx, 1);
    newItems.splice(i, 0, moved);
    setItems(newItems); setDragIdx(null); setDragOverIdx(null);
    await persistItems(newItems);
  }
  function handleDragEnd() { setDragIdx(null); setDragOverIdx(null); }

  return (
    <>
      {/* Normes per defecte */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head" onClick={() => setDefaultOpen(o => !o)} style={{ cursor: 'pointer', userSelect: 'none' }}>
          <h3>Normes per defecte del sistema</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="sp sp-ink">S'apliquen sempre</span>
            <span style={{ fontSize: 13, color: 'var(--ink-3)', transition: 'transform .2s', display: 'inline-block', transform: defaultOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
          </div>
        </div>
        {defaultOpen && (
          <div style={{ padding: '8px 16px 14px' }}>
            {REGLES_DEFAULT.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700, minWidth: 18 }}>{i + 1}.</span>
                <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{r}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Normes del centre */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h3>Normes específiques del centre</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {editing !== 'new' && (
              <button className="btn btn-sm" style={{ background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green)', fontSize: 13, fontWeight: 600, padding: '6px 14px' }} onClick={startNew}>
                + Nova norma
              </button>
            )}
            <span className="sp sp-blue">{items.length} normes</span>
          </div>
        </div>
        <div style={{ padding: '8px 16px 14px' }}>
          {!loaded ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--ink-3)', fontSize: 13 }}>Carregant...</div>
          ) : (
            <>
              {items.length === 0 && editing !== 'new' && (
                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                  Sense normes específiques. S'aplicaran només les normes per defecte.
                </div>
              )}
              {items.map((item, i) => (
                <div key={i} draggable={editing !== i}
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={e => handleDragOver(e, i)}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={handleDragEnd}
                  style={{ borderTop: dragOverIdx === i && dragIdx !== i ? '2px solid var(--blue)' : '2px solid transparent', opacity: dragIdx === i ? 0.4 : 1, transition: 'opacity .15s' }}
                >
                  {editing === i ? (
                    <EditRow value={draft} onChange={setDraft} onConfirm={confirmEdit} onCancel={cancelEdit} saving={saving} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                      <span title="Arrossega per reordenar" style={{ fontSize: 15, color: 'var(--ink-4)', cursor: 'grab', paddingTop: 1, userSelect: 'none', flexShrink: 0 }}>⠿</span>
                      <span style={{ fontSize: 12, color: 'var(--ink-4)', fontWeight: 700, minWidth: 20, paddingTop: 2 }}>{i + 1}.</span>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{item}</span>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px', background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'var(--blue)' }} onClick={() => startEdit(i)}>Editar</button>
                        <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, padding: '3px 7px', color: 'var(--red)' }} onClick={() => deleteItem(i)}>✕</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {editing === 'new' && (
                <EditRow value={draft} onChange={setDraft} onConfirm={confirmEdit} onCancel={cancelEdit} saving={saving} isNew />
              )}
            </>
          )}
        </div>
      </div>

      <div className="alert alert-blue" style={{ fontSize: 12.5 }}>
        🤖 La IA llegeix aquestes normes cada vegada que proposa una cobertura. Els canvis s'apliquen immediatament a la propera consulta.
      </div>
    </>
  );
}

// ── Normes apreses ────────────────────────────────────────────────────────────

function NormesApresPanel({ api, escola, chatCorreccions, setChatCorreccions }) {
  const [correccions,    setCorreccions]    = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [nova,           setNova]           = useState('');
  const [saving,         setSaving]         = useState(false);
  const [analitzant,     setAnalitzant]     = useState(false);
  const [progres,        setProgres]        = useState(null);
  const [editingId,      setEditingId]      = useState(null);
  const [editingDraft,   setEditingDraft]   = useState('');

  useEffect(() => {
    if (!api) return;
    api.getChatCorrectionsAll()
      .then(data => setCorreccions(data || []))
      .catch(() => setCorreccions([]))
      .finally(() => setLoading(false));
  }, [api]);

  async function analitzarPassades() {
    if (!escola?.id) return;
    setAnalitzant(true);
    setProgres(null);
    try {
      // Obtenir logs amb correccions (num_missatges >= 3)
      const logs = await api.getChatLogsAmbCorreccions().catch(() => []);
      // Filtrar: han de tenir >1 missatge d'usuari real
      const logsAmbCors = (logs || []).filter(l => {
        const missatges = l.missatges || [];
        const userMsgs = missatges.filter(m => m.role === 'user');
        return userMsgs.length > 1;
      });
      // Excloure els que ja tienen una correcció associada
      const jaProcessats = new Set((correccions || []).map(c => c.chat_log_id).filter(Boolean));
      const aProcesar = logsAmbCors.filter(l => !jaProcessats.has(l.id));

      if (aProcesar.length === 0) {
        setProgres({ actual: 0, total: 0, missatge: 'Totes les converses ja estan analitzades.' });
        return;
      }

      setProgres({ actual: 0, total: aProcesar.length, missatge: '' });

      for (let i = 0; i < aProcesar.length; i++) {
        const log = aProcesar[i];
        setProgres({ actual: i + 1, total: aProcesar.length, missatge: `Analitzant conversa ${i + 1} de ${aProcesar.length}…` });
        await extractAndSaveCorreccio(log.missatges || [], escola.id, log.id);
        // Pausa breu per no sobrecarregar l'API
        if (i < aProcesar.length - 1) await new Promise(r => setTimeout(r, 800));
      }

      // Recarregar totes les correccions
      const novaLlista = await api.getChatCorrectionsAll().catch(() => []);
      setCorreccions(novaLlista || []);
      recarregarActives();
      setProgres({ actual: aProcesar.length, total: aProcesar.length, missatge: `Fet! S'han analitzat ${aProcesar.length} conversa${aProcesar.length > 1 ? 'es' : ''}.` });
    } catch (e) {
      setProgres({ actual: 0, total: 0, missatge: `Error: ${e.message}` });
    } finally {
      setAnalitzant(false);
    }
  }

  async function recarregarActives() {
    api.getChatCorrections().then(data => { if (data) setChatCorreccions(data); }).catch(() => {});
  }

  async function confirmar(id) {
    await api.updateChatCorrection(id, { confirmada: true, activa: true });
    setCorreccions(prev => prev.map(c => c.id === id ? { ...c, confirmada: true, activa: true } : c));
    recarregarActives();
  }

  async function guardarEdicio(id) {
    if (!editingDraft.trim()) return;
    await api.updateChatCorrection(id, { regla: editingDraft.trim() });
    setCorreccions(prev => prev.map(c => c.id === id ? { ...c, regla: editingDraft.trim() } : c));
    setEditingId(null);
    setEditingDraft('');
  }

  async function toggleActiva(c) {
    const novaActiva = !c.activa;
    await api.updateChatCorrection(c.id, { activa: novaActiva });
    setCorreccions(prev => prev.map(x => x.id === c.id ? { ...x, activa: novaActiva } : x));
    recarregarActives();
  }

  async function eliminar(id) {
    await api.deleteChatCorrection(id);
    setCorreccions(prev => prev.filter(c => c.id !== id));
    recarregarActives();
  }

  async function afegirManual() {
    if (!nova.trim() || !escola?.id) return;
    setSaving(true);
    try {
      const saved = await api.saveChatCorrection({ escola_id: escola.id, regla: nova.trim(), auto: false, confirmada: true, activa: true });
      const nova_entry = saved?.[0] || { id: Date.now(), regla: nova.trim(), activa: true, confirmada: true, auto: false, creat_el: new Date().toISOString() };
      setCorreccions(prev => [nova_entry, ...(prev || [])]);
      setNova('');
      recarregarActives();
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ padding: '40px 0', textAlign: 'center' }}><Spinner /></div>;

  const pendents  = (correccions || []).filter(c => !c.confirmada);
  const actives   = (correccions || []).filter(c => c.confirmada && c.activa);
  const inactives = (correccions || []).filter(c => c.confirmada && !c.activa);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Analitzar converses passades */}
      {(correccions || []).length === 0 && !analitzant && !progres && (
        <div style={{ padding: '16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>Cap regla apresa encara</div>
          <div style={{ fontSize: 12, color: '#a16207', marginBottom: 12 }}>
            Les regles s'extreuen automàticament quan el xat detecta correccions.<br />
            Pots analitzar ara les converses passades per extreure les regles acumulades.
          </div>
          <button className="btn btn-sm" style={{ background: '#f59e0b', color: '#fff', border: 'none' }} onClick={analitzarPassades}>
            🔍 Analitzar converses passades
          </button>
        </div>
      )}

      {analitzant && progres && (
        <div style={{ padding: '14px 16px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Spinner size={14} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{progres.missatge}</span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--ink)', borderRadius: 3, width: progres.total > 0 ? `${(progres.actual / progres.total) * 100}%` : '0%', transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>{progres.actual} / {progres.total} converses analitzades</div>
        </div>
      )}

      {!analitzant && progres && (
        <div style={{ padding: '12px 16px', background: progres.missatge.startsWith('Error') ? '#fef2f2' : 'var(--green-bg)', border: `1px solid ${progres.missatge.startsWith('Error') ? '#fca5a5' : 'var(--green-mid)'}`, borderRadius: 10, fontSize: 13, color: progres.missatge.startsWith('Error') ? '#dc2626' : 'var(--green)' }}>
          {progres.missatge}
        </div>
      )}

      {/* Botó d'analitzar quan ja hi ha correccions però vols re-analitzar */}
      {(correccions || []).length > 0 && !analitzant && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-sm btn-ghost" onClick={analitzarPassades} style={{ fontSize: 11 }}>
            🔍 Re-analitzar converses passades
          </button>
        </div>
      )}

      {/* Afegir manual */}
      <div className="card">
        <div className="card-head"><h3>Afegir regla manualment</h3></div>
        <div style={{ padding: '8px 16px 14px' }}>
          <textarea
            className="f-ctrl"
            rows={2}
            placeholder='Ex: "Mai proposar X per a cobertures de matí si ja té suport a la franja"'
            value={nova}
            onChange={e => setNova(e.target.value)}
            style={{ width: '100%', fontSize: 13, resize: 'none', marginBottom: 8 }}
          />
          <button className="btn btn-green btn-sm" onClick={afegirManual} disabled={saving || !nova.trim()}>
            {saving ? <Spinner size={12} /> : '+ Afegir regla'}
          </button>
        </div>
      </div>

      {/* Pendents de confirmació */}
      {pendents.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>🔔 Pendents de revisió</h3>
            <span className="sp" style={{ background: '#fef3c7', color: '#92400e' }}>{pendents.length} auto-detectades</span>
          </div>
          <div style={{ padding: '8px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 4px' }}>
              La IA ha detectat errors en converses passades i ha generat aquestes regles. Revisa-les i confirma les que siguin correctes.
            </p>
            {pendents.map(c => (
              <div key={c.id} style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
                {editingId === c.id ? (
                  <>
                    <textarea
                      className="f-ctrl"
                      rows={3}
                      autoFocus
                      value={editingDraft}
                      onChange={e => setEditingDraft(e.target.value)}
                      style={{ fontSize: 13, lineHeight: 1.5, resize: 'vertical', marginBottom: 8, background: '#fffde7' }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-green" onClick={() => guardarEdicio(c.id)} disabled={!editingDraft.trim()}>✓ Guardar canvis</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => { setEditingId(null); setEditingDraft(''); }}>Cancel·lar</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>{c.regla}</div>
                    {c.exemple && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8 }}>Error detectat: {c.exemple}</div>}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-green" onClick={() => confirmar(c.id)}>✓ Confirmar i activar</button>
                      <button className="btn btn-sm btn-ghost" style={{ color: 'var(--blue)' }} onClick={() => { setEditingId(c.id); setEditingDraft(c.regla); }}>✏️ Editar</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => eliminar(c.id)}>✕ Descartar</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regles actives */}
      <div className="card">
        <div className="card-head">
          <h3>Regles actives</h3>
          <span className="sp sp-green">{actives.length} injectades al xat</span>
        </div>
        <div style={{ padding: '8px 16px 14px' }}>
          {actives.length === 0 ? (
            <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              Cap regla activa. Confirma les pendents o afegeix-ne de manuals.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {actives.map((c, i) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-4)', fontWeight: 700, minWidth: 20, paddingTop: 2 }}>{i + 1}.</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>⛔ {c.regla}</div>
                    {c.exemple && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>Error original: {c.exemple}</div>}
                    <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 2 }}>{c.auto ? 'Auto-detectada' : 'Manual'} · {c.creat_el?.slice(0, 10)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => toggleActiva(c)} title="Desactivar">⏸</button>
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)' }} onClick={() => eliminar(c.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Regles inactives */}
      {inactives.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>Desactivades</h3>
            <span className="sp sp-ink">{inactives.length}</span>
          </div>
          <div style={{ padding: '8px 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {inactives.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', opacity: 0.65 }}>
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.regla}</span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => toggleActiva(c)} title="Reactivar">▶</button>
                  <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)' }} onClick={() => eliminar(c.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="alert alert-blue" style={{ fontSize: 12.5 }}>
        🧠 Les regles actives s'injecten automàticament al system prompt de <strong>totes les converses</strong> del xat Horaria, amb màxima prioritat per sobre de qualsevol altra instrucció.
      </div>
    </div>
  );
}

// ── Pàgina principal ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const { api, escola, normes, setNormes, chatCorreccions, setChatCorreccions, showToast } = useApp();
  const [panel, setPanel] = useState('normes'); // 'normes' | 'apreses'

  const pendents = (chatCorreccions || []).filter(c => !c.confirmada).length;

  return (
    <>
      <div className="page-hdr">
        <h1>Normes IA</h1>
        <p>Regles que la IA seguirà per proposar cobertures a {escola?.nom}</p>
      </div>

      {/* Selector 50/50 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <button
          onClick={() => setPanel('normes')}
          style={{
            padding: '14px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
            background: panel === 'normes' ? 'var(--ink)' : 'var(--surface)',
            border: panel === 'normes' ? '2px solid var(--ink)' : '2px solid var(--border)',
            color: panel === 'normes' ? 'var(--surface)' : 'var(--ink)',
            transition: 'all .18s',
          }}
        >
          <div style={{ fontSize: 18, marginBottom: 4 }}>📋</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Normes del sistema</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Regles manuals del centre</div>
        </button>
        <button
          onClick={() => setPanel('apreses')}
          style={{
            padding: '14px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', position: 'relative',
            background: panel === 'apreses' ? 'var(--ink)' : 'var(--surface)',
            border: panel === 'apreses' ? '2px solid var(--ink)' : '2px solid var(--border)',
            color: panel === 'apreses' ? 'var(--surface)' : 'var(--ink)',
            transition: 'all .18s',
          }}
        >
          {pendents > 0 && (
            <span style={{
              position: 'absolute', top: 10, right: 10,
              background: '#ef4444', color: '#fff',
              fontSize: 10, fontWeight: 700,
              borderRadius: '50%', width: 18, height: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{pendents}</span>
          )}
          <div style={{ fontSize: 18, marginBottom: 4 }}>🧠</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Normes apreses</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Apreses dels errors del xat</div>
        </button>
      </div>

      {panel === 'normes' && (
        <NormesPanel api={api} escola={escola} normes={normes} setNormes={setNormes} showToast={showToast} />
      )}
      {panel === 'apreses' && (
        <NormesApresPanel api={api} escola={escola} chatCorreccions={chatCorreccions} setChatCorreccions={setChatCorreccions} />
      )}
    </>
  );
}
