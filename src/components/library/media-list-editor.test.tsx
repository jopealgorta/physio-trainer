import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";

import { MediaListEditor } from "./media-list-editor";

const url = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const ID = (n: number) => `abcdefghi${String(n).padStart(2, "0")}`;

function renderEditor(defaultValue: string[] = []) {
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <form aria-label="f" onSubmit={onSubmit}>
        <MediaListEditor defaultValue={defaultValue} title="Videos" />
      </form>
    </NextIntlClientProvider>,
  );
  const form = screen.getByRole("form", { name: "f" }) as HTMLFormElement;
  return { onSubmit, media: () => new FormData(form).getAll("media") };
}

const input = () => screen.getByLabelText("YouTube link");

describe("MediaListEditor", () => {
  it("adds a video on Enter without submitting the form", async () => {
    const user = userEvent.setup();
    const { onSubmit, media } = renderEditor();
    await user.type(input(), "youtu.be/dQw4w9WgXcQ?si=1{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(media()).toEqual([url("dQw4w9WgXcQ")]);
    expect(screen.getByText("Cover")).toBeInTheDocument();
    expect(input()).toHaveValue("");
  });

  it("rejects non-YouTube links", async () => {
    const user = userEvent.setup();
    const { media } = renderEditor();
    await user.type(input(), "https://example.com/x{Enter}");
    expect(screen.getByText(messages.Library.media.errors.notYouTube)).toBeInTheDocument();
    expect(media()).toEqual([]);
  });

  it("rejects duplicates", async () => {
    const user = userEvent.setup();
    const { media } = renderEditor([url("dQw4w9WgXcQ")]);
    await user.type(input(), "youtu.be/dQw4w9WgXcQ{Enter}");
    expect(screen.getByText(messages.Library.media.errors.duplicate)).toBeInTheDocument();
    expect(media()).toHaveLength(1);
  });

  it("disables the input at the limit", () => {
    renderEditor(Array.from({ length: 10 }, (_, i) => url(ID(i))));
    expect(input()).toBeDisabled();
    expect(screen.getByText("You can add up to 10 videos.")).toBeInTheDocument();
  });

  it("removes a video and promotes the next one to cover", async () => {
    const user = userEvent.setup();
    const { media } = renderEditor([url(ID(1)), url(ID(2))]);
    await user.click(screen.getByRole("button", { name: "Remove video 1" }));
    expect(media()).toEqual([url(ID(2))]);
    expect(screen.getByText("Cover")).toBeInTheDocument();
  });
});
