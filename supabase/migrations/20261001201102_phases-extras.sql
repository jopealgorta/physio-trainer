-- Phases extras (spec 08): things Drizzle can't express.

-- A phase's predecessor is a row of the same table and the same physio (composite FK, so a row
-- can never point at another physio's row). Deleting the predecessor clears only previous_id (a
-- plain composite SET NULL would also null physio_id). Same-customer is checked by the copy
-- mutation.
alter table public.routines
  add constraint routines_previous_fk
  foreign key (physio_id, previous_id)
  references public.routines (physio_id, id)
  on delete set null (previous_id);

alter table public.weekly_plans
  add constraint weekly_plans_previous_fk
  foreign key (physio_id, previous_id)
  references public.weekly_plans (physio_id, id)
  on delete set null (previous_id);
