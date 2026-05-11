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
- Infantil: I3, I4, I5
- Cicle Inicial: 1r, 2n
- Cicle Mitjà: 3r, 4t
- Cicle Superior: 5è, 6è

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

- En primer lloc, si hi ha un mestre que estigui deslliurat de la seva franja perquè el grup que li toca per horari esta de sortida o fent una activitat fora de l'aula/centre, en segon lloc es fa servir el mestre que estigui fent un suport al mateix grup o nivell (per exemple 3r A i 3r B), en tercer lloc, un suport al mateix cicle, en quart lloc un suport d'un altra cicle i continuació desfer suports que tinguin racons i tallers.
- Si la norma 1 no la pots complir, assigna un mestre que en aquella franja tingui TP (Treball Personal, 2h setmanals pròpies). Cobrirà l'absència però se li generarà un deute de TP que caldrà retornar-li.
- IMPORTANT: Lliure a l'horari significa que el docent NO és al centre en aquella franja. No es pot utilitzar mai per cobrir. Lliure = absent del centre.
- Els especialistes (EF, Anglès, Música, EI Suport, MESI) poden cobrir si en aquella franja tenen una activitat al centre però no tenen grup assignat en aquell moment.
- Els docents en Càrrec només com a últim recurs (SÍ genera deute). Docent amb coordinació no poden ser contemplats.
- Personal MESI: pot cobrir absències generals però és l'ÚLTIMA OPCIÓ. Si hi ha suport regular del mateix cicle disponible, usar-lo primer i NO interrompre la tasca MESI.
- Educadores (Sònia, Leyre): la seva funció és suport a alumnes específics, no docència general.
- Vetlladors (Víctor, Isa, Sandra): ídem.
- Personal SIEI/SIEI+ (Aurora, Clara): atenció als alumnes SIEI, no substituïbles.
- Preferir tutors del mateix cicle.
- Màxim 2 hores la mateixa persona per cobrir una absència.
- Cap membre de l'equip PAE ni Vetlladores no poden cobrir tutors en cap cas.
- L'equip directiu en cas d'estar fent Equip directiu o coordinació no pot estar disponible. En canvi, sí entren a disposició si són hores de suport.
- DESDOBLAMENT O MIG GRUP: Quan un mestre té un Desdoblament o Mig grup del MATEIX NIVELL/CICLE que el docent absent → passa de tenir mig grup a tenir el grup complet → NO genera deute TP. PRIORITZAR per davant de qualsevol docent que faci TP.
- TP CONVALIDACIÓ: Si un especialista cobreix una franja on tenia TP però té una franja de pati o lliure ADJACENT (just abans o just després) dins la mateixa sessió → pot compensar el TP sense generar deute real. Marcar tp_afectat: false, motiu 'TP compensat per franja adjacent lliure'.

## Notes especials

- La jefa (Veronica) gestiona les cobertures des del rol `jefa`
- Les normes_ia s'editen des de l'apartat "Normes IA" (rol dev, AdminPage)
- **Font de veritat de les normes:** camp `normes_ia` de la taula `escoles` a Supabase (sempre llegir d'allà, aquest fitxer pot estar desactualitzat)
