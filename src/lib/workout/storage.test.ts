import { describe, expect, it } from "vitest";

import type { WorkoutState } from "./machine";
import { loadWorkoutState, saveWorkoutState, workoutStorageKey } from "./storage";

function memory(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const KEY = workoutStorageKey("7k2m9qpx", "routine-1", "2026-10-01");

describe("workoutStorageKey", () => {
  it("is per link, routine and day", () => {
    expect(KEY).toBe("workout:7k2m9qpx:routine-1:2026-10-01");
    expect(workoutStorageKey("7k2m9qpx", "routine-1", "2026-10-02")).not.toBe(KEY);
  });
});

describe("loadWorkoutState", () => {
  const state: WorkoutState = { stepIndex: 2, phase: "rest", endsAt: 5000 };

  it("round-trips a saved state", () => {
    const storage = memory();
    saveWorkoutState(storage, KEY, state);
    expect(loadWorkoutState(storage, KEY, 6)).toEqual(state);
  });

  it("returns null when nothing is saved or storage fails", () => {
    expect(loadWorkoutState(memory(), KEY, 6)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadWorkoutState(broken, KEY, 6)).toBeNull();
    expect(() => saveWorkoutState(broken, KEY, state)).not.toThrow();
  });

  it.each([
    ["not json", "{nope"],
    ["not an object", "3"],
    ["unknown phase", JSON.stringify({ stepIndex: 0, phase: "dancing", endsAt: null })],
    ["fractional step", JSON.stringify({ stepIndex: 1.5, phase: "ready", endsAt: null })],
    ["step beyond the routine", JSON.stringify({ stepIndex: 6, phase: "ready", endsAt: null })],
    ["finished before the end", JSON.stringify({ stepIndex: 3, phase: "finished", endsAt: null })],
    ["countdown without an end", JSON.stringify({ stepIndex: 1, phase: "hold", endsAt: null })],
    ["ready with an end", JSON.stringify({ stepIndex: 1, phase: "ready", endsAt: 10 })],
  ])("drops %s", (_name, raw) => {
    const storage = memory();
    storage.setItem(KEY, raw);
    expect(loadWorkoutState(storage, KEY, 6)).toBeNull();
  });

  it("accepts a finished workout at the end", () => {
    const storage = memory();
    saveWorkoutState(storage, KEY, { stepIndex: 6, phase: "finished", endsAt: null });
    expect(loadWorkoutState(storage, KEY, 6)).toEqual({
      stepIndex: 6,
      phase: "finished",
      endsAt: null,
    });
  });
});
