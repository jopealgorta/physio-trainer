-- Exercise logs extras: things Drizzle can't express.

-- A log's link must belong to the same physio; deleting the link clears only share_link_id (a
-- plain composite SET NULL would also null physio_id). A null share_link_id skips the FK.
alter table public.exercise_logs
  add constraint exercise_logs_share_link_fk
  foreign key (physio_id, share_link_id)
  references public.share_links (physio_id, id)
  on delete set null (share_link_id);

-- updated_at means "the patient last changed this log", so only the patient's own columns count.
create trigger exercise_logs_set_updated_at
  before update on public.exercise_logs
  for each row
  when (
    row(old.pain, old.rpe, old.weight_kg, old.comment)
      is distinct from
      row(new.pain, new.rpe, new.weight_kg, new.comment)
  )
  execute function public.set_updated_at();
