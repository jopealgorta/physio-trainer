-- Exercise library extras (spec 03): things Drizzle can't express.

-- Accent-insensitive trigram search on exercise names.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent() is only STABLE; an IMMUTABLE wrapper with a fixed dictionary can back an index.
create or replace function public.f_unaccent(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value)
$$;

create index exercises_name_search_idx on public.exercises
  using gin (public.f_unaccent(lower(name)) extensions.gin_trgm_ops);

-- Category references stay within one physio. Deleting a category clears only category_id: a
-- plain composite SET NULL would also null physio_id.
alter table public.exercises
  add constraint exercises_category_fk
  foreign key (physio_id, category_id)
  references public.exercise_categories (physio_id, id)
  on delete set null (category_id);

-- Depth <= 2: a parent must be top level, and a category with children can't get a parent.
create or replace function public.check_exercise_category_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;
  if exists (
    select 1 from public.exercise_categories
    where id = new.parent_id and parent_id is not null
  ) or exists (
    select 1 from public.exercise_categories where parent_id = new.id
  ) then
    raise exception 'exercise categories are at most two levels deep'
      using errcode = 'check_violation', constraint = 'exercise_categories_max_depth';
  end if;
  return new;
end;
$$;

create trigger exercise_categories_max_depth
  before insert or update of parent_id on public.exercise_categories
  for each row execute function public.check_exercise_category_depth();

create trigger exercise_categories_set_updated_at
  before update on public.exercise_categories
  for each row execute function public.set_updated_at();

create trigger exercises_set_updated_at
  before update on public.exercises
  for each row execute function public.set_updated_at();

create trigger exercise_media_set_updated_at
  before update on public.exercise_media
  for each row execute function public.set_updated_at();
