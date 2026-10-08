import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import type { PatientExerciseLog } from "@/server/patient/log-exercise";
import type { PatientLog } from "@/server/patient/log-session";
import type { PatientBlock, PatientItem } from "@/server/patient/view";
import { SessionSummary } from "./session-summary";
import { sessionSummary, type SessionSummaryData } from "./session-summary-data";

const item = (id: string, name: string): PatientItem => ({
  id,
  exerciseId: `ex-${id}`,
  kind: "strength",
  name,
  instructions: null,
  holdSeconds: null,
  restSeconds: null,
  side: null,
  notes: null,
  media: [],
  sets: [],
});
const blocks: PatientBlock[] = [
  { kind: "single", item: item("a", "Squat") },
  { kind: "group", key: "g", restSeconds: null, items: [item("b", "Bridge"), item("c", "Plank")] },
];
const exLog = (id: string, values: Partial<PatientExerciseLog> = {}): PatientExerciseLog => ({
  routineId: "r",
  entryId: null,
  exerciseId: `ex-${id}`,
  performedOn: "2026-10-07",
  rpe: null,
  setWeightsKg: null,
  comment: null,
  ...values,
});
const session = (values: Partial<PatientLog> = {}): PatientLog => ({
  routineId: "r",
  entryId: null,
  performedOn: "2026-10-07",
  completed: true,
  pain: null,
  rpe: null,
  comment: null,
  ...values,
});

describe("sessionSummary", () => {
  it("lists exercises in routine order across single and group blocks", () => {
    const result = sessionSummary({ sections: [{ key: "s", name: "", blocks }] }, session(), [
      exLog("c", { rpe: 5 }),
      exLog("a", { rpe: 7 }),
      exLog("b", { rpe: 6 }),
    ]);
    expect(result?.exercises.map((e) => e.name)).toEqual(["Squat", "Bridge", "Plank"]);
  });

  it("drops logs of exercises no longer in the routine", () => {
    const result = sessionSummary({ sections: [{ key: "s", name: "", blocks }] }, session(), [
      exLog("a", { rpe: 7 }),
      exLog("gone"),
    ]);
    expect(result?.exercises.map((e) => e.exerciseId)).toEqual(["ex-a"]);
  });

  it("is null when the session only says completed and there are no exercises", () => {
    expect(
      sessionSummary({ sections: [{ key: "s", name: "", blocks }] }, session(), []),
    ).toBeNull();
    expect(sessionSummary({ sections: [{ key: "s", name: "", blocks }] }, null, [])).toBeNull();
  });

  it("keeps a session comment with no exercises", () => {
    expect(
      sessionSummary(
        { sections: [{ key: "s", name: "", blocks }] },
        session({ comment: "Felt fine" }),
        [],
      ),
    ).toEqual({
      pain: null,
      rpe: null,
      comment: "Felt fine",
      exercises: [],
    });
  });
});

describe("SessionSummary", () => {
  it("shows the routine line and each exercise", () => {
    const summary: SessionSummaryData = {
      pain: 3,
      rpe: 6,
      comment: "Knee a bit sore",
      exercises: [
        {
          exerciseId: "ex-a",
          name: "Squat",
          setWeightsKg: [20, 22.5, 25],
          rpe: 7,
          comment: "Slow tempo",
        },
      ],
    };
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SessionSummary summary={summary} />
      </NextIntlClientProvider>,
    );
    const region = within(screen.getByRole("region", { name: "Logged" }));
    expect(region.getByText("Pain 3 · RPE 6")).toBeInTheDocument();
    expect(region.getByText("Knee a bit sore")).toBeInTheDocument();
    expect(region.getByText("Squat")).toBeInTheDocument();
    expect(region.getByText(/20 · 22\.5 · 25 kg · RPE 7/)).toBeInTheDocument();
    expect(region.getByText("Slow tempo")).toBeInTheDocument();
  });
});
