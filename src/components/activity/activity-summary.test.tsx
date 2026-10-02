import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import { ActivitySummary } from "./activity-summary";

const setup = (summary: Parameters<typeof ActivitySummary>[0]["summary"]) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ActivitySummary summary={summary} />
    </NextIntlClientProvider>,
  );

describe("ActivitySummary", () => {
  it("shows sessions, adherence and the last log", () => {
    setup({
      completed: 12,
      lastLoggedOn: "2026-10-07",
      adherence: { planned: 8, completed: 3, ratio: 0.375 },
    });
    expect(screen.getByText("Sessions logged").nextElementSibling).toHaveTextContent("12");
    expect(screen.getByText("Adherence").nextElementSibling).toHaveTextContent("38%");
    expect(screen.getByText("Last logged").nextElementSibling).toHaveTextContent("Oct 7, 2026");
  });

  it("says when nothing was planned or logged", () => {
    setup({
      completed: 0,
      lastLoggedOn: null,
      adherence: { planned: 0, completed: 0, ratio: null },
    });
    expect(screen.getByText("Nothing planned")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });
});
