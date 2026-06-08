-- Inventory agent daily-briefing cron schedule.
--
-- Fires once each morning and POSTs to the `inventory-agent-daily` edge
-- function with the shared x-cron-secret header. The function fans out
-- to every org that has the slack_inventory bot connected.
--
-- Timezone:
--   pg_cron's cron.schedule supports timezone-aware crontab syntax via
--   `cron.schedule_in_database(jobname, schedule, command, ...)`, but
--   for backwards compatibility with the rest of this codebase we use
--   plain UTC cron expressions and pick the UTC offset manually.
--
--   Operator is on America/New_York (Eastern). 9:00 ET = 13:00 UTC
--   during EDT (March–November) and 14:00 UTC during EST. Because
--   pg_cron does not auto-shift for DST, we schedule at 13:00 UTC and
--   accept the 1-hour drift in winter (briefing lands at 8 AM instead
--   of 9 AM EST). When DST permanence lands or the operator moves, edit
--   the cron expression in place.
--
-- Idempotent: removes any prior schedule by this jobname before
-- recreating, so re-running the migration is safe.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  project_url text := current_setting('app.settings.project_url', true);
  cron_secret text := current_setting('app.settings.cron_secret', true);
begin
  if project_url is null or cron_secret is null then
    raise notice 'Skipping inventory-agent-daily cron schedule: app.settings.project_url or app.settings.cron_secret not set. See docs/inventory-agent-setup.md for manual registration.';
    return;
  end if;

  perform cron.unschedule('inventory-agent-daily')
    where exists (select 1 from cron.job where jobname = 'inventory-agent-daily');

  perform cron.schedule(
    'inventory-agent-daily',
    '0 13 * * *',  -- 13:00 UTC = 9:00 AM ET during EDT; see header note re winter.
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
      project_url || '/functions/v1/inventory-agent-daily',
      cron_secret
    )
  );
end$$;
