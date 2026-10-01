import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { NotesCaseFilter } from "./notes-case-filter";

const cases = [
  { id: "case-1", title: "ACL rehab" },
  { id: "case-2", title: "Shoulder" },
];

function setup(caseId: string | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <NotesCaseFilter customerId="cust-1" cases={cases} caseId={caseId} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => replace.mockReset());

describe("NotesCaseFilter", () => {
  it("shows the current filter", () => {
    setup("case-2");
    expect(screen.getByRole("combobox", { name: "Filter by case" })).toHaveTextContent("Shoulder");
  });

  it("shows all cases when unfiltered", () => {
    setup(null);
    expect(screen.getByRole("combobox", { name: "Filter by case" })).toHaveTextContent("All cases");
  });

  it("navigates to the chosen case, back to the first page", async () => {
    const user = userEvent.setup();
    setup(null);
    await chooseOption(user, screen.getByRole("combobox", { name: "Filter by case" }), "ACL rehab");
    expect(replace).toHaveBeenCalledWith("/customers/cust-1?tab=notes&case=case-1", {
      scroll: false,
    });
  });

  it("clears the filter with 'All cases'", async () => {
    const user = userEvent.setup();
    setup("case-1");
    await chooseOption(user, screen.getByRole("combobox", { name: "Filter by case" }), "All cases");
    expect(replace).toHaveBeenCalledWith("/customers/cust-1?tab=notes", { scroll: false });
  });
});
