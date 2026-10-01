import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ScheduleState } from "@/lib/schedule";

import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import { PhaseChips, PhaseRange } from "./phase-chips";

function setup(
  props: {
    phaseLabel?: string | null;
    startsOn?: string | null;
    endsOn?: string | null;
    state?: ScheduleState;
  },
  locale: "en" | "es" = "en",
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? enMessages : esMessages}
      timeZone="America/Argentina/Buenos_Aires"
    >
      <PhaseChips
        phaseLabel={props.phaseLabel ?? null}
        startsOn={props.startsOn ?? null}
        endsOn={props.endsOn ?? null}
        state={props.state ?? "active"}
      />
    </NextIntlClientProvider>,
  );
}

describe("PhaseChips", () => {
  it("renders nothing without a label or dates", () => {
    const { container } = setup({});
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the label, the range and the current badge", () => {
    setup({ phaseLabel: "Phase 2", startsOn: "2026-10-05", endsOn: "2026-10-31" });
    expect(screen.getByText("Phase 2")).toBeInTheDocument();
    expect(screen.getByText(/Oct 5\s*–\s*31, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("does not shift the calendar day with the viewer's time zone", () => {
    setup({ startsOn: "2026-10-05", endsOn: "2026-10-05" });
    expect(screen.getByText(/Oct 5, 2026/)).toBeInTheDocument();
  });

  it("describes an open start or end", () => {
    const { unmount } = setup({ startsOn: "2026-10-05" });
    expect(screen.getByText("From Oct 5, 2026")).toBeInTheDocument();
    unmount();
    setup({ endsOn: "2026-10-31" });
    expect(screen.getByText("Until Oct 31, 2026")).toBeInTheDocument();
  });

  it("shows an Ended or Upcoming badge, and none for an inactive item", () => {
    const ended = setup({ phaseLabel: "Phase 1", endsOn: "2026-09-30", state: "ended" });
    expect(screen.getByText("Ended")).toBeInTheDocument();
    ended.unmount();
    const upcoming = setup({ phaseLabel: "Phase 3", startsOn: "2027-01-01", state: "upcoming" });
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    upcoming.unmount();
    setup({ phaseLabel: "Phase 4", state: "inactive" });
    expect(screen.queryByText(/Ended|Upcoming|Current/)).not.toBeInTheDocument();
  });

  it("formats dates in the active locale", () => {
    setup({ phaseLabel: "Fase 2", startsOn: "2026-10-05", endsOn: "2026-10-31" }, "es");
    expect(screen.getByText(/5\s*–\s*31 oct 2026/)).toBeInTheDocument();
    expect(screen.getByText("Actual")).toBeInTheDocument();
  });
});

describe("PhaseRange", () => {
  it("renders nothing without dates", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <PhaseRange startsOn={null} endsOn={null} />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
