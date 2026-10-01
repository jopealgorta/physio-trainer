# Weekly Plans Implementation Plan

**Goal:** A physio builds a repeating Monday–Sunday plan for a customer: each day holds up to six
routines (attached by reference), reorderable, movable and copyable between days, with optional
labels, and "Make a separate copy" to diverge one entry.

**Architecture:** Two tables (`weekly_plans`, `weekly_plan_entries`) with composite
`(physio_id, …)` FKs and RLS. Pure helpers in `src/lib/plans.ts` (limits, weekday helpers, week
summary, board reducer for move/copy/reorder positions). Server layer
`src/server/plans/{schemas,queries,mutations,actions}.ts`: each board action is a small
mutation that locks the plan row, validates, applies and bumps `version`. Components in
`src/components/plans/`. `listPlansUsingRoutine` (spec 05 hook) is filled in. `duplicateRoutine`
is added to `src/server/routines/mutations.ts` for "Make a separate copy".

**Spec:** `docs/specs/06-weekly-plans.md` (answers recorded there). Patterns to copy:
`docs/plans/05-routines.md` and `src/server/routines/*`, `src/db/schema/routines.ts`.

## Global Constraints

Same as `docs/plans/05-routines.md`: RLS + `set_updated_at` trigger on every table, composite
FKs, queries filter by `physio_id` inside `withPhysio`, every string in every `messages/*.json`,
shadcn primitives only, design tokens only, no functions across the server/client boundary,
expand-only migrations, commit per task with `pnpm check` green.

## Tasks

1. **Pure helpers** (`src/lib/plans.ts` + tests): constants (`MAX_ENTRIES_PER_DAY = 6`,
   `PLAN_NAME_MAX = 80`, `PLAN_NOTES_MAX = 2000`, `ENTRY_LABEL_MAX = 40`), `WEEKDAYS`,
   `weekdayName(locale, weekday)`, `summarizeWeek(entries)`, `planAfterMove` (position math).
2. **Schema + migration**: `src/db/schema/plans.ts`, `pnpm db:generate`, custom migration with
   triggers and the case FK (`ON DELETE SET NULL (case_id)`).
3. **Server schemas** (`src/server/plans/schemas.ts` + tests): create/update plan, add/move/copy/
   reorder/label/remove entry, separate copy.
4. **`duplicateRoutine`** and **`listPlansUsingRoutine`** (routines hooks/mutations).
5. **Queries + mutations** (`src/server/plans/*`) with integration tests: rules 1–6, copy vs
   separate copy, delete-last-reference, cross-customer/cross-physio rejection, RLS.
6. **Actions** (thin) + unit tests with mocked `withPhysio`.
7. **Plan list** (`/plans`, customer plans tab, new-plan dialog, mini week strip).
8. **Plan board** (`/plans/[planId]`): header, 7-column desktop board with dnd-kit, mobile day
   list, entry menu, add-routine menu (existing picker / new routine), delete-last-reference
   dialog, week summary, "Back to plan" link in the routine editor.
9. **i18n** (`Plans` namespace in `en` and `es`), weekday names via `Intl`.
10. **E2E** (`e2e/plans.spec.ts`, desktop + mobile).
11. **Docs**: spec Status, decisions, README index; verification and self-review.
