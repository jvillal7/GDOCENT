import { useApp } from '../context/AppContext';
import { DEFAULT_PAGE } from '../lib/constants';
import AvuiPage      from './jefa/AvuiPage';
import AvisosPage    from './jefa/AvisosPage';
import TPPage        from './jefa/TPPage';
import HistorialPage from './jefa/HistorialPage';
import HorarisPage   from './jefa/HorarisPage';
import AvisarPage    from './teacher/AvisarPage';
import CoberturasPage from './teacher/CoberturasPage';
import MeuTPPage     from './teacher/MeuTPPage';
import { ResumPage, InformesPage } from './StaticPages';
import AdminPage from './admin/AdminPage';
import OriolAbsentsPage  from './jefa/oriol/OriolAbsentsPage';
import OriolReunionsPage from './jefa/oriol/OriolReunionsPage';
import OriolCeepsirPage  from './jefa/oriol/OriolCeepsirPage';
import OriolBaixesPage   from './jefa/oriol/OriolBaixesPage';

const PAGES = {
  jd: AvuiPage,   javis: AvisosPage,  jtp: TPPage,
  jh: HistorialPage, jhoraris: HorarisPage,
  ta: AvisarPage, tc: CoberturasPage, tt: MeuTPPage,
  di: HistorialPage, df: InformesPage, dv: AdminPage,
  oj_abs: OriolAbsentsPage, oj_reu: OriolReunionsPage,
  oj_cee: OriolCeepsirPage, oj_bai: OriolBaixesPage,
};

const JEFA_PAGES = new Set(['jd','javis','jtp','jh','jhoraris','oj_abs','oj_reu','oj_cee','oj_bai']);

export default function PageRouter() {
  const { page, role } = useApp();
  const safePage = (JEFA_PAGES.has(page) && role !== 'jefa') ? (DEFAULT_PAGE[role] || 'ta') : page;
  const Page = PAGES[safePage];
  return Page ? <Page /> : <div className="page-hdr"><h1>Pàgina</h1></div>;
}
