import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: { prefetch: boolean | null } & Record<string, unknown>) => (
    <a {...props} data-prefetch={String(prefetch)} />
  ),
}));

import { IntentLink } from "./intent-link";

describe("IntentLink", () => {
  it("does not prefetch just for being on screen", () => {
    render(<IntentLink href="/routines/1">Row</IntentLink>);
    expect(screen.getByRole("link", { name: "Row" })).toHaveAttribute("data-prefetch", "false");
  });

  it.each([
    ["hover", fireEvent.mouseEnter],
    ["focus", fireEvent.focus],
    ["touch", fireEvent.touchStart],
  ] as const)("prefetches as usual once the user shows intent (%s)", (_name, intend) => {
    render(<IntentLink href="/routines/1">Row</IntentLink>);
    const link = screen.getByRole("link", { name: "Row" });
    intend(link);
    expect(link).toHaveAttribute("data-prefetch", "null");
  });

  it("prefetches on sight when eager (a list's first row)", () => {
    render(
      <IntentLink href="/routines/1" eager>
        Row
      </IntentLink>,
    );
    expect(screen.getByRole("link", { name: "Row" })).toHaveAttribute("data-prefetch", "null");
  });

  it("still calls the caller's handlers", () => {
    const onFocus = vi.fn();
    render(
      <IntentLink href="/routines/1" onFocus={onFocus}>
        Row
      </IntentLink>,
    );
    fireEvent.focus(screen.getByRole("link", { name: "Row" }));
    expect(onFocus).toHaveBeenCalledOnce();
  });
});
