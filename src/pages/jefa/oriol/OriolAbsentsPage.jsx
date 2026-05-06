import { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { FRANJES_ORIOL, SCHOOL_FRANJES_ORIOL } from '../../../lib/constants';
import { parseFranges } from '../../../lib/utils';
import Spinner from '../../../components/Spinner';

function generarAutoText(absencies) {
  if (!absencies?.length) return '';
  const avui = new Date().toISOString().split('T')[0];
  const todayAbs = absencies.filter(a => a.data === avui && a.estat !== 'arxivat');
  if (!todayAbs.length) return '';
  return todayAbs.map(a => {
    const frangesIds = parseFranges(a.franges);
    const isTotElDia = frangesIds.length >= SCHOOL_FRANJES_ORIOL.length;
    if (isTotElDia) return `• ${a.docent_nom}: tot el dia`;
    const labels = [...new Set(
      frangesIds.map(fid => FRANJES_ORIOL.find(f => f.id === fid)?.label).filter(Boolean)
    )];
    return `• ${a.docent_nom}: ${labels.join(', ') || 'sense franges especificades'}`;
  }).join('\n');
}

export default function OriolAbsentsPage() {
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
      const [absRes, diariRes] = await Promise.all([
        api.getAbsenciesAvui(),
        api.getOriolDiari(),
      ]);
      const stored = diariRes?.[0]?.oriol_absents;
      if (stored?.data === avui && stored?.text != null) {
        setText(stored.text);
      } else {
        setText(generarAutoText(absRes));
      }
    } catch { setText(''); }
    finally { setLoading(false); }
  }

  async function regenerar() {
    setLoading(true);
    try {
      const absRes = await api.getAbsenciesAvui();
      setText(generarAutoText(absRes));
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setLoading(false); }
  }

  async function guardar() {
    setSaving(true);
    try {
      await api.saveOriolAbsents({ text, data: avui });
      showToast('✓ Guardat');
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="page-hdr">
        <h1>Persones que s'absenten</h1>
        <p>Resum diari d'absències del centre</p>
      </div>

      <div className="card">
        <div className="card-head" style={{ padding: '10px 14px' }}>
          <h3 style={{ fontSize: 13 }}>Avui · {dataLabel}</h3>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={regenerar}>
            ↺ Regenerar des d'avisos
          </button>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
        ) : (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <textarea
              className="f-ctrl"
              rows={9}
              placeholder={'Cap absència registrada avui.\nPots afegir informació manualment...'}
              value={text}
              onChange={e => setText(e.target.value)}
              style={{ fontSize: 13, lineHeight: 1.7, resize: 'vertical' }}
            />
            <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: 0 }}>
              Pots editar lliurement. Fes clic a "Regenerar" per tornar a llegir els avisos actuals.
            </p>
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
