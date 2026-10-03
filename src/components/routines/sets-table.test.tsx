import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { flatItems, type EditorBlock } from "@/lib/routine-editor";
import { group, item, set, single, testKey } from "@/test/routine-fixtures";

import messages from "../../../messages/en.json";
import { SetsTable } from "./sets-table";

type Update = (blocks: EditorBlock[]) => EditorBlock[];
const onChange = vi.fn<(update: Update) => void>();
let latest: EditorBlock[] = [];

/** Holds the blocks like the editor does, so typed values persist between keystrokes. */
function Harness({ initial, itemKey }: { initial: EditorBlock[]; itemKey: string }) {
  const [blocks, setBlocks] = useState(initial);
  const target = flatItems(blocks).find((candidate) => candidate.key === itemKey)!;
  return (
    <SetsTable
      blocks={blocks}
      item={target}
      grouped={blocks.some((block) => block.kind === "group")}
      onChange={(update) => {
        onChange(update);
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

const sets = () => flatItems(latest)[0].sets;

beforeEach(() => onChange.mockReset());

describe("SetsTable aerobic", () => {
  const aerobic = (sets = [set("s1")]) => [single("a", { exerciseKind: "aerobic", sets })];

  it("shows duration, distance and intensity inputs and no reps, max or load", () => {
    setup(aerobic(), "a");
    expect(screen.getByRole("textbox", { name: "Set 1: Duration (min)" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Set 1: Distance (km)" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Set 1: Intensity" })).toBeInTheDocument();
    expect(screen.queryByText("Reps")).not.toBeInTheDocument();
    expect(screen.queryByText("Max reps")).not.toBeInTheDocument();
    expect(screen.queryByText("Load")).not.toBeInTheDocument();
  });

  it("parses a comma decimal distance into meters", async () => {
    const user = userEvent.setup();
    setup(aerobic(), "a");
    await user.type(screen.getByRole("textbox", { name: "Set 1: Distance (km)" }), "2,5");
    expect(sets()[0].distanceMeters).toBe(2500);
  });

  it("parses minutes and m:ss durations into seconds", async () => {
    const user = userEvent.setup();
    setup(aerobic(), "a");
    const duration = screen.getByRole("textbox", { name: "Set 1: Duration (min)" });
    await user.type(duration, "1:30");
    expect(sets()[0].durationSeconds).toBe(90);
    await user.clear(duration);
    await user.type(duration, "30");
    expect(sets()[0].durationSeconds).toBe(1800);
  });

  it("shows an error and keeps the last valid value for invalid text", async () => {
    const user = userEvent.setup();
    setup(aerobic([set("s1", { durationSeconds: 600 })]), "a");
    const duration = screen.getByRole("textbox", { name: "Set 1: Duration (min)" });
    expect(duration).toHaveValue("10");
    await user.type(duration, "x");
    expect(screen.getByText("Enter minutes from 1 to 240, like 30 or 1:30.")).toBeInTheDocument();
    expect(sets()[0].durationSeconds).toBe(600);
    await user.clear(duration);
    await user.type(duration, "0");
    expect(screen.getByText("Enter minutes from 1 to 240, like 30 or 1:30.")).toBeInTheDocument();
  });

  it("flags a bad distance and stores the intensity text", async () => {
    const user = userEvent.setup();
    setup(aerobic(), "a");
    await user.type(screen.getByRole("textbox", { name: "Set 1: Distance (km)" }), "abc");
    expect(screen.getByText("Enter a distance up to 200 km, like 5 or 2.5.")).toBeInTheDocument();
    expect(sets()[0].distanceMeters).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "Set 1: Intensity" }), "Zone 2");
    expect(sets()[0].intensity).toBe("Zone 2");
  });

  it("rejects out-of-range duration and distance without storing them", async () => {
    const user = userEvent.setup();
    setup(aerobic(), "a");
    await user.type(screen.getByRole("textbox", { name: "Set 1: Duration (min)" }), "500");
    expect(screen.getByText("Enter minutes from 1 to 240, like 30 or 1:30.")).toBeInTheDocument();
    expect(sets()[0].durationSeconds).toBe(3000); // last valid text, "50"
    await user.type(screen.getByRole("textbox", { name: "Set 1: Distance (km)" }), "300");
    expect(screen.getByText("Enter a distance up to 200 km, like 5 or 2.5.")).toBeInTheDocument();
    expect(sets()[0].distanceMeters).toBe(30000); // last valid text, "30"
  });

  it("keeps the strength columns for a strength item", () => {
    setup([single("a", { sets: [set("s1")] })], "a");
    expect(screen.getByText("Reps")).toBeInTheDocument();
    expect(screen.queryByText("Intensity")).not.toBeInTheDocument();
  });
});

describe("SetsTable", () => {
  it("renders one row per set", () => {
    setup(
      [
        single("a", {
          sets: [set("s1", { reps: 12 }), set("s2", { reps: 10 }), set("s3", { reps: 8 })],
        }),
      ],
      "a",
    );
    expect(screen.getAllByRole("row")).toHaveLength(1 + 3);
    expect(screen.getByRole("textbox", { name: "Set 2: Reps" })).toHaveValue("10");
  });

  it("stores a parsed number when typing reps", async () => {
    const user = userEvent.setup();
    setup([single("a", { sets: [set("s1")] })], "a");
    await user.type(screen.getByRole("textbox", { name: "Set 1: Reps" }), "12");
    expect(sets()[0].reps).toBe(12);
  });

  it("stores null when a field is cleared", async () => {
    const user = userEvent.setup();
    setup([single("a", { sets: [set("s1", { reps: 5 })] })], "a");
    await user.clear(screen.getByRole("textbox", { name: "Set 1: Reps" }));
    expect(sets()[0].reps).toBeNull();
  });

  it("stores the load text, capped at 40 characters, and blank as null", async () => {
    const user = userEvent.setup();
    setup([single("a", { sets: [set("s1")] })], "a");
    const load = screen.getByRole("textbox", { name: "Set 1: Load" });
    expect(load).toHaveAttribute("maxlength", "40");
    await user.type(load, "5 kg");
    expect(sets()[0].load).toBe("5 kg");
    await user.clear(load);
    expect(sets()[0].load).toBeNull();
  });

  it("Add set copies the previous values", async () => {
    const user = userEvent.setup();
    const blocks = [single("a", { sets: [set("s1", { reps: 12, load: "5 kg" })] })];
    setup(blocks, "a");
    await user.click(screen.getByRole("button", { name: "Add set" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(sets()).toHaveLength(2);
    expect(sets()[1]).toMatchObject({ reps: 12, load: "5 kg" });
    expect(screen.getAllByRole("row")).toHaveLength(1 + 2);
  });

  it("removes the chosen set", async () => {
    const user = userEvent.setup();
    setup([single("a", { sets: [set("s1", { reps: 1 }), set("s2", { reps: 2 })] })], "a");
    await user.click(screen.getByRole("button", { name: "Remove set 1" }));
    expect(sets().map((s) => s.key)).toEqual(["s2"]);
  });

  it("disables remove when a superset member has one set, and explains the sync", () => {
    setup(
      [group("g", [item("a", { sets: [set("a1"), set("a2")] }), item("b", { sets: [set("b1")] })])],
      "a",
    );
    expect(screen.getByRole("button", { name: "Remove set 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove set 2" })).toBeDisabled();
    expect(screen.getByText("Sets stay in sync across the superset.")).toBeInTheDocument();
  });

  it("disables Add set at 20 sets and says why", () => {
    const many = Array.from({ length: 20 }, (_, i) => set(`s${i}`));
    setup([single("a", { sets: many })], "a");
    expect(screen.getByRole("button", { name: "Add set" })).toBeDisabled();
    expect(screen.getByText("Up to 20 sets.")).toBeInTheDocument();
  });

  it("shows an error for invalid text while typing", async () => {
    const user = userEvent.setup();
    setup([single("a", { sets: [set("s1", { reps: 7 })] })], "a");
    const reps = screen.getByRole("textbox", { name: "Set 1: Reps" });
    await user.clear(reps);
    await user.type(reps, "abc");
    expect(await screen.findByText("Enter a whole number.")).toBeInTheDocument();
    expect(reps).toHaveValue("abc");
    expect(reps).toHaveAttribute("aria-invalid", "true");
  });

  it("discards invalid text on blur so the box shows the stored value", async () => {
    const user = userEvent.setup();
    setup([single("a", { sets: [set("s1")] })], "a");
    const reps = screen.getByRole("textbox", { name: "Set 1: Reps" });
    await user.type(reps, "1000");
    expect(await screen.findByText("Enter a number from 1 to 999.")).toBeInTheDocument();
    await user.tab();
    expect(screen.queryByText("Enter a number from 1 to 999.")).not.toBeInTheDocument();
    expect(reps).toHaveValue(String(sets()[0].reps ?? ""));
    expect(reps).not.toHaveAttribute("aria-invalid", "true");
  });

  it("flags a max that is not above reps", () => {
    setup([single("a", { sets: [set("s1", { reps: 10, repsMax: 8 })] })], "a");
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getByText("Must be more than reps.")).toBeInTheDocument();
  });

  it("stores a whitespace-only load as null but keeps spaces inside a load", async () => {
    const user = userEvent.setup();
    setup([single("a", { sets: [set("s1")] })], "a");
    const load = screen.getByRole("textbox", { name: "Set 1: Load" });
    await user.type(load, "   ");
    expect(sets()[0].load).toBeNull();
    await user.type(load, "5 kg");
    expect(sets()[0].load).toBe("5 kg");
  });
});
