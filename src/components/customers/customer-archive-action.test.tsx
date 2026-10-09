import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chooseMenuAction, InPageActions } from "@/test/page-actions";

import messages from "../../../messages/en.json";

const refresh = vi.fn();
const setArchived = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/customers/actions", () => ({
  setCustomerArchivedAction: (...args: unknown[]) => setArchived(...args),
}));

import { CustomerArchiveAction } from "./customer-archive-action";

function setup(archived = false) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <InPageActions>
        <CustomerArchiveAction id="c1" name="Ana Pérez" archived={archived} />
      </InPageActions>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setArchived.mockResolvedValue({ ok: true, data: null });
});

describe("CustomerArchiveAction", () => {
  it("lives in the More actions menu at every size", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More actions" })).not.toHaveClass("sm:hidden");
  });

  it("asks for confirmation before archiving", async () => {
    const user = userEvent.setup();
    setup();
    await chooseMenuAction(user, "Archive");
    const dialog = await screen.findByRole("alertdialog", { name: "Archive Ana Pérez?" });
    expect(dialog).toHaveTextContent("share links will stop working");
    expect(setArchived).not.toHaveBeenCalled();
  });

  it("archives and refreshes once confirmed", async () => {
    const user = userEvent.setup();
    setup();
    await chooseMenuAction(user, "Archive");
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setArchived).toHaveBeenCalledWith("c1", true);
  });

  it("cancelling the confirmation does nothing", async () => {
    const user = userEvent.setup();
    setup();
    await chooseMenuAction(user, "Archive");
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(setArchived).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("restores immediately, without a confirmation", async () => {
    const user = userEvent.setup();
    setup(true);
    await chooseMenuAction(user, "Restore");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setArchived).toHaveBeenCalledWith("c1", false);
  });

  it("shows an error and does not refresh when the action fails", async () => {
    const user = userEvent.setup();
    setArchived.mockResolvedValue({ ok: false, error: "notFound" });
    setup(true);
    await chooseMenuAction(user, "Restore");
    expect(await screen.findByRole("alert")).toHaveTextContent("This customer no longer exists.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a generic error when the action throws", async () => {
    const user = userEvent.setup();
    setArchived.mockRejectedValue(new Error("network"));
    setup(true);
    await chooseMenuAction(user, "Restore");
    expect(await screen.findByText("Something went wrong. Try again.")).toBeInTheDocument();
  });
});
