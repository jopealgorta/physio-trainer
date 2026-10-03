import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import es from "../../../messages/es.json";
import type { PatientExerciseLog } from "@/server/patient/log-exercise";
import type { PatientBlock, PatientItem } from "@/server/patient/view";
import { ExerciseList, type ExerciseLogging } from "./exercise-list";

vi.mock("@/server/patient/actions", () => ({ logExerciseAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const ROUTINE = "3e473832-bc4d-475b-9a6a-0356874dc603";
const SQUAT = "0b8f5f0e-8f53-4c39-9f0e-4f3f1f8c1a01";
const TODAY = "2026-10-07";
const VIDEO = "dQw4w9WgXcQ";

const set = { reps: 12, repsMax: null, durationSeconds: null, load: null };
const item = (id: string, name: string, values: Partial<PatientItem> = {}): PatientItem => ({
  id,
  exerciseId: id === "squat" ? SQUAT : `ex-${id}`,
  kind: "strength",
  name,
  instructions: null,
  holdSeconds: null,
  restSeconds: null,
  side: null,
  notes: null,
  media: [],
  sets: [0, 1, 2].map(() => ({ ...set, distanceMeters: null, intensity: null })),
  ...values,
});

const squat = item("squat", "Squat", {
  instructions: "Keep your back straight.",
  notes: "Slowly on the way down",
  media: [{ videoId: VIDEO, isShort: false }],
});
const blocks: PatientBlock[] = [
  { kind: "single", item: squat },
  {
    kind: "group",
    key: "g1",
    restSeconds: 60,
    items: [item("bridge", "Bridge"), item("plank", "Plank")],
  },
];

const logging = (logs: PatientExerciseLog[] = []): ExerciseLogging => ({
  code: "7k2m9qpx",
  routineId: ROUTINE,
  entryId: null,
  days: [],
  shownDate: TODAY,
  logs,
});

function setup(
  props: Partial<React.ComponentProps<typeof ExerciseList>> = {},
  locale: "en" | "es" = "en",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      <ExerciseList blocks={blocks} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("ExerciseList", () => {
  it("renders a compact row per exercise with its prescription, and no video yet", () => {
    const { container } = setup();
    expect(screen.getByRole("heading", { level: 4, name: /Squat/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: /Bridge/ })).toBeInTheDocument();
    expect(screen.getAllByText("3 × 12").length).toBeGreaterThan(0);
    expect(screen.getByText("Slowly on the way down")).toHaveClass("line-clamp-1");
    expect(container.querySelector("iframe")).toBeNull();
    // Instructions live in the detail, not on the row.
    expect(screen.queryByText("Keep your back straight.")).not.toBeInTheDocument();
  });

  it("opens the detail with the video playing when the thumbnail is tapped", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Watch Squat" }));
    const dialog = screen.getByRole("dialog", { name: "Squat" });
    const iframe = dialog.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toContain(VIDEO);
    expect(iframe?.getAttribute("src")).toContain("autoplay=1");
    expect(within(dialog).getByText("Keep your back straight.")).toBeVisible();
    expect(within(dialog).getByText("3 × 12")).toBeInTheDocument();
  });

  it("opens the detail from the exercise name too", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Bridge" }));
    const dialog = screen.getByRole("dialog", { name: "Bridge" });
    expect(within(dialog).getByText("No video for this exercise")).toBeInTheDocument();
  });

  it("keeps supersets in their bracket", () => {
    setup();
    expect(screen.getByText("Superset · 2")).toBeInTheDocument();
    expect(screen.getByText("Rest 60 s after each round")).toBeInTheDocument();
  });

  it("marks the current exercise in workout mode and ticks its done sets", () => {
    setup({ currentItemId: "bridge", doneSets: { bridge: 2 } });
    const current = screen.getByRole("heading", { name: /Bridge/ }).closest("li");
    expect(current).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("heading", { name: /Squat/ }).closest("li")).not.toHaveAttribute(
      "aria-current",
    );
    const dots = within(current!).getAllByTestId("set-dot");
    expect(dots).toHaveLength(3);
    expect(dots.filter((dot) => dot.dataset.done === "true")).toHaveLength(2);
  });

  it("shows what is logged for the shown day as chips, locale-formatted", () => {
    const log: PatientExerciseLog = {
      routineId: ROUTINE,
      entryId: null,
      exerciseId: SQUAT,
      performedOn: TODAY,
      rpe: 6,
      setWeightsKg: [12.5, null, 15],
      comment: null,
    };
    const other = { ...log, performedOn: "2026-10-06", rpe: 9 };
    const { unmount } = setup({ logging: logging([other, log]) });
    expect(screen.getByText("RPE 6")).toBeInTheDocument();
    expect(screen.getByText("12.5 kg / - / 15 kg")).toBeInTheDocument();
    expect(screen.queryByText("RPE 9")).not.toBeInTheDocument();
    // Owner preview (no loggable days): chips only, no Log button.
    expect(screen.queryByRole("button", { name: "Log Squat" })).not.toBeInTheDocument();
    unmount();
    setup({ logging: logging([log]) }, "es");
    expect(screen.getByText("12,5 kg / - / 15 kg")).toBeInTheDocument();
  });

  it("offers a Log button per exercise when the day can be logged", () => {
    setup({ logging: { ...logging(), days: [{ date: TODAY, relative: "today" }] } });
    expect(screen.getByRole("button", { name: "Log Squat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log Plank" })).toBeInTheDocument();
  });
});
