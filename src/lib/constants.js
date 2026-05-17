export const SUPA_URL          = import.meta.env.VITE_SUPA_URL;
export const SUPA_KEY          = import.meta.env.VITE_SUPA_KEY;
export const WORKER_URL        = import.meta.env.VITE_WORKER_URL;
export const WORKER_AUTH_TOKEN = import.meta.env.VITE_WORKER_AUTH_TOKEN;
export const APP_URL           = import.meta.env.VITE_APP_URL;

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
      { id: 'jd',       icon: '📊', label: 'Avui',            anim: 'bars' },
      { id: 'javis',    icon: '🔔', label: 'Avisos rebuts',    anim: 'bell' },
    ]},
    { sec: 'Gestió', items: [
      { id: 'jtp',      icon: '🕐', label: 'Treball Personal', anim: 'clock' },
      { id: 'jhoraris', icon: '👥', label: 'Personal',         anim: 'walk' },
      { id: 'jh',       icon: '📋', label: 'Historial',        anim: 'flip' },
    ]},
    { sec: "Diari Ca N'Oriol", oriolOnly: true, items: [
      { id: 'oj_abs', icon: '👤', label: "Persones que s'absenten", anim: 'bob' },
      { id: 'oj_reu', icon: '📝', label: 'Reunions i organització',  anim: 'write' },
      { id: 'oj_cee', icon: '🏥', label: 'Actuacions CEEPSIR',       anim: 'pulse' },
      { id: 'oj_bai', icon: '📋', label: 'Baixes amb substitucions', anim: 'flip' },
    ]},
  ],
  teacher: [
    { sec: 'El meu espai', items: [
      { id: 'ta', icon: '🏥', label: 'Avisar absència',       anim: 'pulse' },
      { id: 'tc', icon: '🔄', label: 'Les meves cobertures',  anim: 'spin' },
      { id: 'tt', icon: '🕐', label: 'El meu TP',             anim: 'clock' },
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
  dev:       [{ sec: 'Configuració IA', items: [{ id: 'dv', icon: '🤖', label: 'Normes IA' }, { id: 'dv_context', icon: '🏫', label: 'Context IA' }] }],
};

export const BNAV = {
  jefa:      [{ id: 'jd', icon: '📊', label: 'Avui', anim: 'bars' }, { id: 'javis', icon: '🔔', label: 'Avisos', anim: 'bell' }, { id: 'jtp', icon: '🕐', label: 'TP', anim: 'clock' }, { id: 'jhoraris', icon: '👥', label: 'Personal', anim: 'walk' }, { id: 'jh', icon: '📋', label: 'Historial', anim: 'flip' }],
  teacher:   [{ id: 'ta', icon: '🏥', label: 'Avisar', anim: 'pulse' }, { id: 'tc', icon: '🔄', label: 'Cobertures', anim: 'spin' }, { id: 'tt', icon: '🕐', label: 'TP', anim: 'clock' }],
  educador:  [{ id: 'ta', icon: '🏥', label: 'Avisar' }, { id: 'tc', icon: '🔄', label: 'Cobertures' }],
  vetllador: [{ id: 'ta', icon: '🏥', label: 'Avisar' }, { id: 'tc', icon: '🔄', label: 'Cobertures' }],
  director:  [{ id: 'di', icon: '📋', label: 'Historial' }],
  secretaria:[{ id: 'di', icon: '📋', label: 'Historial' }],
  dev:       [{ id: 'dv', icon: '🤖', label: 'Normes' }, { id: 'dv_context', icon: '🏫', label: 'Context' }],
};

export const DEFAULT_PAGE = { jefa: 'jd', teacher: 'ta', educador: 'ta', vetllador: 'ta', tei: 'ta', director: 'di', secretaria: 'di', dev: 'dv' };

export const PAGE_TITLES = {
  jd: 'Avui', javis: 'Avisos rebuts', jtp: 'Treball Personal',
  jh: 'Historial', jhoraris: 'Personal del centre',
  ta: 'Avisar absència', tc: 'Les meves cobertures', tt: 'El meu TP',
  di: 'Historial', df: 'Informes', dv: 'Normes IA', dv_context: 'Context IA',
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

export const COORDINADORS_CICLE = {
  rivo: [
    { firstName: 'lidia',  cicle: 'Petits'  },
    { firstName: 'lorena', cicle: 'Mitjans' },
    { firstName: 'chema',  cicle: 'Grans'   },
  ],
  oriol: [
    { inicials: 'V.G', cicle: 'Infantil-Primària' },
    { inicials: 'S.J', cicle: 'Secundària'        },
  ],
};

// Motius interns amb lògica especial
export const MOTIU_ACOMPANYAR      = "Acompanyar fill/a activitat escolar";
export const MOTIU_FLEXIBILITZACIO = "Flexibilització Horària";
export const ACOMPANYAR_MAX_USOS   = 2;

// Motius que cal gestionar per ATRI (es computa a partir de MOTIUS_ABSENCIA, definit avall)
// S'exporta com a funció per evitar dependències circulars d'inicialització
export function esMotuiATRI(motiu) {
  return motiu.startsWith('Permís per') || motiu.startsWith('Llicència') || motiu.startsWith('Reducció');
}

// Motius que requereixen enviar justificant a direcció
export const MOTIUS_AMB_JUSTIFICANT = new Set([
  "Malaltia",
  "Visita mèdica / Especialista",
  "Urgència mèdica",
  "Permís per accident d'un familiar",
  "Permís per hospitalització d'un familiar",
  "Permís per malaltia greu d'un familiar",
  "Permís per examen prenatal / preparació part",
]);

export const MOTIUS_ABSENCIA = [
  // ── ATRI ────────────────────────────────────────────────────────────────
  { grup: "ATRI · Família", opcions: [
    "Permís per accident d'un familiar",
    "Permís per hospitalització d'un familiar",
    "Permís per mort d'un familiar",
    "Permís per malaltia greu d'un familiar",
    "Permís per matrimoni d'un fill o familiar fins a 2on grau",
    "Permís per atendre fill discapacitat",
    "Permís sense retribució per atendre un familiar",
  ]},
  { grup: "ATRI · Personal", opcions: [
    "Permís per deures inexcusables que comporta substitució",
    "Permís per exàmens finals en centres oficials",
    "Permís per examen prenatal / preparació part",
    "Permís per trasllat de domicili",
    "Llicència per assumptes propis no remunerats",
    "Llicència d'estudis no retribuïda (tot un curs)",
    "Permís per deure inexcusable - candidat electoral",
    "Permís per matrimoni",
    "Permís per situació de violència de gènere",
  ]},
  { grup: "ATRI · Maternitat / Paternitat", opcions: [
    "Permís per adopció internacional",
    "Permís per lactància",
    "Permís per lactància compactat",
    "Permís per tràmits adopció / acolliment",
  ]},
  { grup: "ATRI · Reducció de jornada", opcions: [
    "Reducció de jornada compactat per cura d'un fill",
    "Reducció de jornada per cura menor 12 anys o familiar",
    "Reducció de jornada per cura de disminuït sense activitat retribuïda",
    "Reducció de jornada per cura de familiar de primer grau",
    "Reducció de jornada per cura d'un fill/a menor 6 anys",
    "Reducció de jornada per cura d'un familiar discapacitat",
    "Reducció de jornada total retribuïda per discapacitat reconeguda",
    "Reducció de jornada per adaptació progressiva al lloc de treball",
    "Reducció de jornada per cura de fill afectat de malaltia greu",
    "Reducció voluntària de jornada",
  ]},
  // ── INTERNS ─────────────────────────────────────────────────────────────
  { grup: "Interns · Salut pròpia", opcions: [
    "Malaltia",
    "Visita mèdica / Especialista",
    "Urgència mèdica",
  ]},
  { grup: "Interns · Centre", opcions: [
    MOTIU_ACOMPANYAR,
    MOTIU_FLEXIBILITZACIO,
  ]},
  { grup: "Interns · Altres", opcions: [
    "Assumpte personal",
    "No especificat",
  ]},
];

export const SIEI_ALUMNES = {
  rivo: ['THEO','SEBAS','TYLER','POL','AARON','MOHAMED','CLAUDIA','MAXIM','MIRANDA','ADAM'],
};

// ── CA N'ORIOL — horari específic ──────────────────────────────────────────
// Matí: 9:30–13:00  |  Pati A (Infantil/Primària): 11:00–11:30  |  Pati B (Secundària): 11:30–12:00
// Tarda: 15:00–16:30
export const FRANJES_ORIOL = [
  { id: 'o1a',    label: '1a hora', sub: '9:30–10:00',  hora: '1a hora' },
  { id: 'o1b',    label: '1a hora', sub: '10:00–10:30', hora: '1a hora' },
  { id: 'o2a',    label: '2a hora', sub: '10:30–11:00', hora: '2a hora' },
  { id: 'opatiA', label: 'Pati A',  sub: '11:00–11:30 · Infantil/Primària', hora: 'Pati A', patio: true },
  { id: 'opatiB', label: 'Pati B',  sub: '11:30–12:00 · Secundària',        hora: 'Pati B', patio: true },
  { id: 'o3a',    label: '3a hora', sub: '12:00–12:30', hora: '3a hora' },
  { id: 'o3b',    label: '3a hora', sub: '12:30–13:00', hora: '3a hora' },
  { id: 'o4',     label: 'Dinar',   sub: '13:00–15:00', hora: 'Dinar',   lliure: true },
  { id: 'o5a',    label: 'Tarda',   sub: '15:00–15:30', hora: 'Tarda' },
  { id: 'o5b',    label: 'Tarda',   sub: '15:30–16:00', hora: 'Tarda' },
  { id: 'o5c',    label: 'Tarda',   sub: '16:00–16:30', hora: 'Tarda' },
];

export const SCHOOL_FRANJES_ORIOL = FRANJES_ORIOL.filter(f => !f.lliure);

export const GRUPS_ORIOL = ['G1','G2','G3','G4','G5','G6','G7','G8','G9','G10','G11','G12','G13','G14','MxI'];

export const BLOCS_ORIOL = [
  { hora: '1a hora', slots: ['o1a','o1b'] },
  { hora: '2a hora', slots: ['o2a'] },
  { hora: 'Pati A',  slots: ['opatiA'] },
  { hora: 'Pati B',  slots: ['opatiB'] },
  { hora: '3a hora', slots: ['o3a','o3b'] },
  { hora: 'Dinar',   slots: ['o4'] },
  { hora: 'Tarda',   slots: ['o5a','o5b','o5c'] },
];
