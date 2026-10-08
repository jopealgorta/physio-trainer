import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { buildCategoryTree } from "@/lib/category-tree";
import type { ExerciseSummary } from "@/server/library/queries";

import messages from "../../../messages/en.json";
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});

import { ExerciseResults, NoResults } from "./exercise-results";

const exercises: ExerciseSummary[] = [
  {
    id: "e1",
    name: "Bridge",
    kind: "strength",
    categoryIds: ["core", "glutes", "lower", "gone", "upper"],
    bodyAreas: ["knee", "hip_groin", "lower_back", "ankle_foot"],
    archivedAt: null,
    cover: { videoId: "abcdefghijk", isShort: false },
  },
  {
    id: "e2",
    name: "Squat",
    kind: "strength",
    categoryIds: [],
    bodyAreas: [],
    archivedAt: null,
    cover: null,
  },
];

const count = { activeCount: 0, totalCount: 0 };
const categories = buildCategoryTree([
  { id: "lower", parentId: null, name: "Lower limb", position: 0, ...count },
  { id: "glutes", parentId: "lower", name: "Glutes", position: 0, ...count },
  { id: "upper", parentId: null, name: "Upper limb", position: 1, ...count },
  { id: "core", parentId: null, name: "Core", position: 2, ...count },
]);

async function renderAsync(node: Promise<React.ReactElement>) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {await node}
    </NextIntlClientProvider>,
  );
}

describe("ExerciseResults", () => {
  it("renders cards linking to the exercise with a count", async () => {
    await renderAsync(ExerciseResults({ exercises, categories, view: "grid", archived: false }));
    expect(screen.getByRole("status")).toHaveTextContent("2 exercises");
    expect(screen.getByRole("link", { name: /Bridge/ })).toHaveAttribute("href", "/library/e1");
    expect(screen.getByText("+1")).toBeInTheDocument();
    // Categories in tree order, the first two shown; a deleted one is skipped.
    expect(screen.getByText("Lower limb")).toBeInTheDocument();
    expect(screen.getByText("Lower limb › Glutes")).toBeInTheDocument();
    expect(screen.queryByText("Upper limb")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });

  it("renders the list view and the archived badge", async () => {
    await renderAsync(ExerciseResults({ exercises, categories, view: "list", archived: true }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByText("Archived")).toHaveLength(2);
    expect(screen.getByRole("list").className).toContain("divide-y");
  });
});

describe("ExerciseResults kind badge", () => {
  it("badges aerobic exercises only", async () => {
    await renderAsync(
      ExerciseResults({
        exercises: [exercises[0], { ...exercises[1], kind: "aerobic" }],
        categories,
        view: "grid",
        archived: false,
      }),
    );
    expect(screen.getAllByText("Aerobic")).toHaveLength(1);
  });
});

describe("ExerciseResults truncation", () => {
  it("shows the refine hint only when truncated", async () => {
    await renderAsync(
      ExerciseResults({ exercises, categories, view: "grid", archived: false, truncated: true }),
    );
    expect(screen.getByText(/Showing the first 2 exercises/)).toBeInTheDocument();
  });
  it("omits the hint otherwise", async () => {
    await renderAsync(ExerciseResults({ exercises, categories, view: "grid", archived: false }));
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
  });
});

describe("NoResults", () => {
  it("clears filters but keeps the view", async () => {
    await renderAsync(NoResults({ view: "list" }));
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/library?view=list",
    );
  });
});
