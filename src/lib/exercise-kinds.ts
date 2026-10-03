/** What an exercise prescribes: strength (reps/load) or aerobic (time/distance/intensity). */
// No "@/" imports: drizzle-kit loads this file without the alias.
export const EXERCISE_KINDS = ["strength", "aerobic"] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];
