import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorBlock } from "@/lib/routine-editor";
import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { RoutineEditor, type RoutineEditorProps } from "./routine-editor";

const { saveRoutineAction, refresh } = vi.hoisted(() => ({
  saveRoutineAction: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/server/routines/actions", () => ({ saveRoutineAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const BLOCKS: EditorBlock[] = [
  {
    kind: "single",
    key: "k1",
    item: {
      key: "k1",
      exerciseId: "00000000-0000-4000-8000-000000000001",
      exerciseName: "Squat",
      exerciseArchived: false,
      cover: null,
      holdSeconds: null,
      restSeconds: 30,
      side: null,
      notes: null,
      sets: [{ key: "s1", reps: 10, repsMax: null, durationSeconds: null, load: null }],
    },
  },
];

const PROPS: RoutineEditorProps = {
  routine: {
    id: "00000000-0000-4000-8000-0000000000aa",
    version: 3,
    customerId: "cust-1",
    customerName: "Ana Pérez",
    header: {
      name: "Knee rehab",
      notes: "",
      caseId: null,
      sessionsPerWeek: "3",
      sessionsPerDay: "",
      status: "draft",
    },
    cases: [{ id: "case-1", title: "ACL rehab" }],
  },
  initialBlocks: BLOCKS,
  categories: [],
  recent: [],
  exercises: [],
};

function setup(props: RoutineEditorProps = PROPS) {
  const utils = render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <RoutineEditor {...props} />
    </NextIntlClientProvider>,
  );
  return {
    ...utils,
    rerenderWith: (next: RoutineEditorProps) =>
      utils.rerender(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <RoutineEditor {...next} />
        </NextIntlClientProvider>,
      ),
  };
}

const save = () => screen.getByRole("button", { name: /^Save/ });
const nameInput = () => screen.getByRole("textbox", { name: "Routine name" });

beforeEach(() => {
  saveRoutineAction.mockReset();
  refresh.mockReset();
  saveRoutineAction.mockResolvedValue({ ok: true, data: { version: 4 } });
});

describe("RoutineEditor", () => {
  it("shows the customer as a link and the body slots", () => {
    setup();
    expect(screen.getByRole("link", { name: "Ana Pérez" })).toHaveAttribute(
      "href",
      "/customers/cust-1",
    );
    expect(screen.getByTestId("block-list-slot")).toBeInTheDocument();
    expect(screen.getByTestId("picker-slot")).toBeInTheDocument();
  });

  it("keeps Save disabled until something changes", async () => {
    const user = userEvent.setup();
    setup();
    expect(save()).toBeDisabled();
    await user.type(nameInput(), "!");
    expect(save()).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
    await user.type(nameInput(), "{Backspace}");
    expect(save()).toBeDisabled();
  });

  it("sends the parsed header and blocks, then shows Saved", async () => {
    const user = userEvent.setup();
    setup();
    await user.clear(nameInput());
    await user.type(nameInput(), "Knee rehab v2");
    await user.type(screen.getByLabelText("Sessions per day"), "2");
    await user.type(screen.getByLabelText("Notes for the patient"), "Ice after");
    await chooseOption(user, screen.getByRole("combobox", { name: "Case" }), "ACL rehab");
    await chooseOption(user, screen.getByRole("combobox", { name: "Status" }), "Active");
    await user.click(save());

    await waitFor(() => expect(saveRoutineAction).toHaveBeenCalledTimes(1));
    expect(saveRoutineAction).toHaveBeenCalledWith({
      id: PROPS.routine.id,
      version: 3,
      name: "Knee rehab v2",
      notes: "Ice after",
      caseId: "case-1",
      sessionsPerWeek: 3,
      sessionsPerDay: 2,
      status: "active",
      groups: [],
      items: [
        {
          exerciseId: "00000000-0000-4000-8000-000000000001",
          groupKey: null,
          holdSeconds: null,
          restSeconds: 30,
          side: null,
          notes: null,
          sets: [{ reps: 10, repsMax: null, durationSeconds: null, load: null }],
        },
      ],
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
    expect(save()).toBeDisabled();
  });

  it("sends blank sessions as null and uses the new version on the next save", async () => {
    const user = userEvent.setup();
    setup();
    await user.clear(screen.getByLabelText("Sessions per week"));
    await user.click(save());
    await waitFor(() => expect(saveRoutineAction).toHaveBeenCalledTimes(1));
    expect(saveRoutineAction.mock.calls[0][0]).toMatchObject({
      version: 3,
      sessionsPerWeek: null,
      sessionsPerDay: null,
    });

    await user.type(nameInput(), "!");
    await user.click(save());
    await waitFor(() => expect(saveRoutineAction).toHaveBeenCalledTimes(2));
    expect(saveRoutineAction.mock.calls[1][0]).toMatchObject({ version: 4 });
  });

  it("shows a conflict alert with a Reload button that refreshes", async () => {
    const user = userEvent.setup();
    saveRoutineAction.mockResolvedValue({ ok: false, error: "conflict" });
    setup();
    await user.type(nameInput(), "!");
    await user.click(save());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This routine changed in another tab. Reload?");
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("resets to the server's routine when the page delivers a newer version", async () => {
    const user = userEvent.setup();
    saveRoutineAction.mockResolvedValue({ ok: false, error: "conflict" });
    const { rerenderWith } = setup();
    await user.type(nameInput(), "!");
    await user.click(save());
    await screen.findByRole("alert");

    rerenderWith({
      ...PROPS,
      routine: {
        ...PROPS.routine,
        version: 5,
        header: { ...PROPS.routine.header, name: "Theirs" },
      },
    });
    await waitFor(() => expect(nameInput()).toHaveValue("Theirs"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("keeps in-progress edits when the page re-renders with the version just saved", async () => {
    const user = userEvent.setup();
    const { rerenderWith } = setup();
    await user.type(nameInput(), "!");
    await user.click(save());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
    await user.type(nameInput(), "?");

    rerenderWith({
      ...PROPS,
      routine: { ...PROPS.routine, version: 4 },
    });
    expect(nameInput()).toHaveValue("Knee rehab!?");
    expect(save()).toBeEnabled();
  });

  it("maps server errors to messages", async () => {
    const user = userEvent.setup();
    saveRoutineAction.mockResolvedValue({ ok: false, error: "needsItems" });
    setup();
    await user.type(nameInput(), "!");
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add at least one exercise before activating.",
    );
    expect(save()).toBeEnabled();

    saveRoutineAction.mockResolvedValue({ ok: false, error: "invalid" });
    await user.click(save());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Check the highlighted fields."),
    );
  });

  it("falls back to the generic message when the action throws", async () => {
    const user = userEvent.setup();
    saveRoutineAction.mockRejectedValue(new Error("network"));
    setup();
    await user.type(nameInput(), "!");
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
    expect(save()).toBeEnabled();
  });

  it("validates before calling the action and shows field errors", async () => {
    const user = userEvent.setup();
    setup();
    await user.clear(nameInput());
    await user.type(screen.getByLabelText("Sessions per day"), "9");
    await user.click(save());
    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a whole number from 1 to 5.")).toBeInTheDocument();
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    expect(saveRoutineAction).not.toHaveBeenCalled();

    // Fixing the field clears its error.
    await user.type(nameInput(), "Back");
    expect(screen.queryByText("Enter a name.")).not.toBeInTheDocument();
  });

  it("hides the case select when the customer has no cases", () => {
    setup({ ...PROPS, routine: { ...PROPS.routine, cases: [] } });
    expect(screen.queryByRole("combobox", { name: "Case" })).not.toBeInTheDocument();
  });
});
