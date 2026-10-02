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

import { CategorySelect } from "./category-select";

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

function setup(onOuterSubmit = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onOuterSubmit();
        }}
      >
        <label htmlFor="category">Category</label>
        <CategorySelect
          id="category"
          name="categoryId"
          categories={categories}
          defaultValue={null}
        />
      </form>
    </NextIntlClientProvider>,
  );
  return { onOuterSubmit, hidden: () => document.querySelector('input[name="categoryId"]') };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "New category" }));
  return screen.findByRole("dialog", { name: "New category" });
}

beforeEach(() => {
  create.mockReset();
});

describe("CategorySelect new category", () => {
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
    const { onOuterSubmit, hidden } = setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Category name"), "Core");
    await user.click(within(dialog).getByRole("button", { name: "Create category" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(create).toHaveBeenCalledWith({ name: "Core", parentId: null });
    expect(hidden()).toHaveValue("new-1");
    const trigger = screen.getByLabelText("Category");
    expect(trigger).toHaveTextContent("Core");
    // The rest of the page's form is not submitted by the dialog's own form.
    expect(onOuterSubmit).not.toHaveBeenCalled();

    // It is a regular option now, before any refresh brings the new tree.
    await chooseOption(user, trigger, "Uncategorised");
    await chooseOption(user, trigger, "Core");
    expect(hidden()).toHaveValue("new-1");
  });

  it("creates a sub-category inside the chosen parent", async () => {
    const user = userEvent.setup();
    create.mockResolvedValue({ ok: true, data: { id: "new-2" } });
    const { hidden } = setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Category name"), "Hamstrings");
    await chooseOption(user, within(dialog).getByLabelText("Inside"), "Lower limb");
    await user.click(within(dialog).getByRole("button", { name: "Create category" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(create).toHaveBeenCalledWith({ name: "Hamstrings", parentId: "c1" });
    expect(hidden()).toHaveValue("new-2");
    expect(screen.getByLabelText("Category")).toHaveTextContent("Lower limb › Hamstrings");
  });

  it("shows a name error inline and keeps the dialog open", async () => {
    const user = userEvent.setup();
    create.mockResolvedValue({ ok: false, error: "nameTaken" });
    const { hidden } = setup();
    const dialog = await openDialog(user);
    const name = within(dialog).getByLabelText("Category name");
    await user.type(name, "Glutes{Enter}");

    expect(
      await within(dialog).findByText("There's already a category with this name here."),
    ).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveValue("Glutes");
    expect(hidden()).toHaveValue("");
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
    const { hidden } = setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Category name"), "Core{Enter}");

    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: "New category" })).toBeInTheDocument();

    finish({ ok: true, data: { id: "new-3" } });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(hidden()).toHaveValue("new-3");
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
