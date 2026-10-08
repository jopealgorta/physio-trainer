-- Exercises can have several categories: each exercise's single category becomes its first link.
insert into public.exercise_category_links (physio_id, exercise_id, category_id)
select physio_id, id, category_id
from public.exercises
where category_id is not null
on conflict do nothing;
