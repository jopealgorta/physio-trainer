import type { PrescriptionSide, SetPrescription } from "@/lib/prescription";

/**
 * Workout mode state machine (spec 12). Pure: every function takes the clock as `now`
 * (milliseconds), so timers are timestamps and a hidden tab never drifts.
 */

export type WorkoutItem = {
  id: string;
  holdSeconds: number | null;
  restSeconds: number | null;
  side: PrescriptionSide | null;
  sets: SetPrescription[];
};

export type WorkoutBlock =
  | { kind: "single"; item: WorkoutItem }
  | { kind: "group"; key: string; restSeconds: number | null; items: WorkoutItem[] };

export type WorkoutSide = "left" | "right" | "both";

/** One set of one exercise, in the order the patient does it. */
export type WorkoutStep = {
  key: string;
  itemId: string;
  /** 0-based position of the exercise in the routine ("Exercise 3 of 8"). */
  exerciseIndex: number;
  setIndex: number;
  setCount: number;
  side: WorkoutSide | null;
  durationSeconds: number | null;
  holdSeconds: number | null;
  /** Rest after this set; null goes straight on to the next step. */
  restAfterSeconds: number | null;
};

export type WorkoutPhase = "ready" | "timed" | "hold" | "rest" | "finished";

/**
 * `stepIndex` is always the step being done or about to be done: during `rest` it is the step
 * after the rest, and once `finished` it equals the number of steps. `endsAt` is set exactly
 * for the countdown phases (`timed`, `hold`, `rest`).
 */
export type WorkoutState = {
  stepIndex: number;
  phase: WorkoutPhase;
  endsAt: number | null;
};

export const WORKOUT_PHASES: readonly WorkoutPhase[] = [
  "ready",
  "timed",
  "hold",
  "rest",
  "finished",
];

function sideOf(item: WorkoutItem, setIndex: number): WorkoutSide | null {
  if (item.side === null) return null;
  if (item.side === "alternating") return setIndex % 2 === 0 ? "left" : "right";
  return item.side;
}

/** Items with no sets still get one blank step so the patient sees the exercise. */
const setsOf = (item: WorkoutItem): SetPrescription[] =>
  item.sets.length > 0
    ? item.sets
    : [{ reps: null, repsMax: null, durationSeconds: null, load: null }];

/**
 * Flattens a routine into steps: an item's sets in order; a superset alternates set by set
 * through its items and rests (the group's rest) only after each round.
 */
export function buildSteps(blocks: WorkoutBlock[]): WorkoutStep[] {
  const steps: WorkoutStep[] = [];
  let exerciseIndex = 0;

  const push = (
    item: WorkoutItem,
    exercise: number,
    setIndex: number,
    setCount: number,
    restAfterSeconds: number | null,
  ) => {
    const set = setsOf(item)[setIndex] ?? setsOf(item)[0]!;
    steps.push({
      key: `${item.id}:${setIndex}`,
      itemId: item.id,
      exerciseIndex: exercise,
      setIndex,
      setCount,
      side: sideOf(item, setIndex),
      durationSeconds: set.durationSeconds,
      holdSeconds: item.holdSeconds,
      restAfterSeconds,
    });
  };

  for (const block of blocks) {
    if (block.kind === "single") {
      const count = setsOf(block.item).length;
      for (let setIndex = 0; setIndex < count; setIndex++) {
        push(block.item, exerciseIndex, setIndex, count, block.item.restSeconds);
      }
      exerciseIndex += 1;
      continue;
    }
    const rounds = Math.max(...block.items.map((item) => setsOf(item).length));
    for (let setIndex = 0; setIndex < rounds; setIndex++) {
      block.items.forEach((item, position) => {
        const last = position === block.items.length - 1;
        push(item, exerciseIndex + position, setIndex, rounds, last ? block.restSeconds : null);
      });
    }
    exerciseIndex += block.items.length;
  }
  return steps;
}

/** True when no later step does the same exercise: finishing step `index` ends that exercise. */
export function isLastSetOfExercise(steps: WorkoutStep[], index: number): boolean {
  const itemId = steps[index]?.itemId;
  return itemId !== undefined && steps.slice(index + 1).every((step) => step.itemId !== itemId);
}

export const initialState = (): WorkoutState => ({ stepIndex: 0, phase: "ready", endsAt: null });

const ready = (stepIndex: number): WorkoutState => ({ stepIndex, phase: "ready", endsAt: null });

/** Finishes the current set: into its rest if it has one, else on to the next step. */
export function completeSet(steps: WorkoutStep[], state: WorkoutState, now: number): WorkoutState {
  if (state.phase !== "ready" && state.phase !== "hold" && state.phase !== "timed") return state;
  const next = state.stepIndex + 1;
  if (next >= steps.length) return { stepIndex: steps.length, phase: "finished", endsAt: null };
  const rest = steps[state.stepIndex]?.restAfterSeconds ?? null;
  if (rest === null) return ready(next);
  return { stepIndex: next, phase: "rest", endsAt: now + rest * 1000 };
}

export function startTimed(steps: WorkoutStep[], state: WorkoutState, now: number): WorkoutState {
  const duration = steps[state.stepIndex]?.durationSeconds ?? null;
  if (state.phase !== "ready" || duration === null) return state;
  return { stepIndex: state.stepIndex, phase: "timed", endsAt: now + duration * 1000 };
}

export function startHold(steps: WorkoutStep[], state: WorkoutState, now: number): WorkoutState {
  const hold = steps[state.stepIndex]?.holdSeconds ?? null;
  if (state.phase !== "ready" || hold === null) return state;
  return { stepIndex: state.stepIndex, phase: "hold", endsAt: now + hold * 1000 };
}

/**
 * Applies every countdown that has run out by `now`, each at its own end time, so a tab that was
 * hidden for a minute lands where the patient would be and rests are not restarted on return.
 */
export function tick(steps: WorkoutStep[], state: WorkoutState, now: number): WorkoutState {
  let current = state;
  while (current.endsAt !== null && now >= current.endsAt) {
    const at = current.endsAt;
    current =
      current.phase === "timed" ? completeSet(steps, current, at) : ready(current.stepIndex);
  }
  return current;
}

/** Adds (or removes) time on a running countdown. */
export function adjust(state: WorkoutState, deltaMs: number): WorkoutState {
  if (state.endsAt === null) return state;
  return { ...state, endsAt: state.endsAt + deltaMs };
}

/** "Skip" on a countdown: ends it now (a skipped timed set rests from this moment). */
export function skipTimer(steps: WorkoutStep[], state: WorkoutState, now: number): WorkoutState {
  if (state.endsAt === null) return state;
  return tick(steps, { ...state, endsAt: now }, now);
}

/** Previous/next: jump to a step (ready), past the last one finishes, before the first stays. */
export function goTo(steps: WorkoutStep[], state: WorkoutState, index: number): WorkoutState {
  if (index >= steps.length) return { stepIndex: steps.length, phase: "finished", endsAt: null };
  return ready(Math.max(0, index));
}

/**
 * "Next": skips one step. While resting, `stepIndex` is already the set after the rest, so Next
 * just ends the rest instead of also skipping that set.
 */
export function nextStep(steps: WorkoutStep[], state: WorkoutState): WorkoutState {
  return state.phase === "rest" ? ready(state.stepIndex) : goTo(steps, state, state.stepIndex + 1);
}

export const remainingMs = (state: WorkoutState, now: number): number =>
  state.endsAt === null ? 0 : Math.max(0, state.endsAt - now);
