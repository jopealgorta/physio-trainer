# 20 · Inline exercise log (weight per set)

- **Status:** Done
- **Feature:** D (logging), extends 19
- **Depends on:** 13, 19

## Summary

Patients log each exercise inline, in an expandable section under the exercise row, instead of
a bottom sheet: the weight of every set, an RPE and a comment, saved automatically as they type.
The routine's "Mark as done" sheet stays, with its pain and RPE scales moved to the bottom and
made smaller.

## Goals

1. **Inline, expandable.** Each exercise row toggles a section inside its card. No modal.
2. **Weight per set.** One kg input per prescribed set (plus extra sets on demand).
3. **RPE and comment** under the sets, the comment last.
4. **Autosave.** No Save button; changes save after a short pause, on blur and on collapse.
5. **"Mark as done" sheet:** comment first, then pain and RPE as compact scales.

## Non-goals

- Pain per exercise: dropped from the patient UI (the column stays; old values still show to
  the physio). Pain is logged on the routine ("Mark as done").
- Reps actually done per set, or weight per repetition.
- Making "Mark as done" inline.
- Charts of set weights over time.

## User stories

- As a patient, I want to type the weight of each set right under the exercise, without a popup,
  so I can log between sets.
- As a patient, I don't want to press Save: what I type is kept.
- As a physio, I want to see the weight of every set in the Activity tab.

## Data model

All changes are additive (expand only).

### `exercise_logs` (spec 19)

| Column           | Type                | Notes                                                |
| ---------------- | ------------------- | ---------------------------------------------------- |
| `set_weights_kg` | numeric(5,1)[] null | index = set position; null elements = set not logged |

- Check: every non-null element between 0 and 999.9.
- The "at least one field" check becomes `num_nonnulls(pain, rpe, weight_kg, set_weights_kg,
comment) > 0`; the app never stores an empty or all-null array (normalised to null).
- `weight_kg` stays but is no longer written. A data migration copies existing values:
  `set_weights_kg = array[weight_kg]` where `weight_kg is not null`.
- The `updated_at` "patient changed it" trigger also fires on `set_weights_kg`.

## Routes and UI

No new routes.

### Patient page, exercise row

- The row's Log icon button becomes a disclosure toggle (`aria-expanded`, `aria-controls`),
  filled when the shown day has a log. Several rows can be open at once.
- The section renders inside the row's card, under the row, full width:
  1. Today / Yesterday toggle (single routines, as before; removed 2026-10-10, spec 13: today only).
  2. **Sets** (strength exercises): one line per prescribed set (at least one): "Set 1",
     the set's target ("10 reps · 20 kg") and a kg input (`inputMode="decimal"`,
     `enterKeyHint="next"`; Enter moves to the next set). Placeholder: the previous set's typed
     weight, else the set's prescribed load when it is a plain number. "+ Add set" appends a line
     (up to 20). Aerobic exercises show no set lines.
  3. **RPE**: compact CR10 scale.
  4. **Comment** textarea.
  5. Status line: "Saving…", "Saved", or "Couldn't save" with Retry.
- The collapsed row's chips show what is logged for the shown day: set weights
  ("20 · 22.5 · 25 kg", skipped sets as "–") and "RPE 7".

### Workout mode (hidden, spec 12)

The bottom bar's "Log exercise" expands the current exercise's section and scrolls it into view.
The exercise log sheet is removed.

### "Mark as done" sheet

Order: day toggle, comment, pain, RPE, Save/Clear. Pain and RPE scales are compact: one row of
11 small tiles (instead of two rows of big tiles), the hint/descriptor line kept.

### Physio Activity tab

Exercise logs show set weights ("20 · 22.5 · 25 kg") where they showed one weight; old rows
with only `weight_kg` keep showing it.

## Behaviour and rules

1. Logging rules of spec 13/19 unchanged (today/yesterday, reachable routine, exercise in the
   routine, a physio previewing never writes).
2. Autosave: 800 ms after the last change, immediately on blur of a field and on collapse /
   unmount. Saves of one exercise run one at a time; while one is in flight, only the latest
   pending values are sent next.
3. Every field empty (all set weights empty, no RPE, empty comment) deletes the log.
4. Set weights: 0–999.9, one decimal, `,` accepted. An invalid input is marked invalid and the
   section is not saved until it is fixed (other fields keep their values).
5. Trailing empty sets are trimmed before saving; inner empty sets are stored as null.
6. Switching the day saves pending changes for the previous day first, then shows that day's log.
7. A failed save keeps the typed values and shows "Couldn't save" with Retry.

## Security and privacy

Unchanged from spec 19: writes only through `src/server/patient/`, every id derived from the
resolved link, RLS on `exercise_logs`.

## i18n

`Patient.exerciseLog` gains set, add-set, autosave status and chip keys; unused pain/weight/save
keys of the exercise sheet are removed. en + es (voseo) in the same change.

## Acceptance criteria

- [x] The exercise row expands an inline section; no sheet opens for exercise logging.
- [x] The patient logs a weight per set, RPE and a comment; they autosave and survive a reload.
- [x] Clearing every field deletes the log.
- [x] Aerobic exercises show RPE and comment only.
- [x] The physio sees set weights in the Activity tab; old single-weight logs still show.
- [x] "Mark as done" shows comment before compact pain and RPE scales.
- [x] The workout bar's "Log exercise" opens the current exercise's inline section.

## Test plan

- Unit: schema (set weight normalisation, limits); set placeholders; autosave (debounce, blur,
  collapse, serial saves, clear deletes, error + retry); compact scales; sheet order; chips.
- Integration: upsert/delete with set weights, check constraints, migrated `weight_kg`, trigger.
- E2E (mobile): expand, log 3 set weights + RPE + comment, reload, physio Activity shows them;
  workout bar opens the inline section.

## Open questions

Answered 2026-10-03 before design:

1. "Weights of each rep": granularity? **Answer:** one weight per set.
2. Keep pain per exercise? **Answer:** no, drop it from the exercise log.
3. Save behaviour? **Answer:** autosave.
4. "Mark as done" inline too? **Answer:** keep the sheet, but push pain and RPE to the bottom and
   make them smaller.

## Decisions made during implementation

- **`numericArray` customType.** `exercise_logs.set_weights_kg` uses a local drizzle customType,
  because drizzle's `numeric().array()` maps null elements (skipped sets) to `NaN`.
- **Editing a legacy log clears its pain and single weight.** The patient no longer sees them
  (and the weight was migrated into the set weights), so saving writes `pain = null`,
  `weight_kg = null`.
- **No refresh per save.** The list does one debounced `router.refresh()` 1500 ms after the last
  save, so back/forward navigation does not restore stale logs that autosave would then overwrite.
- **`DayToggle` takes a `name`**, so several open panels do not share one radio group.
- **An aerobic exercise with a legacy weight still shows its set line**, so the weight can be
  cleared.
- **Two rows of the same exercise share one log** (logs are keyed by exercise); each row has its
  own open state and the last save wins.
- **Removing a set (2026-10).** A line the patient added past the prescribed sets has a remove
  button; later weights move up and it saves at once. Prescribed lines can't be removed (left
  empty, they read as not done). Spanish copy calls the RPE scale "Esfuerzo" (no "RPE").
- **The workout bar keeps its "Log exercise" button**; it toggles the inline panel and scrolls it
  into view (no dialog).
- **Drafts outlive the panel.** The list keeps each exercise and day's fields as last typed
  (invalid weights included) for as long as it is mounted, and a reopened panel shows them over
  the saved log, so a save still on the way or held back by an invalid weight is not lost.
