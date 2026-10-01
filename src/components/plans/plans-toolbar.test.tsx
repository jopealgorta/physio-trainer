import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PLAN_FILTERS, type PlanFilters } from "@/lib/plan-params";
import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { PlansToolbar } from "./plans-toolbar";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const customers = [{ id: "8a1f6c3e-0b1d-4a55-9d3a-2f0f6f1a7b11", name: "Ana Pérez" }];

function setup(filters: Partial<PlanFilters> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PlansToolbar filters={{ ...DEFAULT_PLAN_FILTERS, ...filters }} customers={customers} />
    </NextIntlClientProvider>,
  );
}
const fakeTimerUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  replace.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("PlansToolbar", () => {
  it("offers every status and the customer filter on the customers tab", async () => {
    setup();
    expect(screen.getByRole("combobox", { name: "Customer" })).toBeInTheDocument();
    await fakeTimerUser().click(screen.getByRole("combobox", { name: "Status" }));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["All statuses", "Draft", "Active", "Archived"]);
  });

  it("has no customer filter and no draft status on the templates tab", async () => {
    setup({ tab: "templates" });
    expect(screen.queryByRole("combobox", { name: "Customer" })).not.toBeInTheDocument();
    await fakeTimerUser().click(screen.getByRole("combobox", { name: "Status" }));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["All statuses", "Active", "Archived"]);
  });

  it("keeps the templates tab when searching and filtering", async () => {
    setup({ tab: "templates" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search plans" }), {
      target: { value: "back" },
    });
    act(() => void vi.advanceTimersByTime(300));
    expect(replace).toHaveBeenCalledWith("/plans?tab=templates&q=back", { scroll: false });
    await chooseOption(fakeTimerUser(), screen.getByRole("combobox", { name: "Status" }), "Active");
    expect(replace).toHaveBeenLastCalledWith("/plans?tab=templates&status=active", {
      scroll: false,
    });
  });
});
