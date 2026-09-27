# 06 · Weekly plans

- **Status:** Not started
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

- [ ] Build a plan with multiple routines per day, labels, reorder, move and copy between days.
- [ ] Shared routine edits appear on every day; "Make separate copy" diverges one entry.
- [ ] Rules 1–4 enforced server-side.
- [ ] Mobile board is usable one-handed (day list with add/reorder).
- [ ] RLS tests for both tables; cross-customer routine attach rejected.

## Test plan

- Unit: week-summary computation, weekday helpers.
- Integration: copy vs separate copy; delete-last-reference behaviour; RLS.
- E2E: create plan, add existing + new routine to two days, reorder, reload.

## Open questions

1. Should the week start on Monday for everyone, or follow the locale (Sunday in the US)?
2. Do you want per-day notes (e.g. "Rest day: 20 min walk") in v1? They could be entries
   without a routine.

## Decisions made during implementation

(Fill in while building.)
