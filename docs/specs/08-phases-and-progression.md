# 08 · Phases and progression

- **Status:** Not started
- **Feature:** B (duplicate / progress routine)
- **Depends on:** 05, 06

## Summary

Rehab progresses in stages. Routines and weekly plans get an optional date window and a phase
label, and a one-click **"Copy into next phase"** that clones the current item, links it to its
predecessor, and schedules it to start when the current one ends. The patient page shows
whatever is active today, so the switch happens automatically.

## Goals

- Optional `starts_on` / `ends_on` and `phase_label` on routines and plans.
- "Copy into next phase" with a small dialog (label, start date, end date, archive current on
  start).
- Customer timeline: phases in order, current one highlighted.
- A single definition of "active on date D" used everywhere (patient page, dashboard, exports).

## Non-goals

- Automatic progression rules (e.g. "+2 reps per week").
- Notifications when a phase starts (reminders, feature O, deferred).

## Data model

Add to `routines` and `weekly_plans`:

| Column        | Type                                | Notes                                         |
| ------------- | ----------------------------------- | --------------------------------------------- |
| `phase_label` | text null                           | ≤ 40, e.g. "Phase 2 – strength"               |
| `starts_on`   | date null                           | null = active from when status becomes active |
| `ends_on`     | date null                           | inclusive; check `ends_on >= starts_on`       |
| `previous_id` | uuid null → same table (`set null`) | progression chain                             |

Not applicable to templates (check constraint or action validation).

## Active-on-date rule

`src/server/schedule/active.ts` (and a pure helper in `src/lib/schedule.ts`):

An item is **active on date D** (in the physio's timezone) when `status = 'active'` and
`(starts_on is null or starts_on <= D)` and `(ends_on is null or ends_on >= D)`.

Also expose `upcoming` (active status, `starts_on > D`) and `ended` (active status,
`ends_on < D`). Everything that asks "what should the patient do today" uses this helper.

## Routes and UI

- Routine editor and plan board headers: phase label + date range chips; edit via popover.
- "Copy into next phase" action (routine and plan). Dialog defaults: label "Phase N+1",
  start = current `ends_on + 1` (or today + 1 if no end), end empty, "Archive current when the
  new phase starts" checked.
- Customer page Routines/Plans tabs: group by progression chain, showing a horizontal
  timeline (past, current, upcoming) with dates.

## Behaviour and rules

1. Copying a plan copies its entries and **deep-copies its routines** (the new phase must be
   editable without changing the old one). Shared references within the plan stay shared.
2. The new item is created with `status = 'active'` and its `starts_on`, so it becomes visible
   on that date without further action. If "archive current" was checked, the previous
   item's `ends_on` is set to the day before (if empty or later).
3. Overlapping windows are allowed (e.g. a gym plan and a rehab plan) but the dialog warns
   when the new phase overlaps its predecessor.
4. Past-dated `ends_on` on an active item: the item is shown as "ended" to the physio and no
   longer to the patient; no status change is needed.

## Security and privacy

- Tenancy rules apply. The copy action runs in one transaction under `withPhysio`.

## i18n

Namespace `Phases`. Date ranges via `Intl.DateTimeFormat.formatRange`.

## Acceptance criteria

- [ ] Date window and label editable on routines and plans; validation of ranges.
- [ ] "Copy into next phase" works for routines and plans (deep copy for plans), links `previous_id`.
- [ ] `isActiveOn` helper exhaustively unit-tested (timezone boundaries included) and used by later specs.
- [ ] Customer timeline shows past/current/upcoming phases.

## Test plan

- Unit: `isActiveOn` truth table incl. null bounds and timezone edges.
- Integration: plan phase copy produces independent routines; previous `ends_on` adjusted.
- E2E: create next phase starting tomorrow; today's patient view (once spec 10 exists) still shows the old one.

## Open questions

1. Should the patient see upcoming phases ("Starts Monday"), or only what's active today?

## Decisions made during implementation

(Fill in while building.)
