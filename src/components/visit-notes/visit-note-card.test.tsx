import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { draftKey } from "@/lib/visit-notes";

import messages from "../../../messages/en.json";

const refresh = vi.fn();
const deleteNote = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/visit-notes/actions", () => ({
  saveVisitNoteAction: vi.fn(),
  deleteVisitNoteAction: (...args: unknown[]) => deleteNote(...args),
}));

import { VisitNoteCard, type VisitNoteView } from "./visit-note-card";

const note: VisitNoteView = {
  id: "note-1",
  visitedOn: "2026-09-30",
  caseId: "case-1",
  pain: 4,
  subjective: "Knee pain on stairs",
  objective: null,
  assessment: "Improving",
  plan: "  ",
  createdAt: new Date("2026-09-30T10:00:00Z"),
  updatedAt: new Date("2026-09-30T10:00:30Z"),
};
const cases = [{ id: "case-1", title: "ACL rehab" }];

function setup(overrides: Partial<VisitNoteView> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <VisitNoteCard
        note={{ ...note, ...overrides }}
        customerId="cust-1"
        customerName="Ana Pérez"
        cases={cases}
        today="2026-10-01"
        timeZone="UTC"
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  refresh.mockReset();
  deleteNote.mockReset();
  localStorage.clear();
});

describe("VisitNoteCard", () => {
  it("shows the date, case badge, pain and only the non-empty sections", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Sep 30, 2026" })).toBeInTheDocument();
    expect(screen.getByText("ACL rehab")).toBeInTheDocument();
    expect(screen.getByText("Pain 4/10")).toBeInTheDocument();
    expect(screen.getByText("S · Subjective")).toBeInTheDocument();
    expect(screen.getByText("Knee pain on stairs")).toBeInTheDocument();
    expect(screen.getByText("A · Assessment")).toBeInTheDocument();
    expect(screen.queryByText("O · Objective")).not.toBeInTheDocument();
    expect(screen.queryByText("P · Plan")).not.toBeInTheDocument();
  });

  it("omits the case badge, the pain and the expand control when there is nothing to show", () => {
    setup({ caseId: null, pain: null });
    expect(screen.queryByText("ACL rehab")).not.toBeInTheDocument();
    expect(screen.queryByText(/Pain/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show full note" })).not.toBeInTheDocument();
  });

  it("shows pain 0 (zero is a real score)", () => {
    setup({ pain: 0 });
    expect(screen.getByText("Pain 0/10")).toBeInTheDocument();
  });

  it("shows 'edited' only when updated more than a minute after creation", () => {
    const { unmount } = setup();
    expect(screen.queryByText(/Edited/)).not.toBeInTheDocument();
    unmount();
    setup({ updatedAt: new Date("2026-10-01T09:00:00Z") });
    expect(screen.getByText("Edited Oct 1, 2026")).toBeInTheDocument();
  });

  it("expands and collapses long notes", async () => {
    const user = userEvent.setup();
    setup({ plan: "Squats\nLunges\nStep-ups" });
    const toggle = screen.getByRole("button", { name: "Show full note" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/Squats/).className).toContain("line-clamp-2");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText(/Squats/).className).not.toContain("line-clamp-2");
  });

  it("opens the editor prefilled from the note", async () => {
    const user = userEvent.setup();
    setup({ pain: 4 });
    await user.click(screen.getByRole("button", { name: "Edit note from Sep 30, 2026" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit visit note" });
    expect(within(dialog).getByLabelText("S · Subjective")).toHaveValue("Knee pain on stairs");
    expect(within(dialog).getByLabelText("Visit date")).toHaveValue("2026-09-30");
    expect(within(dialog).getByLabelText("Pain (0–10)")).toHaveValue("4");
    expect(within(dialog).getByRole("combobox", { name: "Case" })).toHaveTextContent("ACL rehab");
  });

  describe("delete", () => {
    it("asks for confirmation and deletes only after confirming", async () => {
      const user = userEvent.setup();
      deleteNote.mockResolvedValue({ ok: true, data: null });
      setup();
      await user.click(screen.getByRole("button", { name: "Delete note from Sep 30, 2026" }));
      const dialog = await screen.findByRole("alertdialog", { name: "Delete this note?" });
      expect(deleteNote).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(deleteNote).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Delete note from Sep 30, 2026" }));
      await user.click(await screen.findByRole("button", { name: "Delete note" }));
      await waitFor(() => expect(deleteNote).toHaveBeenCalledWith("note-1"));
      await waitFor(() => expect(refresh).toHaveBeenCalled());
    });

    it("removes the note's unsaved edit draft, and only on success", async () => {
      const user = userEvent.setup();
      const key = draftKey("cust-1", "note-1");
      localStorage.setItem(key, "{}");
      deleteNote.mockResolvedValueOnce({ ok: false, error: "unknown" });
      setup();
      await user.click(screen.getByRole("button", { name: "Delete note from Sep 30, 2026" }));
      await user.click(await screen.findByRole("button", { name: "Delete note" }));
      await screen.findByRole("alert");
      expect(localStorage.getItem(key)).not.toBeNull();

      deleteNote.mockResolvedValueOnce({ ok: true, data: null });
      await user.click(screen.getByRole("button", { name: "Delete note from Sep 30, 2026" }));
      await user.click(await screen.findByRole("button", { name: "Delete note" }));
      await waitFor(() => expect(localStorage.getItem(key)).toBeNull());
    });

    it("shows an error when the note no longer exists", async () => {
      const user = userEvent.setup();
      deleteNote.mockResolvedValue({ ok: false, error: "notFound" });
      setup();
      await user.click(screen.getByRole("button", { name: "Delete note from Sep 30, 2026" }));
      await user.click(await screen.findByRole("button", { name: "Delete note" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("This note no longer exists.");
      expect(refresh).not.toHaveBeenCalled();
    });

    it("shows a generic error when the request throws", async () => {
      const user = userEvent.setup();
      deleteNote.mockRejectedValue(new Error("network"));
      setup();
      await user.click(screen.getByRole("button", { name: "Delete note from Sep 30, 2026" }));
      await user.click(await screen.findByRole("button", { name: "Delete note" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
    });
  });
});
