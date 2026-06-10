import { useState, useRef, useEffect } from 'react';
import { xatIA, logChat } from '../lib/claude';
import { fmtData } from '../lib/utils';
import Spinner from './Spinner';

const LOADING_MSGS = [
  "📅 Llegint l'horari del dia...",
  "⚖️ Comprovant deutes de TP...",
  "🔍 Buscant la millor opció...",
  "📋 Preparant la proposta...",
  "✍️ Últims detalls...",
];

const SS_KEY = id => `gd_chat_${id || 'global'}`;

function parsePropostaFromText(text) {
  const m = /<proposta>([\s\S]*?)<\/proposta>/i.exec(text);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].trim());
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') return [parsed];
    return null;
  } catch { return null; }
}

function MessageBubble({ msg, onAplicar, messages, idx }) {
  const isUser = msg.role === 'user';
  const proposta = !isUser ? parsePropostaFromText(msg.content) : null;

  const cleanContent = msg.content.replace(/<proposta>[\s\S]*?<\/proposta>/gi, '').trim();
  const gridMatch = /(^|\n)(📋[\s\S]*)$/.exec(cleanContent);
  const reasoning = gridMatch
    ? (gridMatch.index > 0 ? cleanContent.slice(0, gridMatch.index).trim() : '')
    : cleanContent;
  const summary = gridMatch ? gridMatch[2].trim() : null;

  const propostaEmpty = Array.isArray(proposta) && proposta.length === 0;
  const NOCALHeader = `✅ NO CAL COBRIR — TOT CORRECTE\n══════════════════════════════`;
  const summaryFinal = propostaEmpty
    ? `${NOCALHeader}\n${summary || 'Totes les franges queden resoltes sense assignar cap docent.'}`
    : summary
      || (proposta
          ? `📋 PROPOSTA IA\n══════════════════════════════\n${proposta.map(p =>
              `${p.hores || p.franja || '?'}  │  ${p.docent}${p.tp_afectat ? '  ⚠TP' : '  ✓'}`
            ).join('\n')}\n══════════════════════════════`
          : null);

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        gap: 8,
        animation: 'fadeUp .22s ease',
      }}
    >
      {reasoning && (
        <div style={{
          maxWidth: '90%', padding: '10px 14px',
          borderRadius: isUser ? '14px 14px 4px 14px' : summaryFinal ? '14px 14px 0 4px' : '14px 14px 14px 4px',
          background: isUser ? 'var(--ink)' : 'var(--bg-2)',
          color: isUser ? 'var(--surface)' : 'var(--ink)',
          fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {reasoning}
        </div>
      )}
      {summaryFinal && (
        <div style={{
          maxWidth: '92%', padding: '12px 14px',
          borderRadius: reasoning ? '0 0 14px 4px' : '14px 14px 14px 4px',
          background: 'var(--green-bg)',
          border: '1px solid var(--green-mid)',
          color: 'var(--green)',
          fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre', wordBreak: 'normal',
          overflowX: 'auto', fontFamily: 'monospace',
        }}>
          {summaryFinal}
        </div>
      )}
      {proposta !== null && (
        <button
          className="btn btn-green btn-sm"
          style={{ fontSize: 12, alignSelf: 'flex-start', fontWeight: 600 }}
          onClick={() => onAplicar(proposta, messages)}
        >
          {propostaEmpty ? '✓ Marcar com a resolt' : '✓ Aplicar proposta'}
        </button>
      )}
    </div>
  );
}

export default function ChatIA({ systemContext, greeting, onAplicarProposta, onClose, onMinimize, initialMessage, escolaId, absenciaId, docentAbsent, dataAbsencia }) {
  // Restore from sessionStorage if available
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem(SS_KEY(absenciaId));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [{ role: 'assistant', content: greeting, _local: true }];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const sentInitial = useRef(false);
  const sessioId = useRef(crypto.randomUUID());
  const lastErrorRef = useRef(null);

  // Slide-in animation on mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Save messages to sessionStorage on every change
  useEffect(() => {
    if (!absenciaId) return;
    try {
      const toSave = messages.filter(m => !m._streaming);
      sessionStorage.setItem(SS_KEY(absenciaId), JSON.stringify(toSave));
    } catch {}
  }, [messages, absenciaId]);

  useEffect(() => {
    if (!loading) { setLoadingMsgIdx(0); return; }
    const timer = setInterval(() => setLoadingMsgIdx(i => (i + 1) % LOADING_MSGS.length), 4000);
    return () => clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-send initial message only if no saved conversation
  useEffect(() => {
    if (!initialMessage || sentInitial.current) return;
    // If we restored a conversation, don't re-send initial
    const hasRealMessages = messages.some(m => !m._local);
    if (hasRealMessages) { sentInitial.current = true; return; }
    sentInitial.current = true;
    const initMsgs = [
      { role: 'assistant', content: greeting, _local: true },
      { role: 'user', content: initialMessage },
      { role: 'assistant', content: '', _streaming: true },
    ];
    setMessages(initMsgs);
    setLoading(true);
    xatIA(systemContext, [{ role: 'user', content: initialMessage }], 3000, (partial) => {
      setLoading(false);
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: partial, _streaming: true };
        return next;
      });
    })
      .then(response => setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: response };
        return next;
      }))
      .catch(e => setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: `❌ Error: ${e.message}` };
        return next;
      }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!initialMessage) inputRef.current?.focus();
  }, []);

  function clearSession() {
    try { if (absenciaId) sessionStorage.removeItem(SS_KEY(absenciaId)); } catch {}
  }

  function guardarLog(msgsActuals, resultat, propostaAprovada = null) {
    if (!escolaId) return;
    const missatgesNet = msgsActuals
      .filter(m => !m._local)
      .map(({ role, content }) => ({ role, content }));
    if (!missatgesNet.length) return;
    logChat({
      escola_id: escolaId,
      sessio_id: sessioId.current,
      absencia_id: absenciaId || null,
      docent_absent: docentAbsent || null,
      data_absencia: dataAbsencia || null,
      missatges: missatgesNet,
      proposta_aprovada: propostaAprovada || null,
      resultat,
      num_missatges: missatgesNet.length,
      error_msg: lastErrorRef.current || null,
    });
  }

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user', content: userMsg }];
    const withPlaceholder = [...newMessages, { role: 'assistant', content: '', _streaming: true }];
    setMessages(withPlaceholder);
    setLoading(true);
    const apiMessages = newMessages
      .filter(m => !m._local)
      .map(m => ({ role: m.role, content: m.content }));
    try {
      const response = await xatIA(systemContext, apiMessages, 3000, (partial) => {
        setLoading(false);
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: partial, _streaming: true };
          return next;
        });
      });
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: response };
        return next;
      });
    } catch (e) {
      lastErrorRef.current = e.message;
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: `❌ Error: ${e.message}` };
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape') { clearSession(); guardarLog(messages, 'abandonada'); onClose(); }
  }

  const dataFmt = dataAbsencia ? fmtData(dataAbsencia, { weekday: 'short' }) : null;

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,.45)',
          zIndex: 300,
          opacity: visible ? 1 : 0,
          transition: 'opacity .3s',
        }}
        onClick={() => { clearSession(); guardarLog(messages, 'abandonada'); onClose(); }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '100%', maxWidth: 440,
        background: 'var(--surface)',
        zIndex: 301,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 32px rgba(0,0,0,.22)',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform .3s cubic-bezier(.4,0,.2,1)',
      }}>
        {/* Header */}
        <div style={{ flexShrink: 0 }}>
          <div style={{
            padding: '13px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, background: 'linear-gradient(to right, #7c3aed, #2563eb)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                💬 Horaria
              </div>
              {(docentAbsent || dataFmt) ? (
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                  {docentAbsent && <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{docentAbsent}</span>}
                  {docentAbsent && dataFmt && <span style={{ margin: '0 4px', opacity: .5 }}>·</span>}
                  {dataFmt && <span>{dataFmt}</span>}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>Assistent expert en cobertures</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {onMinimize && (
                <button className="btn btn-ghost btn-sm" onClick={onMinimize} style={{ fontSize: 16, padding: '4px 10px' }} title="Minimitzar">−</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => { clearSession(); guardarLog(messages, 'abandonada'); onClose(); }} style={{ fontSize: 16, padding: '4px 10px' }}>✕</button>
            </div>
          </div>
          {/* Barra de progrés indeterminada mentre carrega */}
          <div style={{ height: 3, background: 'var(--border)', overflow: 'hidden', opacity: loading ? 1 : 0, transition: 'opacity .3s' }}>
            <div style={{ height: '100%', width: '25%', background: 'linear-gradient(90deg,#7c3aed,#2563eb)', borderRadius: 2, animation: 'horaria-progress 1.6s ease-in-out infinite' }} />
          </div>
          <div style={{ height: '1px', background: 'var(--border)', opacity: loading ? 0 : 1, transition: 'opacity .3s' }} />
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => (
            <MessageBubble key={i} idx={i} msg={m} onAplicar={(proposta, msgs) => { guardarLog(msgs, 'aprovada', proposta); onAplicarProposta(proposta, msgs); }} messages={messages} />
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div style={{
                background: 'var(--bg-2)', borderRadius: '14px 14px 14px 4px',
                padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 220,
              }}>
                <Spinner size={14} />
                <span style={{ fontSize: 12, color: 'var(--ink-3)', animation: 'horaria-pulse .8s ease-in-out infinite' }}>
                  {LOADING_MSGS[loadingMsgIdx]}
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, flexShrink: 0,
          background: 'var(--surface)',
        }}>
          <textarea
            ref={inputRef}
            className="f-ctrl"
            rows={2}
            placeholder="Escriu el teu missatge... (Enter per enviar)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            style={{ flex: 1, fontSize: 13, resize: 'none', lineHeight: 1.5 }}
          />
          <button
            className="btn btn-green"
            style={{ alignSelf: 'flex-end', fontSize: 15, padding: '8px 14px', flexShrink: 0 }}
            onClick={send}
            disabled={loading || !input.trim()}
          >
            ↑
          </button>
        </div>
      </div>
    </>
  );
}
