-- MEM Dashboard V5 - Supabase setup
-- 在 Supabase -> SQL Editor 中完整执行一次

create table if not exists public.task_state (
  task_id text primary key,
  owners text[] not null default array['待分配']::text[],
  status text not null default '未开始'
    check (status in ('未开始','进行中','待汇总','已完成')),
  updated_at timestamptz not null default now()
);

alter table public.task_state enable row level security;

-- 这个 Dashboard 按你的要求无需登录，因此允许匿名访客读写这张任务状态表。
-- publishable / anon key 本身可以放在浏览器端；service_role key 绝对不要放进网页。
revoke all on table public.task_state from anon, authenticated;
grant select, insert, update on table public.task_state to anon, authenticated;

drop policy if exists "mem dashboard public read" on public.task_state;
create policy "mem dashboard public read"
on public.task_state
for select
to anon, authenticated
using (true);

drop policy if exists "mem dashboard public insert" on public.task_state;
create policy "mem dashboard public insert"
on public.task_state
for insert
to anon, authenticated
with check (true);

drop policy if exists "mem dashboard public update" on public.task_state;
create policy "mem dashboard public update"
on public.task_state
for update
to anon, authenticated
using (true)
with check (true);

-- 让 Realtime 能订阅这张表。
-- 如果提示 task_state 已经在 publication 中，可忽略该条报错，后续继续即可。
alter table public.task_state replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'task_state'
  ) then
    alter publication supabase_realtime add table public.task_state;
  end if;
end $$;

-- Additional migration: 2026-09-21 shared important notice
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
