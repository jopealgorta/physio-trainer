import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { draftKey } from "@/lib/visit-notes";
import type { VisitNoteFormState } from "@/server/visit-notes/schemas";
import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";

import { NoteEditor, type NoteFormValues } from "./note-editor";

const defaults: NoteFormValues = {
  visitedOn: "2026-10-01",
  caseId: "",
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
  pain: "",
};
const cases = [
  { id: "case-1", title: "ACL rehab" },
  { id: "case-2", title: "Shoulder" },
];

type Action = (state: VisitNoteFormState, formData: FormData) => Promise<VisitNoteFormState>;

function setup(
  action: Action,
  props: { values?: Partial<NoteFormValues>; onSaved?: () => void } = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <NoteEditor
        action={action}
        customerId="cust-1"
        cases={cases}
        defaults={{ ...defaults, ...props.values }}
        onSaved={props.onSaved}
      />
    </NextIntlClientProvider>,
  );
}

const idleAction = () => vi.fn(async (): Promise<VisitNoteFormState> => ({ status: "idle" }));
const errorAction = (fieldErrors: Record<string, string>, formError?: string) =>
  vi.fn(
    async (): Promise<VisitNoteFormState> =>
      ({ status: "error", fieldErrors, formError }) as VisitNoteFormState,
  );
const submittedData = (action: ReturnType<typeof idleAction>) =>
  (action.mock.calls[0] as unknown as [unknown, FormData])[1];

const NEW_KEY = draftKey("cust-1", null);

beforeEach(() => localStorage.clear());

describe("NoteEditor", () => {
  it("renders labelled S/O/A/P fields, the date prefilled and an optional case and pain", () => {
    setup(idleAction());
    expect(screen.getByLabelText("S · Subjective")).toBeInTheDocument();
    expect(screen.getByLabelText("O · Objective")).toBeInTheDocument();
    expect(screen.getByLabelText("A · Assessment")).toBeInTheDocument();
    expect(screen.getByLabelText("P · Plan")).toBeInTheDocument();
    expect(screen.getByLabelText("Visit date")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Visit date")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Pain (0–10)")).toHaveAccessibleDescription(
      "Whole number from 0 (no pain) to 10 (worst).",
    );
    expect(screen.getByRole("combobox", { name: "Case" })).toHaveTextContent("No case");
    expect(screen.getByRole("button", { name: "Save note" })).toBeInTheDocument();
    expect(screen.getByText("Press Ctrl or ⌘ + Enter to save.")).toBeInTheDocument();
  });

  it("creates with a hidden customerId and edits with a hidden id", () => {
    const { unmount } = setup(idleAction());
    expect(document.querySelector('input[name="customerId"]')).toHaveValue("cust-1");
    expect(document.querySelector('input[name="id"]')).toBeNull();
    unmount();

    setup(idleAction(), { values: { id: "note-9", subjective: "Knee pain", caseId: "case-2" } });
    expect(document.querySelector('input[name="id"]')).toHaveValue("note-9");
    expect(document.querySelector('input[name="customerId"]')).toBeNull();
    expect(screen.getByLabelText("S · Subjective")).toHaveValue("Knee pain");
    expect(screen.getByRole("combobox", { name: "Case" })).toHaveTextContent("Shoulder");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("submits typed values and the chosen case", async () => {
    const user = userEvent.setup();
    const action = idleAction();
    setup(action);
    await user.type(screen.getByLabelText("S · Subjective"), "Knee pain");
    await user.type(screen.getByLabelText("A · Assessment"), "Improving");
    await user.type(screen.getByLabelText("Pain (0–10)"), "4");
    await chooseOption(user, screen.getByRole("combobox", { name: "Case" }), "ACL rehab");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = submittedData(action);
    expect(data.get("customerId")).toBe("cust-1");
    expect(data.get("visitedOn")).toBe("2026-10-01");
    expect(data.get("subjective")).toBe("Knee pain");
    expect(data.get("assessment")).toBe("Improving");
    expect(data.get("objective")).toBe("");
    expect(data.get("pain")).toBe("4");
    expect(data.get("caseId")).toBe("case-1");
  });

  it("can clear the case again", async () => {
    const user = userEvent.setup();
    const action = idleAction();
    setup(action, { values: { subjective: "x", caseId: "case-1" } });
    await chooseOption(user, screen.getByRole("combobox", { name: "Case" }), "No case");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(submittedData(action).get("caseId")).toBe("");
  });

  it("saves with Ctrl+Enter and Cmd+Enter from a text area", async () => {
    const user = userEvent.setup();
    const action = idleAction();
    setup(action);
    await user.type(screen.getByLabelText("S · Subjective"), "Knee pain");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(submittedData(action).get("subjective")).toBe("Knee pain");

    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  });

  it("does not submit on a plain Enter inside a text area", async () => {
    const user = userEvent.setup();
    const action = idleAction();
    setup(action);
    await user.type(screen.getByLabelText("S · Subjective"), "line one{Enter}line two");
    expect(screen.getByLabelText("S · Subjective")).toHaveValue("line one\nline two");
    expect(action).not.toHaveBeenCalled();
  });

  describe("drafts", () => {
    it("autosaves changes to localStorage and keeps none while unchanged", async () => {
      const user = userEvent.setup();
      setup(idleAction());
      expect(localStorage.getItem(NEW_KEY)).toBeNull();
      await user.type(screen.getByLabelText("S · Subjective"), "Knee");
      expect(JSON.parse(localStorage.getItem(NEW_KEY)!)).toMatchObject({ subjective: "Knee" });
      await user.clear(screen.getByLabelText("S · Subjective"));
      expect(localStorage.getItem(NEW_KEY)).toBeNull();
    });

    it("restores a draft after an accidental close and says so", async () => {
      const user = userEvent.setup();
      const first = setup(idleAction());
      await user.type(screen.getByLabelText("S · Subjective"), "Unsaved thoughts");
      await user.type(screen.getByLabelText("Pain (0–10)"), "6");
      first.unmount();

      setup(idleAction());
      expect(screen.getByLabelText("S · Subjective")).toHaveValue("Unsaved thoughts");
      expect(screen.getByLabelText("Pain (0–10)")).toHaveValue("6");
      expect(screen.getByRole("status")).toHaveTextContent("We restored your unsaved draft.");
    });

    it("keeps separate drafts for a new note and for each edited note", async () => {
      const user = userEvent.setup();
      const first = setup(idleAction(), { values: { id: "note-1", subjective: "Saved" } });
      await user.type(screen.getByLabelText("S · Subjective"), " plus edit");
      first.unmount();

      setup(idleAction());
      expect(screen.getByLabelText("S · Subjective")).toHaveValue("");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("discards the draft and goes back to the saved values", async () => {
      const user = userEvent.setup();
      const first = setup(idleAction());
      await user.type(screen.getByLabelText("S · Subjective"), "Unsaved");
      first.unmount();

      setup(idleAction());
      await user.click(screen.getByRole("button", { name: "Discard draft" }));
      expect(screen.getByLabelText("S · Subjective")).toHaveValue("");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(localStorage.getItem(NEW_KEY)).toBeNull();
    });

    it("ignores a draft case that no longer exists", () => {
      localStorage.setItem(
        NEW_KEY,
        JSON.stringify({ ...defaults, subjective: "Draft", caseId: "gone" }),
      );
      setup(idleAction());
      expect(screen.getByLabelText("S · Subjective")).toHaveValue("Draft");
      expect(screen.getByRole("combobox", { name: "Case" })).toHaveTextContent("No case");
    });

    it("clears the draft and notifies once after a successful save", async () => {
      const user = userEvent.setup();
      const onSaved = vi.fn();
      const action = vi.fn(async (): Promise<VisitNoteFormState> => ({ status: "saved" }));
      setup(action, { onSaved });
      await user.type(screen.getByLabelText("S · Subjective"), "Knee pain");
      expect(localStorage.getItem(NEW_KEY)).not.toBeNull();
      await user.click(screen.getByRole("button", { name: "Save note" }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      expect(localStorage.getItem(NEW_KEY)).toBeNull();
    });

    it("keeps the draft when the save fails", async () => {
      const user = userEvent.setup();
      setup(errorAction({}, "unknown"));
      await user.type(screen.getByLabelText("S · Subjective"), "Knee pain");
      await user.click(screen.getByRole("button", { name: "Save note" }));
      await screen.findByRole("alert");
      expect(JSON.parse(localStorage.getItem(NEW_KEY)!)).toMatchObject({ subjective: "Knee pain" });
    });

    it("still works when storage is unavailable", async () => {
      const user = userEvent.setup();
      const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      setup(idleAction());
      await user.type(screen.getByLabelText("S · Subjective"), "Works");
      expect(screen.getByLabelText("S · Subjective")).toHaveValue("Works");
      get.mockRestore();
      set.mockRestore();
    });
  });

  it("never truncates a long paste: the server reports the limit instead", () => {
    setup(idleAction());
    const long = "a".repeat(10_001);
    fireEvent.change(screen.getByLabelText("O · Objective"), { target: { value: long } });
    expect(screen.getByLabelText("O · Objective")).toHaveValue(long);
  });

  it("keeps autosaving edits made after a save while the editor stays mounted", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<VisitNoteFormState> => ({ status: "saved" }));
    setup(action);
    await user.type(screen.getByLabelText("S · Subjective"), "First");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(localStorage.getItem(NEW_KEY)).toBeNull());
    await user.type(screen.getByLabelText("S · Subjective"), " and more");
    expect(JSON.parse(localStorage.getItem(NEW_KEY)!)).toMatchObject({
      subjective: "First and more",
    });
  });

  describe("errors", () => {
    it("shows the at-least-one-section error on every SOAP field", async () => {
      const user = userEvent.setup();
      setup(errorAction({ soap: "soapRequired" }));
      await user.click(screen.getByRole("button", { name: "Save note" }));
      const message = "Write something in at least one of S, O, A or P.";
      expect(await screen.findByText(message)).toBeInTheDocument();
      for (const label of ["S · Subjective", "O · Objective", "A · Assessment", "P · Plan"]) {
        expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByLabelText(label)).toHaveAccessibleDescription(message);
      }
    });

    it("shows field errors, interpolating the length limit, and keeps typed values", async () => {
      const user = userEvent.setup();
      setup(errorAction({ plan: "tooLong", pain: "painOutOfRange", visitedOn: "dateInvalid" }));
      await user.type(screen.getByLabelText("S · Subjective"), "Keep me");
      await user.click(screen.getByRole("button", { name: "Save note" }));
      expect(await screen.findByText("Use at most 10,000 characters.")).toBeInTheDocument();
      expect(screen.getByText("Enter a whole number from 0 to 10.")).toBeInTheDocument();
      expect(screen.getByText("Enter a valid date.")).toBeInTheDocument();
      expect(screen.getByLabelText("Pain (0–10)")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByLabelText("S · Subjective")).toHaveValue("Keep me");
    });

    it("falls back to a generic message for unknown codes", async () => {
      const user = userEvent.setup();
      setup(errorAction({ pain: "weird" }));
      await user.click(screen.getByRole("button", { name: "Save note" }));
      expect(await screen.findByText("Check this field.")).toBeInTheDocument();
    });

    it("shows form-level errors in an alert", async () => {
      const user = userEvent.setup();
      setup(errorAction({}, "caseNotFound"));
      await user.click(screen.getByRole("button", { name: "Save note" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That case no longer exists or belongs to another customer.",
      );
    });
  });
});
