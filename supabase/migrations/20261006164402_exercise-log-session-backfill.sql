-- Spec 21: every exercise log belongs to the session of its routine, entry and day. Logs that
-- have none get a done session (an exercise log now marks the routine done).
insert into public.session_logs
  (physio_id, customer_id, share_link_id, routine_id, weekly_plan_entry_id, performed_on,
   completed, created_at, updated_at)
select physio_id, customer_id,
  (array_agg(share_link_id order by updated_at desc))[1],
  routine_id, weekly_plan_entry_id, performed_on, true, min(created_at), min(created_at)
from public.exercise_logs
group by physio_id, customer_id, routine_id, weekly_plan_entry_id, performed_on
on conflict on constraint session_logs_routine_entry_day_unique do nothing;

update public.exercise_logs e
  set session_log_id = s.id
  from public.session_logs s
  where s.routine_id = e.routine_id
    and s.weekly_plan_entry_id is not distinct from e.weekly_plan_entry_id
    and s.performed_on = e.performed_on
    and e.session_log_id is null;
