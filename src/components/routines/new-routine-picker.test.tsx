import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { NewRoutinePicker } from "./new-routine-picker";

const { createRoutineAction } = vi.hoisted(() => ({ createRoutineAction: vi.fn() }));
vi.mock("@/server/routines/actions", () => ({ createRoutineAction }));

const CUSTOMERS = [
  { id: "cust-1", name: "Ana Pérez" },
  { id: "cust-2", name: "Rita Gómez" },
];

function setup() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NewRoutinePicker customers={CUSTOMERS} />
    </NextIntlClientProvider>,
  );
}

const submitted = () => (createRoutineAction.mock.calls[0] as unknown as [unknown, FormData])[1];

beforeEach(() => {
  createRoutineAction.mockReset();
  createRoutineAction.mockResolvedValue({ status: "idle" });
});

describe("NewRoutinePicker", () => {
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
});
