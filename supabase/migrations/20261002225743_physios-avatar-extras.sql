-- Physio avatar extras: things Drizzle can't express.

-- Same as 20260928021325_physios-auth.sql, plus the provider's profile photo (Google sends
-- `avatar_url` and `picture`). Only an https URL within the column's check is copied, so a bad
-- value never blocks a sign-up; the post-sign-in step refreshes it later (src/server/auth).
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
  avatar text := (
    select photo.candidate
    from unnest(array[
      trim(new.raw_user_meta_data ->> 'avatar_url'),
      trim(new.raw_user_meta_data ->> 'picture')
    ]) with ordinality as photo(candidate, position)
    where photo.candidate ~ '^https://' and char_length(photo.candidate) <= 2048
    order by photo.position
    limit 1
  );
begin
  insert into public.physios (id, email, display_name, handle, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    left(name, 80),
    'physio-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8),
    avatar
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
