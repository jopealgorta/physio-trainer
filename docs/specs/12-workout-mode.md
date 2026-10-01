# 12 · Workout mode

- **Status:** Not started
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

- [ ] Start → step through all exercises with set tracking, hold/rest/timed countdowns, skip and back.
- [ ] Timers accurate after backgrounding the tab for 60 s.
- [ ] Wake lock held during workout where supported; released on exit.
- [ ] Works one-handed on a 360 px wide phone; landscape layout.
- [ ] Unreachable routine ids 404.

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

(Fill in while building.)
