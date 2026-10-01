# 08 · Phases and progression

- **Status:** Done
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

- [x] Date window and label editable on routines and plans; validation of ranges.
- [x] "Copy into next phase" works for routines and plans (deep copy for plans), links `previous_id`.
- [x] `isActiveOn` helper exhaustively unit-tested (timezone boundaries included) and used by later specs.
- [x] Customer timeline shows past/current/upcoming phases.

## Test plan

- Unit: `isActiveOn` truth table incl. null bounds and timezone edges.
- Integration: plan phase copy produces independent routines; previous `ends_on` adjusted.
- E2E: create next phase starting tomorrow; today's patient view (once spec 10 exists) still shows the old one.

## Open questions

1. Should the patient see upcoming phases ("Starts Monday"), or only what's active today?
   **Answer (2026-10-01):** only what is active today. When nothing is active, the empty state
   shows the next start date ("Next phase starts Mon 6 Oct"); nothing about a future phase's
   content is exposed. `nextStart(items, date)` in `src/lib/schedule.ts` provides that date for
   spec 10.
2. (Raised while designing) Do routines inside a plan get their own window and label?
   **Answer:** no. Phase fields are editable only on plans and on standalone routines; a routine
   inside a plan is active when its plan is.

## Decisions made during implementation

- **Schedule helpers.** `src/lib/schedule.ts` has `scheduleState(item, date)` (`active | upcoming
| ended | inactive`; draft and archived are always `inactive`), `isActiveOn`, `scheduleStateNow`
  (the day in a time zone) and `nextStart`. `src/server/schedule/active.ts` has the SQL twin
  `scheduleFilter(table, state, date)` and `physioToday(tx, physioId)`; an integration test checks
  the two agree for every status and bound combination. Later specs (10, 13, 14) must use these,
  never their own date comparisons.
- **Editing the window is its own action** (`setPhaseAction`, in `src/server/phases/`), not part of
  `saveRoutine`/`updatePlan`. It does not bump `version`, so an open editor or board is never made
  stale by it (and window edits are not versioned for spec 15). The popover saves on its own, like
  the plan board's actions.
- **Plan-owned routines carry no phase.** The phase bar is hidden for a non-standalone routine and
  `setPhase`/`copyIntoNextPhase` refuse it (`notStandalone`). A standalone routine that is later
  made plan-only keeps its stored window, which is ignored. Templates (plans with no customer)
  refuse phases (`needsCustomer`); spec 07 must keep phases off templates when it relaxes
  `routines.customer_id`.
- **Copy details.** The copy keeps the source's name (the label tells phases apart). It is
  `active` only when its source is active and activatable (routine: has exercises; plan: has
  entries and none is archived), otherwise a `draft`; a draft or archived source is not touched
  by "end the current phase". Routines deep-copied for a plan copy are non-standalone, have no
  phase fields and keep their source status; a routine shared by several entries stays shared in
  the copy. They are not linked with `previous_id` (only plans and standalone routines form
  chains). The predecessor's `ends_on` becomes the day before the new start only when empty or
  later; a start on or before the predecessor's own start is refused (`startBeforePredecessor`),
  and nothing is written.
- **Overlap warning** is a pure `previewNextPhase` (also computes the refusal above) so the dialog
  can show it before submitting. Only an active current phase can overlap or be ended: a draft or
  archived one is never shown to the patient. When the current phase has not started yet, the
  default start is the day after its start.
- **Default label** is "Phase N+1" where N is the number after "phase"/"fase" in the current label
  (else 2). The phase bar also shows the status badge of a draft or archived item.
- **Chains.** `groupByChain` groups by `previous_id` links; branches (two successors) are allowed
  and ordered by start date. Chains of two or more render as a timeline in the customer's
  Routines/Plans tabs and leave the flat list; single items stay in the list. Lists show the label,
  dates and an Ended badge for active items past their end.
- **Popover primitive.** shadcn's registry was unreachable, so `src/components/ui/popover.tsx` was
  written by hand in the same style.
- **Typecheck.** Adding the `Phases` messages pushed an unrelated all-namespaces `t` prop type in
  `category-manager.tsx` over TypeScript's instantiation-depth limit; it is now typed to its
  namespace.
- **Verification environment.** No Docker daemon here, so integration and e2e ran against a local
  Postgres 16 with stubbed `auth`/`storage` schemas and a small fake GoTrue (create/delete user,
  magic link, session). The branding suites and one RLS test that need real Auth/Storage could
  not run; CI runs them against real Supabase.
