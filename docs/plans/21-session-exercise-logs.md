# Exercise Logs Belong to the Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every exercise log a child of that day's routine session (`session_logs`), mark
the routine done on its first exercise log, and show a session with its exercises as one block
in the physio's Activity tab and on the patient page.

**Architecture:** `exercise_logs.session_log_id` (not null, composite FK with `physio_id`,
cascade) points at the session of the same routine, entry and day. `logExercise` finds or
creates the session in the same transaction, and deletes a session left empty by a clear. The
Activity tab gets one `SessionFeed` from a grouped query; the patient routine card gets a
`SessionSummary` under its action row, built from data the page already loads.

**Tech Stack:** Next.js 16, React 19, next-intl, Drizzle + Supabase Postgres, Vitest + Testing
Library, Playwright.

**Spec:** `docs/specs/21-session-exercise-logs.md` (read it first; specs 13, 19, 20 for context).

## Global Constraints

- Node: prefix shell commands with `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`.
- Integration tests need local Supabase (`pnpm db:start`); apply new migrations with
  `pnpm db:reset`.
- Every user-visible string in **both** `messages/en.json` and `messages/es.json` (Rioplatense
  voseo). `src/i18n/messages.test.ts` fails on missing/extra keys or mismatched ICU args. Before
  removing a key, grep that nothing still uses it.
- Numbers and dates via next-intl (`useFormatter` / `getFormatter`), never a hard-coded locale.
- shadcn primitives (`Badge`, `Card`, ...) only; accent colour via `primary`.
- Migrations: `pnpm db:generate --name <name>` from `src/db/schema/`; hand-written SQL only in a
  separate custom migration (`pnpm exec drizzle-kit generate --custom --name <name>`). Never
  hand-edit generated SQL.
- Patient writes only in `src/server/patient/`; every id derived from the resolved link.
- `SESSIONS_LIMIT = 30` (Activity feed).
- Run `pnpm check` before every commit. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Two exercise saves of the same routine and day racing (autosave of two rows) → exactly one
   session, both logs attached to it (Task 2 test).
2. The patient pressed Undo, then logs another exercise → the session stays not done (Task 2).
3. Clearing the only exercise log of a session that has a comment, pain or RPE → the session
   stays (Task 2).
4. The same routine logged standalone and from a plan entry on one day → two sessions, each log
   on its own (Task 2).
5. Logging yesterday creates yesterday's session, not today's (Task 2).

---

### Task 1: Schema, migrations and test helper

**Files:**

- Modify: `src/db/schema/session-logs.ts`, `src/db/schema/exercise-logs.ts`
- Create (generated): `supabase/migrations/<ts>_exercise-log-session.sql`, then
  `<ts>_exercise-log-session-required.sql` (+ `meta/` snapshots, `_journal.json`)
- Create (custom): `supabase/migrations/<ts>_exercise-log-session-backfill.sql`
- Create: `src/test/int/logs.ts`
- Modify: `src/db/exercise-logs.int.test.ts`, `src/server/activity/activity.int.test.ts` (and
  any other test that inserts `exercise_logs` directly; grep `insert(exerciseLogs)`)

**Interfaces:**

- Produces: `sessionLogs` gains `unique("session_logs_physio_id_unique").on(t.physioId, t.id)`;
  `exerciseLogs.sessionLogId: uuid().notNull()` with
  `foreignKey({ name: "exercise_logs_session_fk", columns: [t.physioId, t.sessionLogId], foreignColumns: [sessionLogs.physioId, sessionLogs.id] }).onDelete("cascade")`
  and `index("exercise_logs_session_idx").on(t.sessionLogId)`.
- Produces: `insertSessionLog(physioId: string, values: { customerId: string; routineId: string; performedOn: string; weeklyPlanEntryId?: string | null; completed?: boolean; pain?: number | null; rpe?: number | null; comment?: string | null }): Promise<string>`
  in `src/test/int/logs.ts` (returns the id; `onConflictDoUpdate` not needed, tests use distinct
  days).

- [ ] **Step 1: Schema, nullable first.** Add the column without `.notNull()`, the FK, the index
      and the `session_logs` unique. Run `pnpm db:generate --name exercise-log-session`.
- [ ] **Step 2: Backfill migration.** `pnpm exec drizzle-kit generate --custom --name
    exercise-log-session-backfill`, content:

```sql
-- Spec 21: every exercise log belongs to the session of its routine, entry and day. Logs that
-- have none get a done session (an exercise log now marks the routine done).
insert into public.session_logs
  (physio_id, customer_id, share_link_id, routine_id, weekly_plan_entry_id, performed_on,
   completed, created_at, updated_at)
select physio_id, customer_id,
  (array_agg(share_link_id order by updated_at desc))[1],
  routine_id, weekly_plan_entry_id, performed_on, true, min(created_at), min(created_at)
from public.exercise_logs
group by physio_id, customer_id, routine_id, weekly_plan_entry_id, performed_on
on conflict on constraint session_logs_routine_entry_day_unique do nothing;

update public.exercise_logs e
  set session_log_id = s.id
  from public.session_logs s
  where s.routine_id = e.routine_id
    and s.weekly_plan_entry_id is not distinct from e.weekly_plan_entry_id
    and s.performed_on = e.performed_on
    and e.session_log_id is null;
```

- [ ] **Step 3: Required.** Add `.notNull()`; `pnpm db:generate --name
    exercise-log-session-required`. Check the three SQL files apply in order: `pnpm db:reset`.
- [ ] **Step 4: Helper + fix existing direct inserts.** Write `insertSessionLog`; every test
      that inserts `exercise_logs` directly creates a session first and passes `sessionLogId`.
- [ ] **Step 5: Integration tests** in `src/db/exercise-logs.int.test.ts`, new
      `describe("exercise_logs.session_log_id")`:
  - `it("deletes a session's exercise logs with it")`: delete the session → the exercise log row
    is gone.
  - `it("rejects a session of another physio")`: insert an exercise log for physio A with a
    session id of physio B → rejects (FK violation).
  - `it("backfills a done session for an orphan log (migration statements)")`: in
    `db.transaction`, `alter table public.exercise_logs alter column session_log_id drop not
null`, insert an exercise log with `sessionLogId: null` and another for a day that already
    has a session with `completed = false`, run the backfill file's SQL (read it with
    `fs.readFileSync` from `supabase/migrations/*_exercise-log-session-backfill.sql`), assert:
    orphan's new session has `completed = true` and its `session_log_id` set; the other log
    points at the existing session, still `completed = false`; then throw to roll back.
- [ ] **Step 6: Run** `pnpm test:int src/db src/server/activity` → PASS; `pnpm check` → PASS.
- [ ] **Step 7: Commit** `feat(db): exercise_logs.session_log_id (spec 21)`.

### Task 2: `logExercise` attaches to the session

**Files:**

- Modify: `src/server/patient/log-exercise.ts`
- Test: `src/server/patient/log-exercise.int.test.ts`

**Interfaces:**

- Consumes: Task 1 schema.
- Produces: `logExercise` signature and `LogExerciseResult` unchanged. `PatientExerciseLog`
  unchanged.

- [ ] **Step 1: Failing tests** (new `describe("session", ...)`, use `NOW`/`TODAY` and the
      existing link helpers; read `session_logs` with `db`):
  - `it("creates a done session on the first exercise log")`: one `session_logs` row for routine,
    `entryId null`, `TODAY`: `completed === true`, pain/rpe/comment null; the exercise log's
    `sessionLogId` equals its id.
  - `it("attaches later logs to the same session without changing it")`: a second exercise →
    still one session, `updatedAt` unchanged, both logs point at it.
  - `it("leaves an undone session undone")`: `logSession(..., completed: false)` first, then
    `logExercise` → session `completed === false`, log attached.
  - `it("creates one session when two logs race")`: `Promise.all` of two `logExercise` calls
    (two exercises, same routine/day) → one session, both attached.
  - `it("keeps plan entry and standalone sessions apart")`: same routine standalone and via
    `entryId` on `TODAY` → two sessions.
  - `it("logs yesterday into yesterday's session")`: `performedOn` yesterday → session dated
    yesterday; none for today.
  - `it("deletes the session when its last log is cleared and it is empty")`.
  - `it("keeps the session when other logs remain")` and
    `it("keeps the session when it has a comment, pain or RPE")`.
  - `it("writes nothing when refused")`: an `unreachable` or `date` refusal creates no session.
- [ ] **Step 2: Run** `pnpm test:int src/server/patient/log-exercise` → new tests FAIL.
- [ ] **Step 3: Implement.** In `logExercise`, after `checkLoggable` and the routine-item check,
      run the write in `db.transaction(async (tx) => ...)`:
  - find-or-create: `tx.insert(sessionLogs).values({ physioId, customerId, shareLinkId: link.id,
routineId, weeklyPlanEntryId: entryId, performedOn, completed: true }).onConflictDoNothing({
target: [sessionLogs.routineId, sessionLogs.weeklyPlanEntryId, sessionLogs.performedOn] })`,
    then select the session id by routine, entry (`is null` when null) and day, scoped by
    `physioId` and `customerId`. Only on the save path, not the clear path.
  - save: the existing upsert, plus `sessionLogId` in `values` and in the conflict `set`.
  - clear: delete the exercise log `returning({ sessionLogId })`; if one was deleted, delete
    that session where `pain`, `rpe`, `comment` are null and `not exists (select 1 from
exercise_logs where session_log_id = session_logs.id)`.
  - Update the function's doc comment (spec 21 rules 2–3).
- [ ] **Step 4: Run** `pnpm test:int src/server/patient` → PASS; `pnpm check` → PASS.
- [ ] **Step 5: Commit** `feat(patient): exercise logs create and join the routine session`.

### Task 3: Activity tab, one session feed

**Files:**

- Modify: `src/server/activity/queries.ts`, `src/components/activity/customer-activity.tsx`,
  `src/lib/session-logs.ts` (+ its test), `messages/en.json`, `messages/es.json`
- Create: `src/components/activity/session-feed.tsx`, `session-feed.test.tsx`
- Delete: `src/components/activity/comments-feed.tsx`, `exercise-log-feed.tsx` and their tests
- Test: `src/server/activity/activity.int.test.ts`

**Interfaces:**

- Produces in `src/lib/session-logs.ts`:
  `formatSetWeights(weights: readonly (number | null)[], formatNumber: (kg: number) => string): string`
  → values joined with `" · "`, `null` as `"–"` (`[20, null, 25]` → `"20 · – · 25"`).
- Produces in `queries.ts` (replacing `ActivityComment`, `ActivityExerciseLog` and the
  `comments` / `exerciseLogs` fields of `CustomerActivity`):

```ts
export type ActivitySessionExercise = {
  id: string;
  exerciseName: string;
  pain: number | null; // legacy (spec 19)
  rpe: number | null;
  weightKg: number | null; // legacy single weight
  setWeightsKg: (number | null)[] | null;
  comment: string | null;
  seen: boolean; // no comment, or seen
};
export type ActivitySession = {
  id: string;
  routineName: string;
  performedOn: string;
  completed: boolean;
  pain: number | null;
  rpe: number | null;
  comment: string | null;
  seen: boolean; // no comment, or seen
  exercises: ActivitySessionExercise[]; // in the order they were first logged
};
// CustomerActivity: `sessions: ActivitySession[]`; `unseenIds` (session comments) and
// `unseenExerciseIds` stay, computed from what `sessions` shows.
```

- [ ] **Step 1: Failing tests.**
  - `session-logs.test.ts`: `formatSetWeights([20, null, 22.5], String)` → `"20 · – · 22.5"`.
  - `activity.int.test.ts` (replace the comments/exercise-log assertions):
    `it("lists sessions newest first with their exercises")` (one session with two exercise logs
    in logged order, values and names); `it("leaves out sessions with nothing to read")` (done,
    no pain/RPE/comment/exercises); `it("shows an undone session that has exercise logs")`
    (`completed: false`); `it("returns unseen ids for the shown session and exercise comments")`;
    `it("caps the feed at 30 sessions")`.
  - `session-feed.test.tsx` (en messages, as `exercise-log-feed.test.tsx` did): region named
    "Sessions"; a card shows routine name, date, "Done", "Pain 3/10", "RPE 6/10", the comment
    with "New", and an exercise line "Goblet squat" with "20 · – · 25 kg", "RPE 7/10" and its own
    "New"; an undone session shows "Not done"; a legacy exercise with only `weightKg: 12.5`
    shows "12.5 kg"; an empty list shows "No sessions logged yet."; a "New" stays after
    re-render with `seen: true` (`useShownAsNew`).
- [ ] **Step 2: Run** unit + int tests above → FAIL.
- [ ] **Step 3: Implement.**
  - Query: sessions of the customer (all time), where pain, RPE or comment is not null or an
    exercise log exists for it, newest first (`performedOn desc, updatedAt desc`), limit
    `SESSIONS_LIMIT`; then the exercise logs of those ids (join `exercises` for the name), order
    `createdAt asc, id asc`; group by `sessionLogId`. Drop the old comments and exercise-log
    queries and `EXERCISE_LOGS_LIMIT` (keep `COMMENTS_LIMIT` only if something else uses it).
  - `SessionFeed({ sessions }: { sessions: ActivitySession[] })`, `"use client"`, in the style of
    the old feeds: `<section aria-labelledby>` with an `h3` title, a `<ul>` of cards; card
    header: routine name, date (`CALENDAR_DATE_FORMAT`), `Badge` "Done" (`secondary`) or
    "Not done" (`outline`), pain, RPE, "New"; comment (`whitespace-pre-line wrap-anywhere`);
    then a `<ul>` of exercise lines (name, set weights or legacy weight, legacy pain, RPE, comment,
    "New"). `useShownAsNew` keyed by session and by exercise.
  - `CustomerActivity`: render `SessionFeed` in place of both feeds; `nothingYet` uses
    `sessions.length === 0`.
  - Messages: `Activity.sessions` = `title` "Sessions", `empty` "No sessions logged yet.",
    `done` "Done", `notDone` "Not done", `pain` "Pain {value, number}/10", `rpe`
    "RPE {value, number}/10", `weight` "{value} kg", `exercises` "Exercises", `new` "New";
    es: "Sesiones", "Todavía no hay sesiones registradas.", "Hecha", "Sin hacer",
    "Dolor {value, number}/10", "RPE {value, number}/10", "{value} kg", "Ejercicios", and `new`
    as the existing es `Activity.comments.new`. Remove `Activity.comments` / `Activity.exercises`
    keys nothing uses any more.
- [ ] **Step 4: Run** `pnpm test src/components/activity src/lib`,
      `pnpm test:int src/server/activity` → PASS; `pnpm check` → PASS.
- [ ] **Step 5: Commit** `feat(activity): one feed of sessions with their exercises`.

### Task 4: Patient page summary

**Files:**

- Create: `src/components/patient/session-summary.tsx`, `session-summary.test.tsx`
- Modify: `src/components/patient/routine-view.tsx`, `patient-home.tsx`, `exercise-list.tsx`
  (+ `exercise-list.test.tsx`), `messages/en.json`, `messages/es.json`

**Interfaces:**

- Consumes: `formatSetWeights` (Task 3).
- Produces in `session-summary.tsx`:

```ts
export type SessionSummaryData = {
  pain: number | null;
  rpe: number | null;
  comment: string | null;
  exercises: {
    exerciseId: string;
    name: string;
    setWeightsKg: (number | null)[] | null;
    rpe: number | null;
    comment: string | null;
  }[];
};
/** Null when there is nothing to show. Exercises in routine order (first occurrence); logs of
 *  exercises no longer in the routine are left out. `exerciseLogs` already narrowed to the
 *  routine, entry and day. */
export function sessionSummary(
  routine: Pick<PatientRoutine, "blocks">,
  session: PatientLog | null,
  exerciseLogs: PatientExerciseLog[],
): SessionSummaryData | null;
export function SessionSummary({ summary }: { summary: SessionSummaryData }): JSX.Element; // "use client"
```

- [ ] **Step 1: Failing tests** (`session-summary.test.tsx`):
  - `sessionSummary`: routine order across a single and a group block; unknown exercise dropped;
    session with only `completed` and no exercises → `null`; session with a comment and no
    exercises → data with `exercises: []`.
  - `SessionSummary` (en): region named "Logged"; "Pain 3 · RPE 6" line and the comment; an
    exercise line "Squat", "20 · 22.5 · 25 kg", "RPE 7" and its comment.
  - `exercise-list.test.tsx`: the "Logged" chip list no longer renders (replace the chip tests).
- [ ] **Step 2: Run** `pnpm test src/components/patient` → FAIL.
- [ ] **Step 3: Implement.**
  - `SessionSummary`: `<section aria-label={t("title")}>` in a `bg-muted rounded-lg p-3 text-sm`
    box; routine line (pain/RPE joined with " · ", comment `line-clamp-2`); then a `<ul>` with
    one line per exercise: name (`font-medium`), values joined with " · ", comment
    (`line-clamp-1`). Numbers with `useFormatter` (`useGrouping: false, maximumFractionDigits: 1`).
  - `RoutineView`: new prop `summary?: SessionSummaryData | null`, rendered right under the
    action row.
  - `patient-home.tsx`: pass `summary={sessionSummary(routine, session, exerciseLogs)}` with the
    same routine, entry and shown date as `logSlot` (plan entries: `dayDate`; single routines:
    `view.today`).
  - `exercise-list.tsx`: remove the chips (`chips`, the "Logged" `<ul>`) and imports they
    alone used; keep the filled Log toggle.
  - Messages: `Patient.summary` = `title` "Logged", `pain` "Pain {value, number}", `rpe`
    "RPE {value, number}", `weights` "{value} kg"; es "Registrado", "Dolor {value, number}",
    "RPE {value, number}", "{value} kg". Remove `Patient.exerciseLog.chips` and
    `Patient.exercise.logged` if nothing else uses them.
- [ ] **Step 4: Run** `pnpm test src/components/patient` → PASS; `pnpm check` → PASS.
- [ ] **Step 5: Commit** `feat(patient): session summary under the routine's Done row`.

### Task 5: E2E, docs, verification

**Files:**

- Modify: `e2e/patient-v2.spec.ts`, `e2e/session-logging.spec.ts`, `docs/specs/21-...md`,
  `docs/specs/README.md`, `docs/architecture.md` (if it describes exercise logs)

- [ ] **Step 1: Update e2e.** `patient-v2.spec.ts` first test: after "Saved", expect the
      routine's "Done" and the "Logged" region to contain "Squat", "20 · 22.5 · 25 kg", "RPE 6"
      (no chip list); Activity: region "Sessions" contains "Knee rehab", "Done",
      "20 · 22.5 · 25 kg", "Felt fine" and "New". Second test: region "Sessions" instead of
      "Comments". `session-logging.spec.ts`: replace "Comments" / "Logged" selectors likewise.
- [ ] **Step 2: New e2e** in `patient-v2.spec.ts`:
      `test("exercise logs mark the routine done and show as one session")`: routine with two
      exercises; log one weight on each (no "Mark as done") → "Done" visible; "Mark as not done"
      via Edit → physio Activity: one session card "Not done" with both exercise names.
- [ ] **Step 3: Run** `pnpm test:e2e e2e/patient-v2.spec.ts e2e/session-logging.spec.ts
e2e/workout.spec.ts` → PASS.
- [ ] **Step 4: Docs.** Spec 21 status Done, acceptance boxes ticked, "Decisions made during
      implementation" filled; README row Done; architecture.md if it lists log tables.
- [ ] **Step 5: Full verification** `pnpm check`, `pnpm test:int` → PASS.
- [ ] **Step 6: Commit** `test(e2e): session-linked exercise logs; docs: spec 21 done`.
