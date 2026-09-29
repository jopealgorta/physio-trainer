import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

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
    categoryId: null,
    bodyAreas: ["knee", "hip_groin", "lower_back", "ankle_foot"],
    tags: ["band", "core"],
    archivedAt: null,
    cover: { videoId: "abcdefghijk", isShort: false },
  },
  {
    id: "e2",
    name: "Squat",
    categoryId: null,
    bodyAreas: [],
    tags: [],
    archivedAt: null,
    cover: null,
  },
];

async function renderAsync(node: Promise<React.ReactElement>) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {await node}
    </NextIntlClientProvider>,
  );
}

describe("ExerciseResults", () => {
  it("renders cards linking to the exercise with a count", async () => {
    await renderAsync(ExerciseResults({ exercises, view: "grid", archived: false }));
    expect(screen.getByRole("status")).toHaveTextContent("2 exercises");
    expect(screen.getByRole("link", { name: /Bridge/ })).toHaveAttribute("href", "/library/e1");
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("#band #core")).toBeInTheDocument();
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });

  it("renders the list view and the archived badge", async () => {
    await renderAsync(ExerciseResults({ exercises, view: "list", archived: true }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByText("Archived")).toHaveLength(2);
    expect(screen.getByRole("list").className).toContain("divide-y");
  });
});

describe("ExerciseResults truncation", () => {
  it("shows the refine hint only when truncated", async () => {
    await renderAsync(
      ExerciseResults({ exercises, view: "grid", archived: false, truncated: true }),
    );
    expect(screen.getByText(/Showing the first 2 exercises/)).toBeInTheDocument();
  });
  it("omits the hint otherwise", async () => {
    await renderAsync(ExerciseResults({ exercises, view: "grid", archived: false }));
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
