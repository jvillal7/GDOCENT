# CEIP Rivo Rubeo — Context per a la IA

**escola_id:** `8f240c4e-2525-4fc5-b2d0-82ccb4f12ac2`  
**Codi:** `RIVO`  
**Franges:** FRANJES (src/lib/constants.js) — f1a 9:00–9:30, f1b 9:30–10:00, f2a 10:00–10:30, patiA 10:30–11:00, patiB 11:00–11:30, f3a 11:30–12:00, f3b 12:00–12:30, f4 Dinar (lliure), f5a 15:00–15:30, f5b 15:30–16:00, f5c 16:00–16:30

## Equip directiu (hardcoded, no a Supabase)
| Nom | Rol | PIN |
|-----|-----|-----|
| Cristina | director | 1234 |
| Veronica | jefa | 1234 |
| Patricia | secretaria | 1234 |
| Administrador | dev | 1234 |

## Grups
`I3A, I3B, I4A, I4B, I5A, I5B, 1rA, 1rB, 2nA, 2nB, 3rA, 3rB, 4tA, 4tB, 5eA, 5eB, 6eA, 6eB`

**Cicles:**
- Infantil (Petits): I3, I4, I5
- Cicle de Mitjans: 1r, 2n, 3r
- Cicle de Grans: 4t, 5è, 6è

## Coordinadors de cicle
| Nom | Cicle | Camp BD |
|-----|-------|---------|
| Lidia | Petits | `coordinador_cicle = "Petits"` |
| Lorena | Mitjans | `coordinador_cicle = "Mitjans"` |
| Chema | Grans | `coordinador_cicle = "Grans"` |

Editable des de Personal → ✏️ Editar → "Coordinador/a de cicle". El badge lila "Coord. Petits" etc. apareix al llistat de personal.

## Alumnes SIEI (no cobribles, atenció especial)
`THEO, SEBAS, TYLER, POL, AARON, MOHAMED, CLAUDIA, MAXIM, MIRANDA, ADAM`

## Normes IA (normes_ia a Supabase — font de veritat)

- NORMA 1 — DOCENT ALLIBERAT PER SORTIDA: Si un docent tenia classe en aquella franja però el seu grup és de sortida o activitat fora del centre i el docent es queda a l'escola, queda lliure i és la primera opció per cobrir. No genera deute TP.
- NORMA 2 — RACONS (desdoblament de matí per nivells): Els racons són desdoblaments on un especialista agafa alumnes de dos grups del mateix nivell (ex: Racons 1 = 1r, Racons 2 = 2n) i les tutores es queden amb menys alumnes a l'aula. Si falta un TUTOR el dia de racons: l'especialista que feia el racó d'aquell nivell assumeix el grup de la tutora absent i no es fa el desdoblament — és la primera opció, no genera TP. Si no es fan els racons igualment, la mateixa persona va a cobrir la tutora. Si falta l'ESPECIALISTA que fa el racó: no es fa el racó, cada tutora es queda amb el seu grup complet sense desdoblar — NO cal cobrir l'especialista.
- NORMA 3 — TALLERS (tarda, alumnes barrejats per cicle): Els tallers de tarda barregen alumnes del mateix cicle en grups de 12-15 amb diversos docents. Si falta un TUTOR: el seu taller no es fa i els seus alumnes es distribueixen als altres tallers del cicle — NO cal cobrir la docència. SÍ cal assignar un docent disponible els primers 15 min (15:00-15:15) i els últims (16:15-16:30) per fer l'entrada, repartiment de grups, recollida i retorn a les famílies. Si falta un ESPECIALISTA que fa tallers: el seu taller no es fa i els seus alumnes es queden al taller de la seva tutora — NO cal cobrir l'especialista.
- NORMA 4 — SUPORT DIRECTE AL GRUP/NIVELL: Usar el docent que en aquella franja fa suport al mateix grup o nivell que el docent absent (ex: si falta el tutor de 3rA, buscar qui fa suport a 3rA o 3rB). No genera deute TP.
- NORMA 5 — SUPORT AL MATEIX CICLE: Usar el docent que fa suport dins el mateix cicle (Petits: I3-I5 / Mitjans: 1r-3r / Grans: 4t-6è). No genera deute TP.
- NORMA 6 — SUPORT A CICLE DIFERENT: Usar el docent que fa suport a un cicle diferent. No genera deute TP però és menys ideal.
- NORMA 7 — TP: Si cap de les normes anteriors es pot complir, assigna un mestre que en aquella franja tingui TP (Treball Personal, 2h setmanals pròpies). Cobrirà l'absència però se li generarà un deute de TP que caldrà retornar-li.
- IMPORTANT: Lliure a l'horari significa que el docent NO és al centre en aquella franja. No es pot utilitzar mai per cobrir. Lliure = absent del centre.
- Els especialistes (EF, Anglès, Música, EI Suport, MESI) poden cobrir si en aquella franja tenen una activitat al centre però no tenen grup assignat en aquell moment.
- Els docents en Càrrec només com a últim recurs (SÍ genera deute). Docent amb coordinació no poden ser contemplats.
- Personal MESI: pot cobrir absències generals però és l'ÚLTIMA OPCIÓ. Si hi ha suport regular del mateix cicle disponible, usar-lo primer i NO interrompre la tasca MESI.
- Educadores (Sònia, Leyre): la seva funció és suport a alumnes específics, no docència general.
- Vetlladors (Víctor, Isa, Sandra): ídem.
- Personal SIEI/SIEI+ (Aurora, Clara): atenció als alumnes SIEI, no substituïbles.
- Màxim 2 hores la mateixa persona per cobrir una absència.
- Cap membre de l'equip PAE ni Vetlladores no poden cobrir tutors en cap cas.
- L'equip directiu en cas d'estar fent Equip directiu o coordinació no pot estar disponible. En canvi, sí que entrarien a disposició si són hores de suport.
- DESDOBLAMENT O MIG GRUP: Quan un mestre té un Desdoblament o un Mig grup del MATEIX NIVELL o CICLE que el docent absent, passa de tenir mig grup a tenir el grup complet i NO genera deute de TP. PRIORITZAR per davant de qualsevol docent que faci TP.
- TP CONVALIDACIÓ: Si un especialista cobreix una franja on tenia TP però té una franja de pati o lliure ADJACENT (just abans o just després) dins la mateixa sessió, pot compensar el TP sense generar deute real. Marcar tp_afectat: false, motiu 'TP compensat per franja adjacent lliure'.

## Notes especials

- La jefa (Veronica) gestiona les cobertures des del rol `jefa`
- Les normes_ia s'editen des de l'apartat "Normes IA" (rol dev, AdminPage)
- **Font de veritat de les normes:** camp `normes_ia` de la taula `escoles` a Supabase (sempre llegir d'allà, aquest fitxer pot estar desactualitzat)
