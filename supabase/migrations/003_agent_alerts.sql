-- ═══════════════════════════════════════════════════════════════════════════════
-- Migració 003: Taula agent_alerts — alertes generades per l'agent vigilant
-- Detecta (C) errors recurrents de la IA i (D) inconsistències de qualitat de
-- dades als horaris. Només visible des del SuperAdmin.
-- ═══════════════════════════════════════════════════════════════════════════════

create table public.agent_alerts (
  id         uuid primary key default gen_random_uuid(),
  escola_id  uuid not null references public.escoles(id) on delete cascade,
  tipus      text not null,                    -- 'ia_errors_propostes' | 'ia_errors_xat' | 'horari_buit' | 'tutor_sense_grup'
  gravetat   text not null default 'info',     -- 'info' | 'warning' | 'critical'
  titol      text not null,
  missatge   text not null,
  metadata   jsonb,
  resolt     boolean not null default false,
  creat_el   timestamptz not null default now()
);

create index agent_alerts_escola_idx on public.agent_alerts(escola_id, creat_el desc);

alter table public.agent_alerts enable row level security;

-- Només superadmin pot llegir/actualitzar (marcar com a resolt). L'agent escriu
-- amb la service role key des de l'Edge Function (bypassa RLS).
revoke all on public.agent_alerts from anon, authenticated;
grant select, update (resolt) on public.agent_alerts to authenticated;
grant all on public.agent_alerts to service_role;

create policy "superadmin_agent_alerts" on public.agent_alerts
  for all to authenticated
  using       ((auth.jwt() -> 'user_metadata' ->> 'rol') = 'superadmin')
  with check  ((auth.jwt() -> 'user_metadata' ->> 'rol') = 'superadmin');
