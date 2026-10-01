-- Templates extras (spec 07): the provenance FKs drizzle can't express (column-list SET NULL).
-- A copy points at the template it came from; removing the template clears only that column.
alter table public.routines
  add constraint routines_source_template_fk
  foreign key (physio_id, source_template_id)
  references public.routines (physio_id, id)
  on delete set null (source_template_id);

alter table public.weekly_plans
  add constraint weekly_plans_source_template_fk
  foreign key (physio_id, source_template_id)
  references public.weekly_plans (physio_id, id)
  on delete set null (source_template_id);
