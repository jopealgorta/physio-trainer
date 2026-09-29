import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { Case } from "@/db/schema";

import messages from "../../../messages/en.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/customers/actions", () => ({
  saveCaseAction: vi.fn(),
  closeCaseAction: vi.fn(),
  reopenCaseAction: vi.fn(),
}));

import { CaseCard } from "./case-card";

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

function setup(overrides: Partial<Case> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CaseCard case={{ ...baseCase, ...overrides }} customerName="Ana Pérez" today="2026-05-20" />
    </NextIntlClientProvider>,
  );
}

describe("CaseCard", () => {
  it("shows the title, status and opened date", () => {
    setup();
    expect(screen.getByRole("heading", { name: "ACL rehab" })).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Opened on Mar 1, 2026")).toBeInTheDocument();
  });

  it("shows the body area badge only when set", () => {
    const { unmount } = setup({ bodyArea: "knee", side: "left" });
    expect(screen.getByText("Knee · Left")).toBeInTheDocument();
    unmount();
    setup();
    expect(screen.queryByText(/Knee/)).not.toBeInTheDocument();
  });

  it("shows the clinical details that are present, keeping line breaks", () => {
    setup({
      diagnosis: "Grade 2 sprain",
      goals: "Run 5k\nPlay football",
      initialPain: 7,
      notes: "Slow progress",
    });
    expect(screen.getByText("Grade 2 sprain")).toBeInTheDocument();
    expect(screen.getByText(/Run 5k/)).toHaveClass("whitespace-pre-line");
    expect(screen.getByText("Initial pain: 7/10")).toBeInTheDocument();
    expect(screen.getByText("Slow progress")).toBeInTheDocument();
  });

  it("omits the pain line when it is unset, but shows zero", () => {
    const { unmount } = setup();
    expect(screen.queryByText(/Initial pain/)).not.toBeInTheDocument();
    unmount();
    setup({ initialPain: 0 });
    expect(screen.getByText("Initial pain: 0/10")).toBeInTheDocument();
  });

  it("shows a closed case's status and closing date", () => {
    setup({ status: "closed", closedOn: "2026-04-15" });
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("Closed on Apr 15, 2026")).toBeInTheDocument();
  });

  it("offers Edit and Close on an open case", () => {
    setup();
    expect(screen.getByRole("button", { name: "Edit case" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close case" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reopen case" })).not.toBeInTheDocument();
  });

  it("offers Edit and Reopen on a closed case", () => {
    setup({ status: "closed", closedOn: "2026-04-15" });
    expect(screen.getByRole("button", { name: "Edit case" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reopen case" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close case" })).not.toBeInTheDocument();
  });

  it("opens the edit sheet prefilled with the case's fields", async () => {
    const user = userEvent.setup();
    setup({ diagnosis: "Tear", bodyArea: "knee", side: "left", initialPain: 3 });
    await user.click(screen.getByRole("button", { name: "Edit case" }));
    expect(await screen.findByLabelText("Title")).toHaveValue("ACL rehab");
    expect(screen.getByLabelText("Diagnosis")).toHaveValue("Tear");
    expect(screen.getByLabelText("Initial pain (0–10)")).toHaveValue("3");
    expect(screen.getByLabelText("Opened on")).toHaveValue("2026-03-01");
  });
});
