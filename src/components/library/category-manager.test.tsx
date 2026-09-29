import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CategoryNode } from "@/lib/category-tree";

import messages from "../../../messages/en.json";

const refresh = vi.fn();
const create = vi.fn();
const rename = vi.fn();
const reorder = vi.fn();
const remove = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/library/actions", () => ({
  createCategoryAction: (...args: unknown[]) => create(...args),
  renameCategoryAction: (...args: unknown[]) => rename(...args),
  reorderCategoriesAction: (...args: unknown[]) => reorder(...args),
  deleteCategoryAction: (...args: unknown[]) => remove(...args),
}));

import { CategoryManager } from "./category-manager";

const tree: CategoryNode[] = [
  {
    id: "c1",
    name: "Lower limb",
    position: 0,
    activeCount: 4,
    totalCount: 5,
    children: [
      { id: "c2", name: "Glutes", position: 0, activeCount: 2, totalCount: 2 },
      { id: "c3", name: "Knee", position: 1, activeCount: 1, totalCount: 1 },
    ],
  },
];

async function open(nodes: CategoryNode[] = tree) {
  const user = userEvent.setup();
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CategoryManager tree={nodes} />
    </NextIntlClientProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Manage categories" }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({ ok: true, data: { id: "new" } });
  rename.mockResolvedValue({ ok: true, data: null });
  reorder.mockResolvedValue({ ok: true, data: null });
  remove.mockResolvedValue({ ok: true, data: null });
});

describe("CategoryManager", () => {
  it("opens a dialog and shows the empty state", async () => {
    await open([]);
    expect(screen.getByRole("dialog", { name: "Categories" })).toBeInTheDocument();
    expect(screen.getByText("No categories yet.")).toBeInTheDocument();
  });

  it("adds a top-level category", async () => {
    const user = await open([]);
    const input = screen.getByRole("textbox", { name: "Category name" });
    await user.type(input, "Lower limb");
    await user.click(screen.getByRole("button", { name: "Add category" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith({ name: "Lower limb", parentId: null });
    expect(input).toHaveValue("");
  });

  it("shows an error and keeps the text when the name is taken", async () => {
    create.mockResolvedValue({ ok: false, error: "nameTaken" });
    const user = await open([]);
    const input = screen.getByRole("textbox", { name: "Category name" });
    await user.type(input, "Lower limb");
    await user.click(screen.getByRole("button", { name: "Add category" }));
    expect(
      await screen.findByText("There's already a category with this name here."),
    ).toBeInTheDocument();
    expect(input).toHaveValue("Lower limb");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("adds a sub-category under its parent", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Add sub-category to Lower limb" }));
    await user.keyboard("Hip{Enter}");
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Hip", parentId: "c1" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("renames on Enter and cancels on Escape without closing the dialog", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Rename Lower limb" }));
    const inputs = screen.getAllByRole("textbox", { name: "Category name" });
    const input = inputs[inputs.length - 1];
    expect(input).toHaveValue("Lower limb");
    await user.keyboard("{Escape}");
    expect(rename).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Categories" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename Lower limb" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rename Lower limb" }));
    await user.keyboard("{Control>}a{/Control}Legs{Enter}");
    await waitFor(() => expect(rename).toHaveBeenCalledWith({ id: "c1", name: "Legs" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("confirms a delete with counts", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Delete Lower limb" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete “Lower limb”?" });
    expect(dialog).toHaveTextContent("Its 2 sub-categories will be deleted too.");
    expect(dialog).toHaveTextContent("5 exercises will move to Uncategorised.");
    expect(remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete category" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("renders sub-categories without an add-sub button", async () => {
    await open();
    expect(screen.getByText("Glutes")).toBeInTheDocument();
    expect(screen.getByText("Knee")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add sub-category to Glutes" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename Glutes" })).toBeInTheDocument();
  });
});
