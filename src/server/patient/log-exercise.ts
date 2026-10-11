import "server-only";

import { and, asc, eq, isNull, notExists, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { exerciseLogs, routineItems, sessionLogs } from "@/db/schema";

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
  rpe: number | null;
  setWeightsKg: (number | null)[] | null;
  comment: string | null;
};

export type LogExerciseResult =
  { ok: true; data: PatientExerciseLog | null } | { ok: false; error: "date" | "unreachable" };

const patientColumns = {
  routineId: exerciseLogs.routineId,
  entryId: exerciseLogs.weeklyPlanEntryId,
  exerciseId: exerciseLogs.exerciseId,
  performedOn: exerciseLogs.performedOn,
  rpe: exerciseLogs.rpe,
  setWeightsKg: exerciseLogs.setWeightsKg,
  comment: exerciseLogs.comment,
};

/**
 * Saves, edits or clears (effort, set weights and comment all null) the log of one exercise of a routine on one day.
 * The link is already resolved and unlocked; customer, physio and link ids come from it. The
 * routine, plan entry and exercise come from the request: the routine and entry must be
 * reachable from the link and active that day, the exercise must belong to that routine, and the
 * day must be today in the physio's time zone.
 *
 * Every exercise log belongs to the routine's session for that day (spec 21): the first log
 * creates it as done, later ones join it without changing it, and an undone session stays undone.
 * Clearing the last log deletes the session when it is empty (no pain, effort or comment).
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

  const scope = (column: AnyPgColumn) =>
    input.entryId === null ? isNull(column) : eq(column, input.entryId);

  // Saving and clearing the same session race (a clear may delete a session a save is joining),
  // so both take a transaction-scoped lock on the session key first.
  const lockSession = (tx: Pick<typeof db, "execute">) =>
    tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.routineId} || ':' || coalesce(${input.entryId}::text, '') || ':' || ${input.performedOn}::text, 0))`,
    );

  if (input.rpe === null && input.setWeightsKg === null && input.comment === null) {
    await db.transaction(async (tx) => {
      await lockSession(tx);
      const [removed] = await tx
        .delete(exerciseLogs)
        .where(
          and(
            eq(exerciseLogs.physioId, shell.physioId),
            eq(exerciseLogs.customerId, link.customerId),
            eq(exerciseLogs.routineId, input.routineId),
            eq(exerciseLogs.exerciseId, input.exerciseId),
            eq(exerciseLogs.performedOn, input.performedOn),
            scope(exerciseLogs.weeklyPlanEntryId),
          ),
        )
        .returning({ sessionLogId: exerciseLogs.sessionLogId });
      if (!removed) return;
      // the session was only created by its exercise logs: drop it once nothing else holds it
      await tx.delete(sessionLogs).where(
        and(
          eq(sessionLogs.physioId, shell.physioId),
          eq(sessionLogs.id, removed.sessionLogId),
          isNull(sessionLogs.pain),
          isNull(sessionLogs.rpe),
          isNull(sessionLogs.comment),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(exerciseLogs)
              .where(eq(exerciseLogs.sessionLogId, sessionLogs.id)),
          ),
        ),
      );
    });
    return { ok: true, data: null };
  }

  const row = await db.transaction(async (tx) => {
    // The advisory lock serialises every save and clear of this session key, so the session
    // found or created below cannot be deleted by a concurrent clear before the log is attached.
    // Find or create the routine's session for that day; an existing one is left untouched.
    await lockSession(tx);
    await tx
      .insert(sessionLogs)
      .values({
        physioId: shell.physioId,
        customerId: link.customerId,
        shareLinkId: link.id,
        routineId: input.routineId,
        weeklyPlanEntryId: input.entryId,
        performedOn: input.performedOn,
        completed: true,
      })
      .onConflictDoNothing({
        target: [sessionLogs.routineId, sessionLogs.weeklyPlanEntryId, sessionLogs.performedOn],
      });
    const [session] = await tx
      .select({ id: sessionLogs.id })
      .from(sessionLogs)
      .where(
        and(
          eq(sessionLogs.physioId, shell.physioId),
          eq(sessionLogs.customerId, link.customerId),
          eq(sessionLogs.routineId, input.routineId),
          eq(sessionLogs.performedOn, input.performedOn),
          scope(sessionLogs.weeklyPlanEntryId),
        ),
      )
      .limit(1);
    if (!session) throw new Error("session log missing after find-or-create");
    const sessionLogId = session.id;

    const [saved] = await tx
      .insert(exerciseLogs)
      .values({
        physioId: shell.physioId,
        customerId: link.customerId,
        shareLinkId: link.id,
        routineId: input.routineId,
        sessionLogId,
        weeklyPlanEntryId: input.entryId,
        exerciseId: input.exerciseId,
        performedOn: input.performedOn,
        rpe: input.rpe,
        setWeightsKg: input.setWeightsKg,
        // the patient no longer logs these: editing a legacy log replaces it with what they see
        pain: null,
        weightKg: null,
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
          sessionLogId,
          rpe: input.rpe,
          setWeightsKg: input.setWeightsKg,
          pain: null,
          weightKg: null,
          comment: input.comment,
          seenByPhysioAt: resetSeenOnNewComment(exerciseLogs),
        },
      })
      .returning(patientColumns);
    return saved!;
  });
  return { ok: true, data: row };
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
