import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import es from "../../../messages/es.json";
import type { PatientLog } from "@/server/patient/log-session";
import { LogSessionButton } from "./log-session-button";

const m = vi.hoisted(() => ({ log: vi.fn(), refresh: vi.fn() }));
vi.mock("@/server/patient/actions", () => ({ logSessionAction: m.log }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));

const ROUTINE = "3e473832-bc4d-475b-9a6a-0356874dc603";
const ENTRY = "af43053e-79a1-463a-881c-569985a6b8aa";
const TODAY = "2026-10-07";
const YESTERDAY = "2026-10-06";

const log = (patch: Partial<PatientLog> = {}): PatientLog => ({
  routineId: ROUTINE,
  entryId: null,
  performedOn: TODAY,
  completed: true,
  pain: null,
  comment: null,
  ...patch,
});

function setup(
  props: Partial<React.ComponentProps<typeof LogSessionButton>> = {},
  locale: "en" | "es" = "en",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      <LogSessionButton
        code="7k2m9qpx"
        routineId={ROUTINE}
        entryId={null}
        routineName="Knee rehab"
        days={[{ date: TODAY, relative: "today" }]}
        logs={[]}
        shownDate={TODAY}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  m.log.mockReset();
  m.refresh.mockReset();
  m.log.mockImplementation(async (_code, input) => ({ ok: true, data: { ...input } }));
});

describe("LogSessionButton", () => {
  it("offers to mark the routine as done", () => {
    setup();
    expect(screen.getByRole("button", { name: "Mark as done" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens straight away with focus inside (the workout's finish screen)", async () => {
    setup({ defaultOpen: true });
    const dialog = await screen.findByRole("dialog", { name: "How did it go?" });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
  });

  it("lays its parts out in the row around it: Mark as done shares it, Edit stays compact", () => {
    const { container, unmount } = setup();
    // No box of its own, so it sits next to Start workout in the routine's row.
    expect(container.firstElementChild).toHaveClass("contents");
    expect(screen.getByRole("button", { name: "Mark as done" })).toHaveClass("h-12", "flex-1");
    unmount();
    setup({ logs: [log()] });
    expect(screen.getByRole("button", { name: "Edit" })).toHaveClass("h-12", "flex-none");
  });

  it("shows only the Done state, or nothing, when the day can no longer be logged", () => {
    const { unmount } = setup({ days: [], logs: [log()] });
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();
    const empty = setup({ days: [] });
    expect(empty.container).toBeEmptyDOMElement();
  });

  it("saves pain and a comment for the shown day, closes and refreshes", async () => {
    const user = userEvent.setup();
    setup({ entryId: ENTRY });
    await user.click(screen.getByRole("button", { name: "Mark as done" }));
    const dialog = screen.getByRole("dialog", { name: "How did it go?" });
    // A drawer, so it can be swiped down to dismiss; it carries the patient branding scope.
    expect(dialog).toHaveAttribute("data-vaul-drawer");
    expect(dialog).toHaveAttribute("data-brand", "patient");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.click(within(dialog).getByRole("radio", { name: "6" }));
    await user.type(within(dialog).getByLabelText("Comment (optional)"), "A bit pinchy");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(m.log).toHaveBeenCalled());
    expect(m.log).toHaveBeenCalledWith("7k2m9qpx", {
      routineId: ROUTINE,
      entryId: ENTRY,
      performedOn: TODAY,
      completed: true,
      pain: 6,
      comment: "A bit pinchy",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(m.refresh).toHaveBeenCalled();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("sends no pain and no comment when the patient leaves them empty", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Mark as done" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.log).toHaveBeenCalled());
    expect(m.log.mock.calls[0]![1]).toMatchObject({ pain: null, comment: null, completed: true });
  });

  it("clears a chosen pain rating", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Mark as done" }));
    await user.click(screen.getByRole("radio", { name: "3" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.log).toHaveBeenCalled());
    expect(m.log.mock.calls[0]![1].pain).toBeNull();
  });

  it("shows a done routine with Edit and prefills the sheet", async () => {
    const user = userEvent.setup();
    setup({ logs: [log({ pain: 4, comment: "ok" })] });
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as done" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("radio", { name: "4" })).toBeChecked();
    expect(screen.getByLabelText("Comment (optional)")).toHaveValue("ok");
  });

  it("undoes a session by saving it as not completed", async () => {
    const user = userEvent.setup();
    setup({ logs: [log({ pain: 4 })] });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Mark as not done" }));
    await waitFor(() => expect(m.log).toHaveBeenCalled());
    expect(m.log.mock.calls[0]![1]).toMatchObject({ completed: false, pain: 4 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Mark as done" })).toBeVisible());
  });

  it("treats a log saved as not completed as not done", () => {
    setup({ logs: [log({ completed: false })] });
    expect(screen.getByRole("button", { name: "Mark as done" })).toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });

  it("lets a routine without a day of its own pick today or yesterday", async () => {
    const user = userEvent.setup();
    setup({
      days: [
        { date: YESTERDAY, relative: "yesterday" },
        { date: TODAY, relative: "today" },
      ],
      logs: [log({ performedOn: YESTERDAY, pain: 2 })],
    });
    // The card stands for today, which has no log yet.
    await user.click(screen.getByRole("button", { name: "Mark as done" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Today" })).toBeChecked();
    await user.click(within(dialog).getByRole("radio", { name: "Yesterday" }));
    // Yesterday's saved log fills the form.
    expect(within(dialog).getByRole("radio", { name: "2" })).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.log).toHaveBeenCalled());
    expect(m.log.mock.calls[0]![1].performedOn).toBe(YESTERDAY);
  });

  it("only shows the state for a day that can no longer be logged", () => {
    setup({ days: [], logs: [log({ performedOn: "2026-10-01" })], shownDate: "2026-10-01" });
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows nothing for an unlogged day that can no longer be logged", () => {
    setup({ days: [], logs: [], shownDate: "2026-10-01" });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });

  it("explains why saving failed and keeps the sheet open", async () => {
    m.log.mockResolvedValue({ ok: false, error: "date" });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Mark as done" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can only log today or yesterday.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(m.refresh).not.toHaveBeenCalled();
  });

  it("keeps what the patient typed when saving fails", async () => {
    m.log.mockResolvedValue({ ok: false, error: "unavailable" });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Mark as done" }));
    await user.click(screen.getByRole("radio", { name: "5" }));
    await user.type(screen.getByLabelText("Comment (optional)"), "A long note about the stairs");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Comment (optional)")).toHaveValue("A long note about the stairs");
    expect(screen.getByRole("radio", { name: "5" })).toBeChecked();
  });

  it("can open straight away (the workout's finish screen)", () => {
    setup({ defaultOpen: true });
    expect(screen.getByRole("dialog", { name: "How did it go?" })).toBeInTheDocument();
  });

  it("speaks Spanish", () => {
    setup({}, "es");
    expect(screen.getByRole("button", { name: "Marcar como hecha" })).toBeInTheDocument();
  });
});
