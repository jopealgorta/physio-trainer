// Imported by the Drizzle schema via a relative path: keep this file free of "@/" imports
// and server-only modules.
import { isoWeekday } from "./calendar-date";
import { addDays } from "./phases";
import { WEEKDAYS } from "./plans";

/** Session log limits and pure helpers shared by the schema, the action and the UI (spec 13). */
export const LOG_COMMENT_MAX = 1000;
/** The Activity tab's feed shows this many of the newest sessions (spec 21). */
export const SESSIONS_LIMIT = 30;
export const PAIN_MIN = 0;
export const PAIN_MAX = 10;
/** 0..10, the values of the patient's pain control. */
export const PAIN_SCALE = Array.from({ length: PAIN_MAX - PAIN_MIN + 1 }, (_, i) => i + PAIN_MIN);
/** Borg CR10 rating of perceived exertion, optional on a session log. */
export const RPE_MIN = 0;
export const RPE_MAX = 10;
/** 0..10, the values of the patient's effort control. */
export const RPE_SCALE = Array.from({ length: RPE_MAX - RPE_MIN + 1 }, (_, i) => i + RPE_MIN);

/** Heaviest weight (kg) a patient can log for one exercise; one decimal. */
export const WEIGHT_MAX = 999.9;

/** Most set lines one exercise log holds (prescribed sets plus extras the patient adds). */
export const SET_WEIGHTS_MAX = 20;

/**
 * Parses what a patient typed as a weight in kg: comma or dot (also leading or trailing), rounded
 * to 0.1. Null when blank, undefined when it is not a number in 0..WEIGHT_MAX.
 */
export function parseWeight(value: string): number | null | undefined {
  const text = value.trim().replace(",", ".");
  if (text === "") return null;
  // "5", "5.5", and the halves a phone keyboard leaves: ".5", "5."
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return undefined;
  const rounded = Math.round(Number(text) * 10) / 10;
  return rounded <= WEIGHT_MAX ? rounded : undefined;
}

/**
 * A patient logs the day they do the session: today only, in the physio's time zone. Another day
 * is another session, so there is no logging after the fact.
 */
export const isLoggableDate = (date: string, today: string): boolean => date === today;

/** The date a weekday of the patient page's strip stands for: its day in the current Monday-Sunday week. */
export function dateForWeekday(today: string, weekday: number): string {
  return addDays(today, weekday - isoWeekday(today));
}

/** Trimmed comment, null when blank. Length is validated separately (`LOG_COMMENT_MAX`). */
export function normalizeComment(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** The days the patient page needs logs for: its Monday-Sunday week. */
export function weekLogRange(today: string): [from: string, to: string] {
  return [dateForWeekday(today, 1), dateForWeekday(today, 7)];
}

/** Weekdays of the page's week that have a completed session logged. */
export function loggedWeekdays(
  today: string,
  logs: readonly { performedOn: string; completed: boolean }[],
): number[] {
  const doneOn = new Set(logs.filter((entry) => entry.completed).map((entry) => entry.performedOn));
  return WEEKDAYS.filter((weekday) => doneOn.has(dateForWeekday(today, weekday)));
}

/** Set weights as stored: rounded to 0.1, no trailing unlogged sets, null when none is logged. */
export function normalizeSetWeights(
  values: readonly (number | null)[] | null,
): (number | null)[] | null {
  if (!values) return null;
  const rounded = values.map((v) => (v === null ? null : Math.round(v * 10) / 10));
  while (rounded.length > 0 && rounded.at(-1) === null) rounded.pop();
  return rounded.length === 0 ? null : rounded;
}

/** Per-set weights as one line: values joined with " · ", a set left empty as an en dash. */
export function formatSetWeights(
  weights: readonly (number | null)[],
  formatNumber: (kg: number) => string,
): string {
  return weights.map((kg) => (kg !== null ? formatNumber(kg) : "–")).join(" · ");
}
