import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../../messages/en.json";
import es from "../../../../messages/es.json";
import { workoutStorageKey } from "@/lib/workout/storage";
import type { PatientItem, PatientRoutine } from "@/server/patient/view";
import { WorkoutPlayer } from "./workout-player";

const m = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));

const item = (id: string, name: string, values: Partial<PatientItem> = {}): PatientItem => ({
  id,
  name,
  instructions: null,
  holdSeconds: null,
  restSeconds: null,
  side: null,
  notes: null,
  media: [],
  sets: [
    { reps: 10, repsMax: null, durationSeconds: null, load: null },
    { reps: 10, repsMax: null, durationSeconds: null, load: null },
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

function setup(routine: PatientRoutine, locale: "en" | "es" = "en") {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      <WorkoutPlayer
        routine={routine}
        code="7k2m9qpx"
        today="2026-10-01"
        exitHref="/maria/ana-7k2m9qpx"
        label="Workout: Knee rehab"
      />
    </NextIntlClientProvider>,
  );
  return user;
}

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
          sets: [{ reps: 8, repsMax: 12, durationSeconds: null, load: "5 kg" }],
        }),
        item("b", "Bridge"),
      ),
    );
    expect(screen.getByRole("region", { name: "Workout: Knee rehab" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Squat" })).toBeInTheDocument();
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

  it("skips a rest", async () => {
    const user = setup(routineOf(item("a", "Squat", { restSeconds: 60 })));
    await user.click(screen.getByRole("button", { name: "Set done" }));
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set done" })).toBeInTheDocument();
  });

  it("runs a timed set and moves into the rest when it ends", async () => {
    const timed = { reps: null, repsMax: null, durationSeconds: 45, load: null };
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
    expect(screen.getByRole("heading", { name: "Bridge" })).toBeInTheDocument();
    expect(screen.getByText("Exercise 2 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByRole("heading", { name: "Squat" })).toBeInTheDocument();
    expect(screen.getByText("Set 2 of 2")).toBeInTheDocument();
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

  it("speaks Spanish", () => {
    setup(routineOf(item("a", "Sentadilla")), "es");
    expect(screen.getByText("Ejercicio 1 de 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Serie lista" })).toBeInTheDocument();
  });
});
