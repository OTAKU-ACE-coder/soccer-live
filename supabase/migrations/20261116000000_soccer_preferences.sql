begin;

create table public.soccer_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  follows jsonb not null default '[]' check (jsonb_typeof(follows) = 'array' and jsonb_array_length(follows) <= 150 and octet_length(follows::text) <= 32000),
  saved jsonb not null default '[]' check (jsonb_typeof(saved) = 'array' and jsonb_array_length(saved) <= 100 and octet_length(saved::text) <= 1000000),
  revision bigint not null default 0 check (revision >= 0)
);

alter table public.soccer_preferences enable row level security;
revoke all on public.soccer_preferences from public, anon, authenticated;

create policy "Read own Soccer Live preferences"
  on public.soccer_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Create own Soccer Live preferences"
  on public.soccer_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Update own Soccer Live preferences"
  on public.soccer_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert on public.soccer_preferences to authenticated;
grant update (follows, saved, revision) on public.soccer_preferences to authenticated;

commit;
