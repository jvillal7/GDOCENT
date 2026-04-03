import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { makeApi } from '../lib/api';
import { DEFAULT_PAGE } from '../lib/constants';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }) {
  const [perfil, setPerfil]   = useState(null);
  const [escola, setEscola]   = useState(null);
  const [role, setRole]       = useState(null);
  const [page, setPage]       = useState(null);
  const [docents, setDocents] = useState([]);
  const [toast, setToast]     = useState(null);

  const api = useMemo(() => escola ? makeApi(escola.id) : null, [escola?.id]);

  const login = useCallback((p, e, r) => {
    setPerfil(p);
    setEscola(e);
    setRole(r);
    setPage(DEFAULT_PAGE[r] || 'jd');
    document.title = `Gestió Docent — ${e.nom}`;
    makeApi(e.id).getDocents().then(data => { if (data) setDocents(data); });
  }, []);

  const logout = useCallback(() => window.location.reload(), []);

  const showToast = useCallback(msg => {
    const id = Date.now();
    setToast({ msg, id });
    setTimeout(() => setToast(t => t?.id === id ? null : t), 3000);
  }, []);

  const value = useMemo(() => ({
    perfil, escola, role, page, docents, toast, api,
    setPage, setDocents, login, logout, showToast,
  }), [perfil, escola, role, page, docents, toast, api, login, logout, showToast]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
