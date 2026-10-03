# Inline Exercise Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the exercise log bottom sheet with an inline, autosaving section per exercise
row (weight per set, RPE, comment), and make the "Mark as done" sheet's pain/RPE compact and last.

**Architecture:** `exercise_logs` gains `set_weights_kg numeric(5,1)[]`. The patient action takes
`setWeightsKg` instead of `pain`/`weightKg`. `ExerciseList` owns which rows have their log open
(controllable, so the workout bar can open the current one) and a shared store of logs saved on
this page (chips follow at once). Each open row renders `ExerciseLogPanel`, which autosaves via a
generic `useAutosave` hook (debounce, flush on blur/unmount, serial saves, latest wins, retry).

**Tech Stack:** Next.js 16, React 19, next-intl, Drizzle + Supabase Postgres, Vitest + Testing
Library, Playwright.

**Spec:** `docs/specs/20-inline-exercise-log.md` (read it first; also spec 19 for context).

## Global Constraints

- Node: prefix shell commands with `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`.
- Every user-visible string in **both** `messages/en.json` and `messages/es.json` (Rioplatense
  voseo). `src/i18n/messages.test.ts` fails on missing/extra keys or mismatched ICU args.
- Numbers formatted with next-intl `useFormatter`, never hard-coded locales.
- Accent colour via the `primary` token only.
- Use shadcn primitives (`Input`, `Textarea`, `Label`, `Button`) — no bare inputs with copied
  classes. The scales stay custom radio widgets.
- Migrations: `pnpm db:generate` from `src/db/schema/`; hand-written SQL only in a separate
  custom migration (`pnpm exec drizzle-kit generate --custom --name <name>`).
- Patient writes only in `src/server/patient/`; every id derived from the resolved link.
- `WEIGHT_MAX = 999.9`; new `SET_WEIGHTS_MAX = 20` (most set lines a log holds).
- Autosave delay: 800 ms (`AUTOSAVE_DELAY_MS` in `src/components/patient/use-autosave.ts`).
- Run `pnpm check` before every commit. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Patient types a weight and collapses the row / switches day / leaves within 800 ms → the
   change is still saved (flush on unmount), to the day it was typed for.
2. A save fails (offline) → typed values stay, "Couldn't save" + Retry shows; the next edit or
   Retry saves the latest values.
3. Saves overlap (edit, pause, edit again while the first is in flight) → requests are serial
   and the stored row ends up with the latest values, never an older one.
4. Half-typed decimals ("12,", ".5") parse; garbage ("abc") marks the input invalid and nothing
   is sent until fixed.
5. A physio previewing (no loggable days) sees chips but no toggle and never writes.

Tests pinning each: 1 → Task 4 (unmount flush) + Task 5 (collapse, day switch); 2 → Task 4
(error/retry) + Task 5; 3 → Task 4 (serial); 4 → Task 2 (`parseWeight` exists) + Task 5
(invalid); 5 → Task 5.

---

### Task 1: Database column, constraints, data migration

**Files:**

- Modify: `src/lib/session-logs.ts` (add `SET_WEIGHTS_MAX`)
- Modify: `src/db/schema/exercise-logs.ts`
- Create (generated): `supabase/migrations/<ts>_exercise-log-set-weights.sql` + meta snapshot
- Create (custom): `supabase/migrations/<ts>_exercise-log-set-weights-extras.sql`
- Test: `src/server/patient/log-exercise.int.test.ts` (DB-level cases) or a new
  `src/db/exercise-logs.int.test.ts` if the existing file has no raw-SQL helpers

**Interfaces:**

- Produces: `exerciseLogs.setWeightsKg` column, type `(number | null)[] | null`;
  `SET_WEIGHTS_MAX = 20` exported from `src/lib/session-logs.ts`.

- [ ] **Step 1: Add the constant**

```ts
// src/lib/session-logs.ts, after WEIGHT_MAX
/** Most set lines one exercise log holds (prescribed sets plus extras the patient adds). */
export const SET_WEIGHTS_MAX = 20;
```

- [ ] **Step 2: Schema column and checks**

In `exercise-logs.ts` add after `weightKg`:

```ts
    /** Weight per set (index = set position); null elements are sets not logged (spec 20). */
    setWeightsKg: numeric({ precision: 5, scale: 1, mode: "number" }).array(),
```

Add checks (import `SET_WEIGHTS_MAX`):

```ts
    check(
      "exercise_logs_set_weights_range",
      sql`0 <= all(${t.setWeightsKg}) and ${sql.raw(String(WEIGHT_MAX))} >= all(${t.setWeightsKg})`,
    ),
    check(
      "exercise_logs_set_weights_length",
      sql`cardinality(${t.setWeightsKg}) between 1 and ${sql.raw(String(SET_WEIGHTS_MAX))}`,
    ),
```

and change `exercise_logs_not_empty` to
`num_nonnulls(${t.pain}, ${t.rpe}, ${t.weightKg}, ${t.setWeightsKg}, ${t.comment}) > 0`.

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate --name exercise-log-set-weights` (or `pnpm exec drizzle-kit generate
--name exercise-log-set-weights`). Inspect SQL: `ADD COLUMN set_weights_kg numeric(5,1)[]`,
drop/re-add `exercise_logs_not_empty`, two new checks.

- [ ] **Step 4: Custom migration (data copy + trigger)**

`pnpm exec drizzle-kit generate --custom --name exercise-log-set-weights-extras`, content:

```sql
-- Spec 20: one weight per set. Existing single weights become a one-set log.
update public.exercise_logs
  set set_weights_kg = array[weight_kg]
  where weight_kg is not null and set_weights_kg is null;

-- updated_at means "the patient last changed this log": set weights count too.
drop trigger exercise_logs_set_updated_at on public.exercise_logs;
create trigger exercise_logs_set_updated_at
  before update on public.exercise_logs
  for each row
  when (
    row(old.pain, old.rpe, old.weight_kg, old.set_weights_kg, old.comment)
      is distinct from
      row(new.pain, new.rpe, new.weight_kg, new.set_weights_kg, new.comment)
  )
  execute function public.set_updated_at();
```

- [ ] **Step 5: Integration tests (write, run `pnpm db:reset` then `pnpm test:int <file>`)**

Cases (raw inserts through `db` as owner, like the existing int tests):

- inserting `setWeightsKg: [20, null, 25]` round-trips as `[20, null, 25]` (numbers, not strings
  — if postgres-js returns strings, add a `customType` or map in queries and note it in the spec's
  decisions);
- `setWeightsKg: [1000]` → check violation; `[-1]` → violation; `[]` → violation; 21 elements →
  violation;
- a row with only `setWeightsKg` satisfies `exercise_logs_not_empty`;
- updating only `set_weights_kg` bumps `updated_at`; updating `seen_by_physio_at` does not.

The data-copy statement is covered by reading the migration; optionally assert in a test by
inserting `weight_kg` only, running the `update` SQL, and checking the array.

- [ ] **Step 6: Commit** — `feat(db): exercise_logs.set_weights_kg (spec 20)`

---

### Task 2: Patient input schema, server write and read

**Files:**

- Modify: `src/lib/session-logs.ts` (add `normalizeSetWeights`)
- Modify: `src/server/patient/exercise-log-schema.ts` (+ `.test.ts`)
- Modify: `src/server/patient/log-exercise.ts` (+ `.int.test.ts`)
- Modify: `src/server/patient/actions.test.ts` (input shape)
- Modify: `src/server/activity/queries.ts` (select `setWeightsKg`) — type only here; UI in Task 7

**Interfaces:**

- Produces:
  - `normalizeSetWeights(values: readonly (number | null)[] | null): (number | null)[] | null`
    — rounds to 0.1, trims trailing nulls, `[]`/all-null → `null`.
  - `LogExerciseInput = { routineId; entryId; exerciseId; performedOn; rpe: number | null;
setWeightsKg: (number | null)[] | null; comment: string | null }` (no `pain`, no `weightKg`).
  - `PatientExerciseLog = { routineId; entryId; exerciseId; performedOn; rpe: number | null;
setWeightsKg: (number | null)[] | null; comment: string | null }`.
  - `ActivityExerciseLog` gains `setWeightsKg: (number | null)[] | null` (keeps `pain`, `weightKg`).

- [ ] **Step 1: Failing unit tests**

```ts
// session-logs.test.ts (create the describe if missing)
describe("normalizeSetWeights", () => {
  it("trims trailing empty sets and rounds", () => {
    expect(normalizeSetWeights([20.04, null, 25, null, null])).toEqual([20, null, 25]);
  });
  it("is null when nothing is logged", () => {
    expect(normalizeSetWeights([null, null])).toBeNull();
    expect(normalizeSetWeights([])).toBeNull();
    expect(normalizeSetWeights(null)).toBeNull();
  });
});

// exercise-log-schema.test.ts
it("accepts set weights and normalises them", () => {
  const parsed = logExerciseSchema.parse({ ...base, setWeightsKg: [20, null, 22.55, null] });
  expect(parsed.setWeightsKg).toEqual([20, null, 22.6]);
});
it("rejects weights out of range and too many sets", () => {
  expect(logExerciseSchema.safeParse({ ...base, setWeightsKg: [1000] }).success).toBe(false);
  expect(logExerciseSchema.safeParse({ ...base, setWeightsKg: [-1] }).success).toBe(false);
  expect(logExerciseSchema.safeParse({ ...base, setWeightsKg: Array(21).fill(1) }).success).toBe(
    false,
  );
});
it("no longer takes pain or a single weight", () => {
  const parsed = logExerciseSchema.parse({ ...base, pain: 3, weightKg: 5 });
  expect(parsed).not.toHaveProperty("pain");
  expect(parsed).not.toHaveProperty("weightKg");
});
```

(`base` = the existing valid input minus `pain`/`weightKg`, plus `setWeightsKg: null`.) Update the
existing tests in that file that pass `pain`/`weightKg`.

- [ ] **Step 2: Implement**

```ts
// src/lib/session-logs.ts
/** Set weights as stored: rounded to 0.1, no trailing unlogged sets, null when none is logged. */
export function normalizeSetWeights(
  values: readonly (number | null)[] | null,
): (number | null)[] | null {
  if (!values) return null;
  const rounded = values.map((v) => (v === null ? null : Math.round(v * 10) / 10));
  while (rounded.length > 0 && rounded.at(-1) === null) rounded.pop();
  return rounded.length === 0 ? null : rounded;
}
```

```ts
// exercise-log-schema.ts: replace pain + weightKg with
  setWeightsKg: z
    .array(z.number().min(0).max(WEIGHT_MAX).nullable())
    .max(SET_WEIGHTS_MAX)
    .nullable()
    .transform(normalizeSetWeights),
```

Update the doc comment ("All three measures null means clear").

`log-exercise.ts`: `patientColumns` drops `pain`/`weightKg`, adds `setWeightsKg`; the clear test is
`input.rpe === null && input.setWeightsKg === null && input.comment === null`; insert and
`onConflictDoUpdate.set` write `rpe`, `setWeightsKg`, `comment`, and **`pain: null, weightKg:
null`** (an edited legacy log is replaced by what the patient now sees). Update the doc comments.

`activity/queries.ts`: add `setWeightsKg: exerciseLogs.setWeightsKg` to the select and type.

- [ ] **Step 3: Integration tests** — update `log-exercise.int.test.ts` `input()` defaults
      (`setWeightsKg: null`, no pain/weightKg) and existing assertions; add:
- saves `[20, null, 25]`, returns it; re-saving `[22]` overwrites;
- saving a legacy row (insert `pain: 5, weightKg: 10` directly) through `logExercise` with
  `setWeightsKg: [12]` leaves `pain` and `weight_kg` null;
- `rpe/setWeightsKg/comment` all null deletes the row.

Run: `pnpm test src/server/patient src/lib` and `pnpm test:int src/server/patient/log-exercise`.

- [ ] **Step 4: Fix typecheck fallout** — `pnpm typecheck` will flag UI files using
      `log.pain`/`log.weightKg` on `PatientExerciseLog` (`exercise-list.tsx`, `exercise-log-button.tsx`
      and tests). Make the minimum change to compile: chips drop pain; replace the weight chip with set
      weights joined (`log.setWeightsKg`) — the real UI lands in Task 5; the sheet form may temporarily
      send `setWeightsKg: weightKg === null ? null : [weightKg]`. Keep `pnpm check` green.

- [ ] **Step 5: Commit** — `feat(patient): exercise logs take set weights instead of pain/weight`

---

### Task 3: Compact scales; "Mark as done" order

**Files:**

- Modify: `src/components/patient/pain-scale.tsx`, `rpe-scale.tsx` (+ `rpe-scale.test.tsx`)
- Modify: `src/components/patient/log-session-button.tsx` (+ `.test.tsx`)

**Interfaces:** unchanged props (`name`, `value`, `onChange`).

- [ ] **Step 1: Failing tests**
- `rpe-scale.test.tsx`: the 11 radios sit in a single row container
  (`expect(within(group).getAllByRole("radio")).toHaveLength(11)` plus the container has class
  `grid-cols-11`), descriptor still shown for a value.
- `log-session-button.test.tsx`: after opening the sheet, the DOM order is comment textbox, then
  the pain group, then the RPE group:

```ts
const comment = screen.getByLabelText("Comment (optional)");
const pain = screen.getByRole("group", { name: "Pain (optional)" });
const rpe = screen.getByRole("group", { name: /Effort/ });
expect(comment.compareDocumentPosition(pain) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
expect(pain.compareDocumentPosition(rpe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
```

(Use the real labels from `messages/en.json` → `Patient.logging`.)

- [ ] **Step 2: Implement**
- Both scales: container `grid grid-cols-11 gap-1`; tile classes `h-9 rounded-md text-sm
font-semibold` (was `h-12 rounded-lg text-base`); hint/descriptor text `text-xs`. Update the
  PainScale doc comment ("one compact row").
- `LogForm` in `log-session-button.tsx`: render order DayToggle → comment → PainScale → RpeScale →
  error → buttons. Comment textarea `rows={2}`/`min-h-20` is fine.

- [ ] **Step 3: Run** `pnpm test src/components/patient` → PASS. **Commit**
      `feat(patient): compact pain/RPE scales, last in the "Mark as done" sheet`

---

### Task 4: `useAutosave` hook

**Files:**

- Create: `src/components/patient/use-autosave.ts`
- Test: `src/components/patient/use-autosave.test.tsx`

**Interfaces:**

- Produces:

```ts
export const AUTOSAVE_DELAY_MS = 800;
export type AutosaveStatus = "idle" | "saving" | "saved" | "error";
type Result<T, E extends string> = { ok: true; data: T } | { ok: false; error: E };
export function useAutosave<V, T, E extends string>(options: {
  save: (values: V) => Promise<Result<T, E>>;
  onSaved: (data: T, values: V) => void;
  delay?: number;
}): {
  status: AutosaveStatus;
  error: E | "generic" | null;
  /** Queue values; sent `delay` ms after the last call. */
  schedule: (values: V) => void;
  /** Send queued values now (blur). */
  flush: () => void;
  /** Re-send the values of the failed save (unless newer ones are queued). */
  retry: () => void;
};
```

Semantics: one request at a time; while one is in flight, `schedule`/`flush` only replace the
queued values, and when it settles the latest queued values (if any) are sent at once. On unmount
queued values are sent (fire-and-forget; `onSaved` still runs — callers write to parent state).
`save` throwing → error `"generic"`. Status `saved` after the last request succeeds with nothing
queued.

- [ ] **Step 1: Failing tests** (`vi.useFakeTimers()`, a test component calling the hook, or
      `renderHook` from Testing Library):

1. `schedule(a)`, advance 799 ms → `save` not called; advance 1 ms → called with `a`.
2. `schedule(a)`, `schedule(b)` within the delay → one call with `b`.
3. `schedule(a)`, `flush()` → called immediately with `a`.
4. Serial: `save` returns a deferred promise; `schedule(a)` + flush → in flight; `schedule(b)`,
   `schedule(c)`, flush → still 1 call; resolve first → second call with `c` only; total 2 calls.
5. Error: save resolves `{ ok: false, error: "date" }` → `status === "error"`, `error === "date"`;
   `retry()` → called again with the same values; resolves ok → `status === "saved"`.
6. Throwing save → `error === "generic"`.
7. Unmount with queued values → save called with them; `onSaved` called after resolve.
8. `onSaved(data, values)` receives the values that were sent.

- [ ] **Step 2: Implement** with refs for `queued`, `timer`, `inFlight`, `lastFailed` and the
      latest `save`/`onSaved` (assigned in an effect or a ref updated each render), `useState` for
      status/error. Sketch:

```ts
const run = useCallback(() => {
  if (inFlight.current || queued.current === undefined) return;
  const values = queued.current;
  queued.current = undefined;
  inFlight.current = true;
  setStatus("saving");
  void (async () => {
    let result: Result<T, E>;
    try {
      result = await saveRef.current(values);
    } catch {
      result = { ok: false, error: "generic" as E };
    }
    inFlight.current = false;
    if (result.ok) {
      lastFailed.current = undefined;
      setError(null);
      onSavedRef.current(result.data, values);
    } else {
      lastFailed.current = values;
      setError(result.error);
    }
    if (queued.current !== undefined) run();
    else setStatus(result.ok ? "saved" : "error");
  })();
}, []);
```

(`"generic"` cast: type the error state as `E | "generic"`; keep the cast local.) `schedule`
clears and restarts the timer; `flush` clears it and calls `run`; `retry` sets `queued.current ??=
lastFailed.current` then `run`; unmount effect clears the timer and calls `run`.

- [ ] **Step 3: Run** `pnpm test src/components/patient/use-autosave` → PASS. **Commit**
      `feat(patient): useAutosave hook (debounce, serial, retry, flush on unmount)`

---

### Task 5: Inline `ExerciseLogPanel` in the exercise list

**Files:**

- Create: `src/components/patient/exercise-log-panel.tsx` (+ `.test.tsx`)
- Create: `src/components/patient/set-targets.ts` (moved from `workout/workout-player.tsx`)
- Modify: `src/components/patient/exercise-list.tsx` (+ `.test.tsx`)
- Delete: `src/components/patient/exercise-log-button.tsx` and its test (move `exerciseLogFor`
  into `exercise-log-panel.tsx`)
- Modify: `src/components/patient/workout/workout-player.tsx` (import `setTargets` from the new
  file; the bar button is Task 6 — until then, remove its `ExerciseLogButton` usage only if it
  blocks compiling, and restore behaviour in Task 6)
- Modify: `messages/en.json`, `messages/es.json`

**Interfaces:**

- Consumes: `useAutosave` (Task 4); `PatientExerciseLog`, `logExerciseAction` (Task 2);
  `parseWeight`, `WEIGHT_MAX`, `SET_WEIGHTS_MAX`, `LOG_COMMENT_MAX` (`src/lib/session-logs.ts`);
  `DayToggle`, `useLogDay`, `useSavedLogs`, `LoggableDay` (`log-sheet.tsx`); `RpeScale`.
- Produces:

```ts
// set-targets.ts
export function setTargets(set: SetPrescription | undefined, t: WorkoutTranslate): string[];
// exercise-log-panel.tsx
export function exerciseLogFor(logs: readonly PatientExerciseLog[], exerciseId: string, date: string): PatientExerciseLog | null;
/** "20" from "20", "20 kg", "12,5kg"; null for anything else ("light band", "BW+5"). */
export function numericLoad(load: string | null): number | null;
export function ExerciseLogPanel(props: {
  id: string;                    // DOM id for aria-controls
  item: PatientItem;
  logging: ExerciseLogging;
  logFor: (date: string) => PatientExerciseLog | null;
  remember: (date: string, log: PatientExerciseLog | null) => void;
}): JSX.Element | null;
// exercise-list.tsx: ExerciseList gains
  openLogs?: ReadonlySet<string>;              // item ids, controlled
  onOpenLogsChange?: (ids: ReadonlySet<string>) => void;
```

**i18n** (`Patient.exerciseLog`, both locales). Remove: `weight.*`, `save`, `clear`, `close`,
`chips.pain`, `chips.weight`. Keep `title` (used as the panel's `aria-label`), `comment.*`,
`errors.*`, `chips.rpe`. Add:

| key             | en                                               | es                                            |
| --------------- | ------------------------------------------------ | --------------------------------------------- |
| `sets.legend`   | `Weight per set`                                 | `Peso por serie`                              |
| `sets.set`      | `Set {number, number}`                           | `Serie {number, number}`                      |
| `sets.input`    | `Set {number, number} weight in kg`              | `Peso de la serie {number, number} en kg`     |
| `sets.add`      | `Add set`                                        | `Agregar serie`                               |
| `sets.invalid`  | `Enter a weight between 0 and {max, number} kg.` | `Ingresá un peso entre 0 y {max, number} kg.` |
| `status.saving` | `Saving…`                                        | `Guardando…`                                  |
| `status.saved`  | `Saved`                                          | `Guardado`                                    |
| `status.error`  | `Couldn't save.`                                 | `No se pudo guardar.`                         |
| `retry`         | `Retry`                                          | `Reintentar`                                  |
| `chips.weights` | `{value} kg`                                     | `{value} kg`                                  |

(The `{value}` of `chips.weights` is a pre-formatted string like "20 · 22.5 · 25".)

- [ ] **Step 1: Move `setTargets`** to `set-targets.ts` unchanged (export it and its
      `Translate` type for the `Workout` namespace); workout-player imports it. `pnpm test
src/components/patient/workout` still passes.

- [ ] **Step 2: Failing panel tests** (`exercise-log-panel.test.tsx`; mock
      `@/server/patient/actions` → `logExerciseAction`; fake timers with
      `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`; a 3-set strength item with
      `load: "20 kg"` on set 1 and an aerobic item):

1. Renders one input per prescribed set labelled "Set 1 weight in kg"… with the set targets
   visible ("12 reps"); set 1 placeholder "20" (from the load); after typing "22,5" in set 1,
   set 2's placeholder is "22.5" (formatted with the locale).
2. Typing "22,5" in set 1 and "25" in set 3 then waiting 800 ms → one call with
   `setWeightsKg: [22.5, null, 25]`, `rpe: null`, `comment: null`, `performedOn: TODAY`; status
   "Saved" shows; `remember` called with the returned log.
3. Blur flushes without waiting.
4. Picking RPE 6 saves `rpe: 6`; comment typed saves trimmed text; empty comment → `null`.
5. "abc" in a set → input `aria-invalid`, the invalid message shows, nothing sent; fixing it sends.
6. Clearing every field of a prefilled log sends all nulls (the server deletes).
7. Action resolves `{ ok: false, error: "date" }` → "Couldn't save." + the `errors.date` text +
   Retry button; Retry re-sends.
8. "Add set" adds "Set 4"; disabled at 20 lines.
9. Aerobic item: no set inputs, RPE and comment only.
10. Unmount (rerender without the panel) after typing within 800 ms → sent.
11. With two days, switching to Yesterday after typing sends the typed values with today's date,
    then shows yesterday's log (remounts by `key={day.date}`).
12. Spanish: labels in es, initial weight `12.5` rendered as "12,5".

- [ ] **Step 3: Implement `ExerciseLogPanel`**

Structure (inside the row's card, full width, below the row content):

```tsx
export function ExerciseLogPanel({ id, item, logging, logFor, remember }: Props) {
  const { day, select } = useLogDay(logging.days, logging.shownDate);
  if (!day) return null;
  return (
    <section
      id={id}
      aria-label={t("exerciseLog.title", { name: item.name })}
      className="grid gap-4 border-t pt-3"
    >
      <DayToggle days={logging.days} value={day.date} onChange={select} />
      {/* Fresh fields per day; unmounting the old one flushes its pending save. */}
      <LogFields
        key={day.date}
        item={item}
        logging={logging}
        date={day.date}
        initial={logFor(day.date)}
        onSaved={(log) => remember(day.date, log)}
      />
    </section>
  );
}
```

`LogFields` state: `weights: string[]` (initial: saved `setWeightsKg` formatted with
`format.number(v, { useGrouping: false, maximumFractionDigits: 1 })`, `""` for nulls, padded to
`lineCount`), `lines: number` = `max(item.sets.length, saved length, 1)` for strength, `0` for
`item.kind === "aerobic"`; `rpe`, `comment`, `invalid: Set<number>`.
`useAutosave<LogValues, PatientExerciseLog | null, LogError>({ save: (v) => logExerciseAction(
logging.code, v), onSaved: (log) => onSaved(log) })`.

On every change, compute `values` from the next state: `setWeightsKg = weights.map(parseWeight)`;
if any is `undefined` → mark those indexes invalid, don't schedule; else
`schedule({ routineId, entryId, exerciseId: item.exerciseId, performedOn: date, rpe,
setWeightsKg, comment: comment.trim() === "" ? null : comment })`. Blur of any input/textarea and
RPE changes call `flush()` right after scheduling (RPE is a discrete choice: save at once).

Set line markup (shadcn `Input`, `Label` sr-only via aria-label is fine):

```tsx
<fieldset className="grid gap-2">
  <legend className="text-sm font-medium">{t("exerciseLog.sets.legend")}</legend>
  <ol className="grid gap-2">
    {Array.from({ length: lines }, (_, index) => (
      <li key={index} className="flex items-center gap-3">
        <span className="w-14 text-sm font-medium">{t("exerciseLog.sets.set", { number: index + 1 })}</span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{targets(index).join(" · ")}</span>
        <div className="relative w-28">
          <Input ref={(el) => (inputs.current[index] = el)} type="text" inputMode="decimal"
            enterKeyHint={index < lines - 1 ? "next" : "done"} autoComplete="off"
            aria-label={t("exerciseLog.sets.input", { number: index + 1 })}
            aria-invalid={invalid.has(index) || undefined}
            placeholder={placeholder(index)} value={weights[index] ?? ""}
            onChange={...} onBlur={flush}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); inputs.current[index + 1]?.focus() ?? e.currentTarget.blur(); } }}
            className="h-11 pr-9 text-base" />
          <span aria-hidden className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">kg</span>
        </div>
      </li>
    ))}
  </ol>
  {invalid.size > 0 ? <p className="text-destructive text-xs">{t("exerciseLog.sets.invalid", { max: WEIGHT_MAX })}</p> : null}
  <Button type="button" variant="ghost" size="sm" className="justify-self-start"
    disabled={lines >= SET_WEIGHTS_MAX} onClick={() => setLines((n) => n + 1)}>
    <PlusIcon aria-hidden /> {t("exerciseLog.sets.add")}
  </Button>
</fieldset>
```

`targets(index)` = `setTargets(item.sets[index], tWorkout)` (extra lines: none).
`placeholder(index)` = previous line's parsed value (formatted) if valid and non-null, else
`numericLoad(item.sets[index]?.load ?? null)` formatted, else `""`.

Then `<RpeScale name={`${id}-rpe`} …/>`, then comment (`Label` + `Textarea`, `rows={2}`,
`maxLength={LOG_COMMENT_MAX}`, `onBlur={flush}`), then the status line with `aria-live="polite"`:
saving → `status.saving`; saved → `status.saved` (with a `CheckIcon`); error →
`status.error` + `errors.<code>` + `Button variant="link" onClick={retry}` `retry`. Nothing when
idle. No form element / submit.

`numericLoad`: `/^\s*(\d+(?:[.,]\d+)?)\s*(?:kg)?\s*$/i` → `parseWeight(match[1])`, else null.

- [ ] **Step 4: Wire `ExerciseList`**

- `ExerciseList` keeps `const [ownOpen, setOwnOpen] = useState<ReadonlySet<string>>(new Set())`;
  `open = props.openLogs ?? ownOpen`; `setOpen = props.onOpenLogsChange ?? setOwnOpen`.
- Lift the saved-log store: `const saved = useSavedLogs<PatientExerciseLog>(...)` keyed by
  `${exerciseId}|${date}` — extend the call as
  `useSavedLogs((key) => { const [exerciseId, date] = key.split("|"); return exerciseLogFor(logging.logs, exerciseId, date); })`
  and pass `logFor = (date) => saved.logFor(`${item.exerciseId}|${date}`)`,
  `remember = (date, log) => saved.remember(`${item.exerciseId}|${date}`, log)` to each row.
- `ExerciseRow`: wrap the existing content in a column so the panel can span the card:
  `<li className="bg-card grid gap-2 rounded-xl border p-2 …"><div className="flex gap-3">…existing…</div>{expanded ? <ExerciseLogPanel …/> : null}</li>`.
- Chips come from `logFor(logging.shownDate)`: set weights (`"–"` for null) →
  `t("exerciseLog.chips.weights", { value })`, then RPE.
- The toggle replaces `ExerciseLogButton` (shown only when `logging.days.length > 0`):

```tsx
<Button
  type="button"
  variant={expanded ? "secondary" : "ghost"}
  size="icon"
  aria-expanded={expanded}
  aria-controls={panelId}
  aria-label={t("exercise.log", { name: item.name })}
  title={t("exercise.log", { name: item.name })}
  className={cn("size-12 flex-none self-center", logged && "text-primary")}
  onClick={() => onToggle(item.id)}
>
  <NotebookPenIcon aria-hidden className={cn("size-5", logged && "stroke-[2.5]")} />
</Button>
```

- Update `exercise-list.test.tsx`: toggle has `aria-expanded` false → true and shows the panel
  region "How did Squat go?"; collapsing hides it; chips show "20 · – · 25 kg" and "RPE 7" for a
  saved log with `setWeightsKg: [20, null, 25], rpe: 7`; a save in the panel updates the chips
  without a refresh; no toggle when `days` is empty (chips still shown); controlled `openLogs`
  opens the given row.

- [ ] **Step 5: Run** `pnpm check` → PASS. **Commit**
      `feat(patient): inline autosaving exercise log (weight per set, RPE, comment)`

---

### Task 6: Workout bar opens the inline log

**Files:**

- Modify: `src/components/patient/workout/workout-player.tsx` (+ `.test.tsx`)

**Interfaces:** consumes `ExerciseList` `openLogs`/`onOpenLogsChange` (Task 5).

- [ ] **Step 1: Failing test** in `workout-player.test.tsx`: clicking "Log exercise" opens the
      current exercise's panel (region "How did Squat go?" visible, its row toggle `aria-expanded`
      true), no dialog in the document; clicking it again collapses it.
- [ ] **Step 2: Implement**: `const [openLogs, setOpenLogs] = useState<ReadonlySet<string>>(new
Set())`; pass both to `ExerciseList`. The bar button (same look as the old bar variant: outline,
      `h-12 w-full text-base`, `NotebookPenIcon`, label `Workout.logExercise`, `aria-expanded`) toggles
      `item.id` in the set and, when opening, scrolls `currentRow.current` into view
      (`block: "start"`, smooth unless reduced motion) after the state commits (`requestAnimationFrame`).
      Remove the swipe guard comment's sheet mention only if the portal case no longer exists (keep
      `onBar`; the panel is inside the list, not the bar).
- [ ] **Step 3: Run** `pnpm test src/components/patient/workout` → PASS. **Commit**
      `feat(workout): bar's Log exercise opens the inline log`

---

### Task 7: Physio Activity shows set weights

**Files:**

- Modify: `src/components/activity/exercise-log-feed.tsx` (+ `.test.tsx`)
- Modify: `messages/en.json`, `messages/es.json` (`Activity.exercises.weight` stays; it renders
  `{value} kg` with a string value — check its ICU arg type and change `{value, number}` to
  `{value}` in both locales if needed)
- Modify: `src/server/activity/activity.int.test.ts` (asserts `setWeightsKg` is returned)

- [ ] **Step 1: Failing test**: a log with `setWeightsKg: [20, null, 25]` shows "20 · – · 25 kg";
      a legacy log with `weightKg: 12.5, setWeightsKg: null` shows "12.5 kg"; pain still shown when
      present.
- [ ] **Step 2: Implement**: weights text = `setWeightsKg` formatted (`format.number(v, {
maximumFractionDigits: 1 })`, `"–"` for null) joined with `" · "`, else `weightKg` formatted.
- [ ] **Step 3: Run** `pnpm test src/components/activity` and `pnpm test:int
src/server/activity` → PASS. **Commit** `feat(activity): show set weights of exercise logs`

---

### Task 8: E2E, docs, cleanup

**Files:**

- Modify: `e2e/patient-v2.spec.ts`, `e2e/session-logging.spec.ts`, `e2e/workout.spec.ts`
- Modify: `docs/specs/20-inline-exercise-log.md` (status, decisions), `docs/specs/README.md`,
  `docs/specs/19-patient-page-v2.md` (one line under decisions: "Per-exercise sheet replaced by
  spec 20"), `docs/architecture.md` only if it describes the exercise log sheet

- [ ] **Step 1: Update e2e** (mobile viewport as existing tests):
- `patient-v2.spec.ts` "a patient logs one exercise…": click toggle "Log Squat" → region
  "How did Squat go?"; fill "Set 1 weight in kg" = `20`, "Set 2 weight in kg" = `22,5`,
  "Set 3…" = `25`; rate "Effort (RPE)" 6; fill comment "Felt fine"; blur; expect "Saved";
  `Logged` list contains "20 · 22.5 · 25 kg" and "RPE 6"; reload → toggle → inputs keep values;
  physio Activity "Exercise log" section contains "20 · 22.5 · 25 kg", "Felt fine" and "New".
- `session-logging.spec.ts` decimal-comma test: rewrite for the panel (Yesterday option visible;
  fill set 1 "12,5"; blur; "Saved"; chips "12.5 kg"; reload; clear the input and blur → chips gone).
- `workout.spec.ts`: "Log exercise" stays ≥ 48 px; add: clicking it shows the region
  "How did <exercise> go?" and no dialog.
- RPE test in the "Mark as done" sheet keeps working (labels unchanged).

Run: `pnpm test:e2e e2e/patient-v2.spec.ts e2e/session-logging.spec.ts e2e/workout.spec.ts`.

- [ ] **Step 2: Docs** — spec 20 status "Done", acceptance criteria ticked, "Decisions made during
      implementation" filled; README index row "Done".
- [ ] **Step 3: Full verification** — `pnpm check`, `pnpm test:int`, the three e2e files.
- [ ] **Step 4: Commit** `test(e2e): inline exercise log; docs: spec 20 done`
