import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { RoutineStatus } from "@/lib/routines";

import messages from "../../../messages/en.json";
import { PhaseBar } from "./phase-bar";

vi.mock("@/server/phases/actions", () => ({
  setPhaseAction: vi.fn(),
  copyIntoNextPhaseAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

function setup(props: {
  status?: RoutineStatus;
  phaseLabel?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PhaseBar
        kind="plan"
        id="p1"
        status={props.status ?? "active"}
        phaseLabel={props.phaseLabel ?? null}
        startsOn={props.startsOn ?? null}
        endsOn={props.endsOn ?? null}
        today="2026-10-05"
      />
    </NextIntlClientProvider>,
  );
}

describe("PhaseBar", () => {
  it("says when no phase is set and offers both actions", () => {
    setup({});
    const bar = screen.getByRole("region", { name: "Phase" });
    expect(within(bar).getByText("No phase set")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Set phase" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Copy into next phase" })).toBeInTheDocument();
  });

  it("shows where an active phase stands today", () => {
    setup({ phaseLabel: "Phase 1", startsOn: "2026-10-01", endsOn: "2026-10-31" });
    expect(screen.getByText("Phase 1")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit phase" })).toBeInTheDocument();
  });

  it("shows Ended for an active phase past its end", () => {
    setup({ phaseLabel: "Phase 1", endsOn: "2026-10-01" });
    expect(screen.getByText("Ended")).toBeInTheDocument();
  });

  it("shows the status of a draft, which the patient never sees whatever its dates say", () => {
    setup({ status: "draft", phaseLabel: "Phase 1", startsOn: "2026-10-01" });
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
  });
});
