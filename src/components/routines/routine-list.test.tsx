import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { RoutineSummary } from "@/server/routines/queries";

vi.mock("@/server/routines/actions", () => ({ createRoutineAction: vi.fn() }));

import messages from "../../../messages/en.json";
import { EmptyRoutines, RoutineList } from "./routine-list";

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
  phaseLabel: null,
  startsOn: null,
  endsOn: null,
  previousId: null,
  isStandalone: true,
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

  describe("phases", () => {
    const phased = (patch: Partial<RoutineSummary>) =>
      render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <RoutineList routines={[{ ...base, ...patch }]} showCustomer={false} />
        </NextIntlClientProvider>,
      );

    it("shows the label and dates of a standalone routine, and Ended once it is over", () => {
      phased({ phaseLabel: "Phase 1", startsOn: "2020-01-01", endsOn: "2020-01-31" });
      const table = screen.getByRole("table", { name: "Routines" });
      expect(within(table).getByText("Phase 1")).toBeInTheDocument();
      expect(within(table).getByText(/Jan 1\s*–\s*31, 2020/)).toBeInTheDocument();
      expect(within(table).getByText("Ended")).toBeInTheDocument();
    });

    it("marks a routine that is in its window as current", () => {
      phased({ phaseLabel: "Phase 2", startsOn: "2020-01-01", endsOn: null });
      expect(screen.getAllByText("Current").length).toBeGreaterThan(0);
    });

    it("shows nothing for a routine inside a plan", () => {
      phased({ isStandalone: false, phaseLabel: "Phase 2", startsOn: "2020-01-01" });
      expect(screen.queryByText("Phase 2")).not.toBeInTheDocument();
    });
  });
});

describe("EmptyRoutines", () => {
  const empty = (customers: { id: string; name: string }[]) =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EmptyRoutines customers={customers} />
      </NextIntlClientProvider>,
    );

  it("offers to create the first routine when there are customers", () => {
    empty([{ id: "c1", name: "Ana Pérez" }]);
    expect(screen.getByText("Pick a customer to create their first routine.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New routine" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Go to customers" })).not.toBeInTheDocument();
  });

  it("sends the physio to add a customer when there are none", () => {
    empty([]);
    expect(screen.getByRole("link", { name: "Go to customers" })).toHaveAttribute(
      "href",
      "/customers",
    );
    expect(screen.queryByRole("button", { name: "New routine" })).not.toBeInTheDocument();
  });
});
