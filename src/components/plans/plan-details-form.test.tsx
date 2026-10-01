import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { PlanDetailsForm } from "./plan-details-form";

const { updatePlanAction } = vi.hoisted(() => ({ updatePlanAction: vi.fn() }));
vi.mock("@/server/plans/actions", () => ({ updatePlanAction }));

const INITIAL = { name: "Week A", notes: "", caseId: null, status: "active" as const };

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
});
