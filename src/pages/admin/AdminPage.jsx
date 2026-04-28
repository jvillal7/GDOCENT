import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

const REGLES_DEFAULT = [
  'Cap grup sense cobrir',
  'Un sol docent per a tota l\'absència. Si és tot el dia i no pot ser el mateix, un docent pel matí i un per la tarda',
];

function parseNormes(text) {
  if (!text?.trim()) return [];
  return text.split('\n').map(l => l.replace(/^[-–•]\s*/, '').trim()).filter(Boolean);
}

function serializeNormes(normes) {
  return normes.map(n => `- ${n}`).join('\n');
}

export default function AdminPage() {
  const { api, escola, normes, setNormes, showToast } = useApp();
  const [items,        setItems]        = useState([]);
  const [editing,      setEditing]      = useState(null);
  const [draft,        setDraft]        = useState('');
  const [saving,       setSaving]       = useState(false);
  const [loaded,       setLoaded]       = useState(false);
  const [defaultOpen,  setDefaultOpen]  = useState(false);

  useEffect(() => {
    if (normes !== undefined) {
      setItems(parseNormes(normes));
      setLoaded(true);
    }
  }, [normes]);

  async function persistItems(newItems) {
    setSaving(true);
    try {
      const text = serializeNormes(newItems);
      await api.saveNormesIA(text);
      setNormes(text);
      showToast('Normes guardades');
    } catch (e) {
      showToast('Error guardant: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function startNew() {
    setDraft('');
    setEditing('new');
  }

  function startEdit(i) {
    setDraft(items[i]);
    setEditing(i);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft('');
  }

  async function confirmEdit() {
    if (!draft.trim()) return;
    let newItems;
    if (editing === 'new') {
      newItems = [...items, draft.trim()];
    } else {
      newItems = items.map((it, i) => i === editing ? draft.trim() : it);
    }
    setItems(newItems);
    setEditing(null);
    setDraft('');
    await persistItems(newItems);
  }

  async function deleteItem(i) {
    const newItems = items.filter((_, idx) => idx !== i);
    setItems(newItems);
    await persistItems(newItems);
  }

  async function moveItem(i, dir) {
    const newItems = [...items];
    const target = i + dir;
    if (target < 0 || target >= newItems.length) return;
    [newItems[i], newItems[target]] = [newItems[target], newItems[i]];
    setItems(newItems);
    await persistItems(newItems);
  }

  return (
    <>
      <div className="page-hdr">
        <h1>Normes IA</h1>
        <p>Regles que la IA seguirà per proposar cobertures a {escola?.nom}</p>
      </div>

      {/* Normes per defecte — desplegable */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div
          className="card-head"
          onClick={() => setDefaultOpen(o => !o)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
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
              <button
                className="btn btn-sm"
                style={{ background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green)', fontSize: 13, fontWeight: 600, padding: '6px 14px' }}
                onClick={startNew}
              >
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
                <div key={i}>
                  {editing === i ? (
                    <EditRow
                      value={draft}
                      onChange={setDraft}
                      onConfirm={confirmEdit}
                      onCancel={cancelEdit}
                      saving={saving}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--ink-4)', fontWeight: 700, minWidth: 20, paddingTop: 2 }}>{i + 1}.</span>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{item}</span>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, padding: '3px 7px' }} onClick={() => moveItem(i, -1)} disabled={i === 0} title="Pujar">↑</button>
                        <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, padding: '3px 7px' }} onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} title="Baixar">↓</button>
                        <button className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px', background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'var(--blue)' }} onClick={() => startEdit(i)}>Editar</button>
                        <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, padding: '3px 7px', color: 'var(--red)' }} onClick={() => deleteItem(i)}>✕</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {editing === 'new' && (
                <EditRow
                  value={draft}
                  onChange={setDraft}
                  onConfirm={confirmEdit}
                  onCancel={cancelEdit}
                  saving={saving}
                  isNew
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="alert alert-blue" style={{ fontSize: 12.5 }}>
        🤖 La IA llegeix aquestes normes cada vegada que proposa una cobertura. Els canvis s'apliquen immediatament a la propera consulta.
      </div>
    </>
  );
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
