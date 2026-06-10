import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { avatarColor, initials } from '../../lib/utils';
import { sendEmail } from '../../lib/api';
import { SCHOOL_FRANJES } from '../../lib/constants';
import { fmtData } from '../../lib/utils';
import Spinner from '../../components/Spinner';

// Franges sense pati ni dinar per a selector de devolució
const FRANJES_TP = SCHOOL_FRANJES.filter(f => !f.patio);

// Parseja franja_devolucio (pot ser JSON array o string legacy)
function parseFranjesDevolucio(raw) {
  if (!raw) return [];
  try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch {}
  return [raw]; // legacy: string simple
}

export default function TPPage() {
  const { api, docents, showToast } = useApp();
  const [deutes, setDeutes] = useState(null);

  useEffect(() => { if (api) load(); }, [api]);

  async function load() {
    try { setDeutes(await api.getDeutesTP()); }
    catch { setDeutes([]); }
  }

  async function marcarTornat(id) {
    try {
      await api.marcarDeuteTornat(id);
      showToast('Deute marcat com a tornat');
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  }

  async function programarDevolucio({ id, data, franjes, nota, docentNom, motiu, minuts }) {
    try {
      await api.programarDevolucioTP(id, data, franjes, nota);
      const docent = (docents || []).find(d => d.nom === docentNom);
      if (docent?.email) {
        const dataFmt = fmtData(data, { weekday: 'long' });
        const minsLabel = (minuts || 30) >= 60 ? `${(minuts || 30) / 60}h` : `${minuts || 30} min`;
        const franjesEntries = (franjes || []).map(id => FRANJES_TP.find(f => f.id === id)).filter(Boolean);
        const franjesLabel = franjesEntries.length
          ? franjesEntries.map(f => `${f.label} (${f.sub})`).join(', ')
          : null;
        await sendEmail(
          docent.email,
          'Devolució de TP programada',
          `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a1a">⏱️ Devolució de TP programada</h2>
            <p style="color:#555;font-size:14px;line-height:1.6">
              La cap d'estudis ha programat la devolució del teu Treball Personal.
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px">
              <tr><td style="padding:8px 0;color:#666;width:130px">Data de devolució</td><td style="padding:8px 0;font-weight:600;color:#1a1a1a">${dataFmt}</td></tr>
              ${franjesLabel ? `<tr><td style="padding:8px 0;color:#666">Franja horària</td><td style="padding:8px 0;font-weight:600;color:#1a1a1a">${franjesLabel}</td></tr>` : ''}
              <tr><td style="padding:8px 0;color:#666">Temps a recuperar</td><td style="padding:8px 0;font-weight:600;color:#1a1a1a">${minsLabel} de TP</td></tr>
              ${motiu ? `<tr><td style="padding:8px 0;color:#666;vertical-align:top">Motiu original</td><td style="padding:8px 0;color:#555">${motiu}</td></tr>` : ''}
            </table>
            ${nota ? `<div style="margin-top:16px;background:#f5f5f5;border-left:3px solid #7c3aed;padding:12px 14px;border-radius:0 8px 8px 0;font-size:13px;color:#333;line-height:1.6"><strong style="display:block;margin-bottom:4px;color:#7c3aed">Nota de la cap d'estudis</strong>${nota}</div>` : ''}
          </div>`
        ).catch(() => {});
      }
      showToast('✓ Devolució programada' + (docent?.email ? ' i notificació enviada' : ''));
      load();
    } catch (e) { showToast('Error: ' + e.message); }
  }

  const pendents   = (deutes || []).filter(d => !d.retornat);
  const sensData   = pendents.filter(d => !d.data_devolucio);
  const ambData    = pendents.filter(d => !!d.data_devolucio);
  const totalMins  = pendents.reduce((s, d) => s + (d.minuts || 30), 0);

  return (
    <>
      <div className="page-hdr">
        <h1>Treball Personal</h1>
        <p>Deutes pendents de devolució</p>
      </div>

      <div className="alert alert-blue" style={{ marginBottom: 14 }}>
        Quan un docent cobreix durant el seu TP, el sistema registra el deute. Pots marcar-lo com a tornat o programar una data de devolució.
      </div>

      {deutes == null ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : (
        <>
          {pendents.length > 0 && (
            <div className="kpi-grid" style={{ marginBottom: 16 }}>
              <div className="kpi k-amber">
                <div className="kpi-label">Deutes pendents</div>
                <div className="kpi-value">{pendents.length}</div>
                <div className="kpi-sub">{sensData.length} sense data · {ambData.length} programat{ambData.length !== 1 ? 's' : ''}</div>
              </div>
              <div className="kpi k-ink">
                <div className="kpi-label">Temps a retornar</div>
                <div className="kpi-value">{totalMins >= 60 ? `${totalMins / 60}h` : `${totalMins}min`}</div>
                <div className="kpi-sub">en {pendents.length} cobertura{pendents.length !== 1 ? 's' : ''}</div>
              </div>
            </div>
          )}

          {pendents.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
              Cap deute de TP pendent.
            </div>
          ) : (
            <>
              {sensData.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
                    Sense data de devolució
                  </div>
                  <div className="tp-grid">
                    {sensData.map(d => (
                      <TPCard key={d.id} d={d} onMarcar={marcarTornat} onProgramar={programarDevolucio} />
                    ))}
                  </div>
                </div>
              )}
              {ambData.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} />
                    Devolució programada
                  </div>
                  <div className="tp-grid">
                    {ambData.map(d => (
                      <TPCard key={d.id} d={d} onMarcar={marcarTornat} onProgramar={programarDevolucio} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

function TPCard({ d, onMarcar, onProgramar }) {
  const [showForm, setShowForm] = useState(false);
  const [dataForm,   setDataForm]   = useState('');
  const [franjesForm, setFranjesForm] = useState(new Set()); // multi-select
  const [notaForm,   setNotaForm]   = useState('');
  const [saving, setSaving] = useState(false);

  const color = avatarColor(d.docent_nom);
  const tensDevolucio = !!d.data_devolucio;
  const barColor = tensDevolucio ? 'var(--amber)' : 'var(--red)';
  const mins = d.minuts || 30;

  function toggleFranja(id) {
    setFranjesForm(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function obrirForm() {
    setDataForm(d.data_devolucio || '');
    const saved = parseFranjesDevolucio(d.franja_devolucio);
    setFranjesForm(new Set(saved));
    setNotaForm(d.nota_devolucio || '');
    setShowForm(true);
  }

  async function confirmarDevolucio() {
    if (!dataForm) return;
    setSaving(true);
    try {
      await onProgramar({
        id: d.id, data: dataForm,
        franjes: [...franjesForm],
        nota: notaForm,
        docentNom: d.docent_nom, motiu: d.motiu, minuts: mins,
      });
      setShowForm(false);
    } finally { setSaving(false); }
  }

  const franjesSaved = parseFranjesDevolucio(d.franja_devolucio);
  const franjesLabel = franjesSaved.map(id => FRANJES_TP.find(f => f.id === id)?.sub).filter(Boolean).join(', ');

  // Temps total que es retorna (franjes seleccionades × 30 min, o mínim el deute original)
  const minsSel = franjesForm.size * 30;
  const minsInfo = franjesForm.size > 0 ? (minsSel >= 60 ? `${minsSel / 60}h` : `${minsSel} min`) : null;

  return (
    <div className="tp-card">
      <div className="tp-card-bar" style={{ background: barColor }} />
      <div className="tp-card-body">
        {/* Docent */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
            {initials(d.docent_nom)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.docent_nom}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
              {mins >= 60 ? `${mins / 60}h` : `${mins} min`} de TP
            </div>
          </div>
          <span className={`sp ${tensDevolucio ? 'sp-amber' : 'sp-red'}`} style={{ flexShrink: 0, fontSize: 11 }}>
            {tensDevolucio ? '📅 Programat' : 'Pendent'}
          </span>
        </div>

        {/* Context */}
        <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px', color: 'var(--ink-2)' }}>
              🕐 {d.data_deute ? fmtData(d.data_deute, { weekday: 'short' }) : '—'}
            </span>
            {tensDevolucio && (
              <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--amber-bg)', border: '1px solid #F0D5A8', borderRadius: 5, padding: '2px 8px', color: 'var(--amber)' }}>
                📅 {fmtData(d.data_devolucio, { year: false })}
                {franjesLabel && ` · ${franjesLabel}`}
              </span>
            )}
          </div>
          {d.motiu && (
            <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>{d.motiu}</div>
          )}
          {d.nota_devolucio && !showForm && (
            <div style={{ fontSize: 12, color: 'var(--ink-2)', fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: 5, marginTop: 2 }}>
              💬 {d.nota_devolucio}
            </div>
          )}
        </div>

        {/* Formulari programar devolució */}
        {showForm && (
          <div style={{ background: 'var(--blue-bg)', border: '1px solid var(--blue)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>📅 Programar devolució</div>

            {/* Data */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>Data</label>
              <input
                type="date"
                className="f-ctrl"
                style={{ fontSize: 13 }}
                value={dataForm}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setDataForm(e.target.value)}
              />
            </div>

            {/* Franges (multi-select pills) */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' }}>Franja horària</label>
                <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>opcional · pots seleccionar més d'una</span>
                {minsInfo && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--blue)', background: 'var(--surface)', border: '1px solid var(--blue)', borderRadius: 10, padding: '1px 7px' }}>
                    {minsInfo}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {FRANJES_TP.map(f => {
                  const sel = franjesForm.has(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleFranja(f.id)}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 20,
                        border: `1.5px solid ${sel ? 'var(--blue)' : 'var(--border)'}`,
                        background: sel ? 'var(--blue)' : 'var(--surface)',
                        color: sel ? '#fff' : 'var(--ink-2)',
                        fontWeight: sel ? 700 : 400,
                        cursor: 'pointer',
                        transition: 'all .12s',
                      }}
                    >
                      {f.sub}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nota */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>
                Nota per al docent <span style={{ fontWeight: 400, color: 'var(--ink-4)' }}>(s'envia per email)</span>
              </label>
              <textarea
                className="f-ctrl"
                rows={3}
                placeholder="Ex: Vine a buscar-me al passadís quan acabis la classe de les 10h..."
                style={{ fontSize: 13, resize: 'vertical' }}
                value={notaForm}
                onChange={e => setNotaForm(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-sm btn-full"
                style={{ background: 'var(--blue)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, opacity: saving ? .6 : 1 }}
                disabled={!dataForm || saving}
                onClick={confirmarDevolucio}
              >
                {saving ? 'Guardant...' : '✓ Confirmar i notificar'}
              </button>
              <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => setShowForm(false)}>Cancel·lar</button>
            </div>
          </div>
        )}

        {/* Accions */}
        {!showForm && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-ghost btn-sm btn-full"
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', borderColor: 'var(--green-mid)' }}
              onClick={() => onMarcar(d.id)}
            >
              ✓ Marcar com a tornat
            </button>
            <button
              className="btn btn-ghost btn-sm btn-full"
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)', borderColor: 'var(--blue)' }}
              onClick={obrirForm}
            >
              📅 Programar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
