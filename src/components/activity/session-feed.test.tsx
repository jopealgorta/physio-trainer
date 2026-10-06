import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ActivitySession, ActivitySessionExercise } from "@/server/activity/queries";
import messages from "../../../messages/en.json";
import { SessionFeed } from "./session-feed";

const exercise = (patch: Partial<ActivitySessionExercise> = {}): ActivitySessionExercise => ({
  id: "e1",
  exerciseName: "Goblet squat",
  pain: null,
  rpe: 7,
  weightKg: null,
  setWeightsKg: [20, null, 25],
  comment: "Heavy",
  seen: false,
  ...patch,
});

const session = (patch: Partial<ActivitySession> = {}): ActivitySession => ({
  id: "s1",
  routineName: "Knee rehab",
  performedOn: "2026-10-03",
  completed: true,
  pain: 3,
  rpe: 6,
  comment: "Pinchy",
  seen: false,
  exercises: [exercise()],
  ...patch,
});

const feed = (sessions: ActivitySession[]) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    <SessionFeed sessions={sessions} />
  </NextIntlClientProvider>
);

describe("SessionFeed", () => {
  it("shows a session card with its values, comment and exercise lines", () => {
    render(feed([session()]));
    const region = screen.getByRole("region", { name: "Sessions" });
    const card = within(region).getAllByRole("listitem")[0]!;
    expect(within(card).getByText("Knee rehab")).toBeInTheDocument();
    expect(within(card).getByText("Oct 3, 2026")).toBeInTheDocument();
    expect(within(card).getByText("Done")).toBeInTheDocument();
    expect(within(card).getByText("Pain 3/10")).toBeInTheDocument();
    expect(within(card).getAllByText("RPE 6/10")).toHaveLength(1);
    expect(within(card).getByText("Pinchy")).toBeInTheDocument();
    expect(within(card).getAllByText("New")).toHaveLength(2);

    const line = within(card).getAllByRole("listitem")[0]!;
    expect(within(line).getByText("Goblet squat")).toBeInTheDocument();
    expect(within(line).getByText("20 · – · 25 kg")).toBeInTheDocument();
    expect(within(line).getByText("RPE 7/10")).toBeInTheDocument();
    expect(within(line).getByText("Heavy")).toBeInTheDocument();
    expect(within(line).getByText("New")).toBeInTheDocument();
  });

  it("marks an undone session", () => {
    render(feed([session({ completed: false, comment: null, seen: true })]));
    expect(screen.getByText("Not done")).toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });

  it("shows a legacy single weight and legacy pain", () => {
    render(
      feed([
        session({
          exercises: [
            exercise({ setWeightsKg: null, weightKg: 12.5, pain: 4, comment: null, seen: true }),
          ],
        }),
      ]),
    );
    expect(screen.getByText("12.5 kg")).toBeInTheDocument();
    expect(screen.getByText("Pain 4/10")).toBeInTheDocument();
  });

  it("says when there are none", () => {
    render(feed([]));
    expect(screen.getByText("No sessions logged yet.")).toBeInTheDocument();
  });

  it("keeps a comment new after the server marked it seen", () => {
    const { rerender } = render(feed([session()]));
    rerender(feed([session({ seen: true, exercises: [exercise({ seen: true })] })]));
    expect(screen.getAllByText("New")).toHaveLength(2);
  });
});
