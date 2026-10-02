-- Version history extras (spec 15): things Drizzle can't express.
create trigger weekly_plan_versions_set_updated_at
  before update on public.weekly_plan_versions
  for each row execute function public.set_updated_at();
