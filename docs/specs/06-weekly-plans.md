# 06 · Weekly plans

- **Status:** Done
- **Feature:** Core
- **Depends on:** 05

## Summary

A **weekly plan** is a repeating Monday–Sunday template where each day holds zero or more
routines, in order, with an optional label (e.g. Mon: "Gym – upper body" + "Knee rehab A";
Tue: rest). Routines are attached **by reference**: editing "Knee rehab A" updates every day
it appears on. The patient page (spec 10) opens a plan on today's day.

## Goals

- Create/edit a plan for a customer: name, notes, linked case, status.
- 7-day board: add a routine to a day (existing customer routine, or create a new one on the
  spot), reorder within a day, move/copy between days, remove, label entries.
- "Make a separate copy" on an entry to diverge from the shared routine.
- Week summary: sessions per day, total exercises.

## Non-goals

- Multi-week sequences (progression is handled by phases, spec 08).
- Specific calendar dates (the plan repeats weekly; phases add start/end dates).

## User stories

- As a physio, I build Ana's week: Mon/Thu gym + rehab, Tue/Fri rehab only, weekends rest.
- As a physio, I change "Knee rehab A" once and it updates on all four days.
- As a physio, I make Friday's rehab a lighter copy without touching the others.

## Data model

`weekly_plans`:

| Column                        | Type                                                           | Notes                             |
| ----------------------------- | -------------------------------------------------------------- | --------------------------------- |
| `id`, `physio_id`, timestamps |                                                                |                                   |
| `customer_id`                 | uuid null → customers (cascade)                                | null only for templates (spec 07) |
| `case_id`                     | uuid null → cases (`set null`)                                 |                                   |
| `name`                        | text not null                                                  |                                   |
| `notes`                       | text null                                                      |                                   |
| `status`                      | enum `draft \| active \| archived` (reuse routine status enum) |                                   |
| `version`                     | integer not null default 1                                     |                                   |

`weekly_plan_entries`:

| Column                                                    | Type                                  | Notes                                |
| --------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| `id`, `physio_id`, `weekly_plan_id` (cascade), timestamps |                                       |                                      |
| `weekday`                                                 | smallint not null                     | 1 (Mon) – 7 (Sun), check constraint  |
| `routine_id`                                              | uuid not null → routines (`restrict`) | same customer as the plan (validate) |
| `position`                                                | integer not null                      | order within the day                 |
| `label`                                                   | text null                             | ≤ 40, e.g. "Morning"                 |

Index `(weekly_plan_id, weekday, position)`.

## Routes and UI

| Route                               | Kind | Purpose                                                      |
| ----------------------------------- | ---- | ------------------------------------------------------------ |
| `/customers/[customerId]?tab=plans` | tab  | Plans list with status and a mini week strip (dots per day). |
| `/plans`                            | page | All plans across customers; spec 07 adds Templates tab.      |
| `/plans/[planId]`                   | page | **Plan board**.                                              |

Plan board: 7 columns on desktop (Mon–Sun, week start follows locale later), a vertical
day-by-day list on mobile. Each entry card: label, routine name, exercise count,
"shared ×N" indicator when the routine is used on several days. Actions: add routine (menu:
"Existing routine…", "New routine" → opens routine editor in a sheet or navigates with a
return link), drag between days (move; with modifier or menu: copy), remove, edit label, "Make
separate copy", "Open routine".

## Behaviour and rules

1. Routines created from the board get `is_standalone = false`. Existing single routines can
   be attached too; they stay standalone (the patient sees them in the plan and on their own)
   unless the physio unticks "Also show on its own".
2. "Copy" to another day creates another entry pointing to the **same** routine (by
   reference). "Make separate copy" duplicates the routine (+items) and repoints that one entry.
3. Removing the last entry that references a non-standalone routine asks whether to delete
   the routine too (default yes).
4. A day can have up to 6 entries; a plan must have at least one entry to be activated.
5. Board changes save immediately (each action is a small server action), bumping the plan
   `version`; routine content edits bump the routine's version (spec 05).
6. Archiving a plan does not archive its routines.

## Security and privacy

- Tenancy rules apply; actions verify `routine_id` belongs to the same physio **and** customer.

## i18n

Namespace `Plans`; weekday names via `Intl.DateTimeFormat` for the active locale.

## Acceptance criteria

- [x] Build a plan with multiple routines per day, labels, reorder, move and copy between days.
- [x] Shared routine edits appear on every day (entries point at the same routine);
      "Make separate copy" diverges one entry.
- [x] Rules 1–6 enforced server-side (rule 5's "routine content edits bump the routine's version"
      is spec 05's save path, unchanged).
- [x] Mobile board is usable one-handed (day list with add and the entry menu for move up/down,
      move to day, copy to day).
- [ ] Pointer and touch drag: uses dnd-kit's `PointerSensor`; a desktop mouse drag between days
      is automated, touch drag is not (the handle is hidden on touch layouts, where the menu
      covers every move), so this stays unchecked until tried on a real device.
- [x] RLS tests for both tables; cross-customer routine attach rejected.

## Test plan

- Unit: week-summary computation, weekday helpers.
- Integration: copy vs separate copy; delete-last-reference behaviour; RLS.
- E2E: create plan, add existing + new routine to two days, reorder, reload.

## Open questions

1. Should the week start on Monday for everyone, or follow the locale (Sunday in the US)?
   **Answer (2026-10-01):** Monday for everyone (matches ISO weekdays and both shipped
   locales); a locale-aware start can come later without a migration.
2. Do you want per-day notes (e.g. "Rest day: 20 min walk") in v1? They could be entries
   without a routine. **Answer:** no, deferred. `routine_id` stays NOT NULL; a day with no
   entries reads as rest.
3. How does "New routine" from a day start? **Answer:** a small dialog (name) creates a
   non-standalone draft, attaches it to the day and opens the routine editor with a "Back to
   plan" link; the editor is not embedded in a sheet.
4. How much drag-and-drop? **Answer:** drag within a day and between days (move) on the
   desktop board with dnd-kit (keyboard included), plus an entry menu everywhere (move to day,
   copy to day, move up/down). Copy is menu-only.

## Decisions made during implementation

- **Server layer.** `src/server/plans/{schemas,queries,mutations,actions,load}.ts`. Every board
  action locks the plan row (`for update`), validates, applies and bumps the plan `version`
  (a move that changes nothing does not). Positions are rewritten from a snapshot of the plan's
  entries by the pure helpers in `src/lib/plans.ts` (`moveEntry`, `copyEntry`, `appendEntry`),
  which the client reuses for optimistic updates, so server and board always agree on the
  arrangement. `weekly_plan_entries` has no unique position index: reorders write row by row.
- **No optimistic locking on plans.** Board actions refer to entries by id and are applied on
  the current state, so a stale tab at worst puts a card at a slightly different position; the
  details form (name, status, case, notes) is last write wins. `version` exists for spec 15.
- **Cross-customer attach** is validated in `addEntry` (the routine must belong to the same
  physio and the same customer as the plan, else `routineNotFound`); the DB enforces the physio
  side with composite FKs. Archived routines cannot be attached (`routineArchived`).
- **Rule 1 (standalone).** `AddEntryInput.standalone` is optional: the dialog starts from the
  routine's own flag and only sends it when the physio changed it. Routines created from the
  board are `is_standalone = false`.
- **Rule 3 (delete last reference).** `removeEntry` takes `deleteRoutine` (server default false;
  the dialog defaults to yes) and only deletes when no entry in any plan still uses the routine
  and it is not standalone. The board knows this from `routineEntryCount` (all plans).
- **Rule 2 (separate copy).** `duplicateRoutine` (`src/server/routines/mutations.ts`) copies the
  header, groups, items and sets; the copy keeps the source's status, is not standalone and is
  named by the action with the translated `Plans.board.entry.copyName` ("… (copy)").
- **Spec 05 hook filled in.** `listPlansUsingRoutine` returns the **active** plans that use a
  routine; archiving it is refused with `blockedByPlans` and the failure now carries the plan
  names (`Result` gained an optional `plans`), which the editor lists in its message.
- **Case FK.** `weekly_plans_case_fk` (composite, `ON DELETE SET NULL (case_id)`) and a check
  that a case needs a customer live in the custom migration, with the `updated_at` triggers.
- **"New routine" from a day** is a form action (`addNewRoutineEntryAction`) that creates the
  draft, attaches it and redirects to `/routines/[id]?plan=<planId>`; the editor page shows
  "Back to plan" when `plan` is a uuid (the plan page itself 404s for anything not the
  physio's).
- **Board UX.** Desktop shows seven columns Monday to Sunday (each at least 11 rem wide, the row
  scrolls sideways when the screen is narrower); below `lg` it is a vertical day list. Dragging
  uses dnd-kit with one `SortableContext` per day plus a droppable per day (so an empty day can
  receive a card), a drag overlay and translated announcements; the handle is hidden below `md`.
  Menu moves append to the target day. Everything goes through one `run()` that applies the
  change optimistically (`useOptimistic`) and rolls back with the server's reason on refusal.
- **Details form** saves with a button (unlike board actions) and is not remounted when the
  plan version moves, so a board action never wipes what is being typed.
- **Server Actions must be `async function` declarations**: a `"use server"` file cannot export
  arrow-function constants (found by running the real app, not by typecheck).
- **Verification environment.** Docker could not pull Supabase's images (network policy), so the
  integration and e2e suites were run against a local Postgres 16 with stubbed `auth`/`storage`
  schemas plus a small fake GoTrue for sign-in; CI runs them against real Supabase. The branding
  suites and two physios tests that need the real Auth/Storage APIs were not runnable there.
