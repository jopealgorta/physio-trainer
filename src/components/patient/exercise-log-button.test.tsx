import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import es from "../../../messages/es.json";
import type { PatientExerciseLog } from "@/server/patient/log-exercise";
import type { ExerciseLogging } from "./exercise-list";
import { ExerciseLogButton } from "./exercise-log-button";

const m = vi.hoisted(() => ({ log: vi.fn(), refresh: vi.fn() }));
vi.mock("@/server/patient/actions", () => ({ logExerciseAction: m.log }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));

const ROUTINE = "3e473832-bc4d-475b-9a6a-0356874dc603";
const ENTRY = "af43053e-79a1-463a-881c-569985a6b8aa";
const EXERCISE = "0b8f5f0e-8f53-4c39-9f0e-4f3f1f8c1a01";
const TODAY = "2026-10-07";
const YESTERDAY = "2026-10-06";

const saved = (patch: Partial<PatientExerciseLog> = {}): PatientExerciseLog => ({
  routineId: ROUTINE,
  entryId: ENTRY,
  exerciseId: EXERCISE,
  performedOn: TODAY,
  rpe: null,
  setWeightsKg: [20],
  comment: null,
  ...patch,
});

const logging = (patch: Partial<ExerciseLogging> = {}): ExerciseLogging => ({
  code: "7k2m9qpx",
  routineId: ROUTINE,
  entryId: ENTRY,
  days: [{ date: TODAY, relative: "today" }],
  shownDate: TODAY,
  logs: [],
  ...patch,
});

function setup(
  props: Partial<React.ComponentProps<typeof ExerciseLogButton>> = {},
  locale: "en" | "es" = "en",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      <ExerciseLogButton
        logging={logging()}
        exerciseId={EXERCISE}
        exerciseName="Squat"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const rating = (group: string, name: string) =>
  within(screen.getByRole("group", { name: group })).getByRole("radio", { name });

beforeEach(() => {
  m.log.mockReset();
  m.refresh.mockReset();
  m.log.mockImplementation(async (_code, input) => ({ ok: true, data: { ...input } }));
});

describe("ExerciseLogButton", () => {
  it("saves RPE and a decimal-comma weight, closes and refreshes", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Log Squat" }));
    const dialog = screen.getByRole("dialog", { name: "How did Squat go?" });
    expect(dialog).toHaveAttribute("data-vaul-drawer");
    expect(dialog).toHaveAttribute("data-brand", "patient");
    await user.click(rating("Effort (RPE)", "6"));
    await user.type(within(dialog).getByLabelText("Weight (optional)"), "12,5");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(m.log).toHaveBeenCalled());
    expect(m.log).toHaveBeenCalledWith("7k2m9qpx", {
      routineId: ROUTINE,
      entryId: ENTRY,
      exerciseId: EXERCISE,
      performedOn: TODAY,
      rpe: 6,
      setWeightsKg: [12.5],
      comment: null,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(m.refresh).toHaveBeenCalled();
    // Logged now: the row button is filled.
    expect(screen.getByRole("button", { name: "Log Squat" })).toHaveClass("text-primary");
  });

  it("refuses a weight that is not a number, without saving", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Log Squat" }));
    const dialog = screen.getByRole("dialog");
    const weight = within(dialog).getByLabelText("Weight (optional)");
    await user.type(weight, "abc");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Enter a weight between 0 and 999.9 kg.")).toBeInTheDocument();
    expect(weight).toHaveAttribute("aria-invalid", "true");
    expect(m.log).not.toHaveBeenCalled();
  });

  it("prefills the shown day's log and clears it with all nulls", async () => {
    const user = userEvent.setup();
    m.log.mockResolvedValue({ ok: true, data: null });
    setup({ logging: logging({ logs: [saved({ comment: "Felt fine" })] }) }, "es");
    const button = screen.getByRole("button", { name: "Registrar Squat" });
    expect(button).toHaveClass("text-primary");
    await user.click(button);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Peso (opcional)")).toHaveValue("20");
    expect(within(dialog).getByLabelText("Comentario (opcional)")).toHaveValue("Felt fine");
    await user.click(within(dialog).getByRole("button", { name: "Borrar registro" }));

    await waitFor(() => expect(m.log).toHaveBeenCalled());
    expect(m.log).toHaveBeenCalledWith("7k2m9qpx", {
      routineId: ROUTINE,
      entryId: ENTRY,
      exerciseId: EXERCISE,
      performedOn: TODAY,
      rpe: null,
      setWeightsKg: null,
      comment: null,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Registrar Squat" })).not.toHaveClass("text-primary");
  });

  it("lets a single routine pick today or yesterday", async () => {
    const user = userEvent.setup();
    setup({
      logging: logging({
        entryId: null,
        days: [
          { date: YESTERDAY, relative: "yesterday" },
          { date: TODAY, relative: "today" },
        ],
        logs: [saved({ entryId: null, performedOn: YESTERDAY, setWeightsKg: [7.5] })],
      }),
    });
    await user.click(screen.getByRole("button", { name: "Log Squat" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Weight (optional)")).toHaveValue("");
    await user.click(within(dialog).getByRole("radio", { name: "Yesterday" }));
    expect(within(dialog).getByLabelText("Weight (optional)")).toHaveValue("7.5");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(m.log).toHaveBeenCalledWith(
        "7k2m9qpx",
        expect.objectContaining({ entryId: null, performedOn: YESTERDAY, setWeightsKg: [7.5] }),
      ),
    );
  });

  it("shows the action's error and keeps the sheet open", async () => {
    const user = userEvent.setup();
    m.log.mockResolvedValue({ ok: false, error: "unreachable" });
    setup();
    await user.click(screen.getByRole("button", { name: "Log Squat" }));
    const dialog = screen.getByRole("dialog");
    await user.click(rating("Effort (RPE)", "4"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("This exercise was not part of your plan on that day."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens at once in the workout bar", async () => {
    setup({ variant: "bar", defaultOpen: true });
    expect(await screen.findByRole("dialog", { name: "How did Squat go?" })).toBeInTheDocument();
  });

  it("says what it does in the workout bar", async () => {
    const user = userEvent.setup();
    setup({ variant: "bar" });
    const button = screen.getByRole("button", { name: "Log exercise" });
    expect(button).toHaveTextContent("Log exercise");
    await user.click(button);
    expect(screen.getByRole("dialog", { name: "How did Squat go?" })).toBeInTheDocument();
  });

  it("renders nothing when no day can be logged", () => {
    const { container } = setup({ logging: logging({ days: [], logs: [saved()] }) });
    expect(container).toBeEmptyDOMElement();
  });
});
