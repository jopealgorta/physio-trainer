-- Routines extras (spec 05): things Drizzle can't express.

-- A routine's case must belong to the routine's customer; deleting the case clears only case_id
-- (a plain composite SET NULL would also null physio_id and customer_id).
alter table public.routines
  add constraint routines_case_fk
  foreign key (physio_id, customer_id, case_id)
  references public.cases (physio_id, customer_id, id)
  on delete set null (case_id);

create trigger routines_set_updated_at
  before update on public.routines
  for each row execute function public.set_updated_at();
create trigger routine_groups_set_updated_at
  before update on public.routine_groups
  for each row execute function public.set_updated_at();
create trigger routine_items_set_updated_at
  before update on public.routine_items
  for each row execute function public.set_updated_at();
create trigger routine_item_sets_set_updated_at
  before update on public.routine_item_sets
  for each row execute function public.set_updated_at();
