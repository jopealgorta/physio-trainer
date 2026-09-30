import { sql } from "drizzle-orm";
import { check, integer, smallint, text, type AnyPgColumn } from "drizzle-orm/pg-core";

// Relative imports: drizzle-kit loads the schema without the "@/" alias.
import {
  LOAD_MAX_LENGTH,
  PRESCRIPTION_LIMITS,
  PRESCRIPTION_NOTES_MAX_LENGTH,
} from "../../lib/prescription";
import { prescriptionSideEnum } from "./enums";

/**
 * Exercise defaults are no longer used by the app (spec 05); a follow-up chore PR drops these
 * columns from `exercises`. Routine items use itemPrescriptionColumns/setPrescriptionColumns.
 */
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

/** Per-exercise fields of a routine item (spec 05). */
export function itemPrescriptionColumns() {
  return {
    holdSeconds: smallint(),
    restSeconds: smallint(),
    side: prescriptionSideEnum(),
    notes: text(),
  };
}

/** Per-set fields of a routine item set (spec 05). */
export function setPrescriptionColumns() {
  return { reps: smallint(), repsMax: smallint(), durationSeconds: integer(), load: text() };
}

type PrescriptionColumns = Record<keyof ReturnType<typeof prescriptionColumns>, AnyPgColumn>;

const rangeCheck = (
  table: string,
  name: string,
  column: AnyPgColumn,
  { min, max }: { min: number; max: number },
) =>
  check(
    `${table}_${name}_range`,
    sql`${column} between ${sql.raw(String(min))} and ${sql.raw(String(max))}`,
  );

/** Database backstops for the zod limits in src/lib/prescription.ts. NULL passes every check. */
export function prescriptionChecks(table: string, c: PrescriptionColumns) {
  return [
    rangeCheck(table, "sets", c.sets, PRESCRIPTION_LIMITS.sets),
    rangeCheck(table, "reps", c.reps, PRESCRIPTION_LIMITS.reps),
    rangeCheck(table, "reps_max", c.repsMax, PRESCRIPTION_LIMITS.repsMax),
    rangeCheck(table, "duration_seconds", c.durationSeconds, PRESCRIPTION_LIMITS.durationSeconds),
    rangeCheck(table, "hold_seconds", c.holdSeconds, PRESCRIPTION_LIMITS.holdSeconds),
    rangeCheck(table, "rest_seconds", c.restSeconds, PRESCRIPTION_LIMITS.restSeconds),
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

/** Backstops for a routine item's per-exercise fields. */
export function itemPrescriptionChecks(
  table: string,
  c: Pick<PrescriptionColumns, "holdSeconds" | "restSeconds" | "notes">,
) {
  return [
    rangeCheck(table, "hold_seconds", c.holdSeconds, PRESCRIPTION_LIMITS.holdSeconds),
    rangeCheck(table, "rest_seconds", c.restSeconds, PRESCRIPTION_LIMITS.restSeconds),
    check(
      `${table}_notes_length`,
      sql`char_length(${c.notes}) <= ${sql.raw(String(PRESCRIPTION_NOTES_MAX_LENGTH))}`,
    ),
  ];
}

/** Backstops for a routine item set's fields. */
export function setPrescriptionChecks(
  table: string,
  c: Pick<PrescriptionColumns, "reps" | "repsMax" | "durationSeconds" | "load">,
) {
  return [
    rangeCheck(table, "reps", c.reps, PRESCRIPTION_LIMITS.reps),
    rangeCheck(table, "reps_max", c.repsMax, PRESCRIPTION_LIMITS.repsMax),
    rangeCheck(table, "duration_seconds", c.durationSeconds, PRESCRIPTION_LIMITS.durationSeconds),
    check(
      `${table}_reps_range_order`,
      sql`${c.repsMax} is null or (${c.reps} is not null and ${c.repsMax} > ${c.reps})`,
    ),
    check(
      `${table}_load_length`,
      sql`char_length(${c.load}) <= ${sql.raw(String(LOAD_MAX_LENGTH))}`,
    ),
  ];
}
