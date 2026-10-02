import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CategoryNode } from "@/lib/category-tree";
import type { ExerciseSummary } from "@/server/library/queries";
import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";
import { ExercisePicker } from "./exercise-picker";

const { searchExercisesAction } = vi.hoisted(() => ({ searchExercisesAction: vi.fn() }));
vi.mock("@/server/routines/actions", () => ({ searchExercisesAction }));

const exercise = (id: string, name: string, over: Partial<ExerciseSummary> = {}) =>
  ({
    id,
    name,
    categoryId: null,
    bodyAreas: ["knee"],
    tags: [],
    archivedAt: null,
    cover: { videoId: "abcdefghijk", isShort: false },
    ...over,
  }) satisfies ExerciseSummary;

const SQUAT = exercise("e1", "Squat");
const LUNGE = exercise("e2", "Lunge", { cover: null });
const BRIDGE = exercise("e3", "Bridge", { bodyAreas: ["glute", "lower_back"] });

const leaf = { position: 0, activeCount: 1, totalCount: 1 };
const CATEGORIES: CategoryNode[] = [
  {
    id: "c1",
    name: "Strength",
    ...leaf,
    children: [{ id: "c2", name: "Legs", ...leaf }],
  },
];

const onPick = vi.fn();

function setup(props: Partial<ComponentProps<typeof ExercisePicker>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ExercisePicker
        categories={CATEGORIES}
        recent={[]}
        initial={[SQUAT, LUNGE]}
        disabledReason={null}
        onPick={onPick}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const fakeTimerUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const type = (value: string) =>
  fireEvent.change(screen.getByRole("searchbox", { name: "Search exercises" }), {
    target: { value },
  });
const advance = (ms = 250) => act(() => vi.advanceTimersByTimeAsync(ms));
const list = () => screen.getByTestId("picker-list");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  searchExercisesAction.mockReset();
  onPick.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("ExercisePicker", () => {
  it("marks exercises already in the routine, with a count from two", () => {
    setup({
      recent: [SQUAT],
      added: new Map([
        ["e1", 2],
        ["e2", 1],
      ]),
    });
    const squat = within(list()).getByRole("button", { name: "Squat" });
    expect(squat).toHaveAttribute("data-added", "true");
    expect(squat).toHaveAccessibleDescription("In the routine 2 times");
    expect(within(squat).getByText("×2")).toBeInTheDocument();
    // The recent section shows the same state.
    const recent = screen.getByRole("region", { name: "Recent" });
    expect(within(recent).getByRole("button", { name: "Squat" })).toHaveAccessibleDescription(
      "In the routine 2 times",
    );

    const lunge = within(list()).getByRole("button", { name: "Lunge" });
    expect(lunge).toHaveAccessibleDescription("In the routine");
    expect(within(lunge).queryByText(/×/)).not.toBeInTheDocument();
  });

  it("leaves exercises not in the routine unmarked", () => {
    setup();
    const squat = within(list()).getByRole("button", { name: "Squat" });
    expect(squat).not.toHaveAttribute("data-added");
    expect(squat).not.toHaveAccessibleDescription();
  });

  it("shows the recent section and the library while idle", () => {
    setup({ recent: [BRIDGE] });
    const recent = screen.getByRole("region", { name: "Recent" });
    expect(within(recent).getByRole("button", { name: "Bridge" })).toBeInTheDocument();
    expect(within(list()).getAllByRole("button").length).toBe(2);
    expect(screen.getByTestId("picker-count")).toHaveTextContent("2 exercises");
    expect(searchExercisesAction).not.toHaveBeenCalled();
  });

  it("searches once after the debounce and hides recent", async () => {
    searchExercisesAction.mockResolvedValue([BRIDGE]);
    setup({ recent: [SQUAT] });
    type("b");
    type("br");
    await advance(200);
    expect(searchExercisesAction).not.toHaveBeenCalled();
    await advance(100);
    expect(searchExercisesAction).toHaveBeenCalledTimes(1);
    expect(searchExercisesAction).toHaveBeenCalledWith({
      q: "br",
      category: undefined,
      area: undefined,
    });
    expect(await within(list()).findByRole("button", { name: "Bridge" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Recent" })).not.toBeInTheDocument();
    expect(screen.getByTestId("picker-count")).toHaveTextContent("1 exercise");
  });

  it("filters by body area", async () => {
    searchExercisesAction.mockResolvedValue([BRIDGE]);
    setup();
    await chooseOption(
      fakeTimerUser(),
      screen.getByRole("combobox", { name: "Body area" }),
      "Glute",
    );
    await advance();
    expect(searchExercisesAction).toHaveBeenCalledWith({
      q: undefined,
      category: undefined,
      area: "glute",
    });
  });

  it("filters by category, including subcategories", async () => {
    searchExercisesAction.mockResolvedValue([]);
    setup();
    await chooseOption(
      fakeTimerUser(),
      screen.getByRole("combobox", { name: "Category" }),
      "Strength › Legs",
    );
    await advance();
    expect(searchExercisesAction).toHaveBeenCalledWith({
      q: undefined,
      category: "c2",
      area: undefined,
    });
    expect(await screen.findByText("No exercises match.")).toBeInTheDocument();
  });

  it("returns to the library without a request when the filters are cleared", async () => {
    searchExercisesAction.mockResolvedValue([BRIDGE]);
    setup();
    type("br");
    await advance();
    expect(await within(list()).findByRole("button", { name: "Bridge" })).toBeInTheDocument();
    type("");
    await advance();
    expect(searchExercisesAction).toHaveBeenCalledTimes(1);
    expect(within(list()).getByRole("button", { name: "Squat" })).toBeInTheDocument();
  });

  it("marks the list busy again when the same query is retyped after clearing the box", async () => {
    let resolveSecond!: (value: ExerciseSummary[]) => void;
    searchExercisesAction
      .mockResolvedValueOnce([BRIDGE])
      .mockReturnValueOnce(new Promise((r) => (resolveSecond = r)));
    setup();
    type("br");
    await advance();
    expect(await within(list()).findByRole("button", { name: "Bridge" })).toBeInTheDocument();
    type("");
    await advance();
    type("br");
    await advance();
    // The old "br" results must not pass for the new request's.
    expect(list()).toHaveAttribute("aria-busy", "true");
    await act(async () => resolveSecond([SQUAT]));
    expect(list()).toHaveAttribute("aria-busy", "false");
  });

  it("does not show an earlier failure when the same query is retyped", async () => {
    let resolveSecond!: (value: ExerciseSummary[]) => void;
    searchExercisesAction
      .mockRejectedValueOnce(new Error("boom"))
      .mockReturnValueOnce(new Promise((r) => (resolveSecond = r)));
    setup();
    type("br");
    await advance();
    expect(await screen.findByText("Couldn't search. Try again.")).toBeInTheDocument();
    type("");
    await advance();
    type("br");
    await advance();
    expect(screen.queryByText("Couldn't search. Try again.")).not.toBeInTheDocument();
    await act(async () => resolveSecond([BRIDGE]));
    expect(within(list()).getByRole("button", { name: "Bridge" })).toBeInTheDocument();
  });

  it("keeps results visible and marks the list busy while a search is in flight", async () => {
    let resolve!: (value: ExerciseSummary[]) => void;
    searchExercisesAction.mockReturnValue(new Promise((r) => (resolve = r)));
    setup();
    type("br");
    await advance();
    expect(list()).toHaveAttribute("aria-busy", "true");
    expect(within(list()).getByRole("button", { name: "Squat" })).toBeInTheDocument();
    await act(async () => resolve([BRIDGE]));
    expect(list()).toHaveAttribute("aria-busy", "false");
    expect(within(list()).getByRole("button", { name: "Bridge" })).toBeInTheDocument();
  });

  it("ignores a slow older response that arrives after a newer one", async () => {
    let resolveFirst!: (value: ExerciseSummary[]) => void;
    searchExercisesAction
      .mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce([BRIDGE]);
    setup();
    type("s");
    await advance();
    type("br");
    await advance();
    expect(await within(list()).findByRole("button", { name: "Bridge" })).toBeInTheDocument();
    await act(async () => resolveFirst([SQUAT]));
    expect(within(list()).getByRole("button", { name: "Bridge" })).toBeInTheDocument();
    expect(within(list()).queryByRole("button", { name: "Squat" })).not.toBeInTheDocument();
  });

  it("shows an error when the search fails", async () => {
    searchExercisesAction.mockRejectedValue(new Error("boom"));
    setup();
    type("br");
    await advance();
    expect(await screen.findByText("Couldn't search. Try again.")).toBeInTheDocument();
  });

  it("calls onPick with the exercise ref, announces it and stays usable", async () => {
    const user = fakeTimerUser();
    setup();
    await user.click(within(list()).getByRole("button", { name: "Squat" }));
    expect(onPick).toHaveBeenCalledWith({
      id: "e1",
      name: "Squat",
      archived: false,
      cover: { videoId: "abcdefghijk", isShort: false },
    });
    expect(screen.getByTestId("picker-announcer")).toHaveTextContent("Added Squat.");
    await user.click(within(list()).getByRole("button", { name: "Lunge" }));
    expect(onPick).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("picker-announcer")).toHaveTextContent("Added Lunge.");
  });

  it("disables the buttons and explains why when the routine is full", async () => {
    setup({ recent: [BRIDGE], disabledReason: "A routine can have up to 50 exercises." });
    expect(screen.getByText("A routine can have up to 50 exercises.")).toBeInTheDocument();
    for (const button of within(list()).getAllByRole("button")) expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bridge" })).toBeDisabled();
    await fakeTimerUser().click(within(list()).getByRole("button", { name: "Squat" }));
    expect(onPick).not.toHaveBeenCalled();
  });

  it("points to the library when it is empty", () => {
    setup({ initial: [], recent: [] });
    expect(screen.getByText(/Your library is empty\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add exercises in the library" })).toHaveAttribute(
      "href",
      "/library/new",
    );
    expect(screen.queryByTestId("picker-list")).not.toBeInTheDocument();
  });
});
