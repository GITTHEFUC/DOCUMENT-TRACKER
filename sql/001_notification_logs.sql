-- ============================================================
-- Email Notification Module — minimum schema (additive only)
-- Run this in your Supabase SQL editor.
-- ============================================================

create table if not exists public.notification_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           text,
  document_id       text,
  email             text not null,
  notification_type text not null check (notification_type in ('due_soon','due_today','overdue')),
  subject           text not null,
  message           text not null,
  delivery_status   text not null default 'pending' check (delivery_status in ('pending','sent','failed')),
  error             text,
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  -- dedupe key: one email per (document, type, day)
  dedupe_key        text generated always as (
    coalesce(document_id,'') || ':' || notification_type || ':' || to_char(now() at time zone 'UTC','YYYY-MM-DD')
  ) stored
);

create unique index if not exists notification_logs_dedupe_idx
  on public.notification_logs (dedupe_key);

create index if not exists notification_logs_user_idx
  on public.notification_logs (user_id, created_at desc);

grant select, insert, update on public.notification_logs to anon;
grant select, insert, update on public.notification_logs to authenticated;
grant all on public.notification_logs to service_role;

alter table public.notification_logs enable row level security;

create policy "notif_logs_read"   on public.notification_logs for select using (true);
create policy "notif_logs_insert" on public.notification_logs for insert with check (true);
create policy "notif_logs_update" on public.notification_logs for update using (true) with check (true);

alter publication supabase_realtime add table public.notification_logs;
