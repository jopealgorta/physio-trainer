# Phases and Progression Implementation Plan

**Goal:** Routines and weekly plans get an optional phase label and date window, a one-click
"Copy into next phase" that clones the item, links it to its predecessor and schedules it, and a
customer timeline. One definition of "active on date D" (`scheduleState`) is shared by every later
consumer (patient page, dashboard, exports).

**Architecture:** Four nullable columns on `routines` and `weekly_plans` (`phase_label`,
`starts_on`, `ends_on`, `previous_id`) in an expand-only migration. Pure helpers in
`src/lib/schedule.ts` (state of an item on a date, `nextStart`) and `src/lib/phases.ts` (limits,
window validation, overlap, chain grouping, next-phase defaults). SQL predicate and "today in the
physio's timezone" in `src/server/schedule/active.ts`. Window edits ride the existing save paths
(`saveRoutine`, `updatePlan`) so optimistic locking and `version` still apply. The copy runs in
`src/server/phases/mutations.ts` (one transaction under `withPhysio`), reusing `duplicateRoutine`.
Components in `src/components/phases/`.

**Spec:** `docs/specs/08-phases-and-progression.md` (answers recorded there). Patterns to copy:
`docs/plans/06-weekly-plans.md`, `src/server/plans/*`, `src/db/schema/plans.ts`.

## Global Constraints

Same as `docs/plans/06-weekly-plans.md`: RLS and `set_updated_at` already cover the tables,
composite FKs, queries filter by `physio_id` inside `withPhysio`, every string in every
`messages/*.json`, shadcn primitives only, design tokens only, no functions across the
server/client boundary, expand-only migrations, commit per task with `pnpm check` green.

Decisions from the clarifying round: the patient sees only what is active today (plus the next
start date in the empty state, via `nextStart`); phase fields are editable on plans and
standalone routines only (a routine inside a plan follows its plan).

## Tasks

1. **Pure helpers** (`src/lib/schedule.ts`, `src/lib/phases.ts` + tests): `scheduleState`,
   `isActiveOn`, `nextStart`, `PHASE_LABEL_MAX = 40`, `validateWindow`, `windowsOverlap`,
   `nextPhaseDefaults`, `groupByChain`.
2. **Schema + migration**: columns, checks, `previous_id` composite FK (`ON DELETE SET NULL
(previous_id)`) in the custom migration.
3. **Server schemas** (`src/server/phases/schemas.ts` + tests) and phase fields in the routine and
   plan save schemas, queries and mutations (`saveRoutine`, `updatePlan`, loaders, list rows).
4. **`src/server/schedule/active.ts`**: SQL predicate and `physioToday(tx, physioId)`.
5. **`copyIntoNextPhase`** (routine and plan, deep copy, predecessor `ends_on`) + integration
   tests: independence, shared routines stay shared, predecessor adjusted, cross-customer and
   cross-physio rejection, constraints, RLS.
6. **Actions** (thin) + unit tests with mocked `withPhysio`.
7. **Phase UI**: `PhasePopover` + chips in the routine editor header and plan details, "Ended"
   badges, `NextPhaseDialog` (routine editor and plan board), overlap warning.
8. **Customer timeline** in the Routines and Plans tabs.
9. **i18n** (`Phases` namespace in `en` and `es`).
10. **E2E** (`e2e/phases.spec.ts`, desktop + mobile).
11. **Docs**: spec Status and decisions, README index; verification and self-review.
