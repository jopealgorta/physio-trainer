import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";

import { YouTubePreview } from "./youtube-preview";

const renderPreview = (isShort: boolean) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <YouTubePreview videoId="dQw4w9WgXcQ" isShort={isShort} title="Bridge" />
    </NextIntlClientProvider>,
  );

describe("YouTubePreview", () => {
  it("loads the iframe only after a click", async () => {
    const user = userEvent.setup();
    const { container } = renderPreview(false);
    expect(container.querySelector("iframe")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Play video: Bridge" }));
    const frame = screen.getByTitle("Video: Bridge");
    expect(frame.getAttribute("src")).toMatch(
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/,
    );
  });

  it("uses a portrait ratio for Shorts and landscape otherwise", () => {
    const short = renderPreview(true);
    expect(short.container.firstElementChild).toHaveClass("aspect-[9/16]");
    short.unmount();
    const regular = renderPreview(false);
    expect(regular.container.firstElementChild).toHaveClass("aspect-video");
  });
});
