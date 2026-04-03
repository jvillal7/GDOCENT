import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

const PLACEHOLDER = `Exemples de normes:
- Prioritzar docents de cicle inicial per cobrir grups de cicle inicial
- No assignar més de 2 cobertures al mateix docent en un dia
- La especialista de música no pot cobrir grups d'infantil
- Prioritzar tutors del mateix nivell`;

export default function AdminPage() {
  const { api, escola, normes, setNormes, showToast } = useApp();
  const [text,    setText]   = useState('');
  const [saving,  setSaving] = useState(false);
  const [loaded,  setLoaded] = useState(false);

  useEffect(() => {
    if (normes !== undefined) { setText(normes || ''); setLoaded(true); }
  }, [normes]);

  async function save() {
    setSaving(true);
    try {
      await api.saveNormesIA(text);
      setNormes(text);
      showToast('Normes guardades correctament');
    } catch (e) {
      showToast('Error guardant: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setText('');
  }

  return (
    <>
      <div className="page-hdr">
        <h1>Administració</h1>
        <p>{escola?.nom}</p>
      </div>

      <div className="alert alert-amber">⚙️ Accés total al sistema.</div>

      <div className="card">
        <div className="card-head">
          <h3>Normes per a la IA de cobertures</h3>
        </div>
        <div style={{ padding: '14px 16px' }}>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 12, lineHeight: 1.5 }}>
            Defineix les normes que la IA utilitzarà quan proposi cobertures. Si no n'hi ha, s'aplicaran les normes per defecte (repartiment equitatiu, prioritzar sense TP).
          </p>

          {!loaded ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--ink-3)', fontSize: 13 }}>Carregant...</div>
          ) : (
            <>
              <textarea
                className="f-ctrl"
                rows={10}
                placeholder={PLACEHOLDER}
                value={text}
                onChange={e => setText(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-green btn-full" style={{ padding: 12, fontSize: 14 }} disabled={saving} onClick={save}>
                  {saving ? 'Guardant...' : '💾 Guardar normes'}
                </button>
                <button className="btn btn-ghost" style={{ padding: 12 }} onClick={reset} title="Esborrar tot i usar normes per defecte">
                  ↺
                </button>
              </div>
              {!text.trim() && (
                <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 8 }}>
                  S'usaran les normes per defecte: repartiment equitatiu, prioritzar docents sense TP.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
