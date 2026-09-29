import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LIBRARY_FILTERS, type LibraryFilters } from "@/lib/library-params";
import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { LibraryToolbar } from "./library-toolbar";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

function ui(filters: Partial<LibraryFilters> = {}) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <LibraryToolbar filters={{ ...DEFAULT_LIBRARY_FILTERS, ...filters }} tags={["band", "core"]}>
        <div>tree</div>
      </LibraryToolbar>
    </NextIntlClientProvider>
  );
}
const fakeTimerUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
function setup(filters: Partial<LibraryFilters> = {}) {
  return render(ui(filters));
}

beforeEach(() => {
  // shouldAdvanceTime lets waitFor poll while the Select popover opens.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  replace.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("LibraryToolbar", () => {
  it("debounces the search and keeps the category", () => {
    setup({ category: { kind: "none" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search exercises" }), {
      target: { value: "bridge" },
    });
    expect(replace).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(300));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/library?q=bridge&category=none", { scroll: false });
  });

  it("navigates immediately on Enter", () => {
    setup();
    const input = screen.getByRole("searchbox", { name: "Search exercises" });
    fireEvent.change(input, { target: { value: "hip" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(replace).toHaveBeenCalledWith("/library?q=hip", { scroll: false });
    act(() => void vi.advanceTimersByTime(500));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("does not navigate after unmounting", () => {
    const { unmount } = setup();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search exercises" }), {
      target: { value: "x" },
    });
    unmount();
    act(() => void vi.advanceTimersByTime(500));
    expect(replace).not.toHaveBeenCalled();
  });

  it("filters by body area immediately", async () => {
    const user = fakeTimerUser();
    setup();
    await chooseOption(user, screen.getByRole("combobox", { name: "Body area" }), "Knee");
    expect(replace).toHaveBeenCalledWith("/library?area=knee", { scroll: false });
  });

  it("clears the tag with All tags", async () => {
    const user = fakeTimerUser();
    setup({ tag: "band" });
    await chooseOption(user, screen.getByRole("combobox", { name: "Tag" }), "All tags");
    expect(replace).toHaveBeenCalledWith("/library", { scroll: false });
  });

  // Radix's internal <select> reports "" when the value changes in the same commit as its option
  // is added (a tag from the URL that no exercise has). That must not clear the filter.
  it("keeps a tag from the URL that is not in the list when navigating back to it", () => {
    const { rerender } = setup();
    rerender(ui({ tag: "not-in-list" }));
    expect(screen.getByRole("combobox", { name: "Tag" })).toHaveTextContent("not-in-list");
    expect(replace).not.toHaveBeenCalled();
  });

  it("links the views and marks the active one", () => {
    setup({ view: "list", tag: "band" });
    const grid = screen.getByRole("link", { name: "Grid view" });
    const list = screen.getByRole("link", { name: "List view" });
    expect(grid).toHaveAttribute("href", "/library?tag=band");
    expect(list).toHaveAttribute("href", "/library?tag=band&view=list");
    expect(list).toHaveAttribute("aria-current", "page");
    expect(grid).not.toHaveAttribute("aria-current");
  });

  it("keeps the mobile filters (and tree) out of the page until the sheet opens", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    setup();
    expect(screen.getAllByRole("combobox", { name: "Body area" })).toHaveLength(1);
    expect(screen.queryByText("tree")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByText("tree")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox", { name: "Body area", hidden: true })).toHaveLength(2);
  });

  it("keeps newer keystrokes when an older search URL arrives while typing", () => {
    const { rerender } = setup();
    const input = screen.getByRole("searchbox", { name: "Search exercises" }) as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "bridg" } });
    act(() => void vi.advanceTimersByTime(300));
    fireEvent.change(input, { target: { value: "bridge" } });
    rerender(ui({ q: "bridg" }));
    expect(input.value).toBe("bridge");
  });

  it("resets the box when the search is cleared elsewhere", () => {
    const { rerender } = setup({ q: "bridge" });
    const input = screen.getByRole("searchbox", { name: "Search exercises" }) as HTMLInputElement;
    expect(input.value).toBe("bridge");
    rerender(ui({ q: "" }));
    expect(input.value).toBe("");
  });

  it("a pending search does not revert a filter changed meanwhile", () => {
    const { rerender } = setup();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search exercises" }), {
      target: { value: "hip" },
    });
    rerender(ui({ category: { kind: "none" } }));
    act(() => void vi.advanceTimersByTime(300));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/library?q=hip&category=none", { scroll: false });
  });

  it("a filter change during a pending search keeps the typed text", async () => {
    const user = fakeTimerUser();
    setup();
    // Open the popover first so only a click sits inside the 300ms debounce window.
    await user.click(screen.getByRole("combobox", { name: "Body area" }));
    const knee = await screen.findByRole("option", { name: "Knee" });
    // The open popover marks the rest of the page aria-hidden.
    fireEvent.change(screen.getByRole("searchbox", { name: "Search exercises", hidden: true }), {
      target: { value: "hip" },
    });
    await user.click(knee);
    expect(replace).toHaveBeenCalledWith("/library?q=hip&area=knee", { scroll: false });
    act(() => void vi.advanceTimersByTime(500));
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
