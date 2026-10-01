-- Weekly plans extras (spec 06): things Drizzle can't express.

-- A plan's case must belong to the plan's customer; deleting the case clears only case_id
-- (a plain composite SET NULL would also null physio_id and customer_id). A plan without a
-- customer (template) must not have a case: the FK skips it when case_id is null, and the check
-- below rejects a case without a customer.
alter table public.weekly_plans
  add constraint weekly_plans_case_fk
  foreign key (physio_id, customer_id, case_id)
  references public.cases (physio_id, customer_id, id)
  on delete set null (case_id);

alter table public.weekly_plans
  add constraint weekly_plans_case_needs_customer
  check (case_id is null or customer_id is not null);

create trigger weekly_plans_set_updated_at
  before update on public.weekly_plans
  for each row execute function public.set_updated_at();
create trigger weekly_plan_entries_set_updated_at
  before update on public.weekly_plan_entries
  for each row execute function public.set_updated_at();
