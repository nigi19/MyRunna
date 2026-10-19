-- MyRunna sync tables. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run again: everything is created "if not exists" or replaced.
--
-- One table holds every synced record (plans and runs) as JSON. The app's
-- on-device database stays the main copy; this is the shared copy between
-- devices. Each row belongs to one user, and row-level security makes sure a
-- user can only ever read or write their own rows.

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('plan', 'activity')),
  id text not null,
  data jsonb,
  -- When the record last changed on a device. Last write wins.
  updated_at timestamptz not null,
  deleted boolean not null default false,
  -- When the server stored it. Devices pull everything newer than their cursor.
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, id)
);

create index if not exists records_pull_idx on public.records (user_id, server_updated_at);

-- Row-level security: only your own rows.
alter table public.records enable row level security;

drop policy if exists "records: read own" on public.records;
create policy "records: read own" on public.records
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "records: insert own" on public.records;
create policy "records: insert own" on public.records
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "records: update own" on public.records;
create policy "records: update own" on public.records
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "records: delete own" on public.records;
create policy "records: delete own" on public.records
  for delete to authenticated using (user_id = (select auth.uid()));

-- Explicit grants: signed-in users only, never anonymous visitors.
revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- The server stamps every write, so pull cursors never depend on device clocks.
create or replace function public.records_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.records_touch();

-- Batch upsert used by the app's push. A row only replaces the stored one if
-- it is at least as new (last write wins). Runs with the caller's rights, so
-- row-level security still applies.
create or replace function public.sync_upsert(rows jsonb)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with input as (
    select r.kind, r.id, r.data, r.updated_at, coalesce(r.deleted, false) as deleted
    from jsonb_to_recordset(rows) as r(kind text, id text, data jsonb, updated_at timestamptz, deleted boolean)
  ),
  written as (
    insert into public.records as t (user_id, kind, id, data, updated_at, deleted)
    select auth.uid(), kind, id, data, updated_at, deleted from input
    on conflict (user_id, kind, id) do update
      set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
      where excluded.updated_at >= t.updated_at
    returning 1
  )
  select count(*)::integer from written;
$$;

revoke execute on function public.sync_upsert(jsonb) from public, anon;
grant execute on function public.sync_upsert(jsonb) to authenticated;
