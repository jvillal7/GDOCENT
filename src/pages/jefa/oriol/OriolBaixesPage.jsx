import { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import Spinner from '../../../components/Spinner';

export default function OriolBaixesPage() {
  const { api, showToast } = useApp();
  const [baixes, setBaixes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [formAbsent, setFormAbsent] = useState('');
  const [formSubstitut, setFormSubstitut] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => { if (api) load(); }, [api]);

  async function load() {
    setLoading(true);
    try {
      const res = await api.getOriolDiari();
      setBaixes(res?.[0]?.oriol_baixes || []);
    } catch { setBaixes([]); }
    finally { setLoading(false); }
  }

  function openAdd() {
    setEditIdx(null);
    setFormAbsent(''); setFormSubstitut(''); setFormNotes('');
    setShowForm(true);
  }

  function openEdit(idx) {
    const b = baixes[idx];
    setEditIdx(idx);
    setFormAbsent(b.absent || '');
    setFormSubstitut(b.substitut || '');
    setFormNotes(b.notes || '');
    setShowForm(true);
  }

  async function guardarForm() {
    if (!formAbsent.trim() || !formSubstitut.trim()) return showToast('Introdueix els dos noms');
    const item = { absent: formAbsent.trim(), substitut: formSubstitut.trim(), notes: formNotes.trim() };
    const nova = editIdx != null
      ? baixes.map((b, i) => i === editIdx ? item : b)
      : [...baixes, item];
    try {
      await api.saveOriolBaixes(nova);
      setBaixes(nova);
      setShowForm(false);
      showToast(editIdx != null ? '✓ Actualitzat' : '✓ Afegit');
    } catch (e) { showToast('Error: ' + e.message); }
  }

  async function eliminar(idx) {
    const nova = baixes.filter((_, i) => i !== idx);
    try {
      await api.saveOriolBaixes(nova);
      setBaixes(nova);
      showToast('Entrada eliminada');
    } catch (e) { showToast('Error: ' + e.message); }
  }

  return (
    <>
      <div className="page-hdr">
        <h1>Baixes cobertes amb substitucions</h1>
        <p>Docents en baixa llarga i el seu substitut assignat</p>
      </div>

      <div className="alert alert-blue" style={{ fontSize: 12.5, marginBottom: 12 }}>
        ℹ️ La IA llegeix aquesta llista. Si un docent de baixa té substitut, la IA entendrà que el substitut fa el seu horari i les seves cobertures com si fos ell/ella.
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            {baixes.length === 0 && !showForm && (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
                Cap baixa registrada.
              </div>
            )}
            {baixes.map((b, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{b.absent}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>→</span>
                    <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>Substitut: {b.substitut}</span>
                  </div>
                  {b.notes && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }}>{b.notes}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => openEdit(idx)}>✏️</button>
                  <button className="btn btn-red-soft btn-sm" style={{ fontSize: 12 }} onClick={() => eliminar(idx)}>🗑️</button>
                </div>
              </div>
            ))}

            {showForm && (
              <div style={{ padding: 14, borderTop: baixes.length ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  {editIdx != null ? 'Editar baixa' : 'Nova baixa'}
                </div>
                <div>
                  <label className="f-label">Docent de baixa</label>
                  <input
                    className="f-ctrl"
                    placeholder="Nom complet del docent"
                    value={formAbsent}
                    onChange={e => setFormAbsent(e.target.value)}
                  />
                </div>
                <div>
                  <label className="f-label">Substitut/a</label>
                  <input
                    className="f-ctrl"
                    placeholder="Nom del substitut o substituta"
                    value={formSubstitut}
                    onChange={e => setFormSubstitut(e.target.value)}
                  />
                </div>
                <div>
                  <label className="f-label">Notes (opcional)</label>
                  <input
                    className="f-ctrl"
                    placeholder="Ex: Baixa des del 01/03/2026 · Grup G5"
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-green btn-full" onClick={guardarForm}>✓ Guardar</button>
                  <button className="btn btn-ghost btn-full" onClick={() => setShowForm(false)}>Cancel·lar</button>
                </div>
              </div>
            )}
          </div>

          {!showForm && (
            <button
              className="btn btn-full"
              style={{ padding: 13, background: 'var(--ink)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, borderRadius: 'var(--r)' }}
              onClick={openAdd}
            >
              + Afegir baixa
            </button>
          )}
        </>
      )}
    </>
  );
}
