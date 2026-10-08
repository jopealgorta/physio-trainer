import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import type { PatientItem, PatientRoutine } from "@/server/patient/view";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  return {
    getTranslations: async ({ namespace }: { namespace: string }) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/patient/actions", () => ({ logExerciseAction: vi.fn() }));

import { RoutineView } from "./routine-view";

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
  sets: [
    {
      reps: 10,
      repsMax: null,
      durationSeconds: null,
      load: null,
      distanceMeters: null,
      intensity: null,
    },
  ],
});

const routine: PatientRoutine = {
  id: "routine-1",
  name: "Knee rehab",
  notes: null,
  sessionsPerWeek: null,
  sessionsPerDay: null,
  sections: [
    { key: "w", name: "Warm-up", blocks: [{ kind: "single", item: item("a", "Squat") }] },
    { key: "m", name: "Main", blocks: [{ kind: "single", item: item("b", "Bridge") }] },
  ],
};

async function setup(headingLevel?: 2 | 3) {
  const view = await RoutineView({ routine, locale: "en", headingLevel });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {view}
    </NextIntlClientProvider>,
  );
}

describe("RoutineView", () => {
  it("nests the section headings one level under the routine name", async () => {
    await setup(2);
    expect(screen.getByRole("heading", { level: 2, name: "Knee rehab" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Warm-up" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Main" })).toBeInTheDocument();
  });

  it("nests them under an h3 routine name (several routines) as h4", async () => {
    await setup();
    expect(screen.getByRole("heading", { level: 3, name: "Knee rehab" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Warm-up" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Main" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Warm-up" })).not.toBeInTheDocument();
  });
});
