import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkoutPage from "./page";

const { env, loadLink } = vi.hoisted(() => ({
  env: { WORKOUT_MODE_ENABLED: false },
  loadLink: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env }));
vi.mock("@/server/patient/load", () => ({ loadLink }));
vi.mock("@/server/patient/access", () => ({ getLinkAccess: vi.fn() }));
vi.mock("@/server/patient/log-exercise", () => ({ getPatientExerciseLogs: vi.fn() }));
vi.mock("@/server/patient/log-session", () => ({ getPatientLogs: vi.fn() }));
vi.mock("@/server/patient/view", () => ({
  getReachableRoutine: vi.fn(),
  isReachable: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`permanentRedirect:${url}`);
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const props = (handle: string, slug: string) => ({
  params: Promise.resolve({ handle, slug, routineId: "00000000-0000-4000-8000-000000000000" }),
  searchParams: Promise.resolve({ entry: "e1" }),
});

beforeEach(() => {
  vi.clearAllMocks();
  env.WORKOUT_MODE_ENABLED = false;
});

describe("WorkoutPage", () => {
  it("sends the patient back to their page while workout mode is hidden", async () => {
    await expect(WorkoutPage(props("ana", "plan-abcd2345"))).rejects.toThrow(
      "redirect:/ana/plan-abcd2345",
    );
    expect(loadLink).not.toHaveBeenCalled();
  });

  it("keeps the encoded segments as they came", async () => {
    await expect(WorkoutPage(props("an%C3%A1", "plan-abcd2345"))).rejects.toThrow(
      "redirect:/an%C3%A1/plan-abcd2345",
    );
  });

  it("resolves the link when workout mode is enabled", async () => {
    env.WORKOUT_MODE_ENABLED = true;
    loadLink.mockResolvedValue({ status: "not_found" });
    await expect(WorkoutPage(props("ana", "plan-abcd2345"))).rejects.toThrow("notFound");
    expect(loadLink).toHaveBeenCalled();
  });
});
