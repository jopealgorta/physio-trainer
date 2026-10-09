import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { afterEach, describe, expect, it, vi } from "vitest";

import messages from "../../messages/en.json";
import {
  PageActions,
  PageActionsMenu,
  PageNotices,
  usePageAction,
  usePageNotice,
  type PageAction,
  type PageNotice,
} from "./page-actions";

/** A page control that puts itself in the menu and says whether it is in one. */
function Control({ id, action }: { id: string; action: PageAction | null }) {
  const { inMenu } = usePageAction(id, action);
  return <span data-testid={`control-${id}`}>{inMenu ? "in menu" : "standalone"}</span>;
}

function renderWith(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

const more = () => screen.getByRole("button", { name: "More actions" });

const realMatchMedia = window.matchMedia;
/** Pretends the screen is a phone (below `sm`). */
function onPhone() {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

/** A control with its own button that opens a dialog, also reachable from the menu. */
function DialogControl({ menuOnly = false }: { menuOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const { onCloseAutoFocus } = usePageAction("history", {
    label: "History",
    order: menuOnly ? 90 : 20,
    menuOnly,
    opensDialog: true,
    onSelect: () => setOpen(true),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {menuOnly ? null : (
        <DialogTrigger asChild>
          <button type="button">Open history</button>
        </DialogTrigger>
      )}
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogTitle>Version history</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}

describe("PageActions", () => {
  it("leaves controls outside a page's actions as they are", () => {
    renderWith(<Control id="share" action={{ label: "Share", order: 10 }} />);
    expect(screen.getByTestId("control-share")).toHaveTextContent("standalone");
  });

  it("lists the registered actions in order, grouped, in the More actions menu", async () => {
    const user = userEvent.setup();
    renderWith(
      <PageActions>
        <Control id="history" action={{ label: "History", order: 30 }} />
        <Control id="share" action={{ label: "Share routine", order: 10 }} />
        <Control id="pdf" action={{ label: "Download PDF", order: 20 }} />
        <Control id="xlsx" action={{ label: "Download Excel", order: 21 }} />
        <Control id="none" action={null} />
        <PageActionsMenu />
      </PageActions>,
    );
    expect(screen.getByTestId("control-share")).toHaveTextContent("in menu");
    await user.click(more());
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Share routine", "Download PDF", "Download Excel", "History"]);
    // A separator between the share, export and history groups.
    expect(within(menu).getAllByRole("separator")).toHaveLength(2);
  });

  it("is for phones only while every action also has its own control", () => {
    renderWith(
      <PageActions>
        <Control id="share" action={{ label: "Share", order: 10 }} />
        <PageActionsMenu />
      </PageActions>,
    );
    expect(more()).toHaveClass("sm:hidden");
  });

  it("shows menu-only actions at every size, red when destructive, the rest on phones only", async () => {
    const user = userEvent.setup();
    renderWith(
      <PageActions>
        <Control id="share" action={{ label: "Share", order: 10 }} />
        <Control id="history" action={{ label: "History", order: 30 }} />
        <Control id="archive" action={{ label: "Archive", order: 90, menuOnly: true }} />
        <Control
          id="delete"
          action={{ label: "Delete", order: 91, menuOnly: true, destructive: true }}
        />
        <PageActionsMenu />
      </PageActions>,
    );
    // From `sm` up the menu stays for the actions that have no button of their own.
    expect(more()).not.toHaveClass("sm:hidden");
    await user.click(more());
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Share" })).toHaveClass("sm:hidden");
    expect(within(menu).getByRole("menuitem", { name: "History" })).toHaveClass("sm:hidden");
    expect(within(menu).getByRole("menuitem", { name: "Archive" })).not.toHaveClass("sm:hidden");
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    // On phones: share | history | archive, delete. From `sm` up only archive and delete, so the
    // separators before them that only phones need are hidden there.
    const separators = within(menu).getAllByRole("separator", { hidden: true });
    expect(separators.map((separator) => separator.getAttribute("class"))).toEqual([
      expect.stringContaining("sm:hidden"),
      expect.stringContaining("sm:hidden"),
    ]);
  });

  it("separates menu-only groups from each other at every size", async () => {
    const user = userEvent.setup();
    renderWith(
      <PageActions>
        <Control id="edit" action={{ label: "Edit", order: 80, menuOnly: true }} />
        <Control id="archive" action={{ label: "Archive", order: 90, menuOnly: true }} />
        <PageActionsMenu />
      </PageActions>,
    );
    await user.click(more());
    const menu = await screen.findByRole("menu");
    const [separator] = within(menu).getAllByRole("separator");
    expect(separator).not.toHaveClass("sm:hidden");
  });

  it("runs a dialog action once the menu has closed", async () => {
    const onSelect = vi.fn(() => {
      // The menu is gone by then, so the dialog does not fight it for focus.
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    const user = userEvent.setup();
    renderWith(
      <PageActions>
        <Control
          id="history"
          action={{ label: "History", order: 30, onSelect, opensDialog: true }}
        />
        <PageActionsMenu />
      </PageActions>,
    );
    await user.click(more());
    await user.click(await screen.findByRole("menuitem", { name: "History" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
  });

  it("runs a plain action straight away", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWith(
      <PageActions>
        <Control id="pdf" action={{ label: "Download PDF", order: 20, onSelect }} />
        <PageActionsMenu />
      </PageActions>,
    );
    await user.click(more());
    await user.click(await screen.findByRole("menuitem", { name: "Download PDF" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders links and checkboxes, the checkbox keeping the menu open", async () => {
    function Tracking() {
      const [checked, setChecked] = useState(true);
      usePageAction("tracking", {
        label: "Include tracking boxes",
        order: 22,
        checked,
        onSelect: () => setChecked((value) => !value),
      });
      return null;
    }
    const user = userEvent.setup();
    renderWith(
      <PageActions>
        <Control
          id="from"
          action={{ label: "From template: Knee", order: 50, href: "/routines/t1" }}
        />
        <Tracking />
        <Control
          id="xlsx"
          action={{ label: "Export Excel", order: 21, href: "/api/x?format=xlsx", download: true }}
        />
        <PageActionsMenu />
      </PageActions>,
    );
    await user.click(more());
    expect(await screen.findByRole("menuitem", { name: "From template: Knee" })).toHaveAttribute(
      "href",
      "/routines/t1",
    );
    expect(screen.getByRole("menuitem", { name: "From template: Knee" })).not.toHaveAttribute(
      "download",
    );
    expect(screen.getByRole("menuitem", { name: "Export Excel" })).toHaveAttribute("download");
    const box = screen.getByRole("menuitemcheckbox", { name: "Include tracking boxes" });
    expect(box).toHaveAttribute("aria-checked", "true");
    await user.click(box);
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Include tracking boxes" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("shows the trigger busy while an action is pending, and disables that item", async () => {
    const user = userEvent.setup();
    renderWith(
      <PageActions>
        <Control id="pdf" action={{ label: "Download PDF", order: 20, pending: true }} />
        <PageActionsMenu />
      </PageActions>,
    );
    await waitFor(() => expect(more()).toHaveAttribute("aria-busy", "true"));
    await user.click(more());
    expect(await screen.findByRole("menuitem", { name: "Download PDF" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("drops an action whose control goes away, and follows label changes", async () => {
    const user = userEvent.setup();
    function Page({ shown, label }: { shown: boolean; label: string }) {
      return (
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <PageActions>
            {shown ? <Control id="share" action={{ label, order: 10 }} /> : null}
            <Control id="history" action={{ label: "History", order: 30 }} />
            <PageActionsMenu />
          </PageActions>
        </NextIntlClientProvider>
      );
    }
    const { rerender } = render(<Page shown label="Share routine" />);
    rerender(<Page shown label="Share plan" />);
    await user.click(more());
    expect(await screen.findByRole("menuitem", { name: "Share plan" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    rerender(<Page shown={false} label="Share plan" />);
    await user.click(more());
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["History"]);
  });

  it("gathers the controls' notices for phones, where the controls themselves are hidden", () => {
    function Noisy({ id, notice }: { id: string; notice: PageNotice | null }) {
      usePageNotice(id, notice);
      return null;
    }
    const page = (exportNotice: PageNotice | null) => (
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <PageActions>
          <Noisy id="export" notice={exportNotice} />
          <Noisy id="history" notice={{ text: "Version restored.", tone: "info" }} />
          <PageNotices />
        </PageActions>
      </NextIntlClientProvider>
    );
    const { rerender } = render(page({ text: "Couldn't export. Try again.", tone: "error" }));
    const notices = screen.getByTestId("page-notices");
    expect(notices).toHaveAttribute("role", "status");
    expect(within(notices).getByText("Couldn't export. Try again.")).toHaveClass(
      "text-destructive",
    );
    expect(within(notices).getByText("Version restored.")).toBeInTheDocument();
    rerender(page(null));
    expect(within(notices).queryByText("Couldn't export. Try again.")).not.toBeInTheDocument();
  });

  it("works without notices: an empty, persistent live region", () => {
    renderWith(
      <PageActions>
        <PageNotices />
      </PageActions>,
    );
    expect(screen.getByTestId("page-notices")).toBeEmptyDOMElement();
  });

  it("on phones, hands focus back to More actions when a dialog opened from it closes", async () => {
    onPhone();
    const user = userEvent.setup();
    renderWith(
      <PageActions>
        <DialogControl />
        <PageActionsMenu />
      </PageActions>,
    );
    await user.click(more());
    await user.click(await screen.findByRole("menuitem", { name: "History" }));
    expect(await screen.findByRole("dialog", { name: "Version history" })).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(more()).toHaveFocus();
  });

  it("from sm up, leaves focus on a control's own button even when the menu is showing", async () => {
    const user = userEvent.setup();
    renderWith(
      <PageActions>
        <DialogControl />
        <Control id="archive" action={{ label: "Archive", order: 90, menuOnly: true }} />
        <PageActionsMenu />
      </PageActions>,
    );
    await user.click(screen.getByRole("button", { name: "Open history" }));
    expect(await screen.findByRole("dialog", { name: "Version history" })).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Open history" })).toHaveFocus();
  });

  it("from sm up, hands focus back to More actions after a menu-only dialog", async () => {
    const user = userEvent.setup();
    renderWith(
      <PageActions>
        <DialogControl menuOnly />
        <PageActionsMenu />
      </PageActions>,
    );
    await user.click(more());
    await user.click(await screen.findByRole("menuitem", { name: "History" }));
    expect(await screen.findByRole("dialog", { name: "Version history" })).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(more()).toHaveFocus();
  });

  it("shows the menu from sm up from the first render when the page says it has menu-only actions", () => {
    renderWith(
      <PageActions menuOnly>
        <PageActionsMenu />
      </PageActions>,
    );
    expect(more()).not.toHaveClass("sm:hidden");
  });

  it("from sm up, is busy only for a menu-only action (the others have their own button)", async () => {
    const { rerender } = renderWith(
      <PageActions>
        <Control id="pdf" action={{ label: "Export PDF", order: 30, pending: true }} />
        <Control id="archive" action={{ label: "Archive", order: 90, menuOnly: true }} />
        <PageActionsMenu />
      </PageActions>,
    );
    await waitFor(() => expect(more()).toHaveAttribute("aria-busy", "false"));
    rerender(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <PageActions>
          <Control id="pdf" action={{ label: "Export PDF", order: 30 }} />
          <Control
            id="archive"
            action={{ label: "Archive", order: 90, menuOnly: true, pending: true }}
          />
          <PageActionsMenu />
        </PageActions>
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(more()).toHaveAttribute("aria-busy", "true"));
  });
});
