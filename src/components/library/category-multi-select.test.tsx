import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CategoryNode } from "@/lib/category-tree";
import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";

const create = vi.fn();
vi.mock("@/server/library/actions", () => ({
  createCategoryAction: (...args: unknown[]) => create(...args),
}));

import { CategoryMultiSelect } from "./category-multi-select";

const leaf = (id: string, name: string, position = 0) => ({
  id,
  name,
  position,
  activeCount: 0,
  totalCount: 0,
});
const categories: CategoryNode[] = [
  { ...leaf("c1", "Lower limb"), children: [leaf("c2", "Glutes")] },
  { ...leaf("c3", "Upper limb", 1), children: [] },
];

function setup({
  onOuterSubmit = vi.fn(),
  defaultValue = [] as string[],
}: { onOuterSubmit?: () => void; defaultValue?: string[] } = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onOuterSubmit();
        }}
      >
        <label id="category-label" htmlFor="category">
          Categories
        </label>
        <CategoryMultiSelect
          id="category"
          labelId="category-label"
          name="categoryIds"
          categories={categories}
          defaultValue={defaultValue}
        />
      </form>
    </NextIntlClientProvider>,
  );
  return {
    onOuterSubmit,
    values: () =>
      [...document.querySelectorAll<HTMLInputElement>('input[name="categoryIds"]')].map(
        (input) => input.value,
      ),
  };
}

async function openList(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText("Categories"));
  return screen.findByRole("dialog", { name: "Choose categories" });
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "New category" }));
  return screen.findByRole("dialog", { name: "New category" });
}

beforeEach(() => {
  create.mockReset();
});

describe("CategoryMultiSelect", () => {
  it("shows Uncategorised and submits nothing when none is chosen", () => {
    const { values } = setup();
    expect(screen.getByLabelText("Categories")).toHaveTextContent("Uncategorised");
    // The picks are part of the trigger's accessible name, as a select's value would be.
    expect(screen.getByRole("button", { name: "Categories Uncategorised" })).toBeInTheDocument();
    expect(values()).toEqual([]);
  });

  it("ticks several categories, top-level and sub-categories alike, in tree order", async () => {
    const user = userEvent.setup();
    const { values } = setup();
    const list = await openList(user);
    await user.click(within(list).getByRole("checkbox", { name: "Upper limb" }));
    await user.click(within(list).getByRole("checkbox", { name: "Lower limb › Glutes" }));
    // Ticking a sub-category leaves its parent alone.
    expect(within(list).getByRole("checkbox", { name: "Lower limb" })).not.toBeChecked();
    expect(values()).toEqual(["c2", "c3"]);
    expect(screen.getByLabelText("Categories", { selector: "button" })).toHaveTextContent(
      "Lower limb › Glutes, Upper limb",
    );

    await user.click(within(list).getByRole("checkbox", { name: "Upper limb" }));
    expect(values()).toEqual(["c2"]);
  });

  it("groups each top-level category with its sub-categories", async () => {
    const user = userEvent.setup();
    setup();
    const list = await openList(user);
    const lower = within(list).getByRole("group", { name: "Lower limb" });
    expect(within(lower).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(list).getByRole("group", { name: "Upper limb" })).toBeInTheDocument();
  });

  it("starts from the saved categories, dropping ones that no longer exist", async () => {
    const user = userEvent.setup();
    const { values } = setup({ defaultValue: ["c3", "gone", "c1"] });
    expect(values()).toEqual(["c1", "c3"]);
    expect(screen.getByLabelText("Categories")).toHaveTextContent("Lower limb, Upper limb");
    const list = await openList(user);
    expect(within(list).getByRole("checkbox", { name: "Lower limb" })).toBeChecked();
    expect(within(list).getByRole("checkbox", { name: "Lower limb › Glutes" })).not.toBeChecked();
  });
});

describe("CategoryMultiSelect limit", () => {
  const many: CategoryNode[] = Array.from({ length: 21 }, (_, i) => ({
    ...leaf(`m${i}`, `Cat ${i}`, i),
    children: [],
  }));
  const twenty = many.slice(0, 20).map((node) => node.id);

  it("disables the rest and says why once 20 are ticked", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <label htmlFor="c">Categories</label>
        <CategoryMultiSelect id="c" name="categoryIds" categories={many} defaultValue={twenty} />
      </NextIntlClientProvider>,
    );
    await user.click(screen.getByLabelText("Categories"));
    const list = await screen.findByRole("dialog", { name: "Choose categories" });
    expect(within(list).getByRole("checkbox", { name: "Cat 20" })).toBeDisabled();
    expect(within(list).getByRole("checkbox", { name: "Cat 0" })).toBeEnabled();
    expect(within(list).getByText("Up to 20 categories.")).toBeInTheDocument();
  });

  it("does not tick a new category when 20 are already ticked", async () => {
    const user = userEvent.setup();
    create.mockResolvedValue({ ok: true, data: { id: "new-x" } });
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <label htmlFor="c">Categories</label>
        <CategoryMultiSelect id="c" name="categoryIds" categories={many} defaultValue={twenty} />
      </NextIntlClientProvider>,
    );
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Category name"), "Extra{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const values = [
      ...document.querySelectorAll<HTMLInputElement>('input[name="categoryIds"]'),
    ].map((input) => input.value);
    expect(values).toHaveLength(20);
    expect(values).not.toContain("new-x");
  });
});

describe("CategoryMultiSelect new category", () => {
  it("offers only top-level categories as the parent, with none by default", async () => {
    const user = userEvent.setup();
    setup();
    const dialog = await openDialog(user);
    const parent = within(dialog).getByLabelText("Inside");
    expect(parent).toHaveTextContent("None (top level)");
    await user.click(parent);
    const options = within(await screen.findByRole("listbox")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "None (top level)",
      "Lower limb",
      "Upper limb",
    ]);
  });

  it("creates a top-level category and selects it", async () => {
    const user = userEvent.setup();
    create.mockResolvedValue({ ok: true, data: { id: "new-1" } });
    const { onOuterSubmit, values } = setup({ defaultValue: ["c3"] });
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Category name"), "Core");
    await user.click(within(dialog).getByRole("button", { name: "Create category" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(create).toHaveBeenCalledWith({ name: "Core", parentId: null });
    // Added to what was already chosen.
    expect(values()).toEqual(["c3", "new-1"]);
    expect(screen.getByLabelText("Categories")).toHaveTextContent("Upper limb, Core");
    // The rest of the page's form is not submitted by the dialog's own form.
    expect(onOuterSubmit).not.toHaveBeenCalled();

    // It is a regular option now, before any refresh brings the new tree.
    const list = await openList(user);
    const core = within(list).getByRole("checkbox", { name: "Core" });
    expect(core).toBeChecked();
    await user.click(core);
    expect(values()).toEqual(["c3"]);
  });

  it("creates a sub-category inside the chosen parent", async () => {
    const user = userEvent.setup();
    create.mockResolvedValue({ ok: true, data: { id: "new-2" } });
    const { values } = setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Category name"), "Hamstrings");
    await chooseOption(user, within(dialog).getByLabelText("Inside"), "Lower limb");
    await user.click(within(dialog).getByRole("button", { name: "Create category" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(create).toHaveBeenCalledWith({ name: "Hamstrings", parentId: "c1" });
    expect(values()).toEqual(["new-2"]);
    expect(screen.getByLabelText("Categories")).toHaveTextContent("Lower limb › Hamstrings");
  });

  it("shows a name error inline and keeps the dialog open", async () => {
    const user = userEvent.setup();
    create.mockResolvedValue({ ok: false, error: "nameTaken" });
    const { values } = setup();
    const dialog = await openDialog(user);
    const name = within(dialog).getByLabelText("Category name");
    await user.type(name, "Glutes{Enter}");

    expect(
      await within(dialog).findByText("There's already a category with this name here."),
    ).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveValue("Glutes");
    expect(values()).toEqual([]);
  });

  it("shows a parent error under the parent field", async () => {
    const user = userEvent.setup();
    create.mockResolvedValue({ ok: false, error: "parentNotFound" });
    setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Category name"), "Hamstrings{Enter}");
    expect(await within(dialog).findByText("This category no longer exists.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Inside")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a generic error when the request fails", async () => {
    const user = userEvent.setup();
    create.mockRejectedValue(new Error("offline"));
    setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Category name"), "Core{Enter}");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Something went wrong. Try again.",
    );
  });

  it("cannot be closed while the category is being created", async () => {
    const user = userEvent.setup();
    let finish: (result: unknown) => void = () => {};
    create.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { values } = setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Category name"), "Core{Enter}");

    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: "New category" })).toBeInTheDocument();

    finish({ ok: true, data: { id: "new-3" } });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(values()).toEqual(["new-3"]);
  });

  it("starts empty again after cancelling", async () => {
    const user = userEvent.setup();
    create.mockResolvedValue({ ok: false, error: "nameRequired" });
    setup();
    let dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Category name"), "  {Enter}");
    expect(await within(dialog).findByText("Enter a name.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    dialog = await openDialog(user);
    expect(within(dialog).getByLabelText("Category name")).toHaveValue("");
    expect(within(dialog).queryByText("Enter a name.")).toBeNull();
  });
});
