import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubImageLoading } from "@/test/image";

import messages from "../../messages/en.json";

vi.mock("@/server/auth/actions", () => ({ signOut: vi.fn() }));

import { UserMenu } from "./user-menu";

const PHOTO = "https://lh3.googleusercontent.com/a/maria=s96-c";

function renderMenu(avatarUrl: string | null, compact = false) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <UserMenu
        name="Maria Lopez"
        email="maria@example.test"
        avatarUrl={avatarUrl}
        compact={compact}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UserMenu avatar", () => {
  it("shows the initial when there is no photo", () => {
    renderMenu(null);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    expect(trigger).toHaveTextContent("M");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the photo without sending a referrer", async () => {
    stubImageLoading();
    renderMenu(PHOTO, true);
    const photo = await screen.findByRole("img", { name: "Photo of Maria Lopez" });
    expect(photo).toHaveAttribute("src", PHOTO);
    expect(photo).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("falls back to the initial when the photo fails to load", async () => {
    stubImageLoading(() => true);
    renderMenu(PHOTO, true);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    // Let the failed load settle, then the fallback is still the only content.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("img")).toBeNull();
    expect(trigger).toHaveTextContent("M");
  });
});
