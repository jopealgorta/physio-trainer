import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AttachableRoutine, PlanEntryDetail } from "@/server/plans/queries";
import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { PlanBoard } from "./plan-board";

const a = vi.hoisted(() => ({
  addEntryAction: vi.fn(),
  copyEntryAction: vi.fn(),
  makeSeparateCopyAction: vi.fn(),
  moveEntryAction: vi.fn(),
  removeEntryAction: vi.fn(),
  setEntryLabelAction: vi.fn(),
  setDayNotesAction: vi.fn(),
  addNewRoutineEntryAction: vi.fn(),
}));
vi.mock("@/server/plans/actions", () => a);

const PLAN = "11111111-1111-4111-8111-111111111111";

const entry = (overrides: Partial<PlanEntryDetail> & { id: string }): PlanEntryDetail => ({
  weekday: 1,
  position: 0,
  label: null,
  routineId: `r-${overrides.id}`,
  routineName: `Routine ${overrides.id}`,
  routineStatus: "active",
  routineIsStandalone: true,
  exerciseCount: 3,
  routineEntryCount: 1,
  ...overrides,
});

const routines: AttachableRoutine[] = [
  { id: "r1", name: "Knee rehab", status: "active", isStandalone: true, itemCount: 4 },
  { id: "r2", name: "Board only", status: "draft", isStandalone: false, itemCount: 0 },
];

function setup(
  entries: PlanEntryDetail[] = [],
  props: Partial<React.ComponentProps<typeof PlanBoard>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PlanBoard planId={PLAN} entries={entries} routines={routines} dayNotes={{}} {...props} />
    </NextIntlClientProvider>,
  );
}

const day = (name: string) => screen.getByRole("region", { name });
const namesIn = (name: string) =>
  within(day(name))
    .queryAllByRole("link")
    .map((link) => link.textContent);
const menuFor = (routine: string, within_ = screen) =>
  within_.getAllByRole("button", { name: `Actions for ${routine}` })[0];

/**
 * Opens a submenu of the entry menu ("Move to…") and chooses an item with the keyboard: Radix's
 * pointer-grace logic needs real geometry, which jsdom does not have.
 */
async function chooseFromSubmenu(
  user: ReturnType<typeof userEvent.setup>,
  submenu: string,
  item: string,
) {
  const trigger = await screen.findByRole("menuitem", { name: submenu });
  trigger.focus();
  await user.keyboard("{ArrowRight}");
  await screen.findByRole("menuitem", { name: item });
  for (let step = 0; step < 8; step++) {
    if (document.activeElement?.textContent === item) break;
    await user.keyboard("{ArrowDown}");
  }
  expect(document.activeElement).toHaveTextContent(item);
  await user.keyboard("{Enter}");
}

/**
 * Keeps a mocked action pending until the returned function is called, so the board's optimistic
 * state stays visible. Always settle it: a transition left pending would hold back later tests'.
 */
function hold(action: ReturnType<typeof vi.fn>) {
  let release!: () => void;
  action.mockReturnValue(
    new Promise((resolve) => {
      release = () => resolve({ ok: true, data: { deletedRoutine: false } });
    }),
  );
  return () => act(async () => release());
}

beforeEach(() => {
  for (const fn of Object.values(a)) fn.mockReset();
  for (const fn of [
    a.moveEntryAction,
    a.copyEntryAction,
    a.setEntryLabelAction,
    a.setDayNotesAction,
  ]) {
    fn.mockResolvedValue({ ok: true, data: {} });
  }
  a.removeEntryAction.mockResolvedValue({ ok: true, data: { deletedRoutine: false } });
  a.addEntryAction.mockResolvedValue({ ok: true, data: { entryId: "e" } });
  a.makeSeparateCopyAction.mockResolvedValue({ ok: true, data: { routineId: "x" } });
});

describe("PlanBoard layout", () => {
  it("shows the seven days Monday first, with rest days and counts", () => {
    setup([entry({ id: "a" }), entry({ id: "b", weekday: 1, position: 1 })]);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(day("Monday")).toHaveTextContent("2 routines");
    expect(day("Tuesday")).toHaveTextContent("Rest day");
    expect(namesIn("Monday")).toEqual(["Routine a", "Routine b"]);
  });

  it("summarises the week in one chip per figure", () => {
    setup([entry({ id: "a", exerciseCount: 5 }), entry({ id: "b", weekday: 4, exerciseCount: 2 })]);
    expect(screen.getByText("2 routines a week")).toBeInTheDocument();
    expect(screen.getByText("7 exercises in total")).toBeInTheDocument();
    expect(screen.getByText("2 training days")).toBeInTheDocument();
  });

  it("never scrolls sideways: no overflow-x anywhere on the board", () => {
    const { container } = setup([entry({ id: "a" })]);
    expect(container.querySelector('[class*="overflow-x"]')).toBeNull();
  });

  it("lays the days out as rows that wrap their cards", () => {
    setup([entry({ id: "a" })]);
    const cards = within(day("Monday")).getByRole("list");
    expect(cards.className).toContain("auto-fill");
  });

  it("gives a rest day one dashed add button instead of the plus", async () => {
    const user = userEvent.setup();
    setup([entry({ id: "a" })]);
    const rest = within(day("Tuesday")).getByRole("button", { name: "Add routine to Tuesday" });
    expect(rest).toHaveTextContent("Add routine");
    expect(within(day("Tuesday")).getAllByRole("button", { name: /^Add routine to/ })).toHaveLength(
      1,
    );
    // A day with routines keeps the compact plus.
    const plus = within(day("Monday")).getByRole("button", { name: "Add routine to Monday" });
    expect(plus).not.toHaveTextContent("Add routine");
    await user.click(rest);
    expect(await screen.findByRole("menuitem", { name: "New routine" })).toBeVisible();
  });

  it("links a routine to its editor with a way back to the plan", () => {
    setup([entry({ id: "a" })]);
    expect(screen.getByRole("link", { name: "Routine a" })).toHaveAttribute(
      "href",
      `/routines/r-a?plan=${PLAN}`,
    );
  });

  it("flags a routine used more than once, and a routine that is not active", () => {
    setup([
      entry({ id: "a", routineEntryCount: 3 }),
      entry({ id: "b", weekday: 2, routineStatus: "draft" }),
      entry({ id: "c", weekday: 3, label: "Evening", exerciseCount: 0 }),
    ]);
    expect(within(day("Monday")).getByText("Shared ×3")).toBeInTheDocument();
    expect(within(day("Tuesday")).getByText("Draft")).toBeInTheDocument();
    expect(within(day("Wednesday")).getByText("Evening")).toBeInTheDocument();
    expect(within(day("Wednesday")).getByText("No exercises yet")).toBeInTheDocument();
  });
});

describe("entry menu", () => {
  it("moves up and down within the day, showing it at once", async () => {
    const user = userEvent.setup();
    let release!: (value: unknown) => void;
    a.moveEntryAction.mockReturnValue(new Promise((resolve) => (release = resolve)));
    setup([entry({ id: "a" }), entry({ id: "b", position: 1 })]);

    await user.click(menuFor("Routine b"));
    await user.click(await screen.findByRole("menuitem", { name: "Move up" }));
    expect(a.moveEntryAction).toHaveBeenCalledWith({
      planId: PLAN,
      entryId: "b",
      weekday: 1,
      index: 0,
    });
    await waitFor(() => expect(namesIn("Monday")).toEqual(["Routine b", "Routine a"]));
    release({ ok: true, data: {} });
    await waitFor(() => expect(namesIn("Monday")).toEqual(["Routine a", "Routine b"]));

    await user.click(menuFor("Routine a"));
    await user.click(await screen.findByRole("menuitem", { name: "Move down" }));
    expect(a.moveEntryAction).toHaveBeenLastCalledWith({
      planId: PLAN,
      entryId: "a",
      weekday: 1,
      index: 1,
    });
  });

  it("disables moving past either end of the day", async () => {
    const user = userEvent.setup();
    setup([entry({ id: "a" }), entry({ id: "b", position: 1 })]);
    await user.click(menuFor("Routine a"));
    expect(await screen.findByRole("menuitem", { name: "Move up" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.keyboard("{Escape}");
    await user.click(menuFor("Routine b"));
    expect(await screen.findByRole("menuitem", { name: "Move down" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("moves to another day at the end of it", async () => {
    const user = userEvent.setup();
    // Hold the action open: the optimistic state only lasts while the transition is pending,
    // and these props never change (no server refresh), so it reverts once the action settles.
    const settle = hold(a.moveEntryAction);
    setup([entry({ id: "a" })]);
    await user.click(menuFor("Routine a"));
    await chooseFromSubmenu(user, "Move to…", "Friday");
    expect(a.moveEntryAction).toHaveBeenCalledWith({
      planId: PLAN,
      entryId: "a",
      weekday: 5,
      index: 6,
    });
    await waitFor(() => expect(namesIn("Friday")).toEqual(["Routine a"]));
    await settle();
  });

  it("copies to another day", async () => {
    const user = userEvent.setup();
    setup([entry({ id: "a" })]);
    await user.click(menuFor("Routine a"));
    await chooseFromSubmenu(user, "Copy to…", "Wednesday");
    expect(a.copyEntryAction).toHaveBeenCalledWith({ planId: PLAN, entryId: "a", weekday: 3 });
  });

  it("disables full days as targets", async () => {
    const user = userEvent.setup();
    const full = Array.from({ length: 6 }, (_, i) =>
      entry({ id: `f${i}`, weekday: 3, position: i }),
    );
    setup([entry({ id: "a" }), ...full]);
    await user.click(menuFor("Routine a"));
    const trigger = await screen.findByRole("menuitem", { name: "Move to…" });
    trigger.focus();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("menuitem", { name: "Wednesday · Full" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    // Moving to the day it is already on makes no sense either.
    expect(screen.getByRole("menuitem", { name: "Monday" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("edits the label, saving blank as no label", async () => {
    const user = userEvent.setup();
    setup([entry({ id: "a", label: "Morning" })]);
    await user.click(menuFor("Routine a"));
    await user.click(await screen.findByRole("menuitem", { name: "Edit label…" }));
    const dialog = await screen.findByRole("dialog", { name: "Label for Routine a" });
    const input = within(dialog).getByLabelText("Label");
    expect(input).toHaveValue("Morning");
    expect(input).toHaveAttribute("maxlength", "40");
    await user.clear(input);
    await user.type(input, "  Evening ");
    await user.click(within(dialog).getByRole("button", { name: "Save label" }));
    expect(a.setEntryLabelAction).toHaveBeenCalledWith({
      planId: PLAN,
      entryId: "a",
      label: "Evening",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(menuFor("Routine a"));
    await user.click(await screen.findByRole("menuitem", { name: "Edit label…" }));
    await user.click(await screen.findByRole("button", { name: "Clear" }));
    expect(a.setEntryLabelAction).toHaveBeenLastCalledWith({
      planId: PLAN,
      entryId: "a",
      label: null,
    });
  });

  it("offers a separate copy only when there is something to diverge from", async () => {
    const user = userEvent.setup();
    setup([
      entry({ id: "a", routineIsStandalone: false, routineEntryCount: 1 }),
      entry({ id: "b", weekday: 2, routineIsStandalone: true, routineEntryCount: 1 }),
      entry({ id: "c", weekday: 3, routineIsStandalone: false, routineEntryCount: 2 }),
    ]);
    await user.click(menuFor("Routine a"));
    await screen.findByRole("menuitem", { name: "Open routine" });
    expect(
      screen.queryByRole("menuitem", { name: "Make a separate copy" }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    for (const name of ["Routine b", "Routine c"]) {
      await user.click(menuFor(name));
      expect(await screen.findByRole("menuitem", { name: "Make a separate copy" })).toBeVisible();
      await user.keyboard("{Escape}");
    }
  });

  it("makes a separate copy", async () => {
    const user = userEvent.setup();
    setup([entry({ id: "a", routineEntryCount: 2 })]);
    await user.click(menuFor("Routine a"));
    await user.click(await screen.findByRole("menuitem", { name: "Make a separate copy" }));
    expect(a.makeSeparateCopyAction).toHaveBeenCalledWith({ planId: PLAN, entryId: "a" });
  });

  it("opens the routine from the menu", async () => {
    const user = userEvent.setup();
    setup([entry({ id: "a" })]);
    await user.click(menuFor("Routine a"));
    expect(await screen.findByRole("menuitem", { name: "Open routine" })).toHaveAttribute(
      "href",
      `/routines/r-a?plan=${PLAN}`,
    );
  });
});

describe("removing an entry", () => {
  it("removes at once when the routine is standalone or used elsewhere", async () => {
    const user = userEvent.setup();
    setup([
      entry({ id: "a", routineIsStandalone: true }),
      entry({ id: "b", weekday: 2, routineIsStandalone: false, routineEntryCount: 2 }),
    ]);
    await user.click(menuFor("Routine a"));
    await user.click(await screen.findByRole("menuitem", { name: "Remove from plan" }));
    expect(a.removeEntryAction).toHaveBeenCalledWith({
      planId: PLAN,
      entryId: "a",
      deleteRoutine: false,
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.click(menuFor("Routine b"));
    await user.click(await screen.findByRole("menuitem", { name: "Remove from plan" }));
    expect(a.removeEntryAction).toHaveBeenLastCalledWith({
      planId: PLAN,
      entryId: "b",
      deleteRoutine: false,
    });
  });

  it("asks about deleting the routine when it was the last use of a plan-only routine", async () => {
    const user = userEvent.setup();
    // Keep the action pending so the optimistic removal stays visible (props never change).
    const settle = hold(a.removeEntryAction);
    setup([entry({ id: "a", routineIsStandalone: false, routineEntryCount: 1 })]);
    await user.click(menuFor("Routine a"));
    await user.click(await screen.findByRole("menuitem", { name: "Remove from plan" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Remove “Routine a” from the plan?");
    expect(within(dialog).getByLabelText("Also delete the routine")).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(a.removeEntryAction).toHaveBeenCalledWith({
      planId: PLAN,
      entryId: "a",
      deleteRoutine: true,
    });
    await waitFor(() => expect(namesIn("Monday")).toEqual([]));
    await settle();
  });

  it("keeps the routine when the box is unticked, and starts ticked again next time", async () => {
    const user = userEvent.setup();
    setup([
      entry({ id: "a", routineIsStandalone: false }),
      entry({ id: "b", weekday: 2, routineIsStandalone: false }),
    ]);
    await user.click(menuFor("Routine a"));
    await user.click(await screen.findByRole("menuitem", { name: "Remove from plan" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByLabelText("Also delete the routine"));
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(a.removeEntryAction).toHaveBeenCalledWith({
      planId: PLAN,
      entryId: "a",
      deleteRoutine: false,
    });

    await user.click(menuFor("Routine b"));
    await user.click(await screen.findByRole("menuitem", { name: "Remove from plan" }));
    expect(
      within(await screen.findByRole("alertdialog")).getByLabelText("Also delete the routine"),
    ).toBeChecked();
  });

  it("cancelling does nothing", async () => {
    const user = userEvent.setup();
    setup([entry({ id: "a", routineIsStandalone: false })]);
    await user.click(menuFor("Routine a"));
    await user.click(await screen.findByRole("menuitem", { name: "Remove from plan" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }),
    );
    expect(a.removeEntryAction).not.toHaveBeenCalled();
    expect(namesIn("Monday")).toEqual(["Routine a"]);
  });
});

describe("adding a routine", () => {
  const openExisting = async (user: ReturnType<typeof userEvent.setup>, weekday = "Monday") => {
    await user.click(screen.getByRole("button", { name: `Add routine to ${weekday}` }));
    await user.click(await screen.findByRole("menuitem", { name: "Existing routine…" }));
    return screen.findByRole("dialog", { name: `Add an existing routine to ${weekday}` });
  };

  it("adds an existing routine with a label; the standalone flag is sent only when changed", async () => {
    const user = userEvent.setup();
    setup();
    const dialog = await openExisting(user, "Thursday");
    expect(within(dialog).getByRole("button", { name: "Add to plan" })).toBeDisabled();
    await chooseOption(
      user,
      within(dialog).getByRole("combobox", { name: "Routine" }),
      /^Knee rehab/,
    );
    expect(within(dialog).getByLabelText("Also show on its own")).toBeChecked();
    await user.type(within(dialog).getByLabelText("Label"), "Morning");
    await user.click(within(dialog).getByRole("button", { name: "Add to plan" }));
    expect(a.addEntryAction).toHaveBeenCalledWith({
      planId: PLAN,
      weekday: 4,
      routineId: "r1",
      label: "Morning",
    });
  });

  it("sends standalone: false when 'Also show on its own' is unticked", async () => {
    const user = userEvent.setup();
    setup();
    const dialog = await openExisting(user);
    await chooseOption(
      user,
      within(dialog).getByRole("combobox", { name: "Routine" }),
      /^Knee rehab/,
    );
    await user.click(within(dialog).getByLabelText("Also show on its own"));
    await user.click(within(dialog).getByRole("button", { name: "Add to plan" }));
    expect(a.addEntryAction).toHaveBeenCalledWith({
      planId: PLAN,
      weekday: 1,
      routineId: "r1",
      label: null,
      standalone: false,
    });
  });

  it("starts from the routine's own flag (a plan-only routine starts unticked)", async () => {
    const user = userEvent.setup();
    setup();
    const dialog = await openExisting(user);
    await chooseOption(
      user,
      within(dialog).getByRole("combobox", { name: "Routine" }),
      /^Board only/,
    );
    expect(within(dialog).getByLabelText("Also show on its own")).not.toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Add to plan" }));
    expect(a.addEntryAction.mock.calls[0][0]).not.toHaveProperty("standalone");
  });

  it("says so when the customer has no routines yet", async () => {
    const user = userEvent.setup();
    setup([], { routines: [] });
    const dialog = await openExisting(user);
    expect(dialog).toHaveTextContent("This customer has no routines to add yet.");
  });

  it("disables adding to a full day", () => {
    const full = Array.from({ length: 6 }, (_, i) => entry({ id: `f${i}`, position: i }));
    setup(full);
    expect(screen.getByRole("button", { name: "Add routine to Monday" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add routine to Tuesday" })).toBeEnabled();
  });

  it("creates a routine for the day at once, with a default name", async () => {
    const user = userEvent.setup();
    a.addNewRoutineEntryAction.mockResolvedValue({ status: "idle" });
    setup();
    await user.click(screen.getByRole("button", { name: "Add routine to Friday" }));
    await user.click(await screen.findByRole("menuitem", { name: "New routine" }));
    await waitFor(() => expect(a.addNewRoutineEntryAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const data = (a.addNewRoutineEntryAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(data.get("planId")).toBe(PLAN);
    expect(data.get("weekday")).toBe("5");
    expect(data.get("name")).toBe("New routine");
  });

  it("says why the day's new routine was not created", async () => {
    const user = userEvent.setup();
    a.addNewRoutineEntryAction.mockResolvedValue({
      status: "error",
      fieldErrors: {},
      formError: "dayFull",
    });
    setup();
    await user.click(screen.getByRole("button", { name: "Add routine to Friday" }));
    await user.click(await screen.findByRole("menuitem", { name: "New routine" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A day holds at most 6 routines.");
  });
});

describe("day notes", () => {
  it("saves a note for the day and shows it in the column", async () => {
    const user = userEvent.setup();
    const release = hold(a.setDayNotesAction);
    setup();
    await user.click(screen.getByRole("button", { name: "Edit note for Wednesday" }));
    await user.type(await screen.findByRole("textbox"), "Easy day");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(a.setDayNotesAction).toHaveBeenCalledWith({
      planId: PLAN,
      weekday: 3,
      notes: "Easy day",
    });
    expect(await within(day("Wednesday")).findByText("Easy day")).toBeInTheDocument();
    await release();
  });

  it("closes without calling the action when Save changes nothing", async () => {
    const user = userEvent.setup();
    setup([], { dayNotes: { 2: "Mobility only" } });
    await user.click(screen.getByRole("button", { name: "Edit note for Tuesday" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    expect(a.setDayNotesAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Edit note for Monday" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    expect(a.setDayNotesAction).not.toHaveBeenCalled();
  });

  it("shows the saved notes and removes one", async () => {
    const user = userEvent.setup();
    setup([], { dayNotes: { 2: "Mobility only" } });
    expect(within(day("Tuesday")).getByText("Mobility only")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit note for Tuesday" }));
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(a.setDayNotesAction).toHaveBeenCalledWith({ planId: PLAN, weekday: 2, notes: "" });
  });
});

describe("errors", () => {
  it("shows why the server refused and falls back to the saved board", async () => {
    const user = userEvent.setup();
    a.moveEntryAction.mockResolvedValue({ ok: false, error: "dayFull" });
    setup([entry({ id: "a" })]);
    await user.click(menuFor("Routine a"));
    await chooseFromSubmenu(user, "Move to…", "Tuesday");
    expect(await screen.findByRole("alert")).toHaveTextContent("A day holds at most 6 routines.");
    await waitFor(() => expect(namesIn("Monday")).toEqual(["Routine a"]));
    expect(namesIn("Tuesday")).toEqual([]);
  });

  it("shows a generic message when the action throws, and clears it on the next action", async () => {
    const user = userEvent.setup();
    a.setEntryLabelAction.mockRejectedValueOnce(new Error("network"));
    setup([entry({ id: "a" })]);
    await user.click(menuFor("Routine a"));
    await user.click(await screen.findByRole("menuitem", { name: "Edit label…" }));
    await user.type(await screen.findByLabelText("Label"), "x");
    await user.click(screen.getByRole("button", { name: "Save label" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");

    await user.click(menuFor("Routine a"));
    await user.click(await screen.findByRole("menuitem", { name: "Edit label…" }));
    await user.type(await screen.findByLabelText("Label"), "y");
    await user.click(screen.getByRole("button", { name: "Save label" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
