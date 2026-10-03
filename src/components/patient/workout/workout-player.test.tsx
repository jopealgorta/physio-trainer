import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../../messages/en.json";
import es from "../../../../messages/es.json";
import { workoutStorageKey } from "@/lib/workout/storage";
import type { PatientItem, PatientRoutine } from "@/server/patient/view";
import type { ExerciseLogging } from "../exercise-list";
import { WorkoutPlayer } from "./workout-player";

const m = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push, refresh: m.refresh }) }));
vi.mock("@/server/patient/actions", () => ({ logExerciseAction: vi.fn() }));

const item = (id: string, name: string, values: Partial<PatientItem> = {}): PatientItem => ({
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
    {
      reps: 10,
      repsMax: null,
      durationSeconds: null,
      load: null,
      distanceMeters: null,
      intensity: null,
    },
  ],
  ...values,
});

function routineOf(...items: PatientItem[]): PatientRoutine {
  return {
    id: "routine-1",
    name: "Knee rehab",
    notes: null,
    sessionsPerWeek: null,
    sessionsPerDay: null,
    blocks: items.map((it) => ({ kind: "single" as const, item: it })),
  };
}

const KEY = workoutStorageKey("7k2m9qpx", "routine-1", "2026-10-01");
const T0 = new Date("2026-10-01T10:00:00Z");

function setup(
  routine: PatientRoutine,
  locale: "en" | "es" = "en",
  finishSlot?: React.ReactNode,
  exerciseLogging?: ExerciseLogging,
) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      <WorkoutPlayer
        routine={routine}
        code="7k2m9qpx"
        today="2026-10-01"
        exitHref="/maria/ana-7k2m9qpx"
        label="Workout: Knee rehab"
        finishSlot={finishSlot}
        exerciseLogging={exerciseLogging}
      />
    </NextIntlClientProvider>,
  );
  return user;
}

const logging = (patch: Partial<ExerciseLogging> = {}): ExerciseLogging => ({
  code: "7k2m9qpx",
  routineId: "routine-1",
  entryId: null,
  days: [{ date: "2026-10-01", relative: "today" }],
  shownDate: "2026-10-01",
  logs: [],
  ...patch,
});

/** The bottom bar: the current set, its countdown and the controls. */
const bar = () => screen.getByRole("region", { name: "Current exercise" });
/** The list row of the exercise being done. */
const currentRow = () => {
  const rows = document.querySelectorAll<HTMLElement>('[aria-current="step"]');
  expect(rows).toHaveLength(1);
  return rows[0]!;
};
/** The bar and the list both name the current exercise. */
const expectCurrent = (name: string) => {
  expect(within(bar()).getByText(name, { selector: "p" })).toBeInTheDocument();
  expect(currentRow()).toHaveTextContent(name);
};

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(T0);
  window.sessionStorage.clear();
  m.push.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("WorkoutPlayer", () => {
  it("shows the first set with its target and the exercise position", () => {
    setup(
      routineOf(
        item("a", "Squat", {
          side: "alternating",
          notes: "Slow down",
          sets: [
            {
              reps: 8,
              repsMax: 12,
              durationSeconds: null,
              load: "5 kg",
              distanceMeters: null,
              intensity: null,
            },
          ],
        }),
        item("b", "Bridge"),
      ),
    );
    expect(screen.getByRole("region", { name: "Workout: Knee rehab" })).toBeInTheDocument();
    expectCurrent("Squat");
    expect(screen.getByText("Exercise 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Set 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("8–12 reps")).toBeInTheDocument();
    expect(screen.getByText("Load: 5 kg")).toBeInTheDocument();
    expect(screen.getByText("Left side")).toBeInTheDocument();
    expect(screen.getByText(/Slow down/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("rests after a set, waits for a tap when the rest ends, and finishes at the end", async () => {
    const user = setup(
      routineOf(
        item("a", "Squat", {
          restSeconds: 30,
          sets: [item("x", "x").sets[0]!, item("x", "x").sets[0]!],
        }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Set done" }));
    expect(screen.getByText("Up next")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("30");
    expect(screen.getByText("Set 2 of 2")).toBeInTheDocument();

    await advance(10_000);
    expect(screen.getByRole("timer")).toHaveTextContent("20");
    await user.click(screen.getByRole("button", { name: "Add 15 seconds" }));
    expect(screen.getByRole("timer")).toHaveTextContent("35");

    await advance(35_000);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByText("Rest over. Next: Squat.")).toBeInTheDocument();
    // Nothing started by itself: the set is still waiting for the patient.
    expect(screen.getByText("Set 2 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Set done" }));
    expect(screen.getByRole("heading", { name: "Well done!" })).toBeInTheDocument();
    expect(screen.getByText("You finished Knee rehab.")).toBeInTheDocument();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back to my plan" }));
    expect(m.push).toHaveBeenCalledWith("/maria/ana-7k2m9qpx");
  });

  it("hands off to the session log on the finish screen, and only there", async () => {
    const user = setup(
      routineOf(item("a", "Squat", { sets: [item("x", "x").sets[0]!] })),
      "en",
      <button type="button">Log session</button>,
    );
    expect(screen.queryByRole("button", { name: "Log session" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set done" }));
    expect(screen.getByRole("heading", { name: "Well done!" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to my plan" })).toBeInTheDocument();
  });

  it("skips a rest", async () => {
    const user = setup(routineOf(item("a", "Squat", { restSeconds: 60 })));
    await user.click(screen.getByRole("button", { name: "Set done" }));
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set done" })).toBeInTheDocument();
  });

  it("runs a timed set and moves into the rest when it ends", async () => {
    const timed = {
      reps: null,
      repsMax: null,
      durationSeconds: 45,
      load: null,
      distanceMeters: null,
      intensity: null,
    };
    const user = setup(routineOf(item("a", "Plank", { restSeconds: 20, sets: [timed, timed] })));
    expect(screen.queryByRole("button", { name: "Set done" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start timer" }));
    expect(screen.getByRole("timer")).toHaveTextContent("45");
    await advance(45_000);
    expect(screen.getByText("Up next")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("20");
    expect(screen.getByText("Set 2 of 2")).toBeInTheDocument();
  });

  it("offers an optional hold countdown that does not finish the set", async () => {
    const user = setup(routineOf(item("a", "Bridge", { holdSeconds: 10 })));
    await user.click(screen.getByRole("button", { name: "Hold 10 s" }));
    expect(screen.getByRole("timer")).toHaveTextContent("10");
    await advance(10_000);
    expect(screen.getByText("Hold finished.")).toBeInTheDocument();
    expect(screen.getByText("Set 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hold 10 s" })).toBeInTheDocument();
  });

  it("is on time after the tab was hidden for a minute", async () => {
    const user = setup(routineOf(item("a", "Squat", { restSeconds: 30 })));
    await user.click(screen.getByRole("button", { name: "Set done" }));
    // The browser froze every timer for 60 s: only the clock moved.
    vi.setSystemTime(new Date(T0.getTime() + 60_000));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByText("Set 2 of 2")).toBeInTheDocument();
  });

  it("moves between steps with previous and next", async () => {
    const user = setup(routineOf(item("a", "Squat"), item("b", "Bridge")));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expectCurrent("Bridge");
    expect(screen.getByText("Exercise 2 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expectCurrent("Squat");
    expect(screen.getByText("Set 2 of 2")).toBeInTheDocument();
  });

  it("lists every exercise of the routine and ticks the sets done", async () => {
    const user = setup(routineOf(item("a", "Squat"), item("b", "Bridge"), item("c", "Plank")));
    const names = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(names).toEqual(["1.Squat", "2.Bridge", "3.Plank"]);
    const dots = (row: HTMLElement) =>
      within(row)
        .getAllByTestId("set-dot")
        .map((dot) => dot.dataset.done);
    expect(dots(currentRow())).toEqual(["false", "false"]);
    await user.click(screen.getByRole("button", { name: "Set done" }));
    expect(dots(currentRow())).toEqual(["true", "false"]);
  });

  it("scrolls the current exercise into view as it changes", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const user = setup(routineOf(item("a", "Squat"), item("b", "Bridge")));
    scroll.mockClear();
    await user.click(screen.getByRole("button", { name: "Next" }));
    // Same exercise, next set: the list stays put.
    expect(scroll).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toHaveTextContent("Bridge");
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    scroll.mockRestore();
  });

  it("shows the distance and intensity targets of an aerobic set", () => {
    const aerobic = (distanceMeters: number, intensity: string | null) => ({
      reps: null,
      repsMax: null,
      durationSeconds: null,
      load: null,
      distanceMeters,
      intensity,
    });
    setup(
      routineOf(
        item("a", "Row", { kind: "aerobic", sets: [aerobic(2500, "Moderate")] }),
        item("b", "Run", { kind: "aerobic", sets: [aerobic(800, null)] }),
      ),
    );
    expect(within(bar()).getByText("2.5 km")).toBeInTheDocument();
    expect(within(bar()).getByText("Intensity: Moderate")).toBeInTheDocument();
  });

  it("logs the current exercise from the bar", async () => {
    const user = setup(
      routineOf(item("a", "Squat"), item("b", "Bridge")),
      "en",
      undefined,
      logging(),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(within(bar()).getByRole("button", { name: "Log exercise" }));
    expect(await screen.findByRole("dialog", { name: "How did Bridge go?" })).toBeInTheDocument();
  });

  describe("swipes", () => {
    /** A horizontal touch drag of 200 px to the left that starts and ends on `element`. */
    const swipeLeft = (element: HTMLElement) => {
      fireEvent.pointerDown(element, { pointerType: "touch", clientX: 250, clientY: 100 });
      fireEvent.pointerUp(element, { pointerType: "touch", clientX: 50, clientY: 100 });
    };

    it("moves to the next set when the bar is swiped", () => {
      setup(routineOf(item("a", "Squat")));
      swipeLeft(bar());
      expect(screen.getByText("Set 2 of 2")).toBeInTheDocument();
    });

    it("ignores drags inside the log sheet opened from the bar", async () => {
      const user = setup(routineOf(item("a", "Squat")), "en", undefined, logging());
      await user.click(within(bar()).getByRole("button", { name: "Log exercise" }));
      const dialog = await screen.findByRole("dialog", { name: "How did Squat go?" });
      // The sheet is portalled out of the bar, but React events still bubble to it.
      swipeLeft(within(dialog).getByRole("group", { name: "Pain (optional)" }));
      expect(screen.getByText("Set 1 of 2")).toBeInTheDocument();
    });
  });

  it("has no log button when nothing can be logged (the physio previewing)", () => {
    setup(routineOf(item("a", "Squat")), "en", undefined, logging({ days: [] }));
    expect(within(bar()).queryByRole("button", { name: "Log exercise" })).not.toBeInTheDocument();
  });

  it("next during a rest ends the rest and keeps the set that follows", async () => {
    const user = setup(routineOf(item("a", "Squat", { restSeconds: 30 })));
    await user.click(screen.getByRole("button", { name: "Set done" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByText("Set 2 of 2")).toBeInTheDocument();
  });

  it("leaves straight away at the start and asks first once under way", async () => {
    const user = setup(routineOf(item("a", "Squat"), item("b", "Bridge")));
    await user.click(screen.getByRole("button", { name: "Exit workout" }));
    expect(m.push).toHaveBeenCalledWith("/maria/ana-7k2m9qpx");
    m.push.mockReset();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Exit workout" }));
    expect(screen.getByRole("alertdialog", { name: "Leave this workout?" })).toBeInTheDocument();
    expect(m.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep going" }));
    expect(m.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Exit workout" }));
    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(m.push).toHaveBeenCalledWith("/maria/ana-7k2m9qpx");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("saves progress and resumes it after a reload", async () => {
    const routine = routineOf(item("a", "Squat"), item("b", "Bridge"));
    const user = setup(routine);
    await user.click(screen.getByRole("button", { name: "Set done" }));
    expect(JSON.parse(window.sessionStorage.getItem(KEY)!)).toEqual({
      stepIndex: 1,
      phase: "ready",
      endsAt: null,
    });
    // A fresh mount (a reload) picks up where it was.
    document.body.innerHTML = "";
    setup(routine);
    expect(screen.getByText("Set 2 of 2")).toBeInTheDocument();
  });

  it("highlights the exercise a saved state resumes at", () => {
    // Saved by the player before the list layout: same key, same shape.
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ stepIndex: 2, phase: "ready", endsAt: null }),
    );
    setup(routineOf(item("a", "Squat"), item("b", "Bridge")));
    expectCurrent("Bridge");
    expect(screen.getByText("Exercise 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Set 1 of 2")).toBeInTheDocument();
  });

  it("ignores a saved state that does not fit the routine", () => {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ stepIndex: 50, phase: "ready", endsAt: null }),
    );
    setup(routineOf(item("a", "Squat")));
    expect(screen.getByText("Set 1 of 2")).toBeInTheDocument();
  });

  it("toggles and remembers the sound", async () => {
    const user = setup(routineOf(item("a", "Squat")));
    const toggle = screen.getByRole("button", { name: "Sound on" });
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Sound off" })).toBeInTheDocument();
    expect(window.localStorage.getItem("workout:sound")).toBe("off");
    window.localStorage.removeItem("workout:sound");
  });

  describe("set-done effects", () => {
    const vibrate = vi.fn();
    beforeEach(() => {
      vibrate.mockReset();
      Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    });
    afterEach(() => {
      Reflect.deleteProperty(navigator, "vibrate");
      window.localStorage.removeItem("workout:sound");
    });

    it("pops a check over the bar, announces the set and vibrates briefly", async () => {
      const user = setup(routineOf(item("a", "Squat"), item("b", "Bridge")));
      expect(screen.queryByTestId("set-done-burst")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Set done" }));
      const burst = screen.getByTestId("set-done-burst");
      expect(burst).toHaveAttribute("data-big", "false");
      expect(screen.getByRole("status")).toHaveTextContent("Set 1 of 2 done.");
      expect(vibrate).toHaveBeenCalledWith([40]);

      await advance(1_000);
      expect(screen.queryByTestId("set-done-burst")).not.toBeInTheDocument();
    });

    it("makes more of the last set of an exercise", async () => {
      const user = setup(routineOf(item("a", "Squat"), item("b", "Bridge")));
      await user.click(screen.getByRole("button", { name: "Set done" }));
      await advance(1_000);
      await user.click(screen.getByRole("button", { name: "Set done" }));
      expect(screen.getByTestId("set-done-burst")).toHaveAttribute("data-big", "true");
      expect(screen.getByRole("status")).toHaveTextContent("Squat done.");
      expect(vibrate).toHaveBeenLastCalledWith([60, 50, 60, 50, 120]);
      // The confetti only comes with the bigger moment.
      await advance(1_000);
      expect(screen.getByTestId("set-done-burst")).toBeInTheDocument();
      await advance(1_000);
      expect(screen.queryByTestId("set-done-burst")).not.toBeInTheDocument();
    });

    it("celebrates a timed set that runs out, using the countdown's own beep", async () => {
      const timed = {
        reps: null,
        repsMax: null,
        durationSeconds: 5,
        load: null,
        distanceMeters: null,
        intensity: null,
      };
      const user = setup(routineOf(item("a", "Plank", { sets: [timed, timed] })));
      await user.click(screen.getByRole("button", { name: "Start timer" }));
      await advance(5_000);
      expect(screen.getByTestId("set-done-burst")).toHaveAttribute("data-big", "false");
      expect(screen.getByText("Time's up.")).toBeInTheDocument();
      expect(vibrate).toHaveBeenCalledTimes(1);
      expect(vibrate).toHaveBeenCalledWith([200]);
    });

    it("does not celebrate moving around, and stays quiet with the sound off", async () => {
      const user = setup(routineOf(item("a", "Squat")));
      await user.click(screen.getByRole("button", { name: "Next" }));
      await user.click(screen.getByRole("button", { name: "Previous" }));
      expect(screen.queryByTestId("set-done-burst")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Sound on" }));
      await user.click(screen.getByRole("button", { name: "Set done" }));
      expect(screen.getByTestId("set-done-burst")).toBeInTheDocument();
      expect(vibrate).not.toHaveBeenCalled();
    });
  });

  it("speaks Spanish", () => {
    setup(routineOf(item("a", "Sentadilla")), "es");
    expect(screen.getByText("Ejercicio 1 de 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Serie lista" })).toBeInTheDocument();
  });
});
