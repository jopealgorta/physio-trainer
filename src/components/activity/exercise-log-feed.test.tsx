import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ActivityExerciseLog } from "@/server/activity/queries";
import messages from "../../../messages/en.json";
import { ExerciseLogFeed } from "./exercise-log-feed";

const log = (patch: Partial<ActivityExerciseLog> = {}): ActivityExerciseLog => ({
  id: "1",
  performedOn: "2026-10-03",
  routineName: "Knee rehab",
  routineId: "r1",
  exerciseName: "Goblet squat",
  pain: 3,
  rpe: 6,
  weightKg: 20,
  setWeightsKg: null,
  comment: "Pinchy",
  seen: false,
  ...patch,
});

const feed = (logs: ActivityExerciseLog[]) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    <ExerciseLogFeed logs={logs} />
  </NextIntlClientProvider>
);

describe("ExerciseLogFeed", () => {
  it("groups by day and routine and shows the values and a New badge", () => {
    render(
      feed([
        log(),
        log({
          id: "2",
          exerciseName: "Lunge",
          pain: null,
          rpe: null,
          weightKg: 12.5,
          comment: null,
          seen: true,
        }),
        log({ id: "3", performedOn: "2026-10-02", exerciseName: "Plank", seen: true }),
      ]),
    );
    expect(screen.getByRole("heading", { name: "Exercise log" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Oct 3, 2026 · Knee rehab",
      "Oct 2, 2026 · Knee rehab",
    ]);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("Goblet squat")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Pain 3/10 · RPE 6/10 · 20 kg")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Pinchy")).toBeInTheDocument();
    expect(within(items[0]!).getByText("New")).toBeInTheDocument();
    expect(within(items[1]!).getByText("12.5 kg")).toBeInTheDocument();
    expect(within(items[1]!).queryByText("New")).not.toBeInTheDocument();
  });

  it("keeps two routines with the same name on the same day apart", () => {
    render(feed([log(), log({ id: "2", routineId: "r2", exerciseName: "Lunge" })]));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
  });

  it("keeps a comment new after the server marked it seen", () => {
    const { rerender } = render(feed([log()]));
    rerender(feed([log({ seen: true })]));
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("says when there are none", () => {
    render(feed([]));
    expect(screen.getByText("No exercise logs yet.")).toBeInTheDocument();
  });
});
