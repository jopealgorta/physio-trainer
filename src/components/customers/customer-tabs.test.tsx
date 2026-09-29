import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { CUSTOMER_TABS, type CustomerTab } from "@/lib/customers";

import messages from "../../../messages/en.json";
import { CustomerTabs } from "./customer-tabs";

function setup(active: CustomerTab) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CustomerTabs customerId="c1" active={active} />
    </NextIntlClientProvider>,
  );
}

describe("CustomerTabs", () => {
  it("is a labelled navigation with one link per tab", () => {
    setup("overview");
    const nav = screen.getByRole("navigation", { name: "Customer sections" });
    expect(nav).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(CUSTOMER_TABS.length);
  });

  it("links overview without a param and the others with ?tab=", () => {
    setup("overview");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/customers/c1");
    for (const tab of CUSTOMER_TABS.filter((t) => t !== "overview")) {
      const label = messages.Customers.tabs[tab];
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        `/customers/c1?tab=${tab}`,
      );
    }
  });

  it("marks only the active tab as the current page", () => {
    setup("plans");
    expect(screen.getByRole("link", { name: "Plans" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(document.querySelectorAll("[aria-current]")).toHaveLength(1);
  });

  it("scrolls horizontally on small screens", () => {
    setup("overview");
    expect(screen.getByRole("navigation")).toHaveClass("overflow-x-auto");
  });
});
