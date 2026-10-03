# 19 · Patient page v2 (compact list, exercise logs, RPE, day notes, aerobic)

- **Status:** Done
- **Feature:** Core (patient experience), extends C (workout mode) and D (logging)
- **Depends on:** 05, 06, 10, 12, 13, 14, 15

## Summary

Feedback from testing with patients: the patient page should give an overview of the whole
routine at a glance, workout mode should keep that overview while timing sets, and patients want
to report how each exercise went, not only the routine. Physios want to leave a note per day of
the week and to prescribe aerobic work (running, bike, rowing) with distance and intensity.

## Goals

1. **Compact exercise list.** The patient page lists exercises as compact rows: a video
   thumbnail on the left (tapping it opens the video bigger and plays it), name, one-line
   prescription, notes clamped to one line.
2. **Workout mode = list + bottom bar.** Workout mode shows the same list (current exercise
   highlighted and scrolled into view) with a sticky bottom bar holding the progress, timer and
   controls. The full-screen per-exercise video is gone.
3. **RPE on the routine log.** The "Mark as done" sheet adds an optional RPE (CR10, 0–10).
4. **Per-exercise logs.** Each exercise has an optional form: pain 0–10, RPE 0–10, weight (kg),
   comment. All optional.
5. **Day notes.** The physio can write a note on each weekday of a weekly plan; the patient sees
   it on that day.
6. **Aerobic exercises.** A library exercise can be `aerobic`; its sets are prescribed with
   duration, distance and intensity (intervals = several sets with rest).

## Non-goals

- Per-set logging (reps or weight per set actually done): one entry per exercise per day.
- Charts of exercise weight/RPE over time (the Activity tab lists them; charts can come later).
- Heart-rate zones as structured data: intensity is free text ("Zone 2", "RPE 5", "5:30/km").
- Uploaded videos (still deferred).

## User stories

- As a patient, I want to see my whole routine in one screen so I know what is coming.
- As a patient, I want to tap a thumbnail to watch how an exercise is done.
- As a patient, I want to keep the list in view during a workout, with the timer at the bottom.
- As a patient, I want to say how hard a session was (RPE) and how each exercise felt (pain,
  effort, the weight I used, a comment).
- As a physio, I want to see per-exercise pain, effort, weight and comments in the Activity tab
  and be alerted when an exercise hurts.
- As a physio, I want to leave a note for a weekday ("Easy day: walk 20 min").
- As a physio, I want to prescribe "Run 30 min · 5 km · Zone 2" or rowing intervals.

## Data model

All changes are additive (expand only).

### `session_logs` (spec 13)

| Column | Type          | Notes                          |
| ------ | ------------- | ------------------------------ |
| `rpe`  | smallint null | CR10, check `between 0 and 10` |

The custom migration recreates the "patient changed it" `updated_at` trigger so it also fires on
`rpe`.

### `exercise_logs` (new)

| Column                        | Type                                 | Notes                                    |
| ----------------------------- | ------------------------------------ | ---------------------------------------- |
| `id`, `physio_id`, timestamps |                                      |                                          |
| `customer_id`                 | uuid not null → customers (cascade)  | composite FK with `physio_id`            |
| `share_link_id`               | uuid null → share_links (`set null`) | composite, custom migration (as spec 13) |
| `routine_id`                  | uuid not null → routines (cascade)   | composite FK                             |
| `weekly_plan_entry_id`        | uuid null                            | no FK, same reason as `session_logs`     |
| `exercise_id`                 | uuid not null → exercises (cascade)  | composite FK                             |
| `performed_on`                | date not null                        |                                          |
| `pain`                        | smallint null                        | 0–10                                     |
| `rpe`                         | smallint null                        | 0–10                                     |
| `weight_kg`                   | numeric(5,1) null                    | 0–999.9                                  |
| `comment`                     | text null                            | 1–1 000 chars                            |
| `seen_by_physio_at`           | timestamptz null                     | "new comments" badges                    |

- Unique `(routine_id, weekly_plan_entry_id, exercise_id, performed_on)` **nulls not distinct**.
  Keyed by exercise, not routine item: saving a routine recreates its items. An exercise used
  twice in one routine shares one log.
- Check: at least one of `pain`, `rpe`, `weight_kg`, `comment` is set (an empty form deletes the
  row instead).
- Indexes `(physio_id, customer_id, performed_on desc)`, `(physio_id, routine_id)`.
- RLS `exercise_logs_own`; `set_updated_at` trigger that fires only on patient fields.

### `weekly_plan_days` (new)

| Column                        | Type              | Notes                               |
| ----------------------------- | ----------------- | ----------------------------------- |
| `id`, `physio_id`, timestamps |                   |                                     |
| `weekly_plan_id`              | uuid not null     | composite FK → weekly_plans cascade |
| `weekday`                     | smallint not null | 1–7                                 |
| `notes`                       | text not null     | 1–500 chars                         |

Unique `(physio_id, weekly_plan_id, weekday)`. Clearing a note deletes the row. RLS
`weekly_plan_days_own`.

### `exercises` (spec 03)

| Column | Type                                         | Notes                        |
| ------ | -------------------------------------------- | ---------------------------- |
| `kind` | `exercise_kind` enum (`strength`, `aerobic`) | not null, default `strength` |

### `routine_item_sets` (spec 05)

| Column            | Type         | Notes                                     |
| ----------------- | ------------ | ----------------------------------------- |
| `distance_meters` | integer null | 1–200 000                                 |
| `intensity`       | text null    | ≤ 40 chars ("Zone 2", "RPE 5", "5:30/km") |

Available on every set (the schema does not depend on the exercise kind); the editor shows
reps/load for strength exercises and duration/distance/intensity for aerobic ones.

## Routes and UI

No new routes.

### Patient page (`/{handle}/{slug}-{code}`)

- `ExerciseList` (client) renders a routine's blocks as compact rows: thumbnail (16:9, ~96 px
  wide; Shorts cropped), position, name, prescription summary, notes clamped to one line.
  Supersets keep their dashed bracket. Exercises without video show an icon placeholder.
- Tapping the thumbnail or the name opens the exercise detail (`Drawer` on phones, `Dialog`
  from `sm` up): the YouTube embed autoplaying, prescription, notes, instructions.
- Each row has a small "Log" button (when the visitor can log) and chips with what is already
  logged for the shown day ("Pain 3 · RPE 6 · 20 kg"). The button opens the exercise log sheet:
  pain scale, RPE scale, weight (kg), comment, Save / Clear. Single routines get the same
  Today/Yesterday toggle as the routine log.
- The routine log sheet ("Mark as done") gains an RPE scale under the pain scale.
- Day notes show under the day heading, above the plans of that day.

### Workout mode (`/{handle}/{slug}-{code}/workout/{routineId}`)

- Same `ExerciseList`, the current exercise highlighted and scrolled into view (`smooth`
  unless reduced motion), finished sets ticked.
- Sticky bottom bar: "Exercise 2 of 8 · Set 1 of 3", the set's target, the active countdown
  (hold, timed set, rest) with Skip / +15 s, Previous / Next, the primary action (Set done,
  Start, Hold N s) and Log for the current exercise.
- Exit button and sound toggle stay in a compact top bar. Finish screen unchanged (log sheet).

### Physio

- **Library**: exercise form gets a Strength / Aerobic toggle; aerobic exercises show a badge in
  the list.
- **Routine editor**: an aerobic item's sets table has Duration, Distance (km, decimals; shown in
  m under 1 km) and Intensity columns instead of Reps and Load.
- **Plan board**: each day has a note button (`Popover` with a `Textarea`, saved on Save); the
  note shows under the day header.
- **Activity tab**: RPE in the session feed; each session lists its exercise logs; a new
  "Exercise log" section lists recent exercise logs (date, exercise, pain, RPE, kg, comment).
  New exercise comments get the "New" badge and are marked seen like session comments.
- **Dashboard**: exercise pain counts for "Needs attention" (pain ≥ 7 in the last 7 days) and
  exercise comments for "New comments".

## Behaviour and rules

1. Exercise logs follow spec 13's rules: today or yesterday in the physio's time zone, the
   routine (and entry) must be reachable from the link and active that day (`isReachable`), the
   exercise must be in that routine, a signed-in physio previewing never writes.
2. Saving an exercise log with every field empty deletes it.
3. `weight_kg` accepts 0–999.9 with one decimal; the input accepts `,` as decimal separator.
4. RPE is CR10: 0 rest, 1–2 very easy, 3–4 easy/moderate, 5–6 hard, 7–8 very hard, 9 extremely
   hard, 10 maximal. The scale shows its anchor labels.
5. Day notes: ≤ 500 chars, plain text, rendered with `whitespace-pre-line`.
6. Day notes are part of the plan: copied by "Save as template", "Use template" and "Copy into
   next phase", included in version snapshots (diff + restore) and exports.
7. Aerobic prescription summary: duration, distance, intensity, joined with " · ", sets ×
   when sets are identical ("4 × 500 m · 2:00/500m"). Strength summary is unchanged except that
   distance/intensity also render when present.
8. Workout: a set with `duration_seconds` is timed (countdown); otherwise "Set done".
9. Distances: stored in metres; entered in km with up to 3 decimals; shown as "800 m" under
   1 km, "5 km" / "2.5 km" from 1 km (locale-formatted).

## Security and privacy

- Patient writes only in `src/server/patient/` with every id derived from the resolved link and
  checked for reachability (architecture rule 3). The exercise id must belong to the routine.
- `exercise_logs` and `weekly_plan_days` carry `physio_id` with RLS; integration tests prove
  physio A cannot read or write physio B's rows.
- Comments render as plain text. Day notes are physio-written and shown to the patient.

## i18n

New keys under `Patient` (list, exercise log sheet, RPE scale), `Workout` (bottom bar),
`Activity` (exercise logs), `Plans` (day notes), `Library` (kind), `Routines`/`Prescription`
(distance, intensity), `Export` (day notes). en + es (voseo) in the same change.

## Acceptance criteria

- [x] Patient page lists exercises compactly with thumbnails; tapping opens and plays the video.
- [x] Workout mode shows the list with the current exercise highlighted and a bottom bar with
      timer and controls; previous behaviour (sets, hold, timed, rest, cues, resume) intact.
- [x] Routine log sheet saves an optional RPE.
- [x] Patient can log pain, RPE, weight and comment per exercise (today/yesterday), edit and
      clear it; unreachable/cross-customer writes rejected.
- [x] Physio sees exercise logs and RPE in the Activity tab; exercise pain ≥ 7 shows under
      "Needs attention"; exercise comments are "New".
- [x] Physio can add a note per weekday; patient sees it; it survives template/phase copies,
      version restore, and appears in PDF/Excel.
- [x] Physio can mark an exercise aerobic and prescribe duration/distance/intensity; patient
      page, workout and exports render it.

## Test plan

- Unit: aerobic prescription format and distance formatting; exercise log zod schema; attention
  rules with exercise pain; snapshot/diff/restore with day notes; `ExerciseList`, bottom bar and
  log sheets.
- Integration (incl. RLS): exercise log upsert/delete, reachability, date window, exercise not
  in routine, cross-customer; RLS on `exercise_logs` and `weekly_plan_days`; `updated_at`
  triggers; day notes copied by templates and phases; export queries include notes/aerobic.
- E2E (mobile): patient logs an exercise and an RPE → physio Activity tab shows them; workout
  with the bottom bar through a 2-exercise routine; physio day note visible to the patient;
  aerobic item renders on the patient page.

## Open questions

Answered 2026-10-03 before design:

1. Workout mode: list + bottom bar, or keep the full-screen video with a restyled panel?
   **Answer:** list + sticky bottom bar; the full-screen video goes away.
2. RPE scale? **Answer:** CR10, 0–10.
3. Weight shape? **Answer:** one number in kg per exercise per day.
4. Aerobic prescription? **Answer:** duration + distance + free-text intensity per set
   (intervals reuse sets + rest); the kind is set on the library exercise.
5. Where does the physio see exercise logs? **Answer:** Activity tab; exercise comments count as
   new comments, exercise pain ≥ 7 counts for "Needs attention".
6. When can the patient log an exercise? **Answer:** same rules as the routine log
   (today/yesterday), from the patient page and from workout mode, independent of "Mark as done".
7. Where do day notes show? **Answer:** plan board, patient page, PDF/Excel; also in version
   history and template/phase copies.

## Decisions made during implementation

- **Exercise logs are keyed by exercise**, not routine item (saving a routine recreates its
  items). The unique key is `(routine_id, weekly_plan_entry_id, exercise_id, performed_on)`; an
  exercise used twice in one routine shares one log. The patient may only log an exercise that
  belongs to the routine reachable from the link, otherwise `unreachable` and no row.
- **Shared log helpers.** `src/lib/log-shared.ts` (parsing/validation shared by session and
  exercise logs, including "12,5" decimal commas) and `log-sheet.tsx` (`DayToggle`, `LogSheet` and
  the submit hooks) back the routine sheet, the exercise sheet and the workout bar. Both seen-logic
  paths (session and exercise comments) share `markSeen`, the unseen fragments and `useShownAsNew`.
- **Minutes display.** Aerobic durations are typed and shown in minutes ("30" or "1:30"); storage
  stays in seconds. The duration input drops `inputMode="numeric"` so "1:30" is typeable on iOS.
  The duration limit rose from 3 600 s to 14 400 s (4 h) for long aerobic sessions.
- **Old snapshots normalised in diffs.** Stored jsonb snapshots predate `days`, `distanceMeters`
  and `intensity` and are not re-parsed, so diff, diff view and restore treat a missing value as
  null/`[]` (restore backfills `EMPTY_SET`); otherwise old versions would show phantom changes.
- **No-video label.** The thumbnail button reads "Watch {name}" with a video and "About {name}"
  without one, since there is nothing to watch.
- **One Skip at a time in workout mode.** During a rest or a timed set Skip is the primary button
  and the timer row only has +15 s; during a hold Set done stays primary and the timer row has
  +15 s and an outline Skip.
- **Routine name is the workout `<h1>`;** the current exercise name in the bar is plain text, and
  list rows keep their `<h4>`.
- **Export.** Day notes use the key `Export.xlsx.notes` (the overview is a string, not a table)
  and the PDF shows them in the accent colour, not italic (no italic font is bundled).
- **Kind switch keeps data.** Switching an exercise from strength to aerobic keeps hidden
  reps/load stored (non-destructive, reversible), and `formatPrescription` still prints them.
- **Swipe guard.** Workout swipes ignore pointer events from sheets portalled out of the bar
  (the log sheet), so dragging inside a sheet no longer changes the set.
- **Activity grouping by `routineId`.** Exercise logs are grouped by day + routine id, so two
  same-named routines on one day stay separate.
- **Dashboard merge.** `buildDashboard` merges one session summary and one exercise summary per
  customer (counts summed, newest `latest` wins). Exercise pain >= 7 feeds "Needs attention" and
  exercise comments feed "New comments".
- **`exerciseKind` on `LoadedItem`.** `getRoutine` is typed by `LoadedItem`, so the aerobic kind is
  added there (spec 19 task 2) and carried through `EditorItem`/`ExerciseRef` by the editor, which
  avoids a typecheck break between the two steps.
- **Workout layout.** The exercise list and the bottom bar are capped at `max-w-2xl` on desktop.
  Four `Workout` message keys nothing uses any more (`noVideo`, `superset`, `notes`,
  `instructions`) were removed from `en` and `es`.
- **Row label.** `Patient.exercise.open` reads "Watch {name}" (es "Ver {name}") when the exercise
  has a video; without one the button uses "About {name}" (`detailTitle`), see above.
- **Workout resume unchanged.** The machine and sessionStorage key are the same as spec 12, so a
  saved state from the old player still resumes (the list highlights the resumed exercise).
