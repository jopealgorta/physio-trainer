import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  groupWithNext,
  removeItem,
  ungroup,
  updateGroupRest,
  type EditorBlock,
} from "@/lib/routine-editor";
import { group, item, set, single, testKey } from "@/test/routine-fixtures";

import messages from "../../../messages/en.json";
import { BlockList } from "./block-list";

const onChange = vi.fn();

function setup(blocks: EditorBlock[]) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <BlockList blocks={blocks} onChange={onChange} newKey={testKey} />
    </NextIntlClientProvider>,
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  const row = screen.getByText(name).closest("[data-testid='item-row']") as HTMLElement;
  await user.click(within(row).getByRole("button", { name: "Exercise options" }));
}

beforeEach(() => onChange.mockReset());

describe("BlockList", () => {
  it("shows the empty state", () => {
    setup([]);
    expect(screen.getByText("No exercises yet. Pick some from the list.")).toBeInTheDocument();
  });

  it("renders single rows and a superset card with its members", () => {
    setup([
      single("a", {
        exerciseName: "Squat",
        restSeconds: 60,
        sets: [set("s1", { reps: 12 }), set("s2", { reps: 12 }), set("s3", { reps: 12 })],
      }),
      group("g", [item("b", { exerciseName: "Lunge" }), item("c", { exerciseName: "Plank" })], 45),
    ]);
    expect(screen.getByText("Squat")).toBeInTheDocument();
    expect(screen.getByText("3 × 12 · rest 60 s")).toBeInTheDocument();
    const card = screen.getByRole("group", { name: "Superset" });
    expect(within(card).getByText("Lunge")).toBeInTheDocument();
    expect(within(card).getByText("Plank")).toBeInTheDocument();
    expect(within(card).getByLabelText("Rest after each round (s)")).toHaveValue("45");
    expect(
      within(card).getByText("Alternates set by set: A1, B1, rest, A2, B2…"),
    ).toBeInTheDocument();
  });

  it("shows the no-prescription text when nothing is set", () => {
    setup([single("a", { exerciseName: "Squat", sets: [set("s1")] })]);
    expect(screen.getByText("No prescription set")).toBeInTheDocument();
  });

  it("badges archived exercises", () => {
    setup([single("a", { exerciseName: "Old", exerciseArchived: true }), single("b")]);
    expect(screen.getAllByText("Archived")).toHaveLength(1);
  });

  it("toggles the prescription editor with aria-expanded", async () => {
    const user = userEvent.setup();
    setup([single("a", { exerciseName: "Squat" })]);
    const toggle = screen.getByRole("button", { name: "Edit prescription" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Hold (s)" })).not.toBeInTheDocument();
    await user.click(toggle);
    const open = screen.getByRole("button", { name: "Hide prescription" });
    expect(open).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Hold (s)" })).toBeInTheDocument();
    await user.click(open);
    expect(screen.queryByRole("textbox", { name: "Hold (s)" })).not.toBeInTheDocument();
  });

  it("removing a member of a two-exercise superset dissolves the group", async () => {
    const user = userEvent.setup();
    const blocks = [group("g", [item("b", { exerciseName: "Lunge" }), item("c")], 45)];
    setup(blocks);
    await openMenu(user, "Lunge");
    await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
    const update = onChange.mock.calls[0][0] as EditorBlock[];
    expect(update).toEqual(removeItem(blocks, "b"));
    expect(update).toHaveLength(1);
    expect(update[0].kind).toBe("single");
  });

  it("duplicates an exercise", async () => {
    const user = userEvent.setup();
    const blocks = [single("a", { exerciseName: "Squat" })];
    setup(blocks);
    await openMenu(user, "Squat");
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    const update = onChange.mock.calls[0][0] as EditorBlock[];
    expect(update).toHaveLength(2);
    expect(update[1].kind === "single" && update[1].item.exerciseId).toBe("ex-a");
  });

  it("groups a single exercise with the next one", async () => {
    const user = userEvent.setup();
    const blocks = [single("a", { exerciseName: "Squat" }), single("b")];
    setup(blocks);
    await openMenu(user, "Squat");
    await user.click(await screen.findByRole("menuitem", { name: "Group with next" }));
    const update = onChange.mock.calls[0][0] as EditorBlock[];
    expect(update).toHaveLength(1);
    expect(update[0].kind).toBe("group");
    expect(groupWithNext(blocks, "a", () => "x")).toHaveLength(1);
  });

  it("disables Group with next on the last block", async () => {
    const user = userEvent.setup();
    setup([single("a"), single("b", { exerciseName: "Last" })]);
    await openMenu(user, "Last");
    expect(await screen.findByRole("menuitem", { name: "Group with next" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("disables Group with next when the result would exceed three exercises", () => {
    setup([group("g", [item("a"), item("b"), item("c")]), single("d")]);
    const card = screen.getByRole("group", { name: "Superset" });
    expect(within(card).getByRole("button", { name: "Group with next" })).toBeDisabled();
  });

  it("enables Group with next on a superset that can still grow", async () => {
    const user = userEvent.setup();
    const blocks = [group("g", [item("a"), item("b")]), single("d")];
    setup(blocks);
    const card = screen.getByRole("group", { name: "Superset" });
    await user.click(within(card).getByRole("button", { name: "Group with next" }));
    expect(onChange.mock.calls[0][0]).toEqual(groupWithNext(blocks, "g", () => "x"));
  });

  it("ungroups from the card", async () => {
    const user = userEvent.setup();
    const blocks = [group("g", [item("a"), item("b")], 30)];
    setup(blocks);
    const card = screen.getByRole("group", { name: "Superset" });
    await user.click(within(card).getByRole("button", { name: "Ungroup" }));
    expect(onChange.mock.calls[0][0]).toEqual(ungroup(blocks, "g"));
  });

  it("edits the group's rest", async () => {
    const user = userEvent.setup();
    const blocks = [group("g", [item("a"), item("b")], null)];
    setup(blocks);
    await user.type(screen.getByLabelText("Rest after each round (s)"), "9");
    expect(onChange).toHaveBeenLastCalledWith(updateGroupRest(blocks, "g", 9));
  });

  it("links to the exercise", async () => {
    const user = userEvent.setup();
    setup([single("a", { exerciseName: "Squat" })]);
    await openMenu(user, "Squat");
    expect(await screen.findByRole("menuitem", { name: "Open exercise" })).toHaveAttribute(
      "href",
      "/library/ex-a",
    );
  });
});
