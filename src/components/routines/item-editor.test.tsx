import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { flatItems, type EditorBlock } from "@/lib/routine-editor";
import { group, item, single, testKey } from "@/test/routine-fixtures";
import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { ItemEditor } from "./item-editor";

let latest: EditorBlock[] = [];

/** Holds the blocks like the editor does, so typed values persist between keystrokes. */
function Harness({ initial, itemKey }: { initial: EditorBlock[]; itemKey: string }) {
  const [blocks, setBlocks] = useState(initial);
  const target = flatItems(blocks).find((candidate) => candidate.key === itemKey)!;
  return (
    <ItemEditor
      blocks={blocks}
      item={target}
      grouped={blocks.some((block) => block.kind === "group")}
      onChange={(update) => {
        latest = update(blocks);
        setBlocks(latest);
      }}
      newKey={testKey}
    />
  );
}

function setup(blocks: EditorBlock[], itemKey: string) {
  latest = blocks;
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <Harness initial={blocks} itemKey={itemKey} />
    </NextIntlClientProvider>,
  );
}

const current = () => flatItems(latest)[0];

describe("ItemEditor", () => {
  it("shows hold, rest, side and notes for a single exercise", () => {
    setup([single("a")], "a");
    expect(screen.getByRole("textbox", { name: "Hold (s)" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Rest (s)" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Side" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
  });

  it("hides the rest field for a grouped exercise", () => {
    setup([group("g", [item("a"), item("b")])], "a");
    expect(screen.queryByRole("textbox", { name: "Rest (s)" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Hold (s)" })).toBeInTheDocument();
  });

  it("stores hold and rest seconds as numbers", async () => {
    const user = userEvent.setup();
    setup([single("a")], "a");
    await user.type(screen.getByRole("textbox", { name: "Hold (s)" }), "30");
    await user.type(screen.getByRole("textbox", { name: "Rest (s)" }), "45");
    expect(current().holdSeconds).toBe(30);
    expect(current().restSeconds).toBe(45);
  });

  it("flags an out-of-range rest while typing and discards it on blur", async () => {
    const user = userEvent.setup();
    setup([single("a", { restSeconds: 30 })], "a");
    const rest = screen.getByRole("textbox", { name: "Rest (s)" });
    await user.clear(rest);
    await user.type(rest, "99999");
    expect(await screen.findByText("Enter a number from 1 to 3,600.")).toBeInTheDocument();
    await user.tab();
    expect(screen.queryByText("Enter a number from 1 to 3,600.")).not.toBeInTheDocument();
    // The box shows exactly what is stored, so what is saved is what the user sees.
    expect(rest).toHaveValue(String(current().restSeconds ?? ""));
    expect(rest).not.toHaveAttribute("aria-invalid", "true");
  });

  it("picks a side with the select", async () => {
    const user = userEvent.setup();
    setup([single("a")], "a");
    await chooseOption(user, screen.getByRole("combobox", { name: "Side" }), "Left");
    expect(current().side).toBe("left");
  });

  it("clears the side through the Not set option", async () => {
    const user = userEvent.setup();
    setup([single("a", { side: "right" })], "a");
    await chooseOption(user, screen.getByRole("combobox", { name: "Side" }), "Not set");
    expect(current().side).toBeNull();
  });

  it("limits notes to 500 characters and stores blank as null", async () => {
    const user = userEvent.setup();
    setup([single("a", { notes: "hi" })], "a");
    const notes = screen.getByRole("textbox", { name: "Notes" });
    expect(notes).toHaveAttribute("maxlength", "500");
    await user.type(notes, "!");
    expect(current().notes).toBe("hi!");
    await user.clear(notes);
    expect(current().notes).toBeNull();
  });

  it("stores whitespace-only notes as null", async () => {
    const user = userEvent.setup();
    setup([single("a")], "a");
    await user.type(screen.getByRole("textbox", { name: "Notes" }), "   ");
    expect(current().notes).toBeNull();
  });
});
