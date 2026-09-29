import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import { TabEmpty } from "./tab-empty";

describe("TabEmpty", () => {
  it.each(["routines", "plans", "activity", "notes"] as const)(
    "explains what will appear in the %s tab",
    (tab) => {
      render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <TabEmpty tab={tab} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText(messages.Customers.tabEmpty[tab])).toBeInTheDocument();
    },
  );
});
