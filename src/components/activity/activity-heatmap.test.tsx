import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import type { DayCell } from "@/lib/adherence";
import { heatmapWeeks } from "@/lib/adherence";
import messages from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { ActivityHeatmap } from "./activity-heatmap";

const weeks = heatmapWeeks("2026-10-08", 2);
const cell = (date: string, extra: Partial<DayCell> = {}): DayCell => ({
  date,
  state: "none",
  planned: 0,
  completed: 0,
  ...extra,
});
const cells = weeks.flat().map((date) => cell(date));
const withState = (date: string, extra: Partial<DayCell>) =>
  cells.map((entry) => (entry.date === date ? { ...entry, ...extra } : entry));

function setup(data: DayCell[], locale: "en" | "es" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      <ActivityHeatmap weeks={weeks} cells={data} />
    </NextIntlClientProvider>,
  );
}

describe("ActivityHeatmap", () => {
  it("draws one named square per day, Monday first", () => {
    setup(cells);
    const grid = screen.getByRole("list", {
      name: "Calendar of the last 12 weeks, one square per day, Monday to Sunday.",
    });
    const items = within(grid).getAllByRole("listitem");
    expect(items).toHaveLength(14);
    expect(items[0]).toHaveAccessibleName("Sep 28, 2026: nothing planned");
    expect(items[7]).toHaveAccessibleName("Oct 5, 2026: nothing planned");
  });

  it("describes what happened each day", () => {
    setup(
      cells.map((entry) => {
        switch (entry.date) {
          case "2026-09-28":
            return { ...entry, state: "done" as const, planned: 1, completed: 1 };
          case "2026-09-29":
            return { ...entry, state: "partial" as const, planned: 2, completed: 1 };
          case "2026-09-30":
            return { ...entry, state: "missed" as const, planned: 1 };
          case "2026-10-01":
            return { ...entry, state: "extra" as const, completed: 1 };
          case "2026-10-02":
            return { ...entry, state: "planned" as const, planned: 1 };
          case "2026-10-03":
            return { ...entry, state: "upcoming" as const, planned: 3 };
          default:
            return entry;
        }
      }),
    );
    expect(screen.getByRole("listitem", { name: /Sep 28.*done, 1 of 1 planned/ })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: /Sep 29.*1 of 2 planned done/ })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: /Sep 30.*missed, 1 planned/ })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: /Oct 1.*1 done, none planned/ })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: /Oct 2.*1 planned today/ })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: /Oct 3.*3 planned/ })).toBeTruthy();
  });

  it("marks a cell's state for styling and explains the colours in a legend", () => {
    setup(withState("2026-09-28", { state: "done", planned: 1, completed: 1 }));
    expect(screen.getByRole("listitem", { name: /Sep 28/ })).toHaveAttribute("data-state", "done");
    const legend = screen.getByRole("list", { name: "Legend" });
    for (const name of ["All done", "Some done", "Missed", "Extra", "Planned", "Nothing planned"]) {
      expect(within(legend).getByText(name)).toBeInTheDocument();
    }
  });

  it("labels the months and speaks Spanish", () => {
    setup(cells, "es");
    expect(screen.getAllByText(/^(sept|oct)/).length).toBeGreaterThan(0);
    expect(screen.getByRole("list", { name: "Leyenda" })).toBeInTheDocument();
  });
});
