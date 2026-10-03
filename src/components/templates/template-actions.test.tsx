import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import { TemplateActions } from "./template-actions";
import { chooseMenuAction, InPageActions, menuActions } from "@/test/page-actions";

const { duplicateTemplateAction, push } = vi.hoisted(() => ({
  duplicateTemplateAction: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/server/templates/actions", () => ({
  duplicateTemplateAction,
  assignTemplateAction: vi.fn(),
  listCasesAction: vi.fn().mockResolvedValue([]),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const setup = (customers = [{ id: "c1", name: "Ana Pérez" }]) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <TemplateActions kind="plan" template={{ id: "t1", name: "Week A" }} customers={customers} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  duplicateTemplateAction.mockReset();
  push.mockReset();
});

describe("TemplateActions", () => {
  it("opens the assign dialog with the customers", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Assign to customer…" }));
    expect(await screen.findByRole("dialog", { name: "Assign to a customer" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Customer" })).toBeInTheDocument();
  });

  it("has no assign button without customers", () => {
    setup([]);
    expect(screen.queryByRole("button", { name: "Assign to customer…" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
  });

  it("duplicates and opens the copy", async () => {
    const user = userEvent.setup();
    duplicateTemplateAction.mockResolvedValue({ ok: true, data: { id: "copy" } });
    setup();
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/plans/copy"));
    expect(duplicateTemplateAction).toHaveBeenCalledWith({ kind: "plan", templateId: "t1" });
  });

  it("says so when duplicating fails", async () => {
    const user = userEvent.setup();
    duplicateTemplateAction.mockResolvedValue({ ok: false, error: "templateNotFound" });
    setup();
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't duplicate the template. Try again.",
    );
    expect(push).not.toHaveBeenCalled();
  });
});

describe("TemplateActions in a page's More actions menu", () => {
  const inMenu = (customers = [{ id: "c1", name: "Ana Pérez" }]) =>
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <InPageActions>
          <TemplateActions
            kind="plan"
            template={{ id: "t1", name: "Week A" }}
            customers={customers}
          />
        </InPageActions>
      </NextIntlClientProvider>,
    );

  it("offers assign (with customers) and duplicate", async () => {
    const user = userEvent.setup();
    inMenu();
    expect(await menuActions(user)).toEqual(["Assign to customer…", "Duplicate"]);
    await chooseMenuAction(user, "Assign to customer…");
    expect(await screen.findByRole("dialog", { name: "Assign to a customer" })).toBeVisible();
  });

  it("duplicates from the menu and repeats a failure in the page notices", async () => {
    const user = userEvent.setup();
    duplicateTemplateAction.mockResolvedValue({ ok: false, error: "notFound" });
    inMenu([]);
    expect(await menuActions(user)).toEqual(["Duplicate"]);
    await chooseMenuAction(user, "Duplicate");
    await waitFor(() =>
      expect(screen.getByTestId("page-notices")).toHaveTextContent(
        "Couldn't duplicate the template. Try again.",
      ),
    );
    // Opening the menu to try again clears it.
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByTestId("page-notices")).toBeEmptyDOMElement();
  });
});
