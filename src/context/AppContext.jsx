import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { makeApi } from '../lib/api';
import { DEFAULT_PAGE } from '../lib/constants';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

function readSession() {
  try { return JSON.parse(localStorage.getItem('gd_session')) || null; }
  catch { return null; }
}

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
  const [docents, setDocents] = useState([]);
  const [normes,  setNormes]  = useState('');
  const [toast, setToast]     = useState(null);

  const api = useMemo(() => escola ? makeApi(escola.id) : null, [escola?.id]);

  // Carregar docents i normes quan hi ha escola (login fresc o sessió restaurada)
  useEffect(() => {
    if (!escola) return;
    if (saved?.escola) document.title = `Gestió Docent — ${escola.nom}`;
    const a = makeApi(escola.id);
    a.getDocents().then(data => { if (data) setDocents(data); });
    a.getNormesIA().then(data => { if (data?.[0]?.normes_ia) setNormes(data[0].normes_ia); });
  }, [escola?.id]);

  const login = useCallback((p, e, r) => {
    const redirect = sessionStorage.getItem('gd_redirect_page');
    sessionStorage.removeItem('gd_redirect_page');
    setPerfil(p);
    setEscola(e);
    setRole(r);
    setPage(redirect || DEFAULT_PAGE[r] || 'ta');
    document.title = `Gestió Docent — ${e.nom}`;
    localStorage.setItem('gd_session', JSON.stringify({ perfil: p, escola: e, role: r }));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('gd_session');
    window.location.reload();
  }, []);

  const showToast = useCallback(msg => {
    const id = Date.now();
    setToast({ msg, id });
    setTimeout(() => setToast(t => t?.id === id ? null : t), 3000);
  }, []);

  const value = useMemo(() => ({
    perfil, escola, role, page, docents, normes, toast, api,
    setPage, setDocents, setNormes, login, logout, showToast,
  }), [perfil, escola, role, page, docents, normes, toast, api, login, logout, showToast]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
