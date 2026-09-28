import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

import { OfflineScreen } from "./offline-screen";

function renderOffline(locale: "en" | "es", onRetry = vi.fn()) {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : es} timeZone="UTC">
      <OfflineScreen onRetry={onRetry} />
    </NextIntlClientProvider>,
  );
  return onRetry;
}

describe("OfflineScreen", () => {
  it("tells the physio they are offline", () => {
    renderOffline("en");
    expect(screen.getByRole("heading", { name: en.Offline.title })).toBeInTheDocument();
    expect(screen.getByText(en.Offline.description)).toBeInTheDocument();
  });

  it("is localized", () => {
    renderOffline("es");
    expect(screen.getByRole("heading", { name: es.Offline.title })).toBeInTheDocument();
  });

  it("retries when the button is pressed", async () => {
    const user = userEvent.setup();
    const onRetry = renderOffline("en");
    await user.click(screen.getByRole("button", { name: en.Offline.retry }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
