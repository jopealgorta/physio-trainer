import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { SET_WEIGHTS_MAX } from "@/lib/session-logs";
import type { PatientExerciseLog } from "@/server/patient/log-exercise";
import type { PatientItem } from "@/server/patient/view";
import type { ExerciseLogging } from "./exercise-list";
import { ExerciseLogPanel, exerciseLogFor, numericLoad, type LogDraft } from "./exercise-log-panel";
import type { LoggableDay } from "./log-sheet";
import { AUTOSAVE_DELAY_MS } from "./use-autosave";

const m = vi.hoisted(() => ({ log: vi.fn() }));
vi.mock("@/server/patient/actions", () => ({ logExerciseAction: m.log }));

const ROUTINE = "3e473832-bc4d-475b-9a6a-0356874dc603";
const ENTRY = "af43053e-79a1-463a-881c-569985a6b8aa";
const SQUAT = "0b8f5f0e-8f53-4c39-9f0e-4f3f1f8c1a01";
const TODAY = "2026-10-07";
const YESTERDAY = "2026-10-06";

const prescribedSet = (load: string | null = null) => ({
  reps: 12,
  repsMax: null,
  durationSeconds: null,
  load,
  distanceMeters: null,
  intensity: null,
});

const squat: PatientItem = {
  id: "item-squat",
  exerciseId: SQUAT,
  kind: "strength",
  name: "Squat",
  instructions: null,
  holdSeconds: null,
  restSeconds: null,
  side: null,
  notes: null,
  media: [],
  sets: [prescribedSet("20 kg"), prescribedSet(), prescribedSet()],
};

const run: PatientItem = {
  ...squat,
  id: "item-run",
  name: "Run",
  kind: "aerobic",
  sets: [{ ...prescribedSet(), reps: null, durationSeconds: 1800 }],
};

const saved = (patch: Partial<PatientExerciseLog> = {}): PatientExerciseLog => ({
  routineId: ROUTINE,
  entryId: ENTRY,
  exerciseId: SQUAT,
  performedOn: TODAY,
  rpe: null,
  setWeightsKg: null,
  comment: null,
  ...patch,
});

const today: LoggableDay = { date: TODAY, relative: "today" };
const yesterday: LoggableDay = { date: YESTERDAY, relative: "yesterday" };

function setup({
  item = squat,
  logs = [],
  days = [today],
  locale = "en",
}: {
  item?: PatientItem;
  logs?: PatientExerciseLog[];
  days?: LoggableDay[];
  locale?: "en" | "es";
} = {}) {
  const remember = vi.fn();
  // What ExerciseList keeps per exercise and day: the fields as last typed.
  const drafts = new Map<string, LogDraft>();
  const logging: ExerciseLogging = {
    code: "7k2m9qpx",
    routineId: ROUTINE,
    entryId: ENTRY,
    days,
    shownDate: TODAY,
    logs,
  };
  const ui = (shown: boolean) => (
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      {shown ? (
        <ExerciseLogPanel
          id="log-squat"
          item={item}
          logging={logging}
          logFor={(date) => exerciseLogFor(logs, item.exerciseId, date)}
          remember={remember}
          draftFor={(date) => drafts.get(date)}
          keepDraft={(date, draft) => drafts.set(date, draft)}
        />
      ) : null}
    </NextIntlClientProvider>
  );
  const view = render(ui(true));
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  return { ...view, user, remember, hide: () => view.rerender(ui(false)) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const setInput = (number: number) => screen.getByLabelText(`Set ${number} weight in kg`);
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const sent = (patch: Record<string, unknown>) => ({
  routineId: ROUTINE,
  entryId: ENTRY,
  exerciseId: SQUAT,
  performedOn: TODAY,
  rpe: null,
  setWeightsKg: null,
  comment: null,
  ...patch,
});

beforeEach(() => {
  // Real time moves the fake clock too: Testing Library's async wrapper waits on a real tick.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  m.log.mockReset();
  m.log.mockImplementation(async (_code: string, input: PatientExerciseLog) => ({
    ok: true,
    data: { ...input },
  }));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("numericLoad", () => {
  it("reads a plain number of kg, nothing else", () => {
    expect(numericLoad("20")).toBe(20);
    expect(numericLoad("20 kg")).toBe(20);
    expect(numericLoad("12,5kg")).toBe(12.5);
    expect(numericLoad(" 7.5 KG ")).toBe(7.5);
    expect(numericLoad("light band")).toBeNull();
    expect(numericLoad("BW+5")).toBeNull();
    expect(numericLoad("")).toBeNull();
    expect(numericLoad(null)).toBeNull();
  });
});

describe("ExerciseLogPanel", () => {
  it("shows a weight input per prescribed set with its targets and placeholders", async () => {
    const { user } = setup();
    const panel = screen.getByRole("region", { name: "How did Squat go?" });
    expect(panel).toHaveAttribute("id", "log-squat");
    expect(within(panel).getByRole("group", { name: "Weight per set" })).toBeInTheDocument();
    expect(setInput(1)).toHaveAttribute("inputmode", "decimal");
    expect(setInput(1)).toHaveAttribute("enterkeyhint", "next");
    expect(setInput(3)).toHaveAttribute("enterkeyhint", "done");
    expect(screen.queryByLabelText("Set 4 weight in kg")).not.toBeInTheDocument();
    expect(screen.getByText("Set 1")).toBeInTheDocument();
    expect(screen.getAllByText(/12 reps/)).toHaveLength(3);
    expect(setInput(1)).toHaveAttribute("placeholder", "20");
    expect(setInput(2)).toHaveAttribute("placeholder", "");

    await user.type(setInput(1), "22,5");
    expect(setInput(2)).toHaveAttribute("placeholder", "22.5");
  });

  it("autosaves the set weights after a pause and says so", async () => {
    const { user, remember } = setup();
    await user.type(setInput(1), "22,5");
    expect(m.log).not.toHaveBeenCalled();
    await wait(AUTOSAVE_DELAY_MS);
    expect(m.log).toHaveBeenCalledTimes(1);
    expect(m.log).toHaveBeenCalledWith("7k2m9qpx", sent({ setWeightsKg: [22.5] }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(remember).toHaveBeenCalledWith(TODAY, sent({ setWeightsKg: [22.5] }));

    // A skipped set in between is stored as null.
    await user.type(setInput(3), "25");
    await wait(AUTOSAVE_DELAY_MS);
    expect(m.log).toHaveBeenCalledTimes(2);
    expect(m.log).toHaveBeenLastCalledWith("7k2m9qpx", sent({ setWeightsKg: [22.5, null, 25] }));
  });

  it("saves at once when a field loses focus", async () => {
    const { user } = setup();
    await user.type(setInput(1), "20");
    await user.tab();
    expect(m.log).toHaveBeenCalledWith("7k2m9qpx", sent({ setWeightsKg: [20] }));
  });

  it("moves to the next set on Enter, and leaves the last one", async () => {
    const { user } = setup();
    await user.type(setInput(1), "20{Enter}");
    expect(setInput(2)).toHaveFocus();
    await user.type(setInput(3), "25{Enter}");
    expect(setInput(3)).not.toHaveFocus();
    expect(m.log).toHaveBeenLastCalledWith("7k2m9qpx", sent({ setWeightsKg: [20, null, 25] }));
  });

  it("saves the RPE at once and the comment trimmed (empty: null)", async () => {
    const { user } = setup();
    await user.click(
      within(screen.getByRole("group", { name: "Effort (RPE)" })).getByRole("radio", {
        name: "6",
      }),
    );
    expect(m.log).toHaveBeenLastCalledWith("7k2m9qpx", sent({ rpe: 6 }));
    await wait(0);

    const comment = screen.getByLabelText("Comment (optional)");
    await user.type(comment, "  Felt good  ");
    await user.tab();
    expect(m.log).toHaveBeenLastCalledWith("7k2m9qpx", sent({ rpe: 6, comment: "Felt good" }));
    await wait(0);

    await user.clear(comment);
    await user.tab();
    expect(m.log).toHaveBeenLastCalledWith("7k2m9qpx", sent({ rpe: 6 }));
  });

  it("marks a weight that is not a number and saves nothing until it is fixed", async () => {
    const { user } = setup();
    await user.type(setInput(2), "abc");
    expect(setInput(2)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a weight between 0 and 999.9 kg.")).toBeInTheDocument();
    await wait(AUTOSAVE_DELAY_MS);
    expect(m.log).not.toHaveBeenCalled();

    await user.clear(setInput(2));
    await user.type(setInput(2), "20");
    expect(setInput(2)).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Enter a weight between 0 and 999.9 kg.")).not.toBeInTheDocument();
    await wait(AUTOSAVE_DELAY_MS);
    expect(m.log).toHaveBeenCalledWith("7k2m9qpx", sent({ setWeightsKg: [null, 20] }));
  });

  it("points an invalid weight at the message explaining it", async () => {
    const { user } = setup();
    await user.type(setInput(2), "abc");
    const message = screen.getByText("Enter a weight between 0 and 999.9 kg.");
    expect(message.id).not.toBe("");
    expect(setInput(2)).toHaveAttribute("aria-describedby", message.id);
    expect(setInput(1)).not.toHaveAttribute("aria-describedby");
  });

  it("drops a valid weight still waiting to be sent when it turns invalid", async () => {
    const { user } = setup();
    await user.type(setInput(1), "2x");
    await wait(AUTOSAVE_DELAY_MS);
    expect(m.log).not.toHaveBeenCalled();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("does not say Saved while a weight is invalid", async () => {
    const { user } = setup();
    await user.type(setInput(1), "20");
    await wait(AUTOSAVE_DELAY_MS);
    expect(screen.getByText("Saved")).toBeInTheDocument();
    await user.type(setInput(1), "x");
    await wait(AUTOSAVE_DELAY_MS);
    expect(m.log).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("announces Saved and errors, not every Saving", async () => {
    const save = deferred<{ ok: true; data: PatientExerciseLog }>();
    m.log.mockReturnValueOnce(save.promise);
    const { user, container } = setup();
    const live = container.querySelector("[aria-live]")!;
    await user.type(setInput(1), "20");
    await user.tab();
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(live.textContent).toBe("");
    await act(async () => save.resolve({ ok: true, data: saved({ setWeightsKg: [20] }) }));
    expect(live).toHaveTextContent("Saved");
  });

  it("sends all nulls when every field of a saved log is cleared", async () => {
    const { user } = setup({
      logs: [saved({ rpe: 7, setWeightsKg: [20, null, 25], comment: "Fine" })],
    });
    expect(setInput(1)).toHaveValue("20");
    expect(setInput(2)).toHaveValue("");
    expect(setInput(3)).toHaveValue("25");
    expect(screen.getByLabelText("Comment (optional)")).toHaveValue("Fine");
    await user.clear(setInput(1));
    await user.clear(setInput(3));
    await user.clear(screen.getByLabelText("Comment (optional)"));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await wait(AUTOSAVE_DELAY_MS);
    expect(m.log).toHaveBeenLastCalledWith("7k2m9qpx", sent({}));
  });

  it("shows a failed save with the reason and retries it", async () => {
    m.log.mockResolvedValueOnce({ ok: false, error: "date" });
    const { user } = setup();
    await user.type(setInput(1), "20");
    await wait(AUTOSAVE_DELAY_MS);
    expect(screen.getByText("Couldn't save.")).toBeInTheDocument();
    expect(screen.getByText("You can only log today or yesterday.")).toBeInTheDocument();
    expect(setInput(1)).toHaveValue("20");

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await wait(0);
    expect(m.log).toHaveBeenCalledTimes(2);
    expect(m.log).toHaveBeenLastCalledWith("7k2m9qpx", sent({ setWeightsKg: [20] }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("adds set lines up to the limit", async () => {
    const { user } = setup();
    const add = screen.getByRole("button", { name: "Add set" });
    await user.click(add);
    expect(screen.getByText("Set 4")).toBeInTheDocument();
    expect(setInput(4)).toHaveAttribute("placeholder", "");
    for (let lines = 4; lines < SET_WEIGHTS_MAX; lines++) await user.click(add);
    expect(setInput(SET_WEIGHTS_MAX)).toBeInTheDocument();
    expect(add).toBeDisabled();
  });

  it("removes an added set line, never a prescribed one, and saves at once", async () => {
    const { user } = setup();
    expect(screen.queryByRole("button", { name: /^Remove set/ })).not.toBeInTheDocument();
    await user.type(setInput(1), "20");
    await user.click(screen.getByRole("button", { name: "Add set" }));
    await user.type(setInput(4), "30");
    await wait(AUTOSAVE_DELAY_MS);
    expect(m.log).toHaveBeenLastCalledWith(
      "7k2m9qpx",
      sent({ setWeightsKg: [20, null, null, 30] }),
    );
    expect(screen.getAllByRole("button", { name: /^Remove set/ })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Remove set 4" }));
    expect(screen.queryByLabelText("Set 4 weight in kg")).not.toBeInTheDocument();
    // Focus stays in the list: on the set above the removed one.
    expect(setInput(3)).toHaveFocus();
    expect(m.log).toHaveBeenLastCalledWith("7k2m9qpx", sent({ setWeightsKg: [20] }));
  });

  it("shifts the later weights up when an added set in the middle is removed", async () => {
    const { user } = setup({ logs: [saved({ setWeightsKg: [20, 21, 22, 23, 24] })] });
    expect(screen.queryByRole("button", { name: "Remove set 3" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove set 4" }));
    expect(setInput(4)).toHaveValue("24");
    expect(screen.queryByLabelText("Set 5 weight in kg")).not.toBeInTheDocument();
    expect(m.log).toHaveBeenLastCalledWith("7k2m9qpx", sent({ setWeightsKg: [20, 21, 22, 24] }));
  });

  it("offers RPE and a comment only for an aerobic exercise", async () => {
    const { user } = setup({ item: run });
    expect(screen.queryByRole("group", { name: "Weight per set" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add set" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Effort (RPE)" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Comment (optional)"), "Easy pace");
    await wait(AUTOSAVE_DELAY_MS);
    expect(m.log).toHaveBeenCalledWith("7k2m9qpx", sent({ comment: "Easy pace" }));
  });

  it("sends what is pending when it closes", async () => {
    const { user, hide } = setup();
    await user.type(setInput(1), "20");
    hide();
    expect(m.log).toHaveBeenCalledWith("7k2m9qpx", sent({ setWeightsKg: [20] }));
  });

  it("saves the day being left before showing the other day's log", async () => {
    const { user } = setup({
      days: [yesterday, today],
      logs: [saved({ performedOn: YESTERDAY, setWeightsKg: [7.5] })],
    });
    expect(setInput(1)).toHaveValue("");
    await user.type(setInput(1), "20");
    await user.click(screen.getByRole("radio", { name: "Yesterday" }));
    expect(m.log).toHaveBeenCalledTimes(1);
    expect(m.log).toHaveBeenCalledWith("7k2m9qpx", sent({ setWeightsKg: [20] }));
    expect(setInput(1)).toHaveValue("7.5");
  });

  it("shows what was typed on coming back to a day whose save is still on the way", async () => {
    const save = deferred<{ ok: true; data: PatientExerciseLog }>();
    m.log.mockReturnValueOnce(save.promise);
    const { user } = setup({ days: [yesterday, today] });
    await user.type(setInput(1), "20");
    await user.click(screen.getByRole("radio", { name: "Yesterday" }));
    expect(m.log).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("radio", { name: "Today" }));
    expect(setInput(1)).toHaveValue("20");
    await act(async () => save.resolve({ ok: true, data: saved({ setWeightsKg: [20] }) }));
    expect(setInput(1)).toHaveValue("20");
  });

  it("keeps an invalid weight, unsaved, across a day switch", async () => {
    const { user } = setup({ days: [yesterday, today] });
    await user.type(setInput(2), "abc");
    await user.click(screen.getByRole("radio", { name: "Yesterday" }));
    expect(setInput(2)).toHaveValue("");
    await user.click(screen.getByRole("radio", { name: "Today" }));
    expect(setInput(2)).toHaveValue("abc");
    expect(setInput(2)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a weight between 0 and 999.9 kg.")).toBeInTheDocument();
    await wait(AUTOSAVE_DELAY_MS);
    expect(m.log).not.toHaveBeenCalled();
  });

  it("renders nothing when no day can be logged", () => {
    setup({ days: [] });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("speaks Spanish and formats weights with a decimal comma", () => {
    setup({ locale: "es", logs: [saved({ setWeightsKg: [12.5] })] });
    expect(screen.getByRole("region", { name: "¿Cómo te fue con Squat?" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Peso por serie" })).toBeInTheDocument();
    expect(screen.getByText("Serie 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Peso de la serie 1 en kg")).toHaveValue("12,5");
    expect(screen.getByLabelText("Peso de la serie 2 en kg")).toHaveAttribute(
      "placeholder",
      "12,5",
    );
    expect(screen.getByRole("button", { name: "Agregar serie" })).toBeInTheDocument();
  });
});
