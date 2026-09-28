-- Shared trigger function: keeps updated_at current. Every table with an updated_at column
-- attaches it in its own custom migration (enforced by schema-conventions.int.test.ts).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger physios_set_updated_at
  before update on public.physios
  for each row execute function public.set_updated_at();

-- Creates the physio profile when someone signs up (magic link or Google). Onboarding
-- replaces the placeholder handle.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Physio'
  );
begin
  insert into public.physios (id, email, display_name, handle)
  values (
    new.id,
    coalesce(new.email, ''),
    left(name, 80),
    'physio-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8)
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS hides other physios' rows, so availability needs a definer function. It only reveals
-- a boolean, and handles are public in share links anyway. The unique index stays the guard.
create or replace function public.is_handle_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.physios
    where handle = candidate
      and id is distinct from (select auth.uid())
  );
$$;

revoke execute on function public.is_handle_available(text) from public, anon;
grant execute on function public.is_handle_available(text) to authenticated;
