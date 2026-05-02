import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { NAV_CFG, BNAV, PAGE_TITLES } from '../lib/constants';
import { initials, rolLabel, chipClass } from '../lib/utils';
import PageRouter from '../pages/PageRouter';

const isDesktop = () => window.innerWidth >= 768;

export default function AppShell() {
  const { perfil, escola, role, page, setPage, logout, darkMode, toggleDark } = useApp();
  const [desktop, setDesktop] = useState(isDesktop);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [oriolMenu, setOriolMenu] = useState(false);

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
      <div className="shell-desk">
        <aside className="sd">
          <div className="sd-top">
            <div className="sd-logo">
              <div className="sd-logo-text">
                <p>{escola?.nom || 'Gestió Docent'}</p>
                <span>Gestió Docent</span>
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
            <div className="dtb-right">
              <span className={`role-chip ${chipCls}`}>{chipTxt}</span>
            </div>
          </header>
          <div className="desk-content"><PageRouter /></div>
        </div>
      </div>
    );
  }

  return (
    <div id="app">
      <header className="app-header">
        <div className="ah-title">
          <p>{escola?.nom || 'Gestió Docent'}</p>
          <span>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`role-chip ${chipCls}`}>{chipTxt}</span>
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
              { id: 'oj_bai', icon: '📋', label: 'Baixes amb substitucions' },
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
          <div key={it.id} className={`bn-item${page === it.id ? ' active' : ''}`} onClick={() => navigate(it.id)}>
            <span className="bn-icon">{it.icon}</span>
            <span className="bn-label">{it.label}</span>
          </div>
        ))}
        {isOriol && role === 'jefa' && (() => {
          const oriolActive = ['oj_abs','oj_reu','oj_cee','oj_bai'].includes(page);
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
  );
}
