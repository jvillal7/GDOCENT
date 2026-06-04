import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { makeApi } from '../lib/api';
import { DEFAULT_PAGE } from '../lib/constants';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

function readSession() {
  try {
    // Sessió en sessionStorage (expira en tancar el navegador)
    const s = JSON.parse(sessionStorage.getItem('gd_session')) || null;
    if (s) return s;
    // Migració: si hi havia sessió a localStorage (versió antiga), esborra-la
    localStorage.removeItem('gd_session');
    return null;
  } catch { return null; }
}

// Si ?escola= no coincideix amb la sessió guardada, esborra la sessió per forçar nou login.
(() => {
  try {
    const escolaParam = new URLSearchParams(window.location.search).get('escola');
    if (!escolaParam) return;
    const saved = JSON.parse(sessionStorage.getItem('gd_session') || 'null');
    if (saved?.escola && !saved.escola.nom.toLowerCase().includes(escolaParam.toLowerCase())) {
      sessionStorage.removeItem('gd_session');
      sessionStorage.removeItem('gd_jwt');
    }
  } catch {}
})();

// Llegeix ?page de la URL. Si hi ha ?escola, NO neteja la URL (LoginFlow la necessita).
const _urlPage = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('page');
    if (!p) return null;
    if (!params.has('escola')) window.history.replaceState({}, '', window.location.pathname);
    if (!readSession()) sessionStorage.setItem('gd_redirect_page', p);
    return p;
  } catch { return null; }
})();

export function AppProvider({ children }) {
  const saved = useMemo(readSession, []);

  const [perfil, setPerfil]   = useState(saved?.perfil || null);
  const [escola, setEscola]   = useState(saved?.escola || null);
  const [role, setRole]       = useState(saved?.role   || null);
  const [page, setPage]       = useState(saved ? (_urlPage || DEFAULT_PAGE[saved.role] || 'ta') : null);
  const [docents,    setDocents]    = useState([]);
  const [normes,     setNormes]     = useState('');
  const [contextIA,  setContextIA]  = useState('');
  const [frangesIA,  setFrangesIA]  = useState(null);
  const [toast, setToast]     = useState(null);
  const [chatConfig, setChatConfig] = useState(null);
  const [coverageAppliedAt, setCoverageAppliedAt] = useState(0);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('gd_dark') === 'true';
    document.documentElement.setAttribute('data-theme', saved ? 'dark' : 'light');
    return saved;
  });

  const api = useMemo(() => escola ? makeApi(escola.id) : null, [escola?.id]);

  // Carregar docents i normes quan hi ha escola (login fresc o sessió restaurada)
  useEffect(() => {
    if (!escola) { setDocents([]); return; }
    setDocents([]); // Neteja docents de l'escola anterior abans de carregar la nova
    if (saved?.escola) document.title = `HORARIA — ${escola.nom}`;
    const a = makeApi(escola.id);
    a.getDocents().then(data => { if (data) setDocents(data); });
    a.getNormesIA().then(data => { if (data?.[0]?.normes_ia) setNormes(data[0].normes_ia); });
    a.getContextIA().then(data => { if (data?.[0]?.context_ia) setContextIA(data[0].context_ia); });
    a.getFrangesIA().then(data => { if (data?.[0]?.franges_ia) setFrangesIA(data[0].franges_ia); });
  }, [escola?.id]);

  const login = useCallback((p, e, r, jwt) => {
    const redirect = sessionStorage.getItem('gd_redirect_page');
    sessionStorage.removeItem('gd_redirect_page');
    setPerfil(p);
    setEscola(e);
    setRole(r);
    setPage(redirect || DEFAULT_PAGE[r] || 'ta');
    document.title = `HORARIA — ${e.nom}`;
    sessionStorage.setItem('gd_session', JSON.stringify({ perfil: p, escola: e, role: r }));
    if (jwt) sessionStorage.setItem('gd_jwt', jwt);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('gd_session');
    sessionStorage.removeItem('gd_jwt');
    localStorage.removeItem('gd_session');
    window.location.reload();
  }, []);

  const toggleDark = useCallback(() => {
    setDarkMode(d => {
      const next = !d;
      document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
      localStorage.setItem('gd_dark', next);
      return next;
    });
  }, []);

  const showToast = useCallback(msg => {
    const id = Date.now();
    setToast({ msg, id });
    setTimeout(() => setToast(t => t?.id === id ? null : t), 3000);
  }, []);

  const openChat    = useCallback((cfg) => setChatConfig({ ...cfg, isMinimized: false }), []);
  const closeChat   = useCallback(() => setChatConfig(null), []);
  const minimizeChat = useCallback(() => setChatConfig(c => c ? { ...c, isMinimized: true } : null), []);
  const maximizeChat = useCallback(() => setChatConfig(c => c ? { ...c, isMinimized: false } : null), []);
  const notifyCoverageApplied = useCallback(() => setCoverageAppliedAt(Date.now()), []);

  const value = useMemo(() => ({
    perfil, escola, role, page, docents, normes, contextIA, frangesIA, toast, api, darkMode,
    chatConfig, coverageAppliedAt,
    setPage, setDocents, setNormes, setContextIA, setEscola, login, logout, showToast, toggleDark,
    openChat, closeChat, minimizeChat, maximizeChat, notifyCoverageApplied,
  }), [perfil, escola, role, page, docents, normes, contextIA, frangesIA, toast, api, darkMode,
       chatConfig, coverageAppliedAt, login, logout, showToast, toggleDark,
       openChat, closeChat, minimizeChat, maximizeChat, notifyCoverageApplied]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
