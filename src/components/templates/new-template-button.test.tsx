import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { NewTemplateButton } from "./new-template-button";

const { createTemplateAction } = vi.hoisted(() => ({ createTemplateAction: vi.fn() }));
vi.mock("@/server/templates/actions", () => ({ createTemplateAction }));

function setup(kind: "routine" | "plan", locale: "en" | "es" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      <NewTemplateButton kind={kind} />
    </NextIntlClientProvider>,
  );
}

const submitted = () => (createTemplateAction.mock.calls[0] as unknown as [unknown, FormData])[1];

beforeEach(() => {
  createTemplateAction.mockReset();
  createTemplateAction.mockResolvedValue({ status: "idle" });
});

describe("NewTemplateButton", () => {
  it.each([
    ["routine", "New routine template"],
    ["plan", "New plan template"],
  ] as const)("creates a %s template at once with a default name", async (kind, label) => {
    const user = userEvent.setup();
    setup(kind);
    await user.click(screen.getByRole("button", { name: label }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(createTemplateAction).toHaveBeenCalledTimes(1));
    expect(submitted().get("kind")).toBe(kind);
    expect(submitted().get("name")).toBe(label);
  });

  it("names it in the physio's language", async () => {
    const user = userEvent.setup();
    setup("plan", "es");
    await user.click(screen.getByRole("button", { name: "Nueva plantilla de plan" }));
    await waitFor(() => expect(createTemplateAction).toHaveBeenCalled());
    expect(submitted().get("name")).toBe("Nueva plantilla de plan");
  });

  it("is disabled while creating", async () => {
    const user = userEvent.setup();
    // Resolved before the test ends: React holds later actions until a pending one settles.
    let finish!: (state: unknown) => void;
    createTemplateAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    setup("routine");
    await user.click(screen.getByRole("button", { name: "New routine template" }));
    expect(await screen.findByRole("button", { name: "Creating…" })).toBeDisabled();
    await act(async () => finish({ status: "idle" }));
  });

  it("says why it could not create the template", async () => {
    const user = userEvent.setup();
    createTemplateAction.mockResolvedValue({
      status: "error",
      fieldErrors: {},
      formError: "invalid",
    });
    setup("routine");
    await user.click(screen.getByRole("button", { name: "New routine template" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the form and try again.");
  });
});
