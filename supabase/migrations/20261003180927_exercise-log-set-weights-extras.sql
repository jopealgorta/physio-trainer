-- Spec 20: one weight per set. Existing single weights become a one-set log.
update public.exercise_logs
  set set_weights_kg = array[weight_kg]
  where weight_kg is not null and set_weights_kg is null;

-- updated_at means "the patient last changed this log": set weights count too.
drop trigger exercise_logs_set_updated_at on public.exercise_logs;
create trigger exercise_logs_set_updated_at
  before update on public.exercise_logs
  for each row
  when (
    row(old.pain, old.rpe, old.weight_kg, old.set_weights_kg, old.comment)
      is distinct from
      row(new.pain, new.rpe, new.weight_kg, new.set_weights_kg, new.comment)
  )
  execute function public.set_updated_at();
