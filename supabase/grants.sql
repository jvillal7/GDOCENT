-- ═══════════════════════════════════════════════════════════════════════════════
-- GRANTS — GDOCENT
-- ⚠️  Totes les taules tenen RLS activat amb polítiques basades en JWT.
--     Veure: supabase/migrations/001_enable_rls.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── ESCOLES ── Anon: id/nom/codi (login). Auth: tot a la seua escola via RLS.
revoke select on public.escoles from anon;
grant select (id, nom, codi) on public.escoles to anon;
grant select, update on public.escoles to authenticated;

-- ── DOCENTS ── Anon: id/nom/rol (llista login, sense PIN). Auth: tot excepte pin.
-- NOTA: anon NO té escriptura (INSERT/UPDATE/DELETE). Auth usa PATCH amb return=minimal
-- per evitar RETURNING * que necessita SELECT de taula (no concedida per protegir pin).
revoke all on public.docents from anon;
grant select (id, nom, rol, grup_principal, escola_id, actiu, email) on public.docents to anon;
revoke all on public.docents from authenticated;
grant select (id, nom, rol, grup_principal, escola_id, actiu, email, horari,
              tp_franges, cobertures_mes, coordinador_cicle, horari_intensiu, creat_el)
      on public.docents to authenticated;
grant insert, update, delete on public.docents to authenticated;

-- ── DIRECTIUS ── Anon: id/nom/rol (llista login, sense PIN). Auth: tot excepte pin.
-- Igual que docents: anon sense escriptura, PATCH d'auth usa return=minimal.
revoke all on public.directius from anon;
grant select (id, nom, rol, grup_principal, escola_id, actiu, posicio) on public.directius to anon;
revoke all on public.directius from authenticated;
grant select (id, nom, rol, grup_principal, escola_id, actiu, posicio) on public.directius to authenticated;
grant insert, update, delete on public.directius to authenticated;

-- ── TAULES OPERACIONALS ── Només authenticated (JWT vàlid), filtrades per RLS
revoke all on public.absencies  from anon;
revoke all on public.cobertures from anon;
revoke all on public.deutes_tp  from anon;
revoke all on public.chat_logs  from anon;
revoke all on public.ia_logs    from anon;
revoke all on public.perfils    from anon;

grant select, insert, update, delete on public.absencies  to authenticated;
grant select, insert, update, delete on public.cobertures to authenticated;
grant select, insert, update, delete on public.deutes_tp  to authenticated;
grant select, insert                  on public.chat_logs  to authenticated;
grant select, insert                  on public.ia_logs    to authenticated;
grant select (id, nom, rol, escola_id, creat_el) on public.perfils to authenticated;

-- ── LOGIN_ATTEMPTS ── Només service_role (Edge Function login), bloquejat per RLS
revoke all on public.login_attempts from anon, authenticated;
grant all on public.login_attempts to service_role;
grant usage, select on sequence public.login_attempts_id_seq to service_role;

-- ── INCORPORACIONS ── Accés denegat a anon/authenticated (superadmin via service_role)
revoke all on public.incorporacions from anon, authenticated;

-- =============================================================================
-- PLANTILLA per a NOVES TAULES: sempre afegir escola_id + RLS
-- =============================================================================
-- alter table public.NOM_TAULA enable row level security;
-- create policy "escola_rw" on public.NOM_TAULA
--   for all to authenticated
--   using  (escola_id = public.jwt_escola_id())
--   with check (escola_id = public.jwt_escola_id());
-- grant select, insert, update, delete on public.NOM_TAULA to authenticated;
-- =============================================================================
