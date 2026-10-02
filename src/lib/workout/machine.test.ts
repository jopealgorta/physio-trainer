import { describe, expect, it } from "vitest";

import { EMPTY_SET, type SetPrescription } from "@/lib/prescription";

import {
  adjust,
  buildSteps,
  completeSet,
  goTo,
  initialState,
  nextStep,
  remainingMs,
  skipTimer,
  startHold,
  startTimed,
  tick,
  type WorkoutBlock,
  type WorkoutItem,
} from "./machine";

const set = (values: Partial<SetPrescription> = {}): SetPrescription => ({
  ...EMPTY_SET,
  reps: 10,
  ...values,
});

const item = (id: string, values: Partial<WorkoutItem> = {}): WorkoutItem => ({
  id,
  holdSeconds: null,
  restSeconds: null,
  side: null,
  sets: [set(), set()],
  ...values,
});

const single = (it: WorkoutItem): WorkoutBlock => ({ kind: "single", item: it });

describe("buildSteps", () => {
  it("steps through an item's sets in order with its rest after each set", () => {
    const steps = buildSteps([single(item("a", { restSeconds: 30 })), single(item("b"))]);
    expect(steps.map((s) => [s.itemId, s.setIndex, s.setCount, s.restAfterSeconds])).toEqual([
      ["a", 0, 2, 30],
      ["a", 1, 2, 30],
      ["b", 0, 2, null],
      ["b", 1, 2, null],
    ]);
    expect(steps.map((s) => s.exerciseIndex)).toEqual([0, 0, 1, 1]);
  });

  it("alternates set by set inside a superset and rests only after each round", () => {
    const steps = buildSteps([
      {
        kind: "group",
        key: "g",
        restSeconds: 60,
        items: [item("a"), item("b", { sets: [set(), set()] })],
      },
      single(item("c", { sets: [set()] })),
    ]);
    expect(steps.map((s) => [s.itemId, s.setIndex, s.restAfterSeconds])).toEqual([
      ["a", 0, null],
      ["b", 0, 60],
      ["a", 1, null],
      ["b", 1, 60],
      ["c", 0, null],
    ]);
    expect(steps.map((s) => s.exerciseIndex)).toEqual([0, 1, 0, 1, 2]);
  });

  it("gives an item without sets one blank step", () => {
    const steps = buildSteps([single(item("a", { sets: [] }))]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ setIndex: 0, setCount: 1, durationSeconds: null });
  });

  it("carries the hold and the timed duration of the set", () => {
    const steps = buildSteps([
      single(item("a", { holdSeconds: 8, sets: [set({ durationSeconds: 45 }), set()] })),
    ]);
    expect(steps.map((s) => [s.holdSeconds, s.durationSeconds])).toEqual([
      [8, 45],
      [8, null],
    ]);
  });

  it("resolves the side prompt: fixed sides stay, alternating flips per set", () => {
    const sides = (side: WorkoutItem["side"]) =>
      buildSteps([single(item("a", { side, sets: [set(), set(), set()] }))]).map((s) => s.side);
    expect(sides(null)).toEqual([null, null, null]);
    expect(sides("left")).toEqual(["left", "left", "left"]);
    expect(sides("both")).toEqual(["both", "both", "both"]);
    expect(sides("alternating")).toEqual(["left", "right", "left"]);
  });
});

describe("transitions", () => {
  const steps = buildSteps([
    single(
      item("a", { restSeconds: 20, holdSeconds: 5, sets: [set(), set({ durationSeconds: 30 })] }),
    ),
    single(item("b", { sets: [set()] })),
  ]);
  const T0 = 1_000_000;

  it("starts ready on the first step", () => {
    expect(initialState()).toEqual({ stepIndex: 0, phase: "ready", endsAt: null });
  });

  it("completing a set starts the rest, which waits for a tap when it ends", () => {
    let state = completeSet(steps, initialState(), T0);
    expect(state).toEqual({ stepIndex: 1, phase: "rest", endsAt: T0 + 20_000 });
    expect(tick(steps, state, T0 + 19_999).phase).toBe("rest");
    state = tick(steps, state, T0 + 20_000);
    expect(state).toEqual({ stepIndex: 1, phase: "ready", endsAt: null });
  });

  it("moves straight on when a set has no rest, and finishes after the last set", () => {
    let state = goTo(steps, initialState(), 2);
    state = completeSet(steps, state, T0);
    expect(state).toEqual({ stepIndex: 3, phase: "finished", endsAt: null });
  });

  it("runs the hold as an optional countdown that returns to ready", () => {
    const started = startHold(steps, initialState(), T0);
    expect(started).toEqual({ stepIndex: 0, phase: "hold", endsAt: T0 + 5_000 });
    expect(tick(steps, started, T0 + 5_000)).toEqual({
      stepIndex: 0,
      phase: "ready",
      endsAt: null,
    });
    // The set can be finished while the hold is running.
    expect(completeSet(steps, started, T0 + 1_000).phase).toBe("rest");
  });

  it("ignores a hold on a step without one", () => {
    const state = goTo(steps, initialState(), 2);
    expect(startHold(steps, state, T0)).toBe(state);
  });

  it("runs a timed set and completes it into the rest when the countdown ends", () => {
    const ready = goTo(steps, initialState(), 1);
    const timed = startTimed(steps, ready, T0);
    expect(timed).toEqual({ stepIndex: 1, phase: "timed", endsAt: T0 + 30_000 });
    expect(tick(steps, timed, T0 + 29_000)).toBe(timed);
    // Next is exercise b (rest 20 s from item a), so the rest runs from the moment the set ended.
    expect(tick(steps, timed, T0 + 30_000)).toEqual({
      stepIndex: 2,
      phase: "rest",
      endsAt: T0 + 50_000,
    });
  });

  it("ignores a timed start on a rep set", () => {
    const state = initialState();
    expect(startTimed(steps, state, T0)).toBe(state);
  });

  it("catches up after the tab was hidden: timers expire at their own end time", () => {
    const ready = goTo(steps, initialState(), 1);
    const timed = startTimed(steps, ready, T0);
    // Hidden for 60 s: the timed set ended at +30 s and the rest at +50 s.
    expect(tick(steps, timed, T0 + 60_000)).toEqual({
      stepIndex: 2,
      phase: "ready",
      endsAt: null,
    });
    const resting = completeSet(steps, initialState(), T0);
    expect(tick(steps, resting, T0 + 60_000).phase).toBe("ready");
  });

  it("adds time to a running countdown and ignores other phases", () => {
    const resting = completeSet(steps, initialState(), T0);
    expect(adjust(resting, 15_000)).toEqual({ ...resting, endsAt: T0 + 35_000 });
    const ready = initialState();
    expect(adjust(ready, 15_000)).toBe(ready);
  });

  it("skips a countdown", () => {
    const resting = completeSet(steps, initialState(), T0);
    expect(skipTimer(steps, resting, T0)).toEqual({ stepIndex: 1, phase: "ready", endsAt: null });
    const hold = startHold(steps, initialState(), T0);
    expect(skipTimer(steps, hold, T0).phase).toBe("ready");
    const timed = startTimed(steps, goTo(steps, initialState(), 1), T0);
    expect(skipTimer(steps, timed, T0).phase).toBe("rest");
    const ready = initialState();
    expect(skipTimer(steps, ready, T0)).toBe(ready);
  });

  it("navigates: previous stops at the first step, next past the last finishes, back leaves finished", () => {
    expect(goTo(steps, initialState(), -1)).toEqual(initialState());
    expect(goTo(steps, initialState(), 99)).toEqual({
      stepIndex: steps.length,
      phase: "finished",
      endsAt: null,
    });
    expect(goTo(steps, completeSet(steps, initialState(), T0), 0)).toEqual(initialState());
    const finished = goTo(steps, initialState(), 99);
    expect(goTo(steps, finished, steps.length - 1)).toEqual({
      stepIndex: steps.length - 1,
      phase: "ready",
      endsAt: null,
    });
  });

  it("next skips the rest instead of the set after it, and otherwise skips one step", () => {
    const resting = completeSet(steps, initialState(), T0);
    expect(nextStep(steps, resting)).toEqual({ stepIndex: 1, phase: "ready", endsAt: null });
    expect(nextStep(steps, initialState())).toEqual({ stepIndex: 1, phase: "ready", endsAt: null });
    const last = goTo(steps, initialState(), steps.length - 1);
    expect(nextStep(steps, last).phase).toBe("finished");
    // Resting before the last step: next ends the rest, it does not finish the workout.
    const restingBeforeLast = completeSet(steps, goTo(steps, initialState(), 1), T0);
    expect(nextStep(steps, restingBeforeLast)).toEqual({
      stepIndex: 2,
      phase: "ready",
      endsAt: null,
    });
  });

  it("reports the time left, never below zero", () => {
    const resting = completeSet(steps, initialState(), T0);
    expect(remainingMs(resting, T0 + 5_000)).toBe(15_000);
    expect(remainingMs(resting, T0 + 99_000)).toBe(0);
    expect(remainingMs(initialState(), T0)).toBe(0);
  });
});
