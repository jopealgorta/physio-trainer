import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import type { Dashboard } from "@/lib/dashboard";
import messages from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { DashboardView } from "./dashboard-view";

const empty: Dashboard = {
  totals: { activeCustomers: 0, sessionsThisWeek: 0 },
  attention: [],
  newComments: [],
  recentlyActive: [],
};
const data: Dashboard = {
  totals: { activeCustomers: 12, sessionsThisWeek: 31 },
  attention: [
    {
      customerId: "c1",
      name: "Ana Lopez",
      reasons: [
        { rule: "highPain", pain: 8 },
        { rule: "painRise", delta: 3.5 },
        { rule: "lowAdherence", percent: 25 },
      ],
    },
  ],
  newComments: [
    {
      customerId: "c2",
      name: "Beto",
      count: 2,
      latest: {
        comment: "<i>Knee</i> hurts",
        performedOn: "2026-10-07",
        routineName: "Knee rehab",
      },
    },
  ],
  recentlyActive: [
    {
      customerId: "c3",
      name: "Cara",
      lastLoggedAt: new Date("2026-10-07T18:30:00Z"),
      sessionsLast7: 1,
    },
  ],
};

function setup(dashboard: Dashboard, locale: "en" | "es" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      <DashboardView data={dashboard} timeZone="UTC" />
    </NextIntlClientProvider>,
  );
}

describe("DashboardView", () => {
  it("shows the totals", () => {
    setup(data);
    expect(screen.getByText("Active customers").closest("div")).toHaveTextContent("12");
    expect(screen.getByText("Sessions logged this week").closest("div")).toHaveTextContent("31");
  });

  it("lists who needs attention with every reason, linking to their Activity tab", () => {
    setup(data);
    const card = screen.getByRole("region", { name: "Needs attention" });
    const link = within(card).getByRole("link", { name: /Ana Lopez/ });
    expect(link).toHaveAttribute("href", "/customers/c1?tab=activity");
    expect(within(card).getByText("Pain 8/10 in the last 7 days")).toBeInTheDocument();
    expect(within(card).getByText("Pain up 3.5 points on the week before")).toBeInTheDocument();
    expect(
      within(card).getByText("Only 25% of planned sessions done in the last 7 days"),
    ).toBeInTheDocument();
  });

  it("shows the newest comment per customer as plain text", () => {
    setup(data);
    const card = screen.getByRole("region", { name: "New comments" });
    expect(within(card).getByRole("link", { name: /Beto/ })).toHaveAttribute(
      "href",
      "/customers/c2?tab=activity",
    );
    expect(within(card).getByText("2 new comments")).toBeInTheDocument();
    expect(within(card).getByText("<i>Knee</i> hurts")).toBeInTheDocument();
    expect(within(card).getByText("Knee rehab · Oct 7, 2026")).toBeInTheDocument();
    expect(document.querySelector("i")).toBeNull();
  });

  it("lists recently active customers", () => {
    setup(data);
    const card = screen.getByRole("region", { name: "Recently active" });
    expect(within(card).getByRole("link", { name: /Cara/ })).toHaveAttribute(
      "href",
      "/customers/c3?tab=activity",
    );
    expect(
      within(card).getByText("1 session in the last 7 days · Last: Oct 7"),
    ).toBeInTheDocument();
  });

  it("explains each empty list", () => {
    setup(empty);
    expect(screen.getByText("Nobody needs attention right now.")).toBeInTheDocument();
    expect(screen.getByText("No new comments.")).toBeInTheDocument();
    expect(screen.getByText("Nobody has logged a session in the last 7 days.")).toBeInTheDocument();
  });

  it("speaks Spanish", () => {
    setup(data, "es");
    expect(screen.getByRole("region", { name: "Necesitan atención" })).toBeInTheDocument();
    expect(screen.getByText("Dolor 8/10 en los últimos 7 días")).toBeInTheDocument();
  });
});
