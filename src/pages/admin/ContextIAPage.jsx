import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { xatIA } from '../../lib/claude';
import Spinner from '../../components/Spinner';

// Parseja el text pla en blocs visuals
function parseContextBlocs(text) {
  if (!text?.trim()) return [];
  return text.split('\n').filter(Boolean).map(line => {
    // Primera línia o línia amb "—": títol principal
    if (line.includes(' — ') || line.includes(' — ')) {
      const [nom, desc] = line.split(/\s—\s/);
      return { type: 'title', nom: nom.trim(), desc: (desc || '').replace(/\.$/, '').trim() };
    }
    // Línia "Clau: valor"
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 40) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim().replace(/\.$/, '');
      if (key && val && !key.includes(' ')) return { type: 'field', key, val };
      if (key && val) return { type: 'field', key, val };
    }
    return { type: 'line', text: line.replace(/\.$/, '').trim() };
  });
}

function ContextVisual({ text }) {
  const blocs = parseContextBlocs(text);
  if (!blocs.length) return (
    <div style={{ color: 'var(--ink-4)', fontStyle: 'italic', fontSize: 13, padding: '12px 0' }}>
      Sense context configurat. Usa "Editar amb IA" per generar-lo de forma assistida.
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {blocs.map((b, i) => {
        if (b.type === 'title') return (
          <div key={i}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{b.nom}</div>
            {b.desc && <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>{b.desc}</div>}
          </div>
        );
        if (b.type === 'field') return (
          <div key={i} style={{ display: 'flex', gap: 0, flexDirection: 'column' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{b.key}</div>
            <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', padding: '7px 12px' }}>{b.val}</div>
          </div>
        );
        return (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--ink-4)', fontSize: 14, marginTop: 1, flexShrink: 0 }}>·</span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>{b.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function extrauBloc(text, tag) {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(text);
  return m ? m[1].trim() : null;
}

export default function ContextIAPage() {
  const { api, escola, normes, setNormes, contextIA, setContextIA, showToast } = useApp();
  const [mode,        setMode]        = useState('view');   // 'view' | 'edit' | 'chat'
  const [draft,       setDraft]       = useState('');
  const [saving,      setSaving]      = useState(false);
  const [messages,    setMessages]    = useState([]);
  const [chatInput,   setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [previewCtx,  setPreviewCtx]  = useState(null);
  const [previewNrm,  setPreviewNrm]  = useState(null);

  useEffect(() => { setDraft(contextIA || ''); }, [contextIA]);

  const systemPrompt = `Ets un assistent especialitzat en configurar el context del centre educatiu ${escola?.nom || ''} per al sistema IA de gestió de cobertures HORARIA.
La teva feina és ajudar a mantenir el CONTEXT (estructura del centre) i les NORMES (regles de cobertura) actualitzats.

CONTEXT ACTUAL:
${contextIA || 'No configurat.'}

NORMES ACTUALS:
${normes || 'No configurades.'}

Quan l'usuari descriu algun canvi al centre (nou personal, canvi de grups, nova regla, excepció):
- Determina si afecta el CONTEXT, les NORMES o els dos.
- Proposa el text COMPLET actualitzat amb:
  <context>...text complet...</context>
  <normes>...text complet...</normes>
- Si no cal canviar res, respon sense marcadors.
- Mantén el format del text actual (una línia per ítem, "Clau: valor").
Respon en català. Concís i directe.`;

  async function saveEdit() {
    setSaving(true);
    try {
      await api.saveContextIA(draft);
      setContextIA(draft);
      setMode('view');
      showToast('Context guardat');
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function aplicarProposta() {
    setSaving(true);
    try {
      if (previewCtx !== null) { await api.saveContextIA(previewCtx); setContextIA(previewCtx); }
      if (previewNrm !== null) { await api.saveNormesIA(previewNrm);  setNormes(previewNrm); }
      setPreviewCtx(null);
      setPreviewNrm(null);
      showToast('Canvis aplicats');
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setPreviewCtx(null);
    setPreviewNrm(null);
    const newMsgs = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMsgs);
    setChatLoading(true);
    try {
      const response = await xatIA(systemPrompt, newMsgs.map(m => ({ role: m.role, content: m.content })), 2000);
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      const ctx = extrauBloc(response, 'context');
      const nrm = extrauBloc(response, 'normes');
      if (ctx) setPreviewCtx(ctx);
      if (nrm) setPreviewNrm(nrm);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  const hasProposta = previewCtx !== null || previewNrm !== null;

  return (
    <>
      {/* Capçalera */}
      <div className="page-hdr">
        <div>
          <h1>Context IA</h1>
          <p style={{ marginTop: 2 }}>Informació estructural del centre que la IA utilitza per proposar cobertures</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {mode === 'view' && (
            <>
              <button className="btn btn-sm" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => setMode('edit')}>
                ✏️ Editar
              </button>
              <button
                className="btn btn-sm"
                style={{ fontSize: 13, padding: '6px 14px', background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'var(--blue)' }}
                onClick={() => setMode(mode === 'chat' ? 'view' : 'chat')}
              >
                ✨ Editar amb IA
              </button>
            </>
          )}
          {mode === 'edit' && (
            <>
              <button className="btn btn-green" style={{ fontSize: 13, padding: '6px 16px' }} onClick={saveEdit} disabled={saving}>
                {saving ? 'Guardant...' : '✓ Guardar'}
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => { setMode('view'); setDraft(contextIA || ''); }}>
                Cancel·lar
              </button>
            </>
          )}
          {mode === 'chat' && (
            <button className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => { setMode('view'); setPreviewCtx(null); setPreviewNrm(null); }}>
              ✕ Tancar IA
            </button>
          )}
        </div>
      </div>

      {/* Vista principal */}
      {mode === 'view' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ padding: '16px 20px 20px' }}>
            <ContextVisual text={contextIA} />
          </div>
        </div>
      )}

      {/* Editor de text */}
      {mode === 'edit' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h3>Edició directa</h3>
            <span className="sp sp-ink">Una informació per línia</span>
          </div>
          <div style={{ padding: '12px 16px 16px' }}>
            <textarea
              className="f-ctrl"
              rows={14}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={`Nom del centre — Tipus de centre.\nCicles: llista de grups.\nRols del personal: descripció dels rols.\n...`}
              style={{ fontSize: 13, lineHeight: 1.7, resize: 'vertical', fontFamily: 'monospace' }}
            />
            <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 6 }}>
              Format: primera línia = "Nom — Tipus", després "Clau: valor" per línia. La IA llegirà exactament aquest text.
            </div>
          </div>
        </div>
      )}

      {/* Mode IA */}
      {mode === 'chat' && (
        <>
          {/* Previsualització actual */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-head">
              <h3>Context actual</h3>
              <span className="sp sp-ink" style={{ fontSize: 11 }}>Referència per a l'assistent</span>
            </div>
            <div style={{ padding: '12px 20px 16px' }}>
              <ContextVisual text={contextIA} />
            </div>
          </div>

          {/* Proposta pendent */}
          {hasProposta && (
            <div className="card" style={{ marginBottom: 12, border: '1px solid var(--green-mid)', background: 'var(--green-bg)' }}>
              <div className="card-head" style={{ borderBottom: '1px solid var(--green-mid)' }}>
                <h3 style={{ color: 'var(--green)' }}>Proposta de l'assistent</h3>
                <button className="btn btn-green" style={{ fontSize: 13, padding: '6px 16px', fontWeight: 600 }} onClick={aplicarProposta} disabled={saving}>
                  {saving ? 'Aplicant...' : '✓ Aplicar canvis'}
                </button>
              </div>
              <div style={{ padding: '12px 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {previewCtx !== null && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Context nou</div>
                    <ContextVisual text={previewCtx} />
                  </div>
                )}
                {previewNrm !== null && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Normes noves</div>
                    <pre style={{ fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6, fontFamily: 'inherit' }}>{previewNrm}</pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Xat */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head">
              <h3>✨ Assistent IA</h3>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Descriu el canvi en llenguatge natural</span>
            </div>
            <div style={{ padding: '10px 16px', minHeight: 80, maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.length === 0 && (
                <div style={{ color: 'var(--ink-4)', fontSize: 13, fontStyle: 'italic' }}>
                  Exemples: "La Maria substitueix la Núria com a cap d'estudis", "Afegeix que tenim un grup nou G15", "El CEEPSIR ara és els dimecres, no els divendres"...
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%', padding: '8px 13px',
                    borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: m.role === 'user' ? 'var(--ink)' : 'var(--bg-2)',
                    color: m.role === 'user' ? 'var(--surface)' : 'var(--ink)',
                    fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                  }}>
                    {m.content
                      .replace(/<context>[\s\S]*?<\/context>/gi, '→ Context actualitzat (veure proposta)')
                      .replace(/<normes>[\s\S]*?<\/normes>/gi, '→ Normes actualitzades (veure proposta)')}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-3)', fontSize: 13 }}>
                  <Spinner size={14} /> Pensant...
                </div>
              )}
            </div>
            <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <textarea
                className="f-ctrl"
                rows={2}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="Descriu el canvi..."
                disabled={chatLoading}
                style={{ flex: 1, fontSize: 13, resize: 'none', lineHeight: 1.5 }}
              />
              <button
                className="btn btn-green"
                style={{ alignSelf: 'flex-end', fontSize: 15, padding: '8px 14px', flexShrink: 0 }}
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
              >↑</button>
            </div>
          </div>
        </>
      )}

      <div className="alert alert-blue" style={{ fontSize: 12.5 }}>
        🤖 La IA llegeix aquest context conjuntament amb les Normes IA cada vegada que proposa una cobertura.
      </div>
    </>
  );
}
