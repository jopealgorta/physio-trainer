import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";

const refresh = vi.fn();
const saveNote = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/visit-notes/actions", () => ({
  saveVisitNoteAction: (...args: unknown[]) => saveNote(...args),
  deleteVisitNoteAction: vi.fn(),
}));

import { NoteSheet } from "./note-sheet";

function setup(props: { note?: Parameters<typeof NoteSheet>[0]["note"] } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <NoteSheet
        customerId="cust-1"
        customerName="Ana Pérez"
        cases={[{ id: "case-1", title: "ACL rehab" }]}
        today="2026-10-01"
        {...props}
      />
      <input aria-label="Elsewhere" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  refresh.mockReset();
  saveNote.mockReset();
  localStorage.clear();
});

describe("NoteSheet", () => {
  it("is closed until 'New note' is clicked, then opens prefilled with today's date", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New note" }));
    expect(await screen.findByRole("dialog", { name: "New visit note" })).toBeInTheDocument();
    expect(screen.getByText("Private notes for Ana Pérez. Patients never see them.")).toBeVisible();
    expect(screen.getByLabelText("Visit date")).toHaveValue("2026-10-01");
  });

  it("is full width on mobile (overrides the sheet's default 3/4 width)", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "New note" }));
    const dialog = await screen.findByRole("dialog", { name: "New visit note" });
    expect(dialog.className).toContain("data-[side=right]:w-full");
  });

  it("opens with the N key and focuses nothing destructive", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("n");
    expect(await screen.findByRole("dialog", { name: "New visit note" })).toBeInTheDocument();
  });

  it("ignores N while typing in a field", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText("Elsewhere"), "n");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("typing N inside the open editor does not open another one", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("n");
    await user.type(await screen.findByLabelText("S · Subjective"), "nnn");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByLabelText("S · Subjective")).toHaveValue("nnn");
  });

  it("the edit sheet does not listen for N", async () => {
    const user = userEvent.setup();
    setup({
      note: {
        id: "note-1",
        visitedOn: "2026-09-30",
        caseId: "",
        subjective: "x",
        objective: "",
        assessment: "",
        plan: "",
        pain: "",
      },
    });
    await user.keyboard("n");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes and refreshes after a save", async () => {
    const user = userEvent.setup();
    saveNote.mockResolvedValue({ status: "saved" });
    setup();
    await user.click(screen.getByRole("button", { name: "New note" }));
    await user.type(await screen.findByLabelText("S · Subjective"), "Knee pain");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the draft when closed without saving and restores it on reopen", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "New note" }));
    await user.type(await screen.findByLabelText("S · Subjective"), "Half written");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "New note" }));
    expect(await screen.findByLabelText("S · Subjective")).toHaveValue("Half written");
    expect(screen.getByRole("status")).toHaveTextContent("We restored your unsaved draft.");
  });
});
