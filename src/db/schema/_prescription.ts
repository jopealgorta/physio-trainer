import { sql } from "drizzle-orm";
import { check, integer, smallint, text, type AnyPgColumn } from "drizzle-orm/pg-core";

// Relative imports: drizzle-kit loads the schema without the "@/" alias.
import {
  LOAD_MAX_LENGTH,
  PRESCRIPTION_LIMITS,
  PRESCRIPTION_NOTES_MAX_LENGTH,
} from "../../lib/prescription";
import { prescriptionSideEnum } from "./enums";

/** Prescription columns (architecture "Prescription fields"): exercise defaults and routine items. */
export function prescriptionColumns() {
  return {
    sets: smallint(),
    reps: smallint(),
    repsMax: smallint(),
    durationSeconds: integer(),
    holdSeconds: smallint(),
    restSeconds: smallint(),
    load: text(),
    side: prescriptionSideEnum(),
    notes: text(),
  };
}

type PrescriptionColumns = Record<keyof ReturnType<typeof prescriptionColumns>, AnyPgColumn>;

/** Database backstops for the zod limits in src/lib/prescription.ts. NULL passes every check. */
export function prescriptionChecks(table: string, c: PrescriptionColumns) {
  const range = (name: string, column: AnyPgColumn, { min, max }: { min: number; max: number }) =>
    check(
      `${table}_${name}_range`,
      sql`${column} between ${sql.raw(String(min))} and ${sql.raw(String(max))}`,
    );
  return [
    range("sets", c.sets, PRESCRIPTION_LIMITS.sets),
    range("reps", c.reps, PRESCRIPTION_LIMITS.reps),
    range("reps_max", c.repsMax, PRESCRIPTION_LIMITS.repsMax),
    range("duration_seconds", c.durationSeconds, PRESCRIPTION_LIMITS.durationSeconds),
    range("hold_seconds", c.holdSeconds, PRESCRIPTION_LIMITS.holdSeconds),
    range("rest_seconds", c.restSeconds, PRESCRIPTION_LIMITS.restSeconds),
    check(
      `${table}_reps_range_order`,
      sql`${c.repsMax} is null or (${c.reps} is not null and ${c.repsMax} > ${c.reps})`,
    ),
    check(
      `${table}_load_length`,
      sql`char_length(${c.load}) <= ${sql.raw(String(LOAD_MAX_LENGTH))}`,
    ),
    check(
      `${table}_notes_length`,
      sql`char_length(${c.notes}) <= ${sql.raw(String(PRESCRIPTION_NOTES_MAX_LENGTH))}`,
    ),
  ];
}
