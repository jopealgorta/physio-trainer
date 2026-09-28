import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "../../messages/en.json";

import { LocaleSwitcher } from "./locale-switcher";

const options = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
];

function renderSwitcher(setLocale = vi.fn(async () => ({ ok: true }))) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <LocaleSwitcher options={options} setLocale={setLocale} />
    </NextIntlClientProvider>,
  );
  return setLocale;
}

describe("LocaleSwitcher", () => {
  it("shows every language with the current one selected", () => {
    renderSwitcher();
    const select = screen.getByRole("combobox", { name: "Language" });
    expect(select).toHaveValue("en");
    expect(screen.getByRole("option", { name: "Español" })).toBeInTheDocument();
  });

  it("asks the server to switch when a language is picked", async () => {
    const user = userEvent.setup();
    const setLocale = renderSwitcher();
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "es");
    await waitFor(() => expect(setLocale).toHaveBeenCalledWith("es"));
  });

  // Disabling a focused select drops keyboard focus to <body>; mark it busy instead.
  it("keeps focus and ignores further picks while the switch is pending", async () => {
    const user = userEvent.setup();
    let resolve: (value: { ok: boolean }) => void = () => {};
    const setLocale = vi.fn(() => new Promise<{ ok: boolean }>((r) => (resolve = r)));
    renderSwitcher(setLocale);
    const select = screen.getByRole("combobox", { name: "Language" });
    await user.selectOptions(select, "es");
    await waitFor(() => expect(select).toHaveAttribute("aria-busy", "true"));
    expect(select).toBeEnabled();
    expect(select).toHaveFocus();
    await user.selectOptions(select, "en");
    expect(setLocale).toHaveBeenCalledTimes(1);
    resolve({ ok: true });
    await waitFor(() => expect(select).toHaveAttribute("aria-busy", "false"));
  });

  // Offline or a stale deploy: keep the page usable instead of hitting the error boundary.
  it("stays on the current language when the switch fails", async () => {
    const user = userEvent.setup();
    const setLocale = vi.fn(async () => {
      throw new Error("offline");
    });
    renderSwitcher(setLocale);
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "es");
    await waitFor(() => expect(setLocale).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en"),
    );
  });

  // iOS Safari zooms into inputs whose text is smaller than 16px.
  it("uses 16px text on small screens", () => {
    renderSwitcher();
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveClass("text-base");
  });
});
