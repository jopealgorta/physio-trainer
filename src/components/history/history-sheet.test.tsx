import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanSnapshot, RoutineSnapshot } from "@/lib/history/snapshot";
import type { VersionMeta } from "@/server/history/schemas";
import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { HistorySheet } from "./history-sheet";

const a = vi.hoisted(() => ({
  listVersionsAction: vi.fn(),
  getSnapshotsAction: vi.fn(),
  restoreVersionAction: vi.fn(),
}));
vi.mock("@/server/history/actions", () => a);
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const ID = "00000000-0000-4000-8000-0000000000aa";

const item = (id: string, name: string, position: number, reps: number) => ({
  exercise: { id, name, instructions: null },
  position,
  prescription: {
    groupKey: null,
    holdSeconds: null,
    restSeconds: null,
    side: null,
    notes: null,
    sets: [{ reps, repsMax: null, durationSeconds: null, load: null }],
  },
});

const routine = (items: RoutineSnapshot["items"]): RoutineSnapshot => ({
  schema: 1,
  routine: {
    name: "Knee rehab",
    notes: null,
    status: "active",
    caseId: null,
    sessionsPerWeek: 3,
    sessionsPerDay: null,
    phaseLabel: null,
    startsOn: null,
    endsOn: null,
  },
  groups: [],
  items,
});

const ROUTINE_SNAPSHOTS: Record<number, RoutineSnapshot> = {
  1: routine([item("squat", "Squat", 0, 12)]),
  2: routine([item("squat", "Squat", 0, 10)]),
  3: routine([item("squat", "Squat", 0, 10), item("lunge", "Lunge", 1, 8)]),
};

const VERSIONS: VersionMeta[] = [
  {
    version: 3,
    kind: "edited",
    restoredFrom: null,
    summary: { added: 1, removed: 0, moved: 0, changed: 0, fields: {}, header: [] },
    at: "2026-03-03T10:00:00.000Z",
  },
  {
    version: 2,
    kind: "edited",
    restoredFrom: null,
    summary: { added: 0, removed: 0, moved: 0, changed: 1, fields: { reps: 1 }, header: [] },
    at: "2026-03-02T10:00:00.000Z",
  },
  {
    version: 1,
    kind: "created",
    restoredFrom: null,
    summary: null,
    at: "2026-03-01T09:30:00.000Z",
  },
];

function snapshotsFrom(source: Record<number, RoutineSnapshot | PlanSnapshot>) {
  return async ({ versions }: { versions: number[] }) => ({
    ok: true,
    data: Object.fromEntries(versions.map((version) => [version, source[version]])),
  });
}

function setup(props: Partial<React.ComponentProps<typeof HistorySheet>> = {}) {
  const onRestored = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <HistorySheet kind="routine" id={ID} onRestored={onRestored} {...props} />
    </NextIntlClientProvider>,
  );
  return { user: userEvent.setup(), onRestored };
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "History" }));
  const sheet = await screen.findByRole("dialog", { name: "Version history" });
  await within(sheet).findAllByRole("listitem");
  return sheet;
}

beforeEach(() => {
  vi.clearAllMocks();
  a.listVersionsAction.mockResolvedValue({ ok: true, data: VERSIONS });
  a.getSnapshotsAction.mockImplementation(snapshotsFrom(ROUTINE_SNAPSHOTS));
});

describe("HistorySheet", () => {
  it("lists the versions newest first and marks the current one", async () => {
    const { user } = setup();
    const sheet = await open(user);

    expect(a.listVersionsAction).toHaveBeenCalledWith({ kind: "routine", id: ID });
    const rows = within(sheet).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Current");
    expect(rows[0]).toHaveTextContent("+1 exercise");
    expect(rows[0]).toHaveTextContent("Mar 3, 2026");
    expect(rows[1]).toHaveTextContent("Reps changed on 1");
    expect(rows[1]).not.toHaveTextContent("Current");
    expect(rows[2]).toHaveTextContent("Created");
  });

  it("shows a restored version's source", async () => {
    a.listVersionsAction.mockResolvedValue({
      ok: true,
      data: [{ ...VERSIONS[0], version: 4, kind: "restored", restoredFrom: 1 }, ...VERSIONS],
    });
    const { user } = setup();
    const sheet = await open(user);
    expect(within(sheet).getAllByRole("listitem")[0]).toHaveTextContent(
      "Restored from Mar 1, 2026",
    );
  });

  it("diffs a version against the current one, then against the chosen one", async () => {
    const { user } = setup();
    const sheet = await open(user);

    await user.click(within(sheet).getByRole("button", { name: /Created/ }));
    expect(await within(sheet).findByText("Set 1 · Reps 12 → 10")).toBeInTheDocument();
    expect(within(sheet).getByText("Lunge")).toBeInTheDocument();
    expect(a.getSnapshotsAction).toHaveBeenLastCalledWith({
      kind: "routine",
      id: ID,
      versions: [1, 3],
    });

    await chooseOption(
      user,
      within(sheet).getByRole("combobox", { name: "Compare with" }),
      /Mar 2, 2026/,
    );
    await waitFor(() =>
      expect(a.getSnapshotsAction).toHaveBeenLastCalledWith({
        kind: "routine",
        id: ID,
        versions: [1, 2],
      }),
    );
    await waitFor(() => expect(within(sheet).queryByText("Lunge")).not.toBeInTheDocument());
    expect(within(sheet).getByText("Set 1 · Reps 12 → 10")).toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "Back" }));
    expect(within(sheet).getAllByRole("listitem")).toHaveLength(3);
  });

  it("does not offer to restore the current version", async () => {
    const { user } = setup();
    const sheet = await open(user);
    await user.click(within(sheet).getByRole("button", { name: /Current/ }));
    expect(await within(sheet).findByText("Lunge")).toBeInTheDocument();
    expect(
      within(sheet).queryByRole("button", { name: "Restore this version" }),
    ).not.toBeInTheDocument();
  });

  it("restores a version after confirming and reports it", async () => {
    a.restoreVersionAction.mockResolvedValue({ ok: true, data: { version: 4, dropped: 1 } });
    const { user, onRestored } = setup();
    const sheet = await open(user);
    await user.click(within(sheet).getByRole("button", { name: /Reps changed/ }));
    await within(sheet).findByText("Lunge");

    await user.click(within(sheet).getByRole("button", { name: "Restore this version" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Restore this version?" });
    expect(confirm).not.toHaveTextContent("unsaved");
    await user.click(within(confirm).getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    expect(a.restoreVersionAction).toHaveBeenCalledWith({ kind: "routine", id: ID, version: 2 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Version restored. 1 left out (no longer available).",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes the page when no onRestored is given", async () => {
    a.restoreVersionAction.mockResolvedValue({ ok: true, data: { version: 4, dropped: 0 } });
    const { user } = setup({ onRestored: undefined });
    const sheet = await open(user);
    await user.click(within(sheet).getByRole("button", { name: /Reps changed/ }));
    await user.click(within(sheet).getByRole("button", { name: "Restore this version" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByRole("status")).toHaveTextContent(/^Version restored\.$/);
  });

  it("warns that unsaved changes are discarded", async () => {
    const { user } = setup({ dirty: true });
    const sheet = await open(user);
    await user.click(within(sheet).getByRole("button", { name: /Created/ }));
    await user.click(within(sheet).getByRole("button", { name: "Restore this version" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Your unsaved changes will be discarded.");
  });

  it("explains a refused restore", async () => {
    a.restoreVersionAction.mockResolvedValue({ ok: false, error: "needsItems" });
    const { user, onRestored } = setup();
    const sheet = await open(user);
    await user.click(within(sheet).getByRole("button", { name: /Created/ }));
    await user.click(within(sheet).getByRole("button", { name: "Restore this version" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Restore" }),
    );

    expect(
      await within(sheet).findByText(
        "An active routine needs at least one exercise, and this version has none.",
      ),
    ).toBeInTheDocument();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("says when the history cannot be loaded", async () => {
    a.listVersionsAction.mockResolvedValue({ ok: false, error: "notFound" });
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByText("The history could not be loaded.")).toBeInTheDocument();
  });

  it("groups plan entries by weekday", async () => {
    const plan = (entries: PlanSnapshot["entries"]): PlanSnapshot => ({
      schema: 1,
      plan: {
        name: "Week",
        notes: null,
        status: "draft",
        caseId: null,
        phaseLabel: null,
        startsOn: null,
        endsOn: null,
      },
      entries,
    });
    const entry = (id: string, weekday: number, name: string) => ({
      id,
      weekday,
      position: 0,
      label: null,
      routine: { id: `r-${id}`, name, version: 1 },
    });
    a.listVersionsAction.mockResolvedValue({ ok: true, data: VERSIONS.slice(1) });
    a.getSnapshotsAction.mockImplementation(
      snapshotsFrom({
        1: plan([entry("e1", 1, "Mobility")]),
        2: plan([entry("e1", 1, "Mobility"), entry("e2", 3, "Strength")]),
      }),
    );
    const { user } = setup({ kind: "plan" });
    const sheet = await open(user);
    await user.click(within(sheet).getByRole("button", { name: /Created/ }));

    const wednesday = await within(sheet).findByRole("group", { name: "Wednesday" });
    expect(wednesday).toHaveTextContent("Strength");
    expect(within(sheet).queryByRole("group", { name: "Monday" })).not.toBeInTheDocument();
  });
});
