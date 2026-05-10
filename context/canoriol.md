# CEE Ca N'Oriol — Context per a la IA

**escola_id:** `c1d61bed-8c8c-4bc4-abb1-10d514498a5f`  
**Codi:** `CEE_ORIOL`  
**Franges:** FRANJES_ORIOL (src/lib/constants.js)

## Franges horàries
| ID | Hora | Temps |
|----|------|-------|
| o1a | 1a hora | 9:30–10:00 |
| o1b | 1a hora | 10:00–10:30 |
| o2a | 2a hora | 10:30–11:00 |
| opatiA | Pati A | 11:00–11:30 · Infantil/Primària |
| opatiB | Pati B | 11:30–12:00 · Secundària |
| o3a | 3a hora | 12:00–12:30 |
| o3b | 3a hora | 12:30–13:00 |
| o4 | Dinar | 13:00–15:00 (lliure, exclòs) |
| o5a | Tarda | 15:00–15:30 |
| o5b | Tarda | 15:30–16:00 |
| o5c | Tarda | 16:00–16:30 |

## Equip directiu (hardcoded, no a Supabase)
| Nom | Rol | PIN |
|-----|-----|-----|
| Yolanda | director | 1234 |
| Mireia | jefa | 1234 |
| Agnès | secretaria | 1234 |
| Administrador | dev | 1234 |

## Grups
`G1, G2, G3, G4, G5, G6, G7, G8, G9, G10, G11, G12, G13, G14, MxI`

**MxI (Moure x Incloure):** Grup d'escolaritat compartida CEE+SIEI. Alumnes parcials. M.V (PAE) és la de referència. Cobertura prioritària.

## Rols del personal i lògica de cobertures

### MEE (Mestre Educació Especial)
Professionals principals d'aula. Poden cobrir altres MEE. Treballen en parella amb PAE.

### PAE (Professional d'Atenció Educativa)
**REGLA CRÍTICA: Un PAE mai treballa sol.** Sempre ha d'estar acompanyat d'un MEE. No pot ser assignat com a cobertura independent d'un grup.

**D.G (PAE) — disponibilitat flexible dimecres:**
- Dimecres `opatiA` (11:00–11:30) i `opatiB` (11:30–12:00): valor "Suport" = a disposició de la jefa
- Pot reforçar qualsevol grup PERÒ sempre paired amb un MEE
- La cap d'estudis decideix on l'envia en el moment

**M.V (PAE) vs M.VG (PAE):** Són dues persones DIFERENTS. M.V (PAE) = referent MxI (dilluns/dimarts). M.VG (PAE) = altra professional.

### EVIP (Educació Visual i Plàstica / especialista)
Especialista itinerant entre grups.

### MALL (Mestre Atenció a la Llengua i Lectura / logopeda equivalent)
Atenció individualitzada o en petit grup.

### ESTIM (Estimulació)
Sala d'estimulació sensorial. E.R (ESTIM) porta Estimulació a múltiples grups.

### MUS (Música)
A.G (MUS) fa Música a tots els grups.

## Tutors/es per grup
| Grup | Tutor/a | Notes |
|------|---------|-------|
| G1 | (veure BD) | Piscina dilluns o1b–o3b |
| G2 | (veure BD) | Piscina dilluns o1b–o3b |
| G3 | L.S (MEE) | |
| G4 | (veure BD) | |
| G5 | A.S (MEE) + R.V (MEE) | Cotutoria: TP dimecres=A.S, TP dijous=R.V |
| G6 | M.B (MEE) | Piscina dilluns o3a–o3b |
| G7 | L.B (MEE) | Piscina dilluns o3a–o3b |
| G8–G14 | (veure BD) | |
| MxI | C.F (MEE) | Grup Moure x Incloure |

## Activitats especials recurrents

### Piscina (dilluns al matí)
Grups G1, G2 (11:00–13:00): slots `opatiA, o3a, o3b`  
Grups G6, G7 (11:30–13:00): slots `opatiB, o3a, o3b`  
Docents afectats apareixen com "Piscina" a l'horari → **FORA DEL CENTRE**, no disponibles per cobrir.

### CEEPSIR
Alguns professionals estan al CEEPSIR (assistència externa a altres escoles) determinats dies → **FORA**, no disponibles.

### Pati A / Pati B
- Pati A (11:00–11:30): Infantil/Primària (grups G1–G7 aprox.)
- Pati B (11:30–12:00): Secundària (grups G8–G14 aprox.)

## Normes IA (normes_ia a Supabase — ara buit, pendent de definir)

**Les normes específiques s'han d'escriure a l'apartat "Normes IA" (rol dev) i es guarden a `escoles.normes_ia`.**

Principis generals per al CEE (a incorporar a les normes_ia):
- PAE sempre acompanyan MEE, mai cobertura independent
- D.G (PAE) dimecres 11:00–12:00 → disponible flexible PERÒ sempre paired amb MEE
- Piscina i CEEPSIR = fora del centre, no proposar
- G5 té cotutoria A.S + R.V: ambdues han d'estar si és possible
- Grup MxI és prioritari (alumnes d'escolaritat compartida)
- MEE pot cobrir MEE; PAE no pot substituir MEE sol

## Notes tècniques

- `isOriol = escola.nom.toLowerCase().includes('oriol')` → activa lògica Ca N'Oriol a tota l'app
- La vista "Grups" (`viewMode='grups'`) és exclusiva de Ca N'Oriol
- Diari Ca N'Oriol (NAV_CFG: oj_abs, oj_reu, oj_cee, oj_bai) = secció específica del seu diari
- **Font de veritat dels horaris i normes:** Supabase. Aquest fitxer és una guia ràpida, no reemplaça la BD.
