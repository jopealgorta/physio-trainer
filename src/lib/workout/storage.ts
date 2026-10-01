import { WORKOUT_PHASES, type WorkoutPhase, type WorkoutState } from "./machine";

type WorkoutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Progress is kept per link, routine and (physio) day, so tomorrow starts fresh (spec 12). */
export const workoutStorageKey = (code: string, routineId: string, today: string) =>
  `workout:${code}:${routineId}:${today}`;

const COUNTDOWNS: readonly WorkoutPhase[] = ["timed", "hold", "rest"];

/** The saved state if it is intact and fits a routine of `stepCount` steps, else null. */
export function loadWorkoutState(
  storage: WorkoutStorage,
  key: string,
  stepCount: number,
): WorkoutState | null {
  let value: unknown;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { stepIndex, phase, endsAt } = value as Record<string, unknown>;
  if (typeof stepIndex !== "number" || !Number.isInteger(stepIndex)) return null;
  if (typeof phase !== "string" || !WORKOUT_PHASES.includes(phase as WorkoutPhase)) return null;
  if (endsAt !== null && typeof endsAt !== "number") return null;

  const finished = phase === "finished";
  if (stepIndex < 0 || stepIndex > stepCount) return null;
  if (finished !== (stepIndex === stepCount)) return null;
  if (COUNTDOWNS.includes(phase as WorkoutPhase) !== (endsAt !== null)) return null;
  return { stepIndex, phase: phase as WorkoutPhase, endsAt };
}

export function saveWorkoutState(storage: WorkoutStorage, key: string, state: WorkoutState) {
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage is blocked or full: the workout still works, it just will not survive a reload.
  }
}

export function clearWorkoutState(storage: WorkoutStorage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
