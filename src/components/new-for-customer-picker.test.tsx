import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chooseOption } from "@/test/select";

import messages from "../../messages/en.json";
import { NewForCustomerPicker } from "./new-for-customer-picker";

const { createRoutineAction, createPlanAction } = vi.hoisted(() => ({
  createRoutineAction: vi.fn(),
  createPlanAction: vi.fn(),
}));
vi.mock("@/server/routines/actions", () => ({ createRoutineAction }));
vi.mock("@/server/plans/actions", () => ({ createPlanAction }));

const CUSTOMERS = [
  { id: "cust-1", name: "Ana Pérez" },
  { id: "cust-2", name: "Rita Gómez" },
];

function setup(kind: "routine" | "plan" = "routine") {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NewForCustomerPicker kind={kind} customers={CUSTOMERS} />
    </NextIntlClientProvider>,
  );
}

const submitted = () => (createRoutineAction.mock.calls[0] as unknown as [unknown, FormData])[1];

beforeEach(() => {
  createRoutineAction.mockReset();
  createRoutineAction.mockResolvedValue({ status: "idle" });
  createPlanAction.mockReset();
  createPlanAction.mockResolvedValue({ status: "idle" });
});

describe("NewForCustomerPicker", () => {
  it("asks only for the customer, and can't create before one is chosen", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "New routine" }));
    const dialog = await screen.findByRole("dialog", { name: "New routine" });
    expect(dialog).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Customer" })).toHaveTextContent(
      "Choose a customer",
    );
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create routine" })).toBeDisabled();
  });

  it("creates a routine for the chosen customer with a default name and no case", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "New routine" }));
    await chooseOption(
      user,
      await screen.findByRole("combobox", { name: "Customer" }),
      "Rita Gómez",
    );
    await user.click(screen.getByRole("button", { name: "Create routine" }));
    await waitFor(() => expect(createRoutineAction).toHaveBeenCalledTimes(1));
    const data = submitted();
    expect(data.get("customerId")).toBe("cust-2");
    expect(data.get("name")).toBe("New routine");
    expect(data.get("caseId")).toBeNull();
  });

  it("says why it could not create the routine", async () => {
    const user = userEvent.setup();
    createRoutineAction.mockResolvedValue({
      status: "error",
      fieldErrors: {},
      formError: "customerNotFound",
    });
    setup();
    await user.click(screen.getByRole("button", { name: "New routine" }));
    await chooseOption(
      user,
      await screen.findByRole("combobox", { name: "Customer" }),
      "Ana Pérez",
    );
    await user.click(screen.getByRole("button", { name: "Create routine" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This customer no longer exists.");
  });

  it("creates a weekly plan the same way", async () => {
    const user = userEvent.setup();
    setup("plan");
    await user.click(screen.getByRole("button", { name: "New plan" }));
    expect(await screen.findByRole("dialog", { name: "New plan" })).toBeVisible();
    await chooseOption(user, screen.getByRole("combobox", { name: "Customer" }), "Ana Pérez");
    await user.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(createPlanAction).toHaveBeenCalledTimes(1));
    const data = (createPlanAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(data.get("customerId")).toBe("cust-1");
    expect(data.get("name")).toBe("New plan");
    expect(createRoutineAction).not.toHaveBeenCalled();
  });
});
