# 07 · Templates

- **Status:** Done
- **Feature:** A (routine templates)
- **Depends on:** 05, 06

## Summary

Physios reuse the same protocols constantly ("ACL post-op phase 1", "Low back general").
Templates are routines and weekly plans that belong to no customer. Assigning a template to a
customer makes an independent copy that can then be adjusted.

## Goals

- Create templates from scratch, or save an existing customer routine/plan as a template.
- Browse, search, duplicate, archive templates.
- Assign a template to a customer (from the template, or from the customer page) → deep copy.
- Weekly-plan templates contain template routines; assigning copies all of them.

## Non-goals

- Sharing templates between physios / marketplace.
- Keeping assigned copies in sync with later template edits (copies are independent).

## Data model

Changes to `routines` and `weekly_plans`:

| Column               | Type                                | Notes                                        |
| -------------------- | ----------------------------------- | -------------------------------------------- |
| `is_template`        | boolean not null default false      | check: `is_template = (customer_id is null)` |
| `source_template_id` | uuid null → same table (`set null`) | provenance on copies                         |

Template routines used inside a template plan have `is_standalone = false`. Templates have no
`case_id`, status is `active` or `archived` only (no draft), and never get share links.

No template tags in v1 (see "Open questions"): name search is the only way to narrow a list.

## Routes and UI

| Route                            | Kind                            | Purpose                                                                                        |
| -------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/routines?tab=templates`        | tab                             | Template routines grid/list with search.                                                       |
| `/plans?tab=templates`           | tab                             | Template plans.                                                                                |
| `/routines/[id]`, `/plans/[id]`  | pages                           | Same editors; a "Template" badge; customer selector hidden.                                    |
| "Assign to customer…"            | dialog                          | Pick customer (+ optional case), name defaults to template name, choose status (draft/active). |
| "Save as template"               | action on customer routine/plan | Copies without customer/case.                                                                  |
| Customer page "New routine/plan" | menu                            | "Blank" or "From template…" (searchable list).                                                 |

## Behaviour and rules

1. Copying is a deep copy in one transaction: routine + items; plan + entries + each
   distinct referenced routine (shared references stay shared inside the copy).
2. Copies record `source_template_id`; the UI shows "From template: X".
3. Templates are archived, never deleted (no hard delete in v1). Copies are unaffected.
4. Template editors skip customer-only features (sharing, logs, phases).

## Security and privacy

- Tenancy rules apply; copy action verifies template and target customer belong to the physio.

## i18n

Namespace `Templates`.

## Acceptance criteria

- [x] Create/edit/duplicate/archive routine and plan templates.
- [x] Save a customer routine/plan as a template.
- [x] Assign a template to a customer: independent deep copy; shared references preserved in plans.
- [x] Template list search works; templates never appear in customer lists or pickers of other customers' routines.
- [x] Integration tests for deep copy and the check constraint.

## Test plan

- Unit: copy-mapping helper (old id → new id for shared routine references).
- Integration: deep copy of a plan with a routine shared across days produces one copied
  routine referenced by all copied entries; RLS.
- E2E: save routine as template → assign to another customer → edit copy → template unchanged.

## Open questions

Answered 2026-10-01:

1. **Tags/folders in v1?** No: search is enough. No `template_tags` column.
2. **Delete templates?** No: archive only (archive/unarchive through the status select). The
   rule "delete when unused" is dropped.
3. **Notes when saving a customer routine/plan as a template** (routine/plan notes, item notes,
   entry labels may hold patient info): copy everything verbatim; the dialog warns the physio
   to review the template.

## Decisions made during implementation

- **Data model.** A template is a `routines`/`weekly_plans` row with `customer_id is null`
  (`customer_id` became nullable; `is_template = (customer_id is null)` is a check, as are "no draft
  status" and, for routines, "a case needs a customer"). `source_template_id` is a composite
  `(physio_id, source_template_id)` FK with `ON DELETE SET NULL (source_template_id)`, added in a
  custom migration because drizzle can't express the column-list form; deleting a template (only
  possible directly, the app archives) clears the provenance and nothing else.
- **One copy path.** `copyRoutine` / `copyPlan` (`src/server/routines|plans/mutations.ts`) do every
  deep copy: assign, save as template, duplicate template and "make a separate copy" (now a thin
  `duplicateRoutine`). The pure id-map helpers are in `src/lib/templates.ts`. A plan's distinct
  routines are copied once each, so a routine on all 7 days stays one routine in the copy. Both
  lock their source `for share` (saves lock `for update`), so a copy never sees half-replaced items.
- **Assign rules**, in order: template exists and is a template, template not archived, customer
  is the physio's and not archived, case belongs to the customer, then an `active` copy needs at
  least one exercise in every routine (and one entry for a plan). Draft copies of an empty template
  are allowed. Copies record the template (plan and each routine copy link to their own source).
- **Save as template** copies notes, labels and item notes verbatim (spec answer 3); the dialog
  warns the physio to review them. The copy is always `active`, plan routines included.
- **Templates in the existing machinery.** `listRoutines`/`listPlans` split by `tab` (customers:
  `is_template = false`; templates: standalone templates only, a template plan's own routines are
  edited through the plan). `listAttachableRoutines(…, null)` serves a template plan only template
  routines, and `addEntry` compares `routine.customerId === plan.customerId`, so templates and
  customer routines never mix. `saveRoutine`/`updatePlan` refuse `draft` on a template
  (`templateNoDraft`); an empty template may be active ("blank to fill in", checked on assign).
  `needsCustomer` was removed: a plan without a customer is now simply a template.
- **Template routines created through `createTemplate` are not subject to "active needs items"**;
  template routines created from a template plan's board are active, non-standalone.
- **Archiving** goes through the status select (no delete). Archiving a template routine used by
  an active template plan is blocked like for customer routines.
- **UI deviations from the plan.** "From template…" is a button next to "New routine/plan" (not a
  menu with "Blank"); it opens a debounced search and then the assign form with the customer fixed.
  Shared error copy lives in `Templates.errors` (one place for the list, picker and dialogs).
  `PlanBoard`'s `canAdd` flag was dropped (always true). The picker shows the newest templates as
  soon as it opens. "Assign to customer…" is hidden when the physio has no active customers.
- **Typecheck depth.** Adding messages tipped `category-manager.tsx` over TypeScript's instantiation
  depth limit (its `t` prop was typed without a namespace, so every call was checked against all
  message keys); the prop is now typed `useTranslations<"Library.categories">`.
- **Tests.** Unit and component tests for every piece; integration tests for the constraints
  (`src/db/templates.int.test.ts`), the copy/assign/save-as mutations
  (`src/server/templates/templates.int.test.ts`), the template-aware queries and mutations
  (`aware.int.test.ts`) and the picker queries (`queries.int.test.ts`); e2e in `e2e/templates.spec.ts`.
