import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RoutineStatus } from "@/lib/routines";

import messages from "../../../messages/en.json";
import { NextPhaseDialog } from "./next-phase-dialog";

const m = vi.hoisted(() => ({ copyIntoNextPhaseAction: vi.fn(), push: vi.fn() }));
vi.mock("@/server/phases/actions", () => ({ copyIntoNextPhaseAction: m.copyIntoNextPhaseAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push, refresh: vi.fn() }) }));

type Props = {
  kind?: "routine" | "plan";
  status?: RoutineStatus;
  phaseLabel?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
};

function setup({
  kind = "routine",
  status = "active",
  phaseLabel = "Phase 1",
  startsOn = "2026-09-01",
  endsOn = null,
}: Props = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <NextPhaseDialog
        kind={kind}
        id="r1"
        status={status}
        phaseLabel={phaseLabel}
        startsOn={startsOn}
        endsOn={endsOn}
        today="2026-10-05"
      />
    </NextIntlClientProvider>,
  );
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Copy into next phase" }));
  return screen.findByRole("dialog");
};

beforeEach(() => {
  m.copyIntoNextPhaseAction.mockReset();
  m.push.mockReset();
  m.copyIntoNextPhaseAction.mockResolvedValue({ ok: true, data: { id: "new-1" } });
});

describe("NextPhaseDialog", () => {
  it("defaults to the next phase number, tomorrow and ending the current phase", async () => {
    const user = userEvent.setup();
    setup();
    await open(user);
    expect(screen.getByLabelText("Phase name")).toHaveValue("Phase 2");
    expect(screen.getByLabelText("Starts on")).toHaveValue("2026-10-06");
    expect(screen.getByLabelText("Ends on (optional)")).toHaveValue("");
    expect(
      screen.getByRole("checkbox", {
        name: "End the current phase the day before the new one starts",
      }),
    ).toBeChecked();
    expect(screen.queryByText(/overlaps this one/)).not.toBeInTheDocument();
  });

  it("starts the day after the current phase ends", async () => {
    const user = userEvent.setup();
    setup({ phaseLabel: "Phase 2 – strength", endsOn: "2026-10-31" });
    await open(user);
    expect(screen.getByLabelText("Phase name")).toHaveValue("Phase 3");
    expect(screen.getByLabelText("Starts on")).toHaveValue("2026-11-01");
  });

  it("uses the plan wording for plans", async () => {
    const user = userEvent.setup();
    setup({ kind: "plan" });
    expect(await open(user)).toHaveAccessibleName("Copy plan into next phase");
  });

  it("creates the copy and opens it", async () => {
    const user = userEvent.setup();
    setup();
    await open(user);
    await user.click(screen.getByRole("button", { name: "Create next phase" }));
    await waitFor(() =>
      expect(m.copyIntoNextPhaseAction).toHaveBeenCalledWith({
        kind: "routine",
        id: "r1",
        phaseLabel: "Phase 2",
        startsOn: "2026-10-06",
        endsOn: "",
        endCurrent: true,
      }),
    );
    await waitFor(() => expect(m.push).toHaveBeenCalledWith("/routines/new-1"));
  });

  it("opens the new plan on its board", async () => {
    const user = userEvent.setup();
    setup({ kind: "plan" });
    await open(user);
    await user.click(screen.getByRole("button", { name: "Create next phase" }));
    await waitFor(() => expect(m.push).toHaveBeenCalledWith("/plans/new-1"));
  });

  it("warns about an overlap when the current phase keeps running", async () => {
    const user = userEvent.setup();
    setup();
    await open(user);
    await user.click(
      screen.getByRole("checkbox", {
        name: "End the current phase the day before the new one starts",
      }),
    );
    expect(await screen.findByText(/The new phase overlaps this one/)).toBeVisible();
  });

  it("blocks a start that would end the current phase before it began", async () => {
    const user = userEvent.setup();
    setup({ startsOn: "2026-10-06" });
    await open(user);
    expect(
      await screen.findByText(/Start the new phase after the current one starts/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Create next phase" }));
    expect(m.copyIntoNextPhaseAction).not.toHaveBeenCalled();
  });

  it("requires a start date and an ordered window", async () => {
    const user = userEvent.setup();
    setup();
    await open(user);
    await user.clear(screen.getByLabelText("Starts on"));
    await user.click(screen.getByRole("button", { name: "Create next phase" }));
    expect(await screen.findByText("Enter a valid start date.")).toBeVisible();
    await user.type(screen.getByLabelText("Starts on"), "2026-10-20");
    await user.type(screen.getByLabelText("Ends on (optional)"), "2026-10-10");
    await user.click(screen.getByRole("button", { name: "Create next phase" }));
    expect(await screen.findByText("The end date can't be before the start date.")).toBeVisible();
    expect(m.copyIntoNextPhaseAction).not.toHaveBeenCalled();
  });

  it("hides the end-current choice for a draft and shows the server's error", async () => {
    const user = userEvent.setup();
    m.copyIntoNextPhaseAction.mockResolvedValue({ ok: false, error: "notFound" });
    setup({ status: "draft" });
    await open(user);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create next phase" }));
    expect(await screen.findByText("This item no longer exists.")).toBeVisible();
    expect(m.push).not.toHaveBeenCalled();
  });
});
