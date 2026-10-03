import { env } from "@/env";
import { buildWorkoutPath } from "@/lib/patient-paths";

/** Workout mode (spec 12) is hidden unless `WORKOUT_MODE_ENABLED` is set. */
export const workoutModeEnabled = () => env.WORKOUT_MODE_ENABLED;

/** Where a routine's "Start workout" button goes, or undefined while workout mode is hidden. */
export function workoutHref(pagePath: string, routineId: string, entryId?: string | null) {
  return workoutModeEnabled() ? buildWorkoutPath(pagePath, routineId, entryId) : undefined;
}
