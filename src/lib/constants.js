export const SUPA_URL = 'https://mtrylcazzwolgzfzmbrn.supabase.co';
export const SUPA_KEY = 'sb_publishable_t3-NsA6e13wB0-kDuXvXGw_7b6vVllK';
export const WORKER_URL = 'https://orange-bar-54f5gceip-claude-proxy.jvillal7.workers.dev';

// Correu de la cap d'estudis (per a proves; canviar quan estigui en producció)
export const JEFA_EMAIL = 'jvillal7@xtec.cat';

// URL pública de l'app (s'usa als correus)
export const APP_URL = 'https://jvillal7.github.io/GDOCENT';

export const FRANJES = [
  { id: 'f1a',   label: '1a hora', sub: '9:00–9:30',   hora: '1a hora' },
  { id: 'f1b',   label: '1a hora', sub: '9:30–10:00',  hora: '1a hora' },
  { id: 'f2a',   label: '2a hora', sub: '10:00–10:30', hora: '2a hora' },
  { id: 'patiA', label: 'Pati A',  sub: '10:30–11:00', hora: 'Pati A',  patio: true },
  { id: 'patiB', label: 'Pati B',  sub: '11:00–11:30', hora: 'Pati B',  patio: true },
  { id: 'f3a',   label: '3a hora', sub: '11:30–12:00', hora: '3a hora' },
  { id: 'f3b',   label: '3a hora', sub: '12:00–12:30', hora: '3a hora' },
  { id: 'f4',    label: 'Dinar',   sub: '12:30–15:00', hora: 'Dinar',   lliure: true },
  { id: 'f5a',   label: 'Tarda', sub: '15:00–15:30', hora: 'Tarda' },
  { id: 'f5b',   label: 'Tarda', sub: '15:30–16:00', hora: 'Tarda' },
  { id: 'f5c',   label: 'Tarda', sub: '16:00–16:30', hora: 'Tarda' },
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
      { id: 'jhoraris', icon: '👥', label: 'Personal' },
      { id: 'jh',       icon: '📋', label: 'Historial' },
    ]},
    { sec: "Diari Ca N'Oriol", oriolOnly: true, items: [
      { id: 'oj_abs', icon: '👤', label: "Persones que s'absenten" },
      { id: 'oj_reu', icon: '📝', label: 'Reunions i organització' },
      { id: 'oj_cee', icon: '🏥', label: 'Actuacions CEEPSIR' },
      { id: 'oj_bai', icon: '📋', label: 'Baixes amb substitucions' },
    ]},
  ],
  teacher: [
    { sec: 'El meu espai', items: [
      { id: 'ta', icon: '🏥', label: 'Avisar absència' },
      { id: 'tc', icon: '🔄', label: 'Les meves cobertures' },
      { id: 'tt', icon: '🕐', label: 'El meu TP' },
    ]},
  ],
  educador: [
    { sec: 'El meu espai', items: [
      { id: 'ta', icon: '🏥', label: 'Avisar absència' },
      { id: 'tc', icon: '🔄', label: 'Les meves cobertures' },
    ]},
  ],
  vetllador: [
    { sec: 'El meu espai', items: [
      { id: 'ta', icon: '🏥', label: 'Avisar absència' },
      { id: 'tc', icon: '🔄', label: 'Les meves cobertures' },
    ]},
  ],
  director:  [{ sec: 'Direcció',  items: [{ id: 'di', icon: '📋', label: 'Historial' }] }],
  secretaria:[{ sec: 'Secretaria',items: [{ id: 'di', icon: '📋', label: 'Historial' }] }],
  dev:       [{ sec: 'Sistema',   items: [{ id: 'dv', icon: '🤖', label: 'Normes IA' }] }],
};

export const BNAV = {
  jefa:      [{ id: 'jd', icon: '📊', label: 'Avui' }, { id: 'javis', icon: '🔔', label: 'Avisos' }, { id: 'jtp', icon: '🕐', label: 'TP' }, { id: 'jhoraris', icon: '👥', label: 'Personal' }, { id: 'jh', icon: '📋', label: 'Historial' }],
  teacher:   [{ id: 'ta', icon: '🏥', label: 'Avisar' }, { id: 'tc', icon: '🔄', label: 'Cobertures' }, { id: 'tt', icon: '🕐', label: 'TP' }],
  educador:  [{ id: 'ta', icon: '🏥', label: 'Avisar' }, { id: 'tc', icon: '🔄', label: 'Cobertures' }],
  vetllador: [{ id: 'ta', icon: '🏥', label: 'Avisar' }, { id: 'tc', icon: '🔄', label: 'Cobertures' }],
  director:  [{ id: 'di', icon: '📋', label: 'Historial' }],
  secretaria:[{ id: 'di', icon: '📋', label: 'Historial' }],
  dev:       [{ id: 'dv', icon: '🤖', label: 'Normes IA' }],
};

export const DEFAULT_PAGE = { jefa: 'jd', teacher: 'ta', educador: 'ta', vetllador: 'ta', tei: 'ta', director: 'di', secretaria: 'di', dev: 'dv' };

export const PAGE_TITLES = {
  jd: 'Avui', javis: 'Avisos rebuts', jtp: 'Treball Personal',
  jh: 'Historial', jhoraris: 'Personal del centre',
  ta: 'Avisar absència', tc: 'Les meves cobertures', tt: 'El meu TP',
  di: 'Historial', df: 'Informes', dv: 'Normes IA',
  oj_abs: "Persones que s'absenten", oj_reu: 'Reunions i organització',
  oj_cee: 'Actuacions CEEPSIR',      oj_bai: 'Baixes amb substitucions',
};

export const AVATAR_COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#A142F4', '#24C1E0'];

export const MANAGEMENT_USERS = {
  rivo: [
    { id: 'm_dir',  nom: 'Cristina',     rol: 'director',   grup_principal: 'Directora',            pin: '1234' },
    { id: 'm_jefa', nom: 'Veronica',     rol: 'jefa',       grup_principal: "Cap d'Estudis",        pin: '1234' },
    { id: 'm_sec',  nom: 'Patricia',     rol: 'secretaria', grup_principal: 'Secretaria',           pin: '1234' },
    { id: 'm_dev',  nom: 'Administrador',rol: 'dev',        grup_principal: 'Accés tècnic total',   pin: '1234' },
  ],
  oriol: [
    { id: 'm_dir_oriol',  nom: 'Yolanda',        rol: 'director',   grup_principal: 'Directora',            pin: '1234' },
    { id: 'm_jefa_oriol', nom: 'Mireia',          rol: 'jefa',       grup_principal: "Cap d'Estudis",        pin: '1234' },
    { id: 'm_sec_oriol',  nom: 'Agnès',           rol: 'secretaria', grup_principal: 'Secretaria',           pin: '1234' },
    { id: 'm_dev_oriol',  nom: 'Administrador',   rol: 'dev',        grup_principal: 'Accés tècnic total',   pin: '1234' },
  ],
};

export const DIES = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres'];

export const SIEI_ALUMNES = {
  rivo: ['THEO','SEBAS','TYLER','POL','AARON','MOHAMED','CLAUDIA','MAXIM','MIRANDA','ADAM'],
};

// ── CA N'ORIOL — horari específic ──────────────────────────────────────────
// Matí: 9:30–13:00  |  Pati A: 10:30–11:00  |  Pati B: 11:00–11:30
// Tarda: 15:00–16:30
export const FRANJES_ORIOL = [
  { id: 'o1a',    label: '1a hora', sub: '9:30–10:00',  hora: '1a hora' },
  { id: 'o1b',    label: '1a hora', sub: '10:00–10:30', hora: '1a hora' },
  { id: 'opatiA', label: 'Pati A',  sub: '10:30–11:00', hora: 'Pati A',  patio: true },
  { id: 'opatiB', label: 'Pati B',  sub: '11:00–11:30', hora: 'Pati B',  patio: true },
  { id: 'o3a',    label: '3a hora', sub: '11:30–12:00', hora: '3a hora' },
  { id: 'o3b',    label: '3a hora', sub: '12:00–12:30', hora: '3a hora' },
  { id: 'o3c',    label: '3a hora', sub: '12:30–13:00', hora: '3a hora' },
  { id: 'o4',     label: 'Dinar',   sub: '13:00–15:00', hora: 'Dinar',   lliure: true },
  { id: 'o5a',    label: 'Tarda', sub: '15:00–15:30', hora: 'Tarda' },
  { id: 'o5b',    label: 'Tarda', sub: '15:30–16:00', hora: 'Tarda' },
  { id: 'o5c',    label: 'Tarda', sub: '16:00–16:30', hora: 'Tarda' },
];

export const SCHOOL_FRANJES_ORIOL = FRANJES_ORIOL.filter(f => !f.lliure);

export const GRUPS_ORIOL = ['G1','G2','G3','G4','G5','G6','G7','G8','G9','G10','G11','G12','G13','G14','G15','G16'];

export const BLOCS_ORIOL = [
  { hora: '1a hora', slots: ['o1a','o1b'] },
  { hora: 'Pati A',  slots: ['opatiA'] },
  { hora: 'Pati B',  slots: ['opatiB'] },
  { hora: '3a hora', slots: ['o3a','o3b','o3c'] },
  { hora: 'Dinar',   slots: ['o4'] },
  { hora: 'Tarda', slots: ['o5a','o5b','o5c'] },
];
