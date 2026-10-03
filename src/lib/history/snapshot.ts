import { z } from "zod";
import { PRESCRIPTION_SIDES } from "../prescription";
import { ROUTINE_STATUSES } from "../routines";

export { VERSION_KINDS, type VersionKind } from "./kinds";

/**
 * Version snapshots (spec 15): the full state of a routine or plan at one moment, stored as
 * jsonb. The schema number lets the shape migrate later. Group keys are `g0`, `g1`... in order
 * of first appearance, items are sorted by `position`, entries by `(weekday, position)`.
 */
export const SNAPSHOT_SCHEMA = 1;

export const snapshotSetSchema = z.object({
  reps: z.number().nullable(),
  repsMax: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  load: z.string().nullable(),
  // Added after the first snapshots were stored: older ones parse with null.
  distanceMeters: z.number().nullable().default(null),
  intensity: z.string().nullable().default(null),
});
export type SnapshotSet = z.infer<typeof snapshotSetSchema>;

export const routineSnapshotSchema = z.object({
  schema: z.literal(1),
  routine: z.object({
    name: z.string(),
    notes: z.string().nullable(),
    status: z.enum(ROUTINE_STATUSES),
    caseId: z.string().nullable(),
    sessionsPerWeek: z.number().nullable(),
    sessionsPerDay: z.number().nullable(),
    phaseLabel: z.string().nullable(),
    startsOn: z.string().nullable(),
    endsOn: z.string().nullable(),
  }),
  groups: z.array(z.object({ key: z.string(), restSeconds: z.number().nullable() })),
  items: z.array(
    z.object({
      exercise: z.object({
        id: z.string(),
        name: z.string(),
        instructions: z.string().nullable(),
      }),
      position: z.number().int(),
      prescription: z.object({
        groupKey: z.string().nullable(),
        holdSeconds: z.number().nullable(),
        restSeconds: z.number().nullable(),
        side: z.enum(PRESCRIPTION_SIDES).nullable(),
        notes: z.string().nullable(),
        sets: z.array(snapshotSetSchema),
      }),
    }),
  ),
});

export const planSnapshotSchema = z.object({
  schema: z.literal(1),
  plan: z.object({
    name: z.string(),
    notes: z.string().nullable(),
    status: z.enum(ROUTINE_STATUSES),
    caseId: z.string().nullable(),
    phaseLabel: z.string().nullable(),
    startsOn: z.string().nullable(),
    endsOn: z.string().nullable(),
  }),
  entries: z.array(
    z.object({
      id: z.string(),
      weekday: z.number().int().min(1).max(7),
      position: z.number().int(),
      label: z.string().nullable(),
      routine: z.object({ id: z.string(), name: z.string(), version: z.number().int() }),
    }),
  ),
  // Added after the first snapshots were stored. Stored jsonb is not re-parsed, so readers must
  // treat a missing `days` as [] (the default only applies when a snapshot is parsed).
  days: z
    .array(z.object({ weekday: z.number().int().min(1).max(7), notes: z.string() }))
    .default([]),
});

export type RoutineSnapshot = z.infer<typeof routineSnapshotSchema>;
export type PlanSnapshot = z.infer<typeof planSnapshotSchema>;
