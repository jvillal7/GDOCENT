import { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import Spinner from '../../../components/Spinner';

export default function OriolCeepsirPage() {
  const { api, showToast } = useApp();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const avui = new Date().toISOString().split('T')[0];
  const dataLabel = new Date().toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  useEffect(() => { if (api) load(); }, [api]);

  async function load() {
    setLoading(true);
    try {
      const res = await api.getOriolDiari();
      const stored = res?.[0]?.oriol_ceepsir;
      setText(stored?.data === avui ? (stored.text || '') : '');
    } catch { setText(''); }
    finally { setLoading(false); }
  }

  async function guardar() {
    setSaving(true);
    try {
      await api.saveOriolCeepsir({ text, data: avui });
      showToast('✓ Guardat');
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="page-hdr">
        <h1>Actuacions CEEPSIR</h1>
        <p>Notes del dia · s'esborra automàticament cada dia</p>
      </div>

      <div className="alert alert-amber" style={{ fontSize: 12.5, marginBottom: 12 }}>
        📅 Cada matí aquest apartat apareixerà en blanc per al nou dia.
      </div>

      <div className="card">
        <div className="card-head" style={{ padding: '10px 14px' }}>
          <h3 style={{ fontSize: 13 }}>Avui · {dataLabel}</h3>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
        ) : (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <textarea
              className="f-ctrl"
              rows={10}
              placeholder={'Escriu aquí les actuacions CEEPSIR del dia...\n\nEx:\n• Valoració alumne G3 (9:30–10:30)\n• Reunió coordinació EAP — sala direcció\n• Seguiment pla individualitzat G7'}
              value={text}
              onChange={e => setText(e.target.value)}
              style={{ fontSize: 13, lineHeight: 1.7, resize: 'vertical' }}
            />
            <button
              className="btn btn-full"
              style={{ padding: 13, background: 'var(--ink)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, borderRadius: 'var(--r-sm)', opacity: saving ? .6 : 1 }}
              disabled={saving}
              onClick={guardar}
            >
              {saving ? 'Guardant...' : '✓ Guardar'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
