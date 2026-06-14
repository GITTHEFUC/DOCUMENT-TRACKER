-- ============================================================
-- Hourly cron: invokes the notification-scheduler edge function.
-- Run in Supabase SQL editor. Replace <PROJECT_REF> and <SERVICE_ROLE_KEY>.
-- ============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove old job if re-running
select cron.unschedule('doctrack-notif-hourly')
  where exists (select 1 from cron.job where jobname='doctrack-notif-hourly');

select cron.schedule(
  'doctrack-notif-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/notification-scheduler',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
