import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { formStatus } from "@/test/form";
import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { PlanDetailsForm } from "./plan-details-form";

const { updatePlanAction } = vi.hoisted(() => ({ updatePlanAction: vi.fn() }));
vi.mock("@/server/plans/actions", () => ({ updatePlanAction }));

const INITIAL = { notes: "", caseId: null, status: "active" as const };

const setup = (props: Partial<React.ComponentProps<typeof PlanDetailsForm>> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PlanDetailsForm planId="p1" initial={INITIAL} cases={[]} {...props} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  updatePlanAction.mockReset();
  updatePlanAction.mockResolvedValue({ ok: true, data: { version: 2 } });
});

describe("PlanDetailsForm", () => {
  it("puts the board between the fields and the pinned footer, whose Save submits", async () => {
    const user = userEvent.setup();
    setup({ children: <p>The board</p> });
    const save = screen.getByRole("button", { name: "Save details" });
    const footer = save.closest('[data-slot="form-footer"]');
    expect(footer).not.toBeNull();
    const board = screen.getByText("The board");
    expect(screen.getByLabelText("Notes for the patient").compareDocumentPosition(board)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(board.compareDocumentPosition(footer!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await user.type(screen.getByLabelText("Notes for the patient"), "Ice");
    await user.click(save);
    await waitFor(() => expect(updatePlanAction).toHaveBeenCalled());
  });

  it('groups status, case and notes in one card headed "Plan details"', () => {
    setup({ cases: [{ id: "c1", title: "Knee" }] });
    const card = screen.getByRole("form", { name: "Plan details" });
    expect(card).toContainElement(screen.getByRole("combobox", { name: "Status" }));
    expect(card).toContainElement(screen.getByRole("combobox", { name: "Case" }));
    expect(card).toContainElement(screen.getByLabelText("Notes for the patient"));
  });

  it("has no name field (the title renames the plan) and saves without a name", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Notes for the patient"), "Ice after");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(updatePlanAction).toHaveBeenCalled());
    expect(updatePlanAction.mock.calls[0]![0]).toEqual({
      id: "p1",
      notes: "Ice after",
      caseId: null,
      status: "active",
    });
  });

  it("offers every status for a customer's plan", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("combobox", { name: "Status" }));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["Draft", "Active", "Archived"]);
  });

  it("offers only active and archived for a template, and saves a change", async () => {
    const user = userEvent.setup();
    setup({ isTemplate: true });
    await user.click(screen.getByRole("combobox", { name: "Status" }));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["Active", "Archived"]);
    await user.click(screen.getByRole("option", { name: "Archived" }));
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() =>
      expect(updatePlanAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: "p1", status: "archived" }),
      ),
    );
  });

  it("shows the template-only draft error text", async () => {
    const user = userEvent.setup();
    updatePlanAction.mockResolvedValue({ ok: false, error: "templateNoDraft" });
    setup({ isTemplate: true });
    await chooseOption(user, screen.getByRole("combobox", { name: "Status" }), "Archived");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Templates are either active or archived.",
    );
    expect(formStatus()).toHaveTextContent("Not saved. See the message above.");
  });

  it("takes the server's details when they change (a restore), not when its own save lands", async () => {
    const user = userEvent.setup();
    const { rerender } = setup();
    const rerenderWith = (initial: typeof INITIAL) =>
      rerender(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <PlanDetailsForm planId="p1" initial={initial} cases={[]} />
        </NextIntlClientProvider>,
      );
    const notes = screen.getByLabelText("Notes for the patient");

    await user.type(notes, "v2");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(formStatus()).toHaveTextContent("Saved"));
    rerenderWith({ ...INITIAL, notes: "v2" });
    expect(formStatus()).toHaveTextContent("Saved");

    // A board action re-renders the page with the same details: edits in progress stay.
    await user.type(notes, "!");
    rerenderWith({ ...INITIAL, notes: "v2" });
    expect(notes).toHaveValue("v2!");

    rerenderWith({ ...INITIAL, notes: "Restored" });
    expect(notes).toHaveValue("Restored");
    expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();
  });

  it("keeps its own save when the server trims the notes", async () => {
    const user = userEvent.setup();
    const { rerender } = setup();
    const notes = screen.getByLabelText("Notes for the patient");

    await user.type(notes, "Ice after{Enter}");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(formStatus()).toHaveTextContent("Saved"));
    // The page re-renders with what the server stored: trimmed.
    rerender(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <PlanDetailsForm planId="p1" initial={{ ...INITIAL, notes: "Ice after" }} cases={[]} />
      </NextIntlClientProvider>,
    );
    expect(formStatus()).toHaveTextContent("Saved");
    expect(notes).toHaveValue("Ice after\n");
    expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();
  });
});
