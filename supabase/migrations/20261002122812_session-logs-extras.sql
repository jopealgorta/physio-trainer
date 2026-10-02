-- Session logs extras (spec 13): things Drizzle can't express.

-- A log's link must belong to the same physio; deleting the link clears only share_link_id (a
-- plain composite SET NULL would also null physio_id). A null share_link_id skips the FK.
alter table public.share_links
  add constraint share_links_physio_id_id_unique unique (physio_id, id);

alter table public.session_logs
  add constraint session_logs_share_link_fk
  foreign key (physio_id, share_link_id)
  references public.share_links (physio_id, id)
  on delete set null (share_link_id);

-- Deleting a link makes the FK action null share_link_id on its logs. That is not an edit, so it
-- must not bump updated_at (the dashboard orders "recently active" by it).
create trigger session_logs_set_updated_at
  before update on public.session_logs
  for each row
  when (not (
    old.share_link_id is not null
    and new.share_link_id is null
    and row(old.completed, old.pain, old.comment, old.performed_on, old.seen_by_physio_at)
      is not distinct from
      row(new.completed, new.pain, new.comment, new.performed_on, new.seen_by_physio_at)
  ))
  execute function public.set_updated_at();
