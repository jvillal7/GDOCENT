import { useState, useRef, useEffect } from 'react';
import { xatIA } from '../lib/claude';
import Spinner from './Spinner';

function parsePropostaFromText(text) {
  const m = /<proposta>([\s\S]*?)<\/proposta>/i.exec(text);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); } catch { return null; }
}

function MessageBubble({ msg, onAplicar }) {
  const isUser = msg.role === 'user';
  const proposta = !isUser ? parsePropostaFromText(msg.content) : null;
  const displayText = msg.content
    .replace(/<proposta>[\s\S]*?<\/proposta>/gi, proposta ? '\n📋 Proposta generada ↓' : '')
    .trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 6 }}>
      <div style={{
        maxWidth: '85%', padding: '10px 14px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser ? 'var(--ink)' : 'var(--bg-2)',
        color: isUser ? 'var(--surface)' : 'var(--ink)',
        fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {displayText}
      </div>
      {proposta && (
        <button
          className="btn btn-green btn-sm"
          style={{ fontSize: 12, alignSelf: 'flex-start' }}
          onClick={() => onAplicar(proposta)}
        >
          ✓ Aplicar proposta
        </button>
      )}
    </div>
  );
}

export default function ChatIA({ systemContext, greeting, onAplicarProposta, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: greeting, _local: true },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
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
            <div style={{ fontSize: 14, fontWeight: 700 }}>🤖 Assistent IA</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>Expert en cobertures del centre</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ fontSize: 16, padding: '4px 10px' }}>✕</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => (
            <MessageBubble key={i} msg={m} onAplicar={onAplicarProposta} />
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
