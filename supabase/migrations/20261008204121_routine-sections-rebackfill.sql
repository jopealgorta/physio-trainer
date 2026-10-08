-- Re-run the routine-sections backfill before section_id becomes NOT NULL: covers routines and
-- items the previous app version saved without sections while spec 22 rolled out. Same
-- statements as the routine-sections-extras backfill; only rows without a section are touched.
insert into public.routine_sections (physio_id, routine_id, name, position)
select r.physio_id, r.id, case when p.locale = 'es' then 'Principal' else 'Main' end, 0
from public.routines r
join public.physios p on p.id = r.physio_id
where not exists (select 1 from public.routine_sections s where s.routine_id = r.id);

update public.routine_items i set section_id = s.id
from public.routine_sections s
where s.physio_id = i.physio_id and s.routine_id = i.routine_id and s.position = 0
  and i.section_id is null;
