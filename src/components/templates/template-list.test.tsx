import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import { EmptyTemplates, NoTemplateResults, TemplateList, type TemplateRow } from "./template-list";

const { duplicateTemplateAction, push } = vi.hoisted(() => ({
  duplicateTemplateAction: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/server/templates/actions", () => ({ duplicateTemplateAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const routineRows: TemplateRow[] = [
  {
    id: "r1",
    name: "ACL phase 1",
    status: "active",
    updatedAt: new Date("2026-03-05T12:00:00Z"),
    itemCount: 4,
  },
  {
    id: "r2",
    name: "Old protocol",
    status: "archived",
    updatedAt: new Date("2026-02-01T12:00:00Z"),
    itemCount: 1,
  },
];
const planRows: TemplateRow[] = [
  {
    id: "p1",
    name: "Low back week",
    status: "active",
    updatedAt: new Date("2026-03-05T12:00:00Z"),
    sessionsPerDay: [1, 0, 1, 0, 1, 0, 0],
  },
];

const wrap = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  duplicateTemplateAction.mockReset();
  push.mockReset();
});

describe("TemplateList", () => {
  it("links routine templates to their editor and shows status, exercises and date", () => {
    wrap(<TemplateList kind="routine" rows={routineRows} />);
    const table = screen.getByRole("table", { name: "Routine templates" });
    expect(within(table).getByRole("link", { name: "ACL phase 1" })).toHaveAttribute(
      "href",
      "/routines/r1",
    );
    const row = within(table).getByRole("row", { name: /ACL phase 1/ });
    expect(row).toHaveTextContent("Active");
    expect(row).toHaveTextContent("4 exercises");
    expect(row).toHaveTextContent("Mar 5, 2026");
    expect(within(table).getByRole("row", { name: /Old protocol/ })).toHaveTextContent("Archived");
    expect(within(table).getByRole("row", { name: /Old protocol/ })).toHaveTextContent(
      "1 exercise",
    );
  });

  it("links plan templates to their board and shows the week strip", () => {
    wrap(<TemplateList kind="plan" rows={planRows} />);
    const table = screen.getByRole("table", { name: "Plan templates" });
    expect(within(table).getByRole("link", { name: "Low back week" })).toHaveAttribute(
      "href",
      "/plans/p1",
    );
    expect(
      within(table).getByRole("img", { name: /Routines per day: Monday: 1 routine/ }),
    ).toBeInTheDocument();
  });

  it("opens a row menu with Duplicate, and no Assign without customers to assign to", async () => {
    const user = userEvent.setup();
    wrap(<TemplateList kind="routine" rows={routineRows} />);
    const table = screen.getByRole("table", { name: "Routine templates" });
    await user.click(within(table).getByRole("button", { name: "Actions for ACL phase 1" }));
    expect(await screen.findByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Assign to customer…" })).not.toBeInTheDocument();
  });

  it("duplicates and opens the copy", async () => {
    const user = userEvent.setup();
    duplicateTemplateAction.mockResolvedValue({ ok: true, data: { id: "copy-id" } });
    wrap(<TemplateList kind="plan" rows={planRows} />);
    const table = screen.getByRole("table", { name: "Plan templates" });
    await user.click(within(table).getByRole("button", { name: "Actions for Low back week" }));
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/plans/copy-id"));
    expect(duplicateTemplateAction).toHaveBeenCalledWith({ kind: "plan", templateId: "p1" });
  });

  it("says so when duplicating fails and does not navigate", async () => {
    const user = userEvent.setup();
    duplicateTemplateAction.mockResolvedValue({ ok: false, error: "templateNotFound" });
    wrap(<TemplateList kind="routine" rows={routineRows} />);
    const table = screen.getByRole("table", { name: "Routine templates" });
    await user.click(within(table).getByRole("button", { name: "Actions for ACL phase 1" }));
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't duplicate the template. Try again.",
    );
    expect(push).not.toHaveBeenCalled();
  });
});

describe("EmptyTemplates and NoTemplateResults", () => {
  it("explains the empty state per kind and offers the new-template dialog", () => {
    wrap(<EmptyTemplates kind="plan" />);
    expect(screen.getByText("No plan templates yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New plan template" })).toBeInTheDocument();
  });

  it("offers to clear filters only when there are some", () => {
    const { rerender } = wrap(<NoTemplateResults kind="routine" canClear />);
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/routines?tab=templates",
    );
    rerender(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <NoTemplateResults kind="routine" canClear={false} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument();
  });
});
