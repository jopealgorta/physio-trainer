import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useUnsavedGuard } from "./use-unsaved-guard";

function Harness({
  dirty,
  href = "/customers",
  target,
}: {
  dirty: boolean;
  href?: string;
  target?: string;
}) {
  useUnsavedGuard(dirty, "Leave?");
  return (
    <a href={href} target={target} data-testid="link">
      go
    </a>
  );
}

function click(element: Element, init: MouseEventInit = {}) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  element.dispatchEvent(event);
  return event;
}

afterEach(() => vi.restoreAllMocks());

describe("useUnsavedGuard", () => {
  it("blocks unloading while dirty", () => {
    render(<Harness dirty />);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    // Browsers read either signal; jsdom's plain Event only reflects the first.
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not block unloading while clean", () => {
    render(<Harness dirty={false} />);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("stops in-app link clicks when the user refuses to leave", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { getByTestId } = render(<Harness dirty />);
    const event = click(getByTestId("link"));
    expect(confirm).toHaveBeenCalledWith("Leave?");
    expect(event.defaultPrevented).toBe(true);
  });

  it("lets the click through when the user agrees to leave", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { getByTestId } = render(<Harness dirty />);
    // jsdom does not implement navigation; cancel it ourselves after checking.
    const event = click(getByTestId("link"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not ask while clean", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { getByTestId } = render(<Harness dirty={false} />);
    click(getByTestId("link"));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("ignores new-tab links, modifier clicks, non-primary buttons and external links", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { getByTestId, rerender } = render(<Harness dirty target="_blank" />);
    expect(click(getByTestId("link")).defaultPrevented).toBe(false);

    rerender(<Harness dirty />);
    expect(click(getByTestId("link"), { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(click(getByTestId("link"), { metaKey: true }).defaultPrevented).toBe(false);
    expect(click(getByTestId("link"), { shiftKey: true }).defaultPrevented).toBe(false);
    expect(click(getByTestId("link"), { button: 1 }).defaultPrevented).toBe(false);

    rerender(<Harness dirty href="https://example.com/x" />);
    expect(click(getByTestId("link")).defaultPrevented).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("removes its listeners on unmount", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { unmount } = render(<Harness dirty />);
    unmount();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);

    const link = document.createElement("a");
    link.href = "/customers";
    document.body.append(link);
    expect(click(link).defaultPrevented).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    link.remove();
  });
});
