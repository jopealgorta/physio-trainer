import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import type { PlanSummary } from "@/server/plans/queries";

import messages from "../../../messages/en.json";
import { EmptyPlans, NoPlanResults, PlanList } from "./plan-list";

const base: PlanSummary = {
  id: "p1",
  name: "Week 1",
  status: "active",
  customerId: "c1",
  customerFirstName: "Ana",
  customerLastName: "Pérez",
  caseTitle: "ACL rehab",
  sessionsPerDay: [1, 0, 1, 0, 1, 0, 0],
  phaseLabel: null,
  startsOn: null,
  endsOn: null,
  previousId: null,
  updatedAt: new Date("2026-03-05T12:00:00Z"),
};
const plans: PlanSummary[] = [
  base,
  {
    ...base,
    id: "p2",
    name: "Maintenance",
    status: "draft",
    customerFirstName: "Bo",
    customerLastName: null,
    caseTitle: null,
    sessionsPerDay: [0, 0, 0, 0, 0, 0, 0],
  },
];

const wrap = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );

describe("PlanList", () => {
  it("links each plan to its board", () => {
    wrap(<PlanList plans={plans} showCustomer />);
    const table = screen.getByRole("table", { name: "Weekly plans" });
    expect(within(table).getByRole("link", { name: "Week 1" })).toHaveAttribute(
      "href",
      "/plans/p1",
    );
    expect(within(table).getByRole("link", { name: "Maintenance" })).toHaveAttribute(
      "href",
      "/plans/p2",
    );
  });

  it("shows customer, case, status, week strip and a formatted date", () => {
    wrap(<PlanList plans={plans} showCustomer />);
    const table = screen.getByRole("table", { name: "Weekly plans" });
    const row = within(table).getByRole("row", { name: /Week 1/ });
    expect(row).toHaveTextContent("Ana Pérez");
    expect(row).toHaveTextContent("ACL rehab");
    expect(row).toHaveTextContent("Active");
    expect(row).toHaveTextContent("Mar 5, 2026");
    expect(within(row).getByRole("img")).toHaveAccessibleName(/Monday: 1 routine, Tuesday: rest/);
  });

  it("omits the customer column on a customer's own page", () => {
    wrap(<PlanList plans={plans} showCustomer={false} />);
    expect(screen.queryByRole("columnheader", { name: "Customer" })).not.toBeInTheDocument();
  });

  it("renders a card list for narrow screens too", () => {
    wrap(<PlanList plans={plans} showCustomer />);
    expect(screen.getAllByRole("link", { name: "Maintenance" })).toHaveLength(2);
  });

  it("copes with a plan without a customer", () => {
    wrap(
      <PlanList
        plans={[{ ...base, customerId: null, customerFirstName: null, customerLastName: null }]}
        showCustomer
      />,
    );
    expect(screen.getAllByRole("link", { name: "Week 1" }).length).toBeGreaterThan(0);
  });
});

describe("empty states", () => {
  it("EmptyPlans points to customers", () => {
    wrap(<EmptyPlans />);
    expect(screen.getByRole("link", { name: "Go to customers" })).toHaveAttribute(
      "href",
      "/customers",
    );
  });

  it("NoPlanResults only offers clearing when a filter is active", () => {
    const { unmount } = wrap(<NoPlanResults canClear />);
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/plans");
    unmount();
    wrap(<NoPlanResults canClear={false} />);
    expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument();
  });
});

describe("PlanList phases", () => {
  it("shows a plan's phase label, dates and state", () => {
    wrap(
      <PlanList
        plans={[{ ...base, phaseLabel: "Phase 1", startsOn: "2020-01-01", endsOn: "2020-01-31" }]}
        showCustomer={false}
      />,
    );
    const table = screen.getByRole("table", { name: "Weekly plans" });
    expect(within(table).getByText("Phase 1")).toBeInTheDocument();
    expect(within(table).getByText(/Jan 1\s*–\s*31, 2020/)).toBeInTheDocument();
    expect(within(table).getByText("Ended")).toBeInTheDocument();
  });
});
