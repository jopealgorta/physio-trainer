import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";

const refresh = vi.fn();
const reopenCase = vi.fn();
const closeCase = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/customers/actions", () => ({
  reopenCaseAction: (...args: unknown[]) => reopenCase(...args),
  closeCaseAction: (...args: unknown[]) => closeCase(...args),
}));

import { CaseActions } from "./case-actions";

function setup(status: "open" | "closed") {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CaseActions caseId="case-1" title="ACL rehab" status={status} today="2026-05-20">
        <button type="button">Edit</button>
      </CaseActions>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  refresh.mockReset();
  reopenCase.mockReset();
  closeCase.mockReset();
});

describe("CaseActions", () => {
  it("offers Close for an open case and renders its children", async () => {
    const user = userEvent.setup();
    setup("open");
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reopen case ACL rehab" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close case ACL rehab" }));
    expect(await screen.findByLabelText("Closing date")).toHaveValue("2026-05-20");
  });

  it("reopens a closed case immediately and refreshes", async () => {
    const user = userEvent.setup();
    reopenCase.mockResolvedValue({ ok: true, data: null });
    setup("closed");
    expect(screen.queryByRole("button", { name: "Close case ACL rehab" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reopen case ACL rehab" }));
    await waitFor(() => expect(reopenCase).toHaveBeenCalledWith("case-1"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error when the case is already open", async () => {
    const user = userEvent.setup();
    reopenCase.mockResolvedValue({ ok: false, error: "notClosed" });
    setup("closed");
    await user.click(screen.getByRole("button", { name: "Reopen case ACL rehab" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This case is already open.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a generic error when the action throws", async () => {
    const user = userEvent.setup();
    reopenCase.mockRejectedValue(new Error("boom"));
    setup("closed");
    await user.click(screen.getByRole("button", { name: "Reopen case ACL rehab" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
  });
});
