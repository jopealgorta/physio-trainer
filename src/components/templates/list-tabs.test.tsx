import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import { ListTabs } from "./list-tabs";

const setup = (props: React.ComponentProps<typeof ListTabs>) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ListTabs {...props} />
    </NextIntlClientProvider>,
  );

describe("ListTabs", () => {
  it("marks the customers tab current and links the templates tab", () => {
    setup({ kind: "routine", active: "customers" });
    expect(screen.getByRole("navigation", { name: "List type" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute("href", "/routines");
    const templates = screen.getByRole("link", { name: "Templates" });
    expect(templates).not.toHaveAttribute("aria-current");
    expect(templates).toHaveAttribute("href", "/routines?tab=templates");
  });

  it("marks the templates tab current, with plan paths", () => {
    setup({ kind: "plan", active: "templates" });
    expect(screen.getByRole("link", { name: "Templates" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Templates" })).toHaveAttribute(
      "href",
      "/plans?tab=templates",
    );
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute("href", "/plans");
  });
});
