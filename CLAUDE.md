# GDOCENT — Gestió Docent

SPA de gestió d'absències i cobertures per a centres educatius de primària. Desenvolupat per Jorge Villalba (jvillal7@xtec.cat).

## Accés a Supabase

Usa la **Management API REST** amb el PAT emmagatzemat a `.env.local` (`SUPABASE_PAT`):

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/mtrylcazzwolgzfzmbrn/database/query" \
  -H "Authorization: Bearer $(grep SUPABASE_PAT .env.local | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT ..."}'
```

Per desplegar Edge Functions:
```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_PAT .env.local | cut -d= -f2) \
  npx supabase functions deploy NOM --project-ref mtrylcazzwolgzfzmbrn --no-verify-jwt
```

**Llegeix sempre el PAT de `.env.local`. Mai demanis OAuth a l'usuari.**

## Context per escola

- [`context/rivo-rubeo.md`](context/rivo-rubeo.md) — CEIP Rivo Rubeo
- [`context/canoriol.md`](context/canoriol.md) — CEE Ca N'Oriol

## Stack

- **Frontend**: React 18 + Vite, CSS global (`src/index.css`), routing per estat
- **Backend**: Supabase (PostgreSQL + REST API v1) amb RLS activat
- **Auth**: JWT custom signat amb `SUPABASE_JWT_SECRET` via Edge Function `login`
- **IA**: Claude Sonnet via Cloudflare Worker proxy (valida JWT de Supabase)
- **Desplegament**: Vite build estàtic → GitHub Pages (push a `main`)

## Arquitectura d'autenticació (JWT)

El login **no usa Supabase Auth**. Usa una Edge Function pròpia:

1. Frontend → `POST /functions/v1/login` amb `{ escola_id, user_id, pin, grup }`
2. Edge Function valida PIN contra `directius` o `docents` (service key)
3. Retorna JWT signat amb `SUPABASE_JWT_SECRET` i claims `{ user_metadata: { escola_id, rol } }`
4. Frontend guarda JWT a `sessionStorage` com `gd_jwt`
5. Totes les peticions REST usen `Authorization: Bearer {jwt}`
6. RLS filtra per `(auth.jwt() -> 'user_metadata' ->> 'escola_id')::uuid`

### Grups de login
- `teacher` / `pae` / `vetllador` → taula `docents`
- `directiu` → taula `directius`
- `superadmin` → PIN validat contra secret `SA_PIN` de l'Edge Function; retorna JWT amb `rol=superadmin` que bypassa el filtre d'escola en RLS

### Sessió
- JWT i sessió emmagatzemats a `sessionStorage` (expiren en tancar el navegador)
- `gd_last_escola_key` a `localStorage` (pre-selecció d'escola en futures visites)

## Seguretat — RLS

Totes les taules tenen RLS activat. Polítiques a `supabase/migrations/001_enable_rls.sql`.

| Rol | Accés |
|-----|-------|
| `anon` | `escoles(id,nom,codi)`, `docents(id,nom,rol,grup_principal)`, `directius(id,nom,rol)` — sense PINs |
| `authenticated` | Totes les taules filtrades per `escola_id = jwt_escola_id()` |
| `superadmin` | Totes les taules de totes les escoles |

**La columna `pin` mai es retorna al client** (revocada via grants de columna).

## Estructura del projecte

```
src/
  lib/
    constants.js     # FRANJES, SCHOOL_FRANJES, NAV_CFG, BNAV, URLs (sense PINs)
    utils.js         # initials, avatarColor, normGrup, todayISO, formatDate, rolLabel
    api.js           # supaFetch() + makeApi(escolaId) — usa JWT de sessionStorage
    claude-api.js    # callClaude, callClaudeRaw — usa JWT per autenticar el Worker
  context/
    AppContext.jsx   # perfil, escola, role, page, docents, normes, api, toast
  pages/
    login/LoginFlow.jsx        # 3 passos: escola → rol → usuari+PIN (valida via Edge Function)
    jefa/AvuiPage.jsx
    jefa/AvisosPage.jsx
    jefa/TPPage.jsx
    jefa/HistorialPage.jsx
    jefa/HorarisPage.jsx
    teacher/AvisarPage.jsx
    teacher/CoberturasPage.jsx
    teacher/MeuTPPage.jsx
    admin/AdminPage.jsx
    superadmin/SuperAdminDashboard.jsx  # /?superadmin=1, PIN via Edge Function
supabase/
  functions/
    login/           # Valida PIN, emet JWT. Secrets: SUPABASE_JWT_SECRET, SA_PIN
    coverage-notifier/
    absence-notifier/
    send-email/
    db/
  migrations/
    001_enable_rls.sql
    002_login_support.sql
  grants.sql
cloudflare-worker/
  index.js           # Valida JWT (SUPABASE_JWT_SECRET com a secret de Cloudflare)
```

## Base de dades (Supabase)

Projecte: `mtrylcazzwolgzfzmbrn` (eu-west-1)

### Taules principals

| Taula | Camps rellevants |
|-------|-----------------|
| `escoles` | `id`, `nom`, `codi`, `normes_ia`, `context_ia` |
| `docents` | `id`, `nom`, `escola_id`, `actiu`, `rol`, `grup_principal`, `horari` (JSONB), `tp_franges`, `cobertures_mes`, `coordinador_cicle` |
| `directius` | `id`, `nom`, `escola_id`, `rol`, `grup_principal`, `pin`, `actiu`, `posicio` |
| `absencies` | `id`, `escola_id`, `docent_nom`, `data`, `franges` (JSON), `motiu`, `estat` |
| `cobertures` | `id`, `escola_id`, `absencia_id`, `docent_cobrint_nom`, `docent_absent_nom`, `franja`, `grup`, `data` |
| `deutes_tp` | `id`, `escola_id`, `docent_nom`, `data_deute`, `motiu`, `retornat` |
| `login_attempts` | `ip`, `user_key`, `attempted_at`, `success` — rate limiting server-side |

### Franges horàries (`FRANJES`)

`f1a` 9:00–9:30 · `f1b` 9:30–10:00 · `f2a` 10:00–10:30 · `patiA` 10:30–11:00 · `patiB` 11:00–11:30 · `f3a` 11:30–12:00 · `f3b` 12:00–12:30 · `f4` Dinar · `f5a` 15:00–15:30 · `f5b` 15:30–16:00 · `f5c` 16:00–16:30

## Rols i usuaris

### Equip directiu — taula `directius` a Supabase
Els PINs ja **no estan al codi**. Es gestionen directament a la BD.

### Docents — taula `docents`
Rol `teacher`. PIN a `docents.pin` (mai retornat al client).

### Navegació per rol
- `jefa` → Avui (`jd`), Avisos (`javis`), TP (`jtp`), Horaris (`jhoraris`), Historial (`jh`)
- `teacher` → Avisar (`ta`), Cobertures (`tc`), El meu TP (`tt`)
- `director` / `secretaria` → Historial (`di`)
- `dev` → Normes IA (`dv`), Context IA (`dv_context`), Logs (`dv_logs`)

## API (`makeApi`)

```js
const api = makeApi(escolaId); // obtingut de AppContext
```

Mètodes principals:
- `getDocents()` — docents actius (sense PIN)
- `saveAbsencia(a)` — **sempre incloure `escola_id`** al body
- `patchAbsencia(id, data)` — actualitza estat
- `saveCobertura(c)` — registra cobertura
- `getDeutesTP()` / `saveDeuteTP(d)` / `marcarDeuteTornat(id)`
- `getNormesIA()` / `saveNormesIA(txt)`

## IA de cobertures

Cloudflare Worker: `https://orange-bar-54f5gceip-claude-proxy.jvillal7.workers.dev`

Autenticat amb el JWT de l'usuari (`Authorization: Bearer {jwt}`). El Worker valida el JWT contra `SUPABASE_JWT_SECRET` (secret de Cloudflare).

## Convencions de codi

- **Lean code**: sense Redux, sense CSS modules
- Inline styles per a elements únics; classes CSS globals per a patrons repetits
- `normGrup(s)` per comparar noms de grups
- `SCHOOL_FRANJES = FRANJES.filter(f => !f.lliure)` — exclou Dinar
- `saveAbsencia` i `saveCobertura` han d'incloure `escola_id` al body

## Dev

```bash
npm run dev      # Vite dev server (:5173 o :8080)
npm run build    # Build estàtic a dist/
```
