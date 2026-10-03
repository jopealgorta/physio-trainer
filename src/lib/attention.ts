import type { Adherence, LogFact } from "./adherence";
import { addDays } from "./phases";

/** "Needs attention" thresholds (spec 13, answer to open question 1). One place to tune them. */
export const ATTENTION = { highPain: 7, painRise: 3, lowAdherence: 0.5 } as const;

export type AttentionReason =
  | { rule: "highPain"; pain: number }
  | { rule: "painRise"; delta: number }
  | { rule: "lowAdherence"; percent: number };

/**
 * The windows the rules look at, as `[from, to]` inclusive: pain over the last 7 days (today
 * included) against the 7 before them, and adherence over the 7 days that ended yesterday, so a
 * session the patient has not done yet today never counts against them.
 */
export function attentionWindows(today: string) {
  return {
    recent: [addDays(today, -6), today],
    previous: [addDays(today, -13), addDays(today, -7)],
    adherence: [addDays(today, -7), addDays(today, -1)],
  } as const satisfies Record<string, readonly [string, string]>;
}

const inWindow = (date: string, [from, to]: readonly [string, string]) =>
  date >= from && date <= to;

function ratings(
  logs: readonly { performedOn: string; pain: number | null }[],
  window: readonly [string, string],
): number[] {
  return logs
    .filter((entry) => entry.pain !== null && inWindow(entry.performedOn, window))
    .map((entry) => entry.pain!);
}

const average = (values: readonly number[]) =>
  values.reduce((sum, n) => sum + n, 0) / values.length;

/**
 * Why a customer needs the physio's attention, in the order the dashboard lists the reasons
 * (empty = fine). `adherence` is over `attentionWindows(today).adherence`; the rule needs
 * something planned and a share link the patient can still use to log.
 */
export function needsAttention(input: {
  today: string;
  logs: readonly LogFact[];
  /** Pain rated on single exercises (spec 19); counts for `highPain` like a session's. */
  exercisePain: readonly { performedOn: string; pain: number | null }[];
  adherence: Adherence | null;
  hasLink: boolean;
}): AttentionReason[] {
  const windows = attentionWindows(input.today);
  const recent = ratings(input.logs, windows.recent);
  const previous = ratings(input.logs, windows.previous);
  const highest = [...recent, ...ratings(input.exercisePain, windows.recent)];
  const reasons: AttentionReason[] = [];

  if (highest.length > 0 && Math.max(...highest) >= ATTENTION.highPain) {
    reasons.push({ rule: "highPain", pain: Math.max(...highest) });
  }
  if (recent.length > 0 && previous.length > 0) {
    const delta = average(recent) - average(previous);
    // Averages of small integers: round to the tenth so 3.0000000000000004 still counts.
    if (Math.round(delta * 10) / 10 >= ATTENTION.painRise) {
      reasons.push({ rule: "painRise", delta: Math.round(delta * 10) / 10 });
    }
  }
  const { adherence, hasLink } = input;
  if (
    hasLink &&
    adherence !== null &&
    adherence.planned > 0 &&
    adherence.ratio !== null &&
    adherence.ratio < ATTENTION.lowAdherence
  ) {
    reasons.push({ rule: "lowAdherence", percent: Math.round(adherence.ratio * 100) });
  }
  return reasons;
}
