import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { CategoryNode } from "@/lib/category-tree";
import type { ExerciseFormState } from "@/server/library/schemas";

import messages from "../../../messages/en.json";

const createCategory = vi.fn();
vi.mock("@/server/library/actions", () => ({
  createCategoryAction: (...args: unknown[]) => createCategory(...args),
}));

import { ExerciseForm, type ExerciseFormValues } from "./exercise-form";

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
const defaults: ExerciseFormValues = {
  name: "",
  kind: "strength",
  categoryIds: [],
  instructions: null,
  bodyAreas: [],
  mediaUrls: [],
};

function setup(
  action: (state: ExerciseFormState, formData: FormData) => Promise<ExerciseFormState>,
  values: Partial<ExerciseFormValues> = {},
  props: { submitLabel?: string } = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ExerciseForm
        action={action}
        defaults={{ ...defaults, ...values }}
        categories={categories}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const idleAction = () => vi.fn(async (): Promise<ExerciseFormState> => ({ status: "idle" }));

describe("ExerciseForm", () => {
  it("renders the labelled fields for a new exercise", () => {
    setup(idleAction());
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Categories")).toBeInTheDocument();
    expect(screen.getByLabelText("Instructions")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tags")).toBeNull();
    expect(screen.getByText("Body areas")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Videos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create exercise" })).toBeInTheDocument();
    expect(document.querySelector('input[name="id"]')).toBeNull();
  });

  it("uses the given submit label", () => {
    setup(idleAction(), {}, { submitLabel: "Create and add" });
    expect(screen.getByRole("button", { name: "Create and add" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create exercise" })).toBeNull();
  });

  it("has no default prescription fields", () => {
    setup(idleAction());
    expect(screen.queryByText(/default prescription/i)).toBeNull();
    expect(screen.queryByLabelText(/^sets$/i)).toBeNull();
    expect(screen.queryByLabelText(/^reps/i)).toBeNull();
  });

  it("offers Save changes and a hidden id when editing", () => {
    setup(idleAction(), { id: "abc", name: "Bridge" });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(document.querySelector('input[name="id"]')).toHaveValue("abc");
    expect(screen.getByLabelText("Name")).toHaveValue("Bridge");
  });

  it("groups categories with their sub-categories", async () => {
    const user = userEvent.setup();
    setup(idleAction());
    const trigger = screen.getByLabelText("Categories");
    expect(trigger).toHaveTextContent("Uncategorised");
    await user.click(trigger);
    const list = await screen.findByRole("dialog", { name: "Choose categories" });
    expect(within(list).getByRole("group", { name: "Lower limb" })).toBeInTheDocument();
    expect(within(list).getByRole("checkbox", { name: "Lower limb › Glutes" })).toBeInTheDocument();
    expect(within(list).getByRole("group", { name: "Upper limb" })).toBeInTheDocument();
  });

  it("submits the form data to the action", async () => {
    const user = userEvent.setup();
    const action = idleAction();
    setup(action, { bodyAreas: ["knee"] });
    await user.type(screen.getByLabelText("Name"), "Bridge");
    await user.click(screen.getByLabelText("Categories"));
    const list = await screen.findByRole("dialog", { name: "Choose categories" });
    await user.click(within(list).getByRole("checkbox", { name: "Lower limb › Glutes" }));
    await user.click(within(list).getByRole("checkbox", { name: "Upper limb" }));
    await user.keyboard("{Escape}");
    await user.type(screen.getByLabelText("YouTube link"), "https://youtu.be/dQw4w9WgXcQ{Enter}");
    await user.click(screen.getByRole("button", { name: "Create exercise" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(formData.get("name")).toBe("Bridge");
    expect(formData.getAll("categoryIds")).toEqual(["c2", "c3"]);
    expect(formData.getAll("bodyAreas")).toEqual(["knee"]);
    expect(formData.has("tags")).toBe(false);
    expect(formData.getAll("media")).toEqual(["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]);
    expect(formData.has("sets")).toBe(false);
  });

  it("posts kind=strength by default and kind=aerobic when Aerobic is picked", async () => {
    const user = userEvent.setup();
    const action = idleAction();
    setup(action);
    await user.type(screen.getByLabelText("Name"), "Run");
    expect(screen.getByRole("radio", { name: "Strength" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Aerobic" }));
    await user.click(screen.getByRole("button", { name: "Create exercise" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(formData.get("kind")).toBe("aerobic");
  });

  it("keeps typed values while a new category is created, then submits it", async () => {
    const user = userEvent.setup();
    const action = idleAction();
    createCategory.mockResolvedValue({ ok: true, data: { id: "c9" } });
    setup(action);
    await user.type(screen.getByLabelText("Name"), "Dead bug");
    await user.type(screen.getByLabelText("Instructions"), "Slow.");
    await user.click(screen.getByRole("button", { name: "New category" }));
    const dialog = await screen.findByRole("dialog", { name: "New category" });
    await user.type(within(dialog).getByLabelText("Category name"), "Core{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Creating the category did not save the exercise.
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("Dead bug");
    expect(screen.getByLabelText("Instructions")).toHaveValue("Slow.");

    await user.click(screen.getByRole("button", { name: "Create exercise" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(formData.getAll("categoryIds")).toEqual(["c9"]);
    expect(formData.get("name")).toBe("Dead bug");
  });

  it("submits no category for Uncategorised", async () => {
    const user = userEvent.setup();
    const action = idleAction();
    setup(action);
    await user.type(screen.getByLabelText("Name"), "Bridge");
    await user.click(screen.getByRole("button", { name: "Create exercise" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(formData.getAll("categoryIds")).toEqual([]);
  });

  it("shows Uncategorised when the saved categories no longer exist", () => {
    setup(idleAction(), { categoryIds: ["gone"] });
    expect(screen.getByLabelText("Categories")).toHaveTextContent("Uncategorised");
    expect(document.querySelector('input[name="categoryIds"]')).toBeNull();
  });

  it("shows a category error with its limit", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<ExerciseFormState> => ({
      status: "error",
      fieldErrors: { categoryIds: "tooManyCategories" },
    }));
    setup(action, { name: "Bridge" });
    await user.click(screen.getByRole("button", { name: "Create exercise" }));
    expect(await screen.findByText("Choose at most 20 categories.")).toBeInTheDocument();
    expect(screen.getByLabelText("Categories")).toHaveAttribute("aria-invalid", "true");
  });

  it("ties a body-area error to the body areas field", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<ExerciseFormState> => ({
      status: "error",
      fieldErrors: { bodyAreas: "bodyAreasInvalid" },
    }));
    setup(action, { name: "Bridge" });
    await user.click(screen.getByRole("button", { name: "Create exercise" }));
    const field = await screen.findByRole("button", { name: /^Body areas/ });
    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
    expect(field).toHaveAccessibleDescription(messages.Library.form.errors.bodyAreasInvalid);
  });

  it("shows field errors and keeps what was typed", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<ExerciseFormState> => ({
      status: "error",
      fieldErrors: {
        name: "nameTooLong",
        instructions: "instructionsTooLong",
        media: "mediaInvalid",
      },
    }));
    setup(action);
    await user.type(screen.getByLabelText("Name"), "Bridge");
    await user.click(screen.getByLabelText("Categories"));
    const list = await screen.findByRole("dialog", { name: "Choose categories" });
    await user.click(within(list).getByRole("checkbox", { name: "Upper limb" }));
    await user.keyboard("{Escape}");
    await user.type(screen.getByLabelText("Instructions"), "Slowly");
    await user.click(screen.getByRole("button", { name: "Create exercise" }));

    expect(await screen.findByText("Use at most 120 characters.")).toBeInTheDocument();
    expect(screen.getByText("Use at most 5,000 characters.")).toBeInTheDocument();
    expect(screen.getByText("Each video must be a different YouTube link.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Instructions")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Name")).toHaveValue("Bridge");
    expect(screen.getByLabelText("Instructions")).toHaveValue("Slowly");
    expect(screen.getByLabelText("Categories")).toHaveTextContent("Upper limb");
  });

  it("announces a successful save", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<ExerciseFormState> => ({ status: "saved" }));
    setup(action, { id: "abc", name: "Bridge" });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByLabelText("Name")).toHaveValue("Bridge");
  });

  it("shows the not-found alert", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<ExerciseFormState> => ({
      status: "error",
      fieldErrors: {},
      formError: "notFound",
    }));
    setup(action, { id: "abc", name: "Bridge" });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This exercise no longer exists.");
  });

  it("keeps the saved state when refreshed defaults arrive", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<ExerciseFormState> => ({ status: "saved" }));
    const ui = (name: string) => (
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <ExerciseForm
          action={action}
          defaults={{ ...defaults, id: "abc", name }}
          categories={categories}
        />
      </NextIntlClientProvider>
    );
    const { rerender } = render(ui("Bridge"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    rerender(ui("Bridge"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });
});
