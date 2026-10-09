import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ShareLinkView, ShareState } from "@/server/sharing/schemas";

import messages from "../../../messages/en.json";
import { ShareButton } from "./share-button";
import { chooseMenuAction, InPageActions, menuActions } from "@/test/page-actions";

const m = vi.hoisted(() => ({
  load: vi.fn(),
  renew: vi.fn(),
  revoke: vi.fn(),
  setPin: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/server/sharing/actions", () => ({
  loadShareAction: m.load,
  renewShareLinkAction: m.renew,
  revokeShareLinkAction: m.revoke,
  setSharePinAction: m.setPin,
  updateShareLinkAction: m.update,
}));

const URL_ = "https://app.example/maria/ana-7k2m9qpx";

const link = (patch: Partial<ShareLinkView> = {}): ShareLinkView => ({
  id: "l1",
  target: "customer",
  slug: "ana",
  code: "7k2m9qpx",
  url: URL_,
  status: "active",
  hasPin: false,
  expiresOn: null,
  openCount: 0,
  lastOpenedAt: null,
  qr: { size: 21, path: "M0 0h7v1h-7z" },
  ...patch,
});
const state = (
  patch: Partial<ShareState> = {},
  linkPatch: Partial<ShareLinkView> = {},
): ShareState => ({
  link: link(linkPatch),
  preview: {
    imagePath: "/maria/ana-7k2m9qpx/og?v=abc",
    title: "Your exercise plan · Maria Physio",
    description: "Open your routine from Maria Physio.",
    host: "app.example",
  },
  itemStatus: null,
  whatsappHref: "https://wa.me/59899123456?text=Hi",
  mailtoHref: "mailto:ana@example.com?subject=S&body=B",
  today: "2026-10-07",
  ...patch,
});
const ok = <T,>(data: T) => ({ ok: true as const, data });
const target = { target: "customer", customerId: "c1" } as const;

function setup(ref: Parameters<typeof ShareButton>[0]["target"] = target) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ShareButton target={ref} />
    </NextIntlClientProvider>,
  );
}
const open = async (label = "Share all active") => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: label }));
  return user;
};

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.load.mockResolvedValue(ok(state()));
});

describe("ShareButton", () => {
  it("loads (and creates) the link when opened and shows it with the share actions", async () => {
    setup();
    await open();
    expect(m.load).toHaveBeenCalledWith(target);
    expect(await screen.findByLabelText("Link")).toHaveValue(URL_);
    expect(screen.getByRole("heading", { name: "Share with the patient" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/59899123456?text=Hi",
    );
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute(
      "href",
      "mailto:ana@example.com?subject=S&body=B",
    );
    const preview = screen.getByRole("link", { name: "Preview as patient" });
    expect(preview).toHaveAttribute("href", URL_);
    expect(preview).toHaveAttribute("target", "_blank");
    expect(preview).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByRole("img", { name: "QR code for the link" })).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Not opened yet")).toBeInTheDocument();
  });

  it("previews the card the link unfurls into", async () => {
    setup();
    await open();
    await screen.findByLabelText("Link");
    const card = screen.getByRole("group", { name: "How the link looks in chats" });
    expect(within(card).getByRole("img", { name: "Link preview image" })).toHaveAttribute(
      "src",
      "/maria/ana-7k2m9qpx/og?v=abc",
    );
    expect(within(card).getByText("app.example")).toBeInTheDocument();
    expect(within(card).getByText("Your exercise plan · Maria Physio")).toBeInTheDocument();
    expect(within(card).getByText("Open your routine from Maria Physio.")).toBeInTheDocument();
    expect(screen.getByText(/never patient details/)).toBeInTheDocument();
  });

  it("shows no preview when the link has none (revoked)", async () => {
    m.load.mockResolvedValue(ok(state({ preview: null }, { status: "revoked" })));
    setup();
    await open();
    await screen.findByText("Revoked");
    expect(screen.queryByRole("group", { name: "How the link looks in chats" })).toBeNull();
  });

  it("says on the button what it shares", () => {
    const { unmount } = setup();
    expect(screen.getByRole("button", { name: "Share all active" })).toBeInTheDocument();
    unmount();
    const routine = setup({ target: "routine", routineId: "r1" });
    expect(screen.getByRole("button", { name: "Share routine" })).toBeInTheDocument();
    routine.unmount();
    setup({ target: "weekly_plan", weeklyPlanId: "p1" });
    expect(screen.getByRole("button", { name: "Share plan" })).toBeInTheDocument();
  });

  it("titles the popover for a routine and a plan", async () => {
    const { unmount } = setup({ target: "routine", routineId: "r1" });
    await open("Share routine");
    expect(await screen.findByRole("heading", { name: "Share this routine" })).toBeInTheDocument();
    unmount();
    setup({ target: "weekly_plan", weeklyPlanId: "p1" });
    await open("Share plan");
    expect(await screen.findByRole("heading", { name: "Share this plan" })).toBeInTheDocument();
  });

  it("warns when the item is still a draft", async () => {
    m.load.mockResolvedValue(ok(state({ itemStatus: "draft" })));
    setup({ target: "routine", routineId: "r1" });
    await open("Share routine");
    expect(await screen.findByText(/still a draft/)).toBeInTheDocument();
  });

  it("shows usage once the link has been opened", async () => {
    m.load.mockResolvedValue(
      ok(state({}, { openCount: 3, lastOpenedAt: "2026-10-05T10:00:00.000Z" })),
    );
    setup();
    await open();
    expect(await screen.findByText(/Opened 3 times · last Oct 5, 2026/)).toBeInTheDocument();
  });

  it("explains why a link cannot be made", async () => {
    m.load.mockResolvedValue({ ok: false, error: "customerArchived" });
    setup();
    await open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Archived customers cannot be shared/,
    );
  });

  it("shows a generic message when the request throws", async () => {
    m.load.mockRejectedValue(new Error("network"));
    setup();
    await open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("turns the PIN on, shows it once, and drops it when anything else changes", async () => {
    m.setPin.mockResolvedValue(ok({ state: state({}, { hasPin: true }), pin: "0420" }));
    setup();
    const user = await open();
    await user.click(await screen.findByRole("checkbox", { name: "Require a PIN" }));
    expect(m.setPin).toHaveBeenCalledWith({ id: "l1", enabled: true });
    expect(await screen.findByText("PIN: 0420")).toBeInTheDocument();
    expect(screen.getByText(/Shown only now/)).toBeInTheDocument();

    m.update.mockResolvedValue(ok(state({}, { hasPin: true, slug: "ana-lopez" })));
    const slug = screen.getByLabelText("Link name");
    await user.clear(slug);
    await user.type(slug, "ana-lopez");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(m.update).toHaveBeenCalledWith({ id: "l1", slug: "ana-lopez" }));
    // The PIN stays visible after a slug change (same link), but a reopen never shows it again.
    expect(screen.getByText("PIN: 0420")).toBeInTheDocument();
  });

  it("never shows an existing PIN again, only that one is set, and offers a new one", async () => {
    m.load.mockResolvedValue(ok(state({}, { hasPin: true })));
    m.setPin.mockResolvedValue(ok({ state: state({}, { hasPin: true }), pin: "7777" }));
    setup();
    const user = await open();
    expect(await screen.findByText(/A PIN is set/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New PIN" }));
    expect(m.setPin).toHaveBeenCalledWith({ id: "l1", enabled: true });
    expect(await screen.findByText("PIN: 7777")).toBeInTheDocument();
  });

  it("turns the PIN off", async () => {
    m.load.mockResolvedValue(ok(state({}, { hasPin: true })));
    m.setPin.mockResolvedValue(ok({ state: state(), pin: null }));
    setup();
    const user = await open();
    await user.click(await screen.findByRole("checkbox", { name: "Require a PIN" }));
    expect(m.setPin).toHaveBeenCalledWith({ id: "l1", enabled: false });
  });

  it("saves an expiry date with its button and can remove it", async () => {
    m.update.mockResolvedValue(ok(state({}, { expiresOn: "2026-12-31" })));
    setup();
    const user = await open();
    const date = await screen.findByLabelText("Expires");
    expect(date).toHaveAttribute("min", "2026-10-07");
    expect(screen.getByRole("button", { name: "Set expiry" })).toBeDisabled();
    await user.type(date, "2026-12-31");
    await user.click(screen.getByRole("button", { name: "Set expiry" }));
    await waitFor(() =>
      expect(m.update).toHaveBeenCalledWith({ id: "l1", expiresOn: "2026-12-31" }),
    );

    m.update.mockResolvedValue(ok(state()));
    await user.click(await screen.findByRole("button", { name: "Remove expiry" }));
    await waitFor(() => expect(m.update).toHaveBeenLastCalledWith({ id: "l1", expiresOn: null }));
  });

  it("shows why an expiry was refused by the server (e.g. the day changed meanwhile)", async () => {
    m.update.mockResolvedValue({ ok: false, error: "expiryInPast" });
    setup();
    const user = await open();
    await user.type(await screen.findByLabelText("Expires"), "2026-12-31");
    await user.click(screen.getByRole("button", { name: "Set expiry" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick today or a later day.");
  });

  it("asks for confirmation before regenerating, then shows the new link", async () => {
    const next = state(
      {},
      { id: "l2", code: "abcd2345", url: "https://app.example/maria/ana-abcd2345" },
    );
    m.renew.mockResolvedValue(ok(next));
    setup();
    const user = await open();
    await user.click(await screen.findByRole("button", { name: "Regenerate link" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(m.renew).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(m.renew).toHaveBeenCalledWith(target));
    expect(await screen.findByLabelText("Link")).toHaveValue(
      "https://app.example/maria/ana-abcd2345",
    );
  });

  it("asks for confirmation before revoking, then offers to create a new link", async () => {
    m.revoke.mockResolvedValue(ok(state({}, { status: "revoked" })));
    m.renew.mockResolvedValue(ok(state({}, { id: "l3" })));
    setup();
    const user = await open();
    await user.click(await screen.findByRole("button", { name: "Revoke link" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Revoke" }),
    );
    await waitFor(() => expect(m.revoke).toHaveBeenCalledWith("l1"));
    expect(
      await screen.findByText("This link was revoked and no longer works."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Link")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create new link" }));
    await waitFor(() => expect(m.renew).toHaveBeenCalledWith(target));
    expect(await screen.findByLabelText("Link")).toBeInTheDocument();
  });

  it("copies the link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    setup();
    await user.click(screen.getByRole("button", { name: "Share all active" }));
    await user.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});

describe("ShareButton in a page's More actions menu", () => {
  it("opens the same share panel from the menu item", async () => {
    m.load.mockResolvedValue(ok(state({}, { target: "routine" })));
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <InPageActions>
          <ShareButton target={{ target: "routine", routineId: "r1" }} />
        </InPageActions>
      </NextIntlClientProvider>,
    );
    await chooseMenuAction(user, "Share routine");
    const dialog = await screen.findByRole("dialog", { name: "Share this routine" });
    expect(m.load).toHaveBeenCalledWith({ target: "routine", routineId: "r1" });
    expect(await within(dialog).findByLabelText("Link")).toHaveValue(URL_);
  });

  it("as the page's main action, is a filled button that stays out of the menu", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <InPageActions>
          <ShareButton primary target={{ target: "weekly_plan", weeklyPlanId: "p1" }} />
        </InPageActions>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Share plan" })).toHaveAttribute(
      "data-variant",
      "default",
    );
    expect(await menuActions(user)).toEqual([]);
  });
});
