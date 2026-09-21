-- Run this additional migration in Supabase SQL Editor. Existing task_state is unchanged.
begin;
create table if not exists public.dashboard_meta (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.dashboard_meta enable row level security;
revoke all on table public.dashboard_meta from anon, authenticated;
grant select, insert, update on table public.dashboard_meta to anon, authenticated;

drop policy if exists "mem meta public read" on public.dashboard_meta;
create policy "mem meta public read" on public.dashboard_meta
for select to anon, authenticated using (true);
drop policy if exists "mem meta public insert" on public.dashboard_meta;
create policy "mem meta public insert" on public.dashboard_meta
for insert to anon, authenticated with check (true);
drop policy if exists "mem meta public update" on public.dashboard_meta;
create policy "mem meta public update" on public.dashboard_meta
for update to anon, authenticated using (true) with check (true);

insert into public.dashboard_meta (key,value)
values ('important_notice','') on conflict (key) do nothing;
alter table public.dashboard_meta replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public' and tablename='dashboard_meta'
  ) then
    alter publication supabase_realtime add table public.dashboard_meta;
  end if;
end $$;
commit;
