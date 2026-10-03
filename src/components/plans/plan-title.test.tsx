import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import { PlanTitle } from "./plan-title";

const { renamePlanAction } = vi.hoisted(() => ({ renamePlanAction: vi.fn() }));
vi.mock("@/server/plans/actions", () => ({ renamePlanAction }));

const HINT = "Shown as the title in the link preview when you share it.";

function setup(props: Partial<React.ComponentProps<typeof PlanTitle>> = {}) {
  const view = (next: Partial<React.ComponentProps<typeof PlanTitle>>) => (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PlanTitle planId="p1" name="Week A" isTemplate={false} {...props} {...next} />
    </NextIntlClientProvider>
  );
  const utils = render(view({}));
  return {
    rerenderWith: (next: Partial<React.ComponentProps<typeof PlanTitle>>) =>
      utils.rerender(view(next)),
  };
}

async function rename(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: "Rename plan" }));
  const input = screen.getByRole("textbox", { name: "Plan name" });
  await user.clear(input);
  await user.type(input, `${name}{Enter}`);
}

beforeEach(() => {
  renamePlanAction.mockReset();
  renamePlanAction.mockResolvedValue({ ok: true, data: { version: 2 } });
});

describe("PlanTitle", () => {
  it("shows the name as the page heading, with the link-preview hint except on a template", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1, name: "Week A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename plan" })).toHaveAccessibleDescription(HINT);
  });

  it("has no hint on a template", () => {
    setup({ isTemplate: true });
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it("shows the hint only while renaming", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByText(HINT)).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Rename plan" }));
    expect(screen.getByText(HINT)).toBeVisible();
  });

  it("saves a new name straight away", async () => {
    const user = userEvent.setup();
    setup();
    await rename(user, "Week B");
    expect(renamePlanAction).toHaveBeenCalledWith({ id: "p1", name: "Week B" });
    expect(await screen.findByRole("heading", { name: "Week B" })).toBeInTheDocument();
  });

  it("refuses a blank or long name without saving", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Rename plan" }));
    await user.clear(screen.getByRole("textbox", { name: "Plan name" }));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a name.");
    await user.type(screen.getByRole("textbox", { name: "Plan name" }), "x".repeat(81));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Use at most 80 characters.");
    expect(renamePlanAction).not.toHaveBeenCalled();
  });

  it("keeps the input and says why when the save fails", async () => {
    renamePlanAction.mockResolvedValue({ ok: false, error: "notFound" });
    const user = userEvent.setup();
    setup();
    await rename(user, "Week B");
    expect(await screen.findByRole("alert")).toHaveTextContent("This plan no longer exists.");
    expect(screen.getByRole("textbox", { name: "Plan name" })).toHaveValue("Week B");
  });

  it("says so when the save throws", async () => {
    renamePlanAction.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    setup();
    await rename(user, "Week B");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
  });

  it("takes a name that changed on the server (a restored version)", async () => {
    const { rerenderWith } = setup();
    rerenderWith({ name: "Restored" });
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Restored"),
    );
  });
});
