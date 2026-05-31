-- ═══════════════════════════════════════════════════════════════════════════════
-- Migració 001: Habilitar RLS a totes les taules
-- Polítiques basades en JWT claims (user_metadata.escola_id)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Funcions helper ──────────────────────────────────────────────────────────

create or replace function public.jwt_escola_id()
returns uuid language sql stable security definer as $$
  select (auth.jwt() -> 'user_metadata' ->> 'escola_id')::uuid
$$;

-- ── ESCOLES ───────────────────────────────────────────────────────────────────
-- Anon: pot llegir id, nom, codi (per la pantalla de login)
-- Authenticated: pot llegir i modificar la seua pròpia escola

alter table public.escoles enable row level security;

revoke all on public.escoles from anon;
grant select (id, nom, codi) on public.escoles to anon;
grant select, update on public.escoles to authenticated;

create policy "escoles_anon_list" on public.escoles
  for select to anon using (true);

create policy "escoles_own" on public.escoles
  for all to authenticated
  using  (id = public.jwt_escola_id())
  with check (id = public.jwt_escola_id());


-- ── DOCENTS ───────────────────────────────────────────────────────────────────
-- Anon: pot llegir nom/id/rol (per llista de login) — sense PIN ni horari
-- Authenticated: CRUD complet a la seua escola, però sense columna pin

alter table public.docents enable row level security;

revoke all on public.docents from anon;
revoke all on public.docents from authenticated;

grant select (id, nom, rol, grup_principal, escola_id, actiu) on public.docents to anon;
grant select (id, nom, rol, grup_principal, escola_id, actiu, email, horari,
              tp_franges, cobertures_mes, coordinador_cicle, horari_intensiu)
      on public.docents to authenticated;
grant insert, update, delete on public.docents to authenticated;

create policy "docents_anon_list" on public.docents
  for select to anon using (true);

create policy "docents_escola_rw" on public.docents
  for all to authenticated
  using  (escola_id = public.jwt_escola_id())
  with check (escola_id = public.jwt_escola_id());


-- ── DIRECTIUS ─────────────────────────────────────────────────────────────────
-- Anon: pot llegir nom/rol/posicio (per llista de login) — sense PIN
-- Authenticated: CRUD a la seua escola

alter table public.directius enable row level security;

revoke all on public.directius from anon;
revoke all on public.directius from authenticated;

grant select (id, nom, rol, grup_principal, escola_id, actiu, posicio) on public.directius to anon;
grant select (id, nom, rol, grup_principal, escola_id, actiu, posicio) on public.directius to authenticated;
grant insert, update, delete on public.directius to authenticated;

create policy "directius_anon_list" on public.directius
  for select to anon using (true);

create policy "directius_escola_rw" on public.directius
  for all to authenticated
  using  (escola_id = public.jwt_escola_id())
  with check (escola_id = public.jwt_escola_id());


-- ── ABSENCIES ─────────────────────────────────────────────────────────────────
alter table public.absencies enable row level security;

create policy "absencies_escola_rw" on public.absencies
  for all to authenticated
  using  (escola_id = public.jwt_escola_id())
  with check (escola_id = public.jwt_escola_id());


-- ── COBERTURES ────────────────────────────────────────────────────────────────
alter table public.cobertures enable row level security;

create policy "cobertures_escola_rw" on public.cobertures
  for all to authenticated
  using  (escola_id = public.jwt_escola_id())
  with check (escola_id = public.jwt_escola_id());


-- ── DEUTES_TP ─────────────────────────────────────────────────────────────────
alter table public.deutes_tp enable row level security;

create policy "deutes_escola_rw" on public.deutes_tp
  for all to authenticated
  using  (escola_id = public.jwt_escola_id())
  with check (escola_id = public.jwt_escola_id());
