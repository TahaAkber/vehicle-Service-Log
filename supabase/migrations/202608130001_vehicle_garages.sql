create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.garages (
  user_id uuid primary key references auth.users(id) on delete cascade,
  garage jsonb not null,
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.garages enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "garages_select_own" on public.garages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "garages_insert_own" on public.garages
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "garages_update_own" on public.garages
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "garages_delete_own" on public.garages
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.sync_garage(
  p_garage jsonb,
  p_client_updated_at timestamptz
)
returns public.garages
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.garages;
begin
  insert into public.garages (user_id, garage, client_updated_at)
  values ((select auth.uid()), p_garage, p_client_updated_at)
  on conflict (user_id) do update
    set garage = excluded.garage,
        client_updated_at = excluded.client_updated_at,
        updated_at = now()
    where public.garages.client_updated_at <= excluded.client_updated_at;

  select * into result
  from public.garages
  where user_id = (select auth.uid());
  return result;
end;
$$;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.garages to authenticated;
grant execute on function public.sync_garage(jsonb, timestamptz) to authenticated;
