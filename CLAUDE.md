# GDOCENT — Gestió Docent

SPA de gestió d'absències i cobertures per a centres educatius de primària. Desenvolupat per Jorge Villalba (jvillal7@xtec.cat).

## Context per escola (llegir al principi de cada sessió)

- [`context/rivo-rubeo.md`](context/rivo-rubeo.md) — CEIP Rivo Rubeo: grups, cicles, coordinadors, normes IA, personal especial
- [`context/canoriol.md`](context/canoriol.md) — CEE Ca N'Oriol: franges, rols MEE/PAE, Piscina, CEEPSIR, MxI, coordinadors

## Stack

- **Frontend**: React 18 + Vite, CSS global (`src/index.css`), routing per estat (sense React Router)
- **Backend**: Supabase (PostgreSQL + REST API v1) Tu accederás para consultas con el MCP oficial (ya instalado)
- **IA**: Claude Sonnet via Cloudflare Worker proxy (evita exposar la API key)
- **Desplegament**: Vite build estàtic

## Estructura del projecte

```
src/
  lib/
    constants.js     # FRANJES, SCHOOL_FRANJES, NAV_CFG, BNAV, MANAGEMENT_USERS, URLs
    utils.js         # initials, avatarColor, normGrup, todayISO, formatDate, rolLabel
    api.js           # supaFetch() + makeApi(escolaId) — tots els mètodes de BD
    claude.js        # proposarCobertura, proposarCoberturaCella, extractHorariFromPDF
  context/
    AppContext.jsx   # perfil, escola, role, page, docents, normes, api, toast
  components/
    AppShell.jsx     # Shell responsiu: sidebar (desktop) / drawer+bottom-nav (mòbil)
    Spinner.jsx
    Toast.jsx
  pages/
    login/LoginFlow.jsx        # 3 passos: escola → rol → usuari+PIN
    jefa/AvuiPage.jsx          # Graella grups×franges + KPIs + cobrir cel·la
    jefa/AvisosPage.jsx        # Llista avisos pendents + proposta IA per avís
    jefa/TPPage.jsx            # Gestió deutes de Treball Personal
    jefa/HistorialPage.jsx     # Historial d'absències per dia (col·lapsable)
    jefa/HorarisPage.jsx       # Upload PDF horari → Claude extreu JSON → confirmació
    teacher/AvisarPage.jsx     # Formulari d'avís d'absència (dies + franges + motiu)
    teacher/CoberturasPage.jsx # Agenda del docent amb cobertures del dia
    teacher/MeuTPPage.jsx      # Deutes TP personals
    admin/AdminPage.jsx        # Editor de normes IA per escola
    StaticPages.jsx            # ResumPage, InformesPage (placeholders)
    PageRouter.jsx             # Mapeja page ID → component
```

## Base de dades (Supabase)

Projecte: `mtrylcazzwolgzfzmbrn` (eu-west-1)

Totes les taules (excepte `escoles`) tenen `escola_id` per multi-tenancy. `makeApi(escolaId)` afegeix el filtre automàticament a totes les peticions GET.

### Taules principals

| Taula | Camps rellevants |
|-------|-----------------|
| `escoles` | `id`, `nom`, `codi`, `normes_ia` |
| `docents` | `id`, `nom`, `escola_id`, `actiu`, `rol`, `grup_principal`, `horari` (JSONB), `tp_franges`, `cobertures_mes`, `coordinador_cicle` (text, nullable) |
| `absencies` | `id`, `escola_id`, `docent_id`, `docent_nom`, `data`, `franges` (JSON array), `motiu`, `notes`, `estat` (pendent/resolt/arxivat), `creat_el` |
| `cobertures` | `id`, `escola_id`, `absencia_id`, `docent_cobrint_nom`, `docent_absent_nom`, `franja`, `grup`, `data`, `tp_afectat`, `motiu` |
| `deutes_tp` | `id`, `escola_id`, `docent_nom`, `data_deute`, `motiu`, `retornat` |

### Franges horàries (`FRANJES`)

`f1a` 9:00–9:30 · `f1b` 9:30–10:00 · `f2a` 10:00–10:30 · `patiA` 10:30–11:00 · `patiB` 11:00–11:30 · `f3a` 11:30–12:00 · `f3b` 12:00–12:30 · `f4` Dinar (exclòs d'absències) · `f5a` 15:00–15:30 · `f5b` 15:30–16:00 · `f5c` 16:00–16:30

## Rols i usuaris

### Equip directiu (hardcoded a `MANAGEMENT_USERS` en `constants.js`)

| Escola | Nom | Rol | PIN |
|--------|-----|-----|-----|
| CEIP Rivo Rubeo | Cristina | director | 1234 |
| CEIP Rivo Rubeo | Veronica | jefa | 1234 |
| CEIP Rivo Rubeo | Patricia | secretaria | 1234 |
| CEIP Rivo Rubeo | Administrador | dev | 1234 |
| CEE Ca N'Oriol | Yolanda | director | 1234 |
| CEE Ca N'Oriol | Mireia | jefa | 1234 |
| CEE Ca N'Oriol | Agnès | secretaria | 1234 |
| CEE Ca N'Oriol | Administrador | dev | 1234 |

### Docents (carregats de Supabase)
Rol `teacher`. S'identifiquen per nom + PIN emmagatzemat a `docents.pin`.

### Navegació per rol
- `jefa` → Avui (`jd`), Avisos (`javis`), TP (`jtp`), Horaris (`jhoraris`), Historial (`jh`)
- `teacher` → Avisar (`ta`), Cobertures (`tc`), El meu TP (`tt`)
- `director` / `secretaria` → Resum (`di`), Informes (`df`)
- `dev` (admin) → Administració (`dv`) — editor normes IA

## API (`makeApi`)

```js
const api = makeApi(escolaId); // obtingut de AppContext
```

Mètodes principals:
- `getDocents()` — docents actius de l'escola
- `saveAbsencia(a)` — **sempre incloure `escola_id`** al body
- `patchAbsencia(id, data)` — actualitza estat (pendent/resolt/arxivat)
- `saveCobertura(c)` — registra cobertura
- `getDeutesTP()` / `saveDeuteTP(d)` / `marcarDeuteTornat(id)`
- `getNormesIA()` / `saveNormesIA(txt)` — llegeix/escriu `escoles.normes_ia`

## IA de cobertures

Cloudflare Worker: `https://orange-bar-54f5gceip-claude-proxy.jvillal7.workers.dev`

Funcions a `claude.js`:
- `proposarCobertura(absentNom, frangesIds, docents, normes)` — proposta completa per un avís
- `proposarCoberturaCella(grup, hora, temps, docents, normes)` — proposta per una cel·la de la graella
- `extractHorariFromPDF(base64)` — extreu horari d'un PDF (usa visió de Claude)

Les normes (`normes`) vénen de `AppContext.normes` (carregades de `escoles.normes_ia`). Si buides, s'apliquen les regles per defecte (repartiment equitatiu, prioritzar sense TP).

## Motius d'absència (`MOTIUS_ABSENCIA` a constants.js)

Estructura en dos blocs (optgroups al selector):

- **ATRI · Família / Personal / Maternitat / Reducció de jornada** — Permisos i llicències oficials del portal ATRI (Generalitat). En seleccionar-los, es mostra l'avís `🖥️ No oblidis gestionar aquest permís per ATRI`. Detectats per `esMotuiATRI(motiu)` (comencen per "Permís per", "Llicència" o "Reducció").
- **Interns · Salut pròpia** — Malaltia, Visita mèdica, Urgència. Mostren avís `📄 Recorda enviar el justificant mèdic a direcció` (via `MOTIUS_AMB_JUSTIFICANT`).
- **Interns · Centre** — `MOTIU_ACOMPANYAR` ("Acompanyar fill/a activitat escolar") i `MOTIU_FLEXIBILITZACIO` ("Flexibilització Horària"):
  - `ACOMPANYAR_MAX_USOS = 2` per curs escolar (setembre–agost). Comptador a `AvisarPage`. Si s'esgoten, obliga a triar Flexibilització.
  - Flexibilització: les hores es recuperen com decideix la cap d'estudis (pati, suport...), **no genera deute TP**.
- **Interns · Altres** — Assumpte personal, No especificat.

La **cobertura manual** (AvisosPage) també inclou el selector de motiu, que es desa a `absencies.motiu` i `cobertures.motiu`.

## Convencions de codi

- **Lean code**: sense Redux, sense CSS modules, sense abstraccions innecessàries
- Inline styles per a elements únics; classes CSS globals per a patrons repetits
- `normGrup(s)` per comparar noms de grups (normalitza accents, espais, majúscules)
- El `useEffect` de `AvuiPage` depèn de `docents.length` per evitar race condition en la càrrega inicial
- `SCHOOL_FRANJES = FRANJES.filter(f => !f.lliure)` — sempre usar per seleccionar "tot el dia" (exclou Dinar)
- `saveAbsencia` i `saveCobertura` **han d'incloure `escola_id`** al body — `makeApi` només l'afegeix als GETs

## Dev

```bash
npm run dev      # Vite dev server (normalment :5173 o :8080)
npm run build    # Build estàtic a dist/
```
