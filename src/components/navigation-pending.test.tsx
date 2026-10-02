import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const linkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", () => ({ useLinkStatus: () => linkStatus }));

import {
  LinkPendingHint,
  PendingContent,
  PendingScope,
  usePendingNavigation,
} from "./navigation-pending";

let finish: () => void = () => {};

function Trigger() {
  const { navigate } = usePendingNavigation();
  return (
    <button
      type="button"
      onClick={() =>
        navigate(() => {
          // Stands in for router.replace: a navigation that settles later.
          void new Promise<void>(() => {});
        })
      }
    >
      go
    </button>
  );
}

/** A transition that stays pending until `finish()`, like a slow router navigation. */
function SlowTrigger() {
  const { navigate } = usePendingNavigation();
  return (
    <button
      type="button"
      onClick={() => navigate(() => new Promise<void>((resolve) => (finish = resolve)))}
    >
      slow
    </button>
  );
}

beforeEach(() => {
  linkStatus.pending = false;
});

describe("PendingContent", () => {
  it("is not busy at rest", () => {
    render(
      <PendingScope>
        <PendingContent>results</PendingContent>
      </PendingScope>,
    );
    expect(screen.getByText("results")).not.toHaveAttribute("aria-busy");
  });

  it("is busy while a navigation from its scope is pending, and settles after", async () => {
    render(
      <PendingScope>
        <SlowTrigger />
        <PendingContent>results</PendingContent>
      </PendingScope>,
    );
    act(() => screen.getByRole("button", { name: "slow" }).click());
    expect(screen.getByText("results")).toHaveAttribute("aria-busy", "true");
    await act(async () => finish());
    expect(screen.getByText("results")).not.toHaveAttribute("aria-busy");
  });

  it("is busy while a link in its scope is pending", () => {
    linkStatus.pending = true;
    render(
      <PendingScope>
        <span>
          tab <LinkPendingHint />
        </span>
        <PendingContent>results</PendingContent>
      </PendingScope>,
    );
    expect(screen.getByText("results")).toHaveAttribute("aria-busy", "true");
  });
});

describe("usePendingNavigation", () => {
  it("works without a scope (falls back to its own transition)", () => {
    render(<Trigger />);
    expect(() => act(() => screen.getByRole("button", { name: "go" }).click())).not.toThrow();
  });
});

describe("LinkPendingHint", () => {
  it("marks itself pending only while its link navigates", () => {
    const { container, rerender } = render(<LinkPendingHint />);
    const hint = container.firstElementChild!;
    expect(hint).toHaveAttribute("aria-hidden", "true");
    expect(hint).not.toHaveAttribute("data-pending");
    linkStatus.pending = true;
    rerender(<LinkPendingHint />);
    expect(container.firstElementChild).toHaveAttribute("data-pending", "true");
  });
});
