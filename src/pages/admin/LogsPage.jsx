import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SUPA_URL, SUPA_KEY } from '../../lib/constants';
import { fmtData } from '../../lib/utils';
import { extractAndSaveCorreccio } from '../../lib/claude';
import Spinner from '../../components/Spinner';

async function fetchChatLogs(escolaId, limit = 50) {
  const url = new URL(`${SUPA_URL}/rest/v1/chat_logs`);
  url.searchParams.set('escola_id', `eq.${escolaId}`);
  url.searchParams.set('order', 'creat_el.desc');
  url.searchParams.set('limit', limit);
  const res = await fetch(url, {
    headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` },
  });
  if (!res.ok) throw new Error('Error carregant logs');
  return res.json();
}

function formatData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return fmtData(iso.split('T')[0]) + ' ' + d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
}

function BadgeResultat({ resultat }) {
  const cfg = {
    aprovada:   { bg: 'var(--green-bg)',  color: 'var(--green)',   label: 'Aprovada' },
    abandonada: { bg: 'var(--bg-2)',      color: 'var(--ink-3)',   label: 'Abandonada' },
  };
  const s = cfg[resultat] || { bg: '#fef3c7', color: '#92400e', label: resultat || 'Desconegut' };
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.color, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function LogDetall({ log, onClose, onExtreureRegla }) {
  const missatges = log.missatges || [];
  const userMsgs = missatges.filter(m => m.role === 'user');
  const teCorreccions = userMsgs.length > 1;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)' }} onClick={onClose} />
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 520, height: '90vh',
        background: 'var(--surface)', borderRadius: '16px 0 0 0',
        display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 32px rgba(0,0,0,.2)',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {log.docent_absent ? `Conversa — ${log.docent_absent}` : 'Conversa general'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
              {formatData(log.creat_el)} · {missatges.length} missatges · <BadgeResultat resultat={log.resultat} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {teCorreccions && (
              <button
                className="btn btn-sm"
                style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
                onClick={() => onExtreureRegla(log)}
                title="Extreure regla apresa d'aquesta conversa"
              >
                🧠 Extreure regla
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        {teCorreccions && (
          <div style={{ padding: '8px 16px', background: '#fffbeb', borderBottom: '1px solid #fde68a', fontSize: 11, color: '#92400e' }}>
            ⚠️ La cap d'estudis ha fet {userMsgs.length - 1} correcció{userMsgs.length > 2 ? 's' : ''} en aquesta conversa
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {missatges.map((m, i) => {
            const isUser = m.role === 'user';
            const cleanContent = (m.content || '').replace(/<proposta>[\s\S]*?<\/proposta>/gi, '').trim();
            return (
              <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '88%', padding: '8px 12px', borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: isUser ? 'var(--ink)' : 'var(--bg-2)',
                  color: isUser ? 'var(--surface)' : 'var(--ink)',
                  fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  outline: (isUser && i > 0) ? '2px solid #f59e0b' : 'none',
                }}>
                  {isUser && i > 0 && <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, marginBottom: 3 }}>CORRECCIÓ</div>}
                  {cleanContent}
                </div>
              </div>
            );
          })}

          {log.proposta_aprovada && (
            <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--green-bg)', border: '1px solid var(--green-mid)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 6 }}>Proposta aprovada</div>
              {(log.proposta_aprovada || []).map((p, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.6 }}>
                  {p.hores} — <strong>{p.docent}</strong>{p.motiu ? ` · ${p.motiu}` : ''}{p.tp_afectat ? ' ⚠TP' : ''}
                </div>
              ))}
            </div>
          )}

          {log.error_msg && (
            <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
              Error: {log.error_msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CorreccionsTab({ api, escola, setChatCorreccions }) {
  const [correccions, setCorreccions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nova, setNova] = useState('');
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    if (!api) return;
    api.getChatCorrectionsAll()
      .then(data => setCorreccions(data || []))
      .catch(() => setCorreccions([]))
      .finally(() => setLoading(false));
  }, [api]);

  async function confirmar(id) {
    await api.updateChatCorrection(id, { confirmada: true, activa: true });
    setCorreccions(prev => prev.map(c => c.id === id ? { ...c, confirmada: true, activa: true } : c));
    // Recarregar correccions actives al context
    api.getChatCorrections().then(data => { if (data) setChatCorreccions(data); }).catch(() => {});
  }

  async function toggleActiva(c) {
    const novaActiva = !c.activa;
    await api.updateChatCorrection(c.id, { activa: novaActiva });
    setCorreccions(prev => prev.map(x => x.id === c.id ? { ...x, activa: novaActiva } : x));
    api.getChatCorrections().then(data => { if (data) setChatCorreccions(data); }).catch(() => {});
  }

  async function eliminar(id) {
    await api.deleteChatCorrection(id);
    setCorreccions(prev => prev.filter(c => c.id !== id));
    api.getChatCorrections().then(data => { if (data) setChatCorreccions(data); }).catch(() => {});
  }

  async function afegirManual() {
    if (!nova.trim() || !escola?.id) return;
    setSaving(true);
    try {
      const saved = await api.saveChatCorrection({
        escola_id: escola.id,
        regla: nova.trim(),
        auto: false,
        confirmada: true,
        activa: true,
      });
      setCorreccions(prev => [saved?.[0] || { id: Date.now(), regla: nova.trim(), activa: true, confirmada: true, auto: false, creat_el: new Date().toISOString() }, ...prev]);
      setNova('');
      api.getChatCorrections().then(data => { if (data) setChatCorreccions(data); }).catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: '40px 0', textAlign: 'center' }}><Spinner /></div>;

  const pendents = (correccions || []).filter(c => !c.confirmada);
  const actives  = (correccions || []).filter(c => c.confirmada && c.activa);
  const inactives = (correccions || []).filter(c => c.confirmada && !c.activa);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Afegir manual */}
      <div style={{ padding: '14px 16px', background: 'var(--bg-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Afegir regla manualment</div>
        <textarea
          className="f-ctrl"
          rows={2}
          placeholder='Ex: "Mai proposar M.V per a cobertures de matí si ja té suport a la franja"'
          value={nova}
          onChange={e => setNova(e.target.value)}
          style={{ width: '100%', fontSize: 13, resize: 'none', marginBottom: 8 }}
        />
        <button className="btn btn-primary btn-sm" onClick={afegirManual} disabled={saving || !nova.trim()}>
          {saving ? <Spinner size={12} /> : '+ Afegir regla'}
        </button>
      </div>

      {/* Pendents de confirmació */}
      {pendents.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#92400e' }}>
            🔔 Pendents de revisió ({pendents.length})
            <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6, color: 'var(--ink-3)' }}>
              Detectades automàticament per la IA
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendents.map(c => (
              <div key={c.id} style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>
                  {c.regla}
                </div>
                {c.exemple && (
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8 }}>
                    Error detectat: {c.exemple}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm btn-green" onClick={() => confirmar(c.id)}>✓ Confirmar i activar</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => eliminar(c.id)}>✕ Descartar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regles actives */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
          Regles actives ({actives.length})
          <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6, color: 'var(--ink-3)' }}>
            S'injecten al system prompt de totes les converses
          </span>
        </div>
        {actives.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>Cap regla activa encara.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {actives.map((c, i) => (
              <div key={c.id} style={{ padding: '12px 14px', background: 'var(--green-bg)', border: '1px solid var(--green-mid)', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 2 }}>Regla #{i + 1} · {c.auto ? 'Auto-detectada' : 'Manual'}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink)' }}>⛔ {c.regla}</div>
                    {c.exemple && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>Error original: {c.exemple}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => toggleActiva(c)} title="Desactivar">⏸</button>
                    <button className="btn btn-sm btn-ghost" style={{ color: '#dc2626' }} onClick={() => eliminar(c.id)} title="Eliminar">✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Regles inactives */}
      {inactives.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--ink-3)' }}>Desactivades ({inactives.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {inactives.map(c => (
              <div key={c.id} style={{ padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, opacity: 0.7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{c.regla}</div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => toggleActiva(c)} title="Reactivar">▶</button>
                    <button className="btn btn-sm btn-ghost" style={{ color: '#dc2626' }} onClick={() => eliminar(c.id)}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LogsPage() {
  const { escola, api, chatCorreccions, setChatCorreccions } = useApp();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filtre, setFiltre] = useState('tots');
  const [tab, setTab] = useState('logs');
  const [extractingLog, setExtractingLog] = useState(null);

  useEffect(() => {
    if (!escola?.id) return;
    fetchChatLogs(escola.id)
      .then(setLogs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [escola?.id]);

  const logsFiltrats = filtre === 'tots' ? logs
    : logs.filter(l => l.resultat === filtre);

  async function handleExtreureRegla(log) {
    setSelected(null);
    setExtractingLog(log.id);
    try {
      await extractAndSaveCorreccio(log.missatges || [], escola.id, log.id);
      // Canviar a la pestanya de correccions per veure la nova regla pendent
      setTab('correccions');
    } finally {
      setExtractingLog(null);
    }
  }

  if (loading) return <div className="page-hdr"><Spinner /></div>;
  if (error) return <div className="page-hdr" style={{ color: '#dc2626' }}>Error: {error}</div>;

  const logsAmbCorreccions = logs.filter(l => {
    const userMsgs = (l.missatges || []).filter(m => m.role === 'user');
    return userMsgs.length > 1;
  });

  return (
    <div className="page-hdr" style={{ maxWidth: 800 }}>
      <h1 style={{ marginBottom: 4 }}>Logs i regles del xat IA</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          { id: 'logs', label: `💬 Converses (${logs.length})` },
          { id: 'correccions', label: `🧠 Regles apreses` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--ink)' : '2px solid transparent',
              fontWeight: tab === t.id ? 700 : 400, fontSize: 13,
              color: tab === t.id ? 'var(--ink)' : 'var(--ink-3)',
              cursor: 'pointer', marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'correccions' ? (
        <CorreccionsTab api={api} escola={escola} setChatCorreccions={setChatCorreccions} />
      ) : (
        <>
          {logsAmbCorreccions.length > 0 && (
            <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, marginBottom: 16, fontSize: 12, color: '#92400e' }}>
              ⚠️ <strong>{logsAmbCorreccions.length}</strong> conversa{logsAmbCorreccions.length > 1 ? 's' : ''} amb correccions detectades.
              {' '}<button onClick={() => setTab('correccions')} style={{ background: 'none', border: 'none', color: '#92400e', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Veure regles apreses →</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {['tots', 'aprovada', 'abandonada'].map(f => (
              <button
                key={f}
                className={`btn btn-sm ${filtre === f ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFiltre(f)}
              >
                {f === 'tots' ? 'Totes' : f === 'aprovada' ? 'Aprovades' : 'Abandonades'}
                {' '}({f === 'tots' ? logs.length : logs.filter(l => l.resultat === f).length})
              </button>
            ))}
          </div>

          {logsFiltrats.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '40px 0', fontSize: 14 }}>
              No hi ha converses registrades
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {logsFiltrats.map(log => {
                const userMsgs = (log.missatges || []).filter(m => m.role === 'user');
                const teCorreccions = userMsgs.length > 1;
                return (
                  <button
                    key={log.id}
                    onClick={() => setSelected(log)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', borderRadius: 12,
                      background: teCorreccions ? '#fffbeb' : 'var(--surface)',
                      border: teCorreccions ? '1px solid #fde68a' : '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}
                  >
                    <div style={{ fontSize: 20, flexShrink: 0 }}>
                      {teCorreccions ? '⚠️' : log.resultat === 'aprovada' ? '✅' : '💬'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {log.docent_absent || 'Consulta general'}
                        {log.data_absencia ? ` · ${fmtData(log.data_absencia, { year: false })}` : ''}
                        {teCorreccions && <span style={{ fontSize: 11, marginLeft: 6, color: '#92400e', fontWeight: 400 }}>({userMsgs.length - 1} correcció{userMsgs.length > 2 ? 's' : ''})</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                        {formatData(log.creat_el)} · {log.num_missatges} missatges
                        {log.error_msg ? ' · ⚠ error' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {extractingLog === log.id && <Spinner size={12} />}
                      <BadgeResultat resultat={log.resultat} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {selected && <LogDetall log={selected} onClose={() => setSelected(null)} onExtreureRegla={handleExtreureRegla} />}
    </div>
  );
}
