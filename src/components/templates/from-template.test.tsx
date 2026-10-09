import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import { FromTemplate } from "./from-template";
import { TemplateBadge } from "./template-badge";

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
