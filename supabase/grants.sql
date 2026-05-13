-- =============================================================================
-- GDOCENT — Grants explícits per a la Data API de Supabase
-- Executar al SQL Editor del dashboard de Supabase (projecte: mtrylcazzwolgzfzmbrn)
--
-- Context: A partir del 30/05/2026 (nous projectes) i 30/10/2026 (tots els
-- projectes), Supabase requereix GRANTs explícits per a qualsevol taula nova
-- al schema "public". Aquest fitxer assegura que les taules existents
-- continuen funcionant i serveix de plantilla per a taules futures.
--
-- L'app usa exclusivament la clau `anon` per a totes les operacions
-- (sense Supabase Auth). Els GRANTs es donen al rol `anon`.
-- =============================================================================

-- ── escoles ──────────────────────────────────────────────────────────────────
grant select, update
  on public.escoles
  to anon;

-- ── docents ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete
  on public.docents
  to anon;

-- ── absencies ─────────────────────────────────────────────────────────────────
grant select, insert, update, delete
  on public.absencies
  to anon;

-- ── cobertures ────────────────────────────────────────────────────────────────
grant select, insert, update, delete
  on public.cobertures
  to anon;

-- ── deutes_tp ─────────────────────────────────────────────────────────────────
grant select, insert, update, delete
  on public.deutes_tp
  to anon;

-- ── directius ─────────────────────────────────────────────────────────────────
grant select, update
  on public.directius
  to anon;


-- =============================================================================
-- NOTA IMPORTANT: Seqüències (per a claus primàries auto-increment)
-- Si les taules usen SERIAL o BIGSERIAL, cal grant a les seqüències:
-- =============================================================================
-- grant usage, select on all sequences in schema public to anon;


-- =============================================================================
-- PLANTILLA per a NOVES TAULES (afegir després de cada CREATE TABLE):
-- =============================================================================
--
-- grant select, insert, update, delete
--   on public.NOM_TAULA
--   to anon;
--
-- -- Si tens RLS activat, afegir també les polítiques:
-- alter table public.NOM_TAULA enable row level security;
-- create policy "accés anon complet" on public.NOM_TAULA
--   for all to anon using (true) with check (true);
-- =============================================================================
