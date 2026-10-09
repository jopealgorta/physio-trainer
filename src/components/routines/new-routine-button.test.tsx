import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { NewRoutineButton } from "./new-routine-button";

const { createRoutineAction } = vi.hoisted(() => ({ createRoutineAction: vi.fn() }));
vi.mock("@/server/routines/actions", () => ({ createRoutineAction }));

function setup(locale: "en" | "es" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      <NewRoutineButton customerId="cust-1" />
    </NextIntlClientProvider>,
  );
}

const submitted = () => (createRoutineAction.mock.calls[0] as unknown as [unknown, FormData])[1];

beforeEach(() => {
  createRoutineAction.mockReset();
  createRoutineAction.mockResolvedValue({ status: "idle" });
});

describe("NewRoutineButton", () => {
  it("creates the routine at once with a default name and no case", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "New routine" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(createRoutineAction).toHaveBeenCalledTimes(1));
    const data = submitted();
    expect(data.get("customerId")).toBe("cust-1");
    expect(data.get("name")).toBe("New routine");
    expect(data.get("caseId")).toBeNull();
  });

  it("names it in the physio's language", async () => {
    const user = userEvent.setup();
    setup("es");
    await user.click(screen.getByRole("button", { name: "Nueva rutina" }));
    await waitFor(() => expect(createRoutineAction).toHaveBeenCalled());
    expect(submitted().get("name")).toBe("Nueva rutina");
  });

  it("is disabled while creating, so a double click makes one routine", async () => {
    const user = userEvent.setup();
    // Resolved before the test ends: React holds later actions until a pending one settles.
    let finish!: (state: unknown) => void;
    createRoutineAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    setup();
    await user.click(screen.getByRole("button", { name: "New routine" }));
    expect(await screen.findByRole("button", { name: "Creating…" })).toBeDisabled();
    await act(async () => finish({ status: "idle" }));
  });

  it("says why it could not create the routine", async () => {
    const user = userEvent.setup();
    createRoutineAction.mockResolvedValue({
      status: "error",
      fieldErrors: {},
      formError: "customerNotFound",
    });
    setup();
    await user.click(screen.getByRole("button", { name: "New routine" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This customer no longer exists.");
  });
});
