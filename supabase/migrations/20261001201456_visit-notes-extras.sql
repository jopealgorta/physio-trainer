-- Visit notes extras (spec 16): things Drizzle can't express.

-- A note's case must belong to the note's customer; deleting the case clears only case_id (a
-- plain composite SET NULL would also null physio_id and customer_id). A null case_id skips the FK.
alter table public.visit_notes
  add constraint visit_notes_case_fk
  foreign key (physio_id, customer_id, case_id)
  references public.cases (physio_id, customer_id, id)
  on delete set null (case_id);

create trigger visit_notes_set_updated_at
  before update on public.visit_notes
  for each row execute function public.set_updated_at();
