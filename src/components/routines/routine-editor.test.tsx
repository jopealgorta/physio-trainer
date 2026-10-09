import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorBlock, EditorItem } from "@/lib/routine-editor";
import { fromLoadedSections, type EditorSection } from "@/lib/routine-sections";
import type { ExerciseSummary } from "@/server/library/queries";
import { menuActions } from "@/test/page-actions";
import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { RoutineEditor, type RoutineEditorProps } from "./routine-editor";

const { saveRoutineAction, refresh } = vi.hoisted(() => ({
  saveRoutineAction: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/server/routines/actions", () => ({
  saveRoutineAction,
  searchExercisesAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const { createExerciseForRoutineAction } = vi.hoisted(() => ({
  createExerciseForRoutineAction: vi.fn(),
}));
vi.mock("@/server/library/actions", () => ({
  createExerciseForRoutineAction,
  createCategoryAction: vi.fn(),
}));
const history = vi.hoisted(() => ({
  listVersionsAction: vi.fn(),
  getSnapshotsAction: vi.fn(),
  restoreVersionAction: vi.fn(),
}));
vi.mock("@/server/history/actions", () => history);

const BLOCKS: EditorBlock[] = [
  {
    kind: "single",
    key: "k1",
    item: {
      key: "k1",
      exerciseId: "00000000-0000-4000-8000-000000000001",
      exerciseKind: "strength",
      exerciseName: "Squat",
      exerciseArchived: false,
      cover: null,
      holdSeconds: null,
      restSeconds: 30,
      side: null,
      notes: null,
      sets: [
        {
          key: "s1",
          reps: 10,
          repsMax: null,
          durationSeconds: null,
          load: null,
          distanceMeters: null,
          intensity: null,
        },
      ],
    },
  },
];

/** One section holding `blocks`, as the page builds it. */
const sectionsOf = (blocks: EditorBlock[], key = "sec-1"): EditorSection[] => [
  { key, name: "Main", blocks },
];

const BLOCKS_ITEM = (BLOCKS[0] as Extract<EditorBlock, { kind: "single" }>).item;
const summary = (id: string, name: string): ExerciseSummary => ({
  id,
  name,
  kind: "strength",
  categoryIds: [],
  bodyAreas: [],
  archivedAt: null,
  cover: null,
});
const SQUAT = summary("00000000-0000-4000-8000-000000000001", "Squat");
const LUNGE = summary("00000000-0000-4000-8000-000000000002", "Lunge");
const BRIDGE = summary("00000000-0000-4000-8000-000000000003", "Bridge");

const PROPS: RoutineEditorProps = {
  routine: {
    id: "00000000-0000-4000-8000-0000000000aa",
    version: 3,
    customerId: "cust-1",
    customerName: "Ana Pérez",
    isTemplate: false,
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
  initialSections: sectionsOf(BLOCKS),
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

const saveStatus = () => screen.getByTestId("save-status");
const save = () => screen.getByRole("button", { name: /^Save/ });
const title = () => screen.getByRole("heading", { level: 1 });

/** Renames the routine through its title: pencil, type, Enter. */
async function rename(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: "Rename routine" }));
  const input = screen.getByRole("textbox", { name: "Routine name" });
  await user.clear(input);
  await user.type(input, `${name}{Enter}`);
}

/**
 * Opens "Move to section" and chooses a section with the keyboard: Radix's submenu pointer-grace
 * logic needs real geometry, which jsdom does not have.
 */
async function moveToSection(user: ReturnType<typeof userEvent.setup>, section: string) {
  const trigger = await screen.findByRole("menuitem", { name: "Move to section" });
  trigger.focus();
  await user.keyboard("{ArrowRight}");
  await screen.findByRole("menuitem", { name: section });
  for (let step = 0; step < 12; step++) {
    if (document.activeElement?.textContent === section) break;
    await user.keyboard("{ArrowDown}");
  }
  expect(document.activeElement).toHaveTextContent(section);
  await user.keyboard("{Enter}");
}

beforeEach(() => {
  saveRoutineAction.mockReset();
  refresh.mockReset();
  saveRoutineAction.mockResolvedValue({ ok: true, data: { version: 4 } });
});

describe("RoutineEditor", () => {
  it("keeps Save and the save state in the pinned footer, after the blocks", () => {
    setup();
    const footer = save().closest('[data-slot="form-footer"]');
    expect(footer).not.toBeNull();
    expect(footer).toContainElement(saveStatus());
    expect(screen.getByText("Squat").compareDocumentPosition(footer!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("shows the customer as a link, the block list and the picker", () => {
    setup();
    expect(screen.getByRole("link", { name: "Ana Pérez" })).toHaveAttribute(
      "href",
      "/customers/cust-1",
    );
    expect(screen.getByText("Squat")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search exercises" })).toBeInTheDocument();
  });

  it("opens the picker sheet with only the localized Done button to close it", async () => {
    const user = userEvent.setup();
    setup({ ...PROPS, exercises: [LUNGE] });
    await user.click(screen.getByRole("button", { name: "Add exercises" }));
    const sheet = await screen.findByRole("dialog", { name: "Add exercises" });
    // A drawer, so it can be swiped down to dismiss.
    expect(sheet).toHaveAttribute("data-vaul-drawer");
    // Focus moves onto the sheet, not into the search field (which would pop the keyboard).
    expect(sheet).toHaveFocus();
    expect(within(sheet).getByRole("button", { name: "Done" })).toBeInTheDocument();
    // The sheet's built-in X button carries a hard-coded English "Close" label.
    expect(within(sheet).queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("adds an exercise picked from the picker as a new row and stays open", async () => {
    const user = userEvent.setup();
    setup({ ...PROPS, exercises: [LUNGE, BRIDGE] });
    const picker = within(screen.getByTestId("picker-list"));
    await user.click(picker.getByRole("button", { name: "Lunge" }));
    await user.click(picker.getByRole("button", { name: "Bridge" }));
    const rows = screen.getAllByTestId("item-row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("Lunge");
    expect(rows[2]).toHaveTextContent("Bridge");
    expect(save()).toBeEnabled();
    expect(screen.getByTestId("picker-announcer")).toHaveTextContent("Added Bridge.");
  });

  it("marks the exercises already in the routine in the side panel", async () => {
    const user = userEvent.setup();
    setup({ ...PROPS, exercises: [SQUAT, LUNGE] });
    const aside = within(screen.getByRole("complementary"));
    expect(aside.getByRole("button", { name: "Squat" })).toHaveAccessibleDescription(
      "In the routine",
    );
    expect(aside.getByRole("button", { name: "Lunge" })).not.toHaveAccessibleDescription();
    await user.click(aside.getByRole("button", { name: "Lunge" }));
    expect(aside.getByRole("button", { name: "Lunge" })).toHaveAccessibleDescription(
      "In the routine",
    );
  });

  it("counts what this sheet added, confirms each pick and marks the rows", async () => {
    const user = userEvent.setup();
    setup({ ...PROPS, exercises: [SQUAT, LUNGE] });
    await user.click(screen.getByRole("button", { name: "Add exercises" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Add exercises" }));
    expect(sheet.getByRole("button", { name: "Done" })).toBeInTheDocument();

    await user.click(sheet.getByRole("button", { name: "Lunge" }));
    expect(sheet.getByRole("button", { name: "1 added · Done" })).toBeInTheDocument();
    expect(sheet.getByTestId("picker-flash")).toHaveTextContent("Added Lunge");
    await user.click(sheet.getByRole("button", { name: "Squat" }));
    expect(sheet.getByTestId("picker-flash")).toHaveTextContent("Added Squat");
    expect(sheet.getByRole("button", { name: "Squat" })).toHaveAccessibleDescription(
      "In the routine 2 times",
    );

    // Done closes; reopening starts a new count.
    await user.click(sheet.getByRole("button", { name: "2 added · Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Add exercises" }));
    const again = within(await screen.findByRole("dialog", { name: "Add exercises" }));
    expect(again.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(again.queryByTestId("picker-flash")).not.toBeInTheDocument();
  });

  it("lets the confirmation go after a moment", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      setup({ ...PROPS, exercises: [LUNGE] });
      await user.click(screen.getByRole("button", { name: "Add exercises" }));
      const sheet = within(await screen.findByRole("dialog", { name: "Add exercises" }));
      await user.click(sheet.getByRole("button", { name: "Lunge" }));
      expect(sheet.getByTestId("picker-flash")).toHaveTextContent("Added Lunge");
      await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(sheet.queryByTestId("picker-flash")).not.toBeInTheDocument();
      expect(sheet.getByRole("button", { name: "1 added · Done" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  describe("creating an exercise from the picker", () => {
    const WALL_SIT = {
      id: "00000000-0000-4000-8000-000000000009",
      name: "Wall sit",
      kind: "strength",
      archived: false,
      cover: null,
    } as const;
    beforeEach(() => {
      createExerciseForRoutineAction.mockReset();
      createExerciseForRoutineAction.mockResolvedValue({ status: "created", exercise: WALL_SIT });
    });

    it("adds it as a new row from the side panel's dialog", async () => {
      const user = userEvent.setup();
      setup();
      const aside = within(screen.getByRole("complementary"));
      await user.click(aside.getByRole("button", { name: "New exercise" }));
      const dialog = await screen.findByRole("dialog", { name: "New exercise" });
      expect(dialog).not.toHaveAttribute("data-vaul-drawer");
      await user.type(within(dialog).getByLabelText("Name"), "Wall sit");
      await user.click(within(dialog).getByRole("button", { name: "Create and add" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const rows = screen.getAllByTestId("item-row");
      expect(rows).toHaveLength(2);
      expect(rows[1]).toHaveTextContent("Wall sit");
      expect(save()).toBeEnabled();
    });

    it("opens a nested sheet from the picker sheet and counts what it added", async () => {
      const user = userEvent.setup();
      setup();
      await user.click(screen.getByRole("button", { name: "Add exercises" }));
      const sheet = within(await screen.findByRole("dialog", { name: "Add exercises" }));
      await user.click(sheet.getByRole("button", { name: "New exercise" }));
      const form = await screen.findByRole("dialog", { name: "New exercise" });
      expect(form).toHaveAttribute("data-vaul-drawer");
      await user.type(within(form).getByLabelText("Name"), "Wall sit");
      await user.click(within(form).getByRole("button", { name: "Create and add" }));

      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "New exercise" })).not.toBeInTheDocument(),
      );
      expect(sheet.getByRole("button", { name: "1 added · Done" })).toBeInTheDocument();
      expect(sheet.getByTestId("picker-flash")).toHaveTextContent("Added Wall sit");
      expect(screen.getAllByTestId("item-row")[1]).toHaveTextContent("Wall sit");
    });
  });

  it("disables the picker once the routine has 50 exercises", () => {
    const many: EditorBlock[] = Array.from({ length: 50 }, (_, index) => ({
      kind: "single",
      key: `k${index}`,
      item: { ...BLOCKS_ITEM, key: `k${index}` },
    }));
    setup({ ...PROPS, initialSections: sectionsOf(many), exercises: [LUNGE] });
    expect(
      within(screen.getByRole("complementary")).getByText("A routine can have up to 50 exercises."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("picker-list")).getByRole("button", { name: "Lunge" }),
    ).toBeDisabled();
  });

  it("lays out the page's back link, controls and phase around the title, with History in More actions", async () => {
    const user = userEvent.setup();
    setup({
      ...PROPS,
      top: {
        back: <a href="#back">Back to routines</a>,
        actions: <button type="button">Export</button>,
        secondary: <button type="button">Save as template…</button>,
        phase: <p>Phase bar</p>,
      },
    });
    expect(screen.getByRole("link", { name: "Back to routines" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as template…" })).toBeInTheDocument();
    expect(screen.getByText("Phase bar")).toBeInTheDocument();
    // On phones the controls' rows give way to the menu (and Save moves up next to it).
    expect(screen.getByRole("button", { name: "Export" }).parentElement).toHaveClass(
      "hidden",
      "sm:flex",
    );
    expect(await menuActions(user)).toEqual(["History"]);
  });

  it("keeps Save disabled until something changes", async () => {
    const user = userEvent.setup();
    setup();
    expect(save()).toBeDisabled();
    await rename(user, "Knee rehab!");
    expect(title()).toHaveTextContent("Knee rehab!");
    expect(save()).toBeEnabled();
    expect(saveStatus()).toHaveTextContent("Unsaved changes");
    await rename(user, "Knee rehab");
    expect(save()).toBeDisabled();
  });

  it("saves a name still being typed with one tap on Save", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Rename routine" }));
    const input = screen.getByRole("textbox", { name: "Routine name" });
    await user.clear(input);
    await user.type(input, "Hip rehab");
    // Save is on as soon as the name changes (on iOS a disabled button cannot be tapped).
    expect(save()).toBeEnabled();
    await user.click(save());
    await waitFor(() =>
      expect(saveRoutineAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Hip rehab" }),
      ),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Hip rehab" })).toBeInTheDocument();
  });

  it("refuses a blank title inline, leaving the routine unchanged", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Rename routine" }));
    await user.clear(screen.getByRole("textbox", { name: "Routine name" }));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a name.");
    await user.keyboard("{Escape}");
    expect(title()).toHaveTextContent("Knee rehab");
    expect(save()).toBeDisabled();
  });

  it("sends the parsed header and blocks, then shows Saved", async () => {
    const user = userEvent.setup();
    setup();
    await rename(user, "Knee rehab v2");
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
      sections: [{ key: "sec-1", name: "Main" }],
      groups: [],
      items: [
        {
          exerciseId: "00000000-0000-4000-8000-000000000001",
          groupKey: null,
          sectionKey: "sec-1",
          holdSeconds: null,
          restSeconds: 30,
          side: null,
          notes: null,
          sets: [
            {
              reps: 10,
              repsMax: null,
              durationSeconds: null,
              load: null,
              distanceMeters: null,
              intensity: null,
            },
          ],
        },
      ],
    });
    await waitFor(() => expect(saveStatus()).toHaveTextContent("Saved"));
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

    await rename(user, "Knee rehab!");
    await user.click(save());
    await waitFor(() => expect(saveRoutineAction).toHaveBeenCalledTimes(2));
    expect(saveRoutineAction.mock.calls[1][0]).toMatchObject({ version: 4 });
  });

  it("shows a conflict alert with a Reload button that refreshes", async () => {
    const user = userEvent.setup();
    saveRoutineAction.mockResolvedValue({ ok: false, error: "conflict" });
    setup();
    await rename(user, "Knee rehab!");
    await user.click(save());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This routine changed in another tab. Reload?");
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("resets header and blocks after a conflict and Reload delivers a newer version", async () => {
    const user = userEvent.setup();
    saveRoutineAction.mockResolvedValue({ ok: false, error: "conflict" });
    const { rerenderWith } = setup();
    await rename(user, "Knee rehab!");
    await user.click(save());
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Reload" }));

    const theirs: EditorBlock[] = [
      {
        kind: "single",
        key: "t1",
        item: { ...(BLOCKS[0] as { item: EditorItem }).item, key: "t1", exerciseName: "Lunge" },
      },
    ];
    rerenderWith({
      ...PROPS,
      initialSections: sectionsOf(theirs, "sec-t"),
      routine: {
        ...PROPS.routine,
        version: 5,
        header: { ...PROPS.routine.header, name: "Theirs" },
      },
    });
    await waitFor(() => expect(title().textContent).toBe("Theirs"));
    expect(screen.getByText("Lunge")).toBeInTheDocument();
    expect(screen.queryByText("Squat")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("restores a version from History, discarding unsaved edits once the page reloads", async () => {
    const user = userEvent.setup();
    const snapshot = {
      schema: 1,
      routine: {
        name: "Knee rehab",
        notes: null,
        status: "draft",
        caseId: null,
        sessionsPerWeek: 3,
        sessionsPerDay: null,
        phaseLabel: null,
        startsOn: null,
        endsOn: null,
      },
      groups: [],
      items: [],
    };
    history.listVersionsAction.mockResolvedValue({
      ok: true,
      data: [
        {
          version: 3,
          kind: "edited",
          restoredFrom: null,
          summary: null,
          at: "2026-03-02T10:00:00Z",
        },
        {
          version: 2,
          kind: "created",
          restoredFrom: null,
          summary: null,
          at: "2026-03-01T10:00:00Z",
        },
      ],
    });
    history.getSnapshotsAction.mockResolvedValue({ ok: true, data: { 2: snapshot, 3: snapshot } });
    history.restoreVersionAction.mockResolvedValue({ ok: true, data: { version: 4, dropped: 0 } });
    const { rerenderWith } = setup();
    await rename(user, "Knee rehab!");

    await user.click(screen.getByRole("button", { name: "History" }));
    await user.click(await screen.findByRole("button", { name: /Created/ }));
    await user.click(screen.getByRole("button", { name: "Restore this version" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Your unsaved changes will be discarded.");
    await user.click(within(confirm).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    rerenderWith({
      ...PROPS,
      routine: { ...PROPS.routine, version: 4, header: { ...PROPS.routine.header, name: "Old" } },
    });
    await waitFor(() => expect(title().textContent).toBe("Old"));
    expect(save()).toBeDisabled();
  });

  it("does not reset when a newer page version arrives without a conflict", async () => {
    const user = userEvent.setup();
    const { rerenderWith } = setup();
    await rename(user, "Knee rehab!");
    rerenderWith({
      ...PROPS,
      routine: {
        ...PROPS.routine,
        version: 5,
        header: { ...PROPS.routine.header, name: "Theirs" },
      },
    });
    expect(title().textContent).toBe("Knee rehab!");
    expect(save()).toBeEnabled();
  });

  it("keeps in-progress edits when the page re-renders with the version just saved", async () => {
    const user = userEvent.setup();
    const { rerenderWith } = setup();
    await rename(user, "Knee rehab!");
    await user.click(save());
    await waitFor(() => expect(saveStatus()).toHaveTextContent("Saved"));
    await rename(user, "Knee rehab!?");

    rerenderWith({
      ...PROPS,
      routine: { ...PROPS.routine, version: 4 },
    });
    expect(title().textContent).toBe("Knee rehab!?");
    expect(save()).toBeEnabled();
  });

  it("edits the blocks and sends the change on save", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Edit prescription" }));
    await user.click(screen.getByRole("button", { name: "Add set" }));
    expect(save()).toBeEnabled();
    await user.click(save());
    await waitFor(() => expect(saveRoutineAction).toHaveBeenCalledTimes(1));
    const { items } = saveRoutineAction.mock.calls[0][0];
    expect(items[0].sets).toHaveLength(2);
  });

  it("maps server errors to messages", async () => {
    const user = userEvent.setup();
    saveRoutineAction.mockResolvedValue({ ok: false, error: "needsItems" });
    setup();
    await rename(user, "Knee rehab!");
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add at least one exercise before activating.",
    );
    expect(save()).toBeEnabled();

    saveRoutineAction.mockResolvedValue({ ok: false, error: "invalid" });
    await user.click(save());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Check the form and try again."),
    );
  });

  it("falls back to the generic message when the action throws", async () => {
    const user = userEvent.setup();
    saveRoutineAction.mockRejectedValue(new Error("network"));
    setup();
    await rename(user, "Knee rehab!");
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
    expect(save()).toBeEnabled();
  });

  it("validates before calling the action and shows field errors", async () => {
    const user = userEvent.setup();
    setup();
    const perDay = screen.getByLabelText("Sessions per day");
    await user.type(perDay, "9");
    await user.click(save());
    expect(await screen.findByText("Enter a whole number from 1 to 5.")).toBeInTheDocument();
    expect(perDay).toHaveAttribute("aria-invalid", "true");
    expect(saveRoutineAction).not.toHaveBeenCalled();

    // Fixing the field clears its error.
    await user.clear(perDay);
    expect(screen.queryByText("Enter a whole number from 1 to 5.")).not.toBeInTheDocument();
  });

  it("blocks the save when a collapsed item has an invalid rep range, and expands it", async () => {
    const user = userEvent.setup();
    const bad: EditorBlock[] = [
      {
        kind: "single",
        key: "k1",
        item: {
          ...BLOCKS_ITEM,
          sets: [
            {
              key: "s1",
              reps: 12,
              repsMax: 10,
              durationSeconds: null,
              load: null,
              distanceMeters: null,
              intensity: null,
            },
          ],
        },
      },
    ];
    setup({ ...PROPS, initialSections: sectionsOf(bad) });
    expect(screen.getByRole("button", { name: "Edit prescription" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await rename(user, "Knee rehab!");
    await user.click(save());

    expect(saveRoutineAction).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Some sets have invalid reps. Check the highlighted exercises."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide prescription" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Set 1: Max reps" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(within(screen.getByTestId("item-row")).getByText("Check sets")).toBeInTheDocument();

    // Fixing the range clears the message and lets the save through.
    await user.clear(screen.getByRole("textbox", { name: "Set 1: Max reps" }));
    await user.click(save());
    await waitFor(() => expect(saveRoutineAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Check sets")).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid reps/)).not.toBeInTheDocument();
  });

  it("blocks the save when max reps has no reps", async () => {
    const user = userEvent.setup();
    const bad: EditorBlock[] = [
      {
        kind: "single",
        key: "k1",
        item: {
          ...BLOCKS_ITEM,
          sets: [
            {
              key: "s1",
              reps: null,
              repsMax: 8,
              durationSeconds: null,
              load: null,
              distanceMeters: null,
              intensity: null,
            },
          ],
        },
      },
    ];
    setup({ ...PROPS, initialSections: sectionsOf(bad) });
    await rename(user, "Knee rehab!");
    await user.click(save());
    expect(saveRoutineAction).not.toHaveBeenCalled();
    expect(await screen.findByText(/invalid reps/)).toBeInTheDocument();
    expect(screen.getByText("Enter reps first.")).toBeInTheDocument();
  });

  it("keeps working when the page already has a newer version before the conflict", async () => {
    const user = userEvent.setup();
    saveRoutineAction.mockResolvedValue({ ok: false, error: "conflict" });
    const { rerenderWith } = setup();
    // Fresher data arrives (e.g. a background refresh) while the user has no conflict yet.
    rerenderWith({
      ...PROPS,
      routine: {
        ...PROPS.routine,
        version: 5,
        header: { ...PROPS.routine.header, name: "Theirs" },
      },
    });
    await rename(user, "Knee rehab!");
    await user.click(save());
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(title().textContent).toBe("Theirs"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("does not call the server when activating a routine with no exercises", async () => {
    const user = userEvent.setup();
    setup({ ...PROPS, initialSections: sectionsOf([]) });
    await chooseOption(user, screen.getByRole("combobox", { name: "Status" }), "Active");
    await user.click(save());
    expect(saveRoutineAction).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add at least one exercise before activating.",
    );
  });

  it("announces header errors and focuses the first invalid field", async () => {
    const user = userEvent.setup();
    setup();
    const perWeek = screen.getByLabelText("Sessions per week");
    await user.clear(perWeek);
    await user.type(perWeek, "15");
    await user.type(screen.getByLabelText("Sessions per day"), "9");
    await user.click(save());
    const errors = await screen.findAllByRole("alert");
    expect(errors.map((element) => element.textContent)).toEqual([
      "Enter a whole number from 1 to 14.",
      "Enter a whole number from 1 to 5.",
    ]);
    expect(perWeek).toHaveFocus();
  });

  it("hides the case select when the customer has no cases", () => {
    setup({ ...PROPS, routine: { ...PROPS.routine, cases: [] } });
    expect(screen.queryByRole("combobox", { name: "Case" })).not.toBeInTheDocument();
  });
});

describe("RoutineEditor in template mode", () => {
  const TEMPLATE: RoutineEditorProps = {
    ...PROPS,
    routine: {
      ...PROPS.routine,
      customerId: null,
      customerName: null,
      isTemplate: true,
      cases: [],
      header: { ...PROPS.routine.header, status: "active" },
    },
  };

  it("shows the Template badge, with no customer link and no case select", () => {
    setup(TEMPLATE);
    expect(screen.getByText("Template")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ana Pérez" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Case" })).not.toBeInTheDocument();
  });

  it("offers only the active and archived statuses", async () => {
    const user = userEvent.setup();
    setup(TEMPLATE);
    await user.click(screen.getByRole("combobox", { name: "Status" }));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["Active", "Archived"]);
  });

  it("does not show the Template badge on a customer's routine", () => {
    setup();
    expect(screen.queryByText("Template")).not.toBeInTheDocument();
  });

  it("saves an active template without exercises", async () => {
    const user = userEvent.setup();
    setup({ ...TEMPLATE, initialSections: sectionsOf([]) });
    await rename(user, "Knee rehab v2");
    await user.click(save());
    await waitFor(() => expect(saveRoutineAction).toHaveBeenCalledTimes(1));
    expect(saveRoutineAction).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", items: [] }),
    );
  });
});

describe("RoutineEditor sections", () => {
  const SQUAT_BLOCK = BLOCKS[0];
  const lungeBlock: EditorBlock = {
    kind: "single",
    key: "k2",
    item: { ...BLOCKS_ITEM, key: "k2", exerciseId: LUNGE.id, exerciseName: "Lunge" },
  };
  const bridgeBlock: EditorBlock = {
    kind: "single",
    key: "k3",
    item: { ...BLOCKS_ITEM, key: "k3", exerciseId: BRIDGE.id, exerciseName: "Bridge" },
  };
  /** Warm-up (Squat, Bridge) then Main (Lunge). */
  const TWO: RoutineEditorProps = {
    ...PROPS,
    initialSections: [
      { key: "sec-w", name: "Warm-up", blocks: [SQUAT_BLOCK, bridgeBlock] },
      { key: "sec-m", name: "Main", blocks: [lungeBlock] },
    ],
  };

  const sectionNames = () =>
    screen.getAllByRole("region").map((section) => section.getAttribute("aria-label"));
  const region = (name: string) => screen.getByRole("region", { name });
  async function sectionMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(within(region(name)).getByRole("button", { name: "Section options" }));
  }

  it("opens a routine without sections with one Main section", () => {
    let n = 0;
    setup({
      ...PROPS,
      initialSections: fromLoadedSections([], [], [], "Main", () => `key-${++n}`),
    });
    expect(sectionNames()).toEqual(["Main"]);
    expect(within(region("Main")).getByText(messages.Routines.items.empty)).toBeInTheDocument();
  });

  it("adds a section from a suggestion chip and from a typed name", async () => {
    const user = userEvent.setup();
    setup();
    const add = within(screen.getByRole("group", { name: "Add section" }));
    await user.click(add.getByRole("button", { name: "Cool-down" }));
    await user.type(add.getByRole("textbox", { name: "New section name" }), "  Balance {Enter}");
    expect(sectionNames()).toEqual(["Main", "Cool-down", "Balance"]);
    expect(add.getByRole("textbox", { name: "New section name" })).toHaveValue("");
    expect(within(region("Balance")).getByText("Drag exercises here")).toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it("renames a section with Enter, keeps it on Escape and refuses a blank name", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Rename Main" }));
    const input = screen.getByRole("textbox", { name: "Section name" });
    await user.clear(input);
    await user.type(input, "Strength{Enter}");
    expect(region("Strength")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rename Strength" }));
    await user.type(screen.getByRole("textbox", { name: "Section name" }), "ening{Escape}");
    expect(region("Strength")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rename Strength" }));
    await user.clear(screen.getByRole("textbox", { name: "Section name" }));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a name of up to 60 characters.");
    await user.keyboard("{Escape}");
    expect(region("Strength")).toBeInTheDocument();
  });

  it("asks before deleting a section with exercises, then removes them", async () => {
    const user = userEvent.setup();
    setup(TWO);
    await sectionMenu(user, "Warm-up");
    await user.click(await screen.findByRole("menuitem", { name: "Delete section" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Delete “Warm-up” and its 2 exercises?");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(sectionNames()).toEqual(["Main"]);
    expect(screen.queryByText("Squat")).not.toBeInTheDocument();
    expect(screen.getByText("Lunge")).toBeInTheDocument();
  });

  it("deletes an empty section without asking", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Cool-down" }));
    await sectionMenu(user, "Cool-down");
    await user.click(await screen.findByRole("menuitem", { name: "Delete section" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Cool-down" })).not.toBeInTheDocument();
  });

  it("disables Delete and the moves on the only section", async () => {
    const user = userEvent.setup();
    setup();
    await sectionMenu(user, "Main");
    for (const name of ["Delete section", "Move up", "Move down"]) {
      expect(await screen.findByRole("menuitem", { name })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
  });

  it("moves a section down from its menu", async () => {
    const user = userEvent.setup();
    setup(TWO);
    await sectionMenu(user, "Warm-up");
    await user.click(await screen.findByRole("menuitem", { name: "Move down" }));
    expect(sectionNames()).toEqual(["Main", "Warm-up"]);
  });

  it("moves an exercise to another section from its menu and saves its section", async () => {
    const user = userEvent.setup();
    setup(TWO);
    const squat = within(region("Warm-up")).getByText("Squat").closest("[data-testid='item-row']");
    await user.click(
      within(squat as HTMLElement).getByRole("button", { name: "Exercise options" }),
    );
    await moveToSection(user, "Main");
    expect(within(region("Main")).getByText("Squat")).toBeInTheDocument();
    expect(within(region("Warm-up")).queryByText("Squat")).not.toBeInTheDocument();

    await user.click(save());
    await waitFor(() => expect(saveRoutineAction).toHaveBeenCalledTimes(1));
    const payload = saveRoutineAction.mock.calls[0][0];
    expect(payload.sections).toEqual([
      { key: "sec-w", name: "Warm-up" },
      { key: "sec-m", name: "Main" },
    ]);
    expect(
      payload.items.map((i: { exerciseId: string; sectionKey: string }) => [
        i.exerciseId,
        i.sectionKey,
      ]),
    ).toEqual([
      [BRIDGE.id, "sec-w"],
      [LUNGE.id, "sec-m"],
      [SQUAT.id, "sec-m"],
    ]);
  });

  it("hides Move to section when the routine has one section", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Exercise options" }));
    await screen.findByRole("menuitem", { name: "Duplicate" });
    expect(screen.queryByRole("menuitem", { name: "Move to section" })).not.toBeInTheDocument();
  });

  it("adds picked exercises to the last section", async () => {
    const user = userEvent.setup();
    setup({ ...TWO, exercises: [SQUAT] });
    await user.click(
      within(screen.getByTestId("picker-list")).getByRole("button", { name: "Squat" }),
    );
    expect(within(region("Main")).getByText("Squat")).toBeInTheDocument();
    expect(within(region("Warm-up")).getAllByText("Squat")).toHaveLength(1);
  });

  it("hides the section drag handle while the routine has one section", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole("button", { name: "Reorder Main" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cool-down" }));
    expect(screen.getByRole("button", { name: "Reorder Main" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reorder Cool-down" })).toBeInTheDocument();
  });

  it("focuses the moved exercise's drag handle in its new section", async () => {
    const user = userEvent.setup();
    setup(TWO);
    const squat = within(region("Warm-up")).getByText("Squat").closest("[data-testid='item-row']");
    await user.click(
      within(squat as HTMLElement).getByRole("button", { name: "Exercise options" }),
    );
    await moveToSection(user, "Main");
    const handle = within(region("Main")).getByRole("button", { name: "Reorder Squat" });
    await waitFor(() => expect(handle).toHaveFocus());
  });

  it("focuses the previous section's menu after deleting a section", async () => {
    const user = userEvent.setup();
    setup(TWO);
    await sectionMenu(user, "Main");
    await user.click(await screen.findByRole("menuitem", { name: "Delete section" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    const menu = within(region("Warm-up")).getByRole("button", { name: "Section options" });
    await waitFor(() => expect(menu).toHaveFocus());
  });

  it("focuses the new first section's menu after deleting the first, empty section", async () => {
    const user = userEvent.setup();
    setup({
      ...TWO,
      initialSections: [{ key: "sec-e", name: "Empty", blocks: [] }, ...TWO.initialSections],
    });
    await sectionMenu(user, "Empty");
    await user.click(await screen.findByRole("menuitem", { name: "Delete section" }));
    const menu = within(region("Warm-up")).getByRole("button", { name: "Section options" });
    await waitFor(() => expect(menu).toHaveFocus());
  });

  describe("keyboard drags of exercises", () => {
    // jsdom has no layout. Warm-up holds Squat (short) above Bridge (tall); Main holds Lunge,
    // whose centre is nearer to Squat's keyboard target than Bridge's own centre is.
    const ROWS: Record<string, [number, number]> = {
      Squat: [50, 60],
      Bridge: [120, 400],
      Lunge: [560, 60],
    };
    const CARDS: Record<string, [number, number]> = { "Warm-up": [0, 530], Main: [540, 160] };
    const ROW = "[data-testid='item-row']";
    const CARD = "[data-testid='section-card']";
    function box(element: HTMLElement): [number, number] {
      const own = (child: Element | null, selector: string) =>
        child?.matches(selector) ? child : null;
      const row = element.closest(ROW) ?? own(element.firstElementChild, ROW);
      if (row) {
        const name = Object.keys(ROWS).find((n) => row.textContent?.includes(n));
        return name ? ROWS[name]! : [0, 0];
      }
      const card = element.closest(CARD) ?? own(element.firstElementChild, CARD);
      return (card && CARDS[card.getAttribute("aria-label") ?? ""]) || [0, 0];
    }
    let rect: { mockRestore: () => void };
    beforeEach(() => {
      rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
      ) {
        const [top, height] = box(this);
        return {
          x: 0,
          y: top,
          top,
          left: 0,
          width: 300,
          height,
          bottom: top + height,
          right: 300,
          toJSON: () => ({}),
        } as DOMRect;
      });
    });
    afterEach(() => rect.mockRestore());

    const blocksIn = (name: string) =>
      within(region(name))
        .getAllByTestId("item-row")
        .map((row) => Object.keys(ROWS).find((n) => row.textContent?.includes(n)));

    it("reorders an exercise within its section and never into the next one", async () => {
      const user = userEvent.setup();
      setup(TWO);
      screen.getByRole("button", { name: "Reorder Squat" }).focus();
      await user.keyboard(" ");
      await user.keyboard("{ArrowDown}");
      expect(blocksIn("Main")).toEqual(["Lunge"]);
      await user.keyboard(" ");
      await waitFor(() => expect(blocksIn("Warm-up")).toEqual(["Bridge", "Squat"]));
      expect(blocksIn("Main")).toEqual(["Lunge"]);
      expect(save()).toBeEnabled();
    });

    it("puts the exercise back where it was when the drag is cancelled", async () => {
      const user = userEvent.setup();
      setup(TWO);
      screen.getByRole("button", { name: "Reorder Squat" }).focus();
      await user.keyboard(" ");
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Escape}");
      expect(await screen.findByText("Moving Squat was cancelled.")).toBeInTheDocument();
      expect(blocksIn("Warm-up")).toEqual(["Squat", "Bridge"]);
      expect(blocksIn("Main")).toEqual(["Lunge"]);
      expect(save()).toBeDisabled();
    });
  });

  it("reorders sections with the keyboard", async () => {
    // jsdom has no layout: stack the section cards 200px apart so dnd-kit can measure them.
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const selector = "[data-testid='section-card']";
        // The sortable node is the card's list item; anything inside a card shares its rect.
        const card = this.closest(selector) ?? this.querySelector(`:scope > ${selector}`);
        const cards = [...document.querySelectorAll(selector)];
        const top = card ? cards.indexOf(card) * 200 : 0;
        const height = card ? 180 : 0;
        return {
          x: 0,
          y: top,
          top,
          left: 0,
          width: 300,
          height,
          bottom: top + height,
          right: 300,
          toJSON: () => ({}),
        } as DOMRect;
      });
    try {
      const user = userEvent.setup();
      setup(TWO);
      screen.getByRole("button", { name: "Reorder Warm-up" }).focus();
      await user.keyboard(" ");
      await user.keyboard("{ArrowDown}");
      await user.keyboard(" ");
      await waitFor(() => expect(sectionNames()).toEqual(["Main", "Warm-up"]));
      expect(save()).toBeEnabled();
    } finally {
      rect.mockRestore();
    }
  });
});
