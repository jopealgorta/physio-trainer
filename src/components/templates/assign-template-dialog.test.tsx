import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { AssignTemplateDialog } from "./assign-template-dialog";

const { assignTemplateAction, listCasesAction } = vi.hoisted(() => ({
  assignTemplateAction: vi.fn(),
  listCasesAction: vi.fn(),
}));
vi.mock("@/server/templates/actions", () => ({ assignTemplateAction, listCasesAction }));

const TEMPLATE = { id: "tpl-1", name: "ACL phase 1" };
const CUSTOMERS = [
  { id: "cust-1", name: "Ana Pérez" },
  { id: "cust-2", name: "Bea Gómez" },
];

type Props = Partial<React.ComponentProps<typeof AssignTemplateDialog>>;
function setup(props: Props = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <AssignTemplateDialog
        kind="routine"
        template={TEMPLATE}
        open
        onOpenChange={() => {}}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}
const submitted = () => (assignTemplateAction.mock.calls[0] as unknown as [unknown, FormData])[1];

beforeEach(() => {
  assignTemplateAction.mockReset();
  assignTemplateAction.mockResolvedValue({ status: "idle" });
  listCasesAction.mockReset();
  listCasesAction.mockResolvedValue([]);
});

describe("AssignTemplateDialog with a fixed customer", () => {
  it("has no customer picker, defaults the name to the template's and the status to draft", async () => {
    setup({ customer: CUSTOMERS[0] });
    expect(await screen.findByRole("dialog", { name: "Assign to a customer" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Customer" })).not.toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("ACL phase 1");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Draft");
  });

  it("submits the ids, the name, the case and the status", async () => {
    const user = userEvent.setup();
    setup({
      kind: "plan",
      customer: CUSTOMERS[0],
      cases: [{ id: "case-1", title: "ACL rehab" }],
    });
    await user.clear(await screen.findByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Week for Ana");
    await chooseOption(user, screen.getByRole("combobox", { name: "Case" }), "ACL rehab");
    await chooseOption(user, screen.getByRole("combobox", { name: "Status" }), "Active");
    await user.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(assignTemplateAction).toHaveBeenCalled());
    const data = submitted();
    expect(Object.fromEntries(data.entries())).toEqual({
      kind: "plan",
      templateId: "tpl-1",
      customerId: "cust-1",
      caseId: "case-1",
      name: "Week for Ana",
      status: "active",
    });
  });

  it("hides the case select when the customer has no cases", async () => {
    setup({ customer: CUSTOMERS[0] });
    await screen.findByRole("dialog");
    expect(screen.queryByRole("combobox", { name: "Case" })).not.toBeInTheDocument();
  });

  it.each([
    ["templateArchived", "This template is archived. Make it active to assign it."],
    ["needsItems", "Add exercises to the template first, or assign it as a draft."],
    ["needsEntries", "Add routines to the plan template first, or assign it as a draft."],
    ["customerArchived", "This customer is archived. Unarchive them first."],
    ["caseNotFound", "That case doesn't belong to this customer."],
    ["templateNotFound", "That template no longer exists."],
  ])("shows %s from the server", async (formError, text) => {
    const user = userEvent.setup();
    assignTemplateAction.mockResolvedValue({ status: "error", fieldErrors: {}, formError });
    setup({ customer: CUSTOMERS[0] });
    await user.click(await screen.findByRole("button", { name: "Assign" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  it("shows the name error and keeps what was typed", async () => {
    const user = userEvent.setup();
    assignTemplateAction.mockResolvedValue({
      status: "error",
      fieldErrors: { name: "nameRequired" },
    });
    setup({ customer: CUSTOMERS[0] });
    await user.clear(await screen.findByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "x");
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("x");
  });
});

describe("AssignTemplateDialog with a customer list", () => {
  it("submits an empty customer until one is chosen, and the server says so", async () => {
    const user = userEvent.setup();
    assignTemplateAction.mockResolvedValue({
      status: "error",
      fieldErrors: {},
      formError: "customerNotFound",
    });
    setup({ customers: CUSTOMERS });
    expect(await screen.findByRole("combobox", { name: "Customer" })).toHaveTextContent(
      "Choose a customer",
    );
    await user.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(assignTemplateAction).toHaveBeenCalled());
    expect(submitted().get("customerId")).toBe("");
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a customer.");
  });

  it("loads the chosen customer's cases and submits that customer", async () => {
    const user = userEvent.setup();
    listCasesAction.mockResolvedValue([{ id: "case-9", title: "Shoulder" }]);
    setup({ customers: CUSTOMERS });
    await chooseOption(
      user,
      await screen.findByRole("combobox", { name: "Customer" }),
      "Bea Gómez",
    );
    expect(listCasesAction).toHaveBeenCalledWith("cust-2");
    await chooseOption(user, await screen.findByRole("combobox", { name: "Case" }), "Shoulder");
    await user.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(assignTemplateAction).toHaveBeenCalled());
    expect(submitted().get("customerId")).toBe("cust-2");
    expect(submitted().get("caseId")).toBe("case-9");
  });

  it("drops a slow response for a customer that is no longer selected, and clears the case", async () => {
    const user = userEvent.setup();
    let resolveFirst: (cases: { id: string; title: string }[]) => void = () => {};
    listCasesAction
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce([{ id: "case-2", title: "Hip" }]);
    setup({ customers: CUSTOMERS });
    await chooseOption(
      user,
      await screen.findByRole("combobox", { name: "Customer" }),
      "Ana Pérez",
    );
    await chooseOption(user, screen.getByRole("combobox", { name: "Customer" }), "Bea Gómez");
    await chooseOption(user, await screen.findByRole("combobox", { name: "Case" }), "Hip");
    resolveFirst([{ id: "case-1", title: "Stale knee" }]);
    await user.click(screen.getByRole("combobox", { name: "Case" }));
    expect(screen.queryByRole("option", { name: "Stale knee" })).not.toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Hip" })).toBeInTheDocument();
  });
});
