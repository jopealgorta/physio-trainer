import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { ROUTINE_STATUSES } from "@/lib/routines";

import messages from "../../../messages/en.json";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it.each(ROUTINE_STATUSES)("renders the %s label", (status) => {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <StatusBadge status={status} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(messages.Routines.status[status])).toBeInTheDocument();
  });
});
