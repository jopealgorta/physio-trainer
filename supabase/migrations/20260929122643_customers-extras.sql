-- Customers and cases extras (spec 04): things Drizzle can't express.

-- Accent-insensitive partial name search (same recipe as exercises_name_search_idx).
create index customers_name_search_idx on public.customers
  using gin (public.f_unaccent(lower(first_name || ' ' || coalesce(last_name, ''))) extensions.gin_trgm_ops);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger cases_set_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();
