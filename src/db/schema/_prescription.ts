import { sql } from "drizzle-orm";
import { check, integer, smallint, text, type AnyPgColumn } from "drizzle-orm/pg-core";

// Relative imports: drizzle-kit loads the schema without the "@/" alias.
import {
  INTENSITY_MAX_LENGTH,
  LOAD_MAX_LENGTH,
  PRESCRIPTION_LIMITS,
  PRESCRIPTION_NOTES_MAX_LENGTH,
} from "../../lib/prescription";
import { prescriptionSideEnum } from "./enums";

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
  return {
    reps: smallint(),
    repsMax: smallint(),
    durationSeconds: integer(),
    load: text(),
    distanceMeters: integer(),
    intensity: text(),
  };
}

type PrescriptionColumns = Record<
  | keyof ReturnType<typeof itemPrescriptionColumns>
  | keyof ReturnType<typeof setPrescriptionColumns>,
  AnyPgColumn
>;

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
  c: Pick<
    PrescriptionColumns,
    "reps" | "repsMax" | "durationSeconds" | "load" | "distanceMeters" | "intensity"
  >,
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
    rangeCheck(table, "distance_meters", c.distanceMeters, PRESCRIPTION_LIMITS.distanceMeters),
    check(
      `${table}_intensity_length`,
      sql`char_length(${c.intensity}) <= ${sql.raw(String(INTENSITY_MAX_LENGTH))}`,
    ),
  ];
}
