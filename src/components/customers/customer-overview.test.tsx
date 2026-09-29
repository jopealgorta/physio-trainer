import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { Case } from "@/db/schema";
import type { CustomerDetail } from "@/server/customers/queries";

import messages from "../../../messages/en.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/customers/actions", () => ({
  saveCaseAction: vi.fn(),
  closeCaseAction: vi.fn(),
  reopenCaseAction: vi.fn(),
}));

import { CustomerOverview } from "./customer-overview";

const customer: CustomerDetail = {
  id: "c1",
  physioId: "p1",
  firstName: "Ana",
  lastName: "Pérez",
  email: null,
  phone: null,
  dateOfBirth: null,
  sex: null,
  occupation: null,
  activity: null,
  medicalHistory: null,
  locale: "es",
  archivedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  cases: [],
};

const baseCase: Case = {
  id: "k1",
  physioId: "p1",
  customerId: "c1",
  title: "ACL rehab",
  diagnosis: null,
  bodyArea: null,
  side: null,
  injuryOn: null,
  surgeryOn: null,
  precautions: null,
  goals: null,
  initialPain: null,
  notes: null,
  status: "open",
  openedOn: "2026-03-01",
  closedOn: null,
  createdAt: new Date("2026-03-01T00:00:00Z"),
  updatedAt: new Date("2026-03-01T00:00:00Z"),
};

function setup(overrides: Partial<CustomerDetail> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CustomerOverview customer={{ ...customer, ...overrides }} today="2026-05-20" />
    </NextIntlClientProvider>,
  );
}

describe("CustomerOverview", () => {
  describe("precautions alert", () => {
    it("lists only open cases that have precautions, above everything else", () => {
      setup({
        cases: [
          { ...baseCase, id: "k1", title: "ACL rehab", precautions: "No running\nNo pivoting" },
          { ...baseCase, id: "k2", title: "No precautions here" },
          {
            ...baseCase,
            id: "k3",
            title: "Old shoulder",
            status: "closed",
            closedOn: "2026-04-01",
            precautions: "Avoid overhead",
          },
        ],
      });
      const alert = screen.getByRole("alert");
      expect(within(alert).getByText("Precautions")).toBeInTheDocument();
      expect(within(alert).getByText("ACL rehab")).toBeInTheDocument();
      expect(alert).toHaveTextContent("No running");
      expect(alert).not.toHaveTextContent("Old shoulder");
      expect(alert).not.toHaveTextContent("Avoid overhead");
      expect(alert).not.toHaveTextContent("No precautions here");
      const precautions = within(alert).getByText(/No running/);
      expect(precautions).toHaveClass("whitespace-pre-line");
      expect(
        alert.compareDocumentPosition(screen.getByText("Basic information")) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("is absent when no open case has precautions", () => {
      setup({ cases: [{ ...baseCase, precautions: "  " }] });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("basic information", () => {
    it('shows "Not set" for every missing value', () => {
      setup();
      expect(screen.getAllByText("Not set")).toHaveLength(6);
      expect(screen.getByText("Patient language").nextElementSibling).toHaveTextContent("Español");
    });

    it("shows the values and formats the date of birth without shifting the day", () => {
      setup({
        email: "ana@example.com",
        phone: "099 123 456",
        dateOfBirth: "1990-09-29",
        sex: "female",
        occupation: "Teacher",
        activity: "Running",
        locale: "en",
      });
      expect(screen.queryByText("Not set")).not.toBeInTheDocument();
      expect(screen.getByText("ana@example.com")).toBeInTheDocument();
      expect(screen.getByText("099 123 456")).toBeInTheDocument();
      expect(screen.getByText("Sep 29, 1990")).toBeInTheDocument();
      expect(screen.getByText("Female")).toBeInTheDocument();
      expect(screen.getByText("Teacher")).toBeInTheDocument();
      expect(screen.getByText("Running")).toBeInTheDocument();
      expect(screen.getByText("English")).toBeInTheDocument();
    });
  });

  describe("medical history", () => {
    it("preserves line breaks", () => {
      setup({ medicalHistory: "Asthma\nPenicillin allergy" });
      expect(screen.getByText("Medical history")).toBeInTheDocument();
      expect(screen.getByText(/Asthma/)).toHaveClass("whitespace-pre-line");
    });

    it("is omitted when empty", () => {
      setup({ medicalHistory: "  " });
      expect(screen.queryByText("Medical history")).not.toBeInTheDocument();
    });
  });

  describe("cases", () => {
    it("shows the empty state when the customer has no cases", () => {
      setup();
      expect(screen.getByText("No open cases")).toBeInTheDocument();
      expect(
        screen.getByText("Open a case to record a diagnosis, precautions and goals."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Closed cases")).not.toBeInTheDocument();
    });

    it("lists open cases and tucks closed ones into a collapsed details element", () => {
      setup({
        cases: [
          { ...baseCase, id: "k1", title: "ACL rehab" },
          {
            ...baseCase,
            id: "k2",
            title: "Old shoulder",
            status: "closed",
            closedOn: "2026-04-01",
          },
        ],
      });
      expect(screen.getByRole("heading", { name: "Open cases" })).toBeInTheDocument();
      expect(screen.getByText("ACL rehab")).toBeInTheDocument();
      const details = screen.getByText("Closed cases").closest("details") as HTMLDetailsElement;
      expect(details).not.toBeNull();
      expect(details.open).toBe(false);
      expect(within(details).getByText("Old shoulder")).toBeInTheDocument();
      expect(within(details).queryByText("ACL rehab")).not.toBeInTheDocument();
    });

    it("offers New case beside the heading, including when there are no cases", () => {
      setup();
      expect(screen.getByRole("button", { name: "New case" })).toBeInTheDocument();
    });

    it("gives every open case Close and every closed case Reopen", () => {
      setup({
        cases: [
          { ...baseCase, id: "k1", title: "ACL rehab" },
          {
            ...baseCase,
            id: "k2",
            title: "Old shoulder",
            status: "closed",
            closedOn: "2026-04-01",
          },
        ],
      });
      expect(screen.getByRole("button", { name: "Close case ACL rehab" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reopen case Old shoulder" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Edit case ACL rehab" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Edit case Old shoulder" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Close case" })).not.toBeInTheDocument();
    });

    it("keeps the closed section but shows the no-open-cases hint when only closed cases exist", () => {
      setup({
        cases: [{ ...baseCase, title: "Old shoulder", status: "closed", closedOn: "2026-04-01" }],
      });
      expect(screen.getByText("No open cases")).toBeInTheDocument();
      expect(screen.getByText("Closed cases")).toBeInTheDocument();
    });
  });
});
