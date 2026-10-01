# 12 · Workout mode

- **Status:** Done
- **Feature:** C (patient workout mode)
- **Depends on:** 10 (13 integrates at the end)

## Summary

From any routine on the patient page, "Start" opens a full-screen guided mode: one exercise
at a time, looping video, set counter, hold and rest timers, and next/previous navigation.
It turns the link into something that feels like an app while the patient is exercising.

## Goals

- Step-through of the routine's items in order, with progress ("3 of 8").
- Per exercise: media, name, prescription, cues; set tracker (tap "Set done"). Note (spec 05):
  the prescription is per set (+ per item hold/rest/side); step through the item's sets in order
  and alternate set by set inside a superset, using the group's rest after each round.
- Timers: hold countdown (per rep), timed exercise countdown (`duration_seconds`), rest
  countdown between sets/exercises (`rest_seconds`), with skip/+15 s.
- Audio/vibration cues at timer end (optional, off by default on iOS until user interaction).
- Keep screen awake during the workout (Screen Wake Lock API where available).
- Finish screen → hands off to session logging (spec 13) if built, else "Well done".

## Non-goals

- Offline support (feature L, deferred) — but don't block it: state is client-side.
- Rep counting via camera/sensors.

## Routes and UI

- Route: `/{handle}/{slug}/workout/{routineId}` (routine must be reachable from the link; the
  plan entry id may be passed as `?entry=` for logging context).
- Full-screen layout: media top (≈ 45 % height), details and controls bottom; large touch
  targets (≥ 48 px); swipe left/right between exercises; landscape shows media left, controls
  right.
- Exit button with confirmation if in progress.

## Behaviour and rules

1. State machine (pure, in `src/lib/workout/machine.ts`): `exercise(i, set)` → `hold` →
   `rest` → next set / next exercise → `finished`. Unit-tested without React.
2. Timers use timestamps (`Date.now()` deltas), not interval counting, so backgrounding the tab
   doesn't drift. Resume correctly after the tab is hidden.
3. Side `alternating`/`both`: show "Left side" / "Right side" prompts per set when relevant.
4. Progress persists in `sessionStorage` per link+routine+date so a reload resumes.
5. Respect `prefers-reduced-motion` (no animated transitions) and provide text equivalents for
   all audio cues.

## Security and privacy

- Server resolves the link and verifies `routineId` is reachable from it (active single routine
  or an entry of an active plan for this customer). Media signed as in spec 10.

## i18n

Namespace `Workout`.

## Acceptance criteria

- [x] Start → step through all exercises with set tracking, hold/rest/timed countdowns, skip and back.
- [x] Timers accurate after backgrounding the tab for 60 s.
- [x] Wake lock held during workout where supported; released on exit.
- [x] Works one-handed on a 360 px wide phone; landscape layout.
- [x] Unreachable routine ids 404.

## Test plan

- Unit: state machine transitions and timer math (fake timers).
- Component: controls render per state.
- E2E (mobile): complete a 2-exercise routine with a hold and a rest using fake clock.

## Open questions

1. Should the rest timer auto-start the next set, or wait for the patient to tap?
   **Answer:** wait. When rest ends the app beeps/vibrates and shows the next set; nothing starts by
   itself.
2. How should the hold timer work? **Answer:** reps are not counted on the device. The patient
   sees the target reps and taps "Set done", which starts the rest. The hold is an optional
   countdown helper (a "Hold N s" button the patient can run per rep); it never gates anything.

## Decisions made during implementation

- **Route and access.** `/{handle}/{slug}-{code}/workout/{routineId}` resolves the link, applies the
  PIN gate and the stale-slug redirect exactly like the patient page (shared `getLinkAccess` in
  `src/server/patient/access.ts`). `getReachableRoutine` (`src/server/patient/view.ts`) answers
  "can this link reach this routine?" with the same scope predicates as `getPatientView`: a
  standalone active routine of the customer, a routine of an active plan entry on **any** weekday
  (the patient may do Friday's routine on Wednesday), or the one routine or plan a single-target
  link points at. A draft/archived routine, another customer's, or a malformed id is a 404.
  `isPatientPath` now also matches the workout path, otherwise the page would have lost the
  `no-store` / `noindex` / `no-referrer` headers.
- **Entry id.** The Start link carries `?entry={planEntryId}` for plan entries (spec 13 logs it).
  The workout page ignores it for now and keeps it through the canonical redirect.
- **Steps, not exercises.** The machine flattens a routine into one step per set
  (`buildSteps`); a superset alternates item by item inside each round and rests (the group's
  rest) after each round. Previous/next and swipes move one **step**, not one exercise, so a
  patient can redo or skip a single set. "Exercise 3 of 8" counts exercises; "Set 2 of 3" the sets.
- **Rest.** Per spec 05 an item rests `rest_seconds` after every set, including its last one (the
  rest before the next exercise); nothing rests after the very last step. When a rest ends the app
  beeps/vibrates and waits: nothing starts by itself (answer to open question 1).
- **Reps are not counted; hold is a helper** (answer to open question 2). A rep set shows its target
  and "Set done" ends it. A timed set (`duration_seconds`) runs a countdown and completes itself
  into the rest. An item's `hold_seconds` adds an optional "Hold N s" countdown on rep sets; it
  never gates "Set done". `both` shows "Both sides" as one prompt per set (no left-then-right
  splitting); `alternating` flips left/right per set; `left`/`right` stay fixed.
- **Timers.** Countdowns store `endsAt` and are applied by `tick`, each at its own end time, so a tab
  hidden for 60 s lands where the patient would be (a rest that ended meanwhile is not restarted).
  `tick` runs every 250 ms and on `visibilitychange`/`pageshow`.
- **Persistence.** `{stepIndex, phase, endsAt}` is saved in `sessionStorage` under
  `workout:{code}:{routineId}:{physioDay}` and validated against the routine's step count before
  resuming. The player mounts on the client only so its initial state comes straight from storage.
  Leaving (confirmed exit) or finishing clears it, so a reload on the "Well done" screen starts over.
- **Cues.** A Web Audio beep (no audio files) plus `navigator.vibrate`, created from a user gesture.
  Every cue also has a visible/`role="status"` message ("Rest over. Next: Squat."). The sound
  toggle is remembered in `localStorage` and is on by default.
- **Video.** Only the first YouTube video of an exercise is shown (muted, looping, playing as soon
  as the step shows, since the patient already tapped Start). Exercises without video show a
  placeholder.
- **Layout.** The player is a `fixed inset-0` overlay above the clinic header/footer of the patient
  layout (which only hands the client provider the `Workout` messages it needs). Media takes 40 dvh in
  portrait and the left half in landscape. No animations except the progress bar, which is
  `motion-safe`.
- **PIN gate.** If a patient opens a workout URL cold on a PIN-protected link, they unlock it and land
  on the patient page (the PIN action always returns to the link's main page), not the workout.
- **Spec 13 hand-off.** The finish screen is "Well done" + "Back to my plan"; spec 13 replaces it with
  its "mark as done" sheet.
