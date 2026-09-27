# 05 · Routines

- **Status:** Not started
- **Feature:** Core
- **Depends on:** 03, 04

## Summary

A **routine** is an ordered list of exercises from the library, each with its own
prescription (sets, reps, hold, rest, load, side, notes). Routines belong to a customer (and
optionally one of their cases). A routine is either a **single routine**, shared on its own,
or a component of a weekly plan (spec 06). This spec builds the routine editor both use.

## Goals

- Create a routine for a customer; edit name, notes, frequency, linked case, status.
- Add exercises from the library via a fast picker (search + filters from spec 03).
- Per item: override prescription; reorder by drag and drop (and keyboard); duplicate; remove.
- Supersets/circuits are **not** in v1 (see open questions).
- Status: `draft` → `active` → `archived`.

## Non-goals

- Templates (spec 07), phases/dates (spec 08), sharing (spec 10), versions (spec 15).

## User stories

- As a physio, I create "Knee rehab A" for Ana, add 6 exercises, adjust reps, and set it to
  3× per week.
- As a physio, I reorder exercises by dragging and add a note "stop if sharp pain".

## Data model

`routines`:

| Column                        | Type                                                        | Notes                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`, `physio_id`, timestamps |                                                             |                                                                                                                                |
| `customer_id`                 | uuid null → customers (cascade)                             | null only for templates (spec 07 adds `is_template` + check constraint)                                                        |
| `case_id`                     | uuid null → cases (`set null`)                              | must belong to the same customer (validate in action)                                                                          |
| `name`                        | text not null                                               | 1–80                                                                                                                           |
| `notes`                       | text null                                                   | general instructions shown at the top for the patient                                                                          |
| `is_standalone`               | boolean not null default true                               | true = single routine, shown on its own on the patient page. Routines created inside a weekly plan default to false (spec 06). |
| `sessions_per_week`           | smallint null                                               | 1–14; single routines only (plans define days)                                                                                 |
| `sessions_per_day`            | smallint null                                               | 1–5                                                                                                                            |
| `status`                      | enum `draft \| active \| archived` not null default `draft` |                                                                                                                                |
| `version`                     | integer not null default 1                                  | bumped on each save (spec 15 stores snapshots)                                                                                 |

`routine_items`:

| Column                                                | Type                                   | Notes                                                 |
| ----------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `id`, `physio_id`, `routine_id` (cascade), timestamps |                                        |                                                       |
| `exercise_id`                                         | uuid not null → exercises (`restrict`) | archived exercises still resolve                      |
| `position`                                            | integer not null                       |                                                       |
| prescription fields                                   | see architecture                       | copied from exercise defaults on add, then overridden |

Index `(routine_id, position)`.

## Routes and UI

| Route                                  | Kind | Purpose                                                                                                                              |
| -------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/customers/[customerId]?tab=routines` | tab  | Routines list for this customer (single routines first, then plan components greyed with "in plan X"), status badges, "New routine". |
| `/routines`                            | page | All routines across customers (filter by status, customer, search). Spec 07 adds a "Templates" tab.                                  |
| `/routines/[routineId]`                | page | **Editor**.                                                                                                                          |

Editor layout (desktop): header (name inline-editable, customer, status select, Save), left
column the ordered item list, right side panel the exercise picker (search, category, body
area filters, recent). Mobile: list full width, picker as a bottom sheet.

Each item row: cover thumbnail, exercise name, compact prescription summary ("3 × 12 · hold
5 s · rest 60 s · left"), expand to edit fields, drag handle, overflow menu (duplicate,
remove, open exercise).

Saving: explicit "Save" button with unsaved-changes guard (warn on navigation). One server
action saves the whole routine (header + items) in a transaction and bumps `version`.

## Behaviour and rules

1. A routine can hold 1–50 items; the same exercise may appear more than once.
2. Activating requires at least one item.
3. `case_id` must belong to the routine's customer.
4. Archiving a routine that is attached to an active weekly plan is blocked with a message
   listing the plans.
5. Prescription summary formatting lives in `src/lib/prescription.ts` (pure, unit-tested,
   localised units) and is reused by the patient page, PDF and Excel export.
6. Concurrency: the save action sends the `version` it loaded; if the DB version is newer,
   reject with "This routine changed in another tab. Reload?" (optimistic locking).

## Security and privacy

- Tenancy rules apply. The save action verifies every `exercise_id` belongs to the physio.

## i18n

Namespace `Routines`, `Prescription` (units and summary patterns, with plural rules).

## Acceptance criteria

- [ ] Create, edit, reorder (mouse, touch, keyboard), duplicate/remove items, save.
- [ ] Picker search/filter reuses library queries; adding copies exercise defaults.
- [ ] Status transitions and rules 2–4 enforced server-side.
- [ ] Optimistic locking works across two tabs.
- [ ] `formatPrescription` covers all field combinations (unit tests).
- [ ] RLS tests for both tables.

## Test plan

- Unit: `formatPrescription`, reorder helpers, zod schemas.
- Integration: save transaction (items replaced atomically), version conflict, RLS, cross-tenant
  exercise id rejected.
- E2E: build a routine with three exercises, reorder, save, reload shows the same order.

## Open questions

1. Do you need supersets/circuits (grouping 2–3 exercises done back to back) in v1?
2. Per-item "sets × reps" is enough, or do you prescribe different reps per set (e.g. 12/10/8)?

## Decisions made during implementation

(Fill in while building.)
