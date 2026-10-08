import { DndContext } from "@dnd-kit/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
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

const onChange = vi.fn<(next: (blocks: EditorBlock[]) => EditorBlock[]) => void>();
const onDuplicate = vi.fn<(itemKey: string) => void>();
const onMoveTo = vi.fn<(blockKey: string, sectionKey: string) => void>();
let shown: EditorBlock[] = [];

/** What the section's blocks would be after the n-th change. */
const applied = (call = 0, from: EditorBlock[] = shown): EditorBlock[] =>
  onChange.mock.calls[call][0](from);

type Options = {
  invalid?: ReadonlySet<string>;
  canAddItem?: boolean;
  targets?: { key: string; name: string }[];
  routineEmpty?: boolean;
};

/** Holds the expanded set like the editor does; the section list provides the drag context. */
function Harness({
  blocks,
  invalid = new Set(),
  canAddItem = true,
  targets = [],
  routineEmpty = false,
}: Options & { blocks: EditorBlock[] }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  return (
    <BlockList
      sectionKey="sec-1"
      blocks={blocks}
      onChange={onChange}
      newKey={testKey}
      expanded={expanded}
      invalid={invalid}
      canAddItem={canAddItem}
      targets={targets}
      onMoveTo={onMoveTo}
      onDuplicate={onDuplicate}
      routineEmpty={routineEmpty}
      onToggle={(key) =>
        setExpanded((previous) => {
          const next = new Set(previous);
          if (!next.delete(key)) next.add(key);
          return next;
        })
      }
    />
  );
}

function setup(blocks: EditorBlock[], options: Options = {}) {
  shown = blocks;
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <DndContext>
        <Harness blocks={blocks} {...options} />
      </DndContext>
    </NextIntlClientProvider>,
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  const row = screen.getByText(name).closest("[data-testid='item-row']") as HTMLElement;
  await user.click(within(row).getByRole("button", { name: "Exercise options" }));
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
  onChange.mockReset();
  onDuplicate.mockReset();
  onMoveTo.mockReset();
});

describe("BlockList", () => {
  it("shows the routine's empty state in an empty routine", () => {
    setup([], { routineEmpty: true });
    expect(screen.getByText("No exercises yet. Pick some from the list.")).toBeInTheDocument();
  });

  it("shows a drop zone in an empty section of a routine with exercises", () => {
    setup([]);
    expect(screen.getByText("Drag exercises here")).toBeInTheDocument();
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

  it("marks items with invalid sets", () => {
    setup([single("a", { exerciseName: "Squat" }), single("b")], { invalid: new Set(["a"]) });
    expect(screen.getAllByText("Check sets")).toHaveLength(1);
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
    const update = applied();
    expect(update).toEqual(removeItem(blocks, "b"));
    expect(update).toHaveLength(1);
    expect(update[0].kind).toBe("single");
  });

  it("duplicates an exercise", async () => {
    const user = userEvent.setup();
    setup([single("a", { exerciseName: "Squat" })]);
    await openMenu(user, "Squat");
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    expect(onDuplicate).toHaveBeenCalledWith("a");
  });

  it("disables Duplicate when the routine is full", async () => {
    const user = userEvent.setup();
    setup([single("a", { exerciseName: "Squat" })], { canAddItem: false });
    await openMenu(user, "Squat");
    expect(await screen.findByRole("menuitem", { name: "Duplicate" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("moves a single exercise to another section from its menu", async () => {
    const user = userEvent.setup();
    setup([single("a", { exerciseName: "Squat" })], {
      targets: [{ key: "sec-2", name: "Cool-down" }],
    });
    await openMenu(user, "Squat");
    await moveToSection(user, "Cool-down");
    expect(onMoveTo).toHaveBeenCalledWith("a", "sec-2");
  });

  it("moves a whole superset from its card, not from a member's menu", async () => {
    const user = userEvent.setup();
    setup([group("g", [item("b", { exerciseName: "Lunge" }), item("c")])], {
      targets: [{ key: "sec-2", name: "Cool-down" }],
    });
    await openMenu(user, "Lunge");
    await screen.findByRole("menuitem", { name: "Ungroup" });
    expect(screen.queryByRole("menuitem", { name: "Move to section" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    const card = screen.getByRole("group", { name: "Superset" });
    await user.click(within(card).getByRole("button", { name: "Move to section" }));
    await user.click(await screen.findByRole("menuitem", { name: "Cool-down" }));
    expect(onMoveTo).toHaveBeenCalledWith("g", "sec-2");
  });

  it("offers no Move to section with a single section", () => {
    setup([group("g", [item("b"), item("c")])]);
    const card = screen.getByRole("group", { name: "Superset" });
    expect(within(card).queryByRole("button", { name: "Move to section" })).not.toBeInTheDocument();
  });

  it("groups a single exercise with the next one", async () => {
    const user = userEvent.setup();
    const blocks = [single("a", { exerciseName: "Squat" }), single("b")];
    setup(blocks);
    await openMenu(user, "Squat");
    await user.click(await screen.findByRole("menuitem", { name: "Group with next" }));
    const update = applied();
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
    expect(applied()).toEqual(groupWithNext(blocks, "g", () => "x"));
  });

  it("ungroups from the card", async () => {
    const user = userEvent.setup();
    const blocks = [group("g", [item("a"), item("b")], 30)];
    setup(blocks);
    const card = screen.getByRole("group", { name: "Superset" });
    await user.click(within(card).getByRole("button", { name: "Ungroup" }));
    expect(applied()).toEqual(ungroup(blocks, "g"));
  });

  it("edits the group's rest", async () => {
    const user = userEvent.setup();
    const blocks = [group("g", [item("a"), item("b")], null)];
    setup(blocks);
    await user.type(screen.getByLabelText("Rest after each round (s)"), "9");
    expect(applied(onChange.mock.calls.length - 1)).toEqual(updateGroupRest(blocks, "g", 9));
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
