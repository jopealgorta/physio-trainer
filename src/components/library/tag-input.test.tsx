import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";

import { TagInput } from "./tag-input";

function renderInput(defaultValue: string[] = [], suggestions: string[] = []) {
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <form aria-label="f" onSubmit={onSubmit}>
        <label htmlFor="t">Tags</label>
        <TagInput id="t" defaultValue={defaultValue} suggestions={suggestions} />
      </form>
    </NextIntlClientProvider>,
  );
  const form = screen.getByRole("form", { name: "f" }) as HTMLFormElement;
  return { onSubmit, tags: () => new FormData(form).getAll("tags") };
}

const field = () => screen.getByLabelText("Tags");

describe("TagInput", () => {
  it("adds a normalised tag on Enter without submitting", async () => {
    const user = userEvent.setup();
    const { tags, onSubmit } = renderInput();
    await user.type(field(), "Band{Enter}");
    expect(tags()).toEqual(["band"]);
    expect(screen.getByText("band")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("splits on commas and strips hashes", async () => {
    const user = userEvent.setup();
    const { tags } = renderInput();
    await user.type(field(), "rubber, #Home,");
    expect(tags()).toEqual(["rubber", "home"]);
  });

  it("ignores duplicates", async () => {
    const user = userEvent.setup();
    const { tags } = renderInput(["band"]);
    await user.type(field(), "BAND{Enter}");
    expect(tags()).toEqual(["band"]);
  });

  it("removes the last tag on Backspace in an empty input", async () => {
    const user = userEvent.setup();
    const { tags } = renderInput(["a", "b"]);
    await user.click(field());
    await user.keyboard("{Backspace}");
    expect(tags()).toEqual(["a"]);
  });

  it("removes a tag with its button", async () => {
    const user = userEvent.setup();
    const { tags } = renderInput(["a", "b"]);
    await user.click(screen.getByRole("button", { name: "Remove tag a" }));
    expect(tags()).toEqual(["b"]);
  });

  it("suggests unused existing tags and adds one on click", async () => {
    const user = userEvent.setup();
    const { tags } = renderInput(["beginner-x"], ["beginner", "beginner-x", "advanced"]);
    await user.type(field(), "beg");
    const list = screen.getByRole("listbox", { name: "Existing tags" });
    expect(screen.queryByRole("option", { name: "beginner-x" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "beginner" }));
    expect(list).not.toBeInTheDocument();
    expect(tags()).toEqual(["beginner-x", "beginner"]);
  });

  it("chooses a suggestion with the arrow keys", async () => {
    const user = userEvent.setup();
    const { tags, onSubmit } = renderInput([], ["beginner", "bench"]);
    await user.type(field(), "be{ArrowDown}{ArrowDown}{Enter}");
    expect(tags()).toEqual(["bench"]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables the input at the limit", () => {
    renderInput(Array.from({ length: 20 }, (_, i) => `t${i}`));
    expect(field()).toBeDisabled();
    expect(screen.getByText("Up to 20 tags.")).toBeInTheDocument();
  });
});
