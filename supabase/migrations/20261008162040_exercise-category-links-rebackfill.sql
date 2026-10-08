-- Re-run the backfill before category_id is dropped: keeps categories the previous app version
-- saved while the several-categories deploy rolled out.
insert into public.exercise_category_links (physio_id, exercise_id, category_id)
select physio_id, id, category_id
from public.exercises
where category_id is not null
on conflict do nothing;
