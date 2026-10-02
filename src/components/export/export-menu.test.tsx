import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";

import { ExportMenu } from "./export-menu";

describe("ExportMenu", () => {
  it("links to the exports and keeps the menu open while toggling tracking", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <ExportMenu target={{ kind: "routines", id: "r1" }} />
      </NextIntlClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("menuitem", { name: "Download PDF" })).toHaveAttribute(
      "href",
      "/api/export/routines/r1?format=pdf",
    );
    expect(screen.getByRole("menuitem", { name: "Download Excel" })).toHaveAttribute(
      "href",
      "/api/export/routines/r1?format=xlsx",
    );
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Include tracking boxes" }));
    expect(screen.getByRole("menuitem", { name: "Download PDF" })).toHaveAttribute(
      "href",
      "/api/export/routines/r1?format=pdf&tracking=0",
    );
    expect(screen.getByRole("menuitem", { name: "Download Excel" })).toHaveAttribute(
      "href",
      "/api/export/routines/r1?format=xlsx",
    );
  });
});
