# 05 · Routines

- **Status:** Done
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

- [x] Create, edit, reorder (mouse, touch, keyboard), duplicate/remove items, save. (Keyboard
      reorder is covered end to end; pointer and touch use dnd-kit's `PointerSensor` and are not
      automated.)
- [x] Per-set reps/duration/load editing; supersets (group, ungroup, reorder, set-count sync).
- [x] Picker search/filter reuses library queries; adding creates one empty set.
- [x] Exercise defaults removed from the exercise UI and code; delete returns `inUse`.
- [x] Status transitions and rules 2–3 enforced server-side.
- [ ] Rule 4 (archiving blocked by plans that use the routine): the save path calls
      `listPlansUsingRoutine`, which returns nothing until spec 06 fills it in.
- [x] Optimistic locking works across two tabs.
- [x] `formatPrescription` covers all field combinations (unit tests).
- [x] RLS tests for all four tables.

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

- **Fresh ids on every save.** The save action replaces a routine's groups, items and sets
  wholesale in one transaction and lets Postgres assign new ids; client keys (`crypto.randomUUID`)
  only exist inside the editor to key React rows and drag handles, and are never persisted. So
  item, set and group ids are not stable across saves: anything that must survive a save (spec 12
  progress, spec 13 logs, spec 15 diffs) has to key by `routine_id` + position, or by exercise,
  not by row id. Delete order in the transaction: sets cascade, items, then groups (the group FK
  has no `ON DELETE` action).
- **`Prescription.summary` and `formatPrescription`** (`src/lib/prescription.ts`, pure, takes a
  translator). Message keys under `Prescription.summary`: `count` ("12"), `range` ("8–12"),
  `seconds` ("30 s"), `sets` (plural, "3 sets", when the sets are equal but empty), `blank`
  ("–", a set with nothing set inside a differing list), `hold` ("hold 5 s"), `rest`
  ("rest 60 s"); sides come from `Prescription.sides.*`. Rules: a set reads "reps" or
  "min–max reps", plus " / duration" when both are set. Equal sets collapse to "N × set" (or "N
  sets" when empty, one equal set shows just itself); different sets list with " · " ("12 · 10 ·
  8"). One load shared by every set is appended once ("3 × 12 · 5 kg"); loads that differ are
  attached per set ("12 × 5 kg · 10 × 7 kg"). Then hold, rest and side, joined with " · ".
  Group rest is not part of an item's summary: the superset shows it itself.
- **Picker**: `searchExercisesAction` reuses `listExercises`, is capped at 60 results and never
  returns archived exercises (`category=archived` is coerced to "all"). Idle, it shows the
  physio's recent exercises plus the first 60 of the library (so the idle count reflects that
  page, not the whole library). Search is debounced (250 ms) and sequenced so a slow older
  response is dropped; the last results are forgotten when the filters go idle, so retyping the
  same query is a new search. The server only checks that a saved exercise belongs to the
  physio, so a crafted payload could still add an archived one (harmless; archived exercises
  still resolve).
- **Plan hook stubs.** `listPlansUsingRoutine` (`src/server/routines/hooks.ts`) returns `[]`
  until spec 06 queries the plans that schedule a routine; rule 4 (archive blocked, message
  listing the plans) is wired to it in `saveRoutine` (`blockedByPlans`) but inert until then.
  Spec 06 must fill it in and add the plan names to the message.
- **Cases**: `cases` gets a `(physio_id, customer_id, id)` unique constraint so `routines` can
  carry the composite FK `(physio_id, customer_id, case_id)`; a case can never belong to another
  customer, and deleting a case clears only `case_id` (`ON DELETE SET NULL (case_id)`). It lives
  in the custom migration with the other hand-written constraints.
- **Editor state and version sync.** The editor does not use `key={version}`: a remount after the
  editor's own save (the action revalidates the page) would wipe "Saved" and edits made while
  the save was in flight. Local state resets from props only after a conflict and the user's
  Reload, when the page delivers a newer version; any other new version is just our own save and
  is recorded. A dirty snapshot (`JSON` of header + blocks) drives Save's enabled state and the
  "Unsaved changes" indicator.
- **`NumberField` discards invalid drafts on blur.** While typing, invalid text stays in the
  box with its error and the stored value keeps the last valid number; on blur the draft is
  dropped and the box shows what will be saved, so the box never differs from the payload.
  Blank means `null`.
- **Unsaved-changes guard** covers in-app link clicks and `beforeunload` (reload, close tab).
  It does not cover back/forward (`popstate`): Next's router gives no way to cancel that, and
  a stale page is protected by the optimistic lock anyway.
- **Client pre-validation mirrors the server schema** (`src/lib/routine-validation.ts` for the
  header; `setSchema`/`itemShape` limits for cells), so invalid input is flagged on its field and
  never sent. The server still validates everything and answers `invalid` for anything that gets
  through (shown as a generic message).
- **`inUse` message** lives at `Library.detail.errors.inUse` (the exercise detail already
  resolves `errors.*` under `Library.detail`), not under a new `Library.actions` namespace.
- **Superset UX**: "Group with next" is a button on the superset card and a menu item on single
  rows (members show "Ungroup"); a member's set count changes for the whole group; a group left
  with one member dissolves and the survivor inherits the group rest; a group's handle is labelled
  "Reorder Superset" for every group.
- **Mobile picker** is the same component in a bottom sheet with the localized "Done" button (the
  sheet's default English-only X is turned off). Only the sheet or the side panel is visible at
  a time; the panel is `display: none` below `lg`.
- **E2E findings and fixes** (`e2e/routines.spec.ts`, both projects; the conflict and unsaved
  guard scenarios live in `e2e/routine-editor.spec.ts`):
  - Fixed: the picker kept its last results (and failure) after the box was cleared, so retyping
    the same query showed old results with no `aria-busy`; fixed by resetting when idle, plus
    invalidating pending requests in the effect cleanup (also on unmount).
  - Fixed: the mobile sheet showed the default X with a hard-coded English "Close".
  - dnd-kit's live region is `role="status"` as well: the save indicator has
    `data-testid="save-status"`, the picker live regions `picker-count` / `picker-announcer`.
  - Keyboard reorder announces "moved to position N" straight after pick-up (the pick-up text is
    replaced at once); reorder collapsed blocks, an expanded tall one landed oddly.
  - A recently used exercise appears under "Recent" and in the list, so picks use `.first()`.
  - `e2e/auth.spec.ts` "emailed link opened in another browser" fails when the local Supabase
    stack was started before `supabase/templates/magic_link.html` existed (the stack still sends
    the default PKCE link); restart the stack, not an app bug.
- **Follow-up chore PR**: drop the `exercises` default-prescription columns (`sets`, `reps`,
  `reps_max`, `duration_seconds`, `hold_seconds`, `rest_seconds`, `load`, `side`, `notes`) and
  the `_prescription.test.ts` legacy column list, once no deployed code reads them
  (expand-then-contract). Known minor items deferred: no index on `routine_items (physio_id,
exercise_id)` for the `inUse` check, and group members read back in no guaranteed order from
  `getRoutine` (consumers key by id/position).
