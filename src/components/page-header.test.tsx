import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

import messages from "../../messages/en.json";
import { PageActions, usePageAction } from "./page-actions";
import { PageHeader } from "./page-header";

function renderWith(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

function Share() {
  usePageAction("share", { label: "Share", order: 10 });
  return <Button variant="outline">Share</Button>;
}

describe("PageHeader", () => {
  it("shows the title as the page heading, with its description and way back", () => {
    renderWith(
      <PageHeader
        back={{ href: "/customers", label: "Customers" }}
        title="Ana Pérez"
        meta={<span>Age 34</span>}
        description="Everything about Ana."
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Ana Pérez" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute("href", "/customers");
    expect(screen.getByText("Age 34")).toBeInTheDocument();
    expect(screen.getByText("Everything about Ana.")).toBeInTheDocument();
  });

  it("takes a title element as it is (a title renamed in place)", () => {
    renderWith(<PageHeader title={<h1>Knee rehab</h1>} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("shows a list page's actions at every size, with no menu", () => {
    renderWith(
      <PageHeader
        title="Library"
        actions={<Button variant="outline">Manage categories</Button>}
        primary={<Button>New exercise</Button>}
      />,
    );
    const actions = screen.getByTestId("page-header-actions");
    expect(within(actions).getByRole("button", { name: "Manage categories" })).toBeVisible();
    expect(within(actions).getByRole("button", { name: "New exercise" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });

  it("on a detail page, puts the actions behind More actions on phones, keeping the primary", () => {
    renderWith(
      <PageActions>
        <PageHeader title="Knee rehab" actions={<Share />} primary={<Button>Save</Button>} />
      </PageActions>,
    );
    expect(screen.getByTestId("page-header-secondary")).toHaveClass("hidden", "sm:flex");
    expect(screen.getByRole("button", { name: "Save" }).closest(".hidden")).toBeNull();
    expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
    expect(screen.getByTestId("page-notices")).toBeInTheDocument();
  });
});
