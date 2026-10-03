import {
  ROUTINE_NAME_MAX,
  ROUTINE_NOTES_MAX,
  SESSIONS_PER_DAY,
  SESSIONS_PER_WEEK,
} from "./routines";

/**
 * Client-side mirror of the header rules in the save action's schema. The action collapses every
 * validation failure into a bare "invalid", so the editor checks first and can point at fields.
 */
export type HeaderInput = {
  name: string;
  notes: string;
  sessionsPerWeek: string;
  sessionsPerDay: string;
};
export type HeaderField = "name" | "notes" | "sessionsPerWeek" | "sessionsPerDay";
export type HeaderErrorCode = "nameRequired" | "nameTooLong" | "notesTooLong" | "outOfRange";
export type HeaderErrors = Partial<Record<HeaderField, HeaderErrorCode>>;

export type HeaderValidation =
  | { ok: true; sessionsPerWeek: number | null; sessionsPerDay: number | null }
  | { ok: false; errors: HeaderErrors };

const FAILED = Symbol("invalid");

/** Blank is "not set" (null); otherwise a whole number inside the range, or FAILED. */
function parseSessions(value: string, { min, max }: { min: number; max: number }) {
  const text = value.trim();
  if (text === "") return null;
  if (!/^\d+$/.test(text)) return FAILED;
  const parsed = Number(text);
  return parsed >= min && parsed <= max ? parsed : FAILED;
}

/** The routine name's error, if any (the title checks it as soon as it is renamed). */
export function validateName(value: string): "nameRequired" | "nameTooLong" | null {
  const name = value.trim();
  if (name === "") return "nameRequired";
  return name.length > ROUTINE_NAME_MAX ? "nameTooLong" : null;
}

export function validateHeader(input: HeaderInput): HeaderValidation {
  const errors: HeaderErrors = {};
  const nameError = validateName(input.name);
  if (nameError) errors.name = nameError;
  if (input.notes.trim().length > ROUTINE_NOTES_MAX) errors.notes = "notesTooLong";

  const sessionsPerWeek = parseSessions(input.sessionsPerWeek, SESSIONS_PER_WEEK);
  const sessionsPerDay = parseSessions(input.sessionsPerDay, SESSIONS_PER_DAY);
  if (sessionsPerWeek === FAILED) errors.sessionsPerWeek = "outOfRange";
  if (sessionsPerDay === FAILED) errors.sessionsPerDay = "outOfRange";

  if (Object.keys(errors).length > 0 || sessionsPerWeek === FAILED || sessionsPerDay === FAILED) {
    return { ok: false, errors };
  }
  return { ok: true, sessionsPerWeek, sessionsPerDay };
}
