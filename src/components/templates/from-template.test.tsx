import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import { FromTemplate } from "./from-template";
import { TemplateBadge } from "./template-badge";
import userEvent from "@testing-library/user-event";
import { InPageActions } from "@/test/page-actions";

const wrap = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );

describe("FromTemplate", () => {
  it.each([
    ["routine", "/routines/t1"],
    ["plan", "/plans/t1"],
  ] as const)("links a %s copy to its template", (kind, href) => {
    wrap(<FromTemplate kind={kind} template={{ id: "t1", name: "ACL phase 1" }} />);
    expect(screen.getByRole("link", { name: "ACL phase 1" })).toHaveAttribute("href", href);
    expect(screen.getByText(/From template:/)).toBeInTheDocument();
  });
});

describe("TemplateBadge", () => {
  it("says Template", () => {
    wrap(<TemplateBadge />);
    expect(screen.getByText("Template")).toBeInTheDocument();
  });
});

describe("FromTemplate in a page's More actions menu", () => {
  it("links to the template from the menu", async () => {
    const user = userEvent.setup();
    wrap(
      <InPageActions>
        <FromTemplate kind="routine" template={{ id: "t1", name: "ACL phase 1" }} />
      </InPageActions>,
    );
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "From template: ACL phase 1" }),
    ).toHaveAttribute("href", "/routines/t1");
  });
});
