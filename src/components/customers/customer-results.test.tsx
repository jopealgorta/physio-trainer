import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import type { CustomerSummary } from "@/server/customers/queries";

import messages from "../../../messages/en.json";
import { CustomerResults } from "./customer-results";

const base: CustomerSummary = {
  id: "c1",
  firstName: "Ana",
  lastName: "Pérez",
  archivedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  activeCase: null,
};

function setup(customers: CustomerSummary[], truncated = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CustomerResults customers={customers} truncated={truncated} />
    </NextIntlClientProvider>,
  );
}

describe("CustomerResults", () => {
  it("links each customer name to its page", () => {
    setup([base, { ...base, id: "c2", firstName: "Bo", lastName: null }]);
    const links = screen.getAllByRole("link", { name: "Ana Pérez" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute("href", "/customers/c1");
    expect(screen.getAllByRole("link", { name: "Bo" })[0]).toHaveAttribute("href", "/customers/c2");
  });

  it("names the table", () => {
    setup([base]);
    expect(screen.getByRole("table", { name: "Customers" })).toBeInTheDocument();
  });

  it("shows the open case title with its body area", () => {
    setup([
      {
        ...base,
        activeCase: { title: "ACL rehab", bodyArea: "knee", side: "left" },
      },
    ]);
    const table = screen.getByRole("table");
    expect(within(table).getByText("ACL rehab")).toBeInTheDocument();
    expect(within(table).getByText("Knee · Left")).toBeInTheDocument();
  });

  it("shows a muted placeholder when there is no open case", () => {
    setup([base]);
    expect(screen.getAllByText("No open case").length).toBeGreaterThan(0);
  });

  it("shows the last-activity dash", () => {
    setup([base]);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Last activity")).toBeInTheDocument();
    expect(within(table).getByText("—")).toBeInTheDocument();
  });

  it("marks archived customers", () => {
    setup([{ ...base, archivedAt: new Date("2026-02-01T00:00:00Z") }]);
    expect(screen.getAllByText("Archived").length).toBeGreaterThan(0);
  });

  it("does not mark active customers as archived", () => {
    setup([base]);
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });

  it("shows the truncated hint only when truncated", () => {
    const { unmount } = setup([base], true);
    expect(screen.getByText(/Showing the first 1\./)).toBeInTheDocument();
    unmount();
    setup([base], false);
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
  });

  it("truncates very long names instead of overflowing", () => {
    const long = "A".repeat(70);
    setup([{ ...base, firstName: long, lastName: "B".repeat(30) }]);
    const name = screen.getAllByText(`${long} ${"B".repeat(30)}`);
    expect(name.length).toBeGreaterThan(0);
    for (const el of name) expect(el).toHaveClass("truncate");
  });
});
