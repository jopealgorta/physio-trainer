import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { CaseFormState } from "@/server/customers/schemas";

import messages from "../../../messages/en.json";

import { CaseForm, type CaseFormValues } from "./case-form";

const defaults: CaseFormValues = {
  title: "",
  diagnosis: null,
  bodyArea: null,
  side: null,
  injuryOn: null,
  surgeryOn: null,
  precautions: null,
  goals: null,
  initialPain: null,
  notes: null,
  openedOn: null,
};

type Action = (state: CaseFormState, formData: FormData) => Promise<CaseFormState>;

function setup(
  action: Action,
  props: {
    values?: Partial<CaseFormValues>;
    customerId?: string;
    onSaved?: () => void;
    onCancel?: () => void;
  } = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CaseForm
        action={action}
        customerId={props.customerId ?? "cust-1"}
        defaults={{ ...defaults, ...props.values }}
        onSaved={props.onSaved}
        onCancel={props.onCancel ?? (() => {})}
      />
    </NextIntlClientProvider>,
  );
}

const idleAction = () => vi.fn(async (): Promise<CaseFormState> => ({ status: "idle" }));
const errorAction = (fieldErrors: Record<string, string>, formError?: string) =>
  vi.fn(
    async (): Promise<CaseFormState> =>
      ({ status: "error", fieldErrors, formError }) as CaseFormState,
  );
const submittedData = (action: ReturnType<typeof idleAction>) =>
  (action.mock.calls[0] as unknown as [unknown, FormData])[1];

describe("CaseForm", () => {
  it("renders labelled fields with a required title", () => {
    setup(idleAction());
    expect(screen.getByLabelText("Title")).toBeRequired();
    expect(screen.getByLabelText("Diagnosis")).toBeInTheDocument();
    expect(screen.getByLabelText("Injury date")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Surgery date")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Goals")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.getByLabelText("Initial pain (0–10)")).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByLabelText("Initial pain (0–10)")).toHaveAccessibleDescription(
      "Whole number from 0 (no pain) to 10 (worst).",
    );
    expect(screen.getByLabelText("Precautions")).toHaveAccessibleDescription(
      "Shown prominently on the customer's page so you never miss them.",
    );
    expect(screen.getByRole("button", { name: "Create case" })).toBeInTheDocument();
  });

  it("uses a single-select body area picker without full body", async () => {
    const user = userEvent.setup();
    setup(idleAction());
    await user.click(screen.getByRole("button", { name: "Body area Choose a body area" }));
    const picker = screen.getByRole("dialog", { name: "Body area" });
    expect(within(picker).getByRole("radio", { name: "Knee" })).toBeInTheDocument();
    expect(within(picker).queryByRole("radio", { name: "Full body" })).not.toBeInTheDocument();
  });

  it("creates with a hidden customerId, an empty opened-on field and its hint", () => {
    setup(idleAction());
    expect(document.querySelector('input[name="customerId"]')).toHaveValue("cust-1");
    expect(document.querySelector('input[name="id"]')).toBeNull();
    expect(screen.getByLabelText("Opened on")).toHaveValue("");
    expect(screen.getByLabelText("Opened on")).toHaveAccessibleDescription(
      "Leave empty to use today.",
    );
  });

  it("edits with a hidden id, prefilled values and Save case", () => {
    setup(idleAction(), {
      values: {
        id: "case-9",
        title: "ACL rehab",
        diagnosis: "Tear",
        bodyArea: "knee",
        side: "left",
        injuryOn: "2026-01-02",
        surgeryOn: "2026-02-03",
        precautions: "No running",
        goals: "Run 5k",
        initialPain: 0,
        notes: "Slow",
        openedOn: "2026-03-01",
      },
    });
    expect(document.querySelector('input[name="id"]')).toHaveValue("case-9");
    expect(document.querySelector('input[name="customerId"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Save case" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("ACL rehab");
    expect(screen.getByLabelText("Diagnosis")).toHaveValue("Tear");
    expect(screen.getByLabelText("Injury date")).toHaveValue("2026-01-02");
    expect(screen.getByLabelText("Surgery date")).toHaveValue("2026-02-03");
    expect(screen.getByLabelText("Precautions")).toHaveValue("No running");
    expect(screen.getByLabelText("Goals")).toHaveValue("Run 5k");
    expect(screen.getByLabelText("Initial pain (0–10)")).toHaveValue("0");
    expect(screen.getByLabelText("Notes")).toHaveValue("Slow");
    expect(screen.getByLabelText("Opened on")).toHaveValue("2026-03-01");
    expect(screen.getByRole("button", { name: "Body area Knee · Left" })).toBeInTheDocument();
    expect(screen.queryByText("Leave empty to use today.")).not.toBeInTheDocument();
  });

  it("submits the typed values together with the picker's area and side", async () => {
    const user = userEvent.setup();
    const action = idleAction();
    setup(action);
    await user.type(screen.getByLabelText("Title"), "Shoulder");
    await user.type(screen.getByLabelText("Initial pain (0–10)"), "4");
    await user.click(screen.getByRole("button", { name: "Body area Choose a body area" }));
    await user.click(screen.getByRole("radio", { name: "Knee" }));
    await user.click(screen.getByRole("radio", { name: "Right" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Create case" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = submittedData(action);
    expect(data.get("customerId")).toBe("cust-1");
    expect(data.get("title")).toBe("Shoulder");
    expect(data.get("initialPain")).toBe("4");
    expect(data.get("bodyArea")).toBe("knee");
    expect(data.get("side")).toBe("right");
  });

  it("shows the title-required error with aria-invalid and keeps typed values", async () => {
    const user = userEvent.setup();
    setup(errorAction({ title: "nameRequired" }));
    await user.type(screen.getByLabelText("Diagnosis"), "Sprain");
    await user.click(screen.getByRole("button", { name: "Create case" }));
    expect(await screen.findByText("Enter a title.")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Title")).toHaveAccessibleDescription("Enter a title.");
    expect(screen.getByLabelText("Diagnosis")).toHaveValue("Sprain");
  });

  it("shows pain-out-of-range, side-needs-area and date errors", async () => {
    const user = userEvent.setup();
    setup(
      errorAction({
        initialPain: "painOutOfRange",
        side: "sideNeedsArea",
        openedOn: "openedAfterClosed",
        injuryOn: "dateInvalid",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Create case" }));
    expect(await screen.findByText("Enter a whole number from 0 to 10.")).toBeInTheDocument();
    expect(screen.getByText("Choose a body area to set a side.")).toBeInTheDocument();
    const area = screen.getByRole("button", { name: /^Body area/ });
    expect(area).toHaveAttribute("aria-invalid", "true");
    expect(area).toHaveAccessibleDescription("Choose a body area to set a side.");
    expect(
      screen.getByText("The opening date can't be after the closing date."),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter a valid date.")).toBeInTheDocument();
    expect(screen.getByLabelText("Initial pain (0–10)")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Initial pain (0–10)")).toHaveAccessibleDescription(
      "Whole number from 0 (no pain) to 10 (worst). Enter a whole number from 0 to 10.",
    );
  });

  it("interpolates the maximum length in length errors", async () => {
    const user = userEvent.setup();
    setup(errorAction({ title: "nameTooLong", precautions: "tooLong" }));
    await user.click(screen.getByRole("button", { name: "Create case" }));
    expect(await screen.findByText("Use at most 120 characters.")).toBeInTheDocument();
    expect(screen.getByText("Use at most 2,000 characters.")).toBeInTheDocument();
  });

  it("falls back to a generic message for unknown error codes", async () => {
    const user = userEvent.setup();
    setup(errorAction({ goals: "weird" }));
    await user.click(screen.getByRole("button", { name: "Create case" }));
    expect(await screen.findByText("Check this field.")).toBeInTheDocument();
  });

  it("shows form-level errors in an alert", async () => {
    const user = userEvent.setup();
    setup(errorAction({}, "customerNotFound"));
    await user.click(screen.getByRole("button", { name: "Create case" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This customer no longer exists.");
  });

  it("calls onSaved once after a save", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const action = vi.fn(async (): Promise<CaseFormState> => ({ status: "saved" }));
    setup(action, { values: { id: "case-9", title: "ACL" }, onSaved });
    await user.click(screen.getByRole("button", { name: "Save case" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Title")).toHaveValue("ACL");
  });

  it("cancels without saving", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const action = idleAction();
    setup(action, { onCancel });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();
  });
});
