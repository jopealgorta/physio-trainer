import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import { PhasePopover } from "./phase-popover";

const m = vi.hoisted(() => ({ setPhaseAction: vi.fn(), refresh: vi.fn() }));
vi.mock("@/server/phases/actions", () => ({ setPhaseAction: m.setPhaseAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh, push: vi.fn() }) }));

const ID = "r1";

function setup(
  values = { phaseLabel: null, startsOn: null, endsOn: null } as {
    phaseLabel: string | null;
    startsOn: string | null;
    endsOn: string | null;
  },
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PhasePopover kind="routine" id={ID} values={values} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  m.setPhaseAction.mockReset();
  m.refresh.mockReset();
  m.setPhaseAction.mockResolvedValue({ ok: true, data: {} });
});

describe("PhasePopover", () => {
  it("offers to set a phase when there is none and to edit it otherwise", () => {
    const { unmount } = setup();
    expect(screen.getByRole("button", { name: "Set phase" })).toBeInTheDocument();
    unmount();
    setup({ phaseLabel: "Phase 1", startsOn: null, endsOn: null });
    expect(screen.getByRole("button", { name: "Edit phase" })).toBeInTheDocument();
  });

  it("prefills the form from the current values", async () => {
    const user = userEvent.setup();
    setup({ phaseLabel: "Phase 1", startsOn: "2026-10-01", endsOn: "2026-10-31" });
    await user.click(screen.getByRole("button", { name: "Edit phase" }));
    expect(await screen.findByLabelText("Phase name")).toHaveValue("Phase 1");
    expect(screen.getByLabelText("Starts on")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Ends on (optional)")).toHaveValue("2026-10-31");
    expect(screen.getByLabelText("Phase name")).toHaveAttribute("maxlength", "40");
  });

  it("saves the typed values, closes and refreshes", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Set phase" }));
    await user.type(await screen.findByLabelText("Phase name"), "Phase 2");
    await user.type(screen.getByLabelText("Starts on"), "2026-10-08");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(m.setPhaseAction).toHaveBeenCalledWith({
        kind: "routine",
        id: ID,
        phaseLabel: "Phase 2",
        startsOn: "2026-10-08",
        endsOn: "",
      }),
    );
    await waitFor(() => expect(m.refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText("Phase name")).not.toBeInTheDocument());
  });

  it("refuses a reversed window without calling the server", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Set phase" }));
    await user.type(await screen.findByLabelText("Starts on"), "2026-10-08");
    await user.type(screen.getByLabelText("Ends on (optional)"), "2026-10-01");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The end date can't be before the start date.")).toBeVisible();
    expect(m.setPhaseAction).not.toHaveBeenCalled();
  });

  it("shows the server's reason and stays open", async () => {
    const user = userEvent.setup();
    m.setPhaseAction.mockResolvedValue({ ok: false, error: "notStandalone" });
    setup();
    await user.click(screen.getByRole("button", { name: "Set phase" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("This routine belongs to a plan. Set the phase on the plan instead."),
    ).toBeVisible();
    expect(m.refresh).not.toHaveBeenCalled();
  });

  it("shows a generic error when the action throws", async () => {
    const user = userEvent.setup();
    m.setPhaseAction.mockRejectedValue(new Error("network"));
    setup();
    await user.click(screen.getByRole("button", { name: "Set phase" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText("Something went wrong. Try again.")).toBeVisible();
  });
});
