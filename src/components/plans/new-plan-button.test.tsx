import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { NewPlanButton } from "./new-plan-button";

const { createPlanAction } = vi.hoisted(() => ({ createPlanAction: vi.fn() }));
vi.mock("@/server/plans/actions", () => ({ createPlanAction }));

function setup(locale: "en" | "es" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      <NewPlanButton customerId="cust-1" />
    </NextIntlClientProvider>,
  );
}

const submitted = () => (createPlanAction.mock.calls[0] as unknown as [unknown, FormData])[1];

beforeEach(() => {
  createPlanAction.mockReset();
  createPlanAction.mockResolvedValue({ status: "idle" });
});

describe("NewPlanButton", () => {
  it("creates the plan at once with a default name and no case", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "New plan" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(createPlanAction).toHaveBeenCalledTimes(1));
    const data = submitted();
    expect(data.get("customerId")).toBe("cust-1");
    expect(data.get("name")).toBe("New plan");
    expect(data.get("caseId")).toBeNull();
  });

  it("names it in the physio's language", async () => {
    const user = userEvent.setup();
    setup("es");
    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    await waitFor(() => expect(createPlanAction).toHaveBeenCalled());
    expect(submitted().get("name")).toBe("Nuevo plan");
  });

  it("is disabled while creating, so a double click makes one plan", async () => {
    const user = userEvent.setup();
    // Resolved before the test ends: React holds later actions until a pending one settles.
    let finish!: (state: unknown) => void;
    createPlanAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    setup();
    await user.click(screen.getByRole("button", { name: "New plan" }));
    expect(await screen.findByRole("button", { name: "Creating…" })).toBeDisabled();
    await act(async () => finish({ status: "idle" }));
  });

  it("says why it could not create the plan", async () => {
    const user = userEvent.setup();
    createPlanAction.mockResolvedValue({
      status: "error",
      fieldErrors: {},
      formError: "customerNotFound",
    });
    setup();
    await user.click(screen.getByRole("button", { name: "New plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This customer no longer exists.");
  });
});
