# 07 · Templates

- **Status:** Not started
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

Optional: `template_tags text[]` to group templates (see open questions).

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
3. Deleting a template is allowed when unused; otherwise archive. Copies are unaffected either
   way.
4. Template editors skip customer-only features (sharing, logs, phases).

## Security and privacy

- Tenancy rules apply; copy action verifies template and target customer belong to the physio.

## i18n

Namespace `Templates`.

## Acceptance criteria

- [ ] Create/edit/duplicate/archive routine and plan templates.
- [ ] Save a customer routine/plan as a template.
- [ ] Assign a template to a customer: independent deep copy; shared references preserved in plans.
- [ ] Template list search works; templates never appear in customer lists or pickers of other customers' routines.
- [ ] Integration tests for deep copy and the check constraint.

## Test plan

- Unit: copy-mapping helper (old id → new id for shared routine references).
- Integration: deep copy of a plan with a routine shared across days produces one copied
  routine referenced by all copied entries; RLS.
- E2E: save routine as template → assign to another customer → edit copy → template unchanged.

## Open questions

1. Do you want template folders/tags (e.g. "Knee", "Post-op") in v1, or is search enough?

## Decisions made during implementation

(Fill in while building.)
