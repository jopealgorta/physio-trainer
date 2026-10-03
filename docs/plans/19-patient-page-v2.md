# Plan 19 · Patient page v2

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compact exercise list with video thumbnails on the patient page and in workout mode
(bottom-bar controls), RPE on routine logs, per-exercise logs (pain/RPE/kg/comment) visible to
the physio, physio day notes per weekday, and aerobic exercises (duration/distance/intensity).

**Architecture:** Additive schema changes (`exercises.kind`, two set columns, `session_logs.rpe`,
new `exercise_logs` and `weekly_plan_days`). Patient writes stay in `src/server/patient/`, scoped
by the resolved link (`isReachable`). One client `ExerciseList` renders a routine's blocks for both
the patient page and the workout player; the workout state machine is unchanged.

**Tech stack:** Next.js 16, React 19, Drizzle + Supabase Postgres, zod v4, next-intl, shadcn/ui
(Radix + vaul), Vitest, Playwright.

**Spec:** [`../specs/19-patient-page-v2.md`](../specs/19-patient-page-v2.md). Read it, plus
`docs/architecture.md`, `CLAUDE.md`, and specs 05, 06, 10, 12, 13 for the areas you touch.

## Global constraints

- Node: Bash shells do not load nvm. Prefix every pnpm command with
  `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" &&`.
- Local Supabase: the default stack (`project_id = "physio-trainer"`, DB on 54322) is running.
  Apply migrations with `pnpm db:reset`. Do **not** touch any other stack. No worktrees.
- Migrations: `pnpm db:generate --name <name>` writes a migration from `src/db/schema`. Never
  hand-edit the generated SQL. Things drizzle cannot express (triggers, `SET NULL (col)` FKs) go
  in `pnpm db:generate --custom --name <name>-extras`. All changes are additive (expand only).
- Every physio-owned table: `physio_id` + composite FKs `(physio_id, x)` + RLS `ownRows` +
  `set_updated_at` trigger (`src/db/schema-conventions.int.test.ts` enforces RLS + trigger).
- i18n: every new string goes in **both** `messages/en.json` and `messages/es.json` in the same
  commit (Rioplatense voseo: "registrá", "elegí"). Numbers and dates go through next-intl/`Intl`
  with the active locale. `src/i18n/messages.test.ts` must pass.
- UI: shadcn primitives only (`Input`, `Textarea`, `Label`, `Button`, `Dialog`, `Drawer`,
  `Popover`, `Badge`, `ToggleGroup` if present, else radios styled as in `PainScale`). Accent
  colours use the `primary` token. Bottom sheets are `Drawer` with a scrolling inner
  `min-h-0 overflow-y-auto` box. Patient-portalled sheets carry `data-brand="patient"` and `lang`.
- Never pass functions/icons from Server to Client Components.
- Comments are plain text everywhere (`whitespace-pre-line`, no HTML).
- Run `pnpm check` before each commit. Commit messages: conventional, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review focus

1. **Exercise id not in the routine**: a patient POSTs an `exerciseId` from another routine or
   another physio. Expect `unreachable`, no row. Pinned in Task 7.
2. **Old version snapshots**: snapshots saved before this change have no `days`,
   `distanceMeters` or `intensity`. They must still parse, diff and restore. Pinned in Tasks 2
   and 4.
3. **Decimal input in Spanish**: "12,5" kg and "2,5" km must parse as 12.5 and 2.5. Pinned in
   Tasks 1 and 7.
4. **Empty exercise log**: saving with every field blank must delete the row, not violate the
   "at least one field" check. Pinned in Task 7.
5. **Workout resume**: a saved sessionStorage state from the old player must still resume. The
   machine and storage key are unchanged, so this only needs a test that the list highlights the
   resumed exercise. Pinned in Task 9.

---

### Task 1: Aerobic prescription model (lib + schema + migration)

**Files:**

- Modify: `src/lib/prescription.ts`, `src/db/schema/_prescription.ts`, `src/db/schema/enums.ts`,
  `src/db/schema/library.ts`, `src/lib/workout/machine.ts` (`setsOf` → use `EMPTY_SET`),
  `messages/en.json`, `messages/es.json` (`Prescription.summary.*`)
- Create: `src/lib/exercise-kinds.ts`, `src/lib/distance.ts`, `src/lib/distance.test.ts`
- Test: `src/lib/prescription.test.ts` (existing; extend), `src/db/schema/enums.test.ts`
- Generated: `supabase/migrations/*_aerobic-exercises.sql` (+ meta snapshot)
- Update any literal `SetPrescription` objects the typecheck flags (`src/test/routine-fixtures.ts`,
  tests that build sets) by spreading `EMPTY_SET`.

**Interfaces (produces):**

```ts
// src/lib/exercise-kinds.ts (no "@/" imports: drizzle-kit loads it)
export const EXERCISE_KINDS = ["strength", "aerobic"] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

// src/lib/prescription.ts
PRESCRIPTION_LIMITS.distanceMeters = { min: 1, max: 200_000 };
PRESCRIPTION_LIMITS.durationSeconds = { min: 1, max: 14_400 }; // was 7200: long runs/rides
export const INTENSITY_MAX_LENGTH = 40;
setShape = { reps, repsMax, durationSeconds, load, distanceMeters, intensity };
EMPTY_SET = { reps: null, repsMax: null, durationSeconds: null, load: null,
              distanceMeters: null, intensity: null };
type PrescriptionSummaryKey += "summary.minutes" | "summary.distanceKm" | "summary.distanceM";

// src/lib/distance.ts (pure, no "@/" imports)
/** "5" → 5000, "2,5" / "2.5" → 2500, "0.8" → 800; blank → null; NaN/≤0 → undefined (invalid). */
export function parseKm(value: string): number | null | undefined;
/** 5000 → "5", 2500 → "2.5", 800 → "0.8" (for the editor input; dot decimal). */
export function metersToKmInput(meters: number | null): string;
/** Unit + value for display: < 1000 m → { unit: "m", value: 800 }, else { unit: "km", value: 2.5 }. */
export function distanceDisplay(meters: number): { unit: "m" | "km"; value: number };
/** "30" → 1800, "1:30" → 90, "45:00" → 2700; blank → null; invalid → undefined. */
export function parseDurationInput(value: string): number | null | undefined;
/** 1800 → "30", 90 → "1:30" (inverse of parseDurationInput). */
export function durationToInput(seconds: number | null): string;
```

- [ ] **Step 1: Failing tests** in `src/lib/distance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  distanceDisplay,
  durationToInput,
  metersToKmInput,
  parseDurationInput,
  parseKm,
} from "./distance";

describe("parseKm", () => {
  it.each([
    ["5", 5000],
    ["2,5", 2500],
    ["2.5", 2500],
    ["0.8", 800],
    [" 10 ", 10000],
    ["0,125", 125],
  ])("%s km → %s m", (input, meters) => expect(parseKm(input)).toBe(meters));
  it("blank is null", () => expect(parseKm("  ")).toBeNull());
  it.each(["abc", "-1", "0", "1.2.3"])("%s is invalid", (input) =>
    expect(parseKm(input)).toBeUndefined(),
  );
});
describe("metersToKmInput", () => {
  it.each([
    [5000, "5"],
    [2500, "2.5"],
    [800, "0.8"],
    [125, "0.125"],
    [null, ""],
  ])("%s → %s", (m, s) => expect(metersToKmInput(m)).toBe(s));
});
describe("distanceDisplay", () => {
  it("metres under 1 km", () => expect(distanceDisplay(800)).toEqual({ unit: "m", value: 800 }));
  it("km from 1 km", () => expect(distanceDisplay(2500)).toEqual({ unit: "km", value: 2.5 }));
});
describe("duration input", () => {
  it.each([
    ["30", 1800],
    ["1:30", 90],
    ["45:00", 2700],
    ["0:45", 45],
  ])("%s → %s s", (input, s) => expect(parseDurationInput(input)).toBe(s));
  it("blank is null", () => expect(parseDurationInput("")).toBeNull());
  it.each(["x", "1:75", "-3"])("%s invalid", (input) =>
    expect(parseDurationInput(input)).toBeUndefined(),
  );
  it.each([
    [1800, "30"],
    [90, "1:30"],
    [45, "0:45"],
    [null, ""],
  ])("%s → %s", (s, out) => expect(durationToInput(s)).toBe(out));
});
```

Extend `src/lib/prescription.test.ts`:

```ts
it("summarises aerobic sets", () => {
  const set = { ...EMPTY_SET, durationSeconds: 1800, distanceMeters: 5000, intensity: "Zone 2" };
  expect(
    formatPrescription({ sets: [set], holdSeconds: null, restSeconds: null, side: null }, t),
  ).toBe("30 min / 5 km · Zone 2");
});
it("summarises intervals", () => {
  const set = { ...EMPTY_SET, distanceMeters: 500, intensity: "2:00/500m" };
  expect(
    formatPrescription(
      { sets: [set, set, set, set], holdSeconds: null, restSeconds: 90, side: null },
      t,
    ),
  ).toBe("4 × 500 m · 2:00/500m · rest 90 s");
});
it("shows minutes for whole minutes", () => {
  const set = { ...EMPTY_SET, durationSeconds: 120 };
  expect(
    formatPrescription({ sets: [set], holdSeconds: null, restSeconds: null, side: null }, t),
  ).toBe("2 min");
});
it("validates distance and intensity", () => {
  expect(setSchema.safeParse({ ...EMPTY_SET, distanceMeters: 0 }).success).toBe(false);
  expect(setSchema.safeParse({ ...EMPTY_SET, intensity: "x".repeat(41) }).success).toBe(false);
});
```

(Use the file's existing fake `t`; add the new keys to it: `summary.minutes` → `${value} min`,
`summary.distanceKm` → `${value} km`, `summary.distanceM` → `${value} m`.)

- [ ] **Step 2: Run** `pnpm test src/lib/distance.test.ts src/lib/prescription.test.ts`. Expect FAIL.

- [ ] **Step 3: Implement.**
  - `distance.ts`: normalise `,` to `.`, `/^\d+(\.\d+)?$/`, `Math.round(km * 1000)`, reject ≤ 0.
    For durations, `^\d+$` means minutes, and `^(\d+):([0-5]\d)$` means minutes:seconds.
  - `prescription.ts`: `distanceMeters: optionalInt(PRESCRIPTION_LIMITS.distanceMeters)` and
    `intensity: optionalText(INTENSITY_MAX_LENGTH)` in `prescriptionShape`; add them to `setShape`
    and `EMPTY_SET`.
  - `setBase`: duration ≥ 60 and divisible by 60 → `t("summary.minutes", { value: s / 60 })`,
    else seconds. Then distance → `distanceDisplay` → `summary.distanceKm|distanceM`.
  - Intensity follows the same shared/per-set logic as `load` (shared once at the end, or
    `label × intensity` per set when sets differ). Put it right after load in `parts`.
  - Messages: en `"minutes": "{value} min"`, `"distanceKm": "{value, number} km"`,
    `"distanceM": "{value, number} m"`; es the same units.
  - Schema: `setPrescriptionColumns()` adds `distanceMeters: integer(), intensity: text()`.
    `setPrescriptionChecks` adds `rangeCheck(table, "distance_meters", ...)` and
    `check(`${table}_intensity_length`, char_length <= INTENSITY_MAX_LENGTH)`.
  - `enums.ts`: `export const exerciseKindEnum = pgEnum("exercise_kind", EXERCISE_KINDS);`.
  - `library.ts`: `kind: exerciseKindEnum().notNull().default("strength")` on `exercises`.
  - `machine.ts` `setsOf`: use `[EMPTY_SET]`.
  - Fix the literal sets the typecheck flags by spreading `EMPTY_SET`.

- [ ] **Step 4: Migration.** `pnpm db:generate --name aerobic-exercises`. Check the SQL: a new
      enum, `exercises.kind` not null default, two nullable set columns, two checks, and the duration
      check replaced with the 14400 bound. `pnpm db:reset`.

- [ ] **Step 5: Verify.** Run `pnpm check` and `pnpm test:int src/db` (conventions). Expect PASS.

- [ ] **Step 6: Commit** `feat(prescription): aerobic exercise kind, distance and intensity`.

---

### Task 2: Aerobic fields through every server path (save, copy, load, history, export)

**Files:**

- Modify: `src/server/routines/mutations.ts` (`saveRoutine` set rows ~:184, `copyRoutine` set
  copy ~:310), `src/server/routines/queries.ts` (`getRoutine` item select: add
  `exerciseKind: exercises.kind`; set select: new columns; `listRecentExercises` adds `kind`),
  `src/server/routines/content.ts` (`ContentItem` gets `exerciseId: string; kind: ExerciseKind`;
  item select adds `exerciseId` (already selected) and `kind: exercises.kind`; set select adds the
  2 columns), `src/server/library/queries.ts` (`ExerciseSummary.kind` + select),
  `src/lib/history/snapshot.ts` (set schema: `distanceMeters: z.number().nullable().default(null)`,
  `intensity: z.string().nullable().default(null)`), `src/lib/history/diff.ts` (`SetField` and
  `SET_FIELDS` += both), `src/components/history/summary-text.tsx` (`HISTORY_FIELDS`),
  `src/components/history/field-change.tsx` (distance renders via `distanceDisplay`),
  `src/server/history/record.ts` (set select), `src/server/export/model.ts` (`SetColumns` +=
  `distance: string | null; intensity: string | null`), `src/server/export/xlsx.ts` (two new
  columns after load; fix `COLUMN_WIDTHS` and the instructions wrap index), messages
  (`History.fields.distanceMeters|intensity`, `Export.xlsx.columns.distance|intensity`).
- Test: extend `src/server/routines/*.int.test.ts` (save + copy round-trip),
  `src/lib/history/snapshot.test.ts`, `src/lib/history/diff.test.ts`,
  `src/server/export/xlsx.test.ts`, `src/server/export/model.test.ts`.

**Interfaces:**

- Consumes: Task 1 `setShape`, `EMPTY_SET`, `ExerciseKind`, `distanceDisplay`.
- Produces: `ContentItem` = `ItemPrescription & { id; exerciseId; kind: ExerciseKind; name;
instructions; sets; media }`. `LoadedItem`/`getRoutine` items carry `exerciseKind`.
  `ExerciseSummary.kind`.

- [ ] **Step 1: Failing tests.**
  - Int: save a routine whose item has one set
    `{ ...EMPTY_SET, durationSeconds: 1800, distanceMeters: 5000, intensity: "Zone 2" }`.
    `getRoutine` returns those fields and `exerciseKind`. `copyRoutine` keeps them.
    `loadRoutineContent` returns `kind` and `exerciseId`.
  - Unit: `routineSnapshotSchema.parse(oldSnapshotWithoutNewFields)` gives
    `distanceMeters: null, intensity: null`. `diffSets` reports a changed `intensity`.
  - Unit: the xlsx item row has the distance ("5 km") and intensity cells. The instructions
    column is still wrapped.
- [ ] **Step 2: Run** the tests. Expect FAIL.
- [ ] **Step 3: Implement** the listed changes. In xlsx, format distance with
      `distanceDisplay` and the export's number formatter (`Intl.NumberFormat(locale)`).
- [ ] **Step 4: Run** `pnpm check` and `pnpm test:int src/server/routines src/server/history
src/server/export`. Expect PASS.
- [ ] **Step 5: Commit** `feat(routines): carry aerobic fields through save, copy, history and export`.

---

### Task 3: Aerobic physio UI (library kind toggle, badges, sets table per kind)

**Files:**

- Modify: `src/server/library/schemas.ts` (`exerciseSchema.kind: z.enum(EXERCISE_KINDS)
.default("strength")`), `src/components/library/exercise-form.tsx` (`ExerciseFormValues.kind`;
  a two-option radio group styled like the existing segmented controls, or shadcn `ToggleGroup` if
  it is in `src/components/ui`, posting `name="kind"`), `src/app/(app)/library/[exerciseId]/page.tsx`
  and `library/new/page.tsx` (default `kind`), `src/components/library/exercise-results.tsx`
  (`Meta`: "Aerobic" badge), `src/lib/routine-editor.ts` (`ExerciseRef.kind`,
  `EditorItem.exerciseKind`, `LoadedItem.exerciseKind`, `newItem`, `fromLoaded`, `copySet` and
  `toSaveBlocks` carry the new set fields), `src/components/routines/exercise-picker.tsx`
  (`toExerciseRef` + badge), `src/components/routines/sets-table.tsx`, `src/components/routines/item-row.tsx`
  (badge), messages (`Library.form.kind.{label,strength,aerobic}`, `Library.kindBadge.aerobic`,
  `Routines.items.sets.{distance,distanceHint,intensity,intensityPlaceholder,durationMinutes,durationHint}`).
- Test: `src/components/routines/sets-table.test.tsx`, `src/components/library/exercise-form.test.tsx`
  (if present; otherwise the library form's existing test file), `src/lib/routine-editor.test.ts`.

**Behaviour of `SetsTable` for `item.exerciseKind === "aerobic"`:**

- Columns are Duration, Distance (km) and Intensity. There are no Reps, Max or Load columns.
- Duration is an `Input` (`inputMode="numeric"`, placeholder "30 or 1:30"). Its text is kept
  locally and parsed with `parseDurationInput` on change. An invalid value shows
  `Prescription.errors.notADuration` (new key) and is not saved. A valid one patches
  `durationSeconds`.
- Distance is an `Input` (`inputMode="decimal"`) using `parseKm`/`metersToKmInput`, with error
  key `notADistance`.
- Intensity is an `Input` with `maxLength=40` and placeholder "Zone 2, RPE 5, 5:30/km". It
  patches `intensity`.
- Strength items render exactly as today.

- [ ] **Step 1: Failing tests.**
  - `SetsTable` with an aerobic item shows inputs labelled "Duration (min)", "Distance (km)" and
    "Intensity", and no "Reps".
  - Typing "2,5" in distance calls `onChange` with `distanceMeters: 2500`.
  - Typing "1:30" in duration gives `durationSeconds: 90`.
  - A strength item still shows Reps.
  - Exercise form: picking Aerobic posts `kind=aerobic`, and the saved exercise has
    `kind: "aerobic"` (int test in `src/server/library/*.int.test.ts`).
- [ ] **Step 2: Run** the tests. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm check`. Expect PASS.
- [ ] **Step 5: Commit** `feat(library): aerobic exercises in the library and routine editor`.

---

### Task 4: Day notes data path (table, board actions, copies, history)

**Files:**

- Modify: `src/lib/plans.ts` (`export const DAY_NOTES_MAX = 500;`), `src/db/schema/plans.ts`
  (new `weeklyPlanDays`), `src/server/plans/schemas.ts` (`setDayNotesSchema`),
  `src/server/plans/mutations.ts` (`setDayNotes`, and `copyPlan` copies day rows),
  `src/server/plans/actions.ts` (`setDayNotesAction`), `src/server/plans/queries.ts`
  (`PlanDetail.dayNotes`), `src/server/phases/mutations.ts` (`copyPlanPhase` copies day rows),
  `src/lib/history/snapshot.ts` (`planSnapshotSchema.days`), `src/server/history/record.ts`
  (`planState` loads days), `src/lib/history/diff.ts` (`PlanDiff.days`), `src/lib/history/summary.ts`,
  `src/components/history/plan-diff-view.tsx`, `src/server/history/mutations.ts`
  (`restorePlanVersion` rewrites day rows), messages (`History.fields.dayNotes`, `Plans.errors.*`
  if needed).
- Generated: `*_plan-day-notes.sql` + `*_plan-day-notes-extras.sql` (trigger only).
- Test: `src/server/plans/plans.int.test.ts`, `src/server/templates/*.int.test.ts`,
  `src/server/phases/*.int.test.ts`, `src/server/history/restore.int.test.ts`,
  `src/lib/history/diff.test.ts`, `src/lib/history/snapshot.test.ts`, RLS test (physio B cannot
  read or write A's `weekly_plan_days`).

**Interfaces:**

```ts
// schema
export const weeklyPlanDays = pgTable("weekly_plan_days", {
  id: uuid().primaryKey().defaultRandom(),
  physioId: physioId(),
  weeklyPlanId: uuid().notNull(),
  weekday: smallint().notNull(),
  notes: text().notNull(),
  ...timestamps,
}, (t) => [
  foreignKey({ name: "weekly_plan_days_plan_fk", columns: [t.physioId, t.weeklyPlanId],
    foreignColumns: [weeklyPlans.physioId, weeklyPlans.id] }).onDelete("cascade"),
  unique("weekly_plan_days_plan_weekday_unique").on(t.physioId, t.weeklyPlanId, t.weekday),
  check("weekly_plan_days_weekday", sql`${t.weekday} between 1 and 7`),
  check("weekly_plan_days_notes_length",
    sql`char_length(${t.notes}) between 1 and ${sql.raw(String(DAY_NOTES_MAX))}`),
  ownRows("weekly_plan_days_own", t.physioId),
]);
// extras migration
// create trigger weekly_plan_days_set_updated_at before update on public.weekly_plan_days
//   for each row execute function public.set_updated_at();

// schemas.ts
export const setDayNotesSchema = z.object({ planId: z.uuid(), weekday, notes: dayNotes });
// dayNotes = trimmed string, max DAY_NOTES_MAX ("tooLong"), blank → null

// mutations.ts
export async function setDayNotes(tx, physioId, input: SetDayNotesInput): Promise<BoardResult>;
// lockPlan → null notes: delete row; else insert … onConflictDoUpdate(target: [physioId, weeklyPlanId, weekday])
// → bumpAndRecord(…) → ok({})

// queries.ts
PlanDetail.dayNotes: Record<number, string>; // weekday → notes (absent = none)

// snapshot.ts
planSnapshotSchema: days: z.array(z.object({ weekday: z.number(), notes: z.string() })).default([])

// diff.ts
PlanDiff.days: { weekday: number; before: string | null; after: string | null }[]
```

- [ ] **Step 1: Failing tests.**
  - Int: `setDayNotes` with "Easy day" → `getPlan(...).dayNotes[3] === "Easy day"`. Saving `""`
    removes it. The plan version is bumped.
  - Int: `copyPlan` (save as template, use template) and `copyPlanPhase` copy the day notes.
  - Int: restoring an older version restores its notes. Restoring a pre-feature snapshot (no
    `days`) clears the notes.
  - Int (RLS): physio B can neither select nor insert A's day row under `runAsPhysio`.
  - Unit: `diffPlans` reports a changed note per weekday. A snapshot without `days` parses with
    `[]`.
- [ ] **Step 2: Run** the tests. Expect FAIL.
- [ ] **Step 3: Implement.** Generate the migrations with `pnpm db:generate --name plan-day-notes`
      and `pnpm db:generate --custom --name plan-day-notes-extras` (trigger SQL above), then run
      `pnpm db:reset`.
- [ ] **Step 4: Run** `pnpm check` and `pnpm test:int src/server/plans src/server/templates
src/server/phases src/server/history src/db`. Expect PASS.
- [ ] **Step 5: Commit** `feat(plans): day notes per weekday`.

---

### Task 5: Day notes UI (plan board, patient page, PDF/XLSX)

**Files:**

- Modify: `src/app/(app)/plans/[planId]/page.tsx` (pass `dayNotes`),
  `src/components/plans/plan-board.tsx` (`DayColumn` header shows the note clamped to 3 lines
  under the day name, plus a note button: `StickyNoteIcon` ghost icon button with label
  `Plans.dayNotes.edit` opening a `Popover` with `PopoverTitle`, a `Textarea` (maxLength 500,
  counter), and Save/Remove buttons; on Save → `run(optimistic, () => setDayNotesAction(...))`),
  `src/server/patient/view.ts` (`PatientPlan.dayNotes: string | null` for the shown weekday,
  read from `weekly_plan_days` for `planRows` ids and `weekday`, scoped by `physioId`),
  `src/components/patient/patient-home.tsx` (render the plan's day note under the plan heading,
  before the entries, also on rest days: `bg-muted rounded-lg p-3 text-sm whitespace-pre-line`
  with an sr-only label `Patient.dayNote`), `src/server/export/model.ts`
  (`SourcePlan.days: {weekday, notes}[]`, `ExportWeekDay.notes: string | null`; `isEmpty` stays
  based on entries), `src/server/export/queries.ts` (`planDays` query + `assemble`),
  `src/server/patient/export.ts` (same, scoped by the link's plan ids),
  `src/server/export/pdf/document.tsx` (`PlanSection`: italic note line under the day's entries),
  `src/server/export/xlsx.ts` (`overviewSheet` gets a third "Notes" column), messages
  (`Plans.dayNotes.{edit,title,placeholder,save,remove,saved}`, `Patient.dayNote`,
  `Export.pdf.dayNote`, `Export.xlsx.overview.notes`).
- Test: `src/components/plans/plan-board.test.tsx`, `src/server/patient/patient.int.test.ts`
  (`getPatientView` returns `dayNotes` for the shown weekday only and never another customer's),
  `src/server/export/model.test.ts`, `src/server/export/xlsx.test.ts`,
  `src/server/patient/export.int.test.ts`.

- [ ] **Step 1: Failing tests.**
  - Board: clicking "Edit note for Wednesday" opens the popover. Typing and saving calls
    `setDayNotesAction({ planId, weekday: 3, notes: "Easy day" })`. The note text shows in the
    column.
  - View: the plan has the note on weekday 3. `getPatientView(..., 3).plans[0].dayNotes` is
    `"Easy day"`, and on weekday 4 it is `null`.
  - Export model: `ExportWeekDay.notes` is set. The XLSX overview row has the note in column 3.
- [ ] **Step 2: Run** the tests. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm check` and the int tests. Expect PASS.
- [ ] **Step 5: Commit** `feat(plans): show day notes on the board, patient page and exports`.

---

### Task 6: RPE on the routine log

**Files:**

- Modify: `src/lib/session-logs.ts` (`RPE_MIN = 0`, `RPE_MAX = 10`,
  `RPE_SCALE`), `src/db/schema/session-logs.ts` (`rpe: smallint()` + check
  `session_logs_rpe_range`), `src/server/patient/log-schema.ts` (`rpe` nullable int 0–10,
  **optional with default null** so old clients still validate), `src/server/patient/log-session.ts`
  (`PatientLog.rpe`; insert/update/returning/select), `src/components/patient/log-session-button.tsx`
  (`RpeScale` under `PainScale`, state `rpe`, sent in the action), `src/server/activity/queries.ts`
  (`ActivityComment.rpe`), `src/components/activity/comments-feed.tsx` (meta shows
  `t("rpeValue", {value})`), messages (`Patient.logging.rpe.{legend,hint,clear,anchors.*}`,
  `Activity.comments.rpeValue`).
- Create: `src/components/patient/rpe-scale.tsx`, `src/components/patient/rpe-scale.test.tsx`
- Generated: `*_session-logs-rpe.sql` + `*_session-logs-rpe-extras.sql`:

```sql
drop trigger session_logs_set_updated_at on public.session_logs;
create trigger session_logs_set_updated_at
  before update on public.session_logs
  for each row
  when (
    row(old.completed, old.pain, old.rpe, old.comment, old.performed_on)
      is distinct from
      row(new.completed, new.pain, new.rpe, new.comment, new.performed_on)
  )
  execute function public.set_updated_at();
```

**`RpeScale` (client):** the same props and structure as `PainScale`
(`{ name, value, onChange }`): native radios 0–10 in a `grid-cols-6` layout, a Clear button, and
the legend "Effort (RPE)". The hint is "How hard was it? 0 = rest, 10 = maximal". The tint uses
the `primary` token (`bg-primary/10` … `bg-primary/60`, as static strings), not `destructive`.
Under the grid, three anchors: 0 "Rest", 5 "Hard", 10 "Max". Namespace `Patient.logging.rpe`.

- [ ] **Step 1: Failing tests.**
  - `rpe-scale.test.tsx`: renders radios "0".."10" in the group "Effort (RPE)". Clicking "6"
    calls `onChange(6)`, and Clear calls `onChange(null)`.
  - `log-session-button.test.tsx`: picking RPE 7 sends `rpe: 7` in the action payload (update
    the existing `toHaveBeenCalledWith` expectations to include `rpe: null`).
  - `log-schema.test.ts`: `rpe` 11 is rejected, and a missing `rpe` parses to null.
  - `log-session.int.test.ts`: the upsert stores `rpe`. Changing only `rpe` bumps `updated_at`.
- [ ] **Step 2: Run** the tests. Expect FAIL.
- [ ] **Step 3: Implement**, then run `pnpm db:generate --name session-logs-rpe`,
      `pnpm db:generate --custom --name session-logs-rpe-extras` (SQL above) and `pnpm db:reset`.
- [ ] **Step 4: Run** `pnpm check` and `pnpm test:int src/server/patient src/server/activity
src/db`. Expect PASS.
- [ ] **Step 5: Commit** `feat(logging): optional RPE on the session log`.

---

### Task 7: Exercise logs, patient write path

**Files:**

- Modify: `src/lib/session-logs.ts` (`WEIGHT_MAX = 999.9`,
  `parseWeight(value: string): number | null | undefined` that accepts `,`, one decimal, 0–999.9,
  and rounds to 0.1), `src/server/patient/actions.ts` (`logExerciseAction`),
  `src/db/schema/index.ts` (export)
- Create: `src/db/schema/exercise-logs.ts`, `src/server/patient/log-exercise.ts`,
  `src/server/patient/log-exercise.int.test.ts`, `src/server/patient/exercise-log-schema.ts`,
  `src/server/patient/exercise-log-schema.test.ts`, `src/lib/session-logs.test.ts` (extend if it
  exists)
- Generated: `*_exercise-logs.sql` + `*_exercise-logs-extras.sql`

**Interfaces:**

```ts
// src/db/schema/exercise-logs.ts
export const exerciseLogs = pgTable(
  "exercise_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: uuid()
      .notNull()
      .references(() => physios.id, { onDelete: "cascade" }),
    customerId: uuid().notNull(),
    shareLinkId: uuid(),
    routineId: uuid().notNull(),
    weeklyPlanEntryId: uuid(),
    exerciseId: uuid().notNull(),
    performedOn: date({ mode: "string" }).notNull(),
    pain: smallint(),
    rpe: smallint(),
    weightKg: numeric({ precision: 5, scale: 1, mode: "number" }), // check drizzle supports mode; else map string→number in reads
    comment: text(),
    seenByPhysioAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "exercise_logs_customer_fk",
      columns: [t.physioId, t.customerId],
      foreignColumns: [customers.physioId, customers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "exercise_logs_routine_fk",
      columns: [t.physioId, t.routineId],
      foreignColumns: [routines.physioId, routines.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "exercise_logs_exercise_fk",
      columns: [t.physioId, t.exerciseId],
      foreignColumns: [exercises.physioId, exercises.id],
    }).onDelete("cascade"),
    unique("exercise_logs_routine_entry_exercise_day_unique")
      .on(t.routineId, t.weeklyPlanEntryId, t.exerciseId, t.performedOn)
      .nullsNotDistinct(),
    index("exercise_logs_customer_idx").on(t.physioId, t.customerId, t.performedOn.desc()),
    index("exercise_logs_routine_idx").on(t.physioId, t.routineId),
    check("exercise_logs_pain_range", sql`${t.pain} between 0 and 10`),
    check("exercise_logs_rpe_range", sql`${t.rpe} between 0 and 10`),
    check("exercise_logs_weight_range", sql`${t.weightKg} between 0 and 999.9`),
    check("exercise_logs_comment_length", sql`char_length(${t.comment}) between 1 and 1000`),
    check(
      "exercise_logs_not_empty",
      sql`num_nonnulls(${t.pain}, ${t.rpe}, ${t.weightKg}, ${t.comment}) > 0`,
    ),
    ownRows("exercise_logs_own", t.physioId),
  ],
);
// extras: composite share_link FK `on delete set null (share_link_id)` (as session_logs_share_link_fk),
// and trigger exercise_logs_set_updated_at … when (row(old.pain, old.rpe, old.weight_kg, old.comment)
//   is distinct from row(new.pain, new.rpe, new.weight_kg, new.comment))

// src/server/patient/exercise-log-schema.ts
export const logExerciseSchema = z.object({
  routineId: z.uuid(),
  entryId: z.uuid().nullable(),
  exerciseId: z.uuid(),
  performedOn: z.string().refine(isCalendarDate),
  pain: z.number().int().min(0).max(10).nullable(),
  rpe: z.number().int().min(0).max(10).nullable(),
  weightKg: z
    .number()
    .min(0)
    .max(WEIGHT_MAX)
    .nullable()
    .transform((v) => (v === null ? null : Math.round(v * 10) / 10)),
  comment: z
    .string()
    .nullable()
    .transform(normalizeComment)
    .pipe(z.string().max(LOG_COMMENT_MAX).nullable()),
});
export type LogExerciseInput = z.output<typeof logExerciseSchema>;

// src/server/patient/log-exercise.ts
export type PatientExerciseLog = {
  routineId: string;
  entryId: string | null;
  exerciseId: string;
  performedOn: string;
  pain: number | null;
  rpe: number | null;
  weightKg: number | null;
  comment: string | null;
};
export type LogExerciseResult =
  | { ok: true; data: PatientExerciseLog | null } // null = cleared
  | { ok: false; error: "date" | "unreachable" };
export async function logExercise(
  shell,
  link,
  input: LogExerciseInput,
  now?: Date,
): Promise<LogExerciseResult>;
// 1. isLoggableDate(input.performedOn, todayIn(tz, now)) else "date"
// 2. isReachable(shell, link, { routineId, entryId }, performedOn) else "unreachable"
// 3. exercise must be in that routine: select 1 from routine_items where physio_id, routine_id, exercise_id
//    else "unreachable"
// 4. all four fields null → delete the row (same key) → { ok: true, data: null }
// 5. else upsert on (routineId, weeklyPlanEntryId, exerciseId, performedOn); seenByPhysioAt reset
//    when the comment changes (same SQL as logSession)
export async function getPatientExerciseLogs(
  shell,
  link,
  from: string,
  to: string,
): Promise<PatientExerciseLog[]>;
// same scoping as getPatientLogs (customer; routine link → routineId; plan link → its entries)

// src/server/patient/actions.ts
export type ExerciseLogActionResult =
  | { ok: true; data: PatientExerciseLog | null }
  | { ok: false; error: "invalid" | "unavailable" | "date" | "unreachable" | "preview" };
export async function logExerciseAction(
  code: string,
  raw: unknown,
): Promise<ExerciseLogActionResult>;
// identical gate to logSessionAction
```

- [ ] **Step 1: Failing tests** (`log-exercise.int.test.ts`, modelled on
      `log-session.int.test.ts`):
  - Saving pain 4, rpe 6, weightKg 12.5 and comment "ok" today stores a row and returns it.
    Saving again with weightKg 15 updates the same row (1 row).
  - Saving with every field null deletes it (0 rows, `data: null`). Saving all-null when no row
    exists is ok and returns `data: null`.
  - An exercise that is not in the routine gives `unreachable`. A routine of another customer
    gives `unreachable`. A date 2 days ago gives `date`.
  - A plan entry that does not hold that routine gives `unreachable`.
  - The same exercise in a plan entry and standalone on the same day gives 2 rows.
  - A changed comment resets `seen_by_physio_at`. The same comment keeps it.
  - `getPatientExerciseLogs` scoped to a routine link excludes other routines' logs.
  - RLS: physio B cannot select A's `exercise_logs` under `runAsPhysio`.
  - `exercise-log-schema.test.ts`: weightKg 1000 is rejected, 12.46 → 12.5, rpe -1 is rejected.
  - `session-logs.test.ts`: `parseWeight("12,5") === 12.5`, `parseWeight("") === null`,
    `parseWeight("abc") === undefined`, `parseWeight("1000") === undefined`.
  - `actions.test.ts`: the owner preview gives `preview`.
- [ ] **Step 2: Run** the tests. Expect FAIL.
- [ ] **Step 3: Implement**, then run `pnpm db:generate --name exercise-logs`,
      `pnpm db:generate --custom --name exercise-logs-extras` and `pnpm db:reset`. If drizzle's
      `numeric` has no `mode: "number"`, keep the default string and map it with `Number()` in every
      select/returning.
- [ ] **Step 4: Run** `pnpm check` and `pnpm test:int src/server/patient src/db`. Expect PASS.
- [ ] **Step 5: Commit** `feat(logging): per-exercise logs from the patient link`.

---

### Task 8: Compact exercise list, exercise detail and exercise log sheet (patient page)

**Files:**

- Create: `src/components/patient/exercise-list.tsx` (client),
  `src/components/patient/exercise-list.test.tsx`, `src/components/patient/exercise-detail.tsx`
  (client), `src/components/patient/exercise-log-button.tsx` (client),
  `src/components/patient/exercise-log-button.test.tsx`
- Modify: `src/components/patient/routine-view.tsx` (replace `BlockView`/`ExerciseCard` with
  `<ExerciseList>`, keep the header, Start/Mark-as-done row and notes; take an optional `exerciseLogging` prop),
  `src/components/patient/patient-home.tsx` (build `exerciseLogging` per routine/entry from the
  week's exercise logs, with the same `days`/`shownDate` as the routine log slot),
  `src/app/(patient)/[handle]/[slug]/page.tsx` (load `getPatientExerciseLogs` for the week in
  parallel with `getPatientLogs`), `src/app/(patient)/[handle]/[slug]/layout.tsx` (add
  `Prescription: all.Prescription` to the client messages), `e2e/sharing.spec.ts` (headings and
  instructions now live in the detail drawer), messages (`Patient.exercise.{open,detailTitle,log,logged,
noVideo,thumbnailAlt}`, `Patient.exerciseLog.{title,weight.{label,hint,invalid},comment.{label,placeholder},
save,clear,close,chips.{pain,rpe,weight},errors.*}`).
- Delete: nothing. `YouTubePreview` is reused.

**Interfaces:**

```ts
// exercise-list.tsx
export type ExerciseLogging = {
  code: string;
  routineId: string;
  entryId: string | null;
  days: LoggableDay[]; // from log-session-button
  shownDate: string;
  logs: PatientExerciseLog[]; // this routine + entry, any day
};
export function ExerciseList(props: {
  blocks: PatientBlock[];
  logging?: ExerciseLogging; // omitted: no Log buttons (owner preview shows chips only via logs if passed with days: [])
  /** Workout mode: the exercise being done (highlighted, aria-current="step") and sets done per item. */
  currentItemId?: string | null;
  doneSets?: Readonly<Record<string, number>>;
  /** Workout mode: called with the row element of currentItemId so the player can scroll it into view. */
  currentRef?: (element: HTMLLIElement | null) => void;
}): JSX.Element;

// exercise-detail.tsx: Drawer below sm (useIsMobile), Dialog from sm. Title = exercise name.
export function ExerciseDetail(props: {
  item: PatientItem;
  prescription: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element;
// Content: YouTubePreview autoPlay (first media; other videos listed below, click-to-play),
// prescription pill, notes, instructions (whitespace-pre-line). No video → muted placeholder.

// exercise-log-button.tsx
export function ExerciseLogButton(props: {
  logging: ExerciseLogging;
  exerciseId: string;
  exerciseName: string;
  /** Open at once (workout bar). */ defaultOpen?: boolean;
  variant?: "row" | "bar";
}): JSX.Element | null;
// Drawer sheet: title "How did {name} go?", optional day toggle (as LogForm), PainScale, RpeScale,
// weight Input (inputMode="decimal", suffix "kg", parseWeight, inline error), comment Textarea,
// Save + "Clear log" (when a log exists). Controlled state; calls logExerciseAction; router.refresh().
```

**Row layout (`ExerciseList`):** an `<ol className="grid gap-2">`. Each item is an `<li>` with
`flex gap-3 rounded-xl border bg-card p-2`:

- A thumbnail `<button>` (`relative w-24 shrink-0 aspect-video overflow-hidden rounded-lg`) with
  `YouTubeThumbnail` and a small play badge. Its aria-label is
  `Patient.exercise.open {name}`. Without video it shows a `bg-muted` box with `DumbbellIcon`.
- A body (`min-w-0 flex-1 grid gap-0.5`):
  - an `<h4>` (`text-sm font-semibold`, position prefix) wrapped in a button that opens the
    detail;
  - a prescription line (`text-muted-foreground text-xs`);
  - notes (`line-clamp-1 text-xs`);
  - logged chips (`Badge variant="secondary"`, e.g. "Pain 3", "RPE 6", "20 kg").
- A trailing `ExerciseLogButton variant="row"`: a ghost icon button `size-10` with a
  `NotebookPenIcon` and the label "Log {name}". It is filled (`text-primary`) when logged.

Supersets wrap their items in the existing dashed bracket with the "Superset · n" header and
rest. Workout mode adds `ring-2 ring-primary bg-primary/5` and `aria-current="step"` to the
current row, and ticks done sets as small dots (`setCount` dots, the first `doneSets` filled).

- [ ] **Step 1: Failing tests.**
  - `exercise-list.test.tsx`: each exercise renders a row with its name and prescription, and
    there is no iframe at first. Clicking "Watch Squat" opens a dialog titled "Squat" containing an
    iframe whose `src` includes the video id and `autoplay=1` (check `youtubeEmbedUrl`; add
    autoplay to the detail embed if missing). A superset renders its "Superset · 2" header.
    `currentItemId` marks that row `aria-current="step"`. Logged chips show "Pain 3" and "12.5 kg"
    (locale-formatted: es → "12,5 kg").
  - `exercise-log-button.test.tsx` (mock `@/server/patient/actions` and `next/navigation` as in
    `log-session-button.test.tsx`): open the sheet, pick pain 4 and RPE 6, type weight "12,5" and
    Save. `logExerciseAction` is called with
    `("7k2m9qpx", { routineId, entryId, exerciseId, performedOn, pain: 4, rpe: 6, weightKg: 12.5, comment: null })`.
    An invalid weight "abc" shows the error and does not call the action. "Clear log" sends all
    nulls. With `days: []` there is no button.
- [ ] **Step 2: Run** the tests. Expect FAIL.
- [ ] **Step 3: Implement.** In `routine-view.tsx`, compute nothing per item server-side; the
      client list formats the prescription with `useTranslations("Prescription")` and
      `formatPrescription`.
- [ ] **Step 4: Update** `e2e/sharing.spec.ts` to the new structure. The exercise name is now an
      h4 inside the row. "Keep your back straight." is hidden until the row's detail opens (click
      "Watch Squat" or the name), then visible in the dialog/drawer.
- [ ] **Step 5: Run** `pnpm check` and `pnpm test:e2e e2e/sharing.spec.ts`. Expect PASS.
- [ ] **Step 6: Commit** `feat(patient): compact exercise list with video detail and exercise logs`.

---

### Task 9: Workout mode, list + bottom bar

**Files:**

- Modify: `src/components/patient/workout/workout-player.tsx` (new layout; logic hooks kept),
  `src/components/patient/workout/workout-player.test.tsx`,
  `src/app/(patient)/[handle]/[slug]/workout/[routineId]/page.tsx` (load today's exercise logs;
  pass `exerciseLogging` built like the page's, `days: owner ? [] : [{ date: today, relative: "today" }]`),
  `e2e/workout.spec.ts`, messages (`Workout.logExercise`, `Workout.current`; remove `noVideo`
  only if unused, in both locales).

**Layout (`fixed inset-0 z-50 flex flex-col`, keep `Shell`):**

1. **Top bar** (`border-b px-2 py-1.5 flex items-center gap-1`): Exit (X, `size-12`), the routine
   name (`truncate text-sm font-semibold flex-1`), sound toggle. Under it, the progress bar
   (unchanged, with the glow).
2. **List** (`min-h-0 flex-1 overflow-y-auto px-4 py-3`): `<ExerciseList blocks={routine.blocks}
currentItemId={step.itemId} doneSets={doneSets} currentRef={...} logging={exerciseLogging} />`.
   `doneSets` is derived from `state.stepIndex`: count the steps before `stepIndex` per `itemId`.
   On `step.exerciseIndex` change, `element.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" })`
   (`reduced` = `useMediaQuery("(prefers-reduced-motion: reduce)")`).
3. **Bottom bar** (`relative border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] grid gap-3`,
   swipe handlers here). `SetDoneBurst` is positioned `absolute bottom-full` over it.
   - Row 1: "Exercise x of y · Set a of b" (bump animation keys kept), the exercise name
     (`font-semibold truncate`), side chip and target chips (`setTargets`, now with distance and
     intensity: add `Workout.target.distanceKm|distanceM|intensity`), and the `role="status"` notice.
   - Row 2, only when `state.endsAt !== null`: the label (Rest/Hold/Time left) and the countdown
     `text-4xl tabular-nums role="timer"`, inline with the +15 s and Skip buttons.
   - Row 3: `[Previous] [primary action, flex-1] [Next]`. The primary action is Set done or Start
     timer; during rest/timed it is Skip. Hold N s sits as an outline button next to it when
     applicable. All buttons are ≥ 48 px (`h-12`/`size-12`).
   - Row 4: `ExerciseLogButton variant="bar"` for the current exercise ("Log exercise"), an
     outline `h-12` button. It is hidden when logging is unavailable.

- Remove the full-screen media, the landscape split and `WIDE_VIDEO_WINDOW`. Videos open from the
  list's thumbnails (the `ExerciseDetail` drawer).
- Keep the finish screen, exit confirm, wake lock, cues, storage and announcements unchanged.

- [ ] **Step 1: Update tests first.**
  - `workout-player.test.tsx`: keep every behavioural assertion (set done, timers, skip, +15 s,
    hold, previous/next, exit confirm, sound, resume, burst, vibrate, finish slot). Replace the
    "heading per exercise" checks with: the current row has `aria-current="step"`, and the bottom
    bar names the exercise.
  - Add a test that the list shows every exercise of the routine.
  - Add a test that resuming at step 2 from sessionStorage highlights exercise 2 (Review focus 5).
  - Add a test that "Log exercise" opens the exercise log sheet for the current exercise.
  - `e2e/workout.spec.ts`: drop the landscape-split assertion. Replace it with "the bottom bar
    stays in view and the list scrolls" (the bar's bounding box bottom ≤ viewport height). Keep
    the 360 px overflow and 48 px checks. The swipe now targets the bottom bar.
- [ ] **Step 2: Run** the tests. Expect FAIL.
- [ ] **Step 3: Implement** the layout.
- [ ] **Step 4: Run** `pnpm check` and `pnpm test:e2e e2e/workout.spec.ts e2e/session-logging.spec.ts`.
      Expect PASS.
- [ ] **Step 5: Commit** `feat(workout): exercise list with a bottom control bar`.

---

### Task 10: Physio Activity tab and dashboard for exercise logs

**Files:**

- Modify: `src/server/activity/queries.ts`
  (`CustomerActivity.exerciseLogs: ActivityExerciseLog[]`, the 50 newest with all fields;
  `unseenExerciseIds`; `getDashboard` loads 14 days of exercise pain and unseen exercise comments),
  `src/server/activity/mutations.ts` (`markExerciseCommentsSeen(tx, physioId, customerId, ids, now)`),
  `src/server/activity/actions.ts` (`markCommentsSeenAction(customerId, ids, exerciseIds = [])`,
  with both validated by `z.array(z.uuid()).max(COMMENTS_LIMIT)`),
  `src/components/activity/mark-comments-seen.tsx` (prop `exerciseIds`),
  `src/components/activity/customer-activity.tsx` (new `ExerciseLogFeed` section after
  `CommentsFeed`; `nothingYet` also considers exercise logs),
  `src/lib/attention.ts` (`needsAttention` input gets `exercisePain: readonly { performedOn: string; pain: number | null }[]`;
  `highPain` uses the max over session and exercise pain in the recent window; `painRise` unchanged),
  `src/lib/dashboard.ts` (`CustomerFacts.exercisePain`; `UnseenSummary.latest.exerciseName?: string | null`),
  `src/components/dashboard/dashboard-view.tsx` (context shows "Routine · Exercise" when
  `exerciseName` is set), messages (`Activity.exercises.{title,description,empty,pain,rpe,weight,new}`,
  `Dashboard.comments.contextExercise`).
- Create: `src/components/activity/exercise-log-feed.tsx` (client, like `CommentsFeed`),
  `src/components/activity/exercise-log-feed.test.tsx`

**Interfaces:**

```ts
export type ActivityExerciseLog = {
  id: string;
  performedOn: string;
  routineName: string;
  exerciseName: string;
  pain: number | null;
  rpe: number | null;
  weightKg: number | null;
  comment: string | null;
  seen: boolean; // true when no comment or already seen
};
```

**`ExerciseLogFeed`:** groups by `performedOn` + `routineName` (heading
"Mon 3 Oct · Knee rehab", `CALENDAR_DATE_FORMAT`), and under it one row per exercise: the name,
then the values "Pain 3/10 · RPE 6 · 20 kg", then the comment (`whitespace-pre-line`) with a
"New" `Badge` when unseen (it keeps the `shownAsNew` behaviour of `CommentsFeed`). Weight uses
`useFormatter().number(value, { maximumFractionDigits: 1 })`. It is a `section` named by its
`h2` "Exercise log".

- [ ] **Step 1: Failing tests.**
  - `attention.test.ts`: exercise pain 8 in the last 7 days with no session pain gives
    `highPain` with pain 8.
  - `dashboard.test.ts`: an unseen exercise comment counts in `newComments`, and `latest` has
    the `exerciseName`.
  - `activity.int.test.ts`: `getCustomerActivity` returns the exercise logs with names (newest
    first). `markExerciseCommentsSeen` marks only the given ids of that customer.
    `getDashboard` puts a customer with exercise pain 8 under attention.
  - `exercise-log-feed.test.tsx`: renders the group heading, the values and the "New" badge.
- [ ] **Step 2: Run** the tests. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm check` and `pnpm test:int src/server/activity`. Expect PASS.
- [ ] **Step 5: Commit** `feat(activity): exercise logs and RPE for the physio`.

---

### Task 11: End-to-end flows, docs

**Files:**

- Create: `e2e/patient-v2.spec.ts`
- Modify: `e2e/helpers/patient.ts` (allow `kind` and aerobic sets in `insertRoutine`'s exercise;
  add `insertDayNote(physioId, planId, weekday, notes)`), `e2e/session-logging.spec.ts` (RPE
  pick), `docs/architecture.md` (domain model: `exercise_logs`, `weekly_plan_days`; ER diagram
  lines; prescription model mentions distance/intensity and exercise kind; decisions log row
  "Patient input" adds RPE and per-exercise logs), `docs/specs/19-patient-page-v2.md` (Status
  Done, acceptance boxes, "Decisions made during implementation"), `docs/specs/README.md` (row 19
  Done, mermaid `10 --> 19`).

**E2E (mobile + desktop projects):**

1. **Exercise log.** The patient opens a link, sees the list with the "Squat" row, and taps
   "Log Squat". They pick pain 4 and RPE 6, type weight 12.5 and comment "Felt fine", and save.
   The row shows "Pain 4" and "12.5 kg". The physio signs in and opens Activity: "Exercise log"
   shows "Felt fine" with "New".
2. **RPE.** "Mark as done", RPE 7, Save. The Activity comments feed (with a comment) shows "RPE 7".
3. **Day note.** The physio opens the plan board, edits Wednesday's note "Easy day" and saves.
   The patient opens `?day=3` and sees "Easy day".
4. **Aerobic.** The physio creates the exercise "Rowing" as Aerobic and adds it to a routine with
   4 sets of 500 m at "2:00/500m". The patient page row shows "4 × 500 m · 2:00/500m".
5. **Video detail.** Tapping a thumbnail opens a dialog containing an iframe (no network
   assertion on YouTube).

- [ ] **Step 1: Write the e2e spec.** Run `pnpm test:e2e e2e/patient-v2.spec.ts`. Fix until
      green.
- [ ] **Step 2: Full verification.** `pnpm check`, `pnpm test:int`, `pnpm test:e2e`.
- [ ] **Step 3: Update the docs** as listed.
- [ ] **Step 4: Commit** `test(e2e): patient page v2 flows` and `docs: spec 19 done`.
