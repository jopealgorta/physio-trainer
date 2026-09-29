import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CustomerAvatar } from "./customer-avatar";

describe("CustomerAvatar", () => {
  it("renders the initials, hidden from assistive tech", () => {
    const { container } = render(<CustomerAvatar firstName="ana" lastName="perez" />);
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar).toHaveTextContent("AP");
    expect(avatar).toHaveAttribute("aria-hidden", "true");
  });

  it("uses only the first initial when there is no last name", () => {
    const { container } = render(<CustomerAvatar firstName="Ana" lastName={null} />);
    expect(container.firstElementChild).toHaveTextContent(/^A$/);
  });

  it('falls back to "?" when there are no letters', () => {
    const { container } = render(<CustomerAvatar firstName="  " lastName={null} />);
    expect(container.firstElementChild).toHaveTextContent("?");
  });

  it("uses design tokens for colours", () => {
    const { container } = render(<CustomerAvatar firstName="Ana" lastName="Perez" />);
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar).toHaveClass("bg-muted", "text-muted-foreground", "rounded-full");
  });

  it("renders different classes per size, defaulting to md", () => {
    const classFor = (size?: "sm" | "md" | "lg") => {
      const { container, unmount } = render(
        <CustomerAvatar firstName="Ana" lastName="Perez" size={size} />,
      );
      const value = (container.firstElementChild as HTMLElement).className;
      unmount();
      return value;
    };
    const [sm, md, lg, fallback] = [classFor("sm"), classFor("md"), classFor("lg"), classFor()];
    expect(new Set([sm, md, lg]).size).toBe(3);
    expect(fallback).toBe(md);
  });
});
