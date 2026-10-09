import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "../../messages/en.json";
import es from "../../messages/es.json";
import { FormCancel, FormFooter } from "./form-layout";

const renderIn = (locale: "en" | "es", ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("FormFooter", () => {
  it("announces its status and keeps the actions together", () => {
    renderIn(
      "en",
      <FormFooter status="Saved">
        <button type="submit">Save</button>
      </FormFooter>,
    );
    expect(screen.getByText("Saved")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("keeps an empty live region when there is nothing to say", () => {
    const { container } = renderIn(
      "en",
      <FormFooter>
        <button type="submit">Save</button>
      </FormFooter>,
    );
    expect(container.querySelector('[aria-live="polite"]')).toBeEmptyDOMElement();
  });
});

describe("FormCancel", () => {
  it("links back to where the form came from", () => {
    renderIn("en", <FormCancel href="/customers" />);
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/customers");
  });

  it("calls back instead in a sheet or dialog", async () => {
    const onCancel = vi.fn();
    renderIn("es", <FormCancel onClick={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
