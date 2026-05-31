-- ═══════════════════════════════════════════════════════════════════════════════
-- Migració 002: Suport per autenticació server-side
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Taula de rate-limiting per login ─────────────────────────────────────────
create table if not exists public.login_attempts (
  id           bigserial primary key,
  ip           text not null,
  user_key     text not null,
  attempted_at timestamptz default now() not null,
  success      boolean default false not null
);

create index if not exists login_attempts_ip_user_time
  on public.login_attempts (ip, user_key, attempted_at);

-- Neteja automàtica d'intents antics (>1 hora)
create or replace function public.cleanup_login_attempts()
returns void language sql security definer as $$
  delete from public.login_attempts where attempted_at < now() - interval '1 hour';
$$;

-- Grants: el service key hi pot escriure; anon/authenticated no hi accedeix
revoke all on public.login_attempts from anon, authenticated;


-- ── Assegurar que directius té columna posicio ────────────────────────────────
alter table public.directius
  add column if not exists posicio int default 0;

-- ── Inserir directors des de MANAGEMENT_USERS si no existeixen ───────────────
-- Rivo Rubeo
insert into public.directius (nom, rol, grup_principal, pin, actiu, posicio, escola_id)
select u.nom, u.rol, u.grup_principal, u.pin, true, u.pos, e.id
from (values
  ('Cristina',      'director',   'Directora',           '1234', 1),
  ('Veronica',      'jefa',       'Cap d''Estudis',       '1234', 2),
  ('Patricia',      'secretaria', 'Secretaria',          '1234', 3),
  ('Administrador', 'dev',        'Accés tècnic total',  '1234', 4)
) as u(nom, rol, grup_principal, pin, pos)
cross join (select id from public.escoles where nom ilike '%rivo%' limit 1) as e
where not exists (
  select 1 from public.directius d
  where d.escola_id = e.id and d.nom = u.nom
);

-- Ca N'Oriol
insert into public.directius (nom, rol, grup_principal, pin, actiu, posicio, escola_id)
select u.nom, u.rol, u.grup_principal, u.pin, true, u.pos, e.id
from (values
  ('Yolanda',       'director',   'Directora',           '1234', 1),
  ('Mireia',        'jefa',       'Cap d''Estudis',       '1234', 2),
  ('Agnès',         'secretaria', 'Secretaria',          '1234', 3),
  ('Administrador', 'dev',        'Accés tècnic total',  '1234', 4)
) as u(nom, rol, grup_principal, pin, pos)
cross join (select id from public.escoles where nom ilike '%oriol%' limit 1) as e
where not exists (
  select 1 from public.directius d
  where d.escola_id = e.id and d.nom = u.nom
);

-- Demo
insert into public.directius (nom, rol, grup_principal, pin, actiu, posicio, escola_id)
select u.nom, u.rol, u.grup_principal, u.pin, true, u.pos, e.id
from (values
  ('Xavier Tort',   'director',   'Director',            '1234', 1),
  ('Laura Mas',     'jefa',       'Cap d''Estudis',       '1234', 2),
  ('Montse Bosch',  'secretaria', 'Secretaria',          '1234', 3),
  ('Administrador', 'dev',        'Accés tècnic total',  '1234', 4)
) as u(nom, rol, grup_principal, pin, pos)
cross join (select id from public.escoles where nom ilike '%demo%' limit 1) as e
where not exists (
  select 1 from public.directius d
  where d.escola_id = e.id and d.nom = u.nom
);
