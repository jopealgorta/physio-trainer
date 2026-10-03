drop trigger session_logs_set_updated_at on public.session_logs;
create trigger session_logs_set_updated_at
  before update on public.session_logs
  for each row
  when (
    row(old.completed, old.pain, old.rpe, old.comment, old.performed_on)
      is distinct from
      row(new.completed, new.pain, new.rpe, new.comment, new.performed_on)
  )
  execute function public.set_updated_at();
