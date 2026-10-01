import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import { PhaseTimeline, type TimelineItem } from "./phase-timeline";

const item = (patch: Partial<TimelineItem> & { id: string }): TimelineItem => ({
  name: "Knee rehab",
  status: "active",
  phaseLabel: null,
  startsOn: null,
  endsOn: null,
  ...patch,
});

const items: TimelineItem[] = [
  item({ id: "a", phaseLabel: "Phase 1", startsOn: "2026-09-01", endsOn: "2026-09-30" }),
  item({ id: "b", phaseLabel: "Phase 2", startsOn: "2026-10-01", endsOn: "2026-10-31" }),
  item({ id: "c", phaseLabel: "Phase 3", startsOn: "2026-11-01" }),
  item({ id: "d", status: "draft" }),
];

function setup(kind: "routine" | "plan" = "routine") {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PhaseTimeline kind={kind} items={items} today="2026-10-05" />
    </NextIntlClientProvider>,
  );
}

describe("PhaseTimeline", () => {
  it("lists the phases in order under the chain's name", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Knee rehab" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Phases" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/routines/a",
      "/routines/b",
      "/routines/c",
      "/routines/d",
    ]);
  });

  it("marks past, current and upcoming phases and highlights the current one", () => {
    setup();
    const [past, current, upcoming, draft] = screen.getAllByRole("link");
    expect(within(past).getByText("Past")).toBeInTheDocument();
    expect(within(current).getByText("Current")).toBeInTheDocument();
    expect(within(upcoming).getByText("Upcoming")).toBeInTheDocument();
    expect(current).toHaveAttribute("aria-current", "step");
    expect(past).not.toHaveAttribute("aria-current");
    expect(upcoming).not.toHaveAttribute("aria-current");
    // A draft shows its status; an unlabelled, undated phase says so.
    expect(within(draft).getByText("Draft")).toBeInTheDocument();
    expect(within(draft).getByText("Untitled phase")).toBeInTheDocument();
    expect(within(draft).getByText("No dates")).toBeInTheDocument();
  });

  it("shows each phase's dates", () => {
    setup();
    const [past, , upcoming] = screen.getAllByRole("link");
    expect(within(past).getByText(/Sep 1\s*–\s*30, 2026/)).toBeInTheDocument();
    expect(within(upcoming).getByText("From Nov 1, 2026")).toBeInTheDocument();
  });

  it("links plans to the plan board", () => {
    setup("plan");
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/plans/a");
  });
});
