import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SUPA_URL, SUPA_KEY } from '../../lib/constants';
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
  return d.toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
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

function LogDetall({ log, onClose }) {
  const missatges = log.missatges || [];
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
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

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
                }}>
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

export default function LogsPage() {
  const { escola } = useApp();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filtre, setFiltre] = useState('tots');

  useEffect(() => {
    if (!escola?.id) return;
    fetchChatLogs(escola.id)
      .then(setLogs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [escola?.id]);

  const logsFiltrats = filtre === 'tots' ? logs
    : logs.filter(l => l.resultat === filtre);

  if (loading) return <div className="page-hdr"><Spinner /></div>;
  if (error) return <div className="page-hdr" style={{ color: '#dc2626' }}>Error: {error}</div>;

  return (
    <div className="page-hdr" style={{ maxWidth: 800 }}>
      <h1 style={{ marginBottom: 4 }}>Logs del xat IA</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 16 }}>
        Registre de totes les converses amb Horaria · {logs.length} converses
      </p>

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
          {logsFiltrats.map(log => (
            <button
              key={log.id}
              onClick={() => setSelected(log)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderRadius: 12,
                background: 'var(--surface)', border: '1px solid var(--border)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
              }}
            >
              <div style={{ fontSize: 20, flexShrink: 0 }}>
                {log.resultat === 'aprovada' ? '✅' : '💬'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {log.docent_absent || 'Consulta general'}
                  {log.data_absencia ? ` · ${new Date(log.data_absencia + 'T12:00:00').toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit' })}` : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                  {formatData(log.creat_el)} · {log.num_missatges} missatges
                  {log.error_msg ? ' · ⚠ error' : ''}
                </div>
              </div>
              <BadgeResultat resultat={log.resultat} />
            </button>
          ))}
        </div>
      )}

      {selected && <LogDetall log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
