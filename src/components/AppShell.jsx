import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { NAV_CFG, BNAV, PAGE_TITLES } from '../lib/constants';
import { initials, rolLabel, chipClass } from '../lib/utils';
import PageRouter from '../pages/PageRouter';
import ChatIA from './ChatIA';
import { aplicarPropostaChat } from '../lib/claude';

const isDesktop = () => window.innerWidth >= 768;

export default function AppShell() {
  const { perfil, escola, role, page, setPage, logout, darkMode, toggleDark,
          docents, api, showToast,
          chatConfig, openChat, closeChat, minimizeChat, maximizeChat,
          notifyCoverageApplied } = useApp();
  const [desktop, setDesktop] = useState(isDesktop);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [oriolMenu, setOriolMenu] = useState(false);
  const [configMenu, setConfigMenu] = useState(false);
  const [tapAnimId, setTapAnimId] = useState(null);

  useEffect(() => {
    let prev = isDesktop();
    const handler = () => {
      const now = isDesktop();
      setDesktop(now);
      // Close drawer on resize to desktop
      if (now) setDrawerOpen(false);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const isOriol = escola?.nom?.toLowerCase().includes('oriol');
  const nav   = (NAV_CFG[role] || NAV_CFG.teacher).filter(sec => !sec.oriolOnly || isOriol);
  const bnav  = BNAV[role]    || BNAV.teacher;
  const title = PAGE_TITLES[page] || '';
  const userInit = initials(perfil?.nom);
  const userRole = rolLabel(role);
  const chipCls  = chipClass(role);
  const chipTxt  = role === 'dev' ? 'Admin' : userRole;

  function navigate(id) { setPage(id); setDrawerOpen(false); }

  function handleAplicarProposta(proposta, chatMsgs) {
    const { avis, iaDecisions, onApplied } = chatConfig || {};
    closeChat();
    aplicarPropostaChat(avis, proposta, chatMsgs, { api, escola, docents, iaDecisions, showToast })
      .then(() => { onApplied?.(); notifyCoverageApplied(); })
      .catch(e => showToast('Error: ' + e.message));
  }

  const GlobalChat = () => {
    if (!chatConfig) return null;
    const isOriol = escola?.nom?.toLowerCase().includes('oriol');
    const greeting = isOriol ? "Hola Mireia! Com et puc ajudar avui?" : "Hola Veronica! Com et puc ajudar avui?";

    return (
      <>
        {chatConfig.isMinimized && (
          <div
            onClick={maximizeChat}
            style={{
              position: 'fixed', bottom: 80, right: 16, zIndex: 400,
              background: 'linear-gradient(135deg,#7c3aed,#2563eb)',
              color: '#fff', borderRadius: 28,
              padding: '10px 18px 10px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 4px 20px rgba(124,58,237,.4)',
              cursor: 'pointer', userSelect: 'none',
              fontSize: 13, fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 18 }}>💬</span>
            <span>Horaria</span>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a5f3fc', animation: 'horaria-pulse .9s ease-in-out infinite', flexShrink: 0 }} />
            <button
              onClick={e => { e.stopPropagation(); closeChat(); }}
              style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: '50%', width: 22, height: 22, color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}
            >✕</button>
          </div>
        )}
        <div style={{ display: chatConfig.isMinimized ? 'none' : 'contents' }}>
          <ChatIA
            key={chatConfig.avis?.id}
            systemContext={chatConfig.systemContext}
            greeting={greeting}
            initialMessage={chatConfig.initialMessage}
            escolaId={escola?.id}
            absenciaId={chatConfig.avis?.id}
            docentAbsent={chatConfig.avis?.docent_nom}
            dataAbsencia={chatConfig.avis?.data}
            onAplicarProposta={handleAplicarProposta}
            onClose={closeChat}
            onMinimize={minimizeChat}
          />
        </div>
      </>
    );
  };

  function handleBnTap(it) {
    navigate(it.id);
    if (it.anim) {
      setTapAnimId(it.id);
      setTimeout(() => setTapAnimId(null), 1200);
    }
  }

  const SidebarNav = () => nav.map(sec => (
    <div key={sec.sec}>
      <div className="sd-sec">{sec.sec}</div>
      {sec.items.map(it => (
        <div key={it.id} className={`sd-item${page === it.id ? ' active' : ''}`} onClick={() => navigate(it.id)}>
          <span className={`sd-item-icon${it.anim ? ` icon-anim-${it.anim}` : ''}`}>{it.icon}</span>{it.label}
        </div>
      ))}
    </div>
  ));

  if (desktop) {
    return (
      <>
      <div className="shell-desk">
        <aside className="sd">
          <div className="sd-top">
            <div className="sd-logo" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              {/* Logo + nom de l'escola */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {(escola?.nom?.toLowerCase().includes('rivo') || escola?.nom?.toLowerCase().includes('oriol')) && (
                  <img
                    src={escola.nom.toLowerCase().includes('rivo') ? '/logo_rivo.png' : '/logo_canoriol.png'}
                    alt={escola.nom}
                    style={{ height: 36, width: 36, objectFit: 'contain', flexShrink: 0 }}
                  />
                )}
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{escola?.nom}</div>
              </div>
              {/* HorariaPro — powered by */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 9, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.06em' }}>powered by</span>
                <img src={darkMode ? '/logo.svg' : '/logo-dark.svg'} alt="HorariaPro" style={{ height: 18, width: 'auto', display: 'block' }} />
              </div>
            </div>
          </div>
          <nav className="sd-nav"><SidebarNav /></nav>
          <div className="sd-bottom">
            <div className="sd-user">
              <div className="sdu-av" style={{ background: 'var(--ink)' }}>{userInit}</div>
              <div className="sdu-info"><p>{perfil?.nom}</p><span>{userRole}</span></div>
            </div>
            <button className="sd-btn" onClick={toggleDark}>{darkMode ? '☀️ Mode clar' : '🌙 Mode fosc'}</button>
            <button className="sd-btn" onClick={logout}>← Tancar sessió</button>
          </div>
        </aside>
        <div className="desk-main">
          <header className="desk-topbar">
            <div className="dtb-left">
              {escola?.nom}
              <span style={{ color: 'var(--ink-4)', margin: '0 4px' }}>/</span>
              {title}
            </div>
            <div className="dtb-right" style={role === 'jefa' ? { flexDirection: 'column', alignItems: 'flex-end', gap: 10 } : {}}>
              <span className={`role-chip ${chipCls}`}>{chipTxt}</span>
              {role === 'jefa' && (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setConfigMenu(o => !o)}
                    style={{
                      background: (page === 'dv' || page === 'dv_context') ? 'var(--border)' : 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '7px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'var(--ink)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    🤖 Configuració IA
                    <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 2 }}>{configMenu ? '▲' : '▼'}</span>
                  </button>
                  {configMenu && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 198 }} onClick={() => setConfigMenu(false)} />
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                        background: 'var(--surface)', borderRadius: 12,
                        boxShadow: '0 4px 24px rgba(0,0,0,.15)',
                        border: '1px solid var(--border)',
                        zIndex: 199, minWidth: 180, overflow: 'hidden',
                      }}>
                        {[
                          { id: 'dv',         icon: '🤖', label: 'Normes IA' },
                          { id: 'dv_context', icon: '🏫', label: 'Context IA' },
                        ].map((it, i, arr) => (
                          <div
                            key={it.id}
                            onClick={() => { setPage(it.id); setConfigMenu(false); }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '12px 16px',
                              borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                              cursor: 'pointer',
                              background: page === it.id ? 'var(--bg-2)' : 'var(--surface)',
                              fontSize: 13, fontWeight: page === it.id ? 600 : 400,
                              color: 'var(--ink)',
                            }}
                          >
                            <span>{it.icon}</span>{it.label}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </header>
          <div className="desk-content"><PageRouter /></div>
        </div>
      </div>
      <GlobalChat />
      </>
    );
  }

  return (
    <>
    <div id="app">
      <header className="app-header">
        <div className="ah-title">
          <img src={darkMode ? '/logo.svg' : '/logo-dark.svg'} alt="HorariaPro" style={{ height: 26, width: 'auto', display: 'block' }} />
          <span>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`role-chip ${chipCls}`}>{chipTxt}</span>
          {role === 'jefa' && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setConfigMenu(o => !o)}
                style={{
                  background: (page === 'dv' || page === 'dv_context') ? 'var(--border)' : 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '5px 9px',
                  fontSize: 16,
                  lineHeight: 1,
                  cursor: 'pointer',
                  color: 'var(--ink)',
                }}
                title="Configuració IA"
              >
                🤖
              </button>
              {configMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 198 }} onClick={() => setConfigMenu(false)} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                    background: 'var(--surface)', borderRadius: 12,
                    boxShadow: '0 4px 24px rgba(0,0,0,.15)',
                    border: '1px solid var(--border)',
                    zIndex: 199, minWidth: 170, overflow: 'hidden',
                  }}>
                    {[
                      { id: 'dv',         icon: '🤖', label: 'Normes IA' },
                      { id: 'dv_context', icon: '🏫', label: 'Context IA' },
                    ].map((it, i, arr) => (
                      <div
                        key={it.id}
                        onClick={() => { setPage(it.id); setConfigMenu(false); setDrawerOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '12px 16px',
                          borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                          cursor: 'pointer',
                          background: page === it.id ? 'var(--bg-2)' : 'var(--surface)',
                          fontSize: 14, fontWeight: page === it.id ? 600 : 400,
                          color: 'var(--ink)',
                        }}
                      >
                        <span>{it.icon}</span>{it.label}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button className="ah-menu-btn" onClick={() => setDrawerOpen(true)}>☰</button>
        </div>
      </header>

      {drawerOpen && <div className="drawer-overlay open" onClick={() => setDrawerOpen(false)} />}
      <div className={`drawer${drawerOpen ? ' open' : ''}`}>
        <div className="drawer-head">
          <div className="drawer-user">
            <div className="du-av" style={{ background: 'var(--ink)' }}>{userInit}</div>
            <div className="du-info"><p>{perfil?.nom}</p><span>{userRole}</span></div>
          </div>
        </div>
        <nav className="drawer-nav">
          {nav.map(sec => (
            <div key={sec.sec}>
              <div className="dn-label">{sec.sec}</div>
              {sec.items.map(it => (
                <div key={it.id} className={`dn-item${page === it.id ? ' active' : ''}`} onClick={() => navigate(it.id)}>
                  {it.icon} {it.label}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div className="drawer-foot">
          <button onClick={toggleDark}>{darkMode ? '☀️ Mode clar' : '🌙 Mode fosc'}</button>
          <button onClick={logout}>← Tancar sessió</button>
        </div>
      </div>

      {/* Panell Diari Ca N'Oriol */}
      {oriolMenu && isOriol && role === 'jefa' && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setOriolMenu(false)} />
          <div style={{ position: 'fixed', bottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom) + 10px)', right: 12, background: 'var(--surface)', borderRadius: 16, boxShadow: '0 4px 28px rgba(0,0,0,.18)', zIndex: 99, overflow: 'hidden', minWidth: 230 }}>
            {[
              { id: 'oj_abs', icon: '👤', label: "Persones que s'absenten" },
              { id: 'oj_reu', icon: '📝', label: 'Reunions i organització' },
              { id: 'oj_cee', icon: '🏥', label: 'Actuacions CEEPSIR' },
              { id: 'oj_pdf', icon: '📄', label: 'Generar PDF diari' },
            ].map((it, i, arr) => (
              <div
                key={it.id}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', background: page === it.id ? 'var(--bg-2)' : 'var(--surface)', fontSize: 14, fontWeight: page === it.id ? 600 : 400, color: 'var(--ink)' }}
                onClick={() => { navigate(it.id); setOriolMenu(false); }}
              >
                <span style={{ fontSize: 18 }}>{it.icon}</span>
                {it.label}
              </div>
            ))}
          </div>
        </>
      )}

      <nav className="bottom-nav">
        {bnav.map(it => (
          <div key={it.id} className={`bn-item${page === it.id ? ' active' : ''}`} onClick={() => handleBnTap(it)}>
            <span className={`bn-icon${it.anim ? ` icon-anim-${it.anim}${tapAnimId === it.id ? ' anim-play' : ''}` : ''}`}>{it.icon}</span>
            <span className="bn-label">{it.label}</span>
          </div>
        ))}
        {isOriol && role === 'jefa' && (() => {
          const oriolActive = ['oj_abs','oj_reu','oj_cee','oj_pdf'].includes(page);
          return (
            <div className={`bn-item${oriolActive || oriolMenu ? ' active' : ''}`} onClick={() => setOriolMenu(p => !p)}>
              <span className="bn-icon">{oriolMenu ? '✕' : '＋'}</span>
              <span className="bn-label">Diari</span>
            </div>
          );
        })()}
      </nav>

      <div className="main-content">
        <div className="page-wrap"><PageRouter /></div>
      </div>
    </div>
    <GlobalChat />
    </>
  );
}
