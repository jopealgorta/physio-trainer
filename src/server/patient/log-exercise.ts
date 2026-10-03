import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { exerciseLogs, routineItems } from "@/db/schema";

import type { LogExerciseInput } from "./exercise-log-schema";
import type { ActiveLink, LinkShell } from "./resolve-link";
import { checkLoggable, patientLogScope, resetSeenOnNewComment } from "./log-shared";

export type { LogExerciseInput };

/** An exercise log as the patient sees it back: nothing about the physio's side. */
export type PatientExerciseLog = {
  routineId: string;
  entryId: string | null;
  exerciseId: string;
  performedOn: string;
  pain: number | null;
  rpe: number | null;
  weightKg: number | null;
  comment: string | null;
};

export type LogExerciseResult =
  { ok: true; data: PatientExerciseLog | null } | { ok: false; error: "date" | "unreachable" };

const patientColumns = {
  routineId: exerciseLogs.routineId,
  entryId: exerciseLogs.weeklyPlanEntryId,
  exerciseId: exerciseLogs.exerciseId,
  performedOn: exerciseLogs.performedOn,
  pain: exerciseLogs.pain,
  rpe: exerciseLogs.rpe,
  weightKg: exerciseLogs.weightKg,
  comment: exerciseLogs.comment,
};

/**
 * Saves, edits or clears (every field null) the log of one exercise of a routine on one day.
 * The link is already resolved and unlocked; customer, physio and link ids come from it. The
 * routine, plan entry and exercise come from the request: the routine and entry must be
 * reachable from the link and active that day, the exercise must belong to that routine, and the
 * day must be today or yesterday in the physio's time zone.
 */
export async function logExercise(
  shell: Pick<LinkShell, "physioId" | "timeZone">,
  link: Pick<ActiveLink, "id" | "target" | "customerId" | "routineId" | "weeklyPlanId">,
  input: LogExerciseInput,
  now: Date = new Date(),
): Promise<LogExerciseResult> {
  const refused = await checkLoggable(
    shell,
    link,
    { routineId: input.routineId, entryId: input.entryId },
    input.performedOn,
    now,
  );
  if (refused) return { ok: false, error: refused };

  const [item] = await db
    .select({ id: routineItems.id })
    .from(routineItems)
    .where(
      and(
        eq(routineItems.physioId, shell.physioId),
        eq(routineItems.routineId, input.routineId),
        eq(routineItems.exerciseId, input.exerciseId),
      ),
    )
    .limit(1);
  if (!item) return { ok: false, error: "unreachable" };

  if (
    input.pain === null &&
    input.rpe === null &&
    input.weightKg === null &&
    input.comment === null
  ) {
    await db
      .delete(exerciseLogs)
      .where(
        and(
          eq(exerciseLogs.physioId, shell.physioId),
          eq(exerciseLogs.customerId, link.customerId),
          eq(exerciseLogs.routineId, input.routineId),
          eq(exerciseLogs.exerciseId, input.exerciseId),
          eq(exerciseLogs.performedOn, input.performedOn),
          input.entryId === null
            ? sql`${exerciseLogs.weeklyPlanEntryId} is null`
            : eq(exerciseLogs.weeklyPlanEntryId, input.entryId),
        ),
      );
    return { ok: true, data: null };
  }

  const [row] = await db
    .insert(exerciseLogs)
    .values({
      physioId: shell.physioId,
      customerId: link.customerId,
      shareLinkId: link.id,
      routineId: input.routineId,
      weeklyPlanEntryId: input.entryId,
      exerciseId: input.exerciseId,
      performedOn: input.performedOn,
      pain: input.pain,
      rpe: input.rpe,
      weightKg: input.weightKg,
      comment: input.comment,
    })
    .onConflictDoUpdate({
      target: [
        exerciseLogs.routineId,
        exerciseLogs.weeklyPlanEntryId,
        exerciseLogs.exerciseId,
        exerciseLogs.performedOn,
      ],
      set: {
        shareLinkId: link.id,
        pain: input.pain,
        rpe: input.rpe,
        weightKg: input.weightKg,
        comment: input.comment,
        seenByPhysioAt: resetSeenOnNewComment(exerciseLogs),
      },
    })
    .returning(patientColumns);
  return { ok: true, data: row! };
}

/**
 * The exercise logs a link may show the patient between two days: the customer's own, narrowed
 * to the routine or plan a single-target link points at.
 */
export async function getPatientExerciseLogs(
  shell: Pick<LinkShell, "physioId">,
  link: Pick<ActiveLink, "target" | "customerId" | "routineId" | "weeklyPlanId">,
  from: string,
  to: string,
): Promise<PatientExerciseLog[]> {
  return db
    .select(patientColumns)
    .from(exerciseLogs)
    .where(patientLogScope(exerciseLogs, shell, link, from, to))
    .orderBy(
      asc(exerciseLogs.performedOn),
      asc(exerciseLogs.routineId),
      asc(exerciseLogs.createdAt),
    );
}
