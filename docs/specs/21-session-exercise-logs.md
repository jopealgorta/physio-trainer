# 21 · Exercise logs belong to the routine session

- **Status:** Done
- **Feature:** D (logging), extends 13, 19, 20
- **Depends on:** 13, 19, 20

## Summary

An exercise log becomes part of the routine session it was done in: the routine's log for that
day (done, pain, RPE, comment) is the parent, and its exercise logs (set weights, RPE, comment)
hang off it. Logging the first exercise of a routine marks the routine done. The physio's
Activity tab and the patient page show a session with its exercises as one block.

## Goals

1. **One entity.** `exercise_logs.session_log_id` points at the `session_logs` row of the same
   routine, plan entry and day; deleting the session deletes its exercise logs.
2. **Auto-done.** The first exercise log of a routine on a day creates that day's session as
   done. Adherence, "last logged", the heatmap and the dashboard count it.
3. **Undo sticks.** "Undo" on "Mark as done" marks the session not done and keeps its exercise
   logs; logging more exercises does not mark it done again.
4. **Activity: one feed.** Sessions, newest first, each with its exercises.
5. **Patient page: one summary** under the routine's "Done" row.

## Non-goals

- Logs in PDF/Excel exports (decided against, 2026-10-06).
- Making "Mark as done" inline (spec 20 non-goal, unchanged).
- Physio editing or deleting logs.

## User stories

- As a physio, I want to see a session's pain, RPE and comment together with the weights and
  comments of each exercise, so I can read one workout at a glance.
- As a patient, I want logging my exercises to count as doing the routine, without an extra tap.
- As a patient, I want to see what I logged for a routine today in one place.

## Data model

### `session_logs` (spec 13)

- New unique constraint `session_logs_physio_id_unique` on `(physio_id, id)`, the target of the
  composite FK below (tenancy pattern of the other FKs).

### `exercise_logs` (spec 19)

| Column           | Type | Notes                                                                                        |
| ---------------- | ---- | -------------------------------------------------------------------------------------------- |
| `session_log_id` | uuid | not null; FK `(physio_id, session_log_id)` → `session_logs(physio_id, id)` on delete cascade |

- Index `exercise_logs_session_idx` on `(session_log_id)`.
- `routine_id`, `weekly_plan_entry_id`, `performed_on` and the existing unique key stay; the
  server writes them in the same transaction as the session, so they always match it.
- Migration, three steps:
  1. generated: add `session_log_id` nullable, the FK, the index, the `session_logs` unique;
  2. custom (data): for every exercise log group `(customer, routine, entry, day)` without a
     session, insert a `session_logs` row (`completed = true`, share link of the newest exercise
     log, no pain/RPE/comment, timestamps of the oldest exercise log, `seen_by_physio_at` null);
     then set every `session_log_id` from the matching session;
  3. generated: `session_log_id` not null.

## Routes and UI

No new routes.

### Patient page, routine card

- Under the routine's action row ("Done ✓" / "Edit"), when the shown day has a session with
  anything in it, a compact summary:
  - the routine line: "Pain 3 · RPE 6" and the comment (clamped to two lines);
  - one line per logged exercise, in routine order: exercise name, then set weights
    ("20 · 22.5 · 25 kg", skipped sets "–"), "RPE 7" and the comment (one line).
- The exercise rows' chips go away. Rows keep the Log toggle (filled when logged) and the
  inline panel for editing.
- After the first exercise save the routine shows "Done ✓" (the list's debounced refresh).

### Physio Activity tab

- One "Sessions" feed replaces "Comments" and "Exercise logs". Newest first, the newest 30
  sessions of all time that have something to read (pain, RPE, a comment or exercise logs).
- A session card: routine name, date, a "Done" / "Not done" badge, pain, RPE, the comment with
  its "New" badge; then each exercise: name, set weights (or the legacy single weight, or legacy
  pain), RPE and comment with its own "New" badge.
- Sessions with nothing to read only show in the heatmap, as before.
- "Mark as seen" is unchanged: the unseen session comments and exercise comments shown.

## Behaviour and rules

1. Logging rules of specs 13/19/20 unchanged (today only since 2026-10-10, was today/yesterday; routine reachable, exercise in the
   routine, a physio previewing never writes).
2. Saving an exercise log, in one transaction: find the session of the routine, entry and day;
   if there is none, create it with `completed = true` and nothing else; an existing session is
   not changed. Then upsert the exercise log with that `session_log_id`.
3. Clearing an exercise log deletes it; if its session then has no exercise logs and no pain,
   RPE or comment, the session is deleted too (a typo must not leave the routine done).
   Accepted edge: a session marked done with nothing filled in, then an exercise logged and
   cleared, is deleted.
4. "Mark as done" Save and Undo are unchanged; Undo keeps the exercise logs.
5. Undone sessions (`completed = false`) do not count for adherence, completed or last logged
   (spec 13); auto-done sessions do.

## Security and privacy

Unchanged: writes only through `src/server/patient/`, every id derived from the resolved link,
RLS on both tables. The new FK includes `physio_id`, so an exercise log can never point at
another physio's session.

## i18n

`Activity.sessions.*` (feed title, empty state, done / not done, values, new) replaces
`Activity.comments.*` and `Activity.exerciseLogs.*`; `Patient.summary.*` replaces the exercise
chip keys. en + es (voseo) in the same change.

## Acceptance criteria

- [x] Every exercise log has a session of the same routine, entry and day; deleting the session
      deletes them.
- [x] Logging the first exercise of a routine marks it done for that day.
- [x] After Undo, the exercise logs stay and further exercise logs do not mark it done again.
- [x] Clearing the only exercise log of an otherwise empty session removes the session.
- [x] Existing exercise logs get a done session by migration.
- [x] The Activity tab shows one feed of sessions with their exercises; "New" badges and
      "Mark as seen" still work for both kinds of comment.
- [x] The patient page shows the routine and exercise summary under the Done row; no row chips.

## Test plan

- Unit: session feed (grouping, badges, legacy values), patient summary, the grouping helper.
- Integration: auto-create on first exercise log, existing session untouched, Undo then log,
  clear deletes the empty session (and keeps a non-empty one), cascade delete, cross-physio FK
  rejected, backfill migration.
- E2E (mobile): patient logs two exercises without "Mark as done" → routine shows "Done" and the
  summary; physio Activity shows one session card with both exercises; Undo → card "Not done",
  exercises still there.

## Open questions

Answered 2026-10-06 before design:

1. Exercises logged but no "Mark as done": what is the session? **Answer:** done automatically
   on the first exercise log.
2. Where do they show together? **Answer:** Activity tab (one feed) and the patient page
   (summary under the Done row). Not in exports.
3. Undo on "Mark as done": exercise logs? **Answer:** kept.
4. Split into two specs? **Answer:** no, one spec and one PR.

## Decisions made during implementation

- **Four migrations.** Unique `(physio_id, id)` on `session_logs`, then the column, FK and index,
  then the custom backfill, then `NOT NULL`: split so drizzle emits the FK after the unique it
  depends on, with no generated SQL hand-edited.
- **Advisory lock per session key.** Save and clear take
  `pg_advisory_xact_lock(hashtextextended(routine:entry:day, 0))`, so concurrent saves cannot
  create two sessions or race a clear against a save.
- **Mark-seen bounds.** The action caps ids at `SESSIONS_LIMIT` sessions and
  `SESSIONS_LIMIT * MAX_ITEMS` exercises; `SESSIONS_LIMIT` moved to `src/lib/session-logs.ts` and
  `COMMENTS_LIMIT` was removed.
- **`session-summary-data.ts` split.** `sessionSummary` lives in a non-client module because the
  server cannot call functions exported from a client module; the component is `session-summary.tsx`.
- **Backfill test runs the migration file** inside a rolled-back transaction, so it exercises the
  real SQL without leaving data behind.
- **The patient summary is server-rendered**, so it appears after the exercise list's debounced
  refresh (about 1.5 s after the last save).
- **Remembered "Done" yields to fresh server props.** `LogSessionButton` drops what it remembered
  when new `logs` props arrive (`useSavedLogs(loaded, source)`), so a session the server deleted
  after its last exercise log was cleared no longer shows "Done" once the page refreshes.
- **Activity lists exercises in routine order.** By the exercise's first position in the session's
  routine, as the patient summary does; exercises no longer in the routine go last, in log order.
