import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ChangeSummary } from "@/lib/history/summary";

import messages from "../../../messages/en.json";
import { SummaryText } from "./summary-text";

const summary = (patch: Partial<ChangeSummary>): ChangeSummary => ({
  added: 0,
  removed: 0,
  moved: 0,
  changed: 0,
  fields: {},
  header: [],
  ...patch,
});

function setup(props: React.ComponentProps<typeof SummaryText>) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <p data-testid="summary">
        <SummaryText {...props} />
      </p>
    </NextIntlClientProvider>,
  );
  return screen.getByTestId("summary");
}

describe("SummaryText", () => {
  it("lists added exercises and changed fields of a routine", () => {
    const text = setup({
      target: "routine",
      kind: "edited",
      summary: summary({ added: 2, changed: 1, fields: { reps: 1 } }),
    });
    expect(text).toHaveTextContent("+2 exercises · Reps changed on 1");
  });

  it("counts routines on a plan", () => {
    const text = setup({ target: "plan", kind: "edited", summary: summary({ added: 1 }) });
    expect(text).toHaveTextContent("+1 routine");
  });

  it("puts header changes first and counts removed and moved rows", () => {
    const text = setup({
      target: "routine",
      kind: "edited",
      summary: summary({ removed: 1, moved: 2, header: ["name", "notes"] }),
    });
    expect(text).toHaveTextContent("Name and Notes changed · −1 exercise · 2 moved");
  });

  it("says a version without a summary was the first one recorded", () => {
    expect(setup({ target: "routine", kind: "edited", summary: null })).toHaveTextContent(
      "First recorded version",
    );
  });

  it("says created for the first version", () => {
    expect(setup({ target: "plan", kind: "created", summary: null })).toHaveTextContent("Created");
  });

  it("says no changes for an empty summary", () => {
    expect(setup({ target: "plan", kind: "edited", summary: summary({}) })).toHaveTextContent(
      "No changes",
    );
  });
});
