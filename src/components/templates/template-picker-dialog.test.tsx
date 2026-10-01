import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import { TemplatePickerDialog } from "./template-picker-dialog";

const { searchTemplatesAction } = vi.hoisted(() => ({ searchTemplatesAction: vi.fn() }));
vi.mock("@/server/templates/actions", () => ({
  searchTemplatesAction,
  assignTemplateAction: vi.fn(),
  listCasesAction: vi.fn().mockResolvedValue([]),
}));

const ACL = { id: "t1", name: "ACL phase 1", detail: 4 };
const BACK = { id: "t2", name: "Low back", detail: 1 };

function setup(kind: "routine" | "plan" = "routine") {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <TemplatePickerDialog
        kind={kind}
        customer={{ id: "c1", name: "Ana Pérez" }}
        cases={[{ id: "case-1", title: "ACL rehab" }]}
      />
    </NextIntlClientProvider>,
  );
}
const fakeTimerUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "From template…" }));
  return screen.findByRole("dialog");
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  searchTemplatesAction.mockReset();
  searchTemplatesAction.mockResolvedValue([ACL, BACK]);
});
afterEach(() => vi.useRealTimers());

describe("TemplatePickerDialog", () => {
  it("lists the templates when it opens, with their exercise counts", async () => {
    const user = fakeTimerUser();
    setup();
    await open(user);
    expect(await screen.findByRole("button", { name: /ACL phase 1/ })).toHaveTextContent(
      "4 exercises",
    );
    expect(screen.getByRole("button", { name: /Low back/ })).toHaveTextContent("1 exercise");
    expect(searchTemplatesAction).toHaveBeenCalledWith({ kind: "routine", q: "" });
  });

  it("counts routines for plan templates", async () => {
    const user = fakeTimerUser();
    setup("plan");
    await open(user);
    expect(await screen.findByRole("button", { name: /ACL phase 1/ })).toHaveTextContent(
      "4 routines",
    );
    expect(searchTemplatesAction).toHaveBeenCalledWith({ kind: "plan", q: "" });
  });

  it("searches once after the debounce", async () => {
    const user = fakeTimerUser();
    setup();
    await open(user);
    await screen.findByRole("button", { name: /ACL phase 1/ });
    searchTemplatesAction.mockClear();
    searchTemplatesAction.mockResolvedValue([ACL]);
    await user.type(screen.getByRole("searchbox", { name: "Search templates" }), "acl");
    expect(searchTemplatesAction).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(250));
    expect(searchTemplatesAction).toHaveBeenCalledTimes(1);
    expect(searchTemplatesAction).toHaveBeenCalledWith({ kind: "routine", q: "acl" });
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: /Low back/ })).not.toBeInTheDocument(),
    );
  });

  it("ignores a slow older response once a newer search has been made", async () => {
    const user = fakeTimerUser();
    let resolveOld: (options: unknown[]) => void = () => {};
    searchTemplatesAction
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce([BACK]);
    setup();
    await open(user);
    await user.type(screen.getByRole("searchbox", { name: "Search templates" }), "back");
    await act(async () => void vi.advanceTimersByTime(250));
    expect(await screen.findByRole("button", { name: /Low back/ })).toBeInTheDocument();
    await act(async () => resolveOld([ACL]));
    expect(screen.queryByRole("button", { name: /ACL phase 1/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Low back/ })).toBeInTheDocument();
  });

  it("says when nothing matches, and when there are no templates at all", async () => {
    const user = fakeTimerUser();
    searchTemplatesAction.mockResolvedValue([]);
    setup();
    await open(user);
    expect(
      await screen.findByText(
        "You have no routine templates yet. Save a routine as a template first.",
      ),
    ).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search templates" }), "zzz");
    await act(async () => void vi.advanceTimersByTime(250));
    expect(await screen.findByText("No templates match your search.")).toBeInTheDocument();
  });

  it("reports a failed search", async () => {
    const user = fakeTimerUser();
    searchTemplatesAction.mockRejectedValue(new Error("boom"));
    setup();
    await open(user);
    expect(await screen.findByText("Couldn't load the templates. Try again.")).toBeInTheDocument();
  });

  it("opens the assign form for the chosen template with the customer fixed, and goes back", async () => {
    const user = fakeTimerUser();
    setup();
    await open(user);
    await user.click(await screen.findByRole("button", { name: /ACL phase 1/ }));
    expect(await screen.findByRole("dialog", { name: "Assign to a customer" })).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("ACL phase 1");
    expect(screen.queryByRole("combobox", { name: "Customer" })).not.toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Case" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to templates" }));
    expect(await screen.findByRole("button", { name: /Low back/ })).toBeInTheDocument();
  });
});
