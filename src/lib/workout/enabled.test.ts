import { beforeEach, describe, expect, it, vi } from "vitest";

import { workoutHref } from "./enabled";

const { env } = vi.hoisted(() => ({ env: { WORKOUT_MODE_ENABLED: false } }));

vi.mock("@/env", () => ({ env }));

beforeEach(() => {
  env.WORKOUT_MODE_ENABLED = false;
});

describe("workoutHref", () => {
  it("is undefined while workout mode is hidden", () => {
    expect(workoutHref("/ana/plan-abc", "r1", "e1")).toBeUndefined();
  });

  it("builds the workout path when workout mode is enabled", () => {
    env.WORKOUT_MODE_ENABLED = true;
    expect(workoutHref("/ana/plan-abc", "r1", "e1")).toBe("/ana/plan-abc/workout/r1?entry=e1");
    expect(workoutHref("/ana/plan-abc", "r1")).toBe("/ana/plan-abc/workout/r1");
  });
});
