# 05 · Routines

- **Status:** In progress
- **Feature:** Core
- **Depends on:** 03, 04

## Summary

A **routine** is an ordered list of exercises from the library, each with its own
prescription: per-set reps/duration/load plus hold, rest, side and notes per exercise.
Consecutive exercises can be grouped into a **superset** (2–3 exercises done back to back).
Routines belong to a customer (and optionally one of their cases). A routine is either a
**single routine**, shared on its own, or a component of a weekly plan (spec 06). This spec
builds the routine editor both use.

Exercises no longer carry default prescription values: the prescription lives only on routine
items (see "Removing exercise defaults").

## Goals

- Create a routine for a customer; edit name, notes, frequency, linked case, status.
- Add exercises from the library via a fast picker (search + filters from spec 03).
- Per item: a list of sets (reps or rep range, duration, load per set), hold, rest, side,
  notes; reorder by drag and drop (and keyboard); duplicate; remove.
- Group 2–3 consecutive exercises into a superset that alternates set by set.
- Status: `draft` → `active` → `archived`.

## Non-goals

- Templates (spec 07), phases/dates (spec 08), sharing (spec 10), versions (spec 15).
- Circuits with group-level rounds (only set-by-set alternation).
- Duplicating a whole routine (templates, spec 07, cover reuse).

## User stories

- As a physio, I create "Knee rehab A" for Ana, add 6 exercises, prescribe 12/10/8 reps, and
  set it to 3× per week.
- As a physio, I reorder exercises by dragging and add a note "stop if sharp pain".
- As a physio, I pair a squat with a calf raise as a superset with one rest per round.

## Data model

`routines`:

| Column                        | Type                                                        | Notes                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`, `physio_id`, timestamps |                                                             |                                                                                                                                |
| `customer_id`                 | uuid **not null** → customers (cascade)                     | spec 07 relaxes this to nullable for templates (adds `is_template` + check constraint)                                         |
| `case_id`                     | uuid null → cases (`set null`)                              | composite FK `(physio_id, customer_id, case_id)` so the case must belong to the same customer                                  |
| `name`                        | text not null                                               | 1–80                                                                                                                           |
| `notes`                       | text null                                                   | general instructions shown at the top for the patient (≤ 2 000)                                                                |
| `is_standalone`               | boolean not null default true                               | true = single routine, shown on its own on the patient page. Routines created inside a weekly plan default to false (spec 06). |
| `sessions_per_week`           | smallint null                                               | 1–14; single routines only (plans define days)                                                                                 |
| `sessions_per_day`            | smallint null                                               | 1–5                                                                                                                            |
| `status`                      | enum `draft \| active \| archived` not null default `draft` |                                                                                                                                |
| `version`                     | integer not null default 1                                  | bumped on each save (spec 15 stores snapshots)                                                                                 |

`routine_groups` (one superset):

| Column                                                | Type          | Notes                                                    |
| ----------------------------------------------------- | ------------- | -------------------------------------------------------- |
| `id`, `physio_id`, `routine_id` (cascade), timestamps |               |                                                          |
| `rest_seconds`                                        | smallint null | rest after each round (one set of every member), 1–3 600 |

`routine_items`:

| Column                                                | Type                                   | Notes                                                            |
| ----------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| `id`, `physio_id`, `routine_id` (cascade), timestamps |                                        |                                                                  |
| `exercise_id`                                         | uuid not null → exercises (`restrict`) | archived exercises still resolve                                 |
| `position`                                            | integer not null                       | flat order across the routine; group members are consecutive     |
| `group_id`                                            | uuid null → routine_groups             | null = standalone item                                           |
| `hold_seconds`, `rest_seconds`, `side`, `notes`       | as the shared prescription fields      | per exercise; `rest_seconds` must be null when `group_id` is set |

`routine_item_sets` (one row per set):

| Column                                                     | Type                       | Notes                                                     |
| ---------------------------------------------------------- | -------------------------- | --------------------------------------------------------- |
| `id`, `physio_id`, `routine_item_id` (cascade), timestamps |                            |                                                           |
| `position`                                                 | integer not null           | 0-based, unique per item                                  |
| `reps`, `reps_max`, `duration_seconds`, `load`             | as the shared prescription | reps range needs `reps`; all nullable ("show what's set") |

Indexes `(routine_id, position)`, `(routine_item_id, position)`. All four tables carry
`physio_id`, RLS, the `set_updated_at` trigger and composite FKs.

Rules the save action enforces (the editor keeps them true, the action re-checks): 1–50 items;
0–20 sets per item; a group has 2–3 consecutive members, every member has at least one set and
all members have the same number of sets; grouped items carry no `rest_seconds`.

## Removing exercise defaults

`exercises` stops using its prescription columns: the exercise form, queries, zod schema and
tests lose them and nothing is copied when adding an exercise to a routine (a new item starts
with one empty set; "Add set" copies the previous set). The database columns stay for now
(expand-then-contract, see architecture) and a follow-up chore PR drops them. `deleteExercise`
now returns `inUse` when a routine item references it (FK `restrict`) and the UI offers
archive instead.

## Routes and UI

| Route                                  | Kind | Purpose                                                                                                            |
| -------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------ |
| `/customers/[customerId]?tab=routines` | tab  | Routines list for this customer (status badges, "New routine"). Plan components ("in plan X") arrive with spec 06. |
| `/routines`                            | page | All routines across customers (filter by status, customer, search). Spec 07 adds a "Templates" tab.                |
| `/routines/[routineId]`                | page | **Editor**.                                                                                                        |

"New routine" opens a small dialog (name; case select when the customer has cases), creates a
`draft` and opens the editor, so the editor always works on an existing routine.

Editor layout (desktop): header (name inline-editable, customer, status select, Save), left
column the ordered blocks (a block is one item or one superset), right side panel the exercise
picker (search, category, body area filters, recent). Mobile: list full width, picker as a
bottom sheet.

Each item row: cover thumbnail, exercise name, compact prescription summary ("3 × 12 · hold
5 s · rest 60 s · left", "12 · 10 · 8", "12 × 5 kg · 10 × 7 kg"), expand to edit a sets table
(reps or range, duration, load, remove set, "Add set") plus hold/rest/side/notes, drag handle,
overflow menu (duplicate, remove, group with next / ungroup, open exercise).

Reordering: blocks reorder as a unit; items reorder inside a superset; flat dragging can never
split a group. Changing a member's set count keeps the other members in sync.

Saving: explicit "Save" button with unsaved-changes guard (warn on navigation). One server
action saves the whole routine (header + groups + items + sets) in a transaction and bumps
`version`.

## Behaviour and rules

1. A routine can hold 1–50 items; the same exercise may appear more than once.
2. Activating requires at least one item.
3. `case_id` must belong to the routine's customer (enforced by the composite FK and the action).
4. Archiving a routine that is attached to an active weekly plan is blocked with a message
   listing the plans. Until spec 06 the lookup (`listPlansUsingRoutine`) returns nothing.
5. Prescription summary formatting lives in `src/lib/prescription.ts` (`formatPrescription`,
   pure, unit-tested, localised units) and is reused by the patient page, PDF and Excel export.
   Equal sets collapse ("3 × 12"), differing sets list ("12 · 10 · 8").
6. Concurrency: the save action sends the `version` it loaded; if the DB version is newer,
   reject with "This routine changed in another tab. Reload?" (optimistic locking).
7. Group members alternate set by set (A1 B1 rest A2 B2 rest …); the group's rest applies after
   each round, and the item-level rest is not used inside a group.

## Security and privacy

- Tenancy rules apply. The save action verifies every `exercise_id` belongs to the physio.

## i18n

Namespace `Routines`, `Prescription` (units and summary patterns, with plural rules).

## Acceptance criteria

- [ ] Create, edit, reorder (mouse, touch, keyboard), duplicate/remove items, save.
- [ ] Per-set reps/duration/load editing; supersets (group, ungroup, reorder, set-count sync).
- [ ] Picker search/filter reuses library queries; adding creates one empty set.
- [ ] Exercise defaults removed from the exercise UI and code; delete returns `inUse`.
- [ ] Status transitions and rules 2–4 enforced server-side.
- [ ] Optimistic locking works across two tabs.
- [ ] `formatPrescription` covers all field combinations (unit tests).
- [ ] RLS tests for all four tables.

## Test plan

- Unit: `formatPrescription`, editor-state helpers (blocks ↔ flat, reorder, group rules), zod
  schemas.
- Integration: save transaction (children replaced atomically), version conflict, RLS,
  cross-tenant exercise id rejected, case/customer mismatch rejected, exercise `inUse`.
- E2E: build a routine with three exercises and a superset, edit per-set reps, reorder, save,
  reload shows the same order; second tab gets the version conflict.

## Open questions

1. Do you need supersets/circuits (grouping 2–3 exercises done back to back) in v1?
   **Answer (2026-09-30):** yes, supersets in v1: 2–3 exercises alternating set by set, with
   one rest per round. No circuits with group-level rounds.
2. Per-item "sets × reps" is enough, or do you prescribe different reps per set (e.g. 12/10/8)?
   **Answer:** per-set reps (reps or range, duration and load can differ per set); hold, rest,
   side and notes stay per exercise. Remove the prescription defaults from exercises.
3. How does "New routine" start? **Answer:** a small dialog creates a draft and opens the editor.
4. How to ship removing exercise defaults? **Answer:** in this PR stop using them in UI/code;
   drop the database columns in a later chore PR (expand-then-contract).

## Decisions made during implementation

(Fill in while building.)
