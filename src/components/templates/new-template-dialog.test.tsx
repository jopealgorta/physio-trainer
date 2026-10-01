import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import { NewTemplateDialog } from "./new-template-dialog";

const { createTemplateAction } = vi.hoisted(() => ({ createTemplateAction: vi.fn() }));
vi.mock("@/server/templates/actions", () => ({ createTemplateAction }));

const setup = (kind: "routine" | "plan") =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <NewTemplateDialog kind={kind} />
    </NextIntlClientProvider>,
  );

const submitted = () => (createTemplateAction.mock.calls[0] as unknown as [unknown, FormData])[1];

beforeEach(() => {
  createTemplateAction.mockReset();
  createTemplateAction.mockResolvedValue({ status: "idle" });
});

describe("NewTemplateDialog", () => {
  it.each([
    ["routine", "New routine template"],
    ["plan", "New plan template"],
  ] as const)("opens a %s dialog with a required name", async (kind, label) => {
    const user = userEvent.setup();
    setup(kind);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: label }));
    expect(await screen.findByRole("dialog", { name: label })).toBeVisible();
    expect(screen.getByLabelText("Name")).toBeRequired();
    expect(screen.getByLabelText("Name")).toHaveAttribute("maxlength", "80");
  });

  it("submits the kind and the name", async () => {
    const user = userEvent.setup();
    setup("plan");
    await user.click(screen.getByRole("button", { name: "New plan template" }));
    await user.type(await screen.findByLabelText("Name"), "Low back");
    await user.click(screen.getByRole("button", { name: "Create template" }));
    await vi.waitFor(() => expect(createTemplateAction).toHaveBeenCalled());
    expect(submitted().get("kind")).toBe("plan");
    expect(submitted().get("name")).toBe("Low back");
  });

  it("shows the name error from the action and keeps what was typed", async () => {
    const user = userEvent.setup();
    createTemplateAction.mockResolvedValue({
      status: "error",
      fieldErrors: { name: "nameTooLong" },
    });
    setup("routine");
    await user.click(screen.getByRole("button", { name: "New routine template" }));
    await user.type(await screen.findByLabelText("Name"), "x");
    await user.click(screen.getByRole("button", { name: "Create template" }));
    expect(await screen.findByText("Use at most 80 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Name")).toHaveValue("x");
  });

  it("shows a form error in an alert", async () => {
    const user = userEvent.setup();
    createTemplateAction.mockResolvedValue({
      status: "error",
      fieldErrors: {},
      formError: "invalid",
    });
    setup("routine");
    await user.click(screen.getByRole("button", { name: "New routine template" }));
    await user.type(await screen.findByLabelText("Name"), "x");
    await user.click(screen.getByRole("button", { name: "Create template" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the form and try again.");
  });
});
