import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

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
        <PageActionsMenu />
      </PageActions>,
    );
    await user.click(more());
    expect(await screen.findByRole("menuitem", { name: "From template: Knee" })).toHaveAttribute(
      "href",
      "/routines/t1",
    );
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
});
