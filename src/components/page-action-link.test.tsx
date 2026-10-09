import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PencilIcon } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { InPageActions } from "@/test/page-actions";

import messages from "../../messages/en.json";
import { PageActionLink } from "./page-action-link";

describe("PageActionLink", () => {
  it("is an outline link button, and the same link in the More actions menu", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <InPageActions>
          <PageActionLink
            id="edit"
            href="/customers/c1/edit"
            label="Edit"
            order={0}
            icon={<PencilIcon aria-hidden />}
          />
        </InPageActions>
      </NextIntlClientProvider>,
    );
    const link = screen.getByRole("link", { name: "Edit" });
    expect(link).toHaveAttribute("href", "/customers/c1/edit");
    expect(link).toHaveAttribute("data-variant", "outline");
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toHaveAttribute(
      "href",
      "/customers/c1/edit",
    );
  });
});
