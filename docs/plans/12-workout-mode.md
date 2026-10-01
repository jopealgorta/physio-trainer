# Plan: 12 · Workout mode

Spec: [`docs/specs/12-workout-mode.md`](../specs/12-workout-mode.md). Approved design (chat, 2026-10-01).

1. **Pure machine** `src/lib/workout/machine.ts` (test-first): `buildSteps` (item sets in order,
   superset rounds alternate, rest per step, side prompts), `initialState`, `startTimed`,
   `startHold`, `completeSet`, `tick` (catches up expired timers from their own `endsAt`, so a
   hidden tab does not drift), `adjust` (+15 s), `skip`, `goTo`, `remaining`.
2. **Browser helpers** (test-first where pure): `storage.ts` (sessionStorage key + validation),
   `cues.ts` (Web Audio beep, vibrate, mute preference), `use-wake-lock.ts`.
3. **Server**: `getReachableRoutine` in `src/server/patient/view.ts` sharing the link scope
   predicates with `getPatientView`; `src/server/patient/access.ts` shared PIN/owner gate; the
   workout page route; `isPatientPath` + `buildWorkoutPath` in `src/lib/patient-paths.ts`.
4. **UI** `src/components/patient/workout/`: `WorkoutPlayer` (state, timers, cues, swipe, exit
   confirmation), full-screen overlay layout (landscape split), "Start" button in `routine-view`.
5. **i18n**: `Workout` namespace and `Patient.workout.*` in `en` and `es`; layout hands the
   client provider `Workout` and `Prescription`.
6. **Tests**: unit (machine, storage, paths), component (player per phase), integration
   (`getReachableRoutine`), e2e mobile (2 exercises, hold, rest, fake clock, 404, PIN).
7. **Docs**: spec Status/decisions, index table.
