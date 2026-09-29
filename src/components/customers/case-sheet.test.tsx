import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CaseFormState } from "@/server/customers/schemas";

import messages from "../../../messages/en.json";

const refresh = vi.fn();
const saveCase = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/customers/actions", () => ({
  saveCaseAction: (...args: unknown[]) => saveCase(...args),
}));

import { CaseSheet } from "./case-sheet";
import type { CaseFormValues } from "./case-form";

const existing: CaseFormValues = {
  id: "case-9",
  title: "ACL rehab",
  diagnosis: null,
  bodyArea: "knee",
  side: "left",
  injuryOn: null,
  surgeryOn: null,
  precautions: null,
  goals: null,
  initialPain: null,
  notes: null,
  openedOn: "2026-03-01",
};

function setup(props: { case?: CaseFormValues } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CaseSheet customerId="cust-1" customerName="Ana Pérez" {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  refresh.mockReset();
  saveCase.mockReset();
});

describe("CaseSheet", () => {
  it("is closed until the trigger is clicked", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New case" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("New case");
    expect(dialog).toHaveAccessibleDescription("Injury episode for Ana Pérez.");
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(document.querySelector('input[name="customerId"]')).toHaveValue("cust-1");
  });

  it("edits an existing case", async () => {
    const user = userEvent.setup();
    setup({ case: existing });
    await user.click(screen.getByRole("button", { name: "Edit case ACL rehab" }));
    expect(await screen.findByLabelText("Title")).toHaveValue("ACL rehab");
    expect(document.querySelector('input[name="id"]')).toHaveValue("case-9");
    expect(document.querySelector('input[name="customerId"]')).toBeNull();
  });

  it("closes itself and refreshes the page once saved", async () => {
    const user = userEvent.setup();
    saveCase.mockResolvedValue({ status: "saved" } satisfies CaseFormState);
    setup();
    await user.click(screen.getByRole("button", { name: "New case" }));
    await user.type(await screen.findByLabelText("Title"), "Shoulder");
    await user.click(screen.getByRole("button", { name: "Create case" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(saveCase).toHaveBeenCalledTimes(1);
  });

  it("stays open with the errors when saving fails", async () => {
    const user = userEvent.setup();
    saveCase.mockResolvedValue({
      status: "error",
      fieldErrors: { title: "nameRequired" },
    } satisfies CaseFormState);
    setup();
    await user.click(screen.getByRole("button", { name: "New case" }));
    await user.click(await screen.findByRole("button", { name: "Create case" }));
    expect(await screen.findByText("Enter a title.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
