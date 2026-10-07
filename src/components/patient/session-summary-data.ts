import type { PatientExerciseLog } from "@/server/patient/log-exercise";
import type { PatientLog } from "@/server/patient/log-session";
import type { PatientRoutine } from "@/server/patient/view";

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

/**
 * What the routine's session holds for the shown day, or null when there is nothing to show.
 * Exercises come in routine order (first occurrence); logs of exercises no longer in the routine
 * are left out. `exerciseLogs` is already narrowed to the routine, entry and day.
 */
export function sessionSummary(
  routine: Pick<PatientRoutine, "blocks">,
  session: PatientLog | null,
  exerciseLogs: PatientExerciseLog[],
): SessionSummaryData | null {
  const items = routine.blocks.flatMap((block) =>
    block.kind === "single" ? [block.item] : block.items,
  );
  const seen = new Set<string>();
  const exercises: SessionSummaryData["exercises"] = [];
  for (const item of items) {
    if (seen.has(item.exerciseId)) continue;
    seen.add(item.exerciseId);
    const log = exerciseLogs.find((entry) => entry.exerciseId === item.exerciseId);
    if (!log) continue;
    exercises.push({
      exerciseId: item.exerciseId,
      name: item.name,
      setWeightsKg: log.setWeightsKg,
      rpe: log.rpe,
      comment: log.comment,
    });
  }
  const pain = session?.pain ?? null;
  const rpe = session?.rpe ?? null;
  const comment = session?.comment ?? null;
  if (pain === null && rpe === null && comment === null && exercises.length === 0) return null;
  return { pain, rpe, comment, exercises };
}
