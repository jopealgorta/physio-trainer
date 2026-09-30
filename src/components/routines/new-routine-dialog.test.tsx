import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { NewRoutineDialog } from "./new-routine-dialog";

const { createRoutineAction } = vi.hoisted(() => ({ createRoutineAction: vi.fn() }));
vi.mock("@/server/routines/actions", () => ({ createRoutineAction }));

const CASES = [
  { id: "case-1", title: "ACL rehab" },
  { id: "case-2", title: "Shoulder" },
];

function setup(cases: { id: string; title: string }[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <NewRoutineDialog customerId="cust-1" customerName="Ana Pérez" cases={cases} />
    </NextIntlClientProvider>,
  );
}

const submitted = () => (createRoutineAction.mock.calls[0] as unknown as [unknown, FormData])[1];

beforeEach(() => {
  createRoutineAction.mockReset();
  createRoutineAction.mockResolvedValue({ status: "idle" });
});

describe("NewRoutineDialog", () => {
  it("opens a dialog titled with the customer's name", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New routine" }));
    expect(await screen.findByRole("dialog", { name: "New routine for Ana Pérez" })).toBeVisible();
    expect(screen.getByLabelText("Name")).toBeRequired();
    expect(screen.getByLabelText("Name")).toHaveAttribute("maxlength", "80");
  });

  it("shows the name error and keeps what was typed", async () => {
    const user = userEvent.setup();
    createRoutineAction.mockResolvedValue({
      status: "error",
      fieldErrors: { name: "nameRequired" },
    });
    setup();
    await user.click(screen.getByRole("button", { name: "New routine" }));
    await user.click(await screen.findByRole("button", { name: "Create routine" }));
    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  });

  it("interpolates the max length and shows form errors", async () => {
    const user = userEvent.setup();
    createRoutineAction.mockResolvedValueOnce({
      status: "error",
      fieldErrors: { name: "nameTooLong" },
    });
    setup();
    await user.click(screen.getByRole("button", { name: "New routine" }));
    await user.type(await screen.findByLabelText("Name"), "x");
    await user.click(screen.getByRole("button", { name: "Create routine" }));
    expect(await screen.findByText("Use at most 80 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("x");

    createRoutineAction.mockResolvedValueOnce({
      status: "error",
      fieldErrors: {},
      formError: "customerNotFound",
    });
    await user.click(screen.getByRole("button", { name: "Create routine" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This customer no longer exists.");
  });

  it("has no case select when the customer has no cases", async () => {
    const user = userEvent.setup();
    setup([]);
    await user.click(screen.getByRole("button", { name: "New routine" }));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(document.querySelector('input[name="caseId"]')).toBeNull();
  });

  it("submits the customer, name and no case by default", async () => {
    const user = userEvent.setup();
    setup(CASES);
    await user.click(screen.getByRole("button", { name: "New routine" }));
    expect(await screen.findByRole("combobox", { name: "Case" })).toHaveTextContent("No case");
    await user.type(screen.getByLabelText("Name"), "Week 1");
    await user.click(screen.getByRole("button", { name: "Create routine" }));
    await waitFor(() => expect(createRoutineAction).toHaveBeenCalled());
    const data = submitted();
    expect(data.get("customerId")).toBe("cust-1");
    expect(data.get("name")).toBe("Week 1");
    expect(data.get("caseId")).toBe("");
  });

  it("submits the chosen case", async () => {
    const user = userEvent.setup();
    setup(CASES);
    await user.click(screen.getByRole("button", { name: "New routine" }));
    await user.type(await screen.findByLabelText("Name"), "Week 1");
    await chooseOption(user, screen.getByRole("combobox", { name: "Case" }), "Shoulder");
    await user.click(screen.getByRole("button", { name: "Create routine" }));
    await waitFor(() => expect(createRoutineAction).toHaveBeenCalled());
    expect(submitted().get("caseId")).toBe("case-2");
  });
});
