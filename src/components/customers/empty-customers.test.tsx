import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import { NoCustomerResults } from "./empty-customers";

function renderResults(canClear: boolean) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <NoCustomerResults canClear={canClear} />
    </NextIntlClientProvider>,
  );
}

describe("NoCustomerResults", () => {
  it("offers to clear the filters when some are active", () => {
    renderResults(true);
    expect(screen.getByText(messages.Customers.noResults.body)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/customers",
    );
  });

  it("points at archived customers instead of a dead clear link when no filter is active", () => {
    renderResults(false);
    expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument();
    expect(screen.getByText(messages.Customers.noResults.allArchived)).toBeInTheDocument();
  });
});
