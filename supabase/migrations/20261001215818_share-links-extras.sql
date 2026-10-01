-- Share links extras (spec 10): things Drizzle can't express.

create trigger share_links_set_updated_at
  before update on public.share_links
  for each row execute function public.set_updated_at();
