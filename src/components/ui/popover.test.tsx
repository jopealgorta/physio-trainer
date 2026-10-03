import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "./popover";

const realMatchMedia = window.matchMedia;

/** Pretends the screen is a phone (below `sm`) or not. */
function setPhone(phone: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: phone && query.includes("max-width"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

function setup(onOpenChange = vi.fn()) {
  render(
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent className="sm:w-96">
        <PopoverTitle>Details</PopoverTitle>
        <p>Body</p>
      </PopoverContent>
    </Popover>,
  );
  return onOpenChange;
}

describe("Popover", () => {
  it("floats next to its trigger on a wide screen", async () => {
    setPhone(false);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog", { name: "Details" });
    expect(dialog).toHaveAttribute("data-slot", "popover-content");
    expect(dialog).toHaveAttribute("data-presentation", "popover");
    expect(dialog.className).toContain("sm:w-96");
    expect(dialog).toHaveTextContent("Body");
  });

  it("opens as a bottom sheet on a phone, named by its title", async () => {
    setPhone(true);
    const onOpenChange = setup();
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog", { name: "Details" });
    expect(dialog).toHaveAttribute("data-slot", "popover-content");
    expect(dialog).toHaveAttribute("data-presentation", "sheet");
    // A drawer (vaul), so it can be swiped down to dismiss.
    expect(dialog).toHaveAttribute("data-vaul-drawer");
    expect(dialog).toHaveTextContent("Body");
    // Focus moves in (onto the sheet itself, so no field pops the keyboard).
    expect(dialog).toHaveFocus();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
