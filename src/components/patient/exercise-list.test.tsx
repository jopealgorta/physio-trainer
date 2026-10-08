import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import es from "../../../messages/es.json";
import type { PatientExerciseLog } from "@/server/patient/log-exercise";
import type { PatientItem, PatientSection } from "@/server/patient/view";
import { ExerciseList, REFRESH_AFTER_SAVE_MS, type ExerciseLogging } from "./exercise-list";

const m = vi.hoisted(() => ({ log: vi.fn(), refresh: vi.fn() }));
vi.mock("@/server/patient/actions", () => ({ logExerciseAction: m.log }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));

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
const sections: PatientSection[] = [
  {
    key: "s1",
    name: "",
    blocks: [
      { kind: "single", item: squat },
      {
        kind: "group",
        key: "g1",
        restSeconds: 60,
        items: [item("bridge", "Bridge"), item("plank", "Plank")],
      },
    ],
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
      <ExerciseList sections={sections} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("ExerciseList sections", () => {
  const two: PatientSection[] = [
    { key: "a", name: "Warm-up", blocks: [{ kind: "single", item: item("w1", "Cat-cow") }] },
    { key: "empty", name: "Skipped", blocks: [] },
    {
      key: "b",
      name: "Main",
      blocks: [
        { kind: "single", item: item("m1", "Squat 2") },
        { kind: "single", item: item("m2", "Lunge") },
      ],
    },
  ];

  it("shows each name and numbers exercises across sections", () => {
    setup({ sections: two });
    expect(screen.getByRole("heading", { level: 3, name: "Warm-up" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Main" })).toBeInTheDocument();
    expect(screen.queryByText("Skipped")).not.toBeInTheDocument();
    const numbers = screen
      .getAllByRole("heading", { level: 4 })
      .map((h) => h.textContent?.match(/^\d+/)?.[0]);
    expect(numbers).toEqual(["1", "2", "3"]);
  });

  it("puts the section headings at the level it is given", () => {
    setup({ sections: two, sectionHeadingLevel: 4 });
    expect(screen.getByRole("heading", { level: 4, name: "Warm-up" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Main" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });

  it("shows no heading when only one section has exercises", () => {
    setup({ sections: [two[0]!, two[1]!] });
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: /Cat-cow/ })).toBeInTheDocument();
  });
});

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

  it("shows no logged chips; the Log toggle is the only trace, and only when loggable", () => {
    const log: PatientExerciseLog = {
      routineId: ROUTINE,
      entryId: null,
      exerciseId: SQUAT,
      performedOn: TODAY,
      rpe: 7,
      setWeightsKg: [20, null, 25],
      comment: null,
    };
    setup({ logging: logging([log]) });
    expect(screen.queryByRole("list", { name: "Logged" })).not.toBeInTheDocument();
    expect(screen.queryByText("RPE 7")).not.toBeInTheDocument();
    expect(screen.queryByText("20 · – · 25 kg")).not.toBeInTheDocument();
    // Owner preview (no loggable days): no Log toggle.
    expect(screen.queryByRole("button", { name: "Log Squat" })).not.toBeInTheDocument();
  });

  describe("inline log", () => {
    const loggable = (logs: PatientExerciseLog[] = []): ExerciseLogging => ({
      ...logging(logs),
      days: [{ date: TODAY, relative: "today" }],
    });

    beforeEach(() => {
      m.refresh.mockReset();
      m.log.mockReset();
      m.log.mockImplementation(async (_code: string, input: PatientExerciseLog) => ({
        ok: true,
        data: { ...input },
      }));
    });

    it("expands and collapses an exercise's log under its row", async () => {
      const user = userEvent.setup();
      setup({ logging: loggable() });
      const toggle = screen.getByRole("button", { name: "Log Squat" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("region", { name: "How did Squat go?" })).not.toBeInTheDocument();

      await user.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      const panel = screen.getByRole("region", { name: "How did Squat go?" });
      expect(toggle).toHaveAttribute("aria-controls", panel.id);
      // Inside the row's card.
      expect(toggle.closest("li")).toContainElement(panel);
      // Other rows stay closed; several can be open at once.
      expect(screen.getByRole("button", { name: "Log Plank" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await user.click(screen.getByRole("button", { name: "Log Plank" }));
      expect(screen.getAllByRole("region")).toHaveLength(2);

      await user.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("region", { name: "How did Squat go?" })).not.toBeInTheDocument();
    });

    it("updates the toggle as soon as the panel saves", async () => {
      const user = userEvent.setup();
      setup({ logging: loggable() });
      const toggle = screen.getByRole("button", { name: "Log Squat" });
      expect(toggle).not.toHaveClass("text-primary");
      await user.click(toggle);
      await user.type(screen.getByLabelText("Set 1 weight in kg"), "20");
      await user.tab();
      await act(async () => {});
      expect(m.log).toHaveBeenCalledTimes(1);
      expect(toggle).toHaveClass("text-primary");
    });

    it("reopens with what was typed while its save is still on the way", async () => {
      let resolve!: (result: { ok: true; data: PatientExerciseLog }) => void;
      m.log.mockReturnValueOnce(new Promise((r) => (resolve = r)));
      const user = userEvent.setup();
      setup({ logging: loggable() });
      const toggle = screen.getByRole("button", { name: "Log Squat" });
      await user.click(toggle);
      await user.type(screen.getByLabelText("Set 3 weight in kg"), "25");
      await user.click(toggle);
      expect(m.log).toHaveBeenCalledTimes(1);
      await user.click(toggle);
      expect(screen.getByLabelText("Set 3 weight in kg")).toHaveValue("25");

      const stored = m.log.mock.calls[0]![1] as PatientExerciseLog;
      await act(async () => resolve({ ok: true, data: stored }));
      expect(screen.getByLabelText("Set 3 weight in kg")).toHaveValue("25");
      await user.type(screen.getByLabelText("Set 1 weight in kg"), "20");
      await user.tab();
      expect(m.log).toHaveBeenLastCalledWith(
        "7k2m9qpx",
        expect.objectContaining({ setWeightsKg: [20, null, 25] }),
      );
    });

    it("reopens with an invalid weight still shown and unsaved", async () => {
      const user = userEvent.setup();
      setup({ logging: loggable() });
      const toggle = screen.getByRole("button", { name: "Log Squat" });
      await user.click(toggle);
      await user.type(screen.getByLabelText("Set 2 weight in kg"), "abc");
      await user.click(toggle);
      await user.click(toggle);
      expect(screen.getByLabelText("Set 2 weight in kg")).toHaveValue("abc");
      expect(screen.getByLabelText("Set 2 weight in kg")).toHaveAttribute("aria-invalid", "true");
      expect(m.log).not.toHaveBeenCalled();
    });

    describe("page data", () => {
      beforeEach(() => {
        // Real time moves the fake clock too: Testing Library's async wrapper waits on a real tick.
        vi.useFakeTimers({ shouldAdvanceTime: true });
      });
      afterEach(() => {
        vi.useRealTimers();
      });
      const wait = (ms: number) =>
        act(async () => {
          await vi.advanceTimersByTimeAsync(ms);
        });

      it("refreshes the page once, a while after the last save", async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        setup({ logging: loggable() });
        await user.click(screen.getByRole("button", { name: "Log Squat" }));
        await user.type(screen.getByLabelText("Set 1 weight in kg"), "20");
        await user.tab();
        await user.type(screen.getByLabelText("Set 2 weight in kg"), "25");
        await user.tab();
        await wait(0);
        expect(m.log).toHaveBeenCalledTimes(2);
        expect(m.refresh).not.toHaveBeenCalled();
        // The panel keeps what was typed across the refresh.
        await wait(REFRESH_AFTER_SAVE_MS);
        expect(m.refresh).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText("Set 2 weight in kg")).toHaveValue("25");
        await wait(REFRESH_AFTER_SAVE_MS * 2);
        expect(m.refresh).toHaveBeenCalledTimes(1);
      });

      it("does not refresh when nothing was saved", async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        setup({ logging: loggable() });
        await user.click(screen.getByRole("button", { name: "Log Squat" }));
        await user.type(screen.getByLabelText("Set 1 weight in kg"), "abc");
        await user.click(screen.getByRole("button", { name: "Log Squat" }));
        await wait(REFRESH_AFTER_SAVE_MS * 2);
        expect(m.log).not.toHaveBeenCalled();
        expect(m.refresh).not.toHaveBeenCalled();
      });
    });

    it("opens the rows it is told to when controlled", async () => {
      const user = userEvent.setup();
      const onOpenLogsChange = vi.fn();
      setup({ logging: loggable(), openLogs: new Set(["bridge"]), onOpenLogsChange });
      expect(screen.getByRole("region", { name: "How did Bridge go?" })).toBeInTheDocument();
      expect(screen.getAllByRole("region")).toHaveLength(1);
      await user.click(screen.getByRole("button", { name: "Log Squat" }));
      expect(onOpenLogsChange).toHaveBeenCalledWith(new Set(["bridge", "squat"]));
    });
  });
});
