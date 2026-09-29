import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";

const refresh = vi.fn();
const setArchived = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/customers/actions", () => ({
  setCustomerArchivedAction: (...args: unknown[]) => setArchived(...args),
}));

import { CustomerArchiveButton } from "./customer-archive-button";

function setup(archived = false) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CustomerArchiveButton id="c1" name="Ana Pérez" archived={archived}>
        <button type="button">Edit</button>
      </CustomerArchiveButton>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setArchived.mockResolvedValue({ ok: true, data: null });
});

describe("CustomerArchiveButton", () => {
  it("asks for confirmation before archiving", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = screen.getByRole("alertdialog", { name: "Archive Ana Pérez?" });
    expect(dialog).toHaveTextContent("share links will stop working");
    expect(setArchived).not.toHaveBeenCalled();
  });

  it("archives and refreshes once confirmed", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setArchived).toHaveBeenCalledWith("c1", true);
  });

  it("cancelling the confirmation does nothing", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setArchived).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("restores immediately, without a confirmation", async () => {
    const user = userEvent.setup();
    setup(true);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setArchived).toHaveBeenCalledWith("c1", false);
  });

  it("shows an error and does not refresh when the action fails", async () => {
    const user = userEvent.setup();
    setArchived.mockResolvedValue({ ok: false, error: "notFound" });
    setup(true);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(await screen.findByText("This customer no longer exists.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("renders the error outside the button group, at full width", async () => {
    const user = userEvent.setup();
    setArchived.mockResolvedValue({ ok: false, error: "notFound" });
    setup(true);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    const alert = await screen.findByRole("alert");
    const group = screen.getByRole("button", { name: "Restore" }).parentElement;
    expect(group).toContainElement(screen.getByRole("button", { name: "Edit" }));
    expect(group).not.toContainElement(alert);
    expect(alert).toHaveClass("basis-full");
  });

  it("shows a generic error when the action throws", async () => {
    const user = userEvent.setup();
    setArchived.mockRejectedValue(new Error("network"));
    setup(true);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(await screen.findByText("Something went wrong. Try again.")).toBeInTheDocument();
  });
});
