// Imported by the Drizzle schema via a relative path: keep this file free of "@/" imports
// and server-only modules.
import { isCalendarDate } from "./calendar-date";

export const PHASE_LABEL_MAX = 40;

/** A routine or plan's date window; both bounds are `YYYY-MM-DD`, inclusive, null = open. */
export type PhaseWindow = { startsOn: string | null; endsOn: string | null };

export type WindowError = "startsInvalid" | "endsInvalid" | "endBeforeStart";

/** Add (or subtract) whole days to a `YYYY-MM-DD` calendar date. */
export function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** First problem with a window, or null. Empty bounds are fine. */
export function validateWindow({ startsOn, endsOn }: PhaseWindow): WindowError | null {
  if (startsOn !== null && !isCalendarDate(startsOn)) return "startsInvalid";
  if (endsOn !== null && !isCalendarDate(endsOn)) return "endsInvalid";
  if (startsOn !== null && endsOn !== null && endsOn < startsOn) return "endBeforeStart";
  return null;
}

/** True when two windows share at least one day. */
export function windowsOverlap(a: PhaseWindow, b: PhaseWindow): boolean {
  const aStartsBeforeBEnds = a.startsOn === null || b.endsOn === null || a.startsOn <= b.endsOn;
  const bStartsBeforeAEnds = b.startsOn === null || a.endsOn === null || b.startsOn <= a.endsOn;
  return aStartsBeforeBEnds && bStartsBeforeAEnds;
}

/**
 * New `ends_on` for a predecessor when its successor starts on `newStart`: the day before, unless
 * it already ends earlier. Not ok when that would end it before it starts.
 */
export function endPredecessor(
  previous: PhaseWindow,
  newStart: string,
): { ok: true; endsOn: string } | { ok: false } {
  const dayBefore = addDays(newStart, -1);
  if (previous.startsOn !== null && dayBefore < previous.startsOn) return { ok: false };
  const endsOn =
    previous.endsOn !== null && previous.endsOn < dayBefore ? previous.endsOn : dayBefore;
  return { ok: true, endsOn };
}

/**
 * Dialog defaults for "Copy into next phase" (the label is translated by the caller): start the
 * day after the current phase ends, or after today (or the current phase's later start) when it
 * has no end.
 */
export function nextPhaseDefaults(
  current: { startsOn?: string | null; endsOn: string | null },
  today: string,
) {
  const from = current.startsOn != null && current.startsOn > today ? current.startsOn : today;
  return {
    startsOn: addDays(current.endsOn ?? from, 1),
    endsOn: null as string | null,
    endCurrent: true,
  };
}

/**
 * Groups items into progression chains: connected components of the `previousId` links within
 * `items`. A predecessor outside `items` just makes its successor a chain start. Chains keep the
 * input order of their first member; members are ordered by start date (no start first).
 */
export function groupByChain<
  T extends { id: string; previousId: string | null; startsOn: string | null },
>(items: readonly T[]): T[][] {
  const parent = new Map<string, string>(items.map((item) => [item.id, item.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  for (const item of items) {
    if (item.previousId !== null && parent.has(item.previousId)) {
      parent.set(find(item.id), find(item.previousId));
    }
  }

  const chains = new Map<string, T[]>();
  for (const item of items) {
    const root = find(item.id);
    const chain = chains.get(root);
    if (chain) chain.push(item);
    else chains.set(root, [item]);
  }
  return [...chains.values()].map((chain) =>
    chain
      .map((item, index) => ({ item, index }))
      .sort((x, y) => {
        const xs = x.item.startsOn ?? "";
        const ys = y.item.startsOn ?? "";
        return xs < ys ? -1 : xs > ys ? 1 : x.index - y.index;
      })
      .map(({ item }) => item),
  );
}

/**
 * The number for the next phase's default label: the number after "phase" or "fase" in the label
 * plus one ("Phase 2 – strength" gives 3), else 2.
 */
export function nextPhaseNumber(label: string | null): number {
  const match = label === null ? null : /\b(?:phase|fase)\s*(\d+)/i.exec(label);
  return match ? Number(match[1]) + 1 : 2;
}

/**
 * What the "Copy into next phase" dialog shows before submitting: whether ending the current
 * phase the day before is impossible, and whether the new window would overlap the current one
 * (after it is ended, when `endCurrent` applies). Only an active phase is ended or can overlap.
 */
export function previewNextPhase(input: {
  current: PhaseWindow & { status: "draft" | "active" | "archived" };
  next: PhaseWindow;
  endCurrent: boolean;
}): { error: "startBeforePredecessor" | null; overlaps: boolean } {
  const { current, next } = input;
  if (input.endCurrent && current.status === "active" && next.startsOn !== null) {
    const ended = endPredecessor(current, next.startsOn);
    if (!ended.ok) return { error: "startBeforePredecessor", overlaps: false };
    return {
      error: null,
      overlaps: windowsOverlap({ startsOn: current.startsOn, endsOn: ended.endsOn }, next),
    };
  }
  // Only an active phase is ever shown to the patient, so only it can overlap the new one.
  return { error: null, overlaps: current.status === "active" && windowsOverlap(current, next) };
}
