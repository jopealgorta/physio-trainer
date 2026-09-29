import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";

const refresh = vi.fn();
const closeCase = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/customers/actions", () => ({
  closeCaseAction: (...args: unknown[]) => closeCase(...args),
}));

import { CloseCaseDialog } from "./close-case-dialog";

function setup() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CloseCaseDialog caseId="case-1" title="ACL rehab" today="2026-05-20" />
    </NextIntlClientProvider>,
  );
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Close case ACL rehab" }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  refresh.mockReset();
  closeCase.mockReset();
});

describe("CloseCaseDialog", () => {
  it("defaults the closing date to the today prop", async () => {
    const user = userEvent.setup();
    setup();
    await open(user);
    const input = screen.getByLabelText("Closing date");
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveValue("2026-05-20");
    expect(screen.getByText("Close this case?")).toBeInTheDocument();
  });

  it("closes the case with the chosen date, then closes and refreshes", async () => {
    const user = userEvent.setup();
    closeCase.mockResolvedValue({ ok: true, data: null });
    setup();
    await open(user);
    const input = screen.getByLabelText("Closing date");
    await user.clear(input);
    await user.type(input, "2026-05-18");
    await user.click(screen.getByRole("button", { name: "Close case" }));
    await waitFor(() => expect(closeCase).toHaveBeenCalledWith("case-1", "2026-05-18"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("sends null when the date is cleared so the server uses today", async () => {
    const user = userEvent.setup();
    closeCase.mockResolvedValue({ ok: true, data: null });
    setup();
    await open(user);
    await user.clear(screen.getByLabelText("Closing date"));
    await user.click(screen.getByRole("button", { name: "Close case" }));
    await waitFor(() => expect(closeCase).toHaveBeenCalledWith("case-1", null));
    // Let the success path finish so its refresh cannot leak into the next test.
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("stays open and explains a closing date before the opening date", async () => {
    const user = userEvent.setup();
    closeCase.mockResolvedValue({ ok: false, error: "closedBeforeOpened" });
    setup();
    await open(user);
    await user.click(screen.getByRole("button", { name: "Close case" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The closing date can't be before the opening date.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a generic error when the action throws", async () => {
    const user = userEvent.setup();
    closeCase.mockRejectedValue(new Error("boom"));
    setup();
    await open(user);
    await user.click(screen.getByRole("button", { name: "Close case" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
  });

  it.each(["closedBeforeOpened", "dateInvalid"] as const)(
    "keeps the typed date after a %s error",
    async (error) => {
      const user = userEvent.setup();
      closeCase.mockResolvedValue({ ok: false, error });
      setup();
      await open(user);
      const input = screen.getByLabelText("Closing date");
      await user.clear(input);
      await user.type(input, "2026-01-02");
      await user.click(screen.getByRole("button", { name: "Close case" }));
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(closeCase).toHaveBeenCalledWith("case-1", "2026-01-02");
      expect(screen.getByLabelText("Closing date")).toHaveValue("2026-01-02");
    },
  );
});
