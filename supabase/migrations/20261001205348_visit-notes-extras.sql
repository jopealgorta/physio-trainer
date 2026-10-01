-- Visit notes extras (spec 16): things Drizzle can't express.

-- A note's case must belong to the note's customer; deleting the case clears only case_id (a
-- plain composite SET NULL would also null physio_id and customer_id). A null case_id skips the FK.
alter table public.visit_notes
  add constraint visit_notes_case_fk
  foreign key (physio_id, customer_id, case_id)
  references public.cases (physio_id, customer_id, id)
  on delete set null (case_id);

-- Deleting a case makes the FK action null case_id on its notes. That is not an edit, so it must
-- not bump updated_at (the UI shows "edited" when updated_at is more than a minute after
-- created_at). Every other update, including clearing the case in the editor together with any
-- content change, bumps it as usual.
create trigger visit_notes_set_updated_at
  before update on public.visit_notes
  for each row
  when (not (
    old.case_id is not null
    and new.case_id is null
    and row(old.visited_on, old.subjective, old.objective, old.assessment, old.plan, old.pain)
      is not distinct from
      row(new.visited_on, new.subjective, new.objective, new.assessment, new.plan, new.pain)
  ))
  execute function public.set_updated_at();
