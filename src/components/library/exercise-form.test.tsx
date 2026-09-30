import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { CategoryNode } from "@/lib/category-tree";
import type { ExerciseFormState } from "@/server/library/schemas";
import { chooseOption } from "@/test/select";

import messages from "../../../messages/en.json";

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
  categoryId: null,
  instructions: null,
  bodyAreas: [],
  tags: [],
  mediaUrls: [],
};

function setup(
  action: (state: ExerciseFormState, formData: FormData) => Promise<ExerciseFormState>,
  values: Partial<ExerciseFormValues> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ExerciseForm
        action={action}
        defaults={{ ...defaults, ...values }}
        categories={categories}
        tagSuggestions={["band"]}
      />
    </NextIntlClientProvider>,
  );
}

const idleAction = () => vi.fn(async (): Promise<ExerciseFormState> => ({ status: "idle" }));

describe("ExerciseForm", () => {
  it("renders the labelled fields for a new exercise", () => {
    setup(idleAction());
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByLabelText("Instructions")).toBeInTheDocument();
    expect(screen.getByLabelText("Tags")).toBeInTheDocument();
    expect(screen.getByText("Body areas")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Videos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create exercise" })).toBeInTheDocument();
    expect(document.querySelector('input[name="id"]')).toBeNull();
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
    const select = screen.getByLabelText("Category");
    expect(select).toHaveTextContent("Uncategorised");
    await user.click(select);
    const list = await screen.findByRole("listbox");
    expect(within(list).getAllByRole("option")[0]).toHaveTextContent("Uncategorised");
    expect(within(list).getByRole("group", { name: "Lower limb" })).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: "Lower limb › Glutes" })).toBeInTheDocument();
    expect(within(list).getByRole("group", { name: "Upper limb" })).toBeInTheDocument();
  });

  it("submits the form data to the action", async () => {
    const user = userEvent.setup();
    const action = idleAction();
    setup(action, { bodyAreas: ["knee"] });
    await user.type(screen.getByLabelText("Name"), "Bridge");
    await chooseOption(user, screen.getByLabelText("Category"), "Lower limb › Glutes");
    await user.type(screen.getByLabelText("Tags"), "band{Enter}");
    await user.type(screen.getByLabelText("YouTube link"), "https://youtu.be/dQw4w9WgXcQ{Enter}");
    await user.click(screen.getByRole("button", { name: "Create exercise" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(formData.get("name")).toBe("Bridge");
    expect(formData.get("categoryId")).toBe("c2");
    expect(formData.getAll("bodyAreas")).toEqual(["knee"]);
    expect(formData.getAll("tags")).toEqual(["band"]);
    expect(formData.getAll("media")).toEqual(["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]);
    expect(formData.has("sets")).toBe(false);
  });

  it("submits an empty category for Uncategorised", async () => {
    const user = userEvent.setup();
    const action = idleAction();
    setup(action);
    await user.type(screen.getByLabelText("Name"), "Bridge");
    await user.click(screen.getByRole("button", { name: "Create exercise" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(formData.get("categoryId")).toBe("");
  });

  it("shows Uncategorised when the saved category no longer exists", () => {
    setup(idleAction(), { categoryId: "gone" });
    expect(screen.getByLabelText("Category")).toHaveTextContent("Uncategorised");
    expect(document.querySelector('input[name="categoryId"]')).toHaveValue("");
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
    await chooseOption(user, screen.getByLabelText("Category"), "Upper limb");
    await user.type(screen.getByLabelText("Instructions"), "Slowly");
    await user.click(screen.getByRole("button", { name: "Create exercise" }));

    expect(await screen.findByText("Use at most 120 characters.")).toBeInTheDocument();
    expect(screen.getByText("Use at most 5,000 characters.")).toBeInTheDocument();
    expect(screen.getByText("Each video must be a different YouTube link.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Instructions")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Name")).toHaveValue("Bridge");
    expect(screen.getByLabelText("Instructions")).toHaveValue("Slowly");
    expect(screen.getByLabelText("Category")).toHaveTextContent("Upper limb");
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
          tagSuggestions={[]}
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
