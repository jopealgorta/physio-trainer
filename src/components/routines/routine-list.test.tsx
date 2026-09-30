import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import type { RoutineSummary } from "@/server/routines/queries";

import messages from "../../../messages/en.json";
import { RoutineList } from "./routine-list";

const base: RoutineSummary = {
  id: "r1",
  name: "Knee week 1",
  status: "active",
  customerId: "c1",
  customerFirstName: "Ana",
  customerLastName: "Pérez",
  caseTitle: "ACL rehab",
  itemCount: 1,
  sessionsPerWeek: 3,
  updatedAt: new Date("2026-03-05T12:00:00Z"),
};
const routines: RoutineSummary[] = [
  base,
  {
    ...base,
    id: "r2",
    name: "Shoulder mobility",
    status: "draft",
    customerFirstName: "Bo",
    customerLastName: null,
    caseTitle: null,
    itemCount: 4,
    sessionsPerWeek: null,
  },
];

function setup(showCustomer: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <RoutineList routines={routines} showCustomer={showCustomer} />
    </NextIntlClientProvider>,
  );
}

describe("RoutineList", () => {
  it("links each routine to its editor", () => {
    setup(true);
    const table = screen.getByRole("table", { name: "Routines" });
    expect(within(table).getByRole("link", { name: "Knee week 1" })).toHaveAttribute(
      "href",
      "/routines/r1",
    );
    expect(within(table).getByRole("link", { name: "Shoulder mobility" })).toHaveAttribute(
      "href",
      "/routines/r2",
    );
  });

  it("shows customer, case, status, plural counts, frequency and date", () => {
    setup(true);
    const table = screen.getByRole("table", { name: "Routines" });
    expect(within(table).getByRole("columnheader", { name: "Customer" })).toBeInTheDocument();
    expect(within(table).getByText("Ana Pérez")).toBeInTheDocument();
    expect(within(table).getByText("Bo")).toBeInTheDocument();
    expect(within(table).getByText("ACL rehab")).toBeInTheDocument();
    expect(within(table).getByText("Active")).toBeInTheDocument();
    expect(within(table).getByText("Draft")).toBeInTheDocument();
    expect(within(table).getByText("1 exercise")).toBeInTheDocument();
    expect(within(table).getByText("4 exercises")).toBeInTheDocument();
    expect(within(table).getByText("3×")).toBeInTheDocument();
    expect(within(table).getAllByText("Mar 5, 2026").length).toBeGreaterThan(0);
  });

  it("hides the customer column when showCustomer is false", () => {
    setup(false);
    const table = screen.getByRole("table", { name: "Routines" });
    expect(within(table).queryByRole("columnheader", { name: "Customer" })).toBeNull();
    expect(within(table).queryByText("Ana Pérez")).toBeNull();
    expect(within(table).getByRole("columnheader", { name: "Case" })).toBeInTheDocument();
  });

  it("also renders cards for narrow screens", () => {
    setup(true);
    expect(screen.getAllByRole("link", { name: "Knee week 1" })).toHaveLength(2);
  });
});
