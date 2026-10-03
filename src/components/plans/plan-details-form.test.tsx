import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
    rerenderWith({ ...INITIAL, notes: "v2" });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");

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
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
    // The page re-renders with what the server stored: trimmed.
    rerender(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <PlanDetailsForm planId="p1" initial={{ ...INITIAL, notes: "Ice after" }} cases={[]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(notes).toHaveValue("Ice after\n");
    expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();
  });
});
