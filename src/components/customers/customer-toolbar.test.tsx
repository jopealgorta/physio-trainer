import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CUSTOMER_FILTERS, type CustomerFilters } from "@/lib/customer-params";

import messages from "../../../messages/en.json";
import { CustomerToolbar } from "./customer-toolbar";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

function ui(filters: Partial<CustomerFilters> = {}) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CustomerToolbar filters={{ ...DEFAULT_CUSTOMER_FILTERS, ...filters }} />
    </NextIntlClientProvider>
  );
}
const setup = (filters: Partial<CustomerFilters> = {}) => render(ui(filters));
const searchbox = () => screen.getByRole("searchbox", { name: "Search customers" });

beforeEach(() => {
  vi.useFakeTimers();
  replace.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("CustomerToolbar", () => {
  it("debounces the search and keeps the other filters", () => {
    setup({ archived: true });
    fireEvent.change(searchbox(), { target: { value: "ana" } });
    expect(replace).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(300));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/customers?q=ana&archived=1", { scroll: false });
  });

  it("navigates immediately on Enter", () => {
    setup();
    fireEvent.change(searchbox(), { target: { value: "bo" } });
    fireEvent.keyDown(searchbox(), { key: "Enter" });
    expect(replace).toHaveBeenCalledWith("/customers?q=bo", { scroll: false });
    act(() => void vi.advanceTimersByTime(500));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("does not navigate after unmounting", () => {
    const { unmount } = setup();
    fireEvent.change(searchbox(), { target: { value: "x" } });
    unmount();
    act(() => void vi.advanceTimersByTime(500));
    expect(replace).not.toHaveBeenCalled();
  });

  it("toggles archived", () => {
    setup({ q: "ana" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Show archived" }));
    expect(replace).toHaveBeenCalledWith("/customers?q=ana&archived=1", { scroll: false });
  });

  it("un-toggles archived", () => {
    setup({ archived: true });
    expect(screen.getByRole("checkbox", { name: "Show archived" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show archived" }));
    expect(replace).toHaveBeenCalledWith("/customers", { scroll: false });
  });

  it("changes the sort", () => {
    setup();
    const select = screen.getByRole("combobox", { name: "Sort by" });
    expect(select).toHaveValue("name");
    fireEvent.change(select, { target: { value: "recent" } });
    expect(replace).toHaveBeenCalledWith("/customers?sort=recent", { scroll: false });
  });

  it("keeps a pending search when another filter changes", () => {
    setup();
    fireEvent.change(searchbox(), { target: { value: "hip" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), {
      target: { value: "recent" },
    });
    expect(replace).toHaveBeenCalledWith("/customers?q=hip&sort=recent", { scroll: false });
    act(() => void vi.advanceTimersByTime(500));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("re-syncs the input when filters.q changes", () => {
    const { rerender } = setup({ q: "ana" });
    expect((searchbox() as HTMLInputElement).value).toBe("ana");
    rerender(ui({ q: "" }));
    expect((searchbox() as HTMLInputElement).value).toBe("");
  });

  it("keeps newer keystrokes when an older URL arrives while typing", () => {
    const { rerender } = setup();
    const input = searchbox() as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "an" } });
    act(() => void vi.advanceTimersByTime(300));
    fireEvent.change(input, { target: { value: "ana" } });
    rerender(ui({ q: "an" }));
    expect(input.value).toBe("ana");
  });
});
