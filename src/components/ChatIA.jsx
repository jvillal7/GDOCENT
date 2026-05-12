import { useState, useRef, useEffect } from 'react';
import { xatIA } from '../lib/claude';
import Spinner from './Spinner';

function parsePropostaFromText(text) {
  const m = /<proposta>([\s\S]*?)<\/proposta>/i.exec(text);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].trim());
    if (Array.isArray(parsed)) return parsed; // pot ser [] (cap cobertura) o [{...}]
    if (parsed && typeof parsed === 'object') return [parsed];
    return null;
  } catch { return null; }
}

function MessageBubble({ msg, onAplicar, messages }) {
  const isUser = msg.role === 'user';
  const proposta = !isUser ? parsePropostaFromText(msg.content) : null;

  // Separa el raonament del bloc final 📋 (pot estar a l'inici o precedit per \n)
  const cleanContent = msg.content.replace(/<proposta>[\s\S]*?<\/proposta>/gi, '').trim();
  const gridMatch = /(^|\n)(📋[\s\S]*)$/.exec(cleanContent);
  const reasoning = gridMatch
    ? (gridMatch.index > 0 ? cleanContent.slice(0, gridMatch.index).trim() : '')
    : cleanContent;
  const summary = gridMatch ? gridMatch[2].trim() : null;

  const propostaEmpty = Array.isArray(proposta) && proposta.length === 0;
  const NOCALHeader = `✅ NO CAL COBRIR — TOT CORRECTE\n══════════════════════════════`;
  // Construïm el bloc verd: si proposta buida, sempre posem el títol "No cal cobrir" al davant
  const summaryFinal = propostaEmpty
    ? `${NOCALHeader}\n${summary || 'Totes les franges queden resoltes sense assignar cap docent.'}`
    : summary
      || (proposta
          ? `📋 PROPOSTA IA\n══════════════════════════════\n${proposta.map(p =>
              `${p.hores || p.franja || '?'}  │  ${p.docent}${p.tp_afectat ? '  ⚠TP' : '  ✓'}`
            ).join('\n')}\n══════════════════════════════`
          : null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 8 }}>
      {/* Raonament (si n'hi ha) */}
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
      {/* Graella resum 📋 — monospace per alineació de columnes */}
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

export default function ChatIA({ systemContext, greeting, onAplicarProposta, onClose, initialMessage }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: greeting, _local: true },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-enviar missatge inicial si n'hi ha
  useEffect(() => {
    if (!initialMessage || sentInitial.current) return;
    sentInitial.current = true;
    const initMsgs = [
      { role: 'assistant', content: greeting, _local: true },
      { role: 'user', content: initialMessage },
    ];
    setMessages(initMsgs);
    setLoading(true);
    xatIA(systemContext, [{ role: 'user', content: initialMessage }])
      .then(response => setMessages(prev => [...prev, { role: 'assistant', content: response }]))
      .catch(e => setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${e.message}` }]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!initialMessage) inputRef.current?.focus();
  }, []);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const apiMessages = newMessages
        .filter(m => !m._local)
        .map(m => ({ role: m.role, content: m.content }));
      const response = await xatIA(systemContext, apiMessages);
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape') onClose();
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 300 }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '100%', maxWidth: 440,
        background: 'var(--surface)',
        zIndex: 301,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 32px rgba(0,0,0,.22)',
      }}>
        {/* Header */}
        <div style={{
          padding: '13px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, background: 'linear-gradient(to right, #7c3aed, #2563eb)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>💬 Horaria</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>Assistent expert en cobertures</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ fontSize: 16, padding: '4px 10px' }}>✕</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => (
            <MessageBubble key={i} msg={m} onAplicar={onAplicarProposta} messages={messages} />
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div style={{
                background: 'var(--bg-2)', borderRadius: '14px 14px 14px 4px',
                padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Spinner size={14} />
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Pensant...</span>
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
