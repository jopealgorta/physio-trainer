-- Routine sections extras (spec 22): things Drizzle can't express.

create trigger routine_sections_set_updated_at
  before update on public.routine_sections
  for each row execute function public.set_updated_at();

-- backfill: every existing routine (templates included) gets one section at position 0, named by
-- its physio's locale, and its items point at it. Only routines without sections and items
-- without a section are touched, so it is safe to re-run.
insert into public.routine_sections (physio_id, routine_id, name, position)
select r.physio_id, r.id, case when p.locale = 'es' then 'Principal' else 'Main' end, 0
from public.routines r
join public.physios p on p.id = r.physio_id
where not exists (select 1 from public.routine_sections s where s.routine_id = r.id);

update public.routine_items i set section_id = s.id
from public.routine_sections s
where s.physio_id = i.physio_id and s.routine_id = i.routine_id and s.position = 0
  and i.section_id is null;
