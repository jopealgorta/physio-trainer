import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { chooseOption } from "@/test/select";
import messages from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { PainChart, tickDays } from "./pain-chart";

const overall = [
  { date: "2026-10-05", pain: 3 },
  { date: "2026-10-06", pain: 5 },
  { date: "2026-10-07", pain: 7 },
];
const routines = [
  { id: "knee", name: "Knee", points: [{ date: "2026-10-07", pain: 7 }] },
  {
    id: "back",
    name: "Back",
    points: [
      { date: "2026-10-05", pain: 3 },
      { date: "2026-10-06", pain: 5 },
    ],
  },
];

function setup(
  props: Partial<React.ComponentProps<typeof PainChart>> = {},
  locale: "en" | "es" = "en",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      <PainChart overall={overall} routines={routines} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("PainChart", () => {
  it("summarises the overall series in words and as a table", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Pain over time" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Pain over time (All routines): 3 ratings, latest 7 out of 10 on Oct 7.",
      }),
    ).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Pain ratings" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByRole("cell", { name: "Oct 6" })).toBeInTheDocument();
  });

  it("follows one routine when chosen", async () => {
    const user = userEvent.setup();
    setup();
    await chooseOption(user, screen.getByRole("combobox", { name: "Routine" }), "Back");
    expect(
      screen.getByRole("img", {
        name: "Pain over time (Back): 2 ratings, latest 5 out of 10 on Oct 6.",
      }),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3);
  });

  it("says so when nothing was rated, and offers no routine picker", () => {
    setup({ overall: [], routines: [] });
    expect(screen.getByText("No pain ratings yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("speaks Spanish with Spanish dates", () => {
    setup({}, "es");
    expect(
      screen.getByRole("heading", { name: "Dolor a lo largo del tiempo" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "6 oct" })).toBeInTheDocument();
  });
});

describe("tickDays", () => {
  const DAY = 86_400_000;
  const at = (date: string) => Date.parse(`${date}T00:00:00Z`);

  it("puts ticks on whole days, at most five", () => {
    const ticks = tickDays(at("2026-09-01"), at("2026-10-07"));
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks.every((tick) => tick % DAY === 0)).toBe(true);
    expect(ticks[0]).toBe(at("2026-09-01"));
  });

  it("handles a single day", () => {
    expect(tickDays(at("2026-10-07"), at("2026-10-07"))).toEqual([at("2026-10-07")]);
  });
});
