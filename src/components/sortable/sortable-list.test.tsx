import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";

import { SortableList } from "./sortable-list";

const items = [
  { key: "a", name: "Alpha" },
  { key: "b", name: "Beta" },
  { key: "c", name: "Gamma" },
];

function renderList(onReorder = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <SortableList
        items={items}
        onReorder={onReorder}
        label={(item) => item.name}
        renderItem={(item, handle) => (
          <div>
            <button type="button" {...handle} />
            <span>{item.name}</span>
          </div>
        )}
      />
    </NextIntlClientProvider>,
  );
  return onReorder;
}

describe("SortableList", () => {
  it("renders items in order with labelled handles", () => {
    renderList();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
    expect(screen.getByRole("button", { name: "Reorder Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reorder Gamma" })).toBeInTheDocument();
  });

  it("describes handles with the translated keyboard instructions", () => {
    renderList();
    const handle = screen.getByRole("button", { name: "Reorder Alpha" });
    const described = document.getElementById(handle.getAttribute("aria-describedby") ?? "");
    expect(described).toHaveTextContent(messages.Sortable.instructions);
  });
});
