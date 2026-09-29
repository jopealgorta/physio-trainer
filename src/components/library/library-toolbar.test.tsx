import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LIBRARY_FILTERS, type LibraryFilters } from "@/lib/library-params";

import messages from "../../../messages/en.json";
import { LibraryToolbar } from "./library-toolbar";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

function setup(filters: Partial<LibraryFilters> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <LibraryToolbar filters={{ ...DEFAULT_LIBRARY_FILTERS, ...filters }} tags={["band", "core"]}>
        <div>tree</div>
      </LibraryToolbar>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
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

  it("filters by body area immediately", () => {
    setup();
    fireEvent.change(screen.getByRole("combobox", { name: "Body area" }), {
      target: { value: "knee" },
    });
    expect(replace).toHaveBeenCalledWith("/library?area=knee", { scroll: false });
  });

  it("clears the tag with All tags", () => {
    setup({ tag: "band" });
    fireEvent.change(screen.getByRole("combobox", { name: "Tag" }), { target: { value: "" } });
    expect(replace).toHaveBeenCalledWith("/library", { scroll: false });
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
});
