-- ═══════════════════════════════════════════════════════════════════════════════
-- Migració 004: Programació nocturna de l'agent vigilant (agent-watchdog)
-- Crida la Edge Function cada nit a les 5:00 UTC (≈ 6:00/7:00 hora local) via
-- pg_cron + pg_net. El token d'autenticació es llig del Vault (mai en pla text).
-- ═══════════════════════════════════════════════════════════════════════════════

select cron.schedule(
  'agent-watchdog-nightly',
  '0 5 * * *',
  $$
  select net.http_post(
    url     := 'https://mtrylcazzwolgzfzmbrn.supabase.co/functions/v1/agent-watchdog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-auth-token', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'agent_watchdog_token'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
