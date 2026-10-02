import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import { SaveAsTemplateDialog } from "./save-as-template-dialog";
import { chooseMenuAction, InPageActions } from "@/test/page-actions";

const { saveAsTemplateAction } = vi.hoisted(() => ({ saveAsTemplateAction: vi.fn() }));
vi.mock("@/server/templates/actions", () => ({ saveAsTemplateAction }));

const setup = (kind: "routine" | "plan" = "routine") =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <SaveAsTemplateDialog kind={kind} sourceId="src-1" defaultName="Knee rehab" />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  saveAsTemplateAction.mockReset();
  saveAsTemplateAction.mockResolvedValue({ status: "idle" });
});

describe("SaveAsTemplateDialog", () => {
  it("warns that notes are copied and defaults the name", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Save as template…" }));
    expect(await screen.findByRole("dialog", { name: "Save as template" })).toBeVisible();
    expect(
      screen.getByText(
        "Notes and labels are copied as they are. Review them for patient information.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Template name")).toHaveValue("Knee rehab");
  });

  it("submits kind, source and name", async () => {
    const user = userEvent.setup();
    setup("plan");
    await user.click(screen.getByRole("button", { name: "Save as template…" }));
    await user.clear(await screen.findByLabelText("Template name"));
    await user.type(screen.getByLabelText("Template name"), "Week template");
    await user.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(saveAsTemplateAction).toHaveBeenCalled());
    const data = (saveAsTemplateAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(Object.fromEntries(data.entries())).toEqual({
      kind: "plan",
      sourceId: "src-1",
      name: "Week template",
    });
  });

  it("shows the name error", async () => {
    const user = userEvent.setup();
    saveAsTemplateAction.mockResolvedValue({
      status: "error",
      fieldErrors: { name: "nameRequired" },
    });
    setup();
    await user.click(screen.getByRole("button", { name: "Save as template…" }));
    await user.click(await screen.findByRole("button", { name: "Save template" }));
    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(screen.getByLabelText("Template name")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a form error", async () => {
    const user = userEvent.setup();
    saveAsTemplateAction.mockResolvedValue({
      status: "error",
      fieldErrors: {},
      formError: "notFound",
    });
    setup();
    await user.click(screen.getByRole("button", { name: "Save as template…" }));
    await user.click(await screen.findByRole("button", { name: "Save template" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That routine or plan no longer exists.",
    );
  });
});

describe("SaveAsTemplateDialog in a page's More actions menu", () => {
  it("opens the dialog from the menu item", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <InPageActions>
          <SaveAsTemplateDialog kind="routine" sourceId="src-1" defaultName="Knee rehab" />
        </InPageActions>
      </NextIntlClientProvider>,
    );
    await chooseMenuAction(user, "Save as template…");
    expect(await screen.findByRole("dialog", { name: "Save as template" })).toBeVisible();
    expect(screen.getByLabelText("Template name")).toHaveValue("Knee rehab");
  });
});
