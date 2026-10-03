create trigger weekly_plan_days_set_updated_at
  before update on public.weekly_plan_days
  for each row execute function public.set_updated_at();
