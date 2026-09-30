import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_ROUTINE_FILTERS, type RoutineFilters } from "@/lib/routine-params";
import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { RoutinesToolbar } from "./routines-toolbar";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const CUSTOMER_ID = "8a1f6c3e-0b1d-4a55-9d3a-2f0f6f1a7b11";
const customers = [{ id: CUSTOMER_ID, name: "Ana Pérez" }];

function setup(filters: Partial<RoutineFilters> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <RoutinesToolbar filters={{ ...DEFAULT_ROUTINE_FILTERS, ...filters }} customers={customers} />
    </NextIntlClientProvider>,
  );
}
const fakeTimerUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  replace.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("RoutinesToolbar", () => {
  it("debounces the search and keeps the other filters", () => {
    setup({ status: "active" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search routines" }), {
      target: { value: "knee" },
    });
    expect(replace).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(300));
    expect(replace).toHaveBeenCalledWith("/routines?q=knee&status=active", { scroll: false });
  });

  it("filters by status", async () => {
    setup();
    await chooseOption(fakeTimerUser(), screen.getByRole("combobox", { name: "Status" }), "Draft");
    expect(replace).toHaveBeenCalledWith("/routines?status=draft", { scroll: false });
  });

  it("filters by customer and clears it again", async () => {
    const user = fakeTimerUser();
    const { unmount } = setup();
    await chooseOption(user, screen.getByRole("combobox", { name: "Customer" }), "Ana Pérez");
    expect(replace).toHaveBeenCalledWith(`/routines?customer=${CUSTOMER_ID}`, { scroll: false });
    unmount();

    replace.mockClear();
    setup({ customerId: CUSTOMER_ID });
    expect(screen.getByRole("combobox", { name: "Customer" })).toHaveTextContent("Ana Pérez");
    await chooseOption(user, screen.getByRole("combobox", { name: "Customer" }), "All customers");
    expect(replace).toHaveBeenCalledWith("/routines", { scroll: false });
  });
});
