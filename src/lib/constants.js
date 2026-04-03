export const SUPA_URL = 'https://mtrylcazzwolgzfzmbrn.supabase.co';
export const SUPA_KEY = 'sb_publishable_t3-NsA6e13wB0-kDuXvXGw_7b6vVllK';
export const WORKER_URL = 'https://orange-bar-54f5gceip-claude-proxy.jvillal7.workers.dev';

export const FRANJES = [
  { id: 'f1a',   label: '1a hora', sub: '9:00–9:30',   hora: '1a hora' },
  { id: 'f1b',   label: '1a hora', sub: '9:30–10:00',  hora: '1a hora' },
  { id: 'f2a',   label: '2a hora', sub: '10:00–10:30', hora: '2a hora' },
  { id: 'patiA', label: 'Pati A',  sub: '10:30–11:00', hora: 'Pati A',  patio: true },
  { id: 'patiB', label: 'Pati B',  sub: '11:00–11:30', hora: 'Pati B',  patio: true },
  { id: 'f3a',   label: '3a hora', sub: '11:30–12:00', hora: '3a hora' },
  { id: 'f3b',   label: '3a hora', sub: '12:00–12:30', hora: '3a hora' },
  { id: 'f4',    label: 'Dinar',   sub: '12:30–15:00', hora: 'Dinar',   lliure: true },
  { id: 'f5a',   label: '5a hora', sub: '15:00–15:30', hora: '5a hora' },
  { id: 'f5b',   label: '5a hora', sub: '15:30–16:00', hora: '5a hora' },
  { id: 'f5c',   label: '5a hora', sub: '16:00–16:30', hora: '5a hora' },
];

// Franges que poden tenir absències (sense Dinar)
export const SCHOOL_FRANJES = FRANJES.filter(f => !f.lliure);

export const NAV_CFG = {
  jefa: [
    { sec: 'Avui', items: [
      { id: 'jd',       icon: '📊', label: 'Avui' },
      { id: 'javis',    icon: '🔔', label: 'Avisos rebuts' },
    ]},
    { sec: 'Gestió', items: [
      { id: 'jtp',      icon: '🕐', label: 'Treball Personal' },
      { id: 'jhoraris', icon: '📅', label: 'Horaris' },
      { id: 'jh',       icon: '📋', label: 'Historial' },
    ]},
  ],
  teacher: [
    { sec: 'El meu espai', items: [
      { id: 'ta', icon: '🏥', label: 'Avisar absència' },
      { id: 'tc', icon: '🔄', label: 'Les meves cobertures' },
      { id: 'tt', icon: '🕐', label: 'El meu TP' },
    ]},
  ],
  director:  [{ sec: 'Direcció',  items: [{ id: 'di', icon: '📊', label: 'Resum' }, { id: 'df', icon: '📋', label: 'Informes' }] }],
  secretaria:[{ sec: 'Secretaria',items: [{ id: 'di', icon: '📊', label: 'Resum' }] }],
  dev:       [{ sec: 'Sistema',   items: [{ id: 'dv', icon: '⚙️', label: 'Administració' }] }],
};

export const BNAV = {
  jefa:      [{ id: 'jd', icon: '📊', label: 'Avui' }, { id: 'javis', icon: '🔔', label: 'Avisos' }, { id: 'jtp', icon: '🕐', label: 'TP' }, { id: 'jhoraris', icon: '📅', label: 'Horaris' }, { id: 'jh', icon: '📋', label: 'Historial' }],
  teacher:   [{ id: 'ta', icon: '🏥', label: 'Avisar' }, { id: 'tc', icon: '🔄', label: 'Cobertures' }, { id: 'tt', icon: '🕐', label: 'TP' }],
  director:  [{ id: 'di', icon: '📊', label: 'Resum' }, { id: 'df', icon: '📋', label: 'Informes' }],
  secretaria:[{ id: 'di', icon: '📊', label: 'Resum' }],
  dev:       [{ id: 'dv', icon: '⚙️', label: 'Admin' }],
};

export const DEFAULT_PAGE = { jefa: 'jd', teacher: 'ta', director: 'di', secretaria: 'di', dev: 'dv' };

export const PAGE_TITLES = {
  jd: 'Avui', javis: 'Avisos rebuts', jtp: 'Treball Personal',
  jh: 'Historial', jhoraris: 'Horaris del centre',
  ta: 'Avisar absència', tc: 'Les meves cobertures', tt: 'El meu TP',
  di: 'Resum', df: 'Informes', dv: 'Administració',
};

export const AVATAR_COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#A142F4', '#24C1E0'];

export const MANAGEMENT_USERS = {
  rivo: [
    { id: 'm_jefa', nom: 'Veronica',     rol: 'jefa',       grup_principal: "Cap d'Estudis",       pin: '1234' },
    { id: 'm_dir',  nom: 'Cristina',     rol: 'director',   grup_principal: 'Director',             pin: '1234' },
    { id: 'm_sec',  nom: 'Patricia',     rol: 'secretaria', grup_principal: 'Secretaria',           pin: '1234' },
    { id: 'm_dev',  nom: 'Administrador',rol: 'dev',        grup_principal: 'Accés tècnic total',   pin: '1234' },
  ],
  oriol: [
    { id: 'm_jefa_oriol', nom: 'Mireia',         rol: 'jefa', grup_principal: "Cap d'Estudis",     pin: '1234' },
    { id: 'm_dev_oriol',  nom: 'Administrador',  rol: 'dev',  grup_principal: 'Accés tècnic total', pin: '1234' },
  ],
};

export const DIES = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres'];
