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

  it("is disabled while the switch is pending", async () => {
    const user = userEvent.setup();
    let resolve: (value: { ok: boolean }) => void = () => {};
    renderSwitcher(vi.fn(() => new Promise<{ ok: boolean }>((r) => (resolve = r))));
    const select = screen.getByRole("combobox", { name: "Language" });
    await user.selectOptions(select, "es");
    await waitFor(() => expect(select).toBeDisabled());
    resolve({ ok: true });
    await waitFor(() => expect(select).toBeEnabled());
  });
});
