-- Sell-through stockout alert cron schedule.
--
-- Daily at 14:00 UTC (= 10am ET / 7am PT in winter, 9am ET / 6am PT in
-- DST). Calls the `sell-through-alert` edge function with the same
-- x-cron-secret header pattern as the creative crons.
--
-- This migration registers the schedule conditionally — it skips
-- silently if pg_cron isn't loaded (e.g. local Supabase emulator) or
-- the user hasn't yet set their project URL + cron secret in the
-- runbook. The runbook (docs/sell-through-alert-runbook.md) walks
-- through the manual paste with values filled in for environments
-- that need a re-bootstrap.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  project_url text := current_setting('app.settings.project_url', true);
  cron_secret text := current_setting('app.settings.cron_secret', true);
begin
  if project_url is null or cron_secret is null then
    raise notice 'Skipping sell-through-alert cron schedule: app.settings.project_url or app.settings.cron_secret not set. Run the snippet in docs/sell-through-alert-runbook.md to register manually.';
    return;
  end if;

  -- Idempotent: unschedule any prior job by this name before recreating.
  perform cron.unschedule('sell-through-alert-daily')
    where exists (select 1 from cron.job where jobname = 'sell-through-alert-daily');

  perform cron.schedule(
    'sell-through-alert-daily',
    '0 14 * * *',
    format(
      $cmd$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb
      );
      $cmd$,
      project_url || '/functions/v1/sell-through-alert',
      cron_secret
    )
  );
end$$;
